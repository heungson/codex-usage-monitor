// A stand-in for codex-resets.com, so checks can make the API slow, empty or failing.
// The mode is read from a JSON file on every request: { status: Mode, history: Mode, delayMs?: number }.

import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export type Mode = 'ok' | 'empty' | 'fail';

const entries = Array.from({ length: 14 }, (_, i) => ({
  id: `r${i}`,
  reset_type: i % 5 === 3 ? 'banked' : 'regular',
  announced_at: new Date(Date.UTC(2026, 9, 26 - i * 3, 7, 0)).toISOString(),
  text:
    i === 0
      ? 'Codex usage limits have been reset. Check your limits.'
      : `Reset announcement number ${14 - i}: limits are fresh again for all paid users of Codex.`,
  // Post ids exceed Number.MAX_SAFE_INTEGER, so they are built as strings.
  source: {
    type: 'x_post',
    url: `https://x.com/thsottiaux/status/21145881742490711${String(10 - i).padStart(2, '0')}`,
  },
}));

export interface FakeServer {
  url: string;
  requests: string[];
  close(): Promise<void>;
}

export async function startFakeResets(modeFile: string): Promise<FakeServer> {
  const requests: string[] = [];
  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    requests.push(
      `${req.method} ${url.pathname}${url.search} auth=${req.headers.authorization ?? '-'} cookie=${req.headers.cookie ?? '-'}`,
    );
    const mode = JSON.parse(readFileSync(modeFile, 'utf8')) as {
      status: Mode;
      history: Mode;
      delayMs?: number;
    };
    const reply = (code: number, body: unknown) =>
      setTimeout(() => {
        res.writeHead(code, { 'content-type': 'application/json' });
        res.end(JSON.stringify(body));
      }, mode.delayMs ?? 0);

    if (url.pathname === '/api/v1/status') {
      if (mode.status === 'fail') return reply(503, { title: 'Service Unavailable' });
      if (mode.status === 'empty')
        return reply(200, { data: { latest_reset: null, scheduled_reset: null, stats: { total: 0 } } });
      return reply(200, {
        data: {
          latest_reset: entries[0],
          scheduled_reset: null,
          stats: {
            total: 68,
            last_reset_at: entries[0]!.announced_at,
            days_since_last: 1.8,
            avg_interval_days: 6,
          },
        },
      });
    }
    if (url.pathname === '/api/v1/resets') {
      if (mode.history === 'fail') return reply(500, { title: 'Internal Server Error' });
      if (mode.history === 'empty')
        return reply(200, { data: [], pagination: { has_more: false, next_cursor: null } });
      const start = Number(url.searchParams.get('cursor') ?? 0);
      const page = entries.slice(start, start + 10);
      const next = start + 10 < entries.length ? String(start + 10) : null;
      return reply(200, { data: page, pagination: { has_more: next !== null, next_cursor: next } });
    }
    reply(404, {});
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
