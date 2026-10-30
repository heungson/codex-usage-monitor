// Reads the record the status line hook leaves (FC-F004). It never stamps the read time as the
// update time: «마지막 갱신» is when Claude Code last drew its status line (PR-P004, PR-P014).

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { parseRecord } from '../shared/claude-record';
import type { CliUsage, UsageWindow } from '../shared/types';
import { dataFiles } from './paths';

export function claudeReader(dataDir: string): () => Promise<CliUsage | null> {
  const file = join(dataDir, dataFiles.claudeRecord);
  return async () => {
    let text: string;
    try {
      text = await readFile(file, 'utf8');
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') return null;
      if (code === 'EACCES' || code === 'EPERM')
        throw new Error('Claude Code 기록 파일을 읽을 권한이 없어요', { cause: error });
      throw new Error(`Claude Code 기록 파일을 읽지 못했어요 (${code ?? 'unknown'})`, { cause: error });
    }
    let record;
    try {
      record = parseRecord(text);
    } catch {
      throw new Error('Claude Code 기록 파일이 손상되어 해석할 수 없어요');
    }
    const windows: UsageWindow[] = [];
    if (record.fiveHour)
      windows.push({
        key: 'five_hour',
        windowMinutes: 300,
        usedPercent: record.fiveHour.usedPercentage,
        resetsAt: record.fiveHour.resetsAt,
      });
    if (record.sevenDay)
      windows.push({
        key: 'seven_day',
        windowMinutes: 10080,
        usedPercent: record.sevenDay.usedPercentage,
        resetsAt: record.sevenDay.resetsAt,
      });
    return { windows, updatedAt: Date.parse(record.updatedAt) };
  };
}
