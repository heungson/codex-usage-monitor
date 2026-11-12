// Claude Code limits from the person's Anthropic account, so they stay current without a Claude Code
// session open (developer's decision, 2026-11-03; see docs/decisions.md). The status line record
// (FC-F004) stays as the fallback.
//
// The login is the one Claude Code keeps in the macOS Keychain («Claude Code-credentials»). It is
// only read, and sent only to Anthropic's usage endpoint, the one Claude Code's /usage screen uses.
// The app never renews it: renewing replaces the stored refresh token, which could sign Claude Code
// out. An expired login is reported and the record is shown until Claude Code renews it.

import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';

import { formatClock } from '../shared/format';
import { t } from '../shared/i18n';
import type { CliUsage, UsageWindow } from '../shared/types';

export interface ClaudeLogin {
  accessToken: string;
  /** Epoch milliseconds, when the login says. */
  expiresAt: number | null;
}

/** The login, or null when there is none. Throws with a message a person can act on. */
export type LoginSource = () => Promise<ClaudeLogin | null>;

/** No login at all: the record-only setup (an API key user, or never signed in), not a failure. */
class NoLoginError extends Error {
  constructor() {
    super(t('claude.noLogin'));
  }
}

/** Anthropic answered 429. `retryAfterMs` is its Retry-After, when it sent one. */
export class RateLimitedError extends Error {
  constructor(readonly retryAfterMs: number | null) {
    super(t('claude.rateLimited'));
  }
}

/** Retry-After in seconds or as an HTTP date; null when absent or unreadable. */
export function parseRetryAfter(value: string | null, now: number): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000;
  const at = Date.parse(trimmed);
  return Number.isNaN(at) ? null : Math.max(0, at - now);
}

/**
 * The least wait after the n-th 429 in a row: 2, 4, 8, then 10 minutes. Asking again every minute
 * kept the app shut out (seen 2026-11-05). A longer Retry-After is kept; a shorter one is not, since
 * Anthropic answers this endpoint's 429 with «Retry-After: 0» and keeps refusing (anthropics/
 * claude-code issues 30930, 31637). The cap was 30 minutes until 2026-11-11 (developer): with the
 * account the only source that counts the Claude app and VS Code, 30 minutes left values far behind.
 */
export function rateLimitBackoffMs(consecutive: number): number {
  return Math.min(2 ** Math.max(1, consecutive), 10) * 60_000;
}

function parseLogin(text: string): ClaudeLogin | null {
  let oauth: { accessToken?: unknown; expiresAt?: unknown } | undefined;
  try {
    oauth = (JSON.parse(text) as { claudeAiOauth?: typeof oauth }).claudeAiOauth;
  } catch {
    throw new Error(t('claude.badLogin'));
  }
  if (typeof oauth?.accessToken !== 'string' || oauth.accessToken === '') return null;
  return {
    accessToken: oauth.accessToken,
    expiresAt: typeof oauth.expiresAt === 'number' ? oauth.expiresAt : null,
  };
}

/** The login Claude Code stores in the macOS Keychain. */
export function keychainLogin(): LoginSource {
  return () =>
    new Promise((resolve, reject) => {
      // A generous timeout: macOS may ask the person to allow access the first time.
      execFile(
        '/usr/bin/security',
        ['find-generic-password', '-s', 'Claude Code-credentials', '-w'],
        { timeout: 60_000 },
        (error, stdout) => {
          // Exit 44: no such item, so Claude Code has no login on this Mac.
          if (error && (error as { code?: unknown }).code === 44) resolve(null);
          else if (error) reject(new Error(t('claude.keychain')));
          else {
            try {
              resolve(parseLogin(stdout));
            } catch (parseError) {
              reject(parseError as Error);
            }
          }
        },
      );
    });
}

/** The same JSON read from a file (ULM_CLAUDE_CREDENTIALS), so checks never touch the Keychain. */
export function fileLogin(path: string): LoginSource {
  return async () => {
    let text: string;
    try {
      text = await readFile(path, 'utf8');
    } catch {
      return null;
    }
    return parseLogin(text);
  };
}

interface ApiWindow {
  utilization?: unknown;
  resets_at?: unknown;
}

function toWindow(key: string, minutes: number, raw: ApiWindow | null | undefined): UsageWindow | null {
  if (!raw || typeof raw.utilization !== 'number') return null;
  const resetsAt = typeof raw.resets_at === 'string' ? Date.parse(raw.resets_at) : NaN;
  return {
    key,
    windowMinutes: minutes,
    usedPercent: raw.utilization,
    resetsAt: Number.isNaN(resetsAt) ? null : resetsAt,
  };
}

interface ApiLimitRow {
  kind?: unknown;
  percent?: unknown;
  resets_at?: unknown;
  scope?: { model?: { display_name?: unknown } | null } | null;
}

/**
 * A model's own weekly window from the answer's `limits` rows (developer, 2026-11-11: «add fable
 * usage gauge»). Claude Code reads them the same way: `kind` «weekly_scoped» with
 * `scope.model.display_name` («Fable»), `percent` and an ISO `resets_at` (Claude Code 2.1.322). The
 * status line input has no such row, so only the account gives it.
 */
function modelWindows(rows: unknown): UsageWindow[] {
  if (!Array.isArray(rows)) return [];
  return (rows as ApiLimitRow[]).flatMap((row) => {
    const name = row?.scope?.model?.display_name;
    if (row?.kind !== 'weekly_scoped' || typeof name !== 'string' || name === '') return [];
    if (typeof row.percent !== 'number') return [];
    const resetsAt = typeof row.resets_at === 'string' ? Date.parse(row.resets_at) : NaN;
    return [
      {
        key: `model:${name.toLowerCase()}`,
        windowMinutes: 10080,
        usedPercent: row.percent,
        resetsAt: Number.isNaN(resetsAt) ? null : resetsAt,
        model: name,
      },
    ];
  });
}

export interface AccountUsageOptions {
  login: LoginSource;
  baseUrl: string;
  fetch?: typeof fetch;
  now?: () => number;
}

/** One request for the account's 5-hour and 7-day limits. Throws with the reason it could not. */
export async function fetchAccountUsage(options: AccountUsageOptions): Promise<CliUsage> {
  const now = options.now ?? Date.now;
  const login = await options.login();
  if (!login) throw new NoLoginError();
  if (login.expiresAt !== null && login.expiresAt <= now()) throw new Error(t('claude.expired'));

  let response: Response;
  try {
    response = await (options.fetch ?? fetch)(new URL('/api/oauth/usage', options.baseUrl), {
      headers: {
        Authorization: `Bearer ${login.accessToken}`,
        'anthropic-beta': 'oauth-2025-04-20',
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error(t('claude.offline'));
  }
  if (response.status === 401 || response.status === 403) throw new Error(t('claude.refused'));
  if (response.status === 429)
    throw new RateLimitedError(parseRetryAfter(response.headers.get('retry-after'), now()));
  if (!response.ok) throw new Error(t('claude.http', { status: response.status }));

  let body: { five_hour?: ApiWindow | null; seven_day?: ApiWindow | null; limits?: unknown };
  try {
    body = (await response.json()) as typeof body;
  } catch {
    throw new Error(t('claude.badAnswer'));
  }
  const windows = [
    toWindow('five_hour', 300, body.five_hour),
    toWindow('seven_day', 10080, body.seven_day),
  ].filter((w): w is UsageWindow => w !== null);
  if (windows.length === 0) throw new Error(t('claude.noLimits'));
  return { windows: [...windows, ...modelWindows(body.limits)], updatedAt: now(), source: 'account' };
}

export interface ClaudeSourceOptions extends AccountUsageOptions {
  /** The status line record reader (FC-F004): null when there is none, throws when it fails. */
  record: () => Promise<CliUsage | null>;
  /**
   * Asks Anthropic at most this often; reads in between reuse the last answer, failures included.
   * A status line record written within this time is current already, so Anthropic is not asked.
   */
  minIntervalMs: number;
}

/** A person asked (새로 고침, or opening the popover), rather than the timer. */
export interface ReadOptions {
  manual?: boolean;
}

/**
 * The Claude Code reader: the account's limits when they can be had, else the status line record
 * with the reason. Whichever was updated last wins, so a Claude Code session drawing its status line
 * between two requests is shown at once.
 *
 * Fewer requests (developer, 2026-11-05, after «계정 조회 실패 · 429» on 2026-11-05): no request
 * while the record is fresh, and after a 429 none until Retry-After or the backoff has passed.
 *
 * Changed 2026-11-11 (developer, after the card showed 14% from a 14-hour-old record while
 * Anthropic's page said 21%): a failed request no longer throws away the last account answer, which
 * is often far newer than the record, since the Claude app and VS Code never draw a status line.
 * And a person asking (새로 고침, opening the popover) asks once even during a 429 backoff, at most
 * once per interval.
 */
export function claudeSource(options: ClaudeSourceOptions): (read?: ReadOptions) => Promise<CliUsage | null> {
  const now = options.now ?? Date.now;
  let account: CliUsage | null = null;
  let failure: { problem: string; retryAt: number | null; noLogin: boolean } | null = null;
  let lastAskAt = -Infinity;
  let nextAskAt = 0;
  let rateLimited = 0;

  async function ask(at: number): Promise<void> {
    lastAskAt = at;
    try {
      account = await fetchAccountUsage(options);
      failure = null;
      rateLimited = 0;
      nextAskAt = at + options.minIntervalMs;
    } catch (error) {
      let problem = (error as Error).message;
      let retryAt: number | null = null;
      if (error instanceof RateLimitedError) {
        rateLimited += 1;
        const wait = Math.max(error.retryAfterMs ?? 0, rateLimitBackoffMs(rateLimited));
        nextAskAt = at + Math.max(wait, options.minIntervalMs);
        retryAt = nextAskAt;
        problem = t('claude.askAgain', { problem, time: formatClock(nextAskAt) });
      } else {
        nextAskAt = at + options.minIntervalMs;
      }
      failure = { problem, retryAt, noLogin: error instanceof NoLoginError };
    }
  }

  return async (read = {}) => {
    const at = now();
    let record: CliUsage | null = null;
    let recordError: unknown = null;
    try {
      record = await options.record();
    } catch (error) {
      recordError = error;
    }
    const recordFresh = record?.updatedAt != null && at - record.updatedAt < options.minIntervalMs;
    const due = at >= nextAskAt || (read.manual === true && at - lastAskAt >= options.minIntervalMs);
    if (!recordFresh && due) await ask(at);

    // No login at all (an API key user, or never signed in) is the record-only setup, not a failure.
    // A fresh record is current, so an earlier failure to ask the account does not matter now.
    const current = recordFresh || failure?.noLogin === true ? null : failure;
    // A 429 with a value to show is a pause, not a failure (developer, 2026-11-05: «just fix this»
    // on «계정 조회 실패 · 429»): the value is shown as usual with when the account is asked next.
    const note =
      current === null
        ? { accountProblem: null }
        : current.retryAt !== null
          ? { accountProblem: null, accountRetryAt: current.retryAt }
          : { accountProblem: current.problem };

    // The newer of the last account answer and the record; the account stands when the record is
    // broken.
    const recordNewer = record !== null && (record.updatedAt ?? 0) > (account?.updatedAt ?? -Infinity);
    if (account && !recordNewer) return current === null ? account : { ...account, ...note };
    if (recordError && !account) throw recordError;
    if (record) {
      // The record has no model windows (Fable); the last account answer's stay beside it.
      const models = account?.windows.filter((w) => w.model !== undefined) ?? [];
      return { ...record, windows: [...record.windows, ...models], source: 'statusline', ...note };
    }
    if (current === null) return null;
    throw new Error(current.problem);
  };
}
