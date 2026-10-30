// The codex-resets.com public API (PR-P018): no key, nothing about the person is sent.
// Data from it is shown with a link back to https://codex-resets.com, as the API terms ask.

import type { ResetEntry, ResetStatus } from '../shared/types';

export const resetsSite = 'https://codex-resets.com';

export interface ResetsApi {
  status(): Promise<ResetStatus>;
  history(
    cursor: string | null,
    limit: number,
  ): Promise<{ entries: ResetEntry[]; nextCursor: string | null }>;
}

interface RawEntry {
  id?: unknown;
  reset_type?: unknown;
  announced_at?: unknown;
  text?: unknown;
  source?: { url?: unknown } | null;
}

const formatError = () => new Error('codex-resets.com 응답 형식을 알 수 없어요');

function entryFrom(raw: unknown): ResetEntry | null {
  if (raw === null || raw === undefined) return null;
  const value = raw as RawEntry;
  const announcedAt = typeof value.announced_at === 'string' ? Date.parse(value.announced_at) : NaN;
  if (typeof value.id !== 'string' || Number.isNaN(announcedAt)) throw formatError();
  return {
    id: value.id,
    type: typeof value.reset_type === 'string' ? value.reset_type : 'regular',
    announcedAt,
    text: typeof value.text === 'string' ? value.text : '',
    sourceUrl: typeof value.source?.url === 'string' ? value.source.url : null,
  };
}

export function resetsApi(baseUrl: string, fetchImpl: typeof fetch = fetch): ResetsApi {
  async function get(path: string): Promise<unknown> {
    let response: Response;
    try {
      response = await fetchImpl(new URL(path, baseUrl), {
        headers: { accept: 'application/json', 'user-agent': 'usage-limit-monitor/0.1' },
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new Error('codex-resets.com에 연결하지 못했어요');
    }
    if (!response.ok) throw new Error(`codex-resets.com이 ${response.status} 오류로 응답했어요`);
    try {
      return await response.json();
    } catch {
      throw formatError();
    }
  }

  return {
    async status() {
      const body = (await get('/api/v1/status')) as { data?: Record<string, unknown> };
      const data = body?.data;
      if (!data || typeof data !== 'object') throw formatError();
      const stats = (data.stats ?? {}) as Record<string, unknown>;
      return {
        latest: entryFrom(data.latest_reset),
        scheduled: entryFrom(data.scheduled_reset),
        avgIntervalDays: typeof stats.avg_interval_days === 'number' ? stats.avg_interval_days : null,
        daysSinceLast: typeof stats.days_since_last === 'number' ? stats.days_since_last : null,
        total: typeof stats.total === 'number' ? stats.total : 0,
      };
    },
    async history(cursor, limit) {
      const query = new URLSearchParams({ limit: String(limit), order: 'desc' });
      if (cursor) query.set('cursor', cursor);
      const body = (await get(`/api/v1/resets?${query}`)) as {
        data?: unknown[];
        pagination?: { has_more?: unknown; next_cursor?: unknown };
      };
      if (!Array.isArray(body?.data)) throw formatError();
      const entries = body.data.map(entryFrom).filter((e): e is ResetEntry => e !== null);
      const more = body.pagination?.has_more === true && typeof body.pagination.next_cursor === 'string';
      return { entries, nextCursor: more ? (body.pagination!.next_cursor as string) : null };
    },
  };
}

/** True when the status has nothing to show: 결과 없음 (WF-S003). */
export function statusIsEmpty(status: ResetStatus): boolean {
  return status.latest === null && status.scheduled === null && status.total === 0;
}
