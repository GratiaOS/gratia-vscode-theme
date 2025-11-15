import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const procs = [
  spawn(process.execPath, [path.join(__dirname, 'prepublish-tokens.mjs'), '--watch'], {
    stdio: 'inherit',
    cwd: ROOT,
  }),
  spawn(process.execPath, [path.join(__dirname, 'generate-theme.mjs'), '--watch'], {
    stdio: 'inherit',
    cwd: ROOT,
  }),
];

const cleanup = () => {
  procs.forEach((proc) => {
    if (!proc.killed) {
      try {
        proc.kill();
      } catch {
        /* noop */
      }
    }
  });
};

procs.forEach((proc) => {
  proc.on('exit', (code) => {
    if (code && code !== 0) {
      process.exitCode = code;
      cleanup();
    }
  });
});

process.on('SIGINT', () => {
  cleanup();
  process.exit(0);
});
process.on('SIGTERM', () => {
  cleanup();
  process.exit(0);
});
