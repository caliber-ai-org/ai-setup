import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  acquireFinalizeLock,
  releaseFinalizeLock,
} from '../storage.js';

const LEARNING_DIR = '.caliber/learning';
const LOCK_FILE = path.join(LEARNING_DIR, 'finalize.lock');

describe('acquireFinalizeLock', () => {
  beforeEach(() => {
    if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE);
  });

  afterEach(() => {
    if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE);
  });

  it('acquires lock when no lock file exists', () => {
    expect(acquireFinalizeLock()).toBe(true);
    expect(fs.existsSync(LOCK_FILE)).toBe(true);
    const content = fs.readFileSync(LOCK_FILE, 'utf-8').trim();
    expect(content).toBe(String(process.pid));
  });

  it('fails to acquire when lock is held by current process (fresh)', () => {
    expect(acquireFinalizeLock()).toBe(true);
    expect(acquireFinalizeLock()).toBe(false);
  });

  it('overrides stale lock from a dead process', () => {
    if (!fs.existsSync(LEARNING_DIR)) fs.mkdirSync(LEARNING_DIR, { recursive: true });
    // Write a lock with a PID that doesn't exist (use a very high PID)
    fs.writeFileSync(LOCK_FILE, '999999999');
    // Set mtime to 1 minute ago (within the 5-minute window, but process is dead)
    const oneMinuteAgo = new Date(Date.now() - 60_000);
    fs.utimesSync(LOCK_FILE, oneMinuteAgo, oneMinuteAgo);

    expect(acquireFinalizeLock()).toBe(true);
    const content = fs.readFileSync(LOCK_FILE, 'utf-8').trim();
    expect(content).toBe(String(process.pid));
  });

  it('overrides stale lock that exceeded staleness timeout', () => {
    if (!fs.existsSync(LEARNING_DIR)) fs.mkdirSync(LEARNING_DIR, { recursive: true });
    fs.writeFileSync(LOCK_FILE, '999999999');
    // Set mtime to 10 minutes ago (past the 5-minute staleness threshold)
    const tenMinutesAgo = new Date(Date.now() - 10 * 60_000);
    fs.utimesSync(LOCK_FILE, tenMinutesAgo, tenMinutesAgo);

    expect(acquireFinalizeLock()).toBe(true);
  });

  it('does not override lock held by a live process within timeout', () => {
    if (!fs.existsSync(LEARNING_DIR)) fs.mkdirSync(LEARNING_DIR, { recursive: true });
    // Use our own PID — we are definitely alive
    fs.writeFileSync(LOCK_FILE, String(process.pid));

    // Cannot acquire because we (a live process) hold it and it's fresh
    expect(acquireFinalizeLock()).toBe(false);
  });
});

describe('releaseFinalizeLock', () => {
  it('removes lock file', () => {
    if (!fs.existsSync(LEARNING_DIR)) fs.mkdirSync(LEARNING_DIR, { recursive: true });
    fs.writeFileSync(LOCK_FILE, String(process.pid));

    releaseFinalizeLock();
    expect(fs.existsSync(LOCK_FILE)).toBe(false);
  });

  it('does not throw when no lock file exists', () => {
    expect(() => releaseFinalizeLock()).not.toThrow();
  });
});
