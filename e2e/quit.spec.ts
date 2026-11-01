// Quitting the app (developer, 2026-10-30, comment on LHS-5): a right click or Control-click on the
// menu bar item opens a menu with only «종료»; a click still opens 사용량 현황; ⌘Q quits while the
// popover is open. The native menu cannot be clicked from here, so the menu the app would pop up is
// recorded and its item clicked; a real click on the menu bar item is checked by hand (AGENTS.md).

import { expect, test, type ElectronApplication } from '@playwright/test';

import { launch, makeFixture, watchTray } from './app';
import { startFakeResets, type FakeServer } from './fake-resets-server';

interface Recorded {
  tray?: Electron.Tray;
  menus: Electron.Menu[];
}

let server: FakeServer;
test.afterEach(async () => {
  await server.close();
});

/** Records every menu the menu bar item pops up instead of showing it. */
async function recordMenus(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ Tray }) => {
    const g = globalThis as unknown as Recorded;
    g.menus = [];
    Tray.prototype.popUpContextMenu = function (menu?: Electron.Menu) {
      if (menu) g.menus.push(menu);
    };
  });
}

const menuLabels = (app: ElectronApplication) =>
  app.evaluate(() => (globalThis as unknown as Recorded).menus.map((m) => m.items.map((i) => i.label)));
const visible = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isVisible());
const clickTray = (app: ElectronApplication, event: 'click' | 'right-click', ctrlKey = false) =>
  app.evaluate(
    (_electron, [name, ctrl]) =>
      (globalThis as unknown as Recorded).tray!.emit(name, { ctrlKey: ctrl, metaKey: false }, {}),
    [event, ctrlKey] as const,
  );

test('a right click or Control-click on the menu bar item opens «종료», which quits; a click still opens 사용량 현황', async () => {
  const fixture = makeFixture();
  server = await startFakeResets(fixture.modeFile);
  const { app, page } = await launch(fixture, server.url, { ULM_SHOW_WINDOW: '0' });
  await watchTray(app, page);
  await expect
    .poll(() => app.evaluate(() => (globalThis as unknown as Recorded).tray !== undefined))
    .toBe(true);
  await recordMenus(app);

  await clickTray(app, 'right-click');
  expect(await menuLabels(app)).toEqual([['종료']]);
  expect(await visible(app)).toBe(false);

  await clickTray(app, 'click', true);
  expect(await menuLabels(app)).toEqual([['종료'], ['종료']]);
  expect(await visible(app)).toBe(false);

  // A plain click opens 사용량 현황, with no menu.
  await clickTray(app, 'click');
  await expect.poll(() => visible(app)).toBe(true);
  await expect(page.locator('h1')).toHaveText('사용량 현황');
  expect(await menuLabels(app)).toHaveLength(2);

  const closed = app.waitForEvent('close');
  await app.evaluate(() => (globalThis as unknown as Recorded).menus[0]!.items[0]!.click());
  await closed;
});

test('⌘Q quits while 사용량 현황 is open', async () => {
  const fixture = makeFixture();
  server = await startFakeResets(fixture.modeFile);
  const { app, page } = await launch(fixture, server.url);
  await expect(page.locator('h1')).toHaveText('사용량 현황');
  const quit = await app.evaluate(({ Menu }) => {
    const items = Menu.getApplicationMenu()!.items.flatMap((i) => i.submenu?.items ?? []);
    const item = items.find((i) => i.label === '종료');
    return item ? { label: item.label, accelerator: item.accelerator ?? null } : null;
  });
  expect(quit).toEqual({ label: '종료', accelerator: 'Command+Q' });

  const closed = app.waitForEvent('close');
  await app.evaluate(({ Menu }) =>
    Menu.getApplicationMenu()!
      .items.flatMap((i) => i.submenu?.items ?? [])
      .find((i) => i.label === '종료')!
      .click(),
  );
  await closed;
});
