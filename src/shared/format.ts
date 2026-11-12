// Wording for windows and times, shared by the popover and the notifications, in the chosen
// language (src/shared/i18n.ts; Korean until 2026-11-12, still the default).

import { t, tList } from './i18n';
import type { CliUsage, ResetStatus, ResetWatch, UsageWindow } from './types';

export function windowLabel(minutes: number | null): string {
  if (minutes === null) return t('window.unknown');
  if (minutes % 1440 === 0) return t('window.days', { n: minutes / 1440 });
  if (minutes % 60 === 0) return t('window.hours', { n: minutes / 60 });
  return t('window.minutes', { n: minutes });
}

/** «5시간», «7일», or «Fable 7일» for a model's own window (developer, 2026-11-11). */
export function windowName(window: Pick<UsageWindow, 'windowMinutes' | 'model'>): string {
  const length = windowLabel(window.windowMinutes);
  return window.model ? t('window.model', { model: window.model, length }) : length;
}

/** The menu bar title and a folded card show the 5시간 and 7일 windows, not a model's own. */
export const isOverallWindow = (window: UsageWindow) => window.model === undefined;

/**
 * Shorter window first, the same for both CLIs and in both places: 5시간 then 7일 on the usage screen
 * (owner, 2026-10-30) and in the menu bar title (LHS-5 개발 항목 5, WF-P005).
 */
export const shorterFirst = (a: UsageWindow, b: UsageWindow) =>
  (a.windowMinutes ?? Number.MAX_SAFE_INTEGER) - (b.windowMinutes ?? Number.MAX_SAFE_INTEGER);

const pad = (n: number) => String(n).padStart(2, '0');

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** «10월 28일 (화) 14:28», or «오늘 14:28» / «내일 09:00»; in English «Tue, Oct 28, 14:28». */
export function formatDateTime(epochMs: number, now: number = Date.now()): string {
  const date = new Date(epochMs);
  const today = new Date(now);
  const tomorrow = new Date(now + 86_400_000);
  const yesterday = new Date(now - 86_400_000);
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  if (sameDay(date, today)) return t('date.today', { time });
  if (sameDay(date, tomorrow)) return t('date.tomorrow', { time });
  if (sameDay(date, yesterday)) return t('date.yesterday', { time });
  const parts = {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    monthName: tList('months')[date.getMonth()] ?? '',
    day: date.getDate(),
    weekday: tList('weekdays')[date.getDay()] ?? '',
    time,
  };
  return t(date.getFullYear() === today.getFullYear() ? 'date.thisYear' : 'date.otherYear', parts);
}

/** «13:23:41», for retries seconds apart. */
export function formatClock(epochMs: number): string {
  const date = new Date(epochMs);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** «2시간 5분», «3일 4시간», «1분 미만»; in English «2 h 5 min». */
export function formatDuration(ms: number): string {
  const minutes = Math.floor(Math.abs(ms) / 60_000);
  if (minutes < 1) return t('dur.lessThanMinute');
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  const join = (a: string, b: string) => `${a}${t('dur.join')}${b}`;
  if (days > 0) {
    const d = t('dur.days', { n: days });
    return hours > 0 ? join(d, t('dur.hours', { n: hours })) : d;
  }
  if (hours > 0) {
    const h = t('dur.hours', { n: hours });
    return mins > 0 ? join(h, t('dur.minutes', { n: mins })) : h;
  }
  return t('dur.minutes', { n: mins });
}

/**
 * The used share to show now. A window whose reset time has passed starts again from 0%, even when
 * the newest value is from before it (developer, 2026-11-05: the status line record still read 71%
 * after the 5시간 reset while Anthropic showed 0%, the account being paused by a 429).
 */
export function currentPercent(window: UsageWindow, now: number = Date.now()): number {
  return resetPassed(window, now) ? 0 : window.usedPercent;
}

export function resetPassed(window: UsageWindow, now: number = Date.now()): boolean {
  return window.resetsAt !== null && window.resetsAt <= now;
}

/** «오늘 15:30 (1시간 20분 뒤)»; a reset time already passed reads «… (지남)». */
export function describeReset(resetsAt: number, now: number = Date.now()): string {
  const when = formatDateTime(resetsAt, now);
  return resetsAt > now
    ? t('time.in', { when, duration: formatDuration(resetsAt - now) })
    : t('time.passed', { when });
}

/** «오늘 14:28 (3분 전)». */
export function describePast(at: number, now: number = Date.now()): string {
  return t('time.ago', { when: formatDateTime(at, now), duration: formatDuration(now - at) });
}

/**
 * Claude Code values older than this, while Anthropic cannot be asked, are marked 오래된 값
 * (developer, 2026-11-11).
 */
export const claudeStaleAfterMs = 10 * 60_000;

/**
 * True when the Claude Code values shown are more than 10 minutes old and the account could not be
 * asked (a 429 pause or a failure). Before 2026-11-11 the card said 정상 on a value 14 hours old
 * (developer, «it happened again»): the Claude app and VS Code never draw a status line, so the
 * record stops while the use goes on. With no login the record is the only source and is not marked.
 */
export function claudeStale(usage: CliUsage, now: number = Date.now()): boolean {
  const accountBlocked = usage.accountProblem != null || usage.accountRetryAt != null;
  return accountBlocked && usage.updatedAt !== null && now - usage.updatedAt > claudeStaleAfterMs;
}

/** The reset watch while it lasts: one past `expires_at` is no longer shown (developer, 2026-11-11). */
export function currentWatch(status: ResetStatus, now: number = Date.now()): ResetWatch | null {
  const watch = status.watch ?? null;
  return watch !== null && watch.expiresAt > now ? watch : null;
}

/** «리셋 신호» or «강한 리셋 신호», as codex-resets.com grades a watch («elevated», «strong»). */
export const watchName = (watch: ResetWatch) =>
  t(watch.level === 'strong' ? 'watch.strong' : 'watch.elevated');

/** «전체 리셋», «적립형 리셋», or the site's own word for a type this app does not know. */
export function resetTypeName(type: string): string {
  if (type === 'regular') return t('resetType.regular');
  if (type === 'banked') return t('resetType.banked');
  return type;
}
