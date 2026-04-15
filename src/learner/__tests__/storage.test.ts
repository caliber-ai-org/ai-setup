import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'caliber-storage-test-'));

vi.mock('../../constants.js', async () => {
  const actual = await vi.importActual<typeof import('../../constants.js')>('../../constants.js');
  return {
    ...actual,
    getLearningDir: () => tmpBase,
  };
});

import {
  acquireFinalizeLock,
  releaseFinalizeLock,
  appendPromptEvent,
  readAllEvents,
  getEventCount,
} from '../storage.js';
import type { PromptEvent } from '../storage.js';

const LOCK_FILE = path.join(tmpBase, 'finalize.lock');

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
    fs.writeFileSync(LOCK_FILE, '999999999');
    const oneMinuteAgo = new Date(Date.now() - 60_000);
    fs.utimesSync(LOCK_FILE, oneMinuteAgo, oneMinuteAgo);

    expect(acquireFinalizeLock()).toBe(true);
    const content = fs.readFileSync(LOCK_FILE, 'utf-8').trim();
    expect(content).toBe(String(process.pid));
  });

  it('overrides stale lock that exceeded staleness timeout', () => {
    fs.writeFileSync(LOCK_FILE, '999999999');
    const tenMinutesAgo = new Date(Date.now() - 10 * 60_000);
    fs.utimesSync(LOCK_FILE, tenMinutesAgo, tenMinutesAgo);

    expect(acquireFinalizeLock()).toBe(true);
  });

  it('does not override lock held by a live process within timeout', () => {
    fs.writeFileSync(LOCK_FILE, String(process.pid));

    expect(acquireFinalizeLock()).toBe(false);
  });
});

describe('releaseFinalizeLock', () => {
  it('removes lock file', () => {
    fs.writeFileSync(LOCK_FILE, String(process.pid));

    releaseFinalizeLock();
    expect(fs.existsSync(LOCK_FILE)).toBe(false);
  });

  it('does not throw when no lock file exists', () => {
    expect(() => releaseFinalizeLock()).not.toThrow();
  });
});

const SESSION_FILE = path.join(tmpBase, 'current-session.jsonl');

describe('appendPromptEvent', () => {
  beforeEach(() => {
    if (fs.existsSync(SESSION_FILE)) fs.unlinkSync(SESSION_FILE);
  });

  afterEach(() => {
    if (fs.existsSync(SESSION_FILE)) fs.unlinkSync(SESSION_FILE);
  });

  it('truncates long prompt content to 2000 chars', () => {
    const longContent = 'x'.repeat(5000);
    const event: PromptEvent = {
      timestamp: new Date().toISOString(),
      session_id: 'test',
      hook_event_name: 'UserPromptSubmit',
      prompt_content: longContent,
      cwd: '/tmp',
    };
    appendPromptEvent(event);

    const stored = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf-8').trim());
    expect(stored.prompt_content.length).toBe(2000);
  });

  it('preserves short prompt content as-is', () => {
    const event: PromptEvent = {
      timestamp: new Date().toISOString(),
      session_id: 'test',
      hook_event_name: 'UserPromptSubmit',
      prompt_content: 'short prompt',
      cwd: '/tmp',
    };
    appendPromptEvent(event);

    const stored = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf-8').trim());
    expect(stored.prompt_content).toBe('short prompt');
  });
});

describe('readAllEvents with oversized file', () => {
  beforeEach(() => {
    if (fs.existsSync(SESSION_FILE)) fs.unlinkSync(SESSION_FILE);
  });

  afterEach(() => {
    if (fs.existsSync(SESSION_FILE)) fs.unlinkSync(SESSION_FILE);
  });

  it('returns empty and truncates file when over 10MB', () => {
    const bigLine = JSON.stringify({ hook_event_name: 'PostToolUse', data: 'x'.repeat(11 * 1024 * 1024) });
    fs.writeFileSync(SESSION_FILE, bigLine + '\n');

    const events = readAllEvents();
    expect(events).toEqual([]);
    expect(fs.readFileSync(SESSION_FILE, 'utf-8')).toBe('');
  });
});

describe('getEventCount with oversized file', () => {
  beforeEach(() => {
    if (fs.existsSync(SESSION_FILE)) fs.unlinkSync(SESSION_FILE);
  });

  afterEach(() => {
    if (fs.existsSync(SESSION_FILE)) fs.unlinkSync(SESSION_FILE);
  });

  it('returns 0 for oversized file', () => {
    const bigLine = JSON.stringify({ data: 'x'.repeat(11 * 1024 * 1024) });
    fs.writeFileSync(SESSION_FILE, bigLine + '\n');

    expect(getEventCount()).toBe(0);
  });
});
