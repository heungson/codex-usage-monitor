// The local record the status line hook writes and the Claude Code reader reads (FC-F003 → FC-F004).
// Format and rules: docs/claude-record.md.

export interface ClaudeRecordWindow {
  usedPercentage: number;
  /** Epoch milliseconds, or null when Claude Code sent none. */
  resetsAt: number | null;
}

export interface ClaudeRecord {
  version: 1;
  /** ISO time the hook wrote this record: the «마지막 갱신» time. */
  updatedAt: string;
  fiveHour: ClaudeRecordWindow | null;
  sevenDay: ClaudeRecordWindow | null;
}

/** Accepts epoch seconds, epoch milliseconds or an ISO string; anything else is null. */
export function toEpochMs(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value < 1e12 ? value * 1000 : value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function windowFrom(raw: unknown): ClaudeRecordWindow | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { used_percentage: used, resets_at: resets } = raw as Record<string, unknown>;
  if (typeof used !== 'number' || !Number.isFinite(used)) return null;
  return { usedPercentage: used, resetsAt: toEpochMs(resets) };
}

/**
 * Builds a record from one status line input. Returns null when the input carries no usable limit
 * values, in which case the hook keeps the previous record untouched.
 */
export function recordFromStatusLine(input: unknown, now: Date): ClaudeRecord | null {
  if (typeof input !== 'object' || input === null) return null;
  const limits = (input as Record<string, unknown>).rate_limits;
  if (typeof limits !== 'object' || limits === null) return null;
  const fiveHour = windowFrom((limits as Record<string, unknown>).five_hour);
  const sevenDay = windowFrom((limits as Record<string, unknown>).seven_day);
  if (fiveHour === null && sevenDay === null) return null;
  return { version: 1, updatedAt: now.toISOString(), fiveHour, sevenDay };
}

/** Validates a record read back from disk; throws with a reason when it is not one. */
export function parseRecord(text: string): ClaudeRecord {
  const value = JSON.parse(text) as Partial<ClaudeRecord>;
  if (value.version !== 1) throw new Error('기록 형식을 알 수 없어요');
  if (typeof value.updatedAt !== 'string' || Number.isNaN(Date.parse(value.updatedAt)))
    throw new Error('기록에 갱신 시각이 없어요');
  const check = (w: unknown): ClaudeRecordWindow | null => {
    if (w === null || w === undefined) return null;
    const win = w as ClaudeRecordWindow;
    if (typeof win.usedPercentage !== 'number') throw new Error('기록의 사용 비율을 읽을 수 없어요');
    return {
      usedPercentage: win.usedPercentage,
      resetsAt: typeof win.resetsAt === 'number' ? win.resetsAt : null,
    };
  };
  return {
    version: 1,
    updatedAt: value.updatedAt,
    fiveHour: check(value.fiveHour),
    sevenDay: check(value.sevenDay),
  };
}
