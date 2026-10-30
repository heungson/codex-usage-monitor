// The menu bar text: the highest used window of each CLI, «CC 42% · CX 61%».
// «–» means no record yet (수집 대기), «…» loading, and a trailing «?» a value that is not current.
// While the shared reset status has a Codex reset scheduled, the time left follows with the same
// separator: «CC 73% · CX 26% · ↻ 2일» (PR-P026, WF-P005, LHS-5 개발 항목 5).

import type { AreaState, ResetStatus, SourceState, UsageSnapshot } from '../shared/types';

const separator = ' · ';
const minute = 60_000;
const hour = 60 * minute;
const day = 24 * hour;

function part(state: SourceState): string {
  switch (state.kind) {
    case 'loading':
      return '…';
    case 'waiting':
      return '–';
    case 'ok':
      return highest(state.usage.windows.map((w) => w.usedPercent));
    case 'error':
      return state.lastGood ? `${highest(state.lastGood.windows.map((w) => w.usedPercent))}?` : '!';
  }
}

function highest(values: number[]): string {
  return values.length === 0 ? '–' : `${Math.round(Math.max(...values))}%`;
}

export function trayTitle(snapshot: UsageSnapshot): string {
  return `CC ${part(snapshot.claude)}${separator}CX ${part(snapshot.codex)}`;
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

export function fullTitle(usage: UsageSnapshot, status: AreaState<ResetStatus> | null, now: number): string {
  const due = scheduledDue(status, now);
  return due === null ? trayTitle(usage) : `${trayTitle(usage)}${separator}↻ ${timeLeft(due - now)}`;
}

/**
 * Keeps the menu bar title current: on every usage or status change, once a minute (only the time
 * left is worked out again; no request is sent), and at the reset time itself, so the suffix goes
 * then without waiting for a request or the next check.
 */
export class MenuBarTitle {
  private usage: UsageSnapshot | null = null;
  private status: AreaState<ResetStatus> | null = null;
  private minuteTimer: NodeJS.Timeout | null = null;
  private dueTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly show: (title: string) => void,
    private readonly now: () => number = Date.now,
  ) {}

  setUsage(usage: UsageSnapshot): void {
    this.usage = usage;
    this.render();
  }

  setStatus(status: AreaState<ResetStatus>): void {
    this.status = status;
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
    this.show(fullTitle(this.usage, this.status, now));
    if (this.dueTimer) clearTimeout(this.dueTimer);
    this.dueTimer = null;
    const due = scheduledDue(this.status, now);
    // A timer at the reset time; further away than a day, the minute ticks set it later.
    if (due !== null && due - now <= day) this.dueTimer = setTimeout(() => this.render(), due - now);
  }
}
