// The looks a person can choose on the 설정 screen (developer, 2026-11-05: «add it as one of themes
// that the users can choose», then «add 4 more themes»). 기본 is the macOS look the app had; the
// others are laid over it in styles.css under `:root[data-theme='…']`. Each follows the Mac's light
// or dark setting unless it is dark by nature (터미널, 네온).

export const themeIds = ['default', 'pixel', 'terminal', 'pastel', 'neon', 'contrast'] as const;

export type ThemeId = (typeof themeIds)[number];

export interface Theme {
  id: ThemeId;
  name: string;
  /** Shown under the name on the 설정 screen. */
  note: string;
  /** Colours for the small preview: background, panel, bar, accent. */
  swatch: [string, string, string, string];
}

export const themes: readonly Theme[] = [
  { id: 'default', name: '기본', note: '맥 반투명', swatch: ['#ececee', '#ffffff', '#0a7aff', '#6e6e73'] },
  {
    id: 'pixel',
    name: '픽셀',
    note: '도트 글꼴',
    swatch: ['#e4dcc8', '#fbf7ec', '#3b5dc9', '#26213a'],
  },
  {
    id: 'terminal',
    name: '터미널',
    note: '초록 글자',
    swatch: ['#050a05', '#0b140b', '#33ff66', '#1f7a35'],
  },
  {
    id: 'pastel',
    name: '파스텔',
    note: '둥글고 부드럽게',
    swatch: ['#f6f0ff', '#ffffff', '#a78bfa', '#f9a8d4'],
  },
  {
    id: 'neon',
    name: '네온',
    note: '빛나는 막대',
    swatch: ['#0d0221', '#1a0b3b', '#ff2a6d', '#05d9e8'],
  },
  {
    id: 'contrast',
    name: '고대비',
    note: '굵은 선, 큰 글자',
    swatch: ['#ffffff', '#ffffff', '#000000', '#0040c0'],
  },
];

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && (themeIds as readonly string[]).includes(value);
}
