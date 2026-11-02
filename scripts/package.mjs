import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { notificationAppName, prepareRuntime, projectRoot } from './macos-runtime.mjs';

process.chdir(projectRoot);
if (process.platform !== 'darwin') throw new Error('Packaging requires macOS.');
await import('./build.mjs');

const runtime = resolve(prepareRuntime(), '../../..');
const output = join(projectRoot, 'tmp', 'package');
const bundle = join(output, `${notificationAppName}.app`);
const run = (command, args) => execFileSync(command, args, { stdio: 'pipe' });
mkdirSync(output, { recursive: true });
rmSync(bundle, { recursive: true, force: true });
run('/usr/bin/ditto', [runtime, bundle]);
const resources = join(bundle, 'Contents', 'Resources');
rmSync(join(resources, 'default_app.asar'), { force: true });
const appDir = join(resources, 'app');
mkdirSync(appDir, { recursive: true });
const { name, version, description, main } = JSON.parse(readFileSync('package.json', 'utf8'));
writeFileSync(
  join(appDir, 'package.json'),
  JSON.stringify({ name, productName: notificationAppName, version, description, main }, null, 2) + '\n',
);
// FC-F003: keep the hook as a real file so ELECTRON_RUN_AS_NODE works without the checkout.
cpSync('dist', join(appDir, 'dist'), { recursive: true });
const plist = join(bundle, 'Contents', 'Info.plist');
// Electron identifies the default executable name as development mode even with embedded code.
renameSync(
  join(bundle, 'Contents', 'MacOS', 'Electron'),
  join(bundle, 'Contents', 'MacOS', notificationAppName),
);
run('/usr/bin/plutil', ['-replace', 'CFBundleExecutable', '-string', notificationAppName, plist]);
for (const key of ['CFBundleVersion', 'CFBundleShortVersionString']) {
  run('/usr/bin/plutil', ['-replace', key, '-string', version, plist]);
}
// FC-F014, FC-F015: seal the final resources, not just the development runtime.
run('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', bundle]);
run('/usr/bin/codesign', ['--verify', '--deep', '--strict', bundle]);
console.log(`Packaged for ${process.arch}: ${bundle}`);
