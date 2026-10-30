import { spawn } from 'node:child_process';
import { notificationAppName, prepareRuntime, projectRoot } from './macos-runtime.mjs';

process.chdir(projectRoot);
await import('./build.mjs');
const child = spawn(prepareRuntime(), ['.'], {
  cwd: projectRoot,
  stdio: 'inherit',
  env: { ...process.env, ULM_NOTIFICATION_APP_NAME: notificationAppName },
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.on('exit', (code, signal) => {
  process.exitCode = code ?? (signal === 'SIGINT' ? 130 : 1);
});
