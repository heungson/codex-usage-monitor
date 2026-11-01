// Launches the built app (dist/) in Electron against temporary folders, with the popover shown as
// an ordinary window (ULM_SHOW_WINDOW=1) so it can be driven and captured, on a display other than
// the main one and without taking the keyboard (ULM_DEV_DISPLAY=1) when this Mac has one.

import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

export interface Fixture {
  root: string;
  dataDir: string;
  claudeSettings: string;
  codexSessions: string;
  modeFile: string;
  notifyFile: string;
}

export function makeFixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'ulm-e2e-'));
  const fixture = {
    root,
    dataDir: join(root, 'data'),
    claudeSettings: join(root, 'claude', 'settings.json'),
    codexSessions: join(root, 'codex', 'sessions'),
    modeFile: join(root, 'resets-mode.json'),
    notifyFile: join(root, 'notify-result'),
  };
  mkdirSync(fixture.dataDir, { recursive: true });
  mkdirSync(join(root, 'claude'), { recursive: true });
  writeFileSync(fixture.modeFile, JSON.stringify({ status: 'ok', history: 'ok' }));
  writeFileSync(fixture.notifyFile, 'shown');
  return fixture;
}

export async function launch(
  fixture: Fixture,
  resetsUrl: string,
  extraEnv: Record<string, string> = {},
): Promise<{ app: ElectronApplication; page: Page; opened: string[] }> {
  const app = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      ULM_SHOW_WINDOW: '1',
      ULM_DEV_DISPLAY: '1',
      ULM_HOME: fixture.dataDir,
      ULM_CLAUDE_SETTINGS: fixture.claudeSettings,
      ULM_CODEX_SESSIONS: fixture.codexSessions,
      ULM_RESETS_BASE_URL: resetsUrl,
      ULM_FAKE_NOTIFY: 'shown',
      ULM_FAKE_NOTIFY_FILE: fixture.notifyFile,
      ...extraEnv,
    },
  });
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 360, height: 600 });
  // Record links the app opens instead of opening a browser.
  await app.evaluate(({ shell }) => {
    (globalThis as unknown as { opened: string[] }).opened = [];
    shell.openExternal = async (url: string) => {
      (globalThis as unknown as { opened: string[] }).opened.push(url);
    };
  });
  const opened: string[] = [];
  return { app, page, opened };
}

export async function openedLinks(app: ElectronApplication): Promise<string[]> {
  return app.evaluate(() => (globalThis as unknown as { opened: string[] }).opened);
}

/**
 * Captures every viewport of the popover from top to bottom (name-1.png, name-2.png, …), as the
 * window shows them. A full-page capture is not used: with a classic scrollbar it crops the page.
 */
export async function capture(page: Page, name: string, dir = join('tmp', 'e2e-shots')): Promise<void> {
  const { scrollHeight, innerHeight } = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    innerHeight: window.innerHeight,
  }));
  const steps = Math.max(1, Math.ceil(scrollHeight / innerHeight));
  for (let i = 0; i < steps; i++) {
    await page.evaluate((y) => window.scrollTo(0, y), i * innerHeight);
    await page.screenshot({ path: join(dir, `${name}-${i + 1}.png`) });
  }
  await page.evaluate(() => window.scrollTo(0, 0));
}

/**
 * Clicks the usage screen's 예정 리셋 area on its title, as a person would. The click lands on the
 * button that covers the whole area (planner, 2026-10-30), not on the title text.
 */
export async function clickUpcomingArea(page: Page): Promise<void> {
  await page.locator('section[data-area="upcoming"]').click({ position: { x: 24, y: 18 } });
}

/**
 * Records the menu bar item's title. The app's Tray is patched after launch, so the next title it sets
 * hands over the item; `trayTitle` then reads the title back from macOS with Tray.getTitle().
 */
export async function watchTray(app: ElectronApplication, page: Page): Promise<void> {
  await app.evaluate(({ Tray }) => {
    const g = globalThis as unknown as { tray?: Electron.Tray };
    const setTitle = Tray.prototype.setTitle;
    Tray.prototype.setTitle = function (this: Electron.Tray, ...args: Parameters<Electron.Tray['setTitle']>) {
      g.tray = this;
      return setTitle.apply(this, args);
    };
  });
  // Any status change sets the title again.
  await page.evaluate(() => window.monitor.retryResets('status'));
}

export function trayTitle(app: ElectronApplication): Promise<string | null> {
  return app.evaluate(() => (globalThis as unknown as { tray?: Electron.Tray }).tray?.getTitle() ?? null);
}
