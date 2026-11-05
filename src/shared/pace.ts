// Where even use of a limit window would be now (developer, 2026-11-05; the idea is Usage4Claude's
// even-use guide): the share of the window's time that has passed. The usage cards mark it on each
// bar, so a bar past the mark is being spent faster than evenly until the reset.

import type { UsageWindow } from './types';

/** Percent of the window's time that has passed (0–100), or null when its length or reset time is unknown or the window is over. */
export function evenUse(window: UsageWindow, now: number): number | null {
  if (window.resetsAt === null || window.windowMinutes === null) return null;
  const length = window.windowMinutes * 60_000;
  const elapsed = (now - (window.resetsAt - length)) / length;
  return elapsed <= 0 || elapsed >= 1 ? null : elapsed * 100;
}
