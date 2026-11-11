// The menu bar text: every recorded window of each CLI, 5시간/7일, «CC 92/84% · CX 12/44%»; a CLI
// with one window recorded shows that one, «CX 30%», and a missing window is not shown as 0
// (LHS-5 개발 항목 5, FC-F008, WF-P005). «–» means no record yet (수집 대기), «…» loading, and a
// trailing «?» a value that is not current. While the shared reset status has a Codex reset
// scheduled, the time left follows with the same separator: «… · ↻ 2일» (PR-P026). The title is
// never shortened for space; macOS hides the item when the menu bar is full (LHS-5 개발 항목 5).

import { claudeStale, currentPercent, isOverallWindow, shorterFirst } from '../shared/format';
import type { AreaState, CliId, CliUsage, ResetStatus, SourceState, UsageSnapshot } from '../shared/types';
import { shareStep, elapsedShare } from './tray-icon';

const separator = ' · ';
const minute = 60_000;
const hour = 60 * minute;
const day = 24 * hour;

function part(state: SourceState, now: number): string {
  switch (state.kind) {
    case 'loading':
      return '…';
    case 'waiting':
      return '–';
    case 'ok':
      // Claude Code values over 10 minutes old that Anthropic would not refresh are not current
      // either (developer, 2026-11-11).
      return claudeStale(state.usage, now) ? `${percents(state.usage, now)}?` : percents(state.usage, now);
    case 'error':
      return state.lastGood ? `${percents(state.lastGood, now)}?` : '!';
  }
}

/** «92/84%», shorter window first; «30%» with one window. A window past its reset counts 0%. */
function percents(usage: CliUsage, now: number): string {
  // A model's own window (Fable) stays on the card (developer, 2026-11-11).
  const values = usage.windows
    .filter(isOverallWindow)
    .sort(shorterFirst)
    .map((w) => Math.round(currentPercent(w, now)));
  return values.length === 0 ? '–' : `${values.join('/')}%`;
}

/**
 * «CC … · CX …», without the CLIs turned off on the 설정 screen (developer, 2026-11-11); empty when
 * both are, which leaves the icon alone.
 */
export function trayTitle(
  snapshot: UsageSnapshot,
  now: number = Date.now(),
  hidden: readonly CliId[] = [],
): string {
  const parts: string[] = [];
  if (!hidden.includes('claude')) parts.push(`CC ${part(snapshot.claude, now)}`);
  if (!hidden.includes('codex')) parts.push(`CX ${part(snapshot.codex, now)}`);
  return parts.join(separator);
}

/** Time left, rounded down to whole days, else hours, else minutes; under a minute «1분 미만» (PR-P026). */
export function timeLeft(ms: number): string {
  if (ms >= day) return `${Math.floor(ms / day)}일`;
  if (ms >= hour) return `${Math.floor(ms / hour)}시간`;
  if (ms >= minute) return `${Math.floor(ms / minute)}분`;
  return '1분 미만';
}

/**
 * When the scheduled reset is due, if the title should count down to it. Only a status that loaded:
 * one that failed shows no suffix even with a last good value; one being fetched again keeps its
 * value (state stays `ok` while refreshing). A reset whose time has come, or that names no time,
 * gives none.
 */
export function scheduledDue(status: AreaState<ResetStatus> | null, now: number): number | null {
  if (status?.kind !== 'ok') return null;
  const due = status.value.scheduled?.scheduledFor ?? null;
  return due !== null && due > now ? due : null;
}

/** The Codex reset countdown goes with Codex when Codex is turned off (developer, 2026-11-11). */
export function fullTitle(
  usage: UsageSnapshot,
  status: AreaState<ResetStatus> | null,
  now: number,
  hidden: readonly CliId[] = [],
): string {
  const due = hidden.includes('codex') ? null : scheduledDue(status, now);
  const parts = [trayTitle(usage, now, hidden)];
  if (due !== null) parts.push(`↻ ${timeLeft(due - now)}`);
  return parts.filter((p) => p !== '').join(separator);
}

/**
 * Keeps the menu bar title current: on every usage or status change, once a minute (only the time
 * left is worked out again; no request is sent), and at the reset time itself, so the suffix goes
 * then without waiting for a request or the next check.
 */
export class MenuBarTitle {
  private usage: UsageSnapshot | null = null;
  private status: AreaState<ResetStatus> | null = null;
  private hidden: readonly CliId[] = [];
  /** The clock's last drawn step; undefined until it is first drawn. */
  private drawnShare: number | null | undefined = undefined;
  private minuteTimer: NodeJS.Timeout | null = null;
  private dueTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly show: (title: string) => void,
    private readonly now: () => number = Date.now,
    /**
     * Draws the clock icon with the share of the Claude Code 5시간 window gone (src/main/tray-icon.ts),
     * only when the picture changes (developer, 2026-11-11).
     */
    private readonly showClock: (share: number | null) => void = () => undefined,
  ) {}

  setUsage(usage: UsageSnapshot): void {
    this.usage = usage;
    this.render();
  }

  setStatus(status: AreaState<ResetStatus>): void {
    this.status = status;
    this.render();
  }

  /** The CLIs turned off for the menu bar on the 설정 screen. */
  setHidden(hidden: readonly CliId[]): void {
    this.hidden = [...hidden];
    this.render();
  }

  start(): void {
    this.minuteTimer ??= setInterval(() => this.render(), minute);
  }

  stop(): void {
    if (this.minuteTimer) clearInterval(this.minuteTimer);
    if (this.dueTimer) clearTimeout(this.dueTimer);
    this.minuteTimer = null;
    this.dueTimer = null;
  }

  private render(): void {
    if (!this.usage) return;
    const now = this.now();
    this.show(fullTitle(this.usage, this.status, now, this.hidden));
    // With Claude Code turned off for the menu bar the clock shows no window either.
    const share = this.hidden.includes('claude') ? null : shareStep(elapsedShare(this.usage.claude, now));
    if (share !== this.drawnShare) {
      this.drawnShare = share;
      this.showClock(share);
    }
    if (this.dueTimer) clearTimeout(this.dueTimer);
    this.dueTimer = null;
    const due = this.hidden.includes('codex') ? null : scheduledDue(this.status, now);
    // A timer at the reset time; further away than a day, the minute ticks set it later.
    if (due !== null && due - now <= day) this.dueTimer = setTimeout(() => this.render(), due - now);
  }
}
