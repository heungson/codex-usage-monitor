// The pace of a limit window: where even use would be now, and whether the window runs out first.

import { describe, expect, it } from 'vitest';

import { pace } from '../src/shared/pace';
import type { UsageWindow } from '../src/shared/types';

const hour = 3_600_000;
const now = Date.parse('2026-11-05T12:00:00Z');

/** A 5-hour window with `left` hours to its reset. */
const fiveHour = (usedPercent: number, left: number): UsageWindow => ({
  key: 'five_hour',
  windowMinutes: 300,
  usedPercent,
  resetsAt: now + left * hour,
});

describe('pace', () => {
  it('puts even use at the share of time passed', () => {
    expect(pace(fiveHour(10, 4), now)?.expected).toBeCloseTo(20);
  });

  it('lasts until the reset when spending at or under even use', () => {
    expect(pace(fiveHour(20, 4), now)).toMatchObject({ runsOutAt: null, projected: true });
    expect(pace(fiveHour(5, 4), now)?.runsOutAt).toBeNull();
  });

  it('says when spending faster runs the window out', () => {
    // 1 hour in, 40% used: 100% after 2.5 hours, 1.5 hours from now and before the reset in 4.
    expect(pace(fiveHour(40, 4), now)?.runsOutAt).toBe(now + 1.5 * hour);
  });

  it('calls a run-out in the last tenth of the window tight, not a warning', () => {
    // 3 days into 7, 44% used: 100% at 6.8 days, 0.2 days before the reset.
    const week: UsageWindow = {
      key: 'seven_day',
      windowMinutes: 10080,
      usedPercent: 44,
      resetsAt: now + 4 * 24 * hour,
    };
    expect(pace(week, now)).toMatchObject({ runsOutAt: null, tight: true });
  });

  it('projects nothing early in the window, at 0% or at 100%', () => {
    // 15 minutes into 5 hours is 5% of the window.
    expect(pace(fiveHour(30, 4.75), now)).toMatchObject({ runsOutAt: null, projected: false });
    expect(pace(fiveHour(0, 4), now)?.projected).toBe(false);
    expect(pace(fiveHour(100, 4), now)?.projected).toBe(false);
  });

  it('gives none without a length or a reset, or after the reset', () => {
    expect(pace({ ...fiveHour(10, 4), windowMinutes: null }, now)).toBeNull();
    expect(pace({ ...fiveHour(10, 4), resetsAt: null }, now)).toBeNull();
    expect(pace(fiveHour(10, -1), now)).toBeNull();
  });
});
