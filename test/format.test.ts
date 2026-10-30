import { describe, expect, it } from 'vitest';

import { trayTitle } from '../src/main/tray-title';
import { describeReset, formatDuration, windowLabel } from '../src/shared/format';

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

describe('trayTitle', () => {
  it('shows each CLI by its highest window', () => {
    expect(
      trayTitle({
        claude: {
          kind: 'ok',
          readAt: 0,
          usage: {
            updatedAt: 0,
            windows: [
              { key: 'a', windowMinutes: 300, usedPercent: 12.4, resetsAt: null },
              { key: 'b', windowMinutes: 10080, usedPercent: 41.6, resetsAt: null },
            ],
          },
        },
        codex: { kind: 'waiting' },
        alertNotice: null,
        resetNotice: null,
      }),
    ).toBe('CC 42% · CX –');
  });
});
