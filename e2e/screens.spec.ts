// Claude Code 연동 안내 (WF-S002, LHS-2) and Codex 전체 리셋 (WF-S003, LHS-7, LHS-8) in the running app,
// plus new-reset notifications (LHS-10).

import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { statusLineInput } from '../test/helpers';
import { capture, launch, makeFixture, openedLinks, type Fixture } from './app';
import { startFakeResets, type FakeServer } from './fake-resets-server';

let server: FakeServer;
let fixture: Fixture;

test.beforeEach(async () => {
  fixture = makeFixture();
  server = await startFakeResets(fixture.modeFile);
});
test.afterEach(async () => {
  await server.close();
});

const mode = (value: object) =>
  writeFileSync(fixture.modeFile, JSON.stringify({ status: 'ok', history: 'ok', ...value }));

/** Runs the status line command exactly as Claude Code would: through the shell, input on stdin. */
function runStatusLine(command: string, input: string) {
  return spawnSync('/bin/sh', ['-c', command], { input, encoding: 'utf8' });
}

async function openSetup(page: Page) {
  await page.getByRole('button', { name: /Claude Code 연동 안내/ }).click();
  await expect(page.locator('h1')).toHaveText('Claude Code 연동 안내');
}

test('apply keeps the existing status line command, which still runs (LHS-2 검증 1)', async () => {
  writeFileSync(
    fixture.claudeSettings,
    JSON.stringify({ model: 'opus', statusLine: { type: 'command', command: 'echo "my line"' } }, null, 2),
  );
  const { app, page } = await launch(fixture, server.url);
  await openSetup(page);
  await expect(page.getByText('echo "my line"')).toBeVisible();
  await expect(page.getByText('연동 안 됨')).toBeVisible();
  await capture(page, 'setup-before');
  await page.getByRole('button', { name: '연동 적용' }).click();
  await expect(page.getByText('기존 상태 표시줄 명령도 이어서 실행돼요')).toBeVisible();
  await expect(page.getByRole('button', { name: '연동됨' })).toBeDisabled();
  await capture(page, 'setup-applied');

  const settings = JSON.parse(readFileSync(fixture.claudeSettings, 'utf8'));
  expect(settings.model).toBe('opus');
  const result = runStatusLine(
    settings.statusLine.command,
    statusLineInput(
      { used_percentage: 33, resets_at: Math.floor(Date.now() / 1000) + 3600 },
      { used_percentage: 70, resets_at: Math.floor(Date.now() / 1000) + 86400 },
    ),
  );
  expect(result.stdout.trim()).toBe('my line');

  await page.getByRole('button', { name: '사용량 현황으로 돌아가기' }).click();
  await expect(page.locator('section[data-cli="claude"]')).toContainText('33% 사용', { timeout: 10_000 });
  await expect(page.locator('section[data-cli="claude"]')).toContainText('70% 사용');
  await app.close();
});

test('apply without an existing command shows the result on the same screen (LHS-2 검증 2)', async () => {
  const { app, page } = await launch(fixture, server.url);
  await openSetup(page);
  await expect(page.getByText('지금 설정된 상태 표시줄 명령은 없어요')).toBeVisible();
  await page.getByRole('button', { name: '연동 적용' }).click();
  await expect(
    page.getByText('연동했어요. Claude Code가 다음에 상태 표시줄을 그릴 때부터 기록돼요.'),
  ).toBeVisible();
  await expect(page.locator('h1')).toHaveText('Claude Code 연동 안내');
  await app.close();
});

test('a failed apply is rolled back and explained, and 돌아가기 works (LHS-2 검증 5, 6)', async () => {
  const original = JSON.stringify({ statusLine: { type: 'command', command: 'echo keep' } });
  writeFileSync(fixture.claudeSettings, original);
  chmodSync(fixture.claudeSettings, 0o444);
  const { app, page } = await launch(fixture, server.url);
  await openSetup(page);
  await page.getByRole('button', { name: '연동 적용' }).click();
  await expect(page.getByText(/연동하지 못했어요/)).toBeVisible();
  await expect(page.getByText(/적용 전 상태 그대로예요/)).toBeVisible();
  expect(readFileSync(fixture.claudeSettings, 'utf8')).toBe(original);
  await capture(page, 'setup-failed');
  await page.getByRole('button', { name: '사용량 현황으로 돌아가기' }).click();
  await expect(page.locator('h1')).toHaveText('사용량 현황');
  chmodSync(fixture.claudeSettings, 0o644);
  await app.close();
});

test('a record that cannot be written after applying shows on the setup screen (LHS-2 검증 9)', async () => {
  const { app, page } = await launch(fixture, server.url);
  await openSetup(page);
  await page.getByRole('button', { name: '연동 적용' }).click();
  await expect(page.getByRole('button', { name: '연동됨' })).toBeVisible();
  const command = JSON.parse(readFileSync(fixture.claudeSettings, 'utf8')).statusLine.command;
  const input = statusLineInput(
    { used_percentage: 10, resets_at: Math.floor(Date.now() / 1000) + 3600 },
    null,
  );
  runStatusLine(command, input);
  const record = join(fixture.dataDir, 'claude-rate-limits.json');
  chmodSync(record, 0o444);
  runStatusLine(command, input);
  expect(existsSync(join(fixture.dataDir, 'claude-hook-error.json'))).toBe(true);
  await page.getByRole('button', { name: '사용량 현황으로 돌아가기' }).click();
  await openSetup(page);
  await expect(
    page.getByText(/한도 기록을 남기지 못했어요: .*claude-rate-limits\.json에 쓸 권한이 없어요/),
  ).toBeVisible();
  await capture(page, 'setup-hook-error');
  chmodSync(record, 0o644);
  await app.close();
});

async function openResets(page: Page) {
  await page.getByRole('button', { name: /Codex 전체 리셋/ }).click();
  await expect(page.locator('h1')).toHaveText('Codex 전체 리셋');
}

const statusCard = (page: Page) => page.locator('section[data-area="status"]');
const historyCard = (page: Page) => page.locator('section[data-area="history"]');

test('status and history load on open, without polling, from the keyless API (LHS-7 검증 1, 2, 3, LHS-8 검증 1, 2)', async () => {
  mode({ delayMs: 1500 });
  const { app, page } = await launch(fixture, server.url, { ULM_RESET_CHECK_MS: '3600000' });
  await openResets(page);
  await expect(statusCard(page)).toContainText('불러오는 중');
  await expect(historyCard(page)).toContainText('불러오는 중');
  await capture(page, 'resets-loading');
  await expect(statusCard(page)).toContainText('최근 리셋');
  await expect(statusCard(page)).toContainText('예정된 리셋 없음');
  await expect(statusCard(page)).toContainText('약 6.0일');
  await expect(historyCard(page).locator('li')).toHaveCount(10);
  await capture(page, 'resets-ok');

  const before = server.requests.length;
  await page.waitForTimeout(5000);
  expect(server.requests.length).toBe(before);

  await historyCard(page).getByRole('button', { name: '이력 더 보기' }).click();
  await expect(historyCard(page).locator('li')).toHaveCount(14);
  await expect(historyCard(page)).toContainText('이력을 끝까지 불러왔어요');
  expect(server.requests.some((r) => r.includes('/api/v1/resets?') && r.includes('cursor=10'))).toBe(true);
  for (const r of server.requests) expect(r).toContain('auth=- cookie=-');
  await capture(page, 'resets-more');

  await page.getByRole('button', { name: 'codex-resets.com' }).click();
  await historyCard(page).getByRole('button', { name: '원문 공지' }).first().click();
  expect(await openedLinks(app)).toEqual([
    'https://codex-resets.com',
    'https://x.com/thsottiaux/status/2114588174249071110',
  ]);

  await page.getByRole('button', { name: '사용량 현황으로 돌아가기' }).click();
  await expect(page.locator('h1')).toHaveText('사용량 현황');

  // Reopening asks again and shows what the server says now (LHS-7 검증 1, LHS-8 검증 1).
  mode({ status: 'empty', history: 'empty' });
  await openResets(page);
  await expect(statusCard(page)).toContainText('결과 없음');
  await expect(historyCard(page)).toContainText('표시할 리셋 이력이 없어요');
  await app.close();
});

test('only the status failing keeps the history area as it is (LHS-7 검증 5)', async () => {
  const { app, page } = await launch(fixture, server.url, {
    ULM_RESET_CHECK_MS: '3600000',
    ULM_RESET_RETRY_MS: '60000',
  });
  await openResets(page);
  await expect(statusCard(page)).toContainText('최근 리셋');
  await page.getByRole('button', { name: '사용량 현황으로 돌아가기' }).click();
  mode({ status: 'fail' });
  await openResets(page);
  await expect(statusCard(page)).toContainText('최신 정보 아님');
  await expect(statusCard(page)).toContainText('503 오류');
  await expect(statusCard(page)).toContainText('최근 리셋');
  await expect(historyCard(page).locator('li')).toHaveCount(10);
  await expect(historyCard(page).locator('.chip.warn')).toHaveCount(0);
  await capture(page, 'resets-status-stale');
  await app.close();
});

test('empty results are shown as 결과 없음 (LHS-7 검증 4, LHS-8 검증 3)', async () => {
  mode({ status: 'empty', history: 'empty' });
  const { app, page } = await launch(fixture, server.url, { ULM_RESET_CHECK_MS: '3600000' });
  await openResets(page);
  await expect(statusCard(page)).toContainText('결과 없음');
  await expect(historyCard(page)).toContainText('표시할 리셋 이력이 없어요');
  await capture(page, 'resets-empty');
  await app.close();
});

test('a failing area keeps its last value, retries with growing gaps and stops (LHS-7 검증 5, 6, LHS-8 검증 4, 5)', async () => {
  const { app, page } = await launch(fixture, server.url, {
    ULM_RESET_CHECK_MS: '3600000',
    ULM_RESET_RETRY_MS: '1000,2000,4000',
  });
  await openResets(page);
  await expect(historyCard(page).locator('li')).toHaveCount(10);
  await page.getByRole('button', { name: '사용량 현황으로 돌아가기' }).click();

  mode({ history: 'fail' });
  await openResets(page);
  await expect(historyCard(page)).toContainText('최신 정보 아님');
  await expect(historyCard(page)).toContainText('500 오류');
  await expect(statusCard(page)).toContainText('최근 리셋');
  await capture(page, 'resets-history-stale');
  await expect(historyCard(page)).toContainText('자동으로 다시 시도해요 (3번 중 1번째)');
  await expect(historyCard(page)).toContainText('자동 재시도 횟수를 다 써서 멈췄어요', { timeout: 15_000 });
  const times = server.requests.filter((r) => r.startsWith('GET /api/v1/resets')).length;
  await page.waitForTimeout(3000);
  expect(server.requests.filter((r) => r.startsWith('GET /api/v1/resets')).length).toBe(times);
  await capture(page, 'resets-retry-stopped');
  await app.close();
});

test('a first failure has no value; 다시 시도 recovers (LHS-7 검증 6, LHS-8 검증 5)', async () => {
  mode({ status: 'fail', history: 'fail' });
  const { app, page } = await launch(fixture, server.url, {
    ULM_RESET_CHECK_MS: '3600000',
    ULM_RESET_RETRY_MS: '1500,3000,6000',
  });
  await openResets(page);
  await expect(statusCard(page)).toContainText('불러오기 실패');
  await expect(statusCard(page)).toContainText('현황을 불러오지 못했어요');
  await expect(statusCard(page)).not.toContainText('최근 리셋');
  await capture(page, 'resets-first-failure');
  // Slow failing answers keep the automatic retry in flight long enough to see it.
  mode({ status: 'fail', history: 'fail', delayMs: 2500 });
  await expect(statusCard(page)).toContainText('자동 재시도 중 (3번 중 1번째)', { timeout: 5000 });
  await capture(page, 'resets-retrying');
  mode({});
  await statusCard(page).getByRole('button', { name: '다시 시도' }).click();
  await expect(statusCard(page)).toContainText('최근 리셋');
  await historyCard(page).getByRole('button', { name: '다시 시도' }).click();
  await expect(historyCard(page).locator('li')).toHaveCount(10);
  await app.close();
});

test('new reset notifications: baseline first, then once per reset, held while refused (LHS-10 검증 1–6)', async () => {
  const log = () =>
    existsSync(join(fixture.dataDir, 'notifications.log'))
      ? readFileSync(join(fixture.dataDir, 'notifications.log'), 'utf8')
          .trim()
          .split('\n')
          .filter(Boolean)
          .map((l) => JSON.parse(l))
      : [];
  let { app } = await launch(fixture, server.url, { ULM_RESET_CHECK_MS: '1500' });
  await expect
    .poll(() => existsSync(join(fixture.dataDir, 'reset-alerts.json')), { timeout: 10_000 })
    .toBe(true);
  await new Promise((r) => setTimeout(r, 3000));
  expect(log()).toHaveLength(0);
  await app.close();

  // A new reset appears while notifications are refused: it is held, not lost.
  writeFileSync(fixture.notifyFile, 'denied');
  const store = JSON.parse(readFileSync(join(fixture.dataDir, 'reset-alerts.json'), 'utf8'));
  store.baselineAt -= 1;
  store.delivered = [];
  writeFileSync(join(fixture.dataDir, 'reset-alerts.json'), JSON.stringify(store));
  let page;
  ({ app, page } = await launch(fixture, server.url, { ULM_RESET_CHECK_MS: '1500' }));
  await expect.poll(() => log().length, { timeout: 10_000 }).toBeGreaterThan(0);
  expect(log().every((n) => n.outcome === 'denied')).toBe(true);
  // The popover says so, with a way to the reset screen (2026-10-28: refused five times in silence).
  await expect(page.getByText(/Codex 전체 리셋이 공지됐어요\. macOS 알림이 꺼져 있어/)).toBeVisible({
    timeout: 10_000,
  });
  await capture(page, 'usage-reset-notice');
  await page.getByRole('button', { name: 'Codex 전체 리셋 보기' }).click();
  await expect(page.locator('h1')).toHaveText('Codex 전체 리셋');
  writeFileSync(fixture.notifyFile, 'shown');
  await expect.poll(() => log().filter((n) => n.outcome === 'shown').length, { timeout: 10_000 }).toBe(1);
  const shown = log().find((n) => n.outcome === 'shown');
  expect(shown.title).toBe('Codex 사용량 한도가 리셋됐어요');
  expect(shown.body).toContain('출처: codex-resets.com');
  expect(shown.url).toBe('https://codex-resets.com');
  await new Promise((r) => setTimeout(r, 4000));
  expect(log().filter((n) => n.outcome === 'shown')).toHaveLength(1);
  await app.close();

  ({ app } = await launch(fixture, server.url, { ULM_RESET_CHECK_MS: '1500' }));
  await new Promise((r) => setTimeout(r, 4000));
  expect(log().filter((n) => n.outcome === 'shown')).toHaveLength(1);
  await app.close();
});
