// Development only (developer's request, 2026-10-30): with ULM_DEV_DISPLAY=1, which every check here
// sets, the app's windows open on a display other than the main one and do not take the keyboard,
// so the checks leave the developer's main screen alone. No PRS issue covers this.

import { execFileSync } from 'node:child_process';

import { expect, test, type ElectronApplication } from '@playwright/test';

import { launch, makeFixture, watchTray } from './app';
import { startFakeResets, type FakeServer } from './fake-resets-server';

/** The application macOS has in front (its ASN), as `lsappinfo front` reports it. */
const frontApp = () => execFileSync('lsappinfo', ['front'], { encoding: 'utf8' }).trim();

/** Where the window is and whether it has the keyboard. */
function placement(app: ElectronApplication) {
  return app.evaluate(({ BrowserWindow, screen }) => {
    const window = BrowserWindow.getAllWindows()[0]!;
    return {
      displays: screen.getAllDisplays().length,
      main: screen.getPrimaryDisplay().id,
      shownOn: screen.getDisplayMatching(window.getBounds()).id,
      visible: window.isVisible(),
      focused: window.isFocused(),
      anyFocused: BrowserWindow.getFocusedWindow() !== null,
    };
  });
}

async function expectOffMainUnfocused(app: ElectronApplication, before: string): Promise<void> {
  const placed = await placement(app);
  expect(placed.visible).toBe(true);
  expect(placed.focused).toBe(false);
  expect(placed.anyFocused).toBe(false);
  // macOS still has the application that was in front before the launch.
  expect(frontApp()).toBe(before);
  if (placed.displays > 1) expect(placed.shownOn).not.toBe(placed.main);
  // With one display the window opens where it always did, on that display.
  else expect(placed.shownOn).toBe(placed.main);
}

let server: FakeServer;
test.afterEach(async () => {
  await server.close();
});

test('the window the checks use opens off the main display, without taking the keyboard (ULM_DEV_DISPLAY)', async () => {
  const fixture = makeFixture();
  server = await startFakeResets(fixture.modeFile);
  const before = frontApp();
  const { app, page } = await launch(fixture, server.url);
  await expect(page.locator('h1')).toHaveText('사용량 현황');
  await expectOffMainUnfocused(app, before);
  await app.close();
});

test('the popover opened from the menu bar item does the same (ULM_DEV_DISPLAY)', async () => {
  const fixture = makeFixture();
  server = await startFakeResets(fixture.modeFile);
  const before = frontApp();
  // As `npm run dev`: no ordinary window, the popover under the menu bar item.
  const { app, page } = await launch(fixture, server.url, { ULM_SHOW_WINDOW: '0' });
  await watchTray(app, page);
  const tray = () =>
    app.evaluate(() => (globalThis as unknown as { tray?: Electron.Tray }).tray !== undefined);
  await expect.poll(tray).toBe(true);
  // A click on the menu bar item; a real click is checked by hand (AGENTS.md).
  await app.evaluate(() =>
    (globalThis as unknown as { tray: Electron.Tray }).tray.emit('click', { ctrlKey: false }, {}),
  );
  await expect.poll(async () => (await placement(app)).visible).toBe(true);
  await expectOffMainUnfocused(app, before);
  await app.close();
});
