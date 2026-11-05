// Where even use of a limit window would be now (the even-use mark on each bar).

import { describe, expect, it } from 'vitest';

import { evenUse } from '../src/shared/pace';
import type { UsageWindow } from '../src/shared/types';

const hour = 3_600_000;
const now = Date.parse('2026-11-05T12:00:00Z');

/** A 5-hour window with `left` hours to its reset. */
const fiveHour = (left: number): UsageWindow => ({
  key: 'five_hour',
  windowMinutes: 300,
  usedPercent: 10,
  resetsAt: now + left * hour,
});

describe('evenUse', () => {
  it('is the share of the window time that has passed', () => {
    expect(evenUse(fiveHour(4), now)).toBeCloseTo(20);
  });

  it('gives none without a length or a reset, or outside the window', () => {
    expect(evenUse({ ...fiveHour(4), windowMinutes: null }, now)).toBeNull();
    expect(evenUse({ ...fiveHour(4), resetsAt: null }, now)).toBeNull();
    expect(evenUse(fiveHour(-1), now)).toBeNull();
    expect(evenUse(fiveHour(6), now)).toBeNull();
  });
});
