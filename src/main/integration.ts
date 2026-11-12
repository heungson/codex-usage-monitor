// Applies the Claude Code status line integration (FC-F003, UF-N006, WF-S002).
//
// The person's existing status line command is kept: it is saved in the data folder and the hook
// runs it after recording the limits. If any step fails, the settings file and the saved state are
// put back exactly as they were before this attempt (WF-Q004).

import {
  accessSync,
  constants,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

import { t } from '../shared/i18n';
import type { IntegrationStatus } from '../shared/types';
import { dataFiles, type Paths } from './paths';

export interface HookCommand {
  /** The executable that runs the hook as Node (the app binary with ELECTRON_RUN_AS_NODE=1). */
  runtime: string;
  /** Absolute path of dist/hook/statusline-hook.js. */
  script: string;
}

interface StatusLine {
  type?: string;
  command?: string;
  padding?: number;
  [key: string]: unknown;
}

interface SavedIntegration {
  version: 1;
  appliedAt: string;
  previousStatusLine: StatusLine | null;
  previousCommand: string | null;
}

const quote = (value: string): string => `'${value.replace(/'/g, `'\\''`)}'`;

/** A file system error in words a person can act on, with the file it is about. */
function describeFsError(error: unknown, path: string): string {
  const code = (error as NodeJS.ErrnoException).code;
  if (code === 'EACCES' || code === 'EPERM') return t('fs.noWrite', { path });
  if (code === 'EROFS') return t('fs.readOnly', { path });
  if (code === 'ENOSPC') return t('fs.noSpace');
  return (error as Error).message;
}

/**
 * The hook's write error in the chosen language. Since 2026-11-12 the hook leaves the error code
 * and the file; a file from before has only its Korean words, shown as they are.
 */
function hookMessage(raw: { message: string; code?: string | null; path?: string }): string {
  const path = raw.path ?? '';
  if ((raw.code === 'EACCES' || raw.code === 'EPERM') && path) return t('fs.noWrite', { path });
  if (raw.code === 'ENOSPC') return t('fs.noSpace');
  return raw.message;
}

export function hookCommandLine(hook: HookCommand, dataDir: string): string {
  return `ELECTRON_RUN_AS_NODE=1 ${quote(hook.runtime)} ${quote(hook.script)} --home ${quote(dataDir)}`;
}

/** True when a status line command is this app's hook, whichever install of the app wrote it. */
export function isHookCommand(command: unknown): boolean {
  return typeof command === 'string' && command.includes('statusline-hook.js') && command.includes('--home');
}

/** The single-quoted arguments of a command written by `hookCommandLine`, unquoted. */
function quotedArgs(command: string): string[] {
  return [...command.matchAll(/'((?:[^']|'\\'')*)'/g)].map((m) => (m[1] ?? '').replace(/'\\''/g, "'"));
}

/**
 * The runtime and script a hook command names that are not on disk. A hook written by an install
 * that was moved or deleted fails every time Claude Code draws its status line, so the record stops
 * changing while the app keeps showing its last values (FC-F003; seen 2026-11-03 after the checkout
 * was renamed). Empty when both are there, or when the command is not one `hookCommandLine` wrote.
 */
export function missingHookFiles(command: string): string[] {
  const [runtime, script] = quotedArgs(command);
  if (!runtime || !script?.endsWith('statusline-hook.js')) return [];
  return [runtime, script].filter((path) => !existsSync(path));
}

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

export class Integration {
  private lastApply: IntegrationStatus['lastApply'] = null;

  constructor(
    private readonly paths: Paths,
    private readonly hook: HookCommand,
  ) {}

  private get savedPath(): string {
    return join(this.paths.dataDir, dataFiles.integration);
  }

  status(): IntegrationStatus {
    let applied: boolean;
    let missingFiles: string[] = [];
    try {
      const command = readJson<{ statusLine?: StatusLine }>(this.paths.claudeSettings)?.statusLine?.command;
      applied = isHookCommand(command);
      if (applied) missingFiles = missingHookFiles(command as string);
    } catch {
      applied = false;
    }
    if (missingFiles.length > 0) applied = false;
    let previousCommand: string | null;
    try {
      previousCommand = readJson<SavedIntegration>(this.savedPath)?.previousCommand ?? null;
    } catch {
      previousCommand = null;
    }
    let hookError: IntegrationStatus['hookError'] = null;
    try {
      const raw = readJson<{ at: string; message: string; code?: string | null; path?: string }>(
        join(this.paths.dataDir, dataFiles.claudeHookError),
      );
      if (raw) hookError = { message: hookMessage(raw), at: Date.parse(raw.at) };
    } catch {
      hookError = null;
    }
    return {
      settingsPath: this.paths.claudeSettings,
      applied,
      // A broken hook still chains the command saved when it was applied; it is not the person's own.
      previousCommand: applied || missingFiles.length > 0 ? previousCommand : this.currentCommand(),
      lastApply: this.lastApply,
      hookError: applied ? hookError : null,
      missingFiles,
    };
  }

  /** The command in the settings file now, when it is not the hook. */
  private currentCommand(): string | null {
    try {
      const command = readJson<{ statusLine?: StatusLine }>(this.paths.claudeSettings)?.statusLine?.command;
      return typeof command === 'string' && !isHookCommand(command) ? command : null;
    } catch {
      return null;
    }
  }

  apply(now = new Date()): IntegrationStatus {
    const settingsPath = this.paths.claudeSettings;
    const backupPath = join(this.paths.dataDir, dataFiles.settingsBackup);
    const settingsExisted = existsSync(settingsPath);
    const savedBefore = existsSync(this.savedPath) ? readFileSync(this.savedPath, 'utf8') : null;
    let settingsTouched = false;
    let savedTouched = false;

    try {
      mkdirSync(this.paths.dataDir, { recursive: true });

      const settingsText = settingsExisted ? readFileSync(settingsPath, 'utf8') : '{}';
      let settings: Record<string, unknown>;
      try {
        settings = JSON.parse(settingsText) as Record<string, unknown>;
      } catch {
        throw new Error(t('integration.badJson', { path: settingsPath }));
      }
      const current = (settings.statusLine ?? null) as StatusLine | null;
      const repairing = isHookCommand(current?.command);
      if (repairing && missingHookFiles(current?.command as string).length === 0) {
        this.lastApply = { ok: true, message: t('integration.already'), at: now.getTime() };
        return this.status();
      }
      // Replacing a broken hook: what ran before it is in the saved state, not in the settings file.
      let previous = current;
      if (repairing) {
        try {
          previous =
            savedBefore === null ? null : (JSON.parse(savedBefore) as SavedIntegration).previousStatusLine;
        } catch {
          previous = null;
        }
      }

      // Refuse early rather than half-write a settings file the person made read-only.
      if (settingsExisted) accessSync(settingsPath, constants.W_OK);
      else accessSync(dirname(settingsPath), constants.W_OK);
      if (settingsExisted) copyFileSync(settingsPath, backupPath);

      const saved: SavedIntegration = {
        version: 1,
        appliedAt: now.toISOString(),
        previousStatusLine: previous,
        previousCommand: typeof previous?.command === 'string' ? previous.command : null,
      };
      savedTouched = true;
      writeFileSync(this.savedPath, `${JSON.stringify(saved, null, 2)}\n`);

      const next = {
        ...settings,
        statusLine: {
          ...(current ?? {}),
          type: 'command',
          command: hookCommandLine(this.hook, this.paths.dataDir),
        },
      };
      settingsTouched = true;
      writeFileSync(settingsPath, `${JSON.stringify(next, null, 2)}\n`);

      const check = readJson<{ statusLine?: StatusLine }>(settingsPath);
      if (!isHookCommand(check?.statusLine?.command)) throw new Error(t('integration.verifyFailed'));

      this.lastApply = {
        ok: true,
        message: repairing
          ? t('integration.reapplied')
          : saved.previousCommand
            ? t('integration.appliedWithPrevious')
            : t('integration.applied'),
        at: now.getTime(),
      };
    } catch (error) {
      const restored = this.restore({
        settingsTouched,
        settingsExisted,
        backupPath,
        savedTouched,
        savedBefore,
      });
      this.lastApply = {
        ok: false,
        message: t('integration.failed', { reason: describeFsError(error, settingsPath), restored }),
        at: now.getTime(),
      };
    }
    return this.status();
  }

  private restore(state: {
    settingsTouched: boolean;
    settingsExisted: boolean;
    backupPath: string;
    savedTouched: boolean;
    savedBefore: string | null;
  }): string {
    const problems: string[] = [];
    if (state.settingsTouched) {
      try {
        if (state.settingsExisted) copyFileSync(state.backupPath, this.paths.claudeSettings);
        else if (existsSync(this.paths.claudeSettings)) unlinkSync(this.paths.claudeSettings);
      } catch (error) {
        problems.push(
          t('integration.restoreFailed', { message: (error as Error).message, backup: state.backupPath }),
        );
      }
    }
    if (state.savedTouched) {
      try {
        if (state.savedBefore === null) {
          if (existsSync(this.savedPath)) unlinkSync(this.savedPath);
        } else writeFileSync(this.savedPath, state.savedBefore);
      } catch (error) {
        problems.push(t('integration.recordRestoreFailed', { message: (error as Error).message }));
      }
    }
    return problems.length === 0 ? t('integration.restored') : problems.join(' ');
  }
}
