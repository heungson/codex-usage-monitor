// When two reset times name the same limit window. Claude Code and Codex round the reset time, so it
// can move by a few minutes within one window. Used by the limit alerts and by the status line hook
// (owner, 2026-10-30): one tolerance in one place.

/** Reset times less than 5 minutes apart are the same window. */
export const sameWindowToleranceMs = 5 * 60 * 1000;

export function sameResetWindow(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return a === b;
  return Math.abs(a - b) < sameWindowToleranceMs;
}
