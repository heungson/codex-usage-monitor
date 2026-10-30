// Captures of the three screens (WF-S001–S003) in light and dark, with «창 항상 위에 표시» off and on, for
// looking at the result (plan v3). Saved in tmp/screens/; nothing is asserted beyond the screen being there.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { codexLine } from '../test/helpers';
import { capture, launch, makeFixture } from './app';
import { startFakeResets } from './fake-resets-server';

const hour = 3_600_000;
const dir = join('tmp', 'screens');

for (const scheme of ['light', 'dark'] as const) {
  test(`three screens, ${scheme}`, async () => {
    mkdirSync(dir, { recursive: true });
    const fixture = makeFixture();
    writeFileSync(fixture.modeFile, JSON.stringify({ status: 'scheduled', history: 'ok' }));
    const server = await startFakeResets(fixture.modeFile);
    writeFileSync(
      join(fixture.dataDir, 'claude-rate-limits.json'),
      JSON.stringify({
        version: 1,
        updatedAt: new Date(Date.now() - 3 * 60_000).toISOString(),
        fiveHour: { usedPercentage: 23, resetsAt: Date.now() + 2 * hour + 15 * 60_000 },
        sevenDay: { usedPercentage: 84, resetsAt: Date.now() + 3 * 24 * hour },
      }),
    );
    const sessions = join(fixture.codexSessions, '2026', '10', '30');
    mkdirSync(sessions, { recursive: true });
    const resets = Math.floor((Date.now() + 4 * 24 * hour) / 1000);
    writeFileSync(
      join(sessions, 'rollout-a.jsonl'),
      codexLine(
        new Date(Date.now() - 10 * 60_000).toISOString(),
        { used_percent: 44, window_minutes: 10080, resets_at: resets },
        { used_percent: 12, window_minutes: 300, resets_at: resets - 3 * 86_400 },
        'prolite',
      ) + '\n',
    );
    const { app, page } = await launch(fixture, server.url, { ULM_RESET_CHECK_MS: '3600000' });
    await page.emulateMedia({ colorScheme: scheme });
    const shot = (name: string, p: Page = page) => capture(p, `${scheme}-${name}`, dir);

    await expect(page.locator('section[data-area="upcoming"]')).toContainText('전체 리셋 예정');
    await expect(page.locator('section[data-cli="codex"]')).toContainText('44%');
    await shot('usage-pin-off');
    await page.getByRole('switch', { name: '창 항상 위에 표시' }).check({ force: true });
    await shot('usage-pin-on');

    await page.getByRole('button', { name: /Claude Code 연동 안내/ }).click();
    await expect(page.getByText('연동 안 됨')).toBeVisible();
    await shot('setup-pin-on');
    await page.getByRole('switch', { name: '창 항상 위에 표시' }).uncheck({ force: true });
    await shot('setup-pin-off');

    await page.getByRole('button', { name: '사용량 현황으로 돌아가기' }).click();
    await page.locator('section[data-area="upcoming"] h2').click();
    await expect(page.locator('section[data-area="history"] li')).toHaveCount(5);
    await shot('resets-pin-off');
    await page.getByRole('switch', { name: '창 항상 위에 표시' }).check({ force: true });
    await shot('resets-pin-on');

    // States: the reset area failing on the usage screen, and the reset screen loading.
    writeFileSync(fixture.modeFile, JSON.stringify({ status: 'fail', history: 'fail' }));
    await page.evaluate(() => window.monitor.retryResets('history'));
    await expect(page.locator('section[data-area="history"]')).toContainText('최신 정보 아님');
    await shot('resets-history-stale');
    await page.getByRole('button', { name: '사용량 현황으로 돌아가기' }).click();
    await page.evaluate(() => window.monitor.retryResets('status'));
    await expect(page.locator('section[data-area="upcoming"]')).toContainText('최신 정보 아님');
    await shot('usage-upcoming-stale');

    await app.close();
    await server.close();
  });
}
