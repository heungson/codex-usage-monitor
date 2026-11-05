// Where even use of a limit window would be now (the even-use mark on each bar).

import { describe, expect, it } from 'vitest';

import { isDayOff } from '../src/shared/holidays-kr';
import { evenUse, workingMs } from '../src/shared/pace';
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

describe('evenUse with «주말·공휴일 제외»', () => {
  // Local times, so the checks hold in any time zone the tests run in.
  const at = (day: number, hour = 0) => new Date(2026, 10, day, hour).getTime();
  const weekendsOnly = (t: number) => [0, 6].includes(new Date(t).getDay());
  // Monday 2 November 00:00 to Monday 9 November 00:00: five working days, then a weekend.
  const week: UsageWindow = { key: 'seven_day', windowMinutes: 10080, usedPercent: 40, resetsAt: at(9) };

  it('counts only working days: half of Monday–Friday is 50%', () => {
    expect(evenUse(week, at(4, 12), true, weekendsOnly)).toBeCloseTo(50);
    // Counting every hour the same moment is 2.5 of 7 days.
    expect(evenUse(week, at(4, 12), false, weekendsOnly)).toBeCloseTo((2.5 / 7) * 100);
  });

  it('stands still over the weekend', () => {
    expect(evenUse(week, at(7, 9), true, weekendsOnly)).toBeCloseTo(100);
    expect(evenUse(week, at(8, 20), true, weekendsOnly)).toBeCloseTo(100);
  });

  it('leaves windows shorter than a day alone', () => {
    const fiveHours: UsageWindow = {
      key: 'five_hour',
      windowMinutes: 300,
      usedPercent: 10,
      resetsAt: at(7, 14),
    };
    expect(evenUse(fiveHours, at(7, 12), true, weekendsOnly)).toBeCloseTo(60);
  });

  it('gives none for a window with no working time', () => {
    const saturday: UsageWindow = { key: 'day', windowMinutes: 1440, usedPercent: 10, resetsAt: at(8) };
    expect(evenUse(saturday, at(7, 12), true, weekendsOnly)).toBeNull();
  });

  it('splits time at local midnight', () => {
    // Friday 18:00 to Monday 06:00: 6 hours on Friday, 6 on Monday.
    expect(workingMs(at(6, 18), at(9, 6), weekendsOnly)).toBe(12 * hour);
  });
});

describe('isDayOff (Korea)', () => {
  const local = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).getTime();

  it('counts weekends, public, substitute and election holidays', () => {
    expect(isDayOff(local(2026, 11, 7))).toBe(true); // Saturday
    expect(isDayOff(local(2026, 11, 8))).toBe(true); // Sunday
    expect(isDayOff(local(2026, 9, 25))).toBe(true); // 추석
    expect(isDayOff(local(2026, 10, 5))).toBe(true); // 대체공휴일(개천절)
    expect(isDayOff(local(2026, 6, 3))).toBe(true); // 전국동시지방선거
    expect(isDayOff(local(2027, 2, 9))).toBe(true); // 대체공휴일(설날)
  });

  it('counts an ordinary weekday as a working day', () => {
    expect(isDayOff(local(2026, 11, 5))).toBe(false); // Thursday
    expect(isDayOff(local(2028, 1, 4))).toBe(false); // a year not listed: weekends only
  });
});
