import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

const STALE_MS = 10 * 60 * 1000; // 10 minutes — treat lock as stale after this

// Cache the lock path at acquire time so chdir doesn't change it mid-process
let _lockPath: string | null = null;

function buildLockPath(): string {
  const cwd = process.cwd();
  const hash = crypto.createHash('md5').update(cwd).digest('hex').slice(0, 8);
  return path.join(os.tmpdir(), `.caliber-${hash}.lock`);
}

function getLockFile(): string {
  if (!_lockPath) _lockPath = buildLockPath();
  return _lockPath;
}

/**
 * Check if another caliber process is actively running in a given directory.
 * Used by hook commands (refresh --quiet, learn finalize) to bail early
 * when Claude Code fires SessionEnd hooks mid-session.
 */
export function isCaliberRunning(): boolean {
  try {
    // Check the lock for the CURRENT cwd (which may differ from where acquireLock ran)
    const lockFile = buildLockPath();
    if (!fs.existsSync(lockFile)) return false;
    const raw = fs.readFileSync(lockFile, 'utf-8').trim();
    const { pid, ts } = JSON.parse(raw);

    if (pid === process.pid) return false; // lock belongs to this process, not another

    if (Date.now() - ts > STALE_MS) return false;

    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  } catch {
    return false;
  }
}

/** Write a lock file for the current process. */
export function acquireLock(): void {
  try {
    fs.writeFileSync(getLockFile(), JSON.stringify({ pid: process.pid, ts: Date.now() }));
  } catch {
    // best-effort
  }
}

/** Remove the lock file. */
export function releaseLock(): void {
  try {
    const lockFile = getLockFile();
    if (fs.existsSync(lockFile)) fs.unlinkSync(lockFile);
  } catch {
    // best-effort
  }
}
