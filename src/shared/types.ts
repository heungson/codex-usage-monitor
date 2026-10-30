// Shapes shared by the main process, the preload bridge and the renderer.

export type CliId = 'claude' | 'codex';

/** One rate-limit window of one CLI, as the popover shows it. */
export interface UsageWindow {
  /** Stable key for alerts: `five_hour`, `seven_day`, `primary`, `secondary`. */
  key: string;
  /** Window length in minutes when the source says it (Codex), or the fixed length (Claude Code). */
  windowMinutes: number | null;
  usedPercent: number;
  /** Epoch milliseconds, or null when the source gave none. */
  resetsAt: number | null;
}

export interface CliUsage {
  windows: UsageWindow[];
  /**
   * When the source last changed: for Claude Code the time the status line hook wrote the record
   * (FC-F004), for Codex the time of the chosen rate_limits event (FC-F006).
   */
  updatedAt: number | null;
  /** Codex only: the plan type in the chosen event. */
  planType?: string | null;
}

/** What one collector knows right now (PR-P020, WF-S001 states). */
export type SourceState =
  | { kind: 'loading' }
  /** No record yet: 수집 대기. Never shown as 0%. */
  | { kind: 'waiting' }
  | { kind: 'ok'; usage: CliUsage; readAt: number }
  /** A read failed. `lastGood` is the last successful value, shown as not current. */
  | { kind: 'error'; message: string; lastGood: CliUsage | null; nextRetryAt: number | null };

export interface UsageSnapshot {
  claude: SourceState;
  codex: SourceState;
  /** A notice about limit alerts that could not be shown (FC-F014), or null. */
  alertNotice: string | null;
  /** A notice about a new Codex reset that could not be notified (FC-F015), or null. */
  resetNotice: string | null;
}

export interface IntegrationStatus {
  /** The Claude Code settings file this app edits. */
  settingsPath: string;
  applied: boolean;
  /** The status line command that was there before, kept and run after the hook. */
  previousCommand: string | null;
  /** The last apply attempt, if any in this session. */
  lastApply: { ok: boolean; message: string; at: number } | null;
  /** The hook could not write the local record after the integration was applied (FC-F003). */
  hookError: { message: string; at: number } | null;
}

export interface ResetEntry {
  id: string;
  type: string;
  announcedAt: number;
  text: string;
  sourceUrl: string | null;
}

export interface ResetStatus {
  latest: ResetEntry | null;
  scheduled: ResetEntry | null;
  avgIntervalDays: number | null;
  daysSinceLast: number | null;
  total: number;
}

/** One area of the Codex reset screen (WF-S003 states). */
export type AreaState<T> =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; value: T; fetchedAt: number }
  | { kind: 'empty'; fetchedAt: number }
  | {
      kind: 'error';
      message: string;
      lastGood: T | null;
      lastGoodAt: number | null;
      /** Set while an automatic retry is scheduled or running; null once retries stopped. */
      retry: { attempt: number; of: number; at: number; running: boolean } | null;
    };

export interface ResetHistory {
  entries: ResetEntry[];
  nextCursor: string | null;
  /** A failed 이력 더 보기 request, shown under the list. */
  moreError: string | null;
  loadingMore: boolean;
}

export interface ResetsSnapshot {
  status: AreaState<ResetStatus>;
  history: AreaState<ResetHistory>;
  /**
   * An area that already shows a result and is being fetched again: the result stays on screen
   * while the new request runs (owner decision 2026-10-30 on PR-Q003).
   */
  refreshing: { status: boolean; history: boolean };
}

export type View = 'usage' | 'claude-setup' | 'resets';

/** Window settings shared by the three screens and kept across restarts (FC-F019). */
export interface WindowSettings {
  alwaysOnTop: boolean;
}

/** The API the preload script exposes to the renderer as `window.monitor`. */
export interface MonitorApi {
  getUsage(): Promise<UsageSnapshot>;
  refreshUsage(): Promise<UsageSnapshot>;
  retry(cli: CliId): Promise<UsageSnapshot>;
  onUsage(listener: (snapshot: UsageSnapshot) => void): () => void;
  dismissAlertNotice(): Promise<UsageSnapshot>;
  dismissResetNotice(): Promise<UsageSnapshot>;
  /** The page's content height, so the menu bar popover fits it. */
  reportHeight(height: number): void;
  getIntegration(): Promise<IntegrationStatus>;
  applyIntegration(): Promise<IntegrationStatus>;
  /** The reset state as it is now, without a request: the usage screen's 예정 리셋 area. */
  getResets(): Promise<ResetsSnapshot>;
  /** The usage screen opened: fetch the status again if the last success is older than 5 minutes. */
  freshenResets(): Promise<ResetsSnapshot>;
  openResets(): Promise<ResetsSnapshot>;
  retryResets(area: 'status' | 'history'): Promise<ResetsSnapshot>;
  loadMoreResets(): Promise<ResetsSnapshot>;
  onResets(listener: (snapshot: ResetsSnapshot) => void): () => void;
  getWindowSettings(): Promise<WindowSettings>;
  setAlwaysOnTop(on: boolean): Promise<WindowSettings>;
  openExternal(url: string): Promise<void>;
  onNavigate(listener: (view: View) => void): () => void;
}
