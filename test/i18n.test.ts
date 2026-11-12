// The languages (developer, 2026-11-12): every table has the source's keys and the same
// {placeholders}, and the shared wording follows the chosen language.

import { afterEach, describe, expect, it } from 'vitest';

import { formatDateTime, formatDuration, describeReset, windowName } from '../src/shared/format';
import { catalogs, languages, setLanguage, t } from '../src/shared/i18n';
import { ko } from '../src/shared/messages/ko';
import { themes } from '../src/shared/themes';

const dateFields = ['year', 'month', 'monthName', 'day', 'weekday', 'time'];
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('catalogs', () => {
  afterEach(() => setLanguage('ko'));

  for (const language of languages) {
    it(`${language} has every key, none empty, with the same placeholders as Korean`, () => {
      const table = catalogs[language];
      expect(Object.keys(table).sort()).toEqual(Object.keys(ko).sort());
      for (const [key, text] of Object.entries(ko)) {
        const translated = table[key as keyof typeof ko];
        // «dur.join» is a space in Korean and English, nothing in Japanese and Chinese.
        if (key !== 'dur.join') expect(translated, key).not.toBe('');
        // A date picks from the fields formatDateTime gives: English names the month, others number it.
        if (
          key.startsWith('date.') &&
          key !== 'date.today' &&
          key !== 'date.tomorrow' &&
          key !== 'date.yesterday'
        )
          expect(dateFields, key).toEqual(expect.arrayContaining(placeholders(translated)));
        else expect(placeholders(translated), key).toEqual(placeholders(text));
      }
      // Seven weekdays and twelve months in each.
      expect(table.weekdays.split(',')).toHaveLength(7);
      expect(table.months.split(',')).toHaveLength(12);
    });
  }

  it('fills placeholders and leaves an unknown one as it is', () => {
    expect(t('usage.limit', { name: '5시간' })).toBe('5시간 한도');
    expect(t('usage.limit')).toBe('{name} 한도');
  });

  it('names every theme in every language', () => {
    for (const language of languages) {
      setLanguage(language);
      expect(new Set(themes.map((theme) => theme.name)).size).toBe(themes.length);
    }
  });
});

describe('dates and durations in each language', () => {
  afterEach(() => setLanguage('ko'));
  // Local time, as the app shows it: Wednesday 11 November 2026, 14:05.
  const now = new Date(2026, 10, 11, 14, 5).getTime();
  const friday = new Date(2026, 10, 13, 17, 0).getTime();
  const nextYear = new Date(2027, 0, 4, 9, 30).getTime();

  it('Korean, as before', () => {
    expect(formatDateTime(friday, now)).toBe('11월 13일 (금) 17:00');
    expect(formatDateTime(nextYear, now)).toBe('2027년 1월 4일 (월) 09:30');
    expect(formatDateTime(now + 3_600_000, now)).toBe('오늘 15:05');
    expect(formatDuration(2 * 3_600_000 + 5 * 60_000)).toBe('2시간 5분');
    expect(describeReset(now + 90 * 60_000, now)).toBe('오늘 15:35 (1시간 30분 뒤)');
    expect(windowName({ windowMinutes: 10080, model: 'Fable' })).toBe('Fable 7일');
  });

  it('English', () => {
    setLanguage('en');
    expect(formatDateTime(friday, now)).toBe('Fri, Nov 13, 17:00');
    expect(formatDateTime(nextYear, now)).toBe('Mon, Jan 4, 2027, 09:30');
    expect(formatDateTime(now - 86_400_000, now)).toBe('yesterday 14:05');
    expect(formatDuration(2 * 3_600_000 + 5 * 60_000)).toBe('2 h 5 min');
    expect(formatDuration(30_000)).toBe('under 1 min');
    expect(describeReset(now + 90 * 60_000, now)).toBe('today 15:35 (in 1 h 30 min)');
    expect(windowName({ windowMinutes: 300 })).toBe('5-hour');
    expect(t('usage.limit', { name: windowName({ windowMinutes: 10080, model: 'Fable' }) })).toBe(
      'Fable 7-day limit',
    );
  });

  it('Japanese', () => {
    setLanguage('ja');
    expect(formatDateTime(friday, now)).toBe('11月13日 (金) 17:00');
    expect(formatDuration(3 * 86_400_000 + 4 * 3_600_000)).toBe('3日4時間');
    expect(describeReset(now + 90 * 60_000, now)).toBe('今日 15:35 (あと1時間30分)');
    expect(windowName({ windowMinutes: 10080 })).toBe('7日間');
  });

  it('Simplified Chinese', () => {
    setLanguage('zh');
    expect(formatDateTime(friday, now)).toBe('11月13日 (周五) 17:00');
    expect(formatDuration(2 * 3_600_000 + 5 * 60_000)).toBe('2小时5分钟');
    expect(describeReset(now - 60_000, now)).toBe('今天 14:04 (已过)');
    expect(windowName({ windowMinutes: 300 })).toBe('5小时');
  });
});
