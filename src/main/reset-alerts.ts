// New Codex reset notifications (FC-F015).
//
// The app checks /api/v1/status in the background every 15 minutes (owner decision 2026-10-28).
// The check goes through the status the screens share (ResetsService), so the usage screen's
// 예정 리셋 area is refreshed by it too (v3, owner decision 2026-10-30). The first successful check only sets
// the baseline: resets announced before it are not notified. Each later reset is notified once,
// across restarts. One that could not be shown stays pending and is tried again at the next check.
//
// A reset watch (codex-resets.com's «Possible reset», `active_watch`) is notified too, once per
// watch, across restarts (developer, 2026-11-11, «yes» to an earlier heads-up). A watch already
// there at the first check is part of the baseline. One macOS would not show is tried again at the
// next check while the watch lasts; the 예정 리셋 card shows it meanwhile, so no notice in the app.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { currentWatch, formatDateTime, resetTypeName, watchName } from '../shared/format';
import { t } from '../shared/i18n';
import type { ResetEntry, ResetWatch } from '../shared/types';
import type { Notifier } from './notifier';
import { resetsSite, type ResetsApi } from './resets-api';

export const resetCheckIntervalMs = 15 * 60 * 1000;

interface Store {
  baselineAt: number | null;
  delivered: string[];
  pending: ResetEntry[];
  /** Reset watches already notified or in the baseline; absent from files before 2026-11-11. */
  watches?: string[];
}

/** A watch is told apart by its post, or by when it was posted when it names none. */
const watchKey = (watch: ResetWatch) => watch.sourceUrl ?? `observed:${watch.observedAt}`;

/** The reset type as the notification names it; «리셋» for a type this app does not know. */
const typeWord = (type: string) =>
  type === 'regular' || type === 'banked' ? resetTypeName(type) : t('resetType.other');

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
    let watch: ResetWatch | null;
    try {
      const status = await this.api.status();
      latest = status.latest;
      watch = currentWatch(status);
    } catch {
      await this.deliverPending();
      return;
    }

    if (this.store.baselineAt === null) {
      this.store.baselineAt = latest?.announcedAt ?? Date.now();
      if (latest) this.store.delivered.push(latest.id);
      if (watch) this.store.watches = [watchKey(watch)];
      this.save();
      return;
    }
    await this.deliverWatch(watch);

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

  /** Notifies a watch not notified before; one macOS would not show is tried at the next check. */
  private async deliverWatch(watch: ResetWatch | null): Promise<void> {
    if (watch === null) return;
    const key = watchKey(watch);
    const seen = this.store.watches ?? [];
    if (seen.includes(key)) return;
    const chance =
      watch.chancePercent === null ? '' : `${t('watch.chance', { percent: watch.chancePercent })} · `;
    const result = await this.notifier.send({
      title: t('notify.watchTitle', { name: watchName(watch) }),
      body: t('notify.watchBody', {
        chance,
        until: t('watch.until', { when: formatDateTime(watch.expiresAt) }),
      }),
      url: resetsSite,
    });
    if (result !== 'shown') return;
    // The last 20 are enough to tell a watch from the ones before it.
    this.store.watches = [...seen, key].slice(-20);
    this.save();
  }

  /** Tries every pending reset once, and says in the app which ones macOS would not show. */
  async deliverPending(): Promise<void> {
    let refused: { entry: ResetEntry; denied: boolean } | null = null;
    for (const entry of [...this.store.pending]) {
      const result = await this.notifier.send({
        title: t('notify.resetTitle'),
        body: t('notify.resetBody', { type: typeWord(entry.type), when: formatDateTime(entry.announcedAt) }),
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
    const what = t('notice.resetWhat', {
      when: formatDateTime(refused.entry.announcedAt),
      type: typeWord(refused.entry.type),
    });
    this.setNotice(
      refused.denied
        ? t('notice.resetDenied', { what, app: this.appName })
        : t('notice.resetFailed', { what }),
    );
  }
}
