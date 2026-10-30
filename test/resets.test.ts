// LHS-7 (FC-F011) and LHS-8 (FC-F012), plan v3: the reset status shared by the usage screen, the reset
// screen and the notifications, the screen areas, backoff and the API parsing.

import { afterEach, describe, expect, it, vi } from 'vitest';

import { resetsApi, type ResetsApi } from '../src/main/resets-api';
import { ResetsService, statusFreshMs } from '../src/main/resets-service';
import type { ResetEntry, ResetStatus } from '../src/shared/types';

const entry = (id: string, at: string): ResetEntry => ({
  id,
  type: 'regular',
  announcedAt: Date.parse(at),
  text: 'Codex usage limits have been reset.',
  sourceUrl: 'https://x.com/a/status/1',
});
const status = (latest: ResetEntry | null): ResetStatus => ({
  latest,
  scheduled: null,
  avgIntervalDays: 6,
  daysSinceLast: 1.8,
  total: latest ? 68 : 0,
});

function fakeApi(): ResetsApi & {
  statusFails: boolean;
  historyFails: boolean;
  calls: string[];
  /** Holds every answer until released, to look at the screen while a request runs. */
  gate: Promise<void> | null;
} {
  const api = {
    statusFails: false,
    historyFails: false,
    calls: [] as string[],
    gate: null as Promise<void> | null,
    async status() {
      api.calls.push('status');
      if (api.gate) await api.gate;
      if (api.statusFails) throw new Error('codex-resets.com에 연결하지 못했어요');
      return status(entry('r1', '2026-10-26T07:00:00Z'));
    },
    async history(cursor: string | null, limit: number) {
      api.calls.push(`history:${cursor}:${limit}`);
      if (api.gate) await api.gate;
      if (api.historyFails) throw new Error('codex-resets.com이 500 오류로 응답했어요');
      return cursor === null
        ? { entries: [entry('r1', '2026-10-26T07:00:00Z')], nextCursor: 'c2' }
        : { entries: [entry('r0', '2026-10-20T07:00:00Z')], nextCursor: null };
    },
  };
  return api;
}

describe('ResetsService', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fetches both areas on open, 5 history entries first, and does not poll while open (LHS-7 검증 1, LHS-8 검증 1)', async () => {
    vi.useFakeTimers();
    const api = fakeApi();
    const service = new ResetsService(api, () => undefined);
    const snapshot = await service.open();
    expect(snapshot.status.kind).toBe('ok');
    expect(snapshot.history.kind).toBe('ok');
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(api.calls).toEqual(['status', 'history:null:5']);
  });

  it('reopening keeps the known values on screen while both areas are fetched again (PR-Q003, owner 2026-10-30)', async () => {
    const api = fakeApi();
    const seen: ReturnType<ResetsService['snapshot']>[] = [];
    const service = new ResetsService(api, (s) => seen.push(s));
    await service.open();
    let release!: () => void;
    api.gate = new Promise((resolve) => (release = resolve));
    seen.length = 0;
    const reopened = service.open();
    await Promise.resolve();
    const during = service.snapshot();
    expect(during.status.kind).toBe('ok');
    expect(during.history.kind).toBe('ok');
    expect(during.refreshing).toEqual({ status: true, history: true });
    expect(seen.every((s) => s.status.kind !== 'loading' && s.history.kind !== 'loading')).toBe(true);
    release();
    const after = await reopened;
    expect(after.refreshing).toEqual({ status: false, history: false });
    expect(api.calls.filter((c) => c === 'status')).toHaveLength(2);
  });

  it('the usage screen fetches the status only when the last success is 5 minutes old (owner 2026-10-30)', async () => {
    let now = Date.parse('2026-10-30T10:00:00Z');
    const api = fakeApi();
    const service = new ResetsService(
      api,
      () => undefined,
      undefined,
      () => now,
    );
    await service.freshenStatus();
    expect(api.calls).toEqual(['status']);
    now += statusFreshMs - 1;
    await service.freshenStatus();
    expect(api.calls).toEqual(['status']);
    now += 1;
    await service.freshenStatus();
    expect(api.calls).toEqual(['status', 'status']);
  });

  it('the notification check and the screens share one status request (FC-F015, FC-F011)', async () => {
    const api = fakeApi();
    const service = new ResetsService(api, () => undefined);
    const [forAlerts, forScreen] = await Promise.all([service.refreshStatus(), service.open()]);
    expect(forAlerts.latest?.id).toBe('r1');
    expect(forScreen.status.kind).toBe('ok');
    expect(api.calls.filter((c) => c === 'status')).toHaveLength(1);
    api.statusFails = true;
    await expect(service.refreshStatus()).rejects.toThrow('연결하지 못했어요');
    service.stop();
  });

  it('pages history with the cursor, 10 at a time (LHS-8 검증 2)', async () => {
    const api = fakeApi();
    const service = new ResetsService(api, () => undefined);
    await service.open();
    const snapshot = await service.loadMore();
    expect(api.calls).toContain('history:c2:10');
    expect(snapshot.history.kind === 'ok' && snapshot.history.value.entries.map((e) => e.id)).toEqual([
      'r1',
      'r0',
    ]);
    expect(snapshot.history.kind === 'ok' && snapshot.history.value.nextCursor).toBeNull();
  });

  it('keeps the last good value of the failed area only, and backs off 10s, 20s, 40s then stops (LHS-7 검증 5, 6)', async () => {
    vi.useFakeTimers();
    const api = fakeApi();
    const service = new ResetsService(api, () => undefined);
    await service.open();
    api.statusFails = true;
    let snapshot = await service.open();
    expect(snapshot.history.kind).toBe('ok');
    expect(snapshot.status.kind).toBe('error');
    const error = snapshot.status.kind === 'error' ? snapshot.status : null;
    expect(error?.lastGood?.latest?.id).toBe('r1');
    expect(error?.retry).toMatchObject({ attempt: 1, of: 3 });

    const statusCalls = () => api.calls.filter((c) => c === 'status').length;
    const before = statusCalls();
    await vi.advanceTimersByTimeAsync(9_999);
    expect(statusCalls()).toBe(before);
    await vi.advanceTimersByTimeAsync(1);
    expect(statusCalls()).toBe(before + 1);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(statusCalls()).toBe(before + 2);
    await vi.advanceTimersByTimeAsync(40_000);
    expect(statusCalls()).toBe(before + 3);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(statusCalls()).toBe(before + 3);
    snapshot = service.snapshot();
    expect(snapshot.status.kind === 'error' && snapshot.status.retry).toBeNull();

    api.statusFails = false;
    snapshot = await service.retry('status');
    expect(snapshot.status.kind).toBe('ok');
  });

  it('다시 시도 sends a new request while an automatic retry is still waiting for its answer (found 2026-10-30)', async () => {
    vi.useFakeTimers();
    const api = fakeApi();
    api.statusFails = true;
    const service = new ResetsService(api, () => undefined);
    await service.open();
    let release!: () => void;
    api.gate = new Promise((resolve) => (release = resolve));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(api.calls.filter((c) => c === 'status')).toHaveLength(2);
    api.gate = null;
    api.statusFails = false;
    expect((await service.retry('status')).status.kind).toBe('ok');
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(service.snapshot().status.kind).toBe('ok');
  });

  it('shows a first failure without a value (LHS-8 검증 5)', async () => {
    vi.useFakeTimers();
    const api = fakeApi();
    api.historyFails = true;
    const service = new ResetsService(api, () => undefined);
    const snapshot = await service.open();
    expect(snapshot.history.kind === 'error' && snapshot.history.lastGood).toBeNull();
    api.historyFails = false;
    expect((await service.retry('history')).history.kind).toBe('ok');
  });
});

describe('resetsApi', () => {
  const respond = (body: unknown, status = 200) =>
    vi.fn(async (_url: URL | RequestInfo) => new Response(JSON.stringify(body), { status }));

  it('reads the status fields and sends no credentials (LHS-7 검증 2)', async () => {
    const fetchImpl = respond({
      data: {
        latest_reset: {
          id: 'x1',
          reset_type: 'regular',
          announced_at: '2026-10-26T07:00:00.000Z',
          text: 'reset',
          source: { url: 'https://x.com/s/1' },
        },
        scheduled_reset: null,
        stats: { total: 68, days_since_last: 1.8, avg_interval_days: 6 },
      },
    });
    const value = await resetsApi('https://codex-resets.com', fetchImpl as unknown as typeof fetch).status();
    expect(value.latest?.id).toBe('x1');
    expect(value.avgIntervalDays).toBe(6);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe('https://codex-resets.com/api/v1/status');
    const headers = init.headers as Record<string, string>;
    expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain('authorization');
    expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain('cookie');
  });

  it('reports an empty result and a server error', async () => {
    const empty = await resetsApi(
      'https://codex-resets.com',
      respond({
        data: { latest_reset: null, scheduled_reset: null, stats: { total: 0 } },
      }) as unknown as typeof fetch,
    ).status();
    expect(empty.latest).toBeNull();
    await expect(
      resetsApi('https://codex-resets.com', respond({}, 500) as unknown as typeof fetch).status(),
    ).rejects.toThrow('500');
  });

  it('passes the cursor and reads the next cursor', async () => {
    const fetchImpl = respond({ data: [], pagination: { has_more: true, next_cursor: 'n2' } });
    const page = await resetsApi('https://codex-resets.com', fetchImpl as unknown as typeof fetch).history(
      'c1',
      10,
    );
    expect(page.nextCursor).toBe('n2');
    expect(String(fetchImpl.mock.calls[0]![0])).toContain('cursor=c1');
    expect(String(fetchImpl.mock.calls[0]![0])).toContain('limit=10');
  });
});
