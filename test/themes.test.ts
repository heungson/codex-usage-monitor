// Every theme on the 설정 screen (developer, 2034-11-05) has its block in styles.css, and its colours
// meet the contrast targets the look keeps (docs/decisions.md, «Look»): text 4.5:1, graphics 3:1.
// Measured here rather than judged from captures.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { isThemeId, themeGroups, themes } from '../src/shared/themes';

const css = readFileSync(join(__dirname, '..', 'src', 'renderer', 'styles.css'), 'utf8');

/** The text between the braces that open right after `start`. */
function blockAfter(text: string, start: number): string {
  const open = text.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return text.slice(open + 1, i);
  }
  throw new Error('unclosed block');
}

/** Custom properties declared at the top level of a block (not inside nested rules). */
function topLevelTokens(block: string): Record<string, string> {
  let flat = '';
  let depth = 0;
  for (const ch of block) {
    if (ch === '{') depth++;
    if (depth === 0) flat += ch;
    if (ch === '}') depth--;
  }
  const tokens: Record<string, string> = {};
  for (const [, name, value] of flat.matchAll(/--([\w-]+):\s*([^;]+);/g)) tokens[name!] = value!.trim();
  return tokens;
}

function themeTokens(id: string): { light: Record<string, string>; dark: Record<string, string> } {
  const at = css.indexOf(`:root[data-theme='${id}'] {`);
  if (at < 0) throw new Error(`no block for ${id}`);
  const block = blockAfter(css, at);
  const light = topLevelTokens(block);
  const media = block.indexOf('@media (prefers-color-scheme: dark)');
  const dark = media < 0 ? light : { ...light, ...topLevelTokens(blockAfter(block, media)) };
  return { light, dark };
}

function luminance(hex: string): number {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) throw new Error(`not a #rrggbb colour: ${hex}`);
  const channel = (i: number) => {
    const v = parseInt(match[1]!.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2134 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

/** [foreground, background, least ratio]; optional foregrounds are checked when the theme has them. */
const pairs: Array<[string, string, number]> = [
  ['text', 'surface', 4.5],
  ['text', 'window', 4.5],
  ['text-2', 'surface', 4.5],
  ['text-2', 'window', 4.5],
  ['accent', 'surface', 4.5],
  ['accent', 'window', 4.5],
  ['warn', 'surface', 4.5],
  ['error', 'surface', 4.5],
  ['on-accent', 'accent-fill', 4.5],
  ['tip-text', 'tip-bg', 4.5],
  ['bar', 'surface', 3],
  ['bar-high', 'surface', 3],
  ['even', 'surface', 3],
];
const optional = ['bar-end', 'bar-high-end'];

describe('themes', () => {
  it('lists 34 distinct themes, 기본 first', () => {
    expect(themes).toHaveLength(34);
    expect(themes[0]!.id).toBe('default');
    expect(new Set(themes.map((t) => t.id)).size).toBe(34);
    expect(new Set(themes.map((t) => t.name)).size).toBe(34);
    expect(isThemeId('pixel')).toBe(true);
    expect(isThemeId('gone')).toBe(false);
  });

  it("puts every theme in one of the picker's three groups: 17 follow the Mac, 6 light, 11 dark", () => {
    const count = (scheme: string) => themes.filter((t) => t.scheme === scheme).length;
    expect(themeGroups.map((g) => [g.scheme, count(g.scheme)])).toEqual([
      ['auto', 17],
      ['light', 6],
      ['dark', 11],
    ]);
  });

  // The group a theme is listed in is what its block in styles.css does.
  for (const theme of themes.filter((t) => t.id !== 'default')) {
    it(`${theme.name} (${theme.id}) is listed as ${theme.scheme}, as its styles are`, () => {
      const block = blockAfter(css, css.indexOf(`:root[data-theme='${theme.id}'] {`));
      const followsMac = block.includes('@media (prefers-color-scheme: dark)');
      const fixed = /(?<!-)color-scheme:\s*(light|dark);/.exec(
        block.replace(/@media[^{]*\{[^}]*\}/g, ''),
      )?.[1];
      expect(followsMac ? 'auto' : fixed).toBe(theme.scheme);
    });
  }

  for (const theme of themes.filter((t) => t.id !== 'default')) {
    it(`${theme.name} (${theme.id}) meets the contrast targets in light and dark`, () => {
      const { light, dark } = themeTokens(theme.id);
      const short: string[] = [];
      for (const [scheme, tokens] of [
        ['light', light],
        ['dark', dark],
      ] as const) {
        const checks = [
          ...pairs,
          ...optional.filter((k) => k in tokens).map((k) => [k, 'surface', 3] as const),
        ];
        for (const [fg, bg, least] of checks) {
          const ratio = contrast(tokens[fg]!, tokens[bg]!);
          if (ratio < least) short.push(`${scheme}: ${fg} on ${bg} ${ratio.toFixed(2)} < ${least}`);
        }
      }
      expect(short).toEqual([]);
    });
  }
});
