// The menu bar meter icon: which windows it shows, and the pixels it draws.

import { describe, expect, it } from 'vitest';

import { iconPoints, iconScale, meter, meterBitmap } from '../src/main/tray-icon';
import type { CliUsage, SourceState } from '../src/shared/types';

const usage = (...windows: Array<[number, number]>): CliUsage => ({
  windows: windows.map(([windowMinutes, usedPercent], i) => ({
    key: String(i),
    windowMinutes,
    usedPercent,
    resetsAt: null,
  })),
  updatedAt: 0,
});
const ok = (u: CliUsage): SourceState => ({ kind: 'ok', usage: u, readAt: 0 });

describe('meter', () => {
  it('takes the fullest short and long window across both CLIs', () => {
    expect(meter({ claude: ok(usage([300, 1], [10080, 34])), codex: ok(usage([10080, 63])) })).toEqual({
      short: 1,
      long: 63,
      faint: false,
    });
  });

  it('is faint when no CLI is current, and empty without values', () => {
    const failed: SourceState = {
      kind: 'error',
      message: 'x',
      lastGood: usage([300, 50]),
      nextRetryAt: null,
      retrying: false,
    };
    expect(meter({ claude: failed, codex: { kind: 'waiting' } })).toEqual({
      short: 50,
      long: null,
      faint: true,
    });
    expect(meter({ claude: { kind: 'loading' }, codex: { kind: 'loading' } })).toEqual({
      short: null,
      long: null,
      faint: true,
    });
  });
});

describe('meterBitmap', () => {
  const size = iconPoints * iconScale;
  const alpha = (pixels: Buffer, xPt: number, yPt: number) =>
    pixels[(Math.round(yPt * iconScale) * size + Math.round(xPt * iconScale)) * 4 + 3];

  it('fills each bar from the left by its percentage, the rest an outline', () => {
    const pixels = meterBitmap({ short: 50, long: 0, faint: false });
    expect(pixels).toHaveLength(size * size * 4);
    // Inside the top bar (y 3–8 pt): a quarter along is filled, three quarters along is empty inside.
    expect(alpha(pixels, 5, 5.5)).toBe(255);
    expect(alpha(pixels, 13, 5.5)).toBe(0);
    // Its outline is there on the empty side.
    expect(alpha(pixels, 13, 3)).toBe(128);
    // The bottom bar at 0% is only an outline.
    expect(alpha(pixels, 5, 12.5)).toBe(0);
    // Outside the bars nothing is drawn.
    expect(alpha(pixels, 9, 1)).toBe(0);
  });

  it('draws faint values lighter', () => {
    expect(alpha(meterBitmap({ short: 100, long: 100, faint: true }), 5, 5.5)).toBe(115);
  });
});
