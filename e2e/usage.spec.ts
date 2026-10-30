// 사용량 현황 (WF-S001) in the running app: LHS-5 and LHS-6 checks, LHS-3/4 read paths, LHS-9 alerts.

import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import { codexLine } from '../test/helpers';
import { capture, launch, makeFixture, type Fixture } from './app';
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

test('the two entries open their screens (LHS-5 검증 7)', async () => {
  const { app, page } = await launch(fixture, server.url);
  await page.getByRole('button', { name: /Claude Code 연동 안내/ }).click();
  await expect(page.locator('h1')).toHaveText('Claude Code 연동 안내');
  await page.getByRole('button', { name: '사용량 현황으로 돌아가기' }).click();
  await expect(page.locator('h1')).toHaveText('사용량 현황');
  await page.getByRole('button', { name: /Codex 전체 리셋/ }).click();
  await expect(page.locator('h1')).toHaveText('Codex 전체 리셋');
  await app.close();
});

test('limit alerts: 80% notifies once per window; a refusal is explained (LHS-9 검증 1–4)', async () => {
  writeClaude(fixture, 79, 10);
  writeCodex(fixture, 20);
  const { app, page } = await launch(fixture, server.url, { ULM_READ_INTERVAL_MS: '1500' });
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
  await capture(page, 'usage-alert-denied');
  await page.waitForTimeout(4000);
  expect(log().filter((n) => n.title.startsWith('Codex'))).toHaveLength(1);
  await app.close();
});
