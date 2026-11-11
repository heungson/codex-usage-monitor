// Shapes shared by the main process, the preload bridge and the renderer.

import type { ThemeId } from './themes';

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
  /**
   * Claude Code only: the model a weekly window is for, as Anthropic names it («Fable»), when the
   * account lists one apart from the all-models 7일 window (developer, 2026-11-11). Shown on the card
   * and in alerts; not in the menu bar title.
   */
  model?: string;
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
  /**
   * Claude Code only: where the values came from. `account`: Anthropic, asked with Claude Code's
   * login, and `updatedAt` is when it answered; `statusline`: the record the hook wrote (FC-F004).
   */
  source?: 'account' | 'statusline';
  /** Claude Code only: why the account could not be asked, when the record is shown instead. */
  accountProblem?: string | null;
  /**
   * Claude Code only: Anthropic answered 429, so the record is shown and the account is asked again
   * at this time (epoch ms). Not a failure.
   */
  accountRetryAt?: number | null;
}

/** What one collector knows right now (PR-P020, WF-S001 states). */
export type SourceState =
  | { kind: 'loading' }
  /** No record yet: 수집 대기. Never shown as 0%. */
  | { kind: 'waiting' }
  | { kind: 'ok'; usage: CliUsage; readAt: number }
  /**
   * A read failed. `lastGood` is the last successful value, shown as not current. `retrying` is true
   * while the scheduled automatic re-read runs (자동 재시도 중, LHS-6 검증 10).
   */
  | {
      kind: 'error';
      message: string;
      lastGood: CliUsage | null;
      nextRetryAt: number | null;
      retrying: boolean;
    };

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
  /**
   * The hook in the settings file names a runtime or script that is not on disk (the install was
   * moved or deleted), so Claude Code cannot run it and the record stops changing. `applied` is
   * false then, and applying again replaces it (FC-F003).
   */
  missingFiles: string[];
}

export interface ResetEntry {
  id: string;
  type: string;
  announcedAt: number;
  text: string;
  sourceUrl: string | null;
}

/** An announced reset not yet carried out. `scheduledFor` is when it is due, when the announcement says. */
export interface ScheduledReset extends ResetEntry {
  scheduledFor: number | null;
}

export interface ResetStatus {
  latest: ResetEntry | null;
  scheduled: ScheduledReset | null;
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

export type View = 'usage' | 'claude-setup' | 'resets' | 'settings';

/** The usage screen's three cards, each of which can be folded to its title line (developer, 2026-11-11). */
export type UsageCard = 'claude' | 'codex' | 'upcoming';
export const usageCards: readonly UsageCard[] = ['claude', 'codex', 'upcoming'];

/** Window settings shared by the three screens and kept across restarts (FC-F019). */
export interface WindowSettings {
  alwaysOnTop: boolean;
  /**
   * «주말·공휴일 제외» (developer, 2026-11-05): the even-use mark of a window of a day or longer counts
   * only working days in Korea. Off until turned on.
   */
  workdaysOnly: boolean;
  /** The look chosen on the 설정 screen (developer, 2026-11-05); 기본 until changed. */
  theme: ThemeId;
  /**
   * Usage screen cards folded to their title line (developer, 2026-11-11: «some user might need
   * Claude Code but not Codex or Codex Reset»). Only the screen changes; the menu bar title and the
   * alerts stay as they are. None until one is folded.
   */
  collapsed: UsageCard[];
  /**
   * CLIs left out of the menu bar title (developer, 2026-11-11: someone who does not use Codex).
   * Without Codex the Codex reset countdown goes too. The popover and the alerts do not change.
   * None until one is turned off on the 설정 screen.
   */
  menuBarHidden: CliId[];
}

/** «로그인 시 자동 실행» on the 설정 screen, as macOS reports it (developer, 2026-11-04). */
export interface LoginItemStatus {
  /** False when run from the source folder (npm start): only an installed app can be a login item. */
  supported: boolean;
  openAtLogin: boolean;
  /** macOS 13+ holds the item until it is allowed in System Settings › General › Login Items. */
  needsApproval: boolean;
  /** The last change macOS refused, or null. */
  error: string | null;
}

/** The API the preload script exposes to the renderer as `window.monitor`. */
export interface MonitorApi {
  getUsage(): Promise<UsageSnapshot>;
  /** `automatic`: the open screen's 30-second timer, shown as 자동 재시도 중 on a failed area. */
  refreshUsage(automatic?: boolean): Promise<UsageSnapshot>;
  retry(cli: CliId): Promise<UsageSnapshot>;
  onUsage(listener: (snapshot: UsageSnapshot) => void): () => void;
  dismissAlertNotice(): Promise<UsageSnapshot>;
  dismissResetNotice(): Promise<UsageSnapshot>;
  /** The page's content height, so the menu bar popover fits it. */
  reportHeight(height: number): void;
  /** Pinned, a drag on the top bar: the pointer's distance from where it was pressed, in screen pixels. */
  dragWindow(phase: 'start' | 'move' | 'end', dx: number, dy: number): void;
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
  setWorkdaysOnly(on: boolean): Promise<WindowSettings>;
  setTheme(theme: ThemeId): Promise<WindowSettings>;
  setCollapsed(card: UsageCard, collapsed: boolean): Promise<WindowSettings>;
  setShownInMenuBar(cli: CliId, shown: boolean): Promise<WindowSettings>;
  getLoginItem(): Promise<LoginItemStatus>;
  setOpenAtLogin(on: boolean): Promise<LoginItemStatus>;
  /** System Settings › General › Login Items, where macOS asks to allow the item. */
  openLoginItemSettings(): Promise<void>;
  openExternal(url: string): Promise<void>;
  onNavigate(listener: (view: View) => void): () => void;
}
