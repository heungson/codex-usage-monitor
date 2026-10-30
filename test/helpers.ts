import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function tempDir(prefix = 'ulm-'): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

/** One Codex session log line carrying rate limits, as Codex writes it. */
export function codexLine(
  timestamp: string,
  primary: { used_percent: number; window_minutes: number; resets_at: number } | null,
  secondary: { used_percent: number; window_minutes: number; resets_at: number } | null = null,
  planType = 'pro',
): string {
  return JSON.stringify({
    timestamp,
    type: 'event_msg',
    payload: {
      type: 'token_count',
      info: { total_token_usage: { input_tokens: 1 } },
      rate_limits: { limit_id: 'codex', primary, secondary, plan_type: planType },
    },
  });
}

/** A status line input as Claude Code 2.1.312 sends it, reduced to the fields this app uses. */
export function statusLineInput(
  fiveHour: { used_percentage: number; resets_at: number } | null,
  sevenDay: { used_percentage: number; resets_at: number } | null,
): string {
  const rate_limits: Record<string, unknown> = {};
  if (fiveHour) rate_limits.five_hour = fiveHour;
  if (sevenDay) rate_limits.seven_day = sevenDay;
  return JSON.stringify({ session_id: 's', model: { id: 'claude' }, rate_limits });
}
