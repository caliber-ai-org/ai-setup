import { program } from './cli.js';
import { checkForUpdates } from './utils/version-check.js';
import { flushTelemetry } from './telemetry/index.js';

import { acquireLock, releaseLock } from './lib/lock.js';
import { restoreTerminal } from './lib/terminal.js';

let signalCleanupDone = false;

function signalCleanup(code: number) {
  if (signalCleanupDone) return;
  signalCleanupDone = true;
  restoreTerminal();
  releaseLock();
  process.exit(code);
}

process.on('exit', restoreTerminal);
process.on('SIGINT', () => signalCleanup(130));
process.on('SIGTERM', () => signalCleanup(143));

acquireLock();

if (process.env.CALIBER_LOCAL) {
  process.env.CALIBER_SKIP_UPDATE_CHECK = '1';
}

const userArgs = process.argv.slice(2);
const hasCommand = userArgs.some((a) => !a.startsWith('-'));
const isQuickExit =
  !hasCommand || ['--version', '-V', '--help', '-h'].some((f) => userArgs.includes(f));
if (!isQuickExit) {
  await checkForUpdates();
}

program
  .parseAsync()
  .catch((err) => {
    const msg = err instanceof Error ? err.message : 'Unexpected error';
    if (msg !== '__exit__') {
      console.error(msg);
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    releaseLock();
    await flushTelemetry();
    process.exit(Number(process.exitCode ?? 0));
  });
