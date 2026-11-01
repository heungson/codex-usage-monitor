import { describe, expect, it } from 'vitest';

import { trayTitle } from '../src/main/tray-title';
import { alertThresholdPercent } from '../src/main/limit-alerts';
import { nearLimit } from '../src/shared/limits';
import { describeReset, formatDuration, windowLabel } from '../src/shared/format';
import type { SourceState, UsageWindow } from '../src/shared/types';

describe('format', () => {
  it('names windows', () => {
    expect(windowLabel(300)).toBe('5시간');
    expect(windowLabel(10080)).toBe('7일');
    expect(windowLabel(90)).toBe('90분');
    expect(windowLabel(null)).toBe('시간 창');
  });

  it('describes durations and resets', () => {
    expect(formatDuration(30_000)).toBe('1분 미만');
    expect(formatDuration(125 * 60_000)).toBe('2시간 5분');
    expect(formatDuration(3 * 86_400_000 + 4 * 3_600_000)).toBe('3일 4시간');
    const now = new Date(2026, 9, 28, 14, 0).getTime();
    expect(describeReset(now + 90 * 60_000, now)).toBe('오늘 15:30 (1시간 30분 뒤)');
    expect(describeReset(now - 60_000, now)).toBe('오늘 13:59 (지남)');
  });
});

// LHS-5 (plan v5, revision 8) 검증 19–21: both windows per CLI, 5시간/7일, and each CLI's own state sign.
describe('trayTitle', () => {
  const win = (minutes: number, used: number): UsageWindow => ({
    key: minutes === 300 ? 'five_hour' : 'seven_day',
    windowMinutes: minutes,
    usedPercent: used,
    resetsAt: null,
  });
  const ok = (...windows: UsageWindow[]): SourceState => ({
    kind: 'ok',
    readAt: 0,
    usage: { updatedAt: 0, windows },
  });
  const title = (claude: SourceState, codex: SourceState) =>
    trayTitle({ claude, codex, alertNotice: null, resetNotice: null });
  const bothCc = ok(win(300, 92), win(10080, 84));
  // The Codex reader lists its windows as the session file does; here the 7-day one comes first.
  const bothCx = ok(win(10080, 44), win(300, 12));

  it('shows both windows of each CLI, 5시간/7일, not the highest one (LHS-5 검증 19)', () => {
    expect(title(bothCc, bothCx)).toBe('CC 92/84% · CX 12/44%');
    expect(title(ok(win(300, 12.4), win(10080, 41.6)), bothCx)).toBe('CC 12/42% · CX 12/44%');
  });

  it('shows only the window that is recorded, without filling the other with 0 (LHS-5 검증 20)', () => {
    expect(title(ok(win(300, 92)), bothCx)).toBe('CC 92% · CX 12/44%');
    expect(title(ok(win(10080, 84)), bothCx)).toBe('CC 84% · CX 12/44%');
    expect(title(bothCc, ok(win(10080, 30)))).toBe('CC 92/84% · CX 30%');
  });

  it('gives each CLI its own –, … or ?, and keeps the other CLI as it is (LHS-5 검증 21)', () => {
    const failed = (lastGood: SourceState): SourceState => ({
      kind: 'error',
      message: '읽지 못했어요',
      lastGood: lastGood.kind === 'ok' ? lastGood.usage : null,
      nextRetryAt: null,
      retrying: false,
    });
    expect(title({ kind: 'waiting' }, bothCx)).toBe('CC – · CX 12/44%');
    expect(title(bothCc, { kind: 'waiting' })).toBe('CC 92/84% · CX –');
    expect(title({ kind: 'loading' }, bothCx)).toBe('CC … · CX 12/44%');
    expect(title(bothCc, { kind: 'loading' })).toBe('CC 92/84% · CX …');
    expect(title(failed(bothCc), bothCx)).toBe('CC 92/84%? · CX 12/44%');
    expect(title(bothCc, failed(bothCx))).toBe('CC 92/84% · CX 12/44%?');
    expect(title(bothCc, failed(ok(win(10080, 30))))).toBe('CC 92/84% · CX 30%?');
  });
});

describe('nearLimit', () => {
  it('draws the warning colour from the limit alert threshold, on the raw percentage (LHS-9: 80%)', () => {
    expect(alertThresholdPercent).toBe(80);
    expect(nearLimit(79.9)).toBe(false);
    expect(nearLimit(80)).toBe(true);
    expect(nearLimit(100)).toBe(true);
  });
});
