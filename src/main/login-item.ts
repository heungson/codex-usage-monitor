// «로그인 시 자동 실행» on the 설정 screen (developer, 2026-11-04; no PRS item). macOS keeps the
// setting: the app registers itself as a login item through Electron (SMAppService on macOS 13+),
// and reads the answer back from macOS every time, so turning it off in System Settings › General ›
// Login Items shows here too. Nothing is stored in the app's data folder.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import type { LoginItemStatus } from '../shared/types';

/** What macOS says about the app as a login item (Electron's LoginItemSettings, the parts used). */
export interface LoginItemState {
  openAtLogin: boolean;
  /** macOS 13+: `not-registered`, `enabled`, `requires-approval` or `not-found`. */
  status?: string;
}

export interface LoginItemBackend {
  read(): LoginItemState;
  write(openAtLogin: boolean): void;
}

type ElectronApp = Pick<Electron.App, 'getLoginItemSettings' | 'setLoginItemSettings'>;

export function electronLoginItem(app: ElectronApp): LoginItemBackend {
  return {
    read: () => {
      const { openAtLogin, status } = app.getLoginItemSettings();
      return { openAtLogin, status };
    },
    write: (openAtLogin) => app.setLoginItemSettings({ openAtLogin }),
  };
}

/**
 * For the checks (ULM_FAKE_LOGIN_ITEM): the state lives in a JSON file instead of macOS, so a test
 * never adds Electron to the developer's real login items. Writing `{"status":"requires-approval"}`
 * to the file makes every later «켜기» wait for approval, as macOS can.
 */
export function fakeLoginItem(file: string): LoginItemBackend {
  const read = (): LoginItemState => {
    if (!existsSync(file)) return { openAtLogin: false, status: 'not-registered' };
    try {
      return JSON.parse(readFileSync(file, 'utf8')) as LoginItemState;
    } catch {
      return { openAtLogin: false, status: 'not-registered' };
    }
  };
  return {
    read,
    write: (openAtLogin) => {
      const pending = read().status === 'requires-approval';
      const next: LoginItemState = openAtLogin
        ? pending
          ? { openAtLogin: false, status: 'requires-approval' }
          : { openAtLogin: true, status: 'enabled' }
        : { openAtLogin: false, status: pending ? 'requires-approval' : 'not-registered' };
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, `${JSON.stringify(next)}\n`);
    },
  };
}

export class LoginItem {
  private lastError: string | null = null;

  /**
   * `backend` null: the app runs from the source folder (npm start). Registering that runtime would
   * start a bare Electron at login, without this app's code, so the switch is not offered there.
   */
  constructor(private readonly backend: LoginItemBackend | null) {}

  status(): LoginItemStatus {
    if (!this.backend) return { supported: false, openAtLogin: false, needsApproval: false, error: null };
    try {
      const state = this.backend.read();
      return {
        supported: true,
        openAtLogin: state.openAtLogin,
        needsApproval: state.status === 'requires-approval',
        error: this.lastError,
      };
    } catch (error) {
      return { supported: true, openAtLogin: false, needsApproval: false, error: message(error) };
    }
  }

  /** Asks macOS for the change, then reports what macOS actually did. */
  set(openAtLogin: boolean): LoginItemStatus {
    if (!this.backend) return this.status();
    this.lastError = null;
    try {
      this.backend.write(openAtLogin);
    } catch (error) {
      this.lastError = `로그인 항목을 바꾸지 못했어요: ${message(error)}`;
      return this.status();
    }
    const after = this.status();
    // Waiting for approval is not a failure: the screen says where to approve it.
    if (after.openAtLogin !== openAtLogin && !(openAtLogin && after.needsApproval)) {
      this.lastError = openAtLogin
        ? 'macOS가 로그인 항목 추가를 받아들이지 않았어요.'
        : 'macOS가 로그인 항목 제거를 받아들이지 않았어요.';
      return this.status();
    }
    return after;
  }
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
