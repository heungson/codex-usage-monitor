// Claude Code runs this as its status line command once the integration is applied (FC-F003).
// It records the rate limits from the status line input, then runs the person's previous status
// line command with the same input so their status line looks exactly as before.
//
// It reads only its stdin and the app's data folder, sends nothing anywhere, and uses no token.

import { spawnSync } from 'node:child_process';
import {
  accessSync,
  constants,
  existsSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import { mergeRecord, parseRecord, recordFromStatusLine, type ClaudeRecord } from '../shared/claude-record';

const files = {
  record: 'claude-rate-limits.json',
  hookError: 'claude-hook-error.json',
  integration: 'statusline-integration.json',
};

function dataDirFromArgs(argv: string[]): string {
  const at = argv.indexOf('--home');
  const dir = at >= 0 ? argv[at + 1] : process.env.ULM_HOME;
  if (!dir) throw new Error('statusline-hook: --home <data folder> is required');
  return dir;
}

/** Writes the record, failing when the existing file is not writable (as the person set it). */
function writeRecord(dataDir: string, text: string): void {
  const target = join(dataDir, files.record);
  if (existsSync(target)) accessSync(target, constants.W_OK);
  const temp = `${target}.${process.pid}.tmp`;
  writeFileSync(temp, text);
  renameSync(temp, target);
}

/** The record on disk, or null when there is none or it cannot be read: then the input is written as it is. */
function currentRecord(dataDir: string): ClaudeRecord | null {
  try {
    return parseRecord(readFileSync(join(dataDir, files.record), 'utf8'));
  } catch {
    return null;
  }
}

function readStdin(): string {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function main(): number {
  const dataDir = dataDirFromArgs(process.argv);
  const input = readStdin();

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(input);
  } catch {
    // Not JSON: keep the previous record and say nothing (LHS-2 검증 8).
  }

  const incoming = recordFromStatusLine(parsed, new Date());
  // Several Claude Code windows share this record: an old, lower value from an idle one is not
  // written over a newer one, and nothing is written when nothing is newer (LHS-2, owner 2026-10-30).
  const current = incoming === null ? null : currentRecord(dataDir);
  const record = incoming === null || current === null ? incoming : mergeRecord(current, incoming);
  if (record !== null) {
    try {
      writeRecord(dataDir, `${JSON.stringify(record, null, 2)}\n`);
      const errorFile = join(dataDir, files.hookError);
      if (existsSync(errorFile)) unlinkSync(errorFile);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      const target = join(dataDir, files.record);
      const message =
        code === 'EACCES' || code === 'EPERM'
          ? `${target}에 쓸 권한이 없어요`
          : code === 'ENOSPC'
            ? '디스크 공간이 부족해요'
            : (error as Error).message;
      try {
        writeFileSync(
          join(dataDir, files.hookError),
          JSON.stringify({ at: new Date().toISOString(), message }),
        );
      } catch {
        // The data folder itself is not writable; the reader reports that instead.
      }
    }
  }

  let previousCommand: string | null;
  try {
    const integration = JSON.parse(readFileSync(join(dataDir, files.integration), 'utf8')) as {
      previousCommand?: string | null;
    };
    previousCommand = integration.previousCommand ?? null;
  } catch {
    previousCommand = null;
  }
  if (previousCommand === null) return 0;

  // The previous command must not inherit the flag that made Electron run this file as Node.
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const result = spawnSync('/bin/sh', ['-c', previousCommand], {
    input,
    stdio: ['pipe', 'inherit', 'inherit'],
    env,
  });
  return result.status ?? 0;
}

process.exitCode = main();
