// LHS-2 검증 5 (plan v3 wording): the settings file IS changed (the hook command is written), then a
// later step fails, with an existing status line command. Everything this apply changed goes back.
// The failure is injected by making the read-back after the write see a file without the hook; it is
// in its own file because vi.mock replaces node:fs for every test in the file.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, it, vi } from 'vitest';

let failReadBack = false;
vi.mock('node:fs', async (original) => {
  const real = await original<typeof import('node:fs')>();
  return {
    ...real,
    readFileSync: (...args: Parameters<typeof real.readFileSync>) => {
      const value = real.readFileSync(...args);
      if (
        failReadBack &&
        String(args[0]).endsWith('settings.json') &&
        String(value).includes('statusline-hook')
      )
        return typeof value === 'string' ? '{"statusLine":null}' : Buffer.from('{"statusLine":null}');
      return value;
    },
  };
});

import { Integration } from '../src/main/integration';
import { tempDir } from './helpers';

it('rolls back a settings file already written when a later step fails (LHS-2 검증 5)', () => {
  const root = tempDir();
  const paths = {
    dataDir: join(root, 'data'),
    claudeSettings: join(root, 'settings.json'),
    codexSessions: join(root, 'sessions'),
  };
  const original = JSON.stringify(
    { model: 'opus', statusLine: { type: 'command', command: 'echo keep' } },
    null,
    2,
  );
  writeFileSync(paths.claudeSettings, original);
  const integration = new Integration(paths, { runtime: '/bin/node', script: '/x/statusline-hook.js' });

  failReadBack = true;
  const status = integration.apply();
  failReadBack = false;

  expect(status.lastApply?.ok).toBe(false);
  expect(status.lastApply?.message).toBe(
    '연동하지 못했어요: 설정 파일에 쓴 내용을 다시 읽어 확인하지 못했어요. Claude Code 설정은 적용 전 상태 그대로예요.',
  );
  expect(readFileSync(paths.claudeSettings, 'utf8')).toBe(original);
  expect(existsSync(join(paths.dataDir, 'statusline-integration.json'))).toBe(false);
  expect(status.applied).toBe(false);
  expect(status.previousCommand).toBe('echo keep');
});
