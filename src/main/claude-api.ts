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

import type { CliUsage, UsageWindow } from '../shared/types';

export interface ClaudeLogin {
  accessToken: string;
  /** Epoch milliseconds, when the login says. */
  expiresAt: number | null;
}

/** The login, or null when there is none. Throws with a message a person can act on. */
export type LoginSource = () => Promise<ClaudeLogin | null>;

const noLogin = 'Claude Code 로그인 정보가 없어요';

function parseLogin(text: string): ClaudeLogin | null {
  let oauth: { accessToken?: unknown; expiresAt?: unknown } | undefined;
  try {
    oauth = (JSON.parse(text) as { claudeAiOauth?: typeof oauth }).claudeAiOauth;
  } catch {
    throw new Error('Claude Code 로그인 정보를 해석할 수 없어요');
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
          else if (error) reject(new Error('키체인에서 Claude Code 로그인 정보를 읽지 못했어요'));
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
  if (!login) throw new Error(noLogin);
  if (login.expiresAt !== null && login.expiresAt <= now())
    throw new Error('Claude Code 로그인이 만료됐어요. Claude Code를 실행하면 갱신돼요');

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
    throw new Error('Anthropic 사용량 서버에 연결하지 못했어요');
  }
  if (response.status === 401 || response.status === 403)
    throw new Error('Anthropic이 Claude Code 로그인을 받지 않았어요. Claude Code를 실행하면 갱신돼요');
  if (response.status === 429) throw new Error('Anthropic이 요청이 너무 잦다고 했어요 (429)');
  if (!response.ok) throw new Error(`Anthropic 사용량을 받지 못했어요 (HTTP ${response.status})`);

  let body: { five_hour?: ApiWindow | null; seven_day?: ApiWindow | null };
  try {
    body = (await response.json()) as typeof body;
  } catch {
    throw new Error('Anthropic 사용량 응답을 해석할 수 없어요');
  }
  const windows = [
    toWindow('five_hour', 300, body.five_hour),
    toWindow('seven_day', 10080, body.seven_day),
  ].filter((w): w is UsageWindow => w !== null);
  if (windows.length === 0) throw new Error('Anthropic 사용량 응답에 한도가 없어요');
  return { windows, updatedAt: now(), source: 'account' };
}

export interface ClaudeSourceOptions extends AccountUsageOptions {
  /** The status line record reader (FC-F004): null when there is none, throws when it fails. */
  record: () => Promise<CliUsage | null>;
  /** Asks Anthropic at most this often; reads in between reuse the last answer, failures included. */
  minIntervalMs: number;
}

/**
 * The Claude Code reader: the account's limits when they can be had, else the status line record
 * with the reason. Whichever was updated last wins, so a Claude Code session drawing its status line
 * between two requests is shown at once.
 */
export function claudeSource(options: ClaudeSourceOptions): () => Promise<CliUsage | null> {
  const now = options.now ?? Date.now;
  let last: { at: number; usage: CliUsage | null; problem: string | null } | null = null;

  return async () => {
    if (!last || now() - last.at >= options.minIntervalMs) {
      const at = now();
      try {
        last = { at, usage: await fetchAccountUsage(options), problem: null };
      } catch (error) {
        last = { at, usage: null, problem: (error as Error).message };
      }
    }
    const account = last.usage;
    if (account) {
      let record: CliUsage | null = null;
      try {
        record = await options.record();
      } catch {
        // The account answer stands; a broken record only matters when it is the one shown.
      }
      return record && (record.updatedAt ?? 0) > (account.updatedAt ?? 0)
        ? { ...record, source: 'statusline' }
        : account;
    }
    // No login at all (an API key user, or never signed in) is the record-only setup, not a failure.
    const problem = last.problem === noLogin ? null : last.problem;
    const record = await options.record();
    if (record) return { ...record, source: 'statusline', accountProblem: problem };
    if (problem === null) return null;
    throw new Error(problem);
  };
}
