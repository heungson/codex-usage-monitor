// New Codex reset notifications (FC-F015).
//
// The app checks /api/v1/status in the background every 15 minutes (owner decision 2026-10-28).
// The check goes through the status the screens share (ResetsService), so the usage screen's
// 예정 리셋 area is refreshed by it too (v3, owner decision 2026-10-30). The first successful check only sets
// the baseline: resets announced before it are not notified. Each later reset is notified once,
// across restarts. One that could not be shown stays pending and is tried again at the next check.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { formatDateTime } from '../shared/format';
import type { ResetEntry } from '../shared/types';
import type { Notifier } from './notifier';
import { resetsSite, type ResetsApi } from './resets-api';

export const resetCheckIntervalMs = 15 * 60 * 1000;

interface Store {
  baselineAt: number | null;
  delivered: string[];
  pending: ResetEntry[];
}

const typeNames: Record<string, string> = { regular: '전체 리셋', banked: '적립형 리셋' };

export class ResetAlerts {
  private store: Store;
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<void> | null = null;
  private notice: string | null = null;
  /** Resets whose notice the person closed: they stay pending for the notification, without the notice. */
  private readonly dismissed = new Set<string>();

  constructor(
    private readonly file: string,
    private readonly api: Pick<ResetsApi, 'status'>,
    private readonly notifier: Notifier,
    /**
     * Told when a new reset could not be notified and when that is over (2026-10-28: a reset announced at 15:29 was
     * refused by macOS five times and the app said nothing).
     */
    private readonly onNotice: (notice: string | null) => void = () => undefined,
    /** The name macOS lists the app under in 시스템 설정 › 알림: «Electron» when run from source. */
    private readonly appName = 'Electron',
  ) {
    this.store = this.load();
  }

  get currentNotice(): string | null {
    return this.notice;
  }

  /** The person closed the notice: not shown again for these resets, still notified once macOS allows. */
  dismissNotice(): void {
    for (const entry of this.store.pending) this.dismissed.add(entry.id);
    this.setNotice(null);
  }

  private setNotice(notice: string | null): void {
    if (notice === this.notice) return;
    this.notice = notice;
    this.onNotice(notice);
  }

  private load(): Store {
    if (!existsSync(this.file)) return { baselineAt: null, delivered: [], pending: [] };
    try {
      return JSON.parse(readFileSync(this.file, 'utf8')) as Store;
    } catch {
      return { baselineAt: null, delivered: [], pending: [] };
    }
  }

  private save(): void {
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, `${JSON.stringify(this.store, null, 2)}\n`);
  }

  start(intervalMs = resetCheckIntervalMs): void {
    if (this.timer) return;
    void this.check();
    this.timer = setInterval(() => void this.check(), intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** One background check; concurrent calls share it. Errors wait for the next check. */
  check(): Promise<void> {
    this.running ??= this.checkOnce().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async checkOnce(): Promise<void> {
    let latest: ResetEntry | null;
    try {
      latest = (await this.api.status()).latest;
    } catch {
      await this.deliverPending();
      return;
    }

    if (this.store.baselineAt === null) {
      this.store.baselineAt = latest?.announcedAt ?? Date.now();
      if (latest) this.store.delivered.push(latest.id);
      this.save();
      return;
    }

    if (
      latest &&
      latest.announcedAt > this.store.baselineAt &&
      !this.store.delivered.includes(latest.id) &&
      !this.store.pending.some((p) => p.id === latest.id)
    ) {
      this.store.pending.push(latest);
      this.save();
    }
    await this.deliverPending();
  }

  /** Tries every pending reset once, and says in the app which ones macOS would not show. */
  async deliverPending(): Promise<void> {
    let refused: { entry: ResetEntry; denied: boolean } | null = null;
    for (const entry of [...this.store.pending]) {
      const result = await this.notifier.send({
        title: `Codex 사용량 한도가 리셋됐어요`,
        body: `${typeNames[entry.type] ?? '리셋'} · ${formatDateTime(entry.announcedAt)} 공지 · 출처: codex-resets.com`,
        url: resetsSite,
      });
      if (result !== 'shown') {
        if (
          !this.dismissed.has(entry.id) &&
          (refused === null || entry.announcedAt > refused.entry.announcedAt)
        )
          refused = { entry, denied: result === 'denied' };
        continue;
      }
      this.store.pending = this.store.pending.filter((p) => p.id !== entry.id);
      this.store.delivered.push(entry.id);
      this.store.baselineAt = Math.max(this.store.baselineAt ?? 0, entry.announcedAt);
      this.save();
    }
    if (refused === null) {
      this.setNotice(null);
      return;
    }
    const what = `${formatDateTime(refused.entry.announcedAt)}에 Codex ${typeNames[refused.entry.type] ?? '리셋'}이 공지됐어요.`;
    this.setNotice(
      refused.denied
        ? `${what} macOS 알림이 꺼져 있어 알림으로 보내지 못했어요. 시스템 설정 › 알림 › ${this.appName}에서 허용하면 그때 한 번 보내요.`
        : `${what} 알림을 보내지 못해 다음 확인 때 다시 보내요.`,
    );
  }
}
