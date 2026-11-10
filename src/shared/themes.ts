// The looks a person can choose on the 설정 screen (developer, 2026-11-05: «add it as one of themes
// that the users can choose», then «add 4 more themes» «add just 14 more» and «add more Korean cultures or traditions inspired
// color themes»; 2026-11-10: «add more creative color themes»). 기본 is the macOS look the app had; the
// others are laid over it in styles.css under `:root[data-theme='…']`. Each follows the Mac's light
// or dark setting unless it has one scheme by nature: 터미널, 네온, 단청, 우주, 청사진, 자개, 일월오봉,
// 오로라, 용암, 칠판 and 오락실 are dark; 한지, 신문, LCD, 백자, 공책 and 옛 맥 are light.

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
export const themeGroups: ReadonlyArray<{ scheme: ThemeScheme; name: string }> = [
  { scheme: 'auto', name: '맥 설정 따름' },
  { scheme: 'light', name: '밝은 테마' },
  { scheme: 'dark', name: '어두운 테마' },
];

export interface Theme {
  id: ThemeId;
  name: string;
  /** Shown as the option's tooltip on the 설정 screen. */
  note: string;
  /** Whether it follows the Mac's light or dark setting ('auto') or has one scheme by nature. */
  scheme: ThemeScheme;
  /** Colours for the small preview: background, panel, bar, accent. */
  swatch: [string, string, string, string];
}

export const themes: readonly Theme[] = [
  {
    id: 'default',
    name: '기본',
    note: '맥 반투명',
    scheme: 'auto',
    swatch: ['#ececee', '#ffffff', '#0a7aff', '#6e6e73'],
  },
  {
    id: 'pixel',
    name: '픽셀',
    note: '도트 글꼴',
    scheme: 'auto',
    swatch: ['#e4dcc8', '#fbf7ec', '#3b5dc9', '#26213a'],
  },
  {
    id: 'terminal',
    name: '터미널',
    note: '초록 글자',
    scheme: 'dark',
    swatch: ['#050a05', '#0b140b', '#33ff66', '#1f7a35'],
  },
  {
    id: 'pastel',
    name: '파스텔',
    note: '둥글고 부드럽게',
    scheme: 'auto',
    swatch: ['#f6f0ff', '#ffffff', '#8b5cf6', '#ec4899'],
  },
  {
    id: 'neon',
    name: '네온',
    note: '빛나는 막대',
    scheme: 'dark',
    swatch: ['#0d0221', '#1a0b3b', '#ff2a6d', '#05d9e8'],
  },
  {
    id: 'contrast',
    name: '고대비',
    note: '굵은 선, 큰 글자',
    scheme: 'auto',
    swatch: ['#ffffff', '#ffffff', '#000000', '#0040c0'],
  },
  {
    id: 'ocean',
    name: '바다',
    note: '깊은 파랑',
    scheme: 'auto',
    swatch: ['#e6f1f8', '#ffffff', '#0a7fc0', '#0a6a9e'],
  },
  {
    id: 'forest',
    name: '숲',
    note: '짙은 초록',
    scheme: 'auto',
    swatch: ['#edf2e8', '#fbfdf8', '#3f8f3a', '#2f6b2a'],
  },
  {
    id: 'sunset',
    name: '노을',
    note: '주황과 분홍',
    scheme: 'auto',
    swatch: ['#fff1e8', '#ffffff', '#ea580c', '#c2410c'],
  },
  {
    id: 'blossom',
    name: '벚꽃',
    note: '연분홍',
    scheme: 'auto',
    swatch: ['#fdf0f3', '#ffffff', '#e0457b', '#be185d'],
  },
  {
    id: 'hanji',
    name: '한지',
    note: '먹과 종이',
    scheme: 'light',
    swatch: ['#efe6d2', '#f8f2e3', '#2b2925', '#8b1e1e'],
  },
  {
    id: 'dancheong',
    name: '단청',
    note: '전통 오방색',
    scheme: 'dark',
    swatch: ['#0e2a22', '#143a2f', '#5b9be0', '#f2c14e'],
  },
  {
    id: 'space',
    name: '우주',
    note: '별이 뜬 밤',
    scheme: 'dark',
    swatch: ['#070814', '#121430', '#8b7bff', '#9aa8ff'],
  },
  {
    id: 'coffee',
    name: '커피',
    note: '크림과 갈색',
    scheme: 'auto',
    swatch: ['#f3ebe2', '#fffaf4', '#8a5a3b', '#8a4b22'],
  },
  {
    id: 'mint',
    name: '민트',
    note: '산뜻한 민트',
    scheme: 'auto',
    swatch: ['#e9f7f2', '#ffffff', '#119482', '#0f766e'],
  },
  {
    id: 'mono',
    name: '모노',
    note: '흑백 미니멀',
    scheme: 'auto',
    swatch: ['#f4f4f4', '#ffffff', '#6b6b6b', '#111111'],
  },
  {
    id: 'newspaper',
    name: '신문',
    note: '신문 지면',
    scheme: 'light',
    swatch: ['#ece8df', '#f7f4ec', '#1a1a1a', '#1a1a1a'],
  },
  {
    id: 'blueprint',
    name: '청사진',
    note: '설계 도면',
    scheme: 'dark',
    swatch: ['#0d3b7a', '#0f4590', '#ffffff', '#ffffff'],
  },
  {
    id: 'lcd',
    name: 'LCD',
    note: '액정 계산기',
    scheme: 'light',
    swatch: ['#a1ac85', '#b9c49a', '#1e2614', '#1e2614'],
  },
  {
    id: 'candy',
    name: '사탕',
    note: '알록달록 줄무늬',
    scheme: 'auto',
    swatch: ['#fff4fb', '#ffffff', '#c026d3', '#a21caf'],
  },
  {
    id: 'saekdong',
    name: '색동',
    note: '한복 소매 줄무늬',
    scheme: 'auto',
    swatch: ['#fbf6ee', '#ffffff', '#c8102e', '#b5223b'],
  },
  {
    id: 'celadon',
    name: '청자',
    note: '고려 비색',
    scheme: 'auto',
    swatch: ['#dce8e0', '#eef5f0', '#4b8a75', '#2a6654'],
  },
  {
    id: 'baekja',
    name: '백자',
    note: '청화백자',
    scheme: 'light',
    swatch: ['#efece3', '#fbfaf6', '#2a4fa8', '#1f3f8f'],
  },
  {
    id: 'najeon',
    name: '자개',
    note: '나전칠기',
    scheme: 'dark',
    swatch: ['#0b0b0d', '#151518', '#8fd3ff', '#a8e6da'],
  },
  {
    id: 'irworobong',
    name: '일월오봉',
    note: '해와 달과 다섯 봉우리',
    scheme: 'dark',
    swatch: ['#0f2a4a', '#143559', '#4cbf7e', '#f5c542'],
  },
  {
    id: 'jogakbo',
    name: '조각보',
    note: '조각 이은 보자기',
    scheme: 'auto',
    swatch: ['#ece5d8', '#fbf8f2', '#7a5a2e', '#8c3b5a'],
  },
  {
    id: 'aurora',
    name: '오로라',
    note: '밤하늘의 빛 커튼',
    scheme: 'dark',
    swatch: ['#06121c', '#0d1f2d', '#4ade9b', '#b08cff'],
  },
  {
    id: 'lava',
    name: '용암',
    note: '현무암 틈의 불빛',
    scheme: 'dark',
    swatch: ['#140c0a', '#221512', '#ff6a1f', '#ffd23f'],
  },
  {
    id: 'watermelon',
    name: '수박',
    note: '껍질과 씨',
    scheme: 'auto',
    swatch: ['#e3f2dc', '#fffafa', '#e0354f', '#3f9142'],
  },
  {
    id: 'chalkboard',
    name: '칠판',
    note: '분필 글씨',
    scheme: 'dark',
    swatch: ['#1f3a30', '#264a3c', '#f4f1e6', '#ffe27a'],
  },
  {
    id: 'notebook',
    name: '공책',
    note: '줄 공책과 볼펜',
    scheme: 'light',
    swatch: ['#f7f5ee', '#fffef8', '#1d4ed8', '#d0342c'],
  },
  {
    id: 'arcade',
    name: '오락실',
    note: '에너지 게이지',
    scheme: 'dark',
    swatch: ['#0a0a12', '#15152a', '#3df58a', '#b03bff'],
  },
  {
    id: 'classicmac',
    name: '옛 맥',
    note: '흑백 1비트 화면',
    scheme: 'light',
    swatch: ['#d9d9d9', '#ffffff', '#000000', '#000000'],
  },
  {
    id: 'subway',
    name: '노선도',
    note: '지하철 노선과 역',
    scheme: 'auto',
    swatch: ['#f3f4f6', '#ffffff', '#009246', '#0052a4'],
  },
];

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && (themeIds as readonly string[]).includes(value);
}
