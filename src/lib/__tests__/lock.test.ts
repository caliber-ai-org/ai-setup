import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';

let tmpDir: string;
let originalCwd: string;
let realCwd: string; // process.cwd() AFTER chdir — resolves macOS /var → /private/var symlinks

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'caliber-lock-test-'));
  originalCwd = process.cwd();
  process.chdir(tmpDir);
  realCwd = process.cwd(); // canonical path as Node sees it
  vi.resetModules();
});

afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  vi.resetModules();
  // Clean up any stray lock files for this test's cwd
  try {
    fs.unlinkSync(lockPathForCwd());
  } catch {
    // already gone
  }
});

function lockPathForCwd(): string {
  const hash = crypto.createHash('md5').update(realCwd).digest('hex').slice(0, 8);
  return path.join(os.tmpdir(), `.caliber-${hash}.lock`);
}

describe('isCaliberRunning', () => {
  it('returns false when no lock file exists', async () => {
    const { isCaliberRunning } = await import('../lock.js');
    expect(isCaliberRunning()).toBe(false);
  });

  it('returns false when lock file contains the current process PID', async () => {
    // This is the core bug: bin.ts calls acquireLock() at startup, then
    // learnFinalizeCommand calls isCaliberRunning() and must NOT treat itself
    // as "another caliber process is running"
    const lockPath = lockPathForCwd();
    fs.writeFileSync(lockPath, JSON.stringify({ pid: process.pid, ts: Date.now() }));

    const { isCaliberRunning } = await import('../lock.js');
    expect(isCaliberRunning()).toBe(false);
  });

  it('returns true when lock is held by a different live process', async () => {
    const lockPath = lockPathForCwd();
    // process.ppid is always alive (our parent shell/test runner)
    fs.writeFileSync(lockPath, JSON.stringify({ pid: process.ppid, ts: Date.now() }));

    const { isCaliberRunning } = await import('../lock.js');
    expect(isCaliberRunning()).toBe(true);
  });

  it('returns false when lock is held by a dead process', async () => {
    const lockPath = lockPathForCwd();
    fs.writeFileSync(lockPath, JSON.stringify({ pid: 999999999, ts: Date.now() }));

    const { isCaliberRunning } = await import('../lock.js');
    expect(isCaliberRunning()).toBe(false);
  });

  it('returns false when lock is stale (older than 10 minutes)', async () => {
    const lockPath = lockPathForCwd();
    const elevenMinutesAgo = Date.now() - 11 * 60 * 1000;
    fs.writeFileSync(lockPath, JSON.stringify({ pid: process.ppid, ts: elevenMinutesAgo }));

    const { isCaliberRunning } = await import('../lock.js');
    expect(isCaliberRunning()).toBe(false);
  });
});

describe('acquireLock / releaseLock', () => {
  it('writes lock file with current pid and ts', async () => {
    const { acquireLock } = await import('../lock.js');
    const lockPath = lockPathForCwd();

    acquireLock();
    expect(fs.existsSync(lockPath)).toBe(true);
    const { pid, ts } = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
    expect(pid).toBe(process.pid);
    expect(typeof ts).toBe('number');
  });

  it('releaseLock removes the lock file', async () => {
    const { acquireLock, releaseLock } = await import('../lock.js');
    const lockPath = lockPathForCwd();

    acquireLock();
    expect(fs.existsSync(lockPath)).toBe(true);
    releaseLock();
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it('releaseLock does not throw when no lock file exists', async () => {
    const { releaseLock } = await import('../lock.js');
    expect(() => releaseLock()).not.toThrow();
  });
});
