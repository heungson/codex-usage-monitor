// The menu bar icon as a tiny usage meter (developer, 2026-11-05; the idea is CodexBar's two-bar
// icon). Top bar: the most used short window (5시간) of either CLI; bottom bar: the most used long
// window (7일). The CC/CX title beside it keeps the details. A template image, so macOS tints it for
// the menu bar; when no CLI has current values the meter is drawn faint, as CodexBar dims stale data.

import type { CliUsage, SourceState, UsageSnapshot } from '../shared/types';

export interface Meter {
  /** Used percent of the fullest short window, or null when no CLI has one. */
  short: number | null;
  /** Used percent of the fullest long window (a day or longer), or null. */
  long: number | null;
  /** No CLI has current values (loading, waiting, or only last good values after a failure). */
  faint: boolean;
}

const day = 1440;

function shown(state: SourceState): CliUsage | null {
  if (state.kind === 'ok') return state.usage;
  if (state.kind === 'error') return state.lastGood;
  return null;
}

export function meter(snapshot: Pick<UsageSnapshot, 'claude' | 'codex'>): Meter {
  let short: number | null = null;
  let long: number | null = null;
  const states = [snapshot.claude, snapshot.codex];
  for (const state of states) {
    for (const w of shown(state)?.windows ?? []) {
      const isLong = w.windowMinutes !== null && w.windowMinutes >= day;
      if (isLong) long = Math.max(long ?? 0, w.usedPercent);
      else short = Math.max(short ?? 0, w.usedPercent);
    }
  }
  return { short, long, faint: !states.some((s) => s.kind === 'ok') };
}

/** Icon size in points, and the pixels per point it is drawn at. */
export const iconPoints = 18;
export const iconScale = 2;

/**
 * The meter as raw BGRA pixels, `iconPoints × iconScale` square: two bars, each an outlined track
 * filled from the left by its percentage. Only alpha matters in a template image; colour is black.
 */
export function meterBitmap(value: Meter): Buffer {
  const size = iconPoints * iconScale;
  const pixels = Buffer.alloc(size * size * 4);
  const left = 1 * iconScale;
  const right = (iconPoints - 1) * iconScale;
  const bars: Array<[number, number, number | null]> = [
    [3 * iconScale, 8 * iconScale, value.short],
    [10 * iconScale, 15 * iconScale, value.long],
  ];
  const strength = value.faint ? 0.45 : 1;
  const put = (x: number, y: number, alpha: number) => {
    const at = (y * size + x) * 4;
    pixels[at + 3] = Math.max(pixels[at + 3]!, Math.round(255 * alpha * strength));
  };
  for (const [top, bottom, percent] of bars) {
    const fillTo =
      percent === null ? left : left + ((right - left) * Math.max(0, Math.min(100, percent))) / 100;
    for (let y = top; y < bottom; y += 1) {
      for (let x = left; x < right; x += 1) {
        // Round the corners by leaving each corner pixel out.
        const corner = (x === left || x === right - 1) && (y === top || y === bottom - 1);
        if (corner) continue;
        const edge = x === left || x === right - 1 || y === top || y === bottom - 1;
        if (x < fillTo) put(x, y, 1);
        else if (edge) put(x, y, 0.5);
      }
    }
  }
  return pixels;
}
