// The looks a person can choose on the 설정 screen (developer, 2026-11-05: «add it as one of themes
// that the users can choose», then «add 4 more themes» «add just 14 more» and «add more Korean cultures or traditions inspired
// color themes»; 2026-11-10: «add more creative color themes»). 기본 is the macOS look the app had; the
// others are laid over it in styles.css under `:root[data-theme='…']`. Each follows the Mac's light
// or dark setting unless it has one scheme by nature: 터미널, 네온, 단청, 우주, 청사진, 자개, 일월오봉,
// 오로라, 용암, 칠판 and 오락실 are dark; 한지, 신문, LCD, 백자, 공책 and 옛 맥 are light.

import { t } from './i18n';

export const themeIds = [
  'default',
  'pixel',
  'terminal',
  'pastel',
  'neon',
  'contrast',
  'ocean',
  'forest',
  'sunset',
  'blossom',
  'hanji',
  'dancheong',
  'space',
  'coffee',
  'mint',
  'mono',
  'newspaper',
  'blueprint',
  'lcd',
  'candy',
  'saekdong',
  'celadon',
  'baekja',
  'najeon',
  'irworobong',
  'jogakbo',
  'aurora',
  'lava',
  'watermelon',
  'chalkboard',
  'notebook',
  'arcade',
  'classicmac',
  'subway',
] as const;

export type ThemeId = (typeof themeIds)[number];

export type ThemeScheme = 'auto' | 'light' | 'dark';

/**
 * The picker's groups, in the order shown (developer, 2026-11-10: «divide the theme into light themes
 * and dark themes»; themes that follow the Mac are a third group, the developer's choice of three).
 */
export const themeGroups: ReadonlyArray<{ scheme: ThemeScheme; readonly name: string }> = (
  ['auto', 'light', 'dark'] as const
).map((scheme) => ({
  scheme,
  // In the chosen language (developer, 2026-11-12); read each time it is shown.
  get name() {
    return t(`themeGroup.${scheme}`);
  },
}));

export interface Theme {
  id: ThemeId;
  /** In the chosen language (src/shared/messages, developer 2026-11-12). */
  readonly name: string;
  /** Shown as the option's tooltip on the 설정 screen. */
  readonly note: string;
  /** Whether it follows the Mac's light or dark setting ('auto') or has one scheme by nature. */
  scheme: ThemeScheme;
  /** Colours for the small preview: background, panel, bar, accent. */
  swatch: [string, string, string, string];
}

const entries: ReadonlyArray<Omit<Theme, 'name' | 'note'>> = [
  {
    id: 'default',
    scheme: 'auto',
    swatch: ['#ececee', '#ffffff', '#0a7aff', '#6e6e73'],
  },
  {
    id: 'pixel',
    scheme: 'auto',
    swatch: ['#e4dcc8', '#fbf7ec', '#3b5dc9', '#26213a'],
  },
  {
    id: 'terminal',
    scheme: 'dark',
    swatch: ['#050a05', '#0b140b', '#33ff66', '#1f7a35'],
  },
  {
    id: 'pastel',
    scheme: 'auto',
    swatch: ['#f6f0ff', '#ffffff', '#8b5cf6', '#ec4899'],
  },
  {
    id: 'neon',
    scheme: 'dark',
    swatch: ['#0d0221', '#1a0b3b', '#ff2a6d', '#05d9e8'],
  },
  {
    id: 'contrast',
    scheme: 'auto',
    swatch: ['#ffffff', '#ffffff', '#000000', '#0040c0'],
  },
  {
    id: 'ocean',
    scheme: 'auto',
    swatch: ['#e6f1f8', '#ffffff', '#0a7fc0', '#0a6a9e'],
  },
  {
    id: 'forest',
    scheme: 'auto',
    swatch: ['#edf2e8', '#fbfdf8', '#3f8f3a', '#2f6b2a'],
  },
  {
    id: 'sunset',
    scheme: 'auto',
    swatch: ['#fff1e8', '#ffffff', '#ea580c', '#c2410c'],
  },
  {
    id: 'blossom',
    scheme: 'auto',
    swatch: ['#fdf0f3', '#ffffff', '#e0457b', '#be185d'],
  },
  {
    id: 'hanji',
    scheme: 'light',
    swatch: ['#efe6d2', '#f8f2e3', '#2b2925', '#8b1e1e'],
  },
  {
    id: 'dancheong',
    scheme: 'dark',
    swatch: ['#0e2a22', '#143a2f', '#5b9be0', '#f2c14e'],
  },
  {
    id: 'space',
    scheme: 'dark',
    swatch: ['#070814', '#121430', '#8b7bff', '#9aa8ff'],
  },
  {
    id: 'coffee',
    scheme: 'auto',
    swatch: ['#f3ebe2', '#fffaf4', '#8a5a3b', '#8a4b22'],
  },
  {
    id: 'mint',
    scheme: 'auto',
    swatch: ['#e9f7f2', '#ffffff', '#119482', '#0f766e'],
  },
  {
    id: 'mono',
    scheme: 'auto',
    swatch: ['#f4f4f4', '#ffffff', '#6b6b6b', '#111111'],
  },
  {
    id: 'newspaper',
    scheme: 'light',
    swatch: ['#ece8df', '#f7f4ec', '#1a1a1a', '#1a1a1a'],
  },
  {
    id: 'blueprint',
    scheme: 'dark',
    swatch: ['#0d3b7a', '#0f4590', '#ffffff', '#ffffff'],
  },
  {
    id: 'lcd',
    scheme: 'light',
    swatch: ['#a1ac85', '#b9c49a', '#1e2614', '#1e2614'],
  },
  {
    id: 'candy',
    scheme: 'auto',
    swatch: ['#fff4fb', '#ffffff', '#c026d3', '#a21caf'],
  },
  {
    id: 'saekdong',
    scheme: 'auto',
    swatch: ['#fbf6ee', '#ffffff', '#c8102e', '#b5223b'],
  },
  {
    id: 'celadon',
    scheme: 'auto',
    swatch: ['#dce8e0', '#eef5f0', '#4b8a75', '#2a6654'],
  },
  {
    id: 'baekja',
    scheme: 'light',
    swatch: ['#efece3', '#fbfaf6', '#2a4fa8', '#1f3f8f'],
  },
  {
    id: 'najeon',
    scheme: 'dark',
    swatch: ['#0b0b0d', '#151518', '#8fd3ff', '#a8e6da'],
  },
  {
    id: 'irworobong',
    scheme: 'dark',
    swatch: ['#0f2a4a', '#143559', '#4cbf7e', '#f5c542'],
  },
  {
    id: 'jogakbo',
    scheme: 'auto',
    swatch: ['#ece5d8', '#fbf8f2', '#7a5a2e', '#8c3b5a'],
  },
  {
    id: 'aurora',
    scheme: 'dark',
    swatch: ['#06121c', '#0d1f2d', '#4ade9b', '#b08cff'],
  },
  {
    id: 'lava',
    scheme: 'dark',
    swatch: ['#140c0a', '#221512', '#ff6a1f', '#ffd23f'],
  },
  {
    id: 'watermelon',
    scheme: 'auto',
    swatch: ['#e3f2dc', '#fffafa', '#e0354f', '#3f9142'],
  },
  {
    id: 'chalkboard',
    scheme: 'dark',
    swatch: ['#1f3a30', '#264a3c', '#f4f1e6', '#ffe27a'],
  },
  {
    id: 'notebook',
    scheme: 'light',
    swatch: ['#f7f5ee', '#fffef8', '#1d4ed8', '#d0342c'],
  },
  {
    id: 'arcade',
    scheme: 'dark',
    swatch: ['#0a0a12', '#15152a', '#3df58a', '#b03bff'],
  },
  {
    id: 'classicmac',
    scheme: 'light',
    swatch: ['#d9d9d9', '#ffffff', '#000000', '#000000'],
  },
  {
    id: 'subway',
    scheme: 'auto',
    swatch: ['#f3f4f6', '#ffffff', '#009246', '#0052a4'],
  },
];

export const themes: readonly Theme[] = entries.map((entry) => ({
  ...entry,
  get name() {
    return t(`theme.${entry.id}`);
  },
  get note() {
    return t(`theme.${entry.id}.note`);
  },
}));

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && (themeIds as readonly string[]).includes(value);
}
