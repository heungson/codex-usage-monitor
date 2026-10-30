// FC-F014, FC-F015: UNNotification requires a signed bundle, even for local development.
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const notificationAppName = 'Usage Limit Monitor';
export const projectRoot = fileURLToPath(new URL('../', import.meta.url));

export function prepareRuntime() {
  if (process.platform !== 'darwin') throw new Error('Usage Limit Monitor requires macOS.');
  const require = createRequire(import.meta.url);
  const sourceBinary = require('electron');
  const sourceBundle = resolve(dirname(sourceBinary), '../..');
  const runtimeDir = join(projectRoot, 'tmp', 'runtime');
  const bundle = join(runtimeDir, `${notificationAppName}.app`);
  const binary = join(bundle, 'Contents', 'MacOS', 'Electron');
  const stampFile = join(runtimeDir, 'source.json');
  const source = JSON.stringify({
    version: require('electron/package.json').version,
    sourceBinary,
    modified: statSync(sourceBinary).mtimeMs,
    // Increment if the bundle identity or signing procedure changes.
    revision: 1,
  });
  const run = (command, args) => execFileSync(command, args, { stdio: 'pipe' });
  try {
    if (readFileSync(stampFile, 'utf8') === source) {
      run('/usr/bin/codesign', ['--verify', '--deep', '--strict', bundle]);
      return binary;
    }
  } catch {
    // A missing or damaged local runtime is recreated from the npm Electron distribution.
  }

  mkdirSync(runtimeDir, { recursive: true });
  rmSync(bundle, { recursive: true, force: true });
  run('/usr/bin/ditto', [sourceBundle, bundle]);
  const plist = join(bundle, 'Contents', 'Info.plist');
  run('/usr/bin/plutil', ['-replace', 'CFBundleIdentifier', '-string', 'local.usage-limit-monitor', plist]);
  run('/usr/bin/plutil', ['-replace', 'CFBundleName', '-string', notificationAppName, plist]);
  run('/usr/bin/plutil', ['-replace', 'CFBundleDisplayName', '-string', notificationAppName, plist]);
  // An ad-hoc signature binds Info.plist and resources for local use; no certificate is needed.
  run('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', bundle]);
  run('/usr/bin/codesign', ['--verify', '--deep', '--strict', bundle]);
  writeFileSync(stampFile, source);
  return binary;
}
