// The menu bar icon as a clock of the Claude Code 5시간 window (developer, 2026-11-11: «Does the
// timer like icon actually reflect how much time is left until the 5 hour reset?» — it did not; it
// was a fixed picture — then «Time. The current clock like icon is ok.»). The same ring and wedge as
// the old fixed icon; the wedge is the share of the five hours still left, filled clockwise from
// 12 o'clock, so it empties toward the reset. A template image, so macOS tints it for the menu bar.

import { isOverallWindow } from '../shared/format';
import type { SourceState } from '../shared/types';

const fiveHoursMs = 5 * 60 * 60_000;

/**
 * The share of the Claude Code 5시간 window still left, 0 to 1; 0 once its reset has passed (no
 * window runs until Claude Code is used again); null without a 5시간 window or its reset time.
 * A last good value after a failed read still has a reset time worth showing.
 */
export function timeLeftShare(state: SourceState, now: number): number | null {
  const usage = state.kind === 'ok' ? state.usage : state.kind === 'error' ? state.lastGood : null;
  const window = usage?.windows.find((w) => isOverallWindow(w) && w.windowMinutes === 300);
  if (!window || window.resetsAt === null) return null;
  return Math.max(0, Math.min(1, (window.resetsAt - now) / fiveHoursMs));
}

/** Icon size in points, and the pixels per point it is drawn at (the old asset's 16 pt, @2x). */
export const iconPoints = 16;
export const iconScale = 2;

/**
 * The share rounded to what the icon can show, so the menu bar is redrawn only when the picture
 * changes: 1/120 of a turn, every 2½ minutes of a five-hour window.
 */
export const shareStep = (share: number | null): number | null =>
  share === null ? null : Math.round(share * 120) / 120;

/**
 * The clock as raw BGRA pixels, `iconPoints × iconScale` square. The ring is always drawn; the wedge
 * covers `share` of a turn from 12 o'clock clockwise, none for null or 0. Measured from the old
 * asset at 32 px: ring between radius 11 and 14 around the centre, wedge radius 10. Edges are
 * smoothed by sampling each pixel 4 × 4 times. Only alpha matters in a template image; colour is black.
 */
export function clockBitmap(share: number | null): Buffer {
  const size = iconPoints * iconScale;
  const unit = size / 32;
  const centre = size / 2;
  const [ringIn, ringOut, wedge] = [11 * unit, 14 * unit, 10 * unit];
  const sweep = (share ?? 0) * 2 * Math.PI;
  const pixels = Buffer.alloc(size * size * 4);
  const samples = 4;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let covered = 0;
      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const dx = x + (sx + 0.5) / samples - centre;
          const dy = y + (sy + 0.5) / samples - centre;
          const r = Math.hypot(dx, dy);
          if (r >= ringIn && r <= ringOut) {
            covered += 1;
            continue;
          }
          if (r > wedge || sweep <= 0) continue;
          // Clockwise from 12 o'clock, 0 to 2π.
          const angle = (Math.atan2(dx, -dy) + 2 * Math.PI) % (2 * Math.PI);
          if (angle <= sweep) covered += 1;
        }
      }
      pixels[(y * size + x) * 4 + 3] = Math.round((255 * covered) / (samples * samples));
    }
  }
  return pixels;
}
