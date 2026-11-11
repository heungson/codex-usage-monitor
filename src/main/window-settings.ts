// The window settings the three screens share (FC-F019, PR-P025): one «창 항상 위에 표시» switch,
// off until the person turns it on, kept in the data folder so it survives closing the popover and
// restarting the app.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { isThemeId, type ThemeId } from '../shared/themes';
import { usageCards, type CliId, type UsageCard, type WindowSettings } from '../shared/types';

export const defaultWindowSettings: WindowSettings = {
  alwaysOnTop: false,
  workdaysOnly: false,
  theme: 'default',
  collapsed: [],
  menuBarHidden: [],
};

const clis: readonly CliId[] = ['claude', 'codex'];

export class WindowSettingsStore {
  private value: WindowSettings;

  constructor(private readonly file: string) {
    this.value = this.load();
  }

  get current(): WindowSettings {
    return {
      ...this.value,
      collapsed: [...this.value.collapsed],
      menuBarHidden: [...this.value.menuBarHidden],
    };
  }

  setAlwaysOnTop(on: boolean): WindowSettings {
    return this.save({ ...this.value, alwaysOnTop: on });
  }

  /** «주말·공휴일 제외» on the 설정 screen (developer, 2026-11-05). */
  setWorkdaysOnly(on: boolean): WindowSettings {
    return this.save({ ...this.value, workdaysOnly: on });
  }

  /** The look on the 설정 screen (developer, 2026-11-05). */
  setTheme(theme: ThemeId): WindowSettings {
    return this.save({ ...this.value, theme });
  }

  /** A usage screen card folded to its title line, or opened again (developer, 2026-11-11). */
  setCollapsed(card: UsageCard, collapsed: boolean): WindowSettings {
    const others = this.value.collapsed.filter((c) => c !== card);
    // Kept in screen order, so the file reads the same however the cards were folded.
    const next = usageCards.filter((c) => others.includes(c) || (collapsed && c === card));
    return this.save({ ...this.value, collapsed: next });
  }

  /** A CLI in the menu bar title, or left out of it (developer, 2026-11-11). */
  setShownInMenuBar(cli: CliId, shown: boolean): WindowSettings {
    const others = this.value.menuBarHidden.filter((c) => c !== cli);
    const next = clis.filter((c) => others.includes(c) || (!shown && c === cli));
    return this.save({ ...this.value, menuBarHidden: next });
  }

  private save(value: WindowSettings): WindowSettings {
    this.value = value;
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, `${JSON.stringify(this.value, null, 2)}\n`);
    return this.current;
  }

  /** A missing or unreadable file is the first state: off. */
  private load(): WindowSettings {
    if (!existsSync(this.file)) return { ...defaultWindowSettings };
    try {
      const raw = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<WindowSettings>;
      return {
        alwaysOnTop: raw.alwaysOnTop === true,
        workdaysOnly: raw.workdaysOnly === true,
        // A file from before themes, or one naming a theme this version lacks, gets 기본.
        theme: isThemeId(raw.theme) ? raw.theme : 'default',
        // A file from before folding, or one naming a card this version lacks, folds nothing extra.
        collapsed: Array.isArray(raw.collapsed) ? usageCards.filter((c) => raw.collapsed!.includes(c)) : [],
        menuBarHidden: Array.isArray(raw.menuBarHidden)
          ? clis.filter((c) => raw.menuBarHidden!.includes(c))
          : [],
      };
    } catch {
      return { ...defaultWindowSettings };
    }
  }
}
