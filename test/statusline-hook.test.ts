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

  // Several Claude Code windows write the same record; an idle one must not write old values over new
  // ones (LHS-2 comment, owner 2026-10-30). Reset times are epoch seconds, as Claude Code sends them.
  describe('with a record already there', () => {
    const fiveReset = 1793160000;
    const sevenReset = 1793600000;
    const file = () => join(dataDir, 'claude-rate-limits.json');
    const write = (five: number, seven: number, fiveAt = fiveReset, sevenAt = sevenReset) =>
      runHook(
        dataDir,
        statusLineInput(
          { used_percentage: five, resets_at: fiveAt },
          { used_percentage: seven, resets_at: sevenAt },
        ),
      );
    const settle = () => new Promise((resolve) => setTimeout(resolve, 15));

    it('ignores lower values in the same windows and does not touch the file', async () => {
      write(75, 40);
      const before = readFileSync(file(), 'utf8');
      await settle();
      const result = write(57, 38);
      expect(result.status).toBe(0);
      expect(readFileSync(file(), 'utf8')).toBe(before);
    });

    it('takes equal or higher values, with a new update time', async () => {
      write(75, 40);
      const first = record().updatedAt;
      await settle();
      write(75, 40);
      const equal = record();
      expect(equal.fiveHour.usedPercentage).toBe(75);
      expect(Date.parse(equal.updatedAt)).toBeGreaterThan(Date.parse(first));
      write(80, 41);
      expect(record().fiveHour.usedPercentage).toBe(80);
      expect(record().sevenDay.usedPercentage).toBe(41);
    });

    it('takes a lower value with a new reset time: a new window', () => {
      write(75, 40);
      write(3, 40, fiveReset + 5 * 3600);
      expect(record().fiveHour).toEqual({ usedPercentage: 3, resetsAt: (fiveReset + 5 * 3600) * 1000 });
    });

    it('counts reset times less than 5 minutes apart as the same window, 5 minutes as a new one', async () => {
      write(75, 40);
      const before = readFileSync(file(), 'utf8');
      await settle();
      write(57, 38, fiveReset + 4 * 60 + 59, sevenReset - 60);
      expect(readFileSync(file(), 'utf8')).toBe(before);
      write(57, 38, fiveReset + 5 * 60, sevenReset);
      expect(record().fiveHour.usedPercentage).toBe(57);
      expect(record().sevenDay.usedPercentage).toBe(40);
    });

    it('decides each window on its own: an old 5-hour value beside a newer 7-day one', async () => {
      write(75, 40);
      const first = record().updatedAt;
      await settle();
      write(57, 45);
      const merged = record();
      expect(merged.fiveHour.usedPercentage).toBe(75);
      expect(merged.sevenDay.usedPercentage).toBe(45);
      expect(Date.parse(merged.updatedAt)).toBeGreaterThan(Date.parse(first));
    });

    it('still runs the previous command when it writes nothing', () => {
      write(75, 40);
      writeFileSync(
        join(dataDir, 'statusline-integration.json'),
        JSON.stringify({ previousCommand: 'echo kept' }),
      );
      const result = write(57, 38);
      expect(result.stdout.trim()).toBe('kept');
      expect(record().fiveHour.usedPercentage).toBe(75);
    });

    it('writes the input as it is when there is no record', () => {
      expect(existsSync(file())).toBe(false);
      write(57, 38);
      expect(record().fiveHour.usedPercentage).toBe(57);
    });

    it('writes the input as it is over a damaged record', () => {
      writeFileSync(file(), '{"version":1,');
      write(57, 38);
      expect(record().fiveHour.usedPercentage).toBe(57);
      expect(record().sevenDay.usedPercentage).toBe(38);
    });
  });
});
