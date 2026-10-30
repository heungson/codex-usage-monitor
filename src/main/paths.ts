import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Every location the app reads or writes. Each can be moved with an environment variable so tests
 * and checks run against temporary folders instead of the real ~/.claude and ~/.codex.
 */
export interface Paths {
  /** The app's own data folder: the Claude Code record, alert state, integration state. */
  dataDir: string;
  /** Claude Code user settings, where the status line command lives. */
  claudeSettings: string;
  /** Codex session logs. */
  codexSessions: string;
}

export function resolvePaths(env: NodeJS.ProcessEnv = process.env): Paths {
  const home = homedir();
  return {
    dataDir: env.ULM_HOME ?? join(home, 'Library', 'Application Support', 'usage-limit-monitor'),
    claudeSettings: env.ULM_CLAUDE_SETTINGS ?? join(home, '.claude', 'settings.json'),
    codexSessions: env.ULM_CODEX_SESSIONS ?? join(home, '.codex', 'sessions'),
  };
}

/** Files inside the data folder. The record format is in docs/claude-record.md. */
export const dataFiles = {
  claudeRecord: 'claude-rate-limits.json',
  claudeHookError: 'claude-hook-error.json',
  integration: 'statusline-integration.json',
  settingsBackup: 'claude-settings.backup.json',
  limitAlerts: 'limit-alerts.json',
  resetAlerts: 'reset-alerts.json',
} as const;
