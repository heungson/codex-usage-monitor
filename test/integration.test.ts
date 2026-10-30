// LHS-2 (FC-F003, UF-N006): applying the status line integration and rolling it back (검증 1, 2, 5).

import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { Integration, isHookCommand } from '../src/main/integration';
import type { Paths } from '../src/main/paths';
import { tempDir } from './helpers';

describe('Integration', () => {
  let paths: Paths;
  let integration: Integration;

  beforeEach(() => {
    const dir = tempDir();
    paths = {
      dataDir: join(dir, 'data'),
      claudeSettings: join(dir, 'settings.json'),
      codexSessions: join(dir, 'codex'),
    };
    integration = new Integration(paths, {
      runtime: '/Applications/App',
      script: '/app/dist/hook/statusline-hook.js',
    });
  });

  const settings = () => JSON.parse(readFileSync(paths.claudeSettings, 'utf8'));

  it('keeps an existing command and every other setting (검증 1)', () => {
    writeFileSync(
      paths.claudeSettings,
      JSON.stringify({
        model: 'opus',
        statusLine: { type: 'command', command: '~/bin/line.sh', padding: 1 },
      }),
    );
    const status = integration.apply();
    expect(status.applied).toBe(true);
    expect(status.lastApply?.ok).toBe(true);
    expect(status.previousCommand).toBe('~/bin/line.sh');
    expect(settings().model).toBe('opus');
    expect(settings().statusLine.padding).toBe(1);
    expect(isHookCommand(settings().statusLine.command)).toBe(true);
    const saved = JSON.parse(readFileSync(join(paths.dataDir, 'statusline-integration.json'), 'utf8'));
    expect(saved.previousCommand).toBe('~/bin/line.sh');
  });

  it('applies when there is no settings file or no status line (검증 2)', () => {
    const status = integration.apply();
    expect(status.applied).toBe(true);
    expect(status.previousCommand).toBeNull();
    expect(settings().statusLine.type).toBe('command');
  });

  it('is idempotent and never records the hook as the previous command', () => {
    writeFileSync(
      paths.claudeSettings,
      JSON.stringify({ statusLine: { type: 'command', command: 'echo hi' } }),
    );
    integration.apply();
    const again = integration.apply();
    expect(again.lastApply?.message).toContain('이미 연동');
    expect(again.previousCommand).toBe('echo hi');
  });

  it('leaves the settings file as it was when it cannot be written (검증 5)', () => {
    const original = JSON.stringify({ statusLine: { type: 'command', command: 'echo keep' } });
    writeFileSync(paths.claudeSettings, original);
    chmodSync(paths.claudeSettings, 0o444);
    const status = integration.apply();
    expect(status.applied).toBe(false);
    expect(status.lastApply?.ok).toBe(false);
    expect(status.lastApply?.message).toContain('적용 전 상태 그대로');
    expect(readFileSync(paths.claudeSettings, 'utf8')).toBe(original);
    expect(existsSync(join(paths.dataDir, 'statusline-integration.json'))).toBe(false);
  });

  it('refuses a settings file that is not JSON and leaves it untouched', () => {
    writeFileSync(paths.claudeSettings, '{ broken');
    const status = integration.apply();
    expect(status.lastApply?.ok).toBe(false);
    expect(readFileSync(paths.claudeSettings, 'utf8')).toBe('{ broken');
  });

  it('reports a hook write error only while applied (검증 9)', () => {
    integration.apply();
    writeFileSync(
      join(paths.dataDir, 'claude-hook-error.json'),
      JSON.stringify({ at: '2026-10-28T03:00:00.000Z', message: 'EACCES' }),
    );
    expect(integration.status().hookError?.message).toBe('EACCES');
  });
});
