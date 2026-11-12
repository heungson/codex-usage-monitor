// The app's languages (developer, 2026-11-12: «add to configure Language selection Korean, English,
// Japanese, and Chinese for now»). Every word a person reads comes from one table per language;
// `ko` is the source and the others must have the same keys (the type checker enforces it, and
// test/i18n.test.ts checks that each keeps the same {placeholders}). The window and the main process
// each hold the chosen language; 설정 changes both.

import { en } from './messages/en';
import { ja } from './messages/ja';
import { ko, type MessageKey } from './messages/ko';
import { zh } from './messages/zh';

export type { MessageKey } from './messages/ko';

export const languages = ['ko', 'en', 'ja', 'zh'] as const;
export type Language = (typeof languages)[number];

export const isLanguage = (value: unknown): value is Language => languages.includes(value as Language);

/** Each language under its own name, so a person who cannot read the current one still finds theirs. */
export const languageNames: Record<Language, string> = {
  ko: '한국어',
  en: 'English',
  ja: '日本語',
  zh: '简体中文',
};

/** The `lang` attribute: Simplified Chinese as written in mainland China. */
export const languageTags: Record<Language, string> = { ko: 'ko', en: 'en', ja: 'ja', zh: 'zh-Hans' };

export const catalogs: Record<Language, Record<MessageKey, string>> = { ko, en, ja, zh };

let current: Language = 'ko';

export function setLanguage(language: Language): void {
  current = language;
}

export function language(): Language {
  return current;
}

/** The text for `key` in the current language, with each {name} replaced by `params.name`. */
export function t(key: MessageKey, params: Record<string, string | number> = {}): string {
  const text = catalogs[current][key] ?? ko[key];
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole));
}

/** A list kept in one entry, «a,b,c» (weekday and month names). */
export const tList = (key: MessageKey): string[] => t(key).split(',');
