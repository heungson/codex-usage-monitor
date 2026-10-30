// Codex reset data shared by the usage screen's 예정 리셋 area (WF-S001), the reset screen (WF-S003)
// and the new-reset notifications (FC-F015): one status result, so the three never disagree.
//
// When the status is fetched (owner decision 2026-10-30 on FC-F011's undecided refresh interval):
// at start and every 15 minutes by the notification check, and when the usage screen opens if the
// last success is older than 5 minutes. The reset screen shows what is already known at once and
// fetches both areas again; the known value stays on screen while the request runs (owner decision
// 2026-10-30 on PR-Q003). Nothing polls while a screen stays open.
//
// A failed area keeps its last good value, marked as not current, and retries on its own with a
// growing delay a fixed number of times (owner decision 2026-10-28: 10s, 20s, 40s, then stop).
// «다시 시도» runs at once and starts the retries over.

import type { AreaState, ResetHistory, ResetStatus, ResetsSnapshot } from '../shared/types';
import { statusIsEmpty, type ResetsApi } from './resets-api';

export const defaultRetryDelaysMs = [10_000, 20_000, 40_000];
/** The history shows 5 entries first and 10 more per «이력 더 보기» (owner decision 2026-10-30 on PR-Q004). */
export const historyFirstPage = 5;
export const historyMorePage = 10;
/** The usage screen fetches the status again when the last success is this old. */
export const statusFreshMs = 5 * 60_000;

type Area = 'status' | 'history';
type Outcome<T> = { ok: true; value: T } | { ok: false; error: Error };

interface AreaRunner<T> {
  state: AreaState<T>;
  lastGood: T | null;
  lastGoodAt: number | null;
  timer: NodeJS.Timeout | null;
  generation: number;
  /** The request running now; a second caller waits for it instead of sending another. */
  inFlight: Promise<Outcome<T>> | null;
  refreshing: boolean;
}

function runner<T>(): AreaRunner<T> {
  return {
    state: { kind: 'idle' },
    lastGood: null,
    lastGoodAt: null,
    timer: null,
    generation: 0,
    inFlight: null,
    refreshing: false,
  };
}

export class ResetsService {
  private readonly areas: { status: AreaRunner<ResetStatus>; history: AreaRunner<ResetHistory> } = {
    status: runner(),
    history: runner(),
  };

  constructor(
    private readonly api: ResetsApi,
    private readonly onChange: (snapshot: ResetsSnapshot) => void,
    private readonly retryDelaysMs: number[] = defaultRetryDelaysMs,
    private readonly now: () => number = Date.now,
  ) {}

  snapshot(): ResetsSnapshot {
    return {
      status: this.areas.status.state,
      history: this.areas.history.state,
      refreshing: { status: this.areas.status.refreshing, history: this.areas.history.refreshing },
    };
  }

  /** The reset screen opened: what is known stays, both areas are fetched again (FC-F011, FC-F012). */
  async open(): Promise<ResetsSnapshot> {
    await Promise.all([this.request('status'), this.request('history')]);
    return this.snapshot();
  }

  /** «다시 시도» on one area: a new request at once, even while an automatic retry is still waiting for its answer. */
  async retry(area: Area): Promise<ResetsSnapshot> {
    await this.run(area, 0, false);
    return this.snapshot();
  }

  /** The usage screen opened: fetch the status unless a recent success, a request or a retry covers it. */
  async freshenStatus(): Promise<ResetsSnapshot> {
    const status = this.areas.status;
    const stale = status.lastGoodAt === null || this.now() - status.lastGoodAt >= statusFreshMs;
    if (stale && !status.inFlight && !status.timer) await this.request('status');
    return this.snapshot();
  }

  /** The notification check (FC-F015): the same request the screens show; throws when it failed. */
  async refreshStatus(): Promise<ResetStatus> {
    const outcome = await this.request('status');
    if (!outcome.ok) throw outcome.error;
    return outcome.value;
  }

  /** «이력 더 보기»: the next page by the cursor from the last page. */
  async loadMore(): Promise<ResetsSnapshot> {
    const history = this.areas.history;
    const state = history.state;
    if (
      state.kind !== 'ok' ||
      state.value.nextCursor === null ||
      state.value.loadingMore ||
      history.refreshing
    )
      return this.snapshot();
    const current = state.value;
    this.setHistory({ ...current, loadingMore: true, moreError: null }, state.fetchedAt);
    try {
      const page = await this.api.history(current.nextCursor, historyMorePage);
      this.setHistory(
        {
          entries: [...current.entries, ...page.entries],
          nextCursor: page.nextCursor,
          moreError: null,
          loadingMore: false,
        },
        state.fetchedAt,
      );
    } catch (error) {
      this.setHistory(
        { ...current, loadingMore: false, moreError: (error as Error).message },
        state.fetchedAt,
      );
    }
    return this.snapshot();
  }

  stop(): void {
    for (const area of Object.values(this.areas)) {
      if (area.timer) clearTimeout(area.timer);
      area.timer = null;
      area.generation++;
    }
  }

  private setHistory(value: ResetHistory, fetchedAt: number): void {
    const history = this.areas.history;
    history.state = { kind: 'ok', value, fetchedAt };
    history.lastGood = value;
    this.onChange(this.snapshot());
  }

  private async fetchArea(area: Area): Promise<{ value: ResetStatus | ResetHistory; empty: boolean }> {
    if (area === 'status') {
      const status = await this.api.status();
      return { value: status, empty: statusIsEmpty(status) };
    }
    const page = await this.api.history(null, historyFirstPage);
    return {
      value: { entries: page.entries, nextCursor: page.nextCursor, moreError: null, loadingMore: false },
      empty: page.entries.length === 0,
    };
  }

  /** A request someone asked for: joins the one already running. */
  private request<A extends Area>(
    area: A,
  ): Promise<Outcome<A extends 'status' ? ResetStatus : ResetHistory>> {
    const slot = this.areas[area] as AreaRunner<ResetStatus | ResetHistory>;
    return (slot.inFlight ?? this.run(area, 0, false)) as Promise<
      Outcome<A extends 'status' ? ResetStatus : ResetHistory>
    >;
  }

  /** attempt 0 is the first request; 1.. are automatic retries. */
  private run(area: Area, attempt: number, automatic: boolean): Promise<Outcome<ResetStatus | ResetHistory>> {
    const slot = this.areas[area] as AreaRunner<ResetStatus | ResetHistory>;
    if (slot.timer) clearTimeout(slot.timer);
    slot.timer = null;
    const generation = ++slot.generation;

    if (automatic && slot.state.kind === 'error' && slot.state.retry) {
      slot.state = { ...slot.state, retry: { ...slot.state.retry, running: true } };
    } else if (!automatic) {
      // A shown result stays while it is fetched again; anything else shows 불러오는 중.
      if (slot.state.kind === 'ok' || slot.state.kind === 'empty') slot.refreshing = true;
      else slot.state = { kind: 'loading' };
    }
    this.onChange(this.snapshot());

    const request = (async (): Promise<Outcome<ResetStatus | ResetHistory>> => {
      try {
        const { value, empty } = await this.fetchArea(area);
        if (generation !== slot.generation) return { ok: true, value };
        const at = this.now();
        slot.lastGood = value;
        slot.lastGoodAt = at;
        slot.state = empty ? { kind: 'empty', fetchedAt: at } : { kind: 'ok', value, fetchedAt: at };
        slot.refreshing = false;
        this.onChange(this.snapshot());
        return { ok: true, value };
      } catch (caught) {
        const error = caught as Error;
        if (generation !== slot.generation) return { ok: false, error };
        const delay = this.retryDelaysMs[attempt];
        const retry =
          delay === undefined
            ? null
            : { attempt: attempt + 1, of: this.retryDelaysMs.length, at: this.now() + delay, running: false };
        slot.state = {
          kind: 'error',
          message: error.message,
          lastGood: slot.lastGood,
          lastGoodAt: slot.lastGoodAt,
          retry,
        };
        slot.refreshing = false;
        if (delay !== undefined) {
          slot.timer = setTimeout(() => void this.run(area, attempt + 1, true), delay);
        }
        this.onChange(this.snapshot());
        return { ok: false, error };
      }
    })();
    slot.inFlight = request;
    void request.then(() => {
      if (slot.inFlight === request) slot.inFlight = null;
    });
    return request;
  }
}
