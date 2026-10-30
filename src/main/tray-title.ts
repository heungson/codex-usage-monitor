// The menu bar text: the highest used window of each CLI, «CC 42% · CX 61%».
// «–» means no record yet (수집 대기), «…» loading, and a trailing «?» a value that is not current.

import type { SourceState, UsageSnapshot } from '../shared/types';

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
  return `CC ${part(snapshot.claude)} · CX ${part(snapshot.codex)}`;
}
