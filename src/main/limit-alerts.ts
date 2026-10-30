// Limit-approach notifications (FC-F014).
//
// Any window of a CLI with a record at 80% or more is announced once until that window resets.
// A window counts as reset when its reset time moves on (by more than a few minutes, since the
// sources round it) or has passed. When macOS refuses or fails to show the notification the app
// says so and does not try again for that window (FC-F014 개발 항목 2).
//
// The in-app notice belongs to the window it is about: once that window resets it is no longer
// true that the person is near the limit, so the notice goes (2026-10-28: a notice about Codex at
// 82% stayed on screen after a global reset had brought Codex to 0%).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import type { CliId, CliUsage, UsageWindow } from '../shared/types';
import { describeReset, formatDateTime, windowLabel } from '../shared/format';
import { limitAlertPercent } from '../shared/limits';
import { sameResetWindow as sameWindow } from '../shared/windows';
import type { Notifier } from './notifier';

export const alertThresholdPercent = limitAlertPercent;

const cliNames: Record<CliId, string> = { claude: 'Claude Code', codex: 'Codex' };

type Sent = Record<string, { resetsAt: number | null; at: number }>;

export class LimitAlerts {
  private sent: Sent;
  private notice: { text: string; cli: CliId; key: string; resetsAt: number | null } | null = null;

  constructor(
    private readonly file: string,
    private readonly notifier: Notifier,
    private readonly onNotice: (notice: string | null) => void,
    private readonly now: () => number = Date.now,
    /** The name macOS lists the app under in 시스템 설정 › 알림: «Electron» when run from source. */
    private readonly appName = 'Electron',
  ) {
    this.sent = existsSync(file) ? this.load() : {};
  }

  get currentNotice(): string | null {
    return this.notice?.text ?? null;
  }

  private load(): Sent {
    try {
      return JSON.parse(readFileSync(this.file, 'utf8')) as Sent;
    } catch {
      return {};
    }
  }

  private save(): void {
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, `${JSON.stringify(this.sent, null, 2)}\n`);
  }

  private alreadySent(key: string, window: UsageWindow): boolean {
    const previous = this.sent[key];
    if (!previous) return false;
    if (previous.resetsAt !== null && previous.resetsAt <= this.now()) return false;
    return sameWindow(previous.resetsAt, window.resetsAt);
  }

  /** Drops the notice once the window it is about has reset. */
  private retireNotice(cli: CliId, usage: CliUsage): void {
    const notice = this.notice;
    if (notice === null || notice.cli !== cli) return;
    const window = usage.windows.find((w) => `${cli}:${w.key}` === notice.key);
    const passed = notice.resetsAt !== null && notice.resetsAt <= this.now();
    if (window === undefined || passed || !sameWindow(notice.resetsAt, window.resetsAt)) this.setNotice(null);
  }

  /** Called with each new reading of a CLI that has a record. */
  async evaluate(cli: CliId, usage: CliUsage): Promise<void> {
    this.retireNotice(cli, usage);
    for (const window of usage.windows) {
      if (window.usedPercent < alertThresholdPercent) continue;
      const key = `${cli}:${window.key}`;
      if (this.alreadySent(key, window)) continue;

      const at = this.now();
      this.sent[key] = { resetsAt: window.resetsAt, at };
      this.save();

      const label = windowLabel(window.windowMinutes);
      const percent = Math.round(window.usedPercent);
      const result = await this.notifier.send({
        title: `${cliNames[cli]} ${label} 한도 ${percent}% 사용`,
        body:
          window.resetsAt === null
            ? '리셋 시각은 기록에 없어요.'
            : `리셋: ${describeReset(window.resetsAt, this.now())}`,
        url: null,
      });
      if (result === 'shown') {
        this.setNotice(null);
        continue;
      }
      const what = `${formatDateTime(at, this.now())}에 ${cliNames[cli]} ${label} 한도가 ${percent}%에 닿았지만`;
      const text =
        result === 'denied'
          ? `${what} macOS 알림이 꺼져 있어 알리지 못했어요. 시스템 설정 › 알림 › ${this.appName}에서 알림을 허용해 주세요. 이 한도는 리셋될 때까지 다시 알리지 않아요.`
          : `${what} 알림을 보내지 못했어요. 이 한도는 리셋될 때까지 다시 알리지 않아요.`;
      this.setNotice({ text, cli, key, resetsAt: window.resetsAt });
    }
  }

  /** The person closed the notice. */
  dismissNotice(): void {
    this.setNotice(null);
  }

  private setNotice(notice: LimitAlerts['notice']): void {
    if (notice?.text === this.notice?.text) {
      this.notice = notice;
      return;
    }
    this.notice = notice;
    this.onNotice(notice?.text ?? null);
  }
}
