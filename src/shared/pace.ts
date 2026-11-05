// How a limit window is being spent against the time that has passed in it (developer, 2026-11-05;
// the idea is CodexBar's «Pace» line and Usage4Claude's even-use guide). Even use would reach 100%
// exactly at the reset; spending faster than that runs the limit out before it resets.

import type { UsageWindow } from './types';

export interface Pace {
  /** Percent of the window's time that has passed: where even use would be now (0–100). */
  expected: number;
  /**
   * At this rate, when the window reaches 100%; null when it lasts until the reset, or runs out only
   * in the last tenth of the window (`tight`), which is too close to call from a projection.
   */
  runsOutAt: number | null;
  /** Spending a little over even use: it runs out, if at all, only just before the reset. */
  tight: boolean;
}

/** How close to the reset a projected run-out counts as tight rather than a warning. */
const tightShare = 0.1;

/**
 * Below this share of the window's time, a projection says more about one busy hour than about the
 * window, so no pace is given (the even-use mark still is).
 */
const minElapsedForProjection = 0.1;

/** The pace of a window, or null when its length or reset time is unknown or the window is over. */
export function pace(window: UsageWindow, now: number): (Pace & { projected: boolean }) | null {
  if (window.resetsAt === null || window.windowMinutes === null) return null;
  const length = window.windowMinutes * 60_000;
  const start = window.resetsAt - length;
  const elapsed = (now - start) / length;
  if (elapsed <= 0 || elapsed >= 1) return null;
  const projected = elapsed >= minElapsedForProjection && window.usedPercent > 0 && window.usedPercent < 100;
  let runsOutAt: number | null = null;
  let tight = false;
  if (projected) {
    const at = start + ((now - start) * 100) / window.usedPercent;
    if (at < window.resetsAt - tightShare * length) runsOutAt = at;
    else if (at < window.resetsAt) tight = true;
  }
  return { expected: elapsed * 100, runsOutAt, tight, projected };
}
