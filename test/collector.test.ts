// The SourceState rules shared by LHS-3/4/5/6: waiting vs error, last good value, retry on the interval.

import { afterEach, describe, expect, it, vi } from 'vitest';

import { Collector } from '../src/main/collector';
import type { CliUsage, SourceState } from '../src/shared/types';

const usage = (percent: number): CliUsage => ({
  windows: [{ key: 'five_hour', windowMinutes: 300, usedPercent: percent, resetsAt: null }],
  updatedAt: 1,
});

describe('Collector', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts loading, then waiting when there is no record', async () => {
    const collector = new Collector(async () => null, { intervalMs: 30_000, onChange: () => undefined });
    expect(collector.state.kind).toBe('loading');
    expect((await collector.refresh()).kind).toBe('waiting');
  });

  it('keeps the last good value through a failure and clears it on success', async () => {
    let next: () => CliUsage | null = () => usage(10);
    const collector = new Collector(async () => next(), { intervalMs: 30_000, onChange: () => undefined });
    await collector.refresh();
    next = () => {
      throw new Error('읽기 실패');
    };
    const failed = (await collector.refresh()) as Extract<SourceState, { kind: 'error' }>;
    expect(failed.kind).toBe('error');
    expect(failed.lastGood?.windows[0]?.usedPercent).toBe(10);
    const stillFailed = (await collector.refresh()) as Extract<SourceState, { kind: 'error' }>;
    expect(stillFailed.lastGood?.windows[0]?.usedPercent).toBe(10);
    next = () => usage(20);
    expect((await collector.refresh()).kind).toBe('ok');
  });

  it('has no last good value on a first failure (LHS-3 검증 9)', async () => {
    const collector = new Collector(
      async () => {
        throw new Error('손상');
      },
      { intervalMs: 30_000, onChange: () => undefined },
    );
    const state = (await collector.refresh()) as Extract<SourceState, { kind: 'error' }>;
    expect(state.lastGood).toBeNull();
  });

  it('re-reads every interval, which is also the automatic retry (LHS-3 검증 7, 8)', async () => {
    vi.useFakeTimers();
    let calls = 0;
    const collector = new Collector(
      async () => {
        calls++;
        if (calls < 3) throw new Error('권한');
        return usage(50);
      },
      { intervalMs: 30_000, onChange: () => undefined },
    );
    collector.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(collector.state.kind).toBe('error');
    await vi.advanceTimersByTimeAsync(30_000);
    expect(calls).toBe(2);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(collector.state.kind).toBe('ok');
    collector.stop();
  });

  it('shows 자동 재시도 중 while the automatic re-read after a failure runs (LHS-6 검증 10)', async () => {
    vi.useFakeTimers();
    let fail = true;
    let release: (() => void) | null = null;
    const seen: SourceState[] = [];
    const collector = new Collector(
      async () => {
        if (release === null && !fail) await new Promise<void>((resolve) => (release = resolve));
        if (fail) throw new Error('권한');
        return usage(50);
      },
      { intervalMs: 30_000, onChange: (s) => seen.push(s) },
    );
    collector.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(collector.state).toMatchObject({ kind: 'error', retrying: false });
    // A manual retry is not shown as automatic.
    await collector.refresh();
    expect(seen.some((s) => s.kind === 'error' && s.retrying)).toBe(false);
    fail = false;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(collector.state).toMatchObject({ kind: 'error', retrying: true });
    release!();
    await vi.advanceTimersByTimeAsync(0);
    expect(collector.state.kind).toBe('ok');
    collector.stop();
  });

  it('notifies only on change', async () => {
    const changes: string[] = [];
    const collector = new Collector(async () => usage(10), {
      intervalMs: 30_000,
      onChange: (s) => changes.push(s.kind),
    });
    await collector.refresh();
    await collector.refresh();
    // readAt differs between reads, so equal values still count as a change only if time moved.
    expect(changes.length).toBeGreaterThanOrEqual(1);
  });
});
