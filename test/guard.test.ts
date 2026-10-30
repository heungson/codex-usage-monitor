import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

type Case = { expect: 'allow' | 'block'; input?: unknown; raw?: string };

const root = join(__dirname, '..');
const cases = JSON.parse(readFileSync(join(__dirname, 'guard.cases.json'), 'utf8')) as Case[];

describe('.claude/hooks/guard.sh', () => {
  for (const c of cases) {
    const stdin = c.raw ?? JSON.stringify(c.input);
    it(`${c.expect}s ${stdin || '(empty input)'}`, () => {
      const result = spawnSync(join(root, '.claude/hooks/guard.sh'), { input: stdin, encoding: 'utf8' });
      expect(result.status).toBe(c.expect === 'allow' ? 0 : 2);
    });
  }
});
