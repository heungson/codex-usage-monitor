// Real data, real network: the person's own ~/.codex/sessions and the live codex-resets.com.
// Claude Code settings and the app data stay in a temporary folder, so nothing real is changed.
// Skipped unless ULM_LIVE=1, because it depends on this machine and the network.

import { expect, test } from '@playwright/test';

import { capture, launch, makeFixture } from './app';

test.skip(process.env.ULM_LIVE !== '1', 'live check: set ULM_LIVE=1');

test('real Codex sessions and the live reset API', async () => {
  const fixture = makeFixture();
  const started = Date.now();
  const { app, page } = await launch(fixture, 'https://codex-resets.com', {
    ULM_CODEX_SESSIONS: `${process.env.HOME}/.codex/sessions`,
  });
  const codex = page.locator('section[data-cli="codex"]');
  await expect(codex.locator('.chip')).not.toHaveText('불러오는 중', { timeout: 60_000 });
  console.log(
    `codex first read finished after ${Date.now() - started} ms: ${await codex.locator('.chip').innerText()}`,
  );
  console.log((await codex.innerText()).replace(/\s+/g, ' '));
  await capture(page, 'live-usage');

  const upcoming = page.locator('section[data-area="upcoming"]');
  // The scheduled reset, or 예정 리셋 없음 / 정보 없음: a settled state, not 불러오는 중.
  await expect(upcoming.locator('.upcoming-main')).toBeVisible({ timeout: 20_000 });
  console.log((await upcoming.innerText()).replace(/\s+/g, ' '));
  await page.getByRole('button', { name: /Codex 전체 리셋/ }).click();
  await expect(page.locator('section[data-area="status"]')).toContainText('최근 전체 리셋', {
    timeout: 20_000,
  });
  await expect(page.locator('section[data-area="history"] li')).toHaveCount(5, { timeout: 20_000 });
  await page.getByRole('button', { name: '이력 더 보기' }).click();
  await expect(page.locator('section[data-area="history"] li')).toHaveCount(15, { timeout: 20_000 });
  console.log((await page.locator('section[data-area="status"]').innerText()).replace(/\s+/g, ' '));
  await capture(page, 'live-resets');
  await app.close();
});
