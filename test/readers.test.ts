// LHS-3 (FC-F004) and LHS-4 (FC-F006): reading the local records.

import { appendFileSync, chmodSync, mkdirSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { claudeReader } from '../src/main/claude-reader';
import { codexReader } from '../src/main/codex-reader';
import { codexLine, tempDir } from './helpers';

describe('claudeReader', () => {
  let dataDir: string;
  beforeEach(() => {
    dataDir = tempDir();
  });
  const write = (record: object) =>
    writeFileSync(join(dataDir, 'claude-rate-limits.json'), JSON.stringify(record));

  it('returns null with no record: 수집 대기, never 0% (검증 3)', async () => {
    expect(await claudeReader(dataDir)()).toBeNull();
  });

  it('returns both windows and the record time, not the read time (검증 1, 2)', async () => {
    write({
      version: 1,
      updatedAt: '2026-10-28T01:00:00.000Z',
      fiveHour: { usedPercentage: 12, resetsAt: 1 },
      sevenDay: { usedPercentage: 70, resetsAt: 2 },
    });
    const usage = await claudeReader(dataDir)();
    expect(usage?.windows.map((w) => [w.key, w.usedPercent, w.resetsAt])).toEqual([
      ['five_hour', 12, 1],
      ['seven_day', 70, 2],
    ]);
    expect(usage?.updatedAt).toBe(Date.parse('2026-10-28T01:00:00.000Z'));
  });

  it('fails on a damaged record (검증 4, 9)', async () => {
    writeFileSync(join(dataDir, 'claude-rate-limits.json'), '{"version":1,');
    await expect(claudeReader(dataDir)()).rejects.toThrow('손상');
  });

  it('fails on an unreadable record (검증 5)', async () => {
    write({ version: 1, updatedAt: '2026-10-28T01:00:00.000Z', fiveHour: null, sevenDay: null });
    chmodSync(join(dataDir, 'claude-rate-limits.json'), 0o000);
    await expect(claudeReader(dataDir)()).rejects.toThrow('권한');
    chmodSync(join(dataDir, 'claude-rate-limits.json'), 0o644);
  });
});

describe('codexReader', () => {
  let sessions: string;
  const now = () => Date.parse('2026-10-28T03:00:00.000Z');
  beforeEach(() => {
    sessions = tempDir();
    mkdirSync(join(sessions, '2026', '10', '28'), { recursive: true });
  });
  const file = (name: string) => join(sessions, '2026', '10', '28', name);
  const window = (used: number, minutes = 300, resets = 1793160000) => ({
    used_percent: used,
    window_minutes: minutes,
    resets_at: resets,
  });

  it('returns null without sessions or events (검증 3)', async () => {
    expect(await codexReader(join(sessions, 'missing'), now)()).toBeNull();
    writeFileSync(file('a.jsonl'), '{"timestamp":"2026-10-28T01:00:00Z","type":"x"}\n');
    expect(await codexReader(sessions, now)()).toBeNull();
  });

  it('reads every field of the newest event in a file (검증 1)', async () => {
    writeFileSync(
      file('a.jsonl'),
      [
        codexLine('2026-10-28T01:00:00.000Z', window(10)),
        codexLine(
          '2026-10-28T02:00:00.000Z',
          window(44, 300, 1793170000),
          window(20, 10080, 1793600000),
          'prolite',
        ),
        '{"timestamp":"2026-10-28T02:01:00Z","type":"response_item"}',
      ].join('\n') + '\n',
    );
    const usage = await codexReader(sessions, now)();
    expect(usage?.windows).toEqual([
      { key: 'primary', windowMinutes: 300, usedPercent: 44, resetsAt: 1793170000000 },
      { key: 'secondary', windowMinutes: 10080, usedPercent: 20, resetsAt: 1793600000000 },
    ]);
    expect(usage?.planType).toBe('prolite');
    expect(usage?.updatedAt).toBe(Date.parse('2026-10-28T02:00:00.000Z'));
  });

  it('picks the latest event time across sessions, not the latest modified file (검증 2)', async () => {
    writeFileSync(file('newer-event.jsonl'), codexLine('2026-10-28T02:30:00.000Z', window(77)) + '\n');
    writeFileSync(file('older-event.jsonl'), codexLine('2026-10-28T01:00:00.000Z', window(5)) + '\n');
    // The file with the older event was modified last.
    utimesSync(file('newer-event.jsonl'), new Date('2026-10-28T02:30:00Z'), new Date('2026-10-28T02:30:00Z'));
    utimesSync(file('older-event.jsonl'), new Date('2026-10-28T02:50:00Z'), new Date('2026-10-28T02:50:00Z'));
    const read = codexReader(sessions, now);
    expect((await read())?.windows[0]?.usedPercent).toBe(77);
    appendFileSync(file('older-event.jsonl'), codexLine('2026-10-28T02:40:00.000Z', window(88)) + '\n');
    expect((await read())?.windows[0]?.usedPercent).toBe(88);
  });

  it('skips a last line that is still being written', async () => {
    writeFileSync(
      file('a.jsonl'),
      codexLine('2026-10-28T01:00:00.000Z', window(30)) +
        '\n' +
        codexLine('2026-10-28T02:00:00.000Z', window(31)).slice(0, 40),
    );
    expect((await codexReader(sessions, now)())?.windows[0]?.usedPercent).toBe(30);
  });

  it('fails on an event it cannot parse, and recovers once fixed (검증 5)', async () => {
    writeFileSync(
      file('a.jsonl'),
      '{"timestamp":"2026-10-28T01:00:00Z","payload":{"rate_limits":{"primary":\n',
    );
    const read = codexReader(sessions, now);
    await expect(read()).rejects.toThrow('해석할 수 없어요');
    writeFileSync(file('a.jsonl'), codexLine('2026-10-28T01:00:00.000Z', window(9)) + '\n');
    expect((await read())?.windows[0]?.usedPercent).toBe(9);
  });

  it('fails when a recent session file cannot be read, even after a cached read (검증 4)', async () => {
    writeFileSync(file('a.jsonl'), codexLine('2026-10-28T01:00:00.000Z', window(9)) + '\n');
    const read = codexReader(sessions, now);
    expect((await read())?.windows[0]?.usedPercent).toBe(9);
    chmodSync(file('a.jsonl'), 0o000);
    await expect(read()).rejects.toThrow('권한');
    chmodSync(file('a.jsonl'), 0o644);
    expect((await read())?.windows[0]?.usedPercent).toBe(9);
  });

  it('ignores sessions untouched for more than 8 days', async () => {
    writeFileSync(file('old.jsonl'), '{"payload":{"rate_limits":{broken\n');
    utimesSync(file('old.jsonl'), new Date('2026-10-10T00:00:00Z'), new Date('2026-10-10T00:00:00Z'));
    expect(await codexReader(sessions, now)()).toBeNull();
  });
});
