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
  if (code === 'EACCES' || code === 'EPERM') return `${path}에 쓸 권한이 없어요`;
  if (code === 'EROFS') return `${path}이(가) 읽기 전용 위치에 있어요`;
  if (code === 'ENOSPC') return '디스크 공간이 부족해요';
  return (error as Error).message;
}

export function hookCommandLine(hook: HookCommand, dataDir: string): string {
  return `ELECTRON_RUN_AS_NODE=1 ${quote(hook.runtime)} ${quote(hook.script)} --home ${quote(dataDir)}`;
}

/** True when a status line command is this app's hook, whichever install of the app wrote it. */
export function isHookCommand(command: unknown): boolean {
  return typeof command === 'string' && command.includes('statusline-hook.js') && command.includes('--home');
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
    try {
      const settings = readJson<{ statusLine?: StatusLine }>(this.paths.claudeSettings);
      applied = isHookCommand(settings?.statusLine?.command);
    } catch {
      applied = false;
    }
    let previousCommand: string | null;
    try {
      previousCommand = readJson<SavedIntegration>(this.savedPath)?.previousCommand ?? null;
    } catch {
      previousCommand = null;
    }
    let hookError: IntegrationStatus['hookError'] = null;
    try {
      const raw = readJson<{ at: string; message: string }>(
        join(this.paths.dataDir, dataFiles.claudeHookError),
      );
      if (raw) hookError = { message: raw.message, at: Date.parse(raw.at) };
    } catch {
      hookError = null;
    }
    return {
      settingsPath: this.paths.claudeSettings,
      applied,
      previousCommand: applied ? previousCommand : this.currentCommand(),
      lastApply: this.lastApply,
      hookError: applied ? hookError : null,
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
        throw new Error(`${settingsPath}을(를) JSON으로 읽을 수 없어 바꾸지 않았어요`);
      }
      const previous = (settings.statusLine ?? null) as StatusLine | null;
      if (isHookCommand(previous?.command)) {
        this.lastApply = { ok: true, message: '이미 연동되어 있어요', at: now.getTime() };
        return this.status();
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
          ...(previous ?? {}),
          type: 'command',
          command: hookCommandLine(this.hook, this.paths.dataDir),
        },
      };
      settingsTouched = true;
      writeFileSync(settingsPath, `${JSON.stringify(next, null, 2)}\n`);

      const check = readJson<{ statusLine?: StatusLine }>(settingsPath);
      if (!isHookCommand(check?.statusLine?.command))
        throw new Error('설정 파일에 쓴 내용을 다시 읽어 확인하지 못했어요');

      this.lastApply = {
        ok: true,
        message: saved.previousCommand
          ? '연동했어요. 기존 상태 표시줄 명령도 이어서 실행돼요.'
          : '연동했어요. Claude Code가 다음에 상태 표시줄을 그릴 때부터 기록돼요.',
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
        message: `연동하지 못했어요: ${describeFsError(error, settingsPath)}. ${restored}`,
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
          `설정 파일을 되돌리지 못했어요(${(error as Error).message}). 백업: ${state.backupPath}`,
        );
      }
    }
    if (state.savedTouched) {
      try {
        if (state.savedBefore === null) {
          if (existsSync(this.savedPath)) unlinkSync(this.savedPath);
        } else writeFileSync(this.savedPath, state.savedBefore);
      } catch (error) {
        problems.push(`앱 연동 기록을 되돌리지 못했어요(${(error as Error).message})`);
      }
    }
    return problems.length === 0 ? 'Claude Code 설정은 적용 전 상태 그대로예요.' : problems.join(' ');
  }
}
