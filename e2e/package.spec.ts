import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { _electron as electron, expect, test } from '@playwright/test';

import { statusLineInput } from '../test/helpers';
import { backToUsage, capture, clickUpcomingArea, makeFixture, openSetup } from './app';
import { startFakeResets } from './fake-resets-server';

test('standalone bundle launches after moving and runs its packaged hook', async () => {
  test.skip(process.env.ULM_TEST_PACKAGE !== '1', 'Run npm run test:package to build and check the bundle.');
  mkdirSync('tmp', { recursive: true });
  const root = mkdtempSync(resolve('tmp/package-check-'));
  const bundle = join(root, 'Moved App.app');
  execFileSync('/usr/bin/ditto', [resolve('tmp/package/Usage Limit Monitor.app'), bundle]);
  execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', bundle]);
  const fixture = makeFixture();
  const server = await startFakeResets(fixture.modeFile);
  const app = await electron.launch({
    executablePath: join(bundle, 'Contents/MacOS/Usage Limit Monitor'),
    args: [],
    cwd: root,
    env: {
      ...process.env,
      ULM_SHOW_WINDOW: '1',
      ULM_HOME: fixture.dataDir,
      ULM_CLAUDE_SETTINGS: fixture.claudeSettings,
      ULM_CODEX_SESSIONS: fixture.codexSessions,
      ULM_RESETS_BASE_URL: server.url,
      ULM_FAKE_NOTIFY: 'shown',
      ULM_CLAUDE_CREDENTIALS: fixture.claudeLoginFile,
      ULM_CLAUDE_API_BASE_URL: 'http://127.0.0.1:9',
    },
  });
  try {
    expect(await app.evaluate(({ app }) => app.isPackaged)).toBe(true);
    expect(await app.evaluate(({ app }) => app.getAppPath())).toBe(join(bundle, 'Contents/Resources/app'));
    const page = await app.firstWindow();
    await expect(page.locator('h1')).toHaveText('사용량 현황');
    await capture(page, 'packaged-usage');
    await clickUpcomingArea(page);
    await expect(page.locator('h1')).toHaveText('Codex 전체 리셋');
    await backToUsage(page);
    await openSetup(page);
    await page.getByRole('button', { name: '연동 적용' }).click();
    await expect(page.getByRole('button', { name: '연동됨' })).toBeDisabled();
    const { statusLine } = JSON.parse(readFileSync(fixture.claudeSettings, 'utf8'));
    expect(statusLine.command).toContain(bundle);
    expect(statusLine.command).toContain('Contents/Resources/app/dist/hook/statusline-hook.js');
    const result = spawnSync('/bin/sh', ['-c', statusLine.command], {
      cwd: root,
      input: statusLineInput(
        { used_percentage: 33, resets_at: Math.floor(Date.now() / 1000) + 3600 },
        { used_percentage: 70, resets_at: Math.floor(Date.now() / 1000) + 86400 },
      ),
      encoding: 'utf8',
    });
    expect(result.status, result.stderr).toBe(0);
    await backToUsage(page);
    await expect(page.locator('section[data-cli="claude"]')).toContainText('33% 사용');
  } finally {
    await app.close();
    await server.close();
  }
});
