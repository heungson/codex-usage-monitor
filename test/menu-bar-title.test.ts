// LHS-5 (plan v5, revision 8) 검증 12–18 and LHS-7 (revision 7) 검증 9, 10: the menu bar title's time
// left to a scheduled Codex reset, read from the one shared status, and when that status is fetched.

import { afterEach, describe, expect, it, vi } from 'vitest';

import { ResetAlerts, resetCheckIntervalMs } from '../src/main/reset-alerts';
import type { ResetsApi } from '../src/main/resets-api';
import { ResetsService, statusFreshMs } from '../src/main/resets-service';
import { fullTitle, MenuBarTitle, timeLeft } from '../src/main/tray-title';
import type { AreaState, ResetStatus, UsageSnapshot } from '../src/shared/types';
import { tempDir } from './helpers';

const second = 1000;
const minute = 60 * second;
const hour = 60 * minute;
const day = 24 * hour;

/** Both CLIs with both windows, as LHS-5 검증 12 asks («두 시간 창의 CC/CX 제목»). */
const usage: UsageSnapshot = {
  claude: {
    kind: 'ok',
    readAt: 0,
    usage: {
      updatedAt: 0,
      windows: [
        { key: 'five_hour', windowMinutes: 300, usedPercent: 92, resetsAt: null },
        { key: 'seven_day', windowMinutes: 10080, usedPercent: 84, resetsAt: null },
      ],
    },
  },
  codex: {
    kind: 'ok',
    readAt: 0,
    usage: {
      updatedAt: 0,
      windows: [
        { key: 'primary', windowMinutes: 10080, usedPercent: 44, resetsAt: null },
        { key: 'secondary', windowMinutes: 300, usedPercent: 12, resetsAt: null },
      ],
    },
  },
  alertNotice: null,
  resetNotice: null,
};

function status(scheduledFor: number | null, scheduled = true): ResetStatus {
  return {
    latest: null,
    scheduled: scheduled
      ? {
          id: 'next',
          type: 'regular',
          announcedAt: 0,
          text: 'Resetting tomorrow',
          sourceUrl: null,
          scheduledFor,
        }
      : null,
    avgIntervalDays: 6,
    daysSinceLast: 1,
    total: 69,
  };
}
const ok = (value: ResetStatus): AreaState<ResetStatus> => ({ kind: 'ok', value, fetchedAt: 0 });

/** A fake API whose status the test changes, and can hold until released. */
interface FakeApi extends ResetsApi {
  due: number | null;
  fails: boolean;
  calls: number;
  gate: Promise<void> | null;
}
function fakeApi(): FakeApi {
  const api: FakeApi = {
    due: null,
    fails: false,
    calls: 0,
    gate: null,
    async status(): Promise<ResetStatus> {
      api.calls++;
      if (api.gate) await api.gate;
      if (api.fails) throw new Error('codex-resets.com에 연결하지 못했어요');
      return status(api.due, api.due !== null);
    },
    async history() {
      return { entries: [], nextCursor: null };
    },
  };
  return api;
}
function hold(api: FakeApi): () => void {
  let release!: () => void;
  api.gate = new Promise<void>((resolve) => (release = () => resolve()));
  return () => {
    api.gate = null;
    release();
  };
}

/** The app's wiring: the shared status feeds the title, as in src/main/main.ts. */
function wire(api: FakeApi) {
  const titles: string[] = [];
  const title = new MenuBarTitle((t) => titles.push(t));
  const service = new ResetsService(api, (s) => title.setStatus(s.status));
  title.setUsage(usage);
  title.start();
  return { titles, title, service, last: () => titles[titles.length - 1] };
}

describe('menu bar title', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('rounds the time left down to days, hours, minutes, or says under a minute (LHS-5 검증 12)', () => {
    expect(timeLeft(2 * day + 23 * hour)).toBe('2일');
    expect(timeLeft(day)).toBe('1일');
    expect(timeLeft(23 * hour + 59 * minute)).toBe('23시간');
    expect(timeLeft(hour)).toBe('1시간');
    expect(timeLeft(59 * minute + 30 * second)).toBe('59분');
    expect(timeLeft(minute)).toBe('1분');
    expect(timeLeft(59 * second)).toBe('1분 미만');
    const now = Date.parse('2026-10-30T10:00:00Z');
    const title = fullTitle(usage, ok(status(now + 2 * day + 23 * hour)), now);
    expect(title).toBe('CC 92/84% · CX 12/44% · ↻ 2일');
    expect(title).not.toContain('codex-resets');
  });

  it('has no suffix without a scheduled reset, nor when the status failed with a last good value (LHS-5 검증 13)', () => {
    const now = Date.parse('2026-10-30T10:00:00Z');
    expect(fullTitle(usage, ok(status(null, false)), now)).toBe('CC 92/84% · CX 12/44%');
    const failed: AreaState<ResetStatus> = {
      kind: 'error',
      message: 'codex-resets.com이 503 오류로 응답했어요',
      lastGood: status(now + day),
      lastGoodAt: now - hour,
      retry: null,
    };
    expect(fullTitle(usage, failed, now)).toBe('CC 92/84% · CX 12/44%');
    // A scheduled reset that names no time, or whose time has passed, has no time left to show.
    expect(fullTitle(usage, ok(status(null)), now)).toBe('CC 92/84% · CX 12/44%');
    expect(fullTitle(usage, ok(status(now)), now)).toBe('CC 92/84% · CX 12/44%');
  });

  it('keeps the suffix and works the time out again each minute while a check is held, without a request; a failed check removes it (LHS-5 검증 14)', async () => {
    vi.useFakeTimers({ now: Date.parse('2026-10-30T10:00:00Z') });
    const api = fakeApi();
    api.due = Date.now() + 2 * hour + 30 * second;
    const { service, title, last } = wire(api);
    await service.refreshStatus();
    expect(last()).toBe('CC 92/84% · CX 12/44% · ↻ 2시간');

    const release = hold(api);
    const check = service.refreshStatus().catch(() => undefined);
    const calls = api.calls;
    await vi.advanceTimersByTimeAsync(minute);
    expect(last()).toBe('CC 92/84% · CX 12/44% · ↻ 1시간');
    expect(api.calls).toBe(calls);

    api.fails = true;
    release();
    await check;
    expect(last()).toBe('CC 92/84% · CX 12/44%');
    service.stop();
    title.stop();
  });

  it('removes the suffix at the reset time while a check is still held (LHS-5 검증 15)', async () => {
    vi.useFakeTimers({ now: Date.parse('2026-10-30T10:00:00Z') });
    const api = fakeApi();
    api.due = Date.now() + 30 * second;
    const { service, title, last } = wire(api);
    await service.refreshStatus();
    expect(last()).toBe('CC 92/84% · CX 12/44% · ↻ 1분 미만');

    const release = hold(api);
    void service.refreshStatus();
    await vi.advanceTimersByTimeAsync(30 * second);
    expect(last()).toBe('CC 92/84% · CX 12/44%');
    release();
    service.stop();
    title.stop();
  });

  it('follows a new scheduled time in the same status the screen reads (LHS-5 검증 16)', async () => {
    vi.useFakeTimers({ now: Date.parse('2026-10-30T10:00:00Z') });
    const api = fakeApi();
    api.due = Date.now() + 3 * day;
    const { service, title, last } = wire(api);
    await service.refreshStatus();
    expect(last()).toBe('CC 92/84% · CX 12/44% · ↻ 3일');

    api.due = Date.now() + 5 * hour;
    await service.refreshStatus();
    expect(last()).toBe('CC 92/84% · CX 12/44% · ↻ 5시간');
    const shared = service.snapshot().status;
    expect(shared.kind === 'ok' && shared.value.scheduled?.scheduledFor).toBe(api.due);
    service.stop();
    title.stop();
  });

  it('opening the usage screen fetches only when the last success is more than 5 minutes old (LHS-5 검증 17, LHS-7 검증 9)', async () => {
    let now = Date.parse('2026-10-30T10:00:00Z');
    const api = fakeApi();
    const service = new ResetsService(
      api,
      () => undefined,
      undefined,
      () => now,
    );
    await service.refreshStatus();
    expect(api.calls).toBe(1);
    now += statusFreshMs - 1;
    await service.freshenStatus();
    expect(api.calls).toBe(1);
    now += 1; // exactly 5 minutes
    await service.freshenStatus();
    expect(api.calls).toBe(1);
    now += 1;
    await service.freshenStatus();
    expect(api.calls).toBe(2);
  });

  it('a check already running is shared by the usage screen and the reset screen; the result reaches both and the title (LHS-5 검증 18, LHS-7 검증 10)', async () => {
    vi.useFakeTimers({ now: Date.parse('2026-10-30T10:00:00Z') });
    const api = fakeApi();
    const { service, title, last } = wire(api);
    await service.refreshStatus();
    expect(last()).toBe('CC 92/84% · CX 12/44%');
    vi.setSystemTime(Date.now() + statusFreshMs + minute);

    api.due = Date.now() + 2 * day + hour;
    const release = hold(api);
    const background = service.refreshStatus();
    await service.freshenStatus();
    const opened = service.open();
    expect(api.calls).toBe(2);
    release();
    await Promise.all([background, opened]);
    expect(api.calls).toBe(2);
    const shared = service.snapshot().status;
    expect(shared.kind === 'ok' && shared.value.scheduled?.scheduledFor).toBe(api.due);
    expect(last()).toBe('CC 92/84% · CX 12/44% · ↻ 2일');
    service.stop();
    title.stop();
  });

  it('checks the shared status in the background every 15 minutes (LHS-7 검증 9)', async () => {
    vi.useFakeTimers({ now: Date.parse('2026-10-30T10:00:00Z') });
    const api = fakeApi();
    const { service, title } = wire(api);
    const notifier = { send: async () => 'shown' as const };
    const alerts = new ResetAlerts(
      `${tempDir()}/reset-alerts.json`,
      { status: () => service.refreshStatus() },
      notifier,
    );
    alerts.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(api.calls).toBe(1);
    api.due = Date.now() + 2 * day;
    await vi.advanceTimersByTimeAsync(resetCheckIntervalMs - 1);
    expect(api.calls).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(api.calls).toBe(2);
    const shared = service.snapshot().status;
    expect(shared.kind === 'ok' && shared.value.scheduled?.scheduledFor).toBe(api.due);
    alerts.stop();
    service.stop();
    title.stop();
  });
});
