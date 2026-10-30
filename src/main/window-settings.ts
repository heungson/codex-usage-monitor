// The window settings the three screens share (FC-F019, PR-P025): one «창 항상 위에 표시» switch,
// off until the person turns it on, kept in the data folder so it survives closing the popover and
// restarting the app.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import type { WindowSettings } from '../shared/types';

export const defaultWindowSettings: WindowSettings = { alwaysOnTop: false };

export class WindowSettingsStore {
  private value: WindowSettings;

  constructor(private readonly file: string) {
    this.value = this.load();
  }

  get current(): WindowSettings {
    return { ...this.value };
  }

  setAlwaysOnTop(on: boolean): WindowSettings {
    this.value = { ...this.value, alwaysOnTop: on };
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, `${JSON.stringify(this.value, null, 2)}\n`);
    return this.current;
  }

  /** A missing or unreadable file is the first state: off. */
  private load(): WindowSettings {
    if (!existsSync(this.file)) return { ...defaultWindowSettings };
    try {
      const raw = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<WindowSettings>;
      return { alwaysOnTop: raw.alwaysOnTop === true };
    } catch {
      return { ...defaultWindowSettings };
    }
  }
}
