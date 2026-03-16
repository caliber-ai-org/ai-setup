import { program } from './cli.js';
import { checkForUpdates } from './utils/version-check.js';
import { flushTelemetry } from './telemetry/index.js';

import { acquireLock, releaseLock } from './lib/lock.js';

acquireLock();

if (process.env.CALIBER_LOCAL) {
  process.env.CALIBER_SKIP_UPDATE_CHECK = '1';
}

const isVersionCheck = process.argv.includes('--version') || process.argv.includes('-V');
if (!isVersionCheck) {
  await checkForUpdates();
}

program.parseAsync()
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
