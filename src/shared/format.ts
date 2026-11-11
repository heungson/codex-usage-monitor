// Korean wording for windows and times, shared by the popover and the notifications.

import type { CliUsage, UsageWindow } from './types';

const weekdays = ['일', '월', '화', '수', '목', '금', '토'];

export function windowLabel(minutes: number | null): string {
  if (minutes === null) return '시간 창';
  if (minutes % 1440 === 0) return `${minutes / 1440}일`;
  if (minutes % 60 === 0) return `${minutes / 60}시간`;
  return `${minutes}분`;
}

/** «5시간», «7일», or «Fable 7일» for a model's own window (developer, 2026-11-11). */
export function windowName(window: Pick<UsageWindow, 'windowMinutes' | 'model'>): string {
  const length = windowLabel(window.windowMinutes);
  return window.model ? `${window.model} ${length}` : length;
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

/** «10월 28일 (화) 14:28», or «오늘 14:28» / «내일 09:00». */
export function formatDateTime(epochMs: number, now: number = Date.now()): string {
  const date = new Date(epochMs);
  const today = new Date(now);
  const tomorrow = new Date(now + 86_400_000);
  const yesterday = new Date(now - 86_400_000);
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  if (sameDay(date, today)) return `오늘 ${time}`;
  if (sameDay(date, tomorrow)) return `내일 ${time}`;
  if (sameDay(date, yesterday)) return `어제 ${time}`;
  const year = date.getFullYear() === today.getFullYear() ? '' : `${date.getFullYear()}년 `;
  return `${year}${date.getMonth() + 1}월 ${date.getDate()}일 (${weekdays[date.getDay()]}) ${time}`;
}

/** «13:23:41», for retries seconds apart. */
export function formatClock(epochMs: number): string {
  const date = new Date(epochMs);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** «2시간 5분», «3일 4시간», «1분 미만». */
export function formatDuration(ms: number): string {
  const minutes = Math.floor(Math.abs(ms) / 60_000);
  if (minutes < 1) return '1분 미만';
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return hours > 0 ? `${days}일 ${hours}시간` : `${days}일`;
  if (hours > 0) return mins > 0 ? `${hours}시간 ${mins}분` : `${hours}시간`;
  return `${mins}분`;
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
  return resetsAt > now ? `${when} (${formatDuration(resetsAt - now)} 뒤)` : `${when} (지남)`;
}

/** «오늘 14:28 (3분 전)». */
export function describePast(at: number, now: number = Date.now()): string {
  return `${formatDateTime(at, now)} (${formatDuration(now - at)} 전)`;
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
