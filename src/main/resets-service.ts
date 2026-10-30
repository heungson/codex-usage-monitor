// State of the Codex reset screen (FC-F011, FC-F012, WF-S003).
//
// Both areas are fetched each time the screen opens and are not refreshed while it stays open.
// A failed area keeps its last good value, marked as not current, and retries on its own with a
// growing delay a fixed number of times (owner decision 2026-10-28: 10s, 20s, 40s, then stop).
// «다시 시도» runs at once and starts the retries over.

import type { AreaState, ResetHistory, ResetStatus, ResetsSnapshot } from '../shared/types';
import { statusIsEmpty, type ResetsApi } from './resets-api';

export const defaultRetryDelaysMs = [10_000, 20_000, 40_000];

type Area = 'status' | 'history';

interface AreaRunner<T> {
  state: AreaState<T>;
  lastGood: T | null;
  lastGoodAt: number | null;
  timer: NodeJS.Timeout | null;
  generation: number;
}

export class ResetsService {
  private readonly areas: { status: AreaRunner<ResetStatus>; history: AreaRunner<ResetHistory> } = {
    status: { state: { kind: 'idle' }, lastGood: null, lastGoodAt: null, timer: null, generation: 0 },
    history: { state: { kind: 'idle' }, lastGood: null, lastGoodAt: null, timer: null, generation: 0 },
  };

  constructor(
    private readonly api: ResetsApi,
    private readonly onChange: (snapshot: ResetsSnapshot) => void,
    private readonly retryDelaysMs: number[] = defaultRetryDelaysMs,
    private readonly now: () => number = Date.now,
  ) {}

  snapshot(): ResetsSnapshot {
    return { status: this.areas.status.state, history: this.areas.history.state };
  }

  /** The screen opened: fetch both areas fresh (FC-F011 개발 항목 1, FC-F012 개발 항목 1). */
  async open(): Promise<ResetsSnapshot> {
    await Promise.all([this.run('status', 0, false), this.run('history', 0, false)]);
    return this.snapshot();
  }

  /** «다시 시도» on one area. */
  async retry(area: Area): Promise<ResetsSnapshot> {
    await this.run(area, 0, false);
    return this.snapshot();
  }

  /** «이력 더 보기»: the next page by the cursor from the last page. */
  async loadMore(): Promise<ResetsSnapshot> {
    const state = this.areas.history.state;
    if (state.kind !== 'ok' || state.value.nextCursor === null || state.value.loadingMore)
      return this.snapshot();
    const current = state.value;
    this.setHistory({ ...current, loadingMore: true, moreError: null }, state.fetchedAt);
    try {
      const page = await this.api.history(current.nextCursor);
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
    for (const runner of Object.values(this.areas)) {
      if (runner.timer) clearTimeout(runner.timer);
      runner.timer = null;
      runner.generation++;
    }
  }

  private setHistory(value: ResetHistory, fetchedAt: number): void {
    const runner = this.areas.history;
    runner.state = { kind: 'ok', value, fetchedAt };
    runner.lastGood = value;
    this.onChange(this.snapshot());
  }

  private async fetchArea(area: Area): Promise<{ value: ResetStatus | ResetHistory; empty: boolean }> {
    if (area === 'status') {
      const status = await this.api.status();
      return { value: status, empty: statusIsEmpty(status) };
    }
    const page = await this.api.history(null);
    return {
      value: { entries: page.entries, nextCursor: page.nextCursor, moreError: null, loadingMore: false },
      empty: page.entries.length === 0,
    };
  }

  /** attempt 0 is the first request; 1.. are automatic retries. */
  private async run(area: Area, attempt: number, automatic: boolean): Promise<void> {
    const runner = this.areas[area] as AreaRunner<ResetStatus | ResetHistory>;
    if (runner.timer) clearTimeout(runner.timer);
    runner.timer = null;
    const generation = ++runner.generation;

    if (automatic && runner.state.kind === 'error' && runner.state.retry) {
      runner.state = { ...runner.state, retry: { ...runner.state.retry, running: true } };
    } else if (!automatic) {
      runner.state = { kind: 'loading' };
    }
    this.onChange(this.snapshot());

    try {
      const { value, empty } = await this.fetchArea(area);
      if (generation !== runner.generation) return;
      const at = this.now();
      runner.lastGood = value;
      runner.lastGoodAt = at;
      runner.state = empty ? { kind: 'empty', fetchedAt: at } : { kind: 'ok', value, fetchedAt: at };
    } catch (error) {
      if (generation !== runner.generation) return;
      const delay = this.retryDelaysMs[attempt];
      const retry =
        delay === undefined
          ? null
          : { attempt: attempt + 1, of: this.retryDelaysMs.length, at: this.now() + delay, running: false };
      runner.state = {
        kind: 'error',
        message: (error as Error).message,
        lastGood: runner.lastGood,
        lastGoodAt: runner.lastGoodAt,
        retry,
      };
      if (delay !== undefined) {
        runner.timer = setTimeout(() => void this.run(area, attempt + 1, true), delay);
      }
    }
    this.onChange(this.snapshot());
  }
}
