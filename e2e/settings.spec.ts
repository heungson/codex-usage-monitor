// 설정 › «로그인 시 자동 실행» (developer, 2026-11-04). macOS's login items are stood in for by a file
// (ULM_FAKE_LOGIN_ITEM), so these checks never add Electron to the developer's real login items.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import { codexLine } from '../test/helpers';
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

test("«주말·공휴일 제외» starts off, changes the 7일 mark's tip, and survives a restart (developer 2026-11-05)", async () => {
  const fixture = makeFixture();
  server = await startFakeResets(fixture.modeFile);
  // A Codex 7일 window halfway through, so its bar has an even-use mark.
  const dir = join(fixture.codexSessions, '2026', '11', '05');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'rollout-a.jsonl'),
    codexLine(new Date().toISOString(), {
      used_percent: 40,
      window_minutes: 10080,
      resets_at: Math.floor((Date.now() + 3.5 * 86_400_000) / 1000),
    }) + '\n',
  );
  const workdays = (page: import('@playwright/test').Page) =>
    page.getByRole('switch', { name: '주말·공휴일 제외' });
  const markLabel = (page: import('@playwright/test').Page) =>
    page.locator('section[data-cli="codex"] .even').first().getAttribute('aria-label');

  let { app, page } = await launch(fixture, server.url);
  await expect(page.locator('section[data-cli="codex"] .even')).toHaveCount(1);
  expect(await markLabel(page)).not.toContain('주말과 공휴일에는 멈춰요');

  await page.getByRole('button', { name: '설정' }).click();
  await expect(workdays(page)).not.toBeChecked();
  await workdays(page).check({ force: true });
  await expect(workdays(page)).toBeChecked();
  await capture(page, 'settings-workdays-on');
  await page.getByRole('button', { name: '사용량 현황으로 돌아가기' }).click();
  expect(await markLabel(page)).toContain('주말과 공휴일에는 멈춰요');

  await app.close();
  ({ app, page } = await launch(fixture, server.url));
  await expect(page.locator('section[data-cli="codex"] .even')).toHaveCount(1);
  await expect.poll(() => markLabel(page)).toContain('주말과 공휴일에는 멈춰요');
  await page.getByRole('button', { name: '설정' }).click();
  await expect(workdays(page)).toBeChecked();
  await app.close();
});

test('테마: six looks to pick from, applied at once and kept across a restart (developer 2026-11-05)', async () => {
  const fixture = makeFixture();
  server = await startFakeResets(fixture.modeFile);
  let { app, page } = await launch(fixture, server.url);
  const theme = () => page.evaluate(() => document.documentElement.dataset.theme);
  expect(await theme()).toBe('default');

  await page.getByRole('button', { name: '설정' }).click();
  const group = page.getByRole('radiogroup', { name: '테마' });
  await expect(group.getByRole('radio')).toHaveCount(6);
  await expect(group.getByRole('radio', { name: /기본/ })).toBeChecked();
  for (const [name, id] of [
    ['픽셀', 'pixel'],
    ['터미널', 'terminal'],
    ['파스텔', 'pastel'],
    ['네온', 'neon'],
    ['고대비', 'contrast'],
  ] as const) {
    await group.getByRole('radio', { name: new RegExp(name) }).check({ force: true });
    await expect.poll(theme).toBe(id);
    await expect(group.getByRole('radio', { name: new RegExp(name) })).toBeChecked();
  }
  await group.getByRole('radio', { name: /픽셀/ }).check({ force: true });
  await expect.poll(theme).toBe('pixel');
  await capture(page, 'settings-theme-pixel');

  await app.close();
  ({ app, page } = await launch(fixture, server.url));
  await expect.poll(theme).toBe('pixel');
  await app.close();
});
