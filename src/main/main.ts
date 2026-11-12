// Electron main process: the menu bar item, its popover window, the collectors and the alerts.

import { mkdirSync, watch, type FSWatcher } from 'node:fs';
import { join } from 'node:path';

import electron, { app, BrowserWindow, ipcMain, Menu, nativeImage, screen, shell, Tray } from 'electron';

import {
  usageCards,
  type CliId,
  type SourceState,
  type UsageCard,
  type UsageSnapshot,
  type View,
} from '../shared/types';
import { isLanguage, setLanguage, t } from '../shared/i18n';
import { isThemeId } from '../shared/themes';
import { claudeSource, fileLogin, keychainLogin } from './claude-api';
import { claudeReader } from './claude-reader';
import { codexReader } from './codex-reader';
import { Collector } from './collector';
import { Integration } from './integration';
import { LimitAlerts } from './limit-alerts';
import { electronLoginItem, fakeLoginItem, LoginItem } from './login-item';
import { electronNotifier, fakeNotifier, type Notifier, type SendResult } from './notifier';
import { dataFiles, resolvePaths } from './paths';
import { ResetAlerts, resetCheckIntervalMs } from './reset-alerts';
import { resetsApi, resetsSite } from './resets-api';
import { ResetsService } from './resets-service';
import { clockBitmap, iconPoints, iconScale } from './tray-icon';
import { MenuBarTitle } from './tray-title';
import { WindowSettingsStore } from './window-settings';

const env = process.env;
const numberEnv = (name: string, fallback: number) => (env[name] ? Number(env[name]) : fallback);

/** ULM_SHOW_WINDOW=1 opens the popover as an ordinary window at start (checks and screenshots). */
const showWindowMode = env.ULM_SHOW_WINDOW === '1';
/**
 * ULM_DEV_DISPLAY=1 (development only: the checks and `npm run dev`) opens the app's window on a
 * display other than the main one and never takes the keyboard, so test windows stay off the
 * developer's main screen (developer's request, 2026-10-30). Ignored by a packaged app.
 */
const devDisplayMode = env.ULM_DEV_DISPLAY === '1' && !app.isPackaged;
const readIntervalMs = numberEnv('ULM_READ_INTERVAL_MS', 30_000);

const paths = resolvePaths();
mkdirSync(paths.dataDir, { recursive: true });

// One instance per data folder. The single-instance lock lives in Electron's profile folder, so an
// app pointed at another data folder (a check, a second checkout) gets its own profile and is not
// shut out by the instance already in the menu bar.
if (env.ULM_HOME) app.setPath('userData', join(paths.dataDir, 'electron-profile'));
// Exit at once: app.quit() would let the rest of this file set up windows while quitting.
if (!app.requestSingleInstanceLock()) app.exit(0);

const notifier: Notifier = env.ULM_FAKE_NOTIFY
  ? fakeNotifier(paths.dataDir, env.ULM_FAKE_NOTIFY as SendResult, env.ULM_FAKE_NOTIFY_FILE)
  : electronNotifier(electron, paths.dataDir);

let tray: Tray | null = null;
let popover: BrowserWindow | null = null;
/**
 * «종료», in the menu bar item's right-click menu and the app menu (developer, 2026-10-30, comment on
 * LHS-5). app.quit() rather than the quit role, whose native item cannot be driven by the checks.
 */
const quitItem = (): Electron.MenuItemConstructorOptions => ({
  label: t('menu.quit'),
  click: () => app.quit(),
});
/** The menu bar item's right-click menu: only «종료». */
let quitMenu: Menu;
/** The menu bar text: usage, and the time left to a scheduled Codex reset (LHS-5 개발 항목 5). */
const menuBarTitle = new MenuBarTitle(
  (title) => tray?.setTitle(title),
  Date.now,
  (share) => tray?.setImage(clockImage(share)),
);

/** The menu bar clock: fuller as the Claude Code 5시간 reset nears (src/main/tray-icon.ts). */
function clockImage(share: number | null): Electron.NativeImage {
  const image = nativeImage.createFromBitmap(clockBitmap(share), {
    width: iconPoints * iconScale,
    height: iconPoints * iconScale,
    scaleFactor: iconScale,
  });
  image.setTemplateImage(true);
  return image;
}

const send = (channel: string, payload: unknown) => {
  if (popover && !popover.isDestroyed()) popover.webContents.send(channel, payload);
};

/**
 * FC-F014, FC-F015: npm start supplies the signed runtime's display name. Direct Electron
 * launches (including test fixtures) still use Electron's bundle identity.
 */
const appName = env.ULM_NOTIFICATION_APP_NAME ?? (app.isPackaged ? app.getName() : 'Electron');

const limitAlerts = new LimitAlerts(
  join(paths.dataDir, dataFiles.limitAlerts),
  notifier,
  () => publishUsage(),
  Date.now,
  appName,
);

function onSourceChange(cli: CliId, state: SourceState): void {
  if (state.kind === 'ok') void limitAlerts.evaluate(cli, state.usage);
  publishUsage();
}

const collectors: Record<CliId, Collector> = {
  claude: new Collector(
    claudeSource({
      login: paths.claudeLogin === null ? keychainLogin() : fileLogin(paths.claudeLogin),
      baseUrl: env.ULM_CLAUDE_API_BASE_URL ?? 'https://api.anthropic.com',
      record: claudeReader(paths.dataDir),
      minIntervalMs: numberEnv('ULM_CLAUDE_API_INTERVAL_MS', 60_000),
    }),
    {
      intervalMs: readIntervalMs,
      delayMs: numberEnv('ULM_READ_DELAY_MS', 0),
      onChange: (state) => onSourceChange('claude', state),
    },
  ),
  codex: new Collector(codexReader(paths.codexSessions), {
    intervalMs: readIntervalMs,
    delayMs: numberEnv('ULM_READ_DELAY_MS', 0),
    onChange: (state) => onSourceChange('codex', state),
  }),
};

function usageSnapshot(): UsageSnapshot {
  return {
    claude: collectors.claude.state,
    codex: collectors.codex.state,
    alertNotice: limitAlerts.currentNotice,
    resetNotice: resetAlerts.currentNotice,
  };
}

function publishUsage(): void {
  const snapshot = usageSnapshot();
  menuBarTitle.setUsage(snapshot);
  send('usage', snapshot);
}

const integration = new Integration(paths, {
  runtime: process.execPath,
  script: join(__dirname, '..', 'hook', 'statusline-hook.js'),
});

const api = resetsApi(env.ULM_RESETS_BASE_URL ?? resetsSite);
const retryDelays = env.ULM_RESET_RETRY_MS ? env.ULM_RESET_RETRY_MS.split(',').map(Number) : undefined;
// One status for the whole app: the screens, the menu bar title and the notifications (PR-P018, PR-P028).
const resets = new ResetsService(
  api,
  (snapshot) => {
    menuBarTitle.setStatus(snapshot.status);
    send('resets', snapshot);
  },
  retryDelays,
);
// The notification check asks through the shared status, so the usage screen's 예정 리셋 follows it.
const resetAlerts = new ResetAlerts(
  join(paths.dataDir, dataFiles.resetAlerts),
  { status: () => resets.refreshStatus() },
  notifier,
  () => publishUsage(),
  appName,
);

const windowSettings = new WindowSettingsStore(join(paths.dataDir, dataFiles.windowSettings));
// Every text the main process makes (menus, notifications, messages) is in this language (2026-11-12).
setLanguage(windowSettings.current.language);
menuBarTitle.setHidden(windowSettings.current.menuBarHidden);
// «로그인 시 자동 실행» (developer, 2026-11-04): only an installed app registers itself; the checks
// use a file (ULM_FAKE_LOGIN_ITEM) so they never touch the developer's real login items.
const loginItem = new LoginItem(
  env.ULM_FAKE_LOGIN_ITEM
    ? fakeLoginItem(env.ULM_FAKE_LOGIN_ITEM)
    : app.isPackaged
      ? electronLoginItem(app)
      : null,
);
/** The person dragged the pinned window somewhere: it reopens there instead of under the menu bar item. */
let movedByPerson = false;

let codexWatcher: FSWatcher | null = null;
let codexDebounce: NodeJS.Timeout | null = null;
function watchCodexSessions(): void {
  try {
    codexWatcher = watch(paths.codexSessions, { recursive: true }, () => {
      if (codexDebounce) clearTimeout(codexDebounce);
      codexDebounce = setTimeout(() => void collectors.codex.refresh(), 300);
    });
    codexWatcher.on('error', () => {
      codexWatcher?.close();
      codexWatcher = null;
    });
  } catch {
    // No sessions folder yet: the 30-second re-read still finds it once it exists.
    codexWatcher = null;
  }
}

/** With ULM_DEV_DISPLAY=1, the first display that is not the main one; null without one. */
function devDisplay(): Electron.Display | null {
  if (!devDisplayMode) return null;
  const main = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().find((d) => d.id !== main) ?? null;
}

function placePopover(): void {
  if (!popover) return;
  if (windowSettings.current.alwaysOnTop && movedByPerson) return;
  const other = devDisplay();
  if (other) {
    // The top right of the other display's work area; the menu bar item stays on every screen.
    const { width, height } = popover.getBounds();
    const area = other.workArea;
    popover.setBounds({ x: area.x + area.width - width - 8, y: area.y + 8, width, height });
    return;
  }
  if (!tray || showWindowMode) return;
  const trayBounds = tray.getBounds();
  const { width, height } = popover.getBounds();
  const display = screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y });
  const x = Math.round(
    Math.min(
      Math.max(trayBounds.x + trayBounds.width / 2 - width / 2, display.workArea.x + 8),
      display.workArea.x + display.workArea.width - width - 8,
    ),
  );
  const y = Math.round(trayBounds.y + trayBounds.height + 4);
  popover.setBounds({ x, y, width, height });
}

function showPopover(view: View = 'usage'): void {
  if (!popover) return;
  placePopover();
  if (devDisplayMode) {
    popover.showInactive();
  } else {
    popover.show();
    popover.focus();
  }
  send('navigate', view);
  void resetAlerts.deliverPending();
}

function createPopover(): BrowserWindow {
  const window = new BrowserWindow({
    width: 360,
    height: 600,
    show: false,
    frame: showWindowMode,
    resizable: showWindowMode,
    movable: showWindowMode,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: !showWindowMode,
    alwaysOnTop: !showWindowMode,
    // A pinned window sits behind other apps' focus; without this the first click on it only
    // activates the app. The first click now also reaches the page: the top bar drag, buttons.
    acceptFirstMouse: true,
    title: t('app.name'),
    // macOS's translucent popover material behind the page (developer, 2026-11-05), kept active
    // so a pinned window does not turn flat grey when another app is in front.
    backgroundColor: '#00000000',
    vibrancy: 'popover',
    visualEffectState: 'active',
    webPreferences: {
      preload: join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  window.loadFile(join(__dirname, '..', 'renderer', 'index.html'));
  // Off, the popover closes when the person clicks elsewhere, as before; on, it stays above other
  // windows until the menu bar item is clicked again (owner decision 2026-10-30 on FC-F019).
  window.on('blur', () => {
    if (!showWindowMode && !windowSettings.current.alwaysOnTop) window.hide();
  });
  window.on('will-move', () => {
    movedByPerson = true;
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  return window;
}

/** Applies «창 항상 위에 표시» to the window (FC-F019). */
function applyWindowSettings(): void {
  if (!popover) return;
  const { alwaysOnTop } = windowSettings.current;
  if (showWindowMode) {
    popover.setAlwaysOnTop(alwaysOnTop);
    return;
  }
  // The popover is always above other windows while it is open; pinned, it also stays open and can be dragged.
  popover.setAlwaysOnTop(true, 'floating');
  popover.setMovable(alwaysOnTop);
  if (!alwaysOnTop) movedByPerson = false;
}

ipcMain.handle('usage:get', () => usageSnapshot());
ipcMain.handle('usage:refresh', async (_event, automatic: unknown) => {
  const auto = automatic === true;
  // Not the screen's timer: 새로 고침 or opening the popover, so a person asked (developer, 2026-11-11).
  await Promise.all([collectors.claude.refresh(auto, !auto), collectors.codex.refresh(auto)]);
  return usageSnapshot();
});
ipcMain.handle('usage:retry', async (_event, cli: CliId) => {
  await collectors[cli].refresh(false, true);
  return usageSnapshot();
});
ipcMain.handle('reset-alerts:dismiss', () => {
  resetAlerts.dismissNotice();
  return usageSnapshot();
});
// The popover is as tall as its page, up to the screen (2026-10-28: a fixed 600 px left a third of it empty).
ipcMain.on('popover:height', (_event, height: unknown) => {
  if (!popover || showWindowMode || typeof height !== 'number' || !Number.isFinite(height)) return;
  const display = screen.getDisplayMatching(popover.getBounds());
  const next = Math.round(Math.min(Math.max(height, 160), display.workArea.height - 40));
  const bounds = popover.getBounds();
  if (bounds.height !== next) popover.setBounds({ ...bounds, height: next });
});
/**
 * Pinned, the top bar moves the window (FC-F019). The page sends how far the pointer has gone since
 * it was pressed, and the window follows from where it was. Done here rather than with CSS
 * `-webkit-app-region: drag`, which did nothing in the installed app (developer, 2026-11-05, «why
 * can't I drag the window?» and, after a first click, «it is not moving»).
 */
let dragFrom: { x: number; y: number } | null = null;
ipcMain.on('popover:drag', (_event, phase: unknown, dx: unknown, dy: unknown) => {
  if (!popover || !popover.isMovable()) return;
  if (phase === 'start') {
    const [x = 0, y = 0] = popover.getPosition();
    dragFrom = { x, y };
  } else if (phase === 'end') {
    dragFrom = null;
  } else if (phase === 'move' && dragFrom && typeof dx === 'number' && typeof dy === 'number') {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    popover.setPosition(Math.round(dragFrom.x + dx), Math.round(dragFrom.y + dy));
    movedByPerson = true;
  }
});
ipcMain.handle('alerts:dismiss', () => {
  limitAlerts.dismissNotice();
  return usageSnapshot();
});
ipcMain.handle('integration:get', () => integration.status());
ipcMain.handle('integration:apply', async () => {
  const status = integration.apply();
  await collectors.claude.refresh();
  return status;
});
ipcMain.handle('resets:get', () => resets.snapshot());
ipcMain.handle('resets:freshen', () => resets.freshenStatus());
ipcMain.handle('resets:open', () => resets.open());
ipcMain.handle('resets:retry', (_event, area: 'status' | 'history') => resets.retry(area));
ipcMain.handle('resets:more', () => resets.loadMore());
ipcMain.handle('window:get', () => windowSettings.current);
ipcMain.handle('window:always-on-top', (_event, on: unknown) => {
  if (typeof on !== 'boolean') return windowSettings.current;
  const settings = windowSettings.setAlwaysOnTop(on);
  applyWindowSettings();
  return settings;
});
ipcMain.handle('window:workdays-only', (_event, on: unknown) =>
  typeof on === 'boolean' ? windowSettings.setWorkdaysOnly(on) : windowSettings.current,
);
ipcMain.handle('window:theme', (_event, theme: unknown) =>
  isThemeId(theme) ? windowSettings.setTheme(theme) : windowSettings.current,
);
ipcMain.handle('window:menu-bar', (_event, cli: unknown, shown: unknown) => {
  if ((cli !== 'claude' && cli !== 'codex') || typeof shown !== 'boolean') return windowSettings.current;
  const settings = windowSettings.setShownInMenuBar(cli, shown);
  menuBarTitle.setHidden(settings.menuBarHidden);
  return settings;
});
/**
 * The menu bar item's tooltip and «종료» menu, and the app menu, in the chosen language. ⌘Q quits
 * while the popover is open; the Edit menu keeps copy and paste in the popover, which Electron's
 * default menu gave before this one replaced it.
 */
function applyLanguageToShell(): void {
  tray?.setToolTip(t('app.name'));
  quitMenu = Menu.buildFromTemplate([quitItem()]);
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { label: t('app.name'), submenu: [{ ...quitItem(), accelerator: 'Command+Q' }] },
      { role: 'editMenu' },
    ]),
  );
  popover?.setTitle(t('app.name'));
}

/**
 * 설정 › 언어 (developer, 2026-11-12). The menus and the menu bar title change at once; values are
 * read again so their messages come in the new language. A notice already shown keeps its words.
 */
ipcMain.handle('window:language', async (_event, language: unknown) => {
  if (!isLanguage(language)) return windowSettings.current;
  const settings = windowSettings.setLanguage(language);
  setLanguage(language);
  applyLanguageToShell();
  menuBarTitle.setHidden(settings.menuBarHidden);
  await Promise.all([collectors.claude.refresh(), collectors.codex.refresh()]);
  void resets.refreshStatus();
  return settings;
});
ipcMain.handle('window:collapse', (_event, card: unknown, collapsed: unknown) =>
  usageCards.includes(card as UsageCard) && typeof collapsed === 'boolean'
    ? windowSettings.setCollapsed(card as UsageCard, collapsed)
    : windowSettings.current,
);
ipcMain.handle('login-item:get', () => loginItem.status());
ipcMain.handle('login-item:set', (_event, on: unknown) =>
  typeof on === 'boolean' ? loginItem.set(on) : loginItem.status(),
);
ipcMain.handle('login-item:open-settings', () =>
  shell.openExternal('x-apple.systempreferences:com.apple.LoginItems-Settings.extension'),
);
ipcMain.handle('external:open', async (_event, url: string) => {
  // Only links the screens show: codex-resets.com and the announcement posts it cites.
  if (/^https:\/\/(codex-resets\.com|x\.com|twitter\.com|t\.me)(\/|$)/.test(url))
    await shell.openExternal(url);
});

app.on('second-instance', () => showPopover());

app.whenReady().then(() => {
  if (!showWindowMode) app.dock?.hide();
  popover = createPopover();
  applyWindowSettings();

  tray = new Tray(clockImage(null));
  applyLanguageToShell();
  // A click opens 사용량 현황 as before; a right click or Control-click opens the «종료» menu
  // (developer, 2026-10-30, comment on LHS-5). Not tray.setContextMenu: macOS would then open the
  // menu on every click.
  tray.on('click', (event) => {
    if (event.ctrlKey) return tray?.popUpContextMenu(quitMenu);
    return popover?.isVisible() ? popover.hide() : showPopover();
  });
  tray.on('right-click', () => tray?.popUpContextMenu(quitMenu));

  collectors.claude.start();
  collectors.codex.start();
  watchCodexSessions();
  menuBarTitle.start();
  resetAlerts.start(numberEnv('ULM_RESET_CHECK_MS', resetCheckIntervalMs));
  publishUsage();

  if (showWindowMode) popover.once('ready-to-show', () => showPopover());
});

app.on('before-quit', () => {
  collectors.claude.stop();
  collectors.codex.stop();
  codexWatcher?.close();
  resets.stop();
  resetAlerts.stop();
  menuBarTitle.stop();
});

// The app lives in the menu bar; closing the popover window does not quit it.
app.on('window-all-closed', () => undefined);
