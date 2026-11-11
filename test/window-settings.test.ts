// FC-F019 (plan v3): «창 항상 위에 표시» starts off and is kept across restarts.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { WindowSettingsStore } from '../src/main/window-settings';
import { tempDir } from './helpers';

describe('WindowSettingsStore', () => {
  it('is off when nothing was saved (PR-P025)', () => {
    expect(new WindowSettingsStore(join(tempDir(), 'window-settings.json')).current).toEqual({
      alwaysOnTop: false,
      workdaysOnly: false,
      theme: 'default',
      collapsed: [],
    });
  });

  it('keeps the last choice for the next start', () => {
    const file = join(tempDir(), 'window-settings.json');
    new WindowSettingsStore(file).setAlwaysOnTop(true);
    expect(new WindowSettingsStore(file).current.alwaysOnTop).toBe(true);
    new WindowSettingsStore(file).setAlwaysOnTop(false);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({
      alwaysOnTop: false,
      workdaysOnly: false,
      theme: 'default',
      collapsed: [],
    });
  });

  it('reads an unreadable file as off', () => {
    const file = join(tempDir(), 'window-settings.json');
    writeFileSync(file, '{broken');
    expect(new WindowSettingsStore(file).current.alwaysOnTop).toBe(false);
  });

  it('keeps «주말·공휴일 제외» apart from «항상 위» (developer, 2026-11-05)', () => {
    const file = join(tempDir(), 'window-settings.json');
    new WindowSettingsStore(file).setAlwaysOnTop(true);
    new WindowSettingsStore(file).setWorkdaysOnly(true);
    expect(new WindowSettingsStore(file).current).toEqual({
      alwaysOnTop: true,
      workdaysOnly: true,
      theme: 'default',
      collapsed: [],
    });
    // A file from before the setting existed reads as off.
    writeFileSync(file, JSON.stringify({ alwaysOnTop: true }));
    expect(new WindowSettingsStore(file).current.workdaysOnly).toBe(false);
  });

  it('keeps the chosen theme, and reads a missing or unknown one as 기본 (developer, 2026-11-05)', () => {
    const file = join(tempDir(), 'window-settings.json');
    new WindowSettingsStore(file).setWorkdaysOnly(true);
    new WindowSettingsStore(file).setTheme('pixel');
    expect(new WindowSettingsStore(file).current).toMatchObject({ workdaysOnly: true, theme: 'pixel' });
    writeFileSync(file, JSON.stringify({ alwaysOnTop: true, theme: 'gone' }));
    expect(new WindowSettingsStore(file).current.theme).toBe('default');
    writeFileSync(file, JSON.stringify({ alwaysOnTop: true }));
    expect(new WindowSettingsStore(file).current.theme).toBe('default');
  });

  it('keeps folded usage cards in screen order, and ignores unknown ones (developer, 2026-11-11)', () => {
    const file = join(tempDir(), 'window-settings.json');
    new WindowSettingsStore(file).setCollapsed('upcoming', true);
    new WindowSettingsStore(file).setCollapsed('codex', true);
    new WindowSettingsStore(file).setCollapsed('codex', true);
    expect(new WindowSettingsStore(file).current.collapsed).toEqual(['codex', 'upcoming']);
    new WindowSettingsStore(file).setCollapsed('upcoming', false);
    expect(JSON.parse(readFileSync(file, 'utf8')).collapsed).toEqual(['codex']);
    // A file from before folding, or with a card this version lacks.
    writeFileSync(file, JSON.stringify({ alwaysOnTop: true }));
    expect(new WindowSettingsStore(file).current.collapsed).toEqual([]);
    writeFileSync(file, JSON.stringify({ collapsed: ['gone', 'claude', 7] }));
    expect(new WindowSettingsStore(file).current.collapsed).toEqual(['claude']);
  });
});
