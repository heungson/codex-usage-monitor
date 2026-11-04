// «로그인 시 자동 실행» (developer, 2026-11-04): the switch shows what macOS answered, and says so
// when macOS refused a change or holds it for approval.

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { fakeLoginItem, LoginItem, type LoginItemBackend, type LoginItemState } from '../src/main/login-item';
import { tempDir } from './helpers';

/** A backend that keeps `state` and applies writes through `apply`, as macOS might. */
function backend(apply: (on: boolean, state: LoginItemState) => LoginItemState): LoginItemBackend {
  let state: LoginItemState = { openAtLogin: false, status: 'not-registered' };
  return {
    read: () => state,
    write: (on) => {
      state = apply(on, state);
    },
  };
}

describe('LoginItem', () => {
  it('is not offered when run from the source folder', () => {
    const item = new LoginItem(null);
    expect(item.status()).toEqual({
      supported: false,
      openAtLogin: false,
      needsApproval: false,
      error: null,
    });
    expect(item.set(true).openAtLogin).toBe(false);
  });

  it('starts off, and turns on and off', () => {
    const item = new LoginItem(fakeLoginItem(join(tempDir(), 'login-item.json')));
    expect(item.status()).toEqual({ supported: true, openAtLogin: false, needsApproval: false, error: null });
    expect(item.set(true)).toMatchObject({ openAtLogin: true, error: null });
    expect(item.status().openAtLogin).toBe(true);
    expect(item.set(false)).toMatchObject({ openAtLogin: false, error: null });
  });

  it('reads the state from macOS each time, so a change in System Settings shows', () => {
    const file = join(tempDir(), 'login-item.json');
    const item = new LoginItem(fakeLoginItem(file));
    item.set(true);
    writeFileSync(file, JSON.stringify({ openAtLogin: false, status: 'not-registered' }));
    expect(item.status().openAtLogin).toBe(false);
  });

  it('waits for approval without calling it a failure', () => {
    const file = join(tempDir(), 'login-item.json');
    writeFileSync(file, JSON.stringify({ openAtLogin: false, status: 'requires-approval' }));
    const item = new LoginItem(fakeLoginItem(file));
    expect(item.set(true)).toEqual({ supported: true, openAtLogin: false, needsApproval: true, error: null });
  });

  it('says so when macOS ignores the change, and clears that on the next success', () => {
    let refuse = true;
    const item = new LoginItem(
      backend((on, state) => (refuse ? state : { openAtLogin: on, status: 'enabled' })),
    );
    expect(item.set(true)).toMatchObject({
      openAtLogin: false,
      error: 'macOS가 로그인 항목 추가를 받아들이지 않았어요.',
    });
    refuse = false;
    expect(item.set(true)).toMatchObject({ openAtLogin: true, error: null });
  });

  it('says so when the request throws', () => {
    const item = new LoginItem({
      read: () => ({ openAtLogin: false }),
      write: () => {
        throw new Error('denied');
      },
    });
    expect(item.set(true).error).toBe('로그인 항목을 바꾸지 못했어요: denied');
  });
});
