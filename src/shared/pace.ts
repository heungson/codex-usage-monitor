// Where even use of a limit window would be now (developer, 2026-11-05; the idea is Usage4Claude's
// even-use guide): the share of the window's time that has passed. The usage cards mark it on each
// bar, so a bar past the mark is being spent faster than evenly until the reset.
//
// With «주말·공휴일 제외» on, a window of a day or longer counts only working days: the mark stands
// still on Saturdays, Sundays and public holidays and moves faster on the other days, still reaching
// the end at the reset. Shorter windows (5시간) always count every hour.

import { isDayOff as koreanDayOff } from './holidays-kr';
import type { UsageWindow } from './types';

const day = 1440;

/** Milliseconds in [from, to) that fall on days that are not off, split at local midnights. */
export function workingMs(from: number, to: number, isDayOff: (at: number) => boolean): number {
  let total = 0;
  let cursor = from;
  while (cursor < to) {
    const midnight = new Date(cursor);
    midnight.setHours(24, 0, 0, 0);
    const end = Math.min(midnight.getTime(), to);
    if (!isDayOff(cursor)) total += end - cursor;
    cursor = end;
  }
  return total;
}

/**
 * Percent of the window's time that has passed (0–100), or null when its length or reset time is
 * unknown or the window is over. `workdaysOnly` leaves out days off in windows of a day or longer;
 * null too when such a window has no working time at all.
 */
export function evenUse(
  window: UsageWindow,
  now: number,
  workdaysOnly = false,
  isDayOff: (at: number) => boolean = koreanDayOff,
): number | null {
  if (window.resetsAt === null || window.windowMinutes === null) return null;
  const length = window.windowMinutes * 60_000;
  const start = window.resetsAt - length;
  if (now <= start || now >= window.resetsAt) return null;
  if (workdaysOnly && window.windowMinutes >= day) {
    const total = workingMs(start, window.resetsAt, isDayOff);
    return total === 0 ? null : (workingMs(start, now, isDayOff) / total) * 100;
  }
  return ((now - start) / length) * 100;
}
