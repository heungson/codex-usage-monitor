// LHS-2 (FC-F003): the hook records the limits and runs the previous command (검증 1, 3, 4, 7, 8, 9).
// These run the built hook (dist/hook/statusline-hook.js); `npm test` builds first via pretest.

import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { statusLineInput, tempDir } from './helpers';

const hook = join(__dirname, '..', 'dist', 'hook', 'statusline-hook.js');

function runHook(dataDir: string, input: string) {
  return spawnSync(process.execPath, [hook, '--home', dataDir], {
    input,
    encoding: 'utf8',
    // No token or network-related variable is given; the hook needs none (검증 4).
    env: { PATH: process.env.PATH ?? '/usr/bin:/bin' },
  });
}

describe('statusline hook', () => {
  let dataDir: string;
  const record = () => JSON.parse(readFileSync(join(dataDir, 'claude-rate-limits.json'), 'utf8'));

  beforeEach(() => {
    dataDir = tempDir();
  });

  it('records each window separately with the update time (검증 3, 4)', () => {
    const before = Date.now();
    const result = runHook(
      dataDir,
      statusLineInput(
        { used_percentage: 12.5, resets_at: 1793160000 },
        { used_percentage: 61, resets_at: 1793600000 },
      ),
    );
    expect(result.status).toBe(0);
    const saved = record();
    expect(saved.fiveHour).toEqual({ usedPercentage: 12.5, resetsAt: 1793160000000 });
    expect(saved.sevenDay).toEqual({ usedPercentage: 61, resetsAt: 1793600000000 });
    expect(Date.parse(saved.updatedAt)).toBeGreaterThanOrEqual(before - 1000);
  });

  it('runs the previous command with the same input and prints its output (검증 1)', () => {
    writeFileSync(
      join(dataDir, 'statusline-integration.json'),
      JSON.stringify({ previousCommand: 'cat | wc -c' }),
    );
    const input = statusLineInput({ used_percentage: 5, resets_at: 1793160000 }, null);
    const result = runHook(dataDir, input);
    expect(result.stdout.trim()).toBe(String(Buffer.byteLength(input)));
    expect(record().fiveHour.usedPercentage).toBe(5);
  });

  it('keeps the existing record when the input has no limits (검증 7)', () => {
    runHook(dataDir, statusLineInput({ used_percentage: 40, resets_at: 1793160000 }, null));
    const first = readFileSync(join(dataDir, 'claude-rate-limits.json'), 'utf8');
    const result = runHook(dataDir, JSON.stringify({ session_id: 's' }));
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
    expect(readFileSync(join(dataDir, 'claude-rate-limits.json'), 'utf8')).toBe(first);
  });

  it('keeps the existing record when the input is not JSON (검증 8)', () => {
    runHook(dataDir, statusLineInput({ used_percentage: 40, resets_at: 1793160000 }, null));
    const first = readFileSync(join(dataDir, 'claude-rate-limits.json'), 'utf8');
    const result = runHook(dataDir, '{not json');
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
    expect(readFileSync(join(dataDir, 'claude-rate-limits.json'), 'utf8')).toBe(first);
  });

  it('leaves an error marker when the record file is not writable, and clears it after (검증 9)', () => {
    runHook(dataDir, statusLineInput({ used_percentage: 40, resets_at: 1793160000 }, null));
    const file = join(dataDir, 'claude-rate-limits.json');
    chmodSync(file, 0o444);
    runHook(dataDir, statusLineInput({ used_percentage: 41, resets_at: 1793160000 }, null));
    expect(existsSync(join(dataDir, 'claude-hook-error.json'))).toBe(true);
    expect(record().fiveHour.usedPercentage).toBe(40);
    chmodSync(file, 0o644);
    runHook(dataDir, statusLineInput({ used_percentage: 42, resets_at: 1793160000 }, null));
    expect(existsSync(join(dataDir, 'claude-hook-error.json'))).toBe(false);
    expect(record().fiveHour.usedPercentage).toBe(42);
  });
});
