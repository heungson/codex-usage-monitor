// LHS-9 (FC-F014) and LHS-10 (FC-F015): when notifications are sent.

import { join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { LimitAlerts } from '../src/main/limit-alerts';
import {
  classifyFailure,
  type Notifier,
  type OutgoingNotification,
  type SendResult,
} from '../src/main/notifier';
import { ResetAlerts } from '../src/main/reset-alerts';
import type { ResetsApi } from '../src/main/resets-api';
import type { CliUsage, ResetEntry, ResetWatch } from '../src/shared/types';
import { tempDir } from './helpers';

function recordingNotifier(result: () => SendResult = () => 'shown') {
  const sent: OutgoingNotification[] = [];
  const notifier: Notifier = {
    async send(n) {
      sent.push(n);
      return result();
    },
  };
  return { notifier, sent };
}

const now = Date.parse('2026-10-28T03:00:00Z');
const usage = (percent: number, resetsAt = now + 3_600_000, key = 'five_hour'): CliUsage => ({
  windows: [{ key, windowMinutes: 300, usedPercent: percent, resetsAt }],
  updatedAt: now,
});

describe('LimitAlerts', () => {
  let file: string;
  beforeEach(() => {
    file = join(tempDir(), 'limit-alerts.json');
  });

  it('alerts at 80%, not at 79% (검증 1)', async () => {
    const { notifier, sent } = recordingNotifier();
    const alerts = new LimitAlerts(
      file,
      notifier,
      () => undefined,
      () => now,
    );
    await alerts.evaluate('claude', usage(79));
    expect(sent).toHaveLength(0);
    await alerts.evaluate('claude', usage(80));
    expect(sent).toHaveLength(1);
    expect(sent[0]?.title).toContain('Claude Code 5시간 한도 80%');
    await alerts.evaluate('codex', usage(80, now + 3_600_000, 'primary'));
    expect(sent).toHaveLength(2);
  });

  it('names a model window in the alert: «Claude Code Fable 7일 한도» (developer, 2026-11-11)', async () => {
    const { notifier, sent } = recordingNotifier();
    const alerts = new LimitAlerts(
      file,
      notifier,
      () => undefined,
      () => now,
    );
    await alerts.evaluate('claude', {
      windows: [
        { key: 'seven_day', windowMinutes: 10080, usedPercent: 40, resetsAt: now + 86_400_000 },
        {
          key: 'model:fable',
          windowMinutes: 10080,
          usedPercent: 81,
          resetsAt: now + 86_400_000,
          model: 'Fable',
        },
      ],
      updatedAt: now,
    });
    expect(sent.map((n) => n.title)).toEqual(['Claude Code Fable 7일 한도 81% 사용']);
  });

  it('does not alert on a value from before the window reset (developer, 2026-11-05)', async () => {
    const { notifier, sent } = recordingNotifier();
    const alerts = new LimitAlerts(
      file,
      notifier,
      () => undefined,
      () => now,
    );
    await alerts.evaluate('claude', usage(85, now - 60_000));
    expect(sent).toHaveLength(0);
  });

  it('alerts once per window until it resets, across restarts (검증 3)', async () => {
    const { notifier, sent } = recordingNotifier();
    let alerts = new LimitAlerts(
      file,
      notifier,
      () => undefined,
      () => now,
    );
    await alerts.evaluate('claude', usage(80));
    await alerts.evaluate('claude', usage(85));
    await alerts.evaluate('claude', usage(79));
    alerts = new LimitAlerts(
      file,
      notifier,
      () => undefined,
      () => now,
    );
    await alerts.evaluate('claude', usage(80));
    expect(sent).toHaveLength(1);
    // The window reset: a new reset time five hours on.
    await alerts.evaluate('claude', usage(80, now + 5 * 3_600_000 + 3_600_000));
    expect(sent).toHaveLength(2);
  });

  it('says why when macOS refuses or fails, and does not retry (검증 4, 5)', async () => {
    const notices: (string | null)[] = [];
    const { notifier, sent } = recordingNotifier(() => 'denied');
    const alerts = new LimitAlerts(
      file,
      notifier,
      (n) => notices.push(n),
      () => now,
    );
    await alerts.evaluate('claude', usage(90));
    expect(notices.at(-1)).toContain('알림이 꺼져 있어');
    await alerts.evaluate('claude', usage(91));
    expect(sent).toHaveLength(1);

    const failing = recordingNotifier(() => 'failed');
    const other = new LimitAlerts(
      join(tempDir(), 'x.json'),
      failing.notifier,
      (n) => notices.push(n),
      () => now,
    );
    await other.evaluate('codex', usage(90, now + 1000, 'primary'));
    expect(notices.at(-1)).toContain('보내지 못했어요');
  });

  // 2026-10-28: Codex reached 82% at 14:26 with notifications off; a global reset at 15:29 brought it to 0%, and the
  // notice still said the limit was near.
  it('names the app as System Settings lists it, and retires the notice once that window resets', async () => {
    const notices: (string | null)[] = [];
    const { notifier } = recordingNotifier(() => 'denied');
    const alerts = new LimitAlerts(
      file,
      notifier,
      (n) => notices.push(n),
      () => now,
      'Electron',
    );
    const week = now + 5 * 86_400_000;
    await alerts.evaluate('codex', usage(82, week, 'primary'));
    expect(alerts.currentNotice).toContain('Codex 5시간 한도가 82%에 닿았지만');
    expect(alerts.currentNotice).toContain('시스템 설정 › 알림 › Electron');
    // Another reading of the same window keeps it; Claude Code's readings do not touch it.
    await alerts.evaluate('codex', usage(83, week + 60_000, 'primary'));
    await alerts.evaluate('claude', usage(10));
    expect(alerts.currentNotice).not.toBeNull();
    // The global reset: a new window, far later reset time, 0%.
    await alerts.evaluate('codex', usage(0, week + 2 * 86_400_000, 'primary'));
    expect(alerts.currentNotice).toBeNull();
    expect(notices.at(-1)).toBeNull();
  });
});

describe('classifyFailure', () => {
  it('reads macOS refusals as denied and anything else as failed', () => {
    expect(classifyFailure('The operation couldn’t be completed. (UNErrorDomain error 1.)')).toBe('denied');
    expect(classifyFailure('Notifications are not allowed for this application')).toBe('denied');
    expect(classifyFailure('The operation couldn’t be completed. (UNErrorDomain error 10.)')).toBe('failed');
    expect(classifyFailure('something else')).toBe('failed');
  });
});

describe('ResetAlerts', () => {
  const reset = (id: string, at: string): ResetEntry => ({
    id,
    type: 'regular',
    announcedAt: Date.parse(at),
    text: 't',
    sourceUrl: null,
  });

  function api(latest: () => ResetEntry | null): ResetsApi {
    return {
      status: async () => ({
        latest: latest(),
        scheduled: null,
        avgIntervalDays: 6,
        daysSinceLast: 1,
        total: 1,
      }),
      history: async () => ({ entries: [], nextCursor: null }),
    };
  }

  let file: string;
  beforeEach(() => {
    file = join(tempDir(), 'reset-alerts.json');
  });

  it('notifies each new reset watch once across restarts, not one there at the first check (developer, 2026-11-11)', async () => {
    const watch = (url: string): ResetWatch => ({
      level: 'elevated',
      chancePercent: 65,
      observedAt: Date.now() - 3_600_000,
      expiresAt: Date.now() + 2 * 86_400_000,
      text: 'Thursday is feeling codexy to me.',
      sourceUrl: url,
    });
    let current: ResetWatch | null = watch('https://x.com/s/1');
    let shown: 'shown' | 'denied' = 'shown';
    const { notifier, sent } = recordingNotifier(() => shown);
    const withWatch: ResetsApi = {
      status: async () => ({
        latest: reset('r1', '2026-10-26T07:00:00Z'),
        scheduled: null,
        watch: current,
        avgIntervalDays: 6,
        daysSinceLast: 1,
        total: 1,
      }),
      history: async () => ({ entries: [], nextCursor: null }),
    };
    let alerts = new ResetAlerts(file, withWatch, notifier);
    await alerts.check(); // baseline, with the watch already there
    await alerts.check();
    expect(sent).toHaveLength(0);

    current = watch('https://x.com/s/2');
    shown = 'denied';
    await alerts.check();
    expect(sent).toHaveLength(1); // refused: tried again next time, with no notice in the app
    expect(alerts.currentNotice).toBeNull();
    shown = 'shown';
    alerts = new ResetAlerts(file, withWatch, notifier);
    await alerts.check();
    expect(sent).toHaveLength(2);
    expect(sent[1]?.title).toBe('Codex 리셋 신호가 떴어요');
    expect(sent[1]?.body).toContain('가능성 65%');
    expect(sent[1]?.body).toContain('아직 공지된 리셋은 아니에요');
    await new ResetAlerts(file, withWatch, notifier).check();
    expect(sent).toHaveLength(2);

    // A watch that has ended is not notified.
    current = { ...watch('https://x.com/s/3'), expiresAt: Date.now() - 1 };
    await alerts.check();
    expect(sent).toHaveLength(2);
  });

  it('treats the first check as the baseline and alerts each later reset once, across restarts (검증 1, 3, 4)', async () => {
    let latest = reset('r1', '2026-10-26T07:00:00Z');
    const { notifier, sent } = recordingNotifier();
    let alerts = new ResetAlerts(
      file,
      api(() => latest),
      notifier,
    );
    await alerts.check();
    expect(sent).toHaveLength(0);
    await alerts.check();
    expect(sent).toHaveLength(0);

    latest = reset('r2', '2026-10-28T02:00:00Z');
    await alerts.check();
    expect(sent).toHaveLength(1);
    expect(sent[0]?.body).toContain('codex-resets.com');
    expect(sent[0]?.url).toBe('https://codex-resets.com');

    alerts = new ResetAlerts(
      file,
      api(() => latest),
      notifier,
    );
    await alerts.check();
    expect(sent).toHaveLength(1);
  });

  it('keeps an undelivered reset and delivers it once when possible (검증 5, 6)', async () => {
    let latest = reset('r1', '2026-10-26T07:00:00Z');
    let outcome: SendResult = 'denied';
    const { notifier, sent } = recordingNotifier(() => outcome);
    const alerts = new ResetAlerts(
      file,
      api(() => latest),
      notifier,
    );
    await alerts.check();
    latest = reset('r2', '2026-10-28T02:00:00Z');
    await alerts.check();
    await alerts.check();
    expect(sent.filter((n) => n.title.includes('리셋'))).toHaveLength(2);
    outcome = 'shown';
    await alerts.deliverPending();
    await alerts.check();
    await alerts.deliverPending();
    expect(sent).toHaveLength(3);
  });
});

// 2026-10-28: a reset announced at 15:29 was refused by macOS five times and the app said nothing.
describe('ResetAlerts notice', () => {
  const reset = (id: string, at: string): ResetEntry => ({
    id,
    type: 'regular',
    announcedAt: Date.parse(at),
    text: 't',
    sourceUrl: null,
  });

  it('says a new reset could not be notified, stays closed once closed, and clears when delivered', async () => {
    const file = join(tempDir(), 'reset-alerts.json');
    let latest = reset('r1', '2026-10-26T07:00:00Z');
    let outcome: SendResult = 'denied';
    const notices: (string | null)[] = [];
    const { notifier } = recordingNotifier(() => outcome);
    const api: ResetsApi = {
      status: async () => ({ latest, scheduled: null, avgIntervalDays: 6, daysSinceLast: 1, total: 1 }),
      history: async () => ({ entries: [], nextCursor: null }),
    };
    const alerts = new ResetAlerts(file, api, notifier, (n) => notices.push(n), 'Electron');
    await alerts.check();
    expect(alerts.currentNotice).toBeNull();

    latest = reset('r2', '2026-10-28T06:29:00Z');
    await alerts.check();
    expect(alerts.currentNotice).toContain('Codex 전체 리셋이 공지됐어요');
    expect(alerts.currentNotice).toContain('시스템 설정 › 알림 › Electron');

    alerts.dismissNotice();
    await alerts.deliverPending();
    expect(alerts.currentNotice).toBeNull();

    outcome = 'shown';
    await alerts.deliverPending();
    expect(alerts.currentNotice).toBeNull();
    expect(notices.filter((n) => n !== null)).toHaveLength(1);
  });
});
