// The menu bar clock: time left in the Claude Code 5시간 window (developer, 2026-11-11).

import { describe, expect, it } from 'vitest';

import { clockBitmap, iconPoints, iconScale, shareStep, timeLeftShare } from '../src/main/tray-icon';
import { MenuBarTitle } from '../src/main/tray-title';
import type { SourceState, UsageSnapshot, UsageWindow } from '../src/shared/types';

const now = Date.parse('2026-11-11T03:00:00Z');
const hour = 3_600_000;
const five = (resetsAt: number | null): UsageWindow => ({
  key: 'five_hour',
  windowMinutes: 300,
  usedPercent: 40,
  resetsAt,
});
const week: UsageWindow = {
  key: 'seven_day',
  windowMinutes: 10080,
  usedPercent: 20,
  resetsAt: now + 50 * hour,
};
const ok = (...windows: UsageWindow[]): SourceState => ({
  kind: 'ok',
  readAt: now,
  usage: { windows, updatedAt: now },
});

const size = iconPoints * iconScale;
/** Alpha at a point given as an hour on the clock face and a distance from the centre, in 32-px units. */
function alphaAt(pixels: Buffer, clockHour: number, radius: number): number {
  const angle = (clockHour / 12) * 2 * Math.PI;
  const x = Math.floor(size / 2 + Math.sin(angle) * radius);
  const y = Math.floor(size / 2 - Math.cos(angle) * radius);
  return pixels[(y * size + x) * 4 + 3]!;
}

describe('timeLeftShare', () => {
  it('is the share of five hours left until the 5시간 reset', () => {
    expect(timeLeftShare(ok(five(now + 2.5 * hour), week), now)).toBe(0.5);
    expect(timeLeftShare(ok(week, five(now + 5 * hour)), now)).toBe(1);
  });

  it('is 0 past the reset, and null without a 5시간 window or reset time', () => {
    expect(timeLeftShare(ok(five(now - 60_000)), now)).toBe(0);
    expect(timeLeftShare(ok(week), now)).toBeNull();
    expect(timeLeftShare(ok(five(null)), now)).toBeNull();
    expect(timeLeftShare({ kind: 'waiting' }, now)).toBeNull();
  });

  it('uses the last good value after a failed read', () => {
    const failed: SourceState = {
      kind: 'error',
      message: '읽지 못했어요',
      lastGood: { windows: [five(now + hour)], updatedAt: now },
      nextRetryAt: null,
      retrying: false,
    };
    expect(timeLeftShare(failed, now)).toBe(0.2);
  });

  it('rounds to steps of 1/120 of a turn', () => {
    expect(shareStep(0.5004)).toBe(0.5);
    expect(shareStep(null)).toBeNull();
  });
});

describe('clockBitmap', () => {
  it("draws the ring always, and the wedge clockwise from 12 o'clock for the share left", () => {
    const half = clockBitmap(0.5);
    expect(half).toHaveLength(size * size * 4);
    expect(alphaAt(half, 9, 12.5)).toBe(255); // ring
    expect(alphaAt(half, 3, 6)).toBe(255); // wedge, 3 o'clock is inside half a turn
    expect(alphaAt(half, 9, 6)).toBe(0); // 9 o'clock is not
    const none = clockBitmap(null);
    expect(alphaAt(none, 9, 12.5)).toBe(255);
    expect(alphaAt(none, 3, 6)).toBe(0);
    expect(clockBitmap(0)).toEqual(none);
    expect(alphaAt(clockBitmap(1), 9, 6)).toBe(255);
  });
});

describe('MenuBarTitle clock', () => {
  const snapshot = (claude: SourceState): UsageSnapshot => ({
    claude,
    codex: { kind: 'waiting' },
    alertNotice: null,
    resetNotice: null,
  });

  it('redraws only when the picture changes, and shows no window with Claude Code turned off', () => {
    let at = now;
    const drawn: Array<number | null> = [];
    const title = new MenuBarTitle(
      () => undefined,
      () => at,
      (share) => drawn.push(share),
    );
    title.setUsage(snapshot(ok(five(now + 2.5 * hour))));
    title.setUsage(snapshot(ok(five(now + 2.5 * hour))));
    expect(drawn).toEqual([0.5]);
    at += 2.5 * 60_000;
    title.setUsage(snapshot(ok(five(now + 2.5 * hour))));
    expect(drawn).toEqual([0.5, shareStep(0.5 - 1 / 120)]);
    title.setHidden(['claude']);
    expect(drawn.at(-1)).toBeNull();
    title.stop();
  });
});
