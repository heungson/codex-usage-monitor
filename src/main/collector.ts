// Keeps one CLI's SourceState: re-reads on a fixed interval, keeps the last good value through a
// failure, and retries on the same interval until a read succeeds (FC-F004, FC-F006, PR-P020).

import type { CliUsage, SourceState } from '../shared/types';

/** Returns the usage, or null when there is no record yet (수집 대기). Throws when reading fails. */
export type Reader = () => Promise<CliUsage | null>;

export interface CollectorOptions {
  intervalMs: number;
  onChange: (state: SourceState) => void;
  now?: () => number;
  /** Test hook: hold every read this long, to show the loading state (ULM_READ_DELAY_MS). */
  delayMs?: number;
}

export class Collector {
  private current: SourceState = { kind: 'loading' };
  private timer: NodeJS.Timeout | null = null;
  private nextTickAt: number | null = null;
  private inFlight: Promise<SourceState> | null = null;
  private readonly now: () => number;

  constructor(
    private readonly read: Reader,
    private readonly options: CollectorOptions,
  ) {
    this.now = options.now ?? Date.now;
  }

  get state(): SourceState {
    return this.current;
  }

  start(): void {
    if (this.timer) return;
    this.nextTickAt = this.now() + this.options.intervalMs;
    this.timer = setInterval(() => {
      this.nextTickAt = this.now() + this.options.intervalMs;
      void this.refresh(true);
    }, this.options.intervalMs);
    void this.refresh();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.nextTickAt = null;
  }

  /**
   * Reads now. Concurrent callers share one read. `automatic` is the interval's re-read: after a
   * failure it is the automatic retry, shown as 자동 재시도 중 while it runs (LHS-6 검증 10).
   */
  refresh(automatic = false): Promise<SourceState> {
    if (automatic && !this.inFlight && this.current.kind === 'error' && !this.current.retrying) {
      this.current = { ...this.current, retrying: true };
      this.options.onChange(this.current);
    }
    this.inFlight ??= this.readOnce().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private lastGood(): CliUsage | null {
    if (this.current.kind === 'ok') return this.current.usage;
    if (this.current.kind === 'error') return this.current.lastGood;
    return null;
  }

  private async readOnce(): Promise<SourceState> {
    if (this.options.delayMs) await new Promise((resolve) => setTimeout(resolve, this.options.delayMs));
    let next: SourceState;
    try {
      const usage = await this.read();
      next = usage === null ? { kind: 'waiting' } : { kind: 'ok', usage, readAt: this.now() };
    } catch (error) {
      next = {
        kind: 'error',
        message: (error as Error).message,
        lastGood: this.lastGood(),
        nextRetryAt: this.nextTickAt,
        retrying: false,
      };
    }
    const changed = JSON.stringify(next) !== JSON.stringify(this.current);
    this.current = next;
    if (changed) this.options.onChange(next);
    return next;
  }
}
