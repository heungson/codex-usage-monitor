// The looks a person can choose on the 설정 screen (developer, 2026-11-05: «add it as one of themes
// that the users can choose», then «add 4 more themes» «add just 14 more» and «add more Korean cultures or traditions inspired
// color themes»). 기본 is the macOS look the app had; the
// others are laid over it in styles.css under `:root[data-theme='…']`. Each follows the Mac's light
// or dark setting unless it has one scheme by nature: 터미널, 네온, 단청, 우주, 청사진, 자개 and 일월오봉
// are dark; 한지, 신문, LCD and 백자 are light.

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
] as const;

export type ThemeId = (typeof themeIds)[number];

export interface Theme {
  id: ThemeId;
  name: string;
  /** Shown as the option's tooltip on the 설정 screen. */
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
    swatch: ['#f6f0ff', '#ffffff', '#8b5cf6', '#ec4899'],
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
  { id: 'ocean', name: '바다', note: '깊은 파랑', swatch: ['#e6f1f8', '#ffffff', '#0a7fc0', '#0a6a9e'] },
  { id: 'forest', name: '숲', note: '짙은 초록', swatch: ['#edf2e8', '#fbfdf8', '#3f8f3a', '#2f6b2a'] },
  { id: 'sunset', name: '노을', note: '주황과 분홍', swatch: ['#fff1e8', '#ffffff', '#ea580c', '#c2410c'] },
  { id: 'blossom', name: '벚꽃', note: '연분홍', swatch: ['#fdf0f3', '#ffffff', '#e0457b', '#be185d'] },
  { id: 'hanji', name: '한지', note: '먹과 종이', swatch: ['#efe6d2', '#f8f2e3', '#2b2925', '#8b1e1e'] },
  {
    id: 'dancheong',
    name: '단청',
    note: '전통 오방색',
    swatch: ['#0e2a22', '#143a2f', '#5b9be0', '#f2c14e'],
  },
  { id: 'space', name: '우주', note: '별이 뜬 밤', swatch: ['#070814', '#121430', '#8b7bff', '#9aa8ff'] },
  { id: 'coffee', name: '커피', note: '크림과 갈색', swatch: ['#f3ebe2', '#fffaf4', '#8a5a3b', '#8a4b22'] },
  { id: 'mint', name: '민트', note: '산뜻한 민트', swatch: ['#e9f7f2', '#ffffff', '#119482', '#0f766e'] },
  { id: 'mono', name: '모노', note: '흑백 미니멀', swatch: ['#f4f4f4', '#ffffff', '#6b6b6b', '#111111'] },
  { id: 'newspaper', name: '신문', note: '신문 지면', swatch: ['#ece8df', '#f7f4ec', '#1a1a1a', '#1a1a1a'] },
  {
    id: 'blueprint',
    name: '청사진',
    note: '설계 도면',
    swatch: ['#0d3b7a', '#0f4590', '#ffffff', '#ffffff'],
  },
  { id: 'lcd', name: 'LCD', note: '액정 계산기', swatch: ['#a1ac85', '#b9c49a', '#1e2614', '#1e2614'] },
  {
    id: 'candy',
    name: '사탕',
    note: '알록달록 줄무늬',
    swatch: ['#fff4fb', '#ffffff', '#c026d3', '#a21caf'],
  },
  {
    id: 'saekdong',
    name: '색동',
    note: '한복 소매 줄무늬',
    swatch: ['#fbf6ee', '#ffffff', '#c8102e', '#b5223b'],
  },
  { id: 'celadon', name: '청자', note: '고려 비색', swatch: ['#dce8e0', '#eef5f0', '#4b8a75', '#2a6654'] },
  { id: 'baekja', name: '백자', note: '청화백자', swatch: ['#efece3', '#fbfaf6', '#2a4fa8', '#1f3f8f'] },
  { id: 'najeon', name: '자개', note: '나전칠기', swatch: ['#0b0b0d', '#151518', '#8fd3ff', '#a8e6da'] },
  {
    id: 'irworobong',
    name: '일월오봉',
    note: '해와 달과 다섯 봉우리',
    swatch: ['#0f2a4a', '#143559', '#4cbf7e', '#f5c542'],
  },
  {
    id: 'jogakbo',
    name: '조각보',
    note: '조각 이은 보자기',
    swatch: ['#ece5d8', '#fbf8f2', '#7a5a2e', '#8c3b5a'],
  },
];

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && (themeIds as readonly string[]).includes(value);
}
