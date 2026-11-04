// Claude Code limits from the Anthropic account, with the status line record as the fallback
// (developer's decision, 2026-11-03). Every request goes to a fake fetch; nothing reads the Keychain.

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  claudeSource,
  fetchAccountUsage,
  fileLogin,
  parseRetryAfter,
  type ClaudeLogin,
} from '../src/main/claude-api';
import type { CliUsage } from '../src/shared/types';
import { tempDir } from './helpers';

const t0 = Date.parse('2026-11-04T04:00:00Z');
const minute = 60_000;

/** The parts of the live answer this app uses (seen 2026-11-04, HTTP 200). */
const answer = {
  five_hour: { utilization: 10.0, resets_at: '2026-11-04T08:19:59.775399+00:00' },
  seven_day: { utilization: 36.0, resets_at: '2026-11-09T11:59:59.775418+00:00' },
  seven_day_opus: null,
  extra_usage: { is_enabled: false },
};

function fakeFetch(responses: Array<{ status: number; body?: unknown } | 'offline'>) {
  const calls: Array<{ url: string; headers: Record<string, string> }> = [];
  const impl = (async (url: URL, init?: RequestInit) => {
    calls.push({ url: String(url), headers: init?.headers as Record<string, string> });
    const next = responses.length > 1 ? responses.shift()! : responses[0]!;
    if (next === 'offline') throw new TypeError('fetch failed');
    return new Response(JSON.stringify(next.body ?? {}), { status: next.status });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const login =
  (value: ClaudeLogin | null = { accessToken: 'tok', expiresAt: t0 + 60 * minute }) =>
  async () =>
    value;

const record = (usedPercent: number, updatedAt: number): CliUsage => ({
  windows: [{ key: 'five_hour', windowMinutes: 300, usedPercent, resetsAt: t0 + 60 * minute }],
  updatedAt,
});

describe('fetchAccountUsage', () => {
  it('asks the usage endpoint with the login and maps both windows', async () => {
    const { impl, calls } = fakeFetch([{ status: 200, body: answer }]);
    const usage = await fetchAccountUsage({
      login: login(),
      baseUrl: 'https://api.test',
      fetch: impl,
      now: () => t0,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://api.test/api/oauth/usage');
    expect(calls[0]!.headers.Authorization).toBe('Bearer tok');
    expect(calls[0]!.headers['anthropic-beta']).toBe('oauth-2025-04-20');
    expect(usage).toEqual({
      windows: [
        {
          key: 'five_hour',
          windowMinutes: 300,
          usedPercent: 10,
          resetsAt: Date.parse('2026-11-04T08:19:59.775Z'),
        },
        {
          key: 'seven_day',
          windowMinutes: 10080,
          usedPercent: 36,
          resetsAt: Date.parse('2026-11-09T11:59:59.775Z'),
        },
      ],
      updatedAt: t0,
      source: 'account',
    });
  });

  it('sends nothing with an expired login, and says Claude Code renews it', async () => {
    const { impl, calls } = fakeFetch([{ status: 200, body: answer }]);
    await expect(
      fetchAccountUsage({
        login: login({ accessToken: 'tok', expiresAt: t0 - 1 }),
        baseUrl: 'https://api.test',
        fetch: impl,
        now: () => t0,
      }),
    ).rejects.toThrow('만료');
    expect(calls).toHaveLength(0);
  });

  it.each([
    [{ status: 401 }, 'Claude Code를 실행하면 갱신돼요'],
    [{ status: 429 }, '429'],
    [{ status: 500 }, 'HTTP 500'],
    ['offline' as const, '연결하지 못했어요'],
    [{ status: 200, body: { five_hour: null, seven_day: null } }, '한도가 없어요'],
  ])('explains a failed answer: %j', async (response, message) => {
    const { impl } = fakeFetch([response]);
    await expect(
      fetchAccountUsage({ login: login(), baseUrl: 'https://api.test', fetch: impl, now: () => t0 }),
    ).rejects.toThrow(message);
  });
});

describe('claudeSource', () => {
  it('shows the account and asks at most once per interval, failures included', async () => {
    let now = t0;
    const { impl, calls } = fakeFetch([{ status: 500 }, { status: 200, body: answer }]);
    const read = claudeSource({
      login: login({ accessToken: 'tok', expiresAt: null }),
      baseUrl: 'https://api.test',
      fetch: impl,
      now: () => now,
      record: async () => record(35, t0 - 600 * minute),
      minIntervalMs: minute,
    });
    const first = await read();
    expect(first?.source).toBe('statusline');
    expect(first?.accountProblem).toContain('HTTP 500');
    now += 30_000;
    await read();
    expect(calls).toHaveLength(1);
    now += 30_000;
    const later = await read();
    expect(calls).toHaveLength(2);
    expect(later?.source).toBe('account');
    expect(later?.windows[0]?.usedPercent).toBe(10);
  });

  it('after a 429 waits 2, 4, 8, 16, then 30 minutes, and starts over after a success', async () => {
    let now = t0;
    const { impl, calls } = fakeFetch([
      { status: 429 },
      { status: 429 },
      { status: 429 },
      { status: 429 },
      { status: 429 },
      { status: 429 },
      { status: 200, body: answer },
      { status: 429 },
    ]);
    const read = claudeSource({
      login: login({ accessToken: 'tok', expiresAt: null }),
      baseUrl: 'https://api.test',
      fetch: impl,
      now: () => now,
      record: async () => record(35, t0 - 600 * minute),
      minIntervalMs: minute,
    });
    const first = await read();
    expect(first?.accountProblem).toContain('429');
    expect(first?.accountProblem).toContain('에 다시 물어봐요');
    for (const [i, wait] of [2, 4, 8, 16, 30].entries()) {
      now += (wait - 1) * minute;
      await read();
      expect(calls).toHaveLength(i + 1);
      now += minute;
      await read();
      expect(calls).toHaveLength(i + 2);
    }
    // The sixth 429 waits 30 minutes too; the success after it resets the backoff.
    now += 30 * minute;
    expect((await read())?.source).toBe('account');
    now += minute;
    await read();
    expect(calls).toHaveLength(8);
    now += minute;
    await read();
    expect(calls).toHaveLength(8);
    now += minute;
    await read();
    expect(calls).toHaveLength(9);
  });

  it('after a 429 waits as long as Retry-After says, but never less than the interval', async () => {
    let now = t0;
    const calls: number[] = [];
    let retryAfter = '600';
    const impl = (async () => {
      calls.push(now);
      return new Response('{}', { status: 429, headers: { 'Retry-After': retryAfter } });
    }) as unknown as typeof fetch;
    const read = claudeSource({
      login: login({ accessToken: 'tok', expiresAt: null }),
      baseUrl: 'https://api.test',
      fetch: impl,
      now: () => now,
      record: async () => null,
      minIntervalMs: minute,
    });
    await expect(read()).rejects.toThrow('429');
    now += 9 * minute;
    await expect(read()).rejects.toThrow('429');
    expect(calls).toHaveLength(1);
    retryAfter = '0';
    now += minute;
    await expect(read()).rejects.toThrow('429');
    expect(calls).toHaveLength(2);
    now += 30_000;
    await expect(read()).rejects.toThrow('429');
    expect(calls).toHaveLength(2);
  });

  it('does not ask while the status line record is fresh, and shows it without the old failure', async () => {
    let now = t0;
    let written = t0 - 600 * minute;
    const { impl, calls } = fakeFetch([{ status: 429 }, { status: 200, body: answer }]);
    const read = claudeSource({
      login: login({ accessToken: 'tok', expiresAt: null }),
      baseUrl: 'https://api.test',
      fetch: impl,
      now: () => now,
      record: async () => record(41, written),
      minIntervalMs: minute,
    });
    expect((await read())?.accountProblem).toContain('429');
    // Claude Code draws its status line: the record is current, so nothing is asked.
    now += 10 * minute;
    written = now - 5_000;
    const shown = await read();
    expect(calls).toHaveLength(1);
    expect(shown).toMatchObject({ source: 'statusline', accountProblem: null });
    expect(shown?.windows[0]?.usedPercent).toBe(41);
    // Claude Code closed: once the record is a minute old the account is asked again.
    now += minute;
    expect((await read())?.source).toBe('account');
    expect(calls).toHaveLength(2);
  });

  it('reads Retry-After in seconds or as a date', () => {
    expect(parseRetryAfter('120', t0)).toBe(120_000);
    expect(parseRetryAfter(new Date(t0 + 5 * minute).toUTCString(), t0)).toBe(5 * minute);
    expect(parseRetryAfter(null, t0)).toBeNull();
    expect(parseRetryAfter('soon', t0)).toBeNull();
  });

  it('shows a status line record newer than the last account answer', async () => {
    let now = t0;
    let written = t0 - minute;
    const read = claudeSource({
      login: login(),
      baseUrl: 'https://api.test',
      fetch: fakeFetch([{ status: 200, body: answer }]).impl,
      now: () => now,
      record: async () => record(12, written),
      minIntervalMs: minute,
    });
    expect((await read())?.source).toBe('account');
    now += 20_000;
    written = now;
    const shown = await read();
    expect(shown?.source).toBe('statusline');
    expect(shown?.windows[0]?.usedPercent).toBe(12);
  });

  it('keeps the account answer when the record cannot be read', async () => {
    const read = claudeSource({
      login: login(),
      baseUrl: 'https://api.test',
      fetch: fakeFetch([{ status: 200, body: answer }]).impl,
      now: () => t0,
      record: async () => {
        throw new Error('broken');
      },
      minIntervalMs: minute,
    });
    expect((await read())?.source).toBe('account');
  });

  it('waits (수집 대기) with no login and no record; fails with the reason otherwise', async () => {
    const base = {
      baseUrl: 'https://api.test',
      now: () => t0,
      record: async () => null,
      minIntervalMs: minute,
    };
    const noLogin = claudeSource({ ...base, login: login(null), fetch: fakeFetch([{ status: 200 }]).impl });
    expect(await noLogin()).toBeNull();
    const recordOnly = claudeSource({
      ...base,
      record: async () => record(20, t0),
      login: login(null),
      fetch: fakeFetch([{ status: 200 }]).impl,
    });
    expect(await recordOnly()).toMatchObject({ source: 'statusline', accountProblem: null });
    const refused = claudeSource({ ...base, login: login(), fetch: fakeFetch([{ status: 401 }]).impl });
    await expect(refused()).rejects.toThrow('로그인을 받지 않았어요');
  });
});

describe('fileLogin', () => {
  it('reads the Keychain JSON shape, and no file means no login', async () => {
    const dir = tempDir();
    const file = join(dir, 'login.json');
    expect(await fileLogin(file)()).toBeNull();
    writeFileSync(file, JSON.stringify({ claudeAiOauth: { accessToken: 'abc', expiresAt: 5, scopes: [] } }));
    expect(await fileLogin(file)()).toEqual({ accessToken: 'abc', expiresAt: 5 });
    writeFileSync(file, '{ broken');
    await expect(fileLogin(file)()).rejects.toThrow('해석할 수 없어요');
  });
});
