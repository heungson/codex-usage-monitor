// Exposes a narrow API to the popover page; the page has no Node access.

import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

import type { MonitorApi } from '../shared/types';

function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const handler = (_event: IpcRendererEvent, payload: T) => listener(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const api: MonitorApi = {
  getUsage: () => ipcRenderer.invoke('usage:get'),
  refreshUsage: (automatic) => ipcRenderer.invoke('usage:refresh', automatic === true),
  retry: (cli) => ipcRenderer.invoke('usage:retry', cli),
  onUsage: (listener) => subscribe('usage', listener),
  dismissAlertNotice: () => ipcRenderer.invoke('alerts:dismiss'),
  dismissResetNotice: () => ipcRenderer.invoke('reset-alerts:dismiss'),
  reportHeight: (height) => ipcRenderer.send('popover:height', height),
  dragWindow: (phase, dx, dy) => ipcRenderer.send('popover:drag', phase, dx, dy),
  getIntegration: () => ipcRenderer.invoke('integration:get'),
  applyIntegration: () => ipcRenderer.invoke('integration:apply'),
  getResets: () => ipcRenderer.invoke('resets:get'),
  freshenResets: () => ipcRenderer.invoke('resets:freshen'),
  openResets: () => ipcRenderer.invoke('resets:open'),
  retryResets: (area) => ipcRenderer.invoke('resets:retry', area),
  loadMoreResets: () => ipcRenderer.invoke('resets:more'),
  onResets: (listener) => subscribe('resets', listener),
  getWindowSettings: () => ipcRenderer.invoke('window:get'),
  setAlwaysOnTop: (on) => ipcRenderer.invoke('window:always-on-top', on),
  setWorkdaysOnly: (on) => ipcRenderer.invoke('window:workdays-only', on),
  setTheme: (theme) => ipcRenderer.invoke('window:theme', theme),
  setCollapsed: (card, collapsed) => ipcRenderer.invoke('window:collapse', card, collapsed),
  setShownInMenuBar: (cli, shown) => ipcRenderer.invoke('window:menu-bar', cli, shown),
  getLoginItem: () => ipcRenderer.invoke('login-item:get'),
  setOpenAtLogin: (on) => ipcRenderer.invoke('login-item:set', on),
  openLoginItemSettings: () => ipcRenderer.invoke('login-item:open-settings'),
  openExternal: (url) => ipcRenderer.invoke('external:open', url),
  onNavigate: (listener) => subscribe('navigate', listener),
};

contextBridge.exposeInMainWorld('monitor', api);
