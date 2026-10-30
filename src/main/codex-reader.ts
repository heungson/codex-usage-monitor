// Reads Codex rate limits from the session logs under ~/.codex/sessions (FC-F006, PR-P018).
//
// Each session file is a JSONL log in time order, so its newest rate_limits event is the last one in
// the file; files are read backwards from the end and only re-read when their size or mtime changes.
// Across sessions the event with the latest timestamp wins (WF-Q005), whatever order the files were
// modified in. Files untouched for longer than the longest window (7 days) plus a day are ignored:
// their limits have reset since, and one old broken file must not hold the app in an error state.

import { constants } from 'node:fs';
import { access, open, readdir, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';

import type { CliUsage, UsageWindow } from '../shared/types';

const lookbackMs = 8 * 24 * 60 * 60 * 1000;
const chunkSize = 256 * 1024;

interface RateWindow {
  used_percent?: unknown;
  window_minutes?: unknown;
  resets_at?: unknown;
}

interface LimitEvent {
  at: number;
  primary: RateWindow | null;
  secondary: RateWindow | null;
  planType: string | null;
}

interface CacheEntry {
  mtimeMs: number;
  size: number;
  event: LimitEvent | null;
  error: string | null;
}

class FileError extends Error {}

function eventFromLine(line: string, file: string): LimitEvent | null {
  let value: { timestamp?: unknown; payload?: { rate_limits?: Record<string, unknown> | null } };
  try {
    value = JSON.parse(line) as typeof value;
  } catch {
    throw new FileError(`Codex 세션 기록을 해석할 수 없어요 (${basename(file)})`);
  }
  const limits = value.payload?.rate_limits;
  if (!limits || typeof limits !== 'object') return null;
  if (limits.limit_id !== undefined && limits.limit_id !== null && limits.limit_id !== 'codex') return null;
  const primary = (limits.primary ?? null) as RateWindow | null;
  const secondary = (limits.secondary ?? null) as RateWindow | null;
  if (primary === null && secondary === null) return null;
  const at = typeof value.timestamp === 'string' ? Date.parse(value.timestamp) : NaN;
  if (Number.isNaN(at)) throw new FileError(`Codex 세션 기록의 시각을 해석할 수 없어요 (${basename(file)})`);
  return { at, primary, secondary, planType: typeof limits.plan_type === 'string' ? limits.plan_type : null };
}

/** The newest rate_limits event in one file, reading backwards in chunks. */
async function lastEventIn(file: string, size: number): Promise<LimitEvent | null> {
  const handle = await open(file, 'r');
  try {
    let position = size;
    let carry = '';
    let first = true;
    while (position > 0) {
      const length = Math.min(chunkSize, position);
      position -= length;
      const buffer = Buffer.alloc(length);
      await handle.read(buffer, 0, length, position);
      const text = buffer.toString('utf8') + carry;
      const lines = text.split('\n');
      carry = position > 0 ? (lines.shift() ?? '') : '';
      if (first) {
        // A last line without its newline may still be being written; skip it this time.
        if (!text.endsWith('\n')) lines.pop();
        first = false;
      }
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i]!;
        if (!line.includes('"rate_limits"')) continue;
        const event = eventFromLine(line, file);
        if (event) return event;
      }
    }
    if (carry.includes('"rate_limits"')) return eventFromLine(carry, file);
    return null;
  } finally {
    await handle.close();
  }
}

function windowFrom(raw: RateWindow | null, key: string): UsageWindow | null {
  if (!raw || typeof raw.used_percent !== 'number') return null;
  return {
    key,
    windowMinutes: typeof raw.window_minutes === 'number' ? raw.window_minutes : null,
    usedPercent: raw.used_percent,
    resetsAt: typeof raw.resets_at === 'number' ? raw.resets_at * 1000 : null,
  };
}

export function codexReader(
  sessionsDir: string,
  now: () => number = Date.now,
): () => Promise<CliUsage | null> {
  const cache = new Map<string, CacheEntry>();

  return async () => {
    let names: string[];
    try {
      names = (await readdir(sessionsDir, { recursive: true })).filter((name) => name.endsWith('.jsonl'));
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') return null;
      if (code === 'EACCES' || code === 'EPERM')
        throw new Error('Codex 세션 폴더를 읽을 권한이 없어요', { cause: error });
      throw new Error(`Codex 세션 폴더를 읽지 못했어요 (${code ?? 'unknown'})`, { cause: error });
    }

    const cutoff = now() - lookbackMs;
    const seen = new Set<string>();
    let best: LimitEvent | null = null;

    for (const name of names) {
      const file = join(sessionsDir, name);
      let info;
      try {
        info = await stat(file);
      } catch {
        continue;
      }
      if (info.mtimeMs < cutoff) continue;
      seen.add(file);

      // A cached file that became unreadable keeps its size and mtime, so check access every time:
      // without it new events could not be seen while the old value looked current (LHS-4 검증 4).
      try {
        await access(file, constants.R_OK);
      } catch {
        throw new Error(`Codex 세션 기록을 읽을 권한이 없어요 (${basename(file)})`);
      }

      let entry = cache.get(file);
      if (!entry || entry.mtimeMs !== info.mtimeMs || entry.size !== info.size || entry.error) {
        entry = { mtimeMs: info.mtimeMs, size: info.size, event: null, error: null };
        try {
          entry.event = await lastEventIn(file, info.size);
        } catch (error) {
          const code = (error as NodeJS.ErrnoException).code;
          entry.error =
            error instanceof FileError
              ? error.message
              : code === 'EACCES' || code === 'EPERM'
                ? `Codex 세션 기록을 읽을 권한이 없어요 (${basename(file)})`
                : `Codex 세션 기록을 읽지 못했어요 (${basename(file)})`;
        }
        cache.set(file, entry);
      }
      if (entry.error) throw new Error(entry.error);
      if (entry.event && (!best || entry.event.at > best.at)) best = entry.event;
    }
    for (const file of cache.keys()) if (!seen.has(file)) cache.delete(file);

    if (!best) return null;
    const windows = [windowFrom(best.primary, 'primary'), windowFrom(best.secondary, 'secondary')].filter(
      (w): w is UsageWindow => w !== null,
    );
    return { windows, updatedAt: best.at, planType: best.planType };
  };
}
