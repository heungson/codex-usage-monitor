// 사용량 현황 (WF-S001) in the running app: LHS-5 and LHS-6 checks, LHS-3/4 read paths, LHS-9 alerts.
// Plan v3: the Codex 예정 리셋 area (FC-F008, FC-F011) and the «창 항상 위에 표시» switch (FC-F019).

import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import { codexLine } from '../test/helpers';
import {
  capture,
  clickUpcomingArea,
  launch,
  makeFixture,
  openedLinks,
  trayTitle,
  watchTray,
  type Fixture,
} from './app';
import { startFakeResets, type FakeServer } from './fake-resets-server';

const hour = 3_600_000;
let server: FakeServer;
let fixture: Fixture;

test.beforeEach(async () => {
  fixture = makeFixture();
  server = await startFakeResets(fixture.modeFile);
});
test.afterEach(async () => {
  await server.close();
});

function writeClaude(f: Fixture, five: number, seven: number, updatedAt = new Date(Date.now() - 3 * 60_000)) {
  writeFileSync(
    join(f.dataDir, 'claude-rate-limits.json'),
    JSON.stringify({
      version: 1,
      updatedAt: updatedAt.toISOString(),
      fiveHour: { usedPercentage: five, resetsAt: Date.now() + 2 * hour + 15 * 60_000 },
      sevenDay: { usedPercentage: seven, resetsAt: Date.now() + 3 * 24 * hour },
    }),
  );
}

function writeCodex(f: Fixture, primary: number, secondary: number | null = null) {
  const dir = join(f.codexSessions, '2026', '10', '28');
  mkdirSync(dir, { recursive: true });
  const resets = Math.floor((Date.now() + 4 * 24 * hour) / 1000);
  writeFileSync(
    join(dir, 'rollout-a.jsonl'),
    codexLine(
      new Date(Date.now() - 10 * 60_000).toISOString(),
      { used_percent: primary, window_minutes: 10080, resets_at: resets },
      secondary === null
        ? null
        : { used_percent: secondary, window_minutes: 300, resets_at: resets - 3 * 86_400 },
      'prolite',
    ) + '\n',
  );
}

const card = (page: import('@playwright/test').Page, cli: 'claude' | 'codex') =>
  page.locator(`section[data-cli="${cli}"]`);

test('both CLIs show their windows, reset times and the Claude Code update time (LHS-5 검증 1, LHS-6 검증 4)', async () => {
  writeClaude(fixture, 23, 61);
  writeCodex(fixture, 44, 12);
  const { app, page } = await launch(fixture, server.url);
  await expect(card(page, 'claude')).toContainText('5시간 한도');
  await expect(card(page, 'claude')).toContainText('23% 사용');
  await expect(card(page, 'claude')).toContainText('7일 한도');
  await expect(card(page, 'claude')).toContainText('61% 사용');
  await expect(card(page, 'claude')).toContainText('마지막 갱신');
  await expect(card(page, 'claude')).toContainText('3분 전');
  await expect(card(page, 'codex')).toContainText('7일 한도');
  await expect(card(page, 'codex')).toContainText('44% 사용');
  await expect(card(page, 'codex')).toContainText('5시간 한도');
  await expect(card(page, 'codex')).toContainText('요금제 prolite');
  // Both CLIs list the shorter window first: 5시간, then 7일 (owner, 2026-10-30).
  await expect(card(page, 'claude').locator('.window-name')).toHaveText(['5시간 한도', '7일 한도']);
  await expect(card(page, 'codex').locator('.window-name')).toHaveText(['5시간 한도', '7일 한도']);
  await capture(page, 'usage-both-ok');
  await app.close();
});

test('a CLI without a record shows 수집 대기 and the other keeps its values (LHS-5 검증 3, 4, LHS-6 검증 1, 2, 3)', async () => {
  writeCodex(fixture, 44);
  let { app, page } = await launch(fixture, server.url);
  await expect(card(page, 'claude')).toContainText('수집 대기');
  await expect(card(page, 'claude')).not.toContainText('0%');
  await expect(card(page, 'codex')).toContainText('44% 사용');
  await capture(page, 'usage-claude-waiting');
  await app.close();

  fixture = makeFixture();
  writeClaude(fixture, 23, 61);
  ({ app, page } = await launch(fixture, server.url));
  await expect(card(page, 'codex')).toContainText('수집 대기');
  await expect(card(page, 'claude')).toContainText('23% 사용');
  await capture(page, 'usage-codex-waiting');
  await app.close();

  fixture = makeFixture();
  ({ app, page } = await launch(fixture, server.url));
  await expect(card(page, 'claude')).toContainText('수집 대기');
  await expect(card(page, 'codex')).toContainText('수집 대기');
  await capture(page, 'usage-both-waiting');
  await app.close();
});

test('loading shows until the first read arrives (LHS-5 검증 2, LHS-6 검증 7)', async () => {
  writeClaude(fixture, 23, 61);
  writeCodex(fixture, 44);
  const { app, page } = await launch(fixture, server.url, { ULM_READ_DELAY_MS: '4000' });
  await expect(card(page, 'claude')).toContainText('불러오는 중');
  await expect(card(page, 'codex')).toContainText('불러오는 중');
  await capture(page, 'usage-loading');
  await expect(card(page, 'claude')).toContainText('23% 사용', { timeout: 15_000 });
  await app.close();
});

test('a failed area keeps its last value as not current, and 다시 시도 recovers it (LHS-5 검증 5, 6, LHS-6 검증 5, 6, 8)', async () => {
  writeClaude(fixture, 23, 61);
  writeCodex(fixture, 44);
  const { app, page } = await launch(fixture, server.url);
  await expect(card(page, 'claude')).toContainText('23% 사용');

  const record = join(fixture.dataDir, 'claude-rate-limits.json');
  chmodSync(record, 0o000);
  await card(page, 'claude').getByRole('button', { name: '다시 시도' }).or(page.locator('x')).count();
  await page.evaluate(() => window.monitor.retry('claude'));
  await expect(card(page, 'claude')).toContainText('최신 정보 아님');
  await expect(card(page, 'claude')).toContainText('권한이 없어요');
  await expect(card(page, 'claude')).toContainText('23% 사용');
  await expect(card(page, 'codex')).toContainText('정상');
  await capture(page, 'usage-claude-stale');

  const sessionFile = join(fixture.codexSessions, '2026', '10', '28', 'rollout-a.jsonl');
  chmodSync(sessionFile, 0o000);
  await page.evaluate(() => window.monitor.retry('codex'));
  await expect(card(page, 'codex')).toContainText('최신 정보 아님');
  await expect(page.getByText('두 CLI의 기록을 모두 읽지 못했어요')).toBeVisible();
  await capture(page, 'usage-both-failed');

  chmodSync(record, 0o644);
  writeClaude(fixture, 30, 62);
  await card(page, 'claude').getByRole('button', { name: '다시 시도' }).click();
  await expect(card(page, 'claude')).toContainText('30% 사용');
  await expect(card(page, 'claude')).toContainText('정상');
  await expect(card(page, 'codex')).toContainText('최신 정보 아님');
  chmodSync(sessionFile, 0o644);
  await app.close();
});

test('a Codex first read without permission shows 확인 불가, not 수집 대기 (LHS-4 검증 7, LHS-6 검증 9)', async () => {
  writeClaude(fixture, 23, 61);
  writeCodex(fixture, 44);
  const sessionFile = join(fixture.codexSessions, '2026', '10', '28', 'rollout-a.jsonl');
  chmodSync(sessionFile, 0o000);
  const { app, page } = await launch(fixture, server.url);
  await expect(card(page, 'codex')).toContainText('확인 불가');
  await expect(card(page, 'codex')).toContainText('세션 기록을 읽을 권한이 없어요');
  await expect(card(page, 'codex')).not.toContainText('% 사용');
  await expect(card(page, 'codex')).not.toContainText('수집 대기');
  await expect(card(page, 'claude')).toContainText('23% 사용');
  await capture(page, 'usage-codex-unavailable');
  chmodSync(sessionFile, 0o644);
  await app.close();
});

test('the automatic re-read after a failure shows 자동 재시도 중, like the reset areas (LHS-6 검증 10)', async () => {
  writeClaude(fixture, 23, 61);
  writeCodex(fixture, 44);
  const { app, page } = await launch(fixture, server.url, {
    ULM_READ_INTERVAL_MS: '3000',
    ULM_READ_DELAY_MS: '2000',
  });
  await expect(card(page, 'claude')).toContainText('23% 사용', { timeout: 10_000 });
  const record = join(fixture.dataDir, 'claude-rate-limits.json');
  chmodSync(record, 0o000);
  await expect(card(page, 'claude')).toContainText('자동으로 다시 시도해요 · 다음 시도', { timeout: 10_000 });
  await expect(card(page, 'claude')).toContainText('자동 재시도 중', { timeout: 10_000 });
  await expect(card(page, 'claude').locator('.chip')).toHaveText('최신 정보 아님');
  await expect(card(page, 'codex')).toContainText('44% 사용');
  await capture(page, 'usage-claude-retrying');
  chmodSync(record, 0o644);
  await expect(card(page, 'claude')).toContainText('정상', { timeout: 10_000 });
  await app.close();
});

test('the open screen re-reads every 30 s by its own timer, and retries a failed area (LHS-5 검증 8, 10)', async () => {
  test.setTimeout(180_000);
  writeClaude(fixture, 23, 61);
  writeCodex(fixture, 44);
  // The background re-read is pushed out to an hour: only the screen's 30-second timer can read now.
  const { app, page } = await launch(fixture, server.url, { ULM_READ_INTERVAL_MS: '3600000' });
  await expect(card(page, 'claude')).toContainText('23% 사용');
  writeClaude(fixture, 35, 63);
  await expect(card(page, 'claude')).toContainText('35% 사용', { timeout: 35_000 });
  const record = join(fixture.dataDir, 'claude-rate-limits.json');
  chmodSync(record, 0o000);
  await expect(card(page, 'claude')).toContainText('최신 정보 아님', { timeout: 35_000 });
  chmodSync(record, 0o644);
  writeClaude(fixture, 40, 63);
  await expect(card(page, 'claude')).toContainText('40% 사용', { timeout: 35_000 });
  await expect(card(page, 'claude').locator('.chip')).toHaveText('정상');
  await app.close();
});

test('a first failure shows 확인 불가 without values (LHS-5 검증 9, LHS-6 검증 9, LHS-3 검증 9)', async () => {
  writeFileSync(join(fixture.dataDir, 'claude-rate-limits.json'), '{"version":1,');
  writeCodex(fixture, 44);
  const { app, page } = await launch(fixture, server.url);
  await expect(card(page, 'claude')).toContainText('확인 불가');
  await expect(card(page, 'claude')).toContainText('손상');
  await expect(card(page, 'claude')).not.toContainText('% 사용');
  await expect(card(page, 'claude')).not.toContainText('수집 대기');
  await expect(card(page, 'codex')).toContainText('44% 사용');
  await capture(page, 'usage-claude-unavailable');
  await app.close();
});

test('values refresh on their own while open, and a failed area recovers without a click (LHS-5 검증 8, 10, LHS-3 검증 7, 8, LHS-4 검증 5)', async () => {
  writeClaude(fixture, 23, 61);
  writeCodex(fixture, 44);
  const { app, page } = await launch(fixture, server.url, { ULM_READ_INTERVAL_MS: '2000' });
  await expect(card(page, 'claude')).toContainText('23% 사용');
  writeClaude(fixture, 35, 63);
  await expect(card(page, 'claude')).toContainText('35% 사용', { timeout: 10_000 });

  const sessionFile = join(fixture.codexSessions, '2026', '10', '28', 'rollout-a.jsonl');
  writeFileSync(sessionFile, '{"timestamp":"2026-10-28T01:00:00Z","payload":{"rate_limits":{broken\n');
  await expect(card(page, 'codex')).toContainText('해석할 수 없어요', { timeout: 10_000 });
  await expect(card(page, 'codex')).toContainText('최신 정보 아님');
  writeCodex(fixture, 50);
  await expect(card(page, 'codex')).toContainText('50% 사용', { timeout: 10_000 });
  await app.close();
});

test('«새로 고침» re-reads both records and asks for the reset status at once (developer 2026-11-03)', async () => {
  writeClaude(fixture, 23, 61);
  writeCodex(fixture, 44);
  // Long intervals, so only the click can explain a change within the short timeouts below.
  const { app, page } = await launch(fixture, server.url, {
    ULM_READ_INTERVAL_MS: '3600000',
    ULM_RESET_CHECK_MS: '3600000',
  });
  await expect(card(page, 'claude')).toContainText('23% 사용');
  const statusCalls = () => server.requests.filter((r) => r.startsWith('GET /api/v1/status')).length;
  const before = statusCalls();
  writeClaude(fixture, 35, 63);
  writeCodex(fixture, 50);
  await capture(page, 'usage-refresh-button');
  await page.getByRole('button', { name: '새로 고침', exact: true }).click();
  await expect(card(page, 'claude')).toContainText('35% 사용', { timeout: 3_000 });
  await expect(card(page, 'codex')).toContainText('50% 사용', { timeout: 3_000 });
  await expect.poll(statusCalls, { timeout: 3_000 }).toBe(before + 1);
  await expect(page.getByRole('button', { name: '새로 고침', exact: true })).toBeVisible();
  // Only the usage screen has it; the others fetch when they open.
  await page.getByRole('button', { name: /Claude Code 연동 안내/ }).click();
  await expect(page.getByRole('button', { name: '새로 고침', exact: true })).toHaveCount(0);
  await app.close();
});

/** A local stand-in for Anthropic's usage endpoint; `reply` decides each answer. */
async function fakeAccount(reply: () => { status: number; body?: unknown }) {
  const auth: string[] = [];
  const server = createServer((req, res) => {
    auth.push(String(req.headers.authorization));
    const { status, body } = reply();
    res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body ?? {}));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { url, auth, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

test('Claude Code limits come from the account without a session, and fall back to the record with the reason (developer 2026-11-03)', async () => {
  writeClaude(fixture, 35, 100, new Date(Date.now() - 20 * hour));
  writeCodex(fixture, 44);
  writeFileSync(
    fixture.claudeLoginFile,
    JSON.stringify({ claudeAiOauth: { accessToken: 'test-token', expiresAt: Date.now() + hour } }),
  );
  let status = 200;
  const iso = (ms: number) => new Date(ms).toISOString();
  const account = await fakeAccount(() => ({
    status,
    body: {
      five_hour: { utilization: 10.0, resets_at: iso(Date.now() + 4 * hour) },
      seven_day: { utilization: 36.0, resets_at: iso(Date.now() + 5 * 24 * hour) },
    },
  }));
  try {
    const { app, page } = await launch(fixture, server.url, {
      ULM_CLAUDE_API_BASE_URL: account.url,
      ULM_CLAUDE_API_INTERVAL_MS: '1000',
      ULM_READ_INTERVAL_MS: '1000',
    });
    await watchTray(app, page);
    await expect(card(page, 'claude')).toContainText('10% 사용');
    await expect(card(page, 'claude')).toContainText('36% 사용');
    await expect(card(page, 'claude')).toContainText('· Anthropic 계정');
    await expect(card(page, 'claude')).toContainText('정상');
    await expect.poll(() => trayTitle(app)).toMatch(/^CC 10\/36% /);
    expect(account.auth[0]).toBe('Bearer test-token');
    await capture(page, 'usage-claude-account');

    status = 401;
    await expect(card(page, 'claude')).toContainText('35% 사용', { timeout: 10_000 });
    await expect(card(page, 'claude')).toContainText('계정에서 받지 못했어요');
    await expect(card(page, 'claude')).toContainText('계정 조회 실패');
    await capture(page, 'usage-claude-account-refused');

    // A 429 with the record to show is a pause: 정상, and a quiet line with when it asks next.
    status = 429;
    await expect(card(page, 'claude')).toContainText('잠시 조회를 막았어요 (429)', { timeout: 10_000 });
    await expect(card(page, 'claude')).toContainText('정상');
    await expect(card(page, 'claude')).not.toContainText('계정 조회 실패');
    await expect(card(page, 'claude')).not.toContainText('계정에서 받지 못했어요');
    await capture(page, 'usage-claude-account-paused');

    // Still paused, and the record's 5시간 reset has passed (developer, 2026-11-05: it kept 71%
    // while Anthropic showed 0%): that window reads 0% and says it reset; 7일 keeps its value.
    writeFileSync(
      join(fixture.dataDir, 'claude-rate-limits.json'),
      JSON.stringify({
        version: 1,
        updatedAt: new Date(Date.now() - 8 * 60_000).toISOString(),
        fiveHour: { usedPercentage: 71, resetsAt: Date.now() - 5 * 60_000 },
        sevenDay: { usedPercentage: 60, resetsAt: Date.now() + 4 * 24 * hour },
      }),
    );
    await expect(card(page, 'claude')).toContainText('에 리셋됨 · 새 기록을 기다려요', { timeout: 10_000 });
    await expect(card(page, 'claude').locator('.window').first()).toContainText('0% 사용');
    await expect(card(page, 'claude')).toContainText('60% 사용');
    await expect(card(page, 'claude')).not.toContainText('71%');
    await expect.poll(() => trayTitle(app), { timeout: 10_000 }).toMatch(/^CC 0\/60% /);
    await capture(page, 'usage-claude-reset-passed');
    await app.close();
  } finally {
    await account.close();
  }
});

const mode = (value: object) =>
  writeFileSync(fixture.modeFile, JSON.stringify({ status: 'ok', history: 'ok', ...value }));
const upcoming = (page: import('@playwright/test').Page) => page.locator('section[data-area="upcoming"]');

test('the two entries open their screens; no separate reset button (LHS-5 검증 7, v3 WF-S001)', async () => {
  const { app, page } = await launch(fixture, server.url);
  await page.getByRole('button', { name: /Claude Code 연동 안내/ }).click();
  await expect(page.locator('h1')).toHaveText('Claude Code 연동 안내');
  await page.getByRole('button', { name: '사용량 현황으로 돌아가기' }).click();
  await expect(page.locator('h1')).toHaveText('사용량 현황');
  await expect(page.locator('nav, button:text-is("Codex 전체 리셋")')).toHaveCount(0);
  await expect(upcoming(page)).toContainText('예정 리셋 없음');
  // Opening the reset screen checks the status again (LHS-7 검증 8).
  const statusCalls = () => server.requests.filter((r) => r.startsWith('GET /api/v1/status')).length;
  const before = statusCalls();
  await clickUpcomingArea(page);
  await expect(page.locator('h1')).toHaveText('Codex 전체 리셋');
  await expect.poll(statusCalls).toBe(before + 1);
  await app.close();
});

test('the 예정 리셋 area shows the scheduled reset only, and opens the reset screen in every state (v3 FC-F008, FC-F011)', async () => {
  writeCodex(fixture, 44);
  mode({ status: 'scheduled' });
  let { app, page } = await launch(fixture, server.url, { ULM_RESET_CHECK_MS: '3600000' });
  // Right under the Codex card.
  await expect(page.locator('main > section').nth(2)).toHaveAttribute('data-area', 'upcoming');
  await expect(upcoming(page)).toContainText('전체 리셋 예정');
  await expect(upcoming(page)).toContainText('We are resetting Codex usage limits');
  // Recent reset, average interval and history are for the reset screen only.
  await expect(upcoming(page)).not.toContainText('평균');
  await expect(upcoming(page)).not.toContainText('최근');
  await expect(page.locator('main')).not.toContainText('이력');
  await capture(page, 'usage-upcoming-scheduled');
  await upcoming(page).getByRole('button', { name: 'codex-resets.com' }).click();
  expect(await openedLinks(app)).toEqual(['https://codex-resets.com']);
  await expect(page.locator('h1')).toHaveText('사용량 현황');
  await clickUpcomingArea(page);
  await expect(page.locator('h1')).toHaveText('Codex 전체 리셋');
  await app.close();

  // 결과 없음 still opens it. (The fake server reads the first fixture's mode file, so it is reused.)
  mode({ status: 'empty' });
  ({ app, page } = await launch(fixture, server.url, { ULM_RESET_CHECK_MS: '3600000' }));
  await expect(upcoming(page)).toContainText('예정 리셋 정보 없음');
  await clickUpcomingArea(page);
  await expect(page.locator('h1')).toHaveText('Codex 전체 리셋');
  await app.close();

  // A failure without a value: retries on its own, offers 다시 시도, and still opens the reset screen.
  mode({ status: 'fail' });
  ({ app, page } = await launch(fixture, server.url, {
    ULM_RESET_CHECK_MS: '3600000',
    ULM_RESET_RETRY_MS: '60000',
  }));
  await expect(upcoming(page)).toContainText('예정 리셋을 불러오지 못했어요');
  await expect(upcoming(page)).toContainText('불러오기 실패');
  await expect(upcoming(page)).toContainText('자동으로 다시 시도해요 (1번 중 1번째)');
  await capture(page, 'usage-upcoming-failed');
  // Failed with no value: still no separate button and none of the reset screen's data, and the area opens it.
  await expect(page.getByRole('button', { name: 'Codex 전체 리셋 자세히 보기' })).toHaveCount(1);
  for (const word of ['최근 전체 리셋', '평균', '이력'])
    await expect(page.locator('main')).not.toContainText(word);
  const statusCalls = () => server.requests.filter((r) => r.startsWith('GET /api/v1/status')).length;
  const before = statusCalls();
  await clickUpcomingArea(page);
  await expect(page.locator('h1')).toHaveText('Codex 전체 리셋');
  await expect.poll(statusCalls).toBe(before + 1);
  await page.getByRole('button', { name: '사용량 현황으로 돌아가기' }).click();
  await expect(upcoming(page)).toContainText('예정 리셋을 불러오지 못했어요');
  mode({ status: 'scheduled' });
  await upcoming(page).getByRole('button', { name: '다시 시도' }).click();
  await expect(page.locator('h1')).toHaveText('사용량 현황');
  await expect(upcoming(page)).toContainText('전체 리셋 예정');
  // A failure after a success keeps the last value, marked as not current.
  mode({ status: 'fail' });
  await page.evaluate(() => window.monitor.retryResets('status'));
  await expect(upcoming(page)).toContainText('최신 정보 아님');
  await expect(upcoming(page)).toContainText('전체 리셋 예정');
  await capture(page, 'usage-upcoming-stale');
  await clickUpcomingArea(page);
  await expect(page.locator('h1')).toHaveText('Codex 전체 리셋');
  await app.close();
});

test('the 예정 리셋 area itself takes the keyboard; › is only a sign (LHS-5 검증 11, planner 2026-10-30)', async () => {
  const { app, page } = await launch(fixture, server.url, { ULM_RESET_CHECK_MS: '3600000' });
  await expect(upcoming(page)).toContainText('예정 리셋 없음');
  const open = page.getByRole('button', { name: 'Codex 전체 리셋 자세히 보기' });
  await expect(open).toHaveCount(1);
  // The button is the area: it covers the whole card.
  const [area, button] = [await upcoming(page).boundingBox(), await open.boundingBox()];
  expect(button).toEqual(area);
  // › is not a control.
  await expect(upcoming(page).locator('.chevron')).toHaveAttribute('aria-hidden', 'true');
  expect(
    await upcoming(page)
      .locator('.chevron')
      .evaluate((el) => el.closest('button')),
  ).toBeNull();
  // Reached with Tab, opened with Enter, and again with Space.
  await page.getByRole('switch', { name: '창 항상 위에 표시' }).focus();
  for (let i = 0; i < 30; i++) {
    if (await open.evaluate((el) => el === document.activeElement)) break;
    await page.keyboard.press('Tab');
  }
  await expect(open).toBeFocused();
  await capture(page, 'usage-upcoming-focused');
  await page.keyboard.press('Enter');
  await expect(page.locator('h1')).toHaveText('Codex 전체 리셋');
  await page.getByRole('button', { name: '사용량 현황으로 돌아가기' }).click();
  await open.focus();
  await page.keyboard.press('Space');
  await expect(page.locator('h1')).toHaveText('Codex 전체 리셋');
  await app.close();
});

test('opening the usage screen asks for the status only when the last success is 5 minutes old (owner 2026-10-30)', async () => {
  const { app, page } = await launch(fixture, server.url, { ULM_RESET_CHECK_MS: '3600000' });
  await expect(upcoming(page)).toContainText('예정 리셋 없음');
  const statusCalls = () => server.requests.filter((r) => r.startsWith('GET /api/v1/status')).length;
  expect(statusCalls()).toBe(1);
  await page.getByRole('button', { name: /Claude Code 연동 안내/ }).click();
  await page.getByRole('button', { name: '사용량 현황으로 돌아가기' }).click();
  await page.waitForTimeout(1000);
  expect(statusCalls()).toBe(1);
  await app.close();
});

test('«창 항상 위에 표시» is one switch on all three screens, off at first, kept across restarts (v3 FC-F019)', async () => {
  const isOnTop = (app: import('@playwright/test').ElectronApplication) =>
    app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isAlwaysOnTop());
  const pin = (page: import('@playwright/test').Page) =>
    page.getByRole('switch', { name: '창 항상 위에 표시' });
  let { app, page } = await launch(fixture, server.url);
  await expect(pin(page)).not.toBeChecked();
  expect(await isOnTop(app)).toBe(false);
  await capture(page, 'usage-pin-off');
  await pin(page).check({ force: true });
  await expect(pin(page)).toBeChecked();
  expect(await isOnTop(app)).toBe(true);
  await capture(page, 'usage-pin-on');
  await page.getByRole('button', { name: /Claude Code 연동 안내/ }).click();
  await expect(pin(page)).toBeChecked();
  await page.getByRole('button', { name: '사용량 현황으로 돌아가기' }).click();
  await clickUpcomingArea(page);
  await expect(page.locator('h1')).toHaveText('Codex 전체 리셋');
  await expect(pin(page)).toBeChecked();
  await app.close();

  expect(existsSync(join(fixture.dataDir, 'window-settings.json'))).toBe(true);
  ({ app, page } = await launch(fixture, server.url));
  await expect(pin(page)).toBeChecked();
  expect(await isOnTop(app)).toBe(true);
  // Turned off on another screen, it is off everywhere and after a restart.
  await clickUpcomingArea(page);
  await pin(page).uncheck({ force: true });
  await expect(pin(page)).not.toBeChecked();
  expect(await isOnTop(app)).toBe(false);
  await app.close();
  ({ app, page } = await launch(fixture, server.url));
  await expect(pin(page)).not.toBeChecked();
  await app.close();
});

test('pinned, the top bar drags the window; unpinned, or on the switch, it does not (FC-F019; developer 2026-11-05)', async () => {
  const position = (app: import('@playwright/test').ElectronApplication) =>
    app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.getPosition());
  const { app, page } = await launch(fixture, server.url);
  const drag = async (selector: string) => {
    const box = (await page.locator(selector).first().boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 60, y + 40);
    await page.mouse.up();
  };
  // The window is placed on the development display once shown: wait until it stays put.
  let start = await position(app);
  await expect
    .poll(async () => {
      const before = start;
      await page.waitForTimeout(300);
      start = await position(app);
      return start.join() === before.join();
    })
    .toBe(true);
  await drag('h1');
  expect(await position(app)).toEqual(start);

  const pin = page.getByRole('switch', { name: '창 항상 위에 표시' });
  await pin.check({ force: true });
  await expect(page.locator('body')).toHaveClass(/pinned/);
  await drag('h1');
  await expect.poll(() => position(app)).toEqual([start[0]! + 60, start[1]! + 40]);
  const moved = await position(app);
  // The buttons and the switch keep their clicks; pressing them moves nothing.
  await drag('.topbar label');
  expect(await position(app)).toEqual(moved);
  await expect(page.locator('body')).not.toHaveClass(/dragging/);
  await app.close();
});

test('limit alerts: 80% notifies once per window; a refusal is explained (LHS-9 검증 1–4)', async () => {
  writeClaude(fixture, 79, 10);
  writeCodex(fixture, 20);
  const { app, page } = await launch(fixture, server.url, {
    ULM_READ_INTERVAL_MS: '1500',
    ULM_NOTIFICATION_APP_NAME: 'Usage Limit Monitor',
  });
  await expect(card(page, 'claude')).toContainText('79% 사용');
  const log = () => {
    try {
      return readFileSync(join(fixture.dataDir, 'notifications.log'), 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l));
    } catch {
      return [];
    }
  };
  expect(log()).toHaveLength(0);
  writeClaude(fixture, 80, 10);
  await expect(card(page, 'claude')).toContainText('80% 사용', { timeout: 10_000 });
  await expect.poll(() => log().length, { timeout: 10_000 }).toBe(1);
  expect(log()[0].title).toBe('Claude Code 5시간 한도 80% 사용');
  writeClaude(fixture, 79, 10);
  await expect(card(page, 'claude')).toContainText('79% 사용', { timeout: 10_000 });
  writeClaude(fixture, 81, 10);
  await expect(card(page, 'claude')).toContainText('81% 사용', { timeout: 10_000 });
  expect(log()).toHaveLength(1);

  writeFileSync(fixture.notifyFile, 'denied');
  writeCodex(fixture, 85);
  await expect(page.getByText('macOS 알림이 꺼져 있어')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('시스템 설정 › 알림 › Usage Limit Monitor')).toBeVisible();
  await capture(page, 'usage-alert-denied');
  await page.waitForTimeout(4000);
  expect(log().filter((n) => n.title.startsWith('Codex'))).toHaveLength(1);
  await app.close();
});

test('the menu bar title counts down to a scheduled reset from the shared status (LHS-5 검증 12, 13, 15, 16, 22, LHS-7 검증 9)', async () => {
  writeClaude(fixture, 92, 84);
  writeCodex(fixture, 44, 12);
  const { app, page } = await launch(fixture, server.url, { ULM_RESET_CHECK_MS: '1500' });
  await expect(card(page, 'codex')).toContainText('44% 사용');
  await watchTray(app, page);
  await expect.poll(() => trayTitle(app)).toBe('CC 92/84% · CX 12/44%');

  // The background check alone brings the scheduled reset: no screen is opened (LHS-7 검증 9).
  mode({ status: 'scheduled' });
  await expect.poll(() => trayTitle(app), { timeout: 10_000 }).toBe('CC 92/84% · CX 12/44% · ↻ 2일');
  await expect(upcoming(page)).toContainText('전체 리셋 예정');
  const dueText = (scheduledInMs: number) => {
    const due = new Date(Date.now() + scheduledInMs);
    return `${due.getMonth() + 1}월 ${due.getDate()}일`;
  };
  await expect(upcoming(page)).toContainText(dueText((2 * 24 + 23.5) * hour));
  await capture(page, 'usage-upcoming-due');

  // A new scheduled time reaches the title and the screen together (LHS-5 검증 16).
  mode({ status: 'scheduled', scheduledInMs: 5 * hour + 30 * 60_000 });
  await expect.poll(() => trayTitle(app), { timeout: 10_000 }).toBe('CC 92/84% · CX 12/44% · ↻ 5시간');
  // The screen shows the due time the title counts to (within the minute the check ran in).
  const clocks = [0, -60_000].map((off) => {
    const due = new Date(Date.now() + 5 * hour + 30 * 60_000 + off);
    return `${String(due.getHours()).padStart(2, '0')}:${String(due.getMinutes()).padStart(2, '0')}`;
  });
  await expect(upcoming(page)).toContainText(new RegExp(clocks.join('|')));

  // No scheduled reset, then a failed check with a last good value: no suffix (LHS-5 검증 13).
  mode({ status: 'ok' });
  await expect.poll(() => trayTitle(app), { timeout: 10_000 }).toBe('CC 92/84% · CX 12/44%');
  mode({ status: 'scheduled' });
  await expect.poll(() => trayTitle(app), { timeout: 10_000 }).toBe('CC 92/84% · CX 12/44% · ↻ 2일');
  mode({ status: 'fail' });
  await expect.poll(() => trayTitle(app), { timeout: 10_000 }).toBe('CC 92/84% · CX 12/44%');
  await expect(upcoming(page)).toContainText('최신 정보 아님');

  // A scheduled reset with no time: shown in the 예정 리셋 area, no suffix in the title (LHS-5 검증 22).
  // The area settles first (the title had no suffix already, after the failure); then the title.
  mode({ status: 'scheduled', scheduledInMs: null });
  await expect(upcoming(page)).not.toContainText('최신 정보 아님', { timeout: 10_000 });
  await expect(upcoming(page)).toContainText('전체 리셋 예정');
  expect(await trayTitle(app)).toBe('CC 92/84% · CX 12/44%');
  // Two more checks (1.5 s apart) with the same answer still add none.
  await page.waitForTimeout(3500);
  expect(await trayTitle(app)).toBe('CC 92/84% · CX 12/44%');

  // Due in a few seconds while the next check is still on its way: gone at the reset time (LHS-5 검증 15).
  mode({ status: 'scheduled', scheduledInMs: 6000 });
  await expect.poll(() => trayTitle(app), { timeout: 10_000 }).toBe('CC 92/84% · CX 12/44% · ↻ 1분 미만');
  mode({ status: 'scheduled', scheduledInMs: 6000, delayMs: 20_000 });
  await expect.poll(() => trayTitle(app), { timeout: 10_000 }).toBe('CC 92/84% · CX 12/44%');
  await app.close();
});

test('the menu bar title shows both windows of each CLI, one when only one is recorded, and each CLI its own sign (LHS-5 검증 19, 20, 21)', async () => {
  writeCodex(fixture, 44, 12);
  const { app, page } = await launch(fixture, server.url, {
    ULM_READ_INTERVAL_MS: '2000',
    ULM_RESET_CHECK_MS: '3600000',
  });
  await expect(card(page, 'codex')).toContainText('44% 사용');
  await watchTray(app, page);
  // No Claude Code record: «–» for it only (검증 21).
  await expect.poll(() => trayTitle(app)).toBe('CC – · CX 12/44%');

  // With the screen closed the title still follows the records (검증 19, 20).
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.hide());
  writeClaude(fixture, 92, 84);
  await expect.poll(() => trayTitle(app), { timeout: 10_000 }).toBe('CC 92/84% · CX 12/44%');
  writeCodex(fixture, 30);
  await expect.poll(() => trayTitle(app), { timeout: 10_000 }).toBe('CC 92/84% · CX 30%');

  // A Claude Code read that fails with a last good value: «?» for it only (검증 21).
  const record = join(fixture.dataDir, 'claude-rate-limits.json');
  chmodSync(record, 0o000);
  await expect.poll(() => trayTitle(app), { timeout: 10_000 }).toBe('CC 92/84%? · CX 30%');
  chmodSync(record, 0o644);
  await expect.poll(() => trayTitle(app), { timeout: 10_000 }).toBe('CC 92/84% · CX 30%');
  await app.close();
});
