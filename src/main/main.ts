// Electron main process: the menu bar item, its popover window, the collectors and the alerts.

import { mkdirSync, watch, type FSWatcher } from 'node:fs';
import { join } from 'node:path';

import electron, {
  app,
  BrowserWindow,
  ipcMain,
  nativeImage,
  nativeTheme,
  screen,
  shell,
  Tray,
} from 'electron';

import type { CliId, SourceState, UsageSnapshot, View } from '../shared/types';
import { claudeReader } from './claude-reader';
import { codexReader } from './codex-reader';
import { Collector } from './collector';
import { Integration } from './integration';
import { LimitAlerts } from './limit-alerts';
import { electronNotifier, fakeNotifier, type Notifier, type SendResult } from './notifier';
import { dataFiles, resolvePaths } from './paths';
import { ResetAlerts, resetCheckIntervalMs } from './reset-alerts';
import { resetsApi, resetsSite } from './resets-api';
import { ResetsService } from './resets-service';
import { trayTitle } from './tray-title';
import { WindowSettingsStore } from './window-settings';

const env = process.env;
const numberEnv = (name: string, fallback: number) => (env[name] ? Number(env[name]) : fallback);

/** ULM_SHOW_WINDOW=1 opens the popover as an ordinary window at start (checks and screenshots). */
const showWindowMode = env.ULM_SHOW_WINDOW === '1';
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

const send = (channel: string, payload: unknown) => {
  if (popover && !popover.isDestroyed()) popover.webContents.send(channel, payload);
};

/**
 * The name macOS lists this app under in 시스템 설정 › 알림, for the notices that ask the person to turn notifications
 * on: run from source it is Electron's own bundle, «Electron» (2026-10-28: «이 앱» named nothing they could find).
 */
const appName = app.isPackaged ? app.getName() : 'Electron';

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
  claude: new Collector(claudeReader(paths.dataDir), {
    intervalMs: readIntervalMs,
    delayMs: numberEnv('ULM_READ_DELAY_MS', 0),
    onChange: (state) => onSourceChange('claude', state),
  }),
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
  tray?.setTitle(trayTitle(snapshot));
  send('usage', snapshot);
}

const integration = new Integration(paths, {
  runtime: process.execPath,
  script: join(__dirname, '..', 'hook', 'statusline-hook.js'),
});

const api = resetsApi(env.ULM_RESETS_BASE_URL ?? resetsSite);
const retryDelays = env.ULM_RESET_RETRY_MS ? env.ULM_RESET_RETRY_MS.split(',').map(Number) : undefined;
const resets = new ResetsService(api, (snapshot) => send('resets', snapshot), retryDelays);
// The notification check asks through the shared status, so the usage screen's 예정 리셋 follows it.
const resetAlerts = new ResetAlerts(
  join(paths.dataDir, dataFiles.resetAlerts),
  { status: () => resets.refreshStatus() },
  notifier,
  () => publishUsage(),
  appName,
);

const windowSettings = new WindowSettingsStore(join(paths.dataDir, dataFiles.windowSettings));
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

function placePopover(): void {
  if (!popover || !tray || showWindowMode) return;
  if (windowSettings.current.alwaysOnTop && movedByPerson) return;
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
  popover.show();
  popover.focus();
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
    title: '사용량 한도 모니터',
    backgroundColor: windowBackground(),
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

/** Matches the page background so a resize never flashes the wrong colour (styles.css --window). */
function windowBackground(): string {
  return nativeTheme.shouldUseDarkColors ? '#1c1c1e' : '#f2f2f4';
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
ipcMain.handle('usage:refresh', async () => {
  await Promise.all([collectors.claude.refresh(), collectors.codex.refresh()]);
  return usageSnapshot();
});
ipcMain.handle('usage:retry', async (_event, cli: CliId) => {
  await collectors[cli].refresh();
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
  nativeTheme.on('updated', () => popover?.setBackgroundColor(windowBackground()));

  tray = new Tray(nativeImage.createFromPath(join(__dirname, 'assets', 'trayTemplate.png')));
  tray.setToolTip('사용량 한도 모니터');
  tray.on('click', () => (popover?.isVisible() ? popover.hide() : showPopover()));

  collectors.claude.start();
  collectors.codex.start();
  watchCodexSessions();
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
});

// The app lives in the menu bar; closing the popover window does not quit it.
app.on('window-all-closed', () => undefined);
