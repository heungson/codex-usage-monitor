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
    });
  });

  it('keeps the last choice for the next start', () => {
    const file = join(tempDir(), 'window-settings.json');
    new WindowSettingsStore(file).setAlwaysOnTop(true);
    expect(new WindowSettingsStore(file).current.alwaysOnTop).toBe(true);
    new WindowSettingsStore(file).setAlwaysOnTop(false);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ alwaysOnTop: false });
  });

  it('reads an unreadable file as off', () => {
    const file = join(tempDir(), 'window-settings.json');
    writeFileSync(file, '{broken');
    expect(new WindowSettingsStore(file).current.alwaysOnTop).toBe(false);
  });
});
