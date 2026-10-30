// macOS notifications (FC-F014, FC-F015). The result tells the caller whether macOS showed it,
// refused it (notifications turned off for the app) or failed for another reason.

import { appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export type SendResult = 'shown' | 'denied' | 'failed';

export interface OutgoingNotification {
  title: string;
  body: string;
  /** Opened when the notification is clicked. */
  url: string | null;
}

export interface Notifier {
  send(notification: OutgoingNotification): Promise<SendResult>;
}

// UNErrorDomain error 1 is UNErrorCodeNotificationsNotAllowed: macOS reports it, in exactly these
// words, when the app's notifications are turned off (seen on macOS with Electron 44, 2026-10-28).
const deniedPattern = /not allowed|denied|authori[sz]|permission|UNErrorDomain error 1\b/i;

export function classifyFailure(error: string): SendResult {
  return deniedPattern.test(error) ? 'denied' : 'failed';
}

function logOutcome(dataDir: string, entry: Record<string, unknown>): void {
  try {
    appendFileSync(
      join(dataDir, 'notifications.log'),
      `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`,
    );
  } catch {
    // The log is for diagnosis only.
  }
}

/**
 * Uses Electron's Notification; `electron` is passed in so this file loads outside Electron in tests.
 * Each outcome, with macOS's error text when it failed, goes to <data folder>/notifications.log.
 */
export function electronNotifier(electron: typeof import('electron'), dataDir: string): Notifier {
  const live = new Set<unknown>();
  return {
    send(notification) {
      if (!electron.Notification.isSupported()) {
        logOutcome(dataDir, { outcome: 'failed', error: 'notifications not supported', ...notification });
        return Promise.resolve('failed');
      }
      return new Promise((resolve) => {
        const native = new electron.Notification({ title: notification.title, body: notification.body });
        live.add(native);
        let settled = false;
        const settle = (result: SendResult, error?: string) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          logOutcome(dataDir, { outcome: result, ...(error ? { error } : {}), ...notification });
          resolve(result);
        };
        const timer = setTimeout(() => settle('failed', 'macOS did not confirm within 10 seconds'), 10_000);
        native.on('show', () => settle('shown'));
        native.on('failed', (_event, error) => settle(classifyFailure(error), error));
        native.on('click', () => {
          if (notification.url) void electron.shell.openExternal(notification.url);
        });
        native.on('close', () => live.delete(native));
        native.show();
      });
    },
  };
}

/**
 * Test notifier (ULM_FAKE_NOTIFY=shown|denied|failed): records every notification in
 * <data folder>/notifications.log instead of showing it, and answers with the configured result.
 * The result is re-read from ULM_FAKE_NOTIFY_FILE when set, so a check can change it while running.
 */
export function fakeNotifier(dataDir: string, result: SendResult, resultFile?: string): Notifier {
  return {
    send(notification) {
      let outcome = result;
      if (resultFile) {
        try {
          outcome = readFileSync(resultFile, 'utf8').trim() as SendResult;
        } catch {
          outcome = result;
        }
      }
      appendFileSync(
        join(dataDir, 'notifications.log'),
        `${JSON.stringify({ at: new Date().toISOString(), outcome, ...notification })}\n`,
      );
      return Promise.resolve(outcome);
    },
  };
}
