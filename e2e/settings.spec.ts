// 설정 › «로그인 시 자동 실행» (developer, 2026-11-04). macOS's login items are stood in for by a file
// (ULM_FAKE_LOGIN_ITEM), so these checks never add Electron to the developer's real login items.

import { readFileSync, writeFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { capture, launch, makeFixture } from './app';
import { startFakeResets, type FakeServer } from './fake-resets-server';

let server: FakeServer;
test.afterEach(async () => {
  await server.close();
});

const loginSwitch = (page: import('@playwright/test').Page) =>
  page.getByRole('switch', { name: '로그인 시 자동 실행' });

test('the gear opens 설정; «로그인 시 자동 실행» starts off, turns on and off, and survives a restart', async () => {
  const fixture = makeFixture();
  server = await startFakeResets(fixture.modeFile);
  let { app, page } = await launch(fixture, server.url);

  await page.getByRole('button', { name: '설정' }).click();
  await expect(page.locator('h1')).toHaveText('설정');
  await expect(loginSwitch(page)).not.toBeChecked();
  await expect(loginSwitch(page)).toBeEnabled();
  await capture(page, 'settings-off');

  await loginSwitch(page).check({ force: true });
  await expect(loginSwitch(page)).toBeChecked();
  expect(JSON.parse(readFileSync(fixture.loginItemFile, 'utf8'))).toEqual({
    openAtLogin: true,
    status: 'enabled',
  });
  await capture(page, 'settings-on');

  // macOS keeps the setting; the next start reads it from there.
  await app.close();
  ({ app, page } = await launch(fixture, server.url));
  await page.getByRole('button', { name: '설정' }).click();
  await expect(loginSwitch(page)).toBeChecked();
  await loginSwitch(page).uncheck({ force: true });
  await expect(loginSwitch(page)).not.toBeChecked();
  expect(JSON.parse(readFileSync(fixture.loginItemFile, 'utf8')).openAtLogin).toBe(false);

  await page.getByRole('button', { name: '사용량 현황으로 돌아가기' }).click();
  await expect(page.locator('h1')).toHaveText('사용량 현황');
  await app.close();
});

test('waiting for macOS approval says where to allow it, and opens that pane', async () => {
  const fixture = makeFixture();
  server = await startFakeResets(fixture.modeFile);
  writeFileSync(fixture.loginItemFile, JSON.stringify({ openAtLogin: false, status: 'requires-approval' }));
  const { app, page } = await launch(fixture, server.url);
  await page.getByRole('button', { name: '설정' }).click();
  await expect(page.getByText('시스템 설정 › 일반 › 로그인 항목')).toBeVisible();
  await capture(page, 'settings-approval');
  await page.getByRole('button', { name: '시스템 설정 열기' }).click();
  await expect
    .poll(() => app.evaluate(() => (globalThis as unknown as { opened: string[] }).opened))
    .toEqual(['x-apple.systempreferences:com.apple.LoginItems-Settings.extension']);
  await app.close();
});

test('run from the source folder, the switch is off and cannot be turned on', async () => {
  const fixture = makeFixture();
  server = await startFakeResets(fixture.modeFile);
  const { app, page } = await launch(fixture, server.url, { ULM_FAKE_LOGIN_ITEM: '' });
  await page.getByRole('button', { name: '설정' }).click();
  await expect(loginSwitch(page)).toBeDisabled();
  await expect(loginSwitch(page)).not.toBeChecked();
  await expect(page.getByText('설치한 앱에서 켜 주세요')).toBeVisible();
  await capture(page, 'settings-unsupported');
  await app.close();
});
