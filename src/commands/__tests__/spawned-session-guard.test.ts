import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// These tests verify that caliber hook commands exit immediately when
// CALIBER_SUBPROCESS=1, which caliber sets in spawnClaude/spawnOpenCode/cursor-acp
// for all LLM subprocess invocations. Without this guard, SessionEnd hooks fired
// inside a caliber-spawned session cascade recursively (each makes its own LLM call
// → new claude -p → new hooks → ...) until Claude Code times one out and reports
// "Hook cancelled", causing the parent caliber refresh to fail with exit code 1.
//
// CALIBER_SUBPROCESS replaced the legacy CALIBER_SPAWNED env var. The legacy name
// is still SET by spawn helpers for one transition release (so stale installed
// .claude/hooks/*.sh files keep working), but no longer READ by TypeScript guards.
// See src/lib/subprocess-sentinel.ts.

describe('spawned-session guard (CALIBER_SUBPROCESS=1)', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    vi.resetModules();
    // F-P0-9 (added in v1.49.1): refresh/finalize also short-circuit when
    // CLAUDECODE=1 + !CALIBER_SUBPROCESS (user-initiated claude -p session).
    // These tests pre-date that check and exercise the CALIBER_SUBPROCESS guard
    // in isolation. Clear CLAUDECODE so the new guard doesn't fire and mask
    // what we're trying to test here.
    delete process.env.CLAUDECODE;
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.resetModules();
  });

  describe('refreshCommand (quiet mode)', () => {
    it('returns immediately without calling isCaliberRunning when CALIBER_SUBPROCESS=1', async () => {
      process.env.CALIBER_SUBPROCESS = '1';

      const lockMock = { isCaliberRunning: vi.fn().mockReturnValue(false) };
      vi.doMock('../../lib/lock.js', () => lockMock);

      const { refreshCommand } = await import('../refresh.js');
      // Should return before making any LLM calls or checking lock
      await expect(refreshCommand({ quiet: true })).resolves.toBeUndefined();
      expect(lockMock.isCaliberRunning).not.toHaveBeenCalled();
    });

    it('proceeds normally when CALIBER_SUBPROCESS is not set', async () => {
      delete process.env.CALIBER_SUBPROCESS;

      const lockMock = { isCaliberRunning: vi.fn().mockReturnValue(true) };
      vi.doMock('../../lib/lock.js', () => lockMock);

      const { refreshCommand } = await import('../refresh.js');
      await expect(refreshCommand({ quiet: true })).resolves.toBeUndefined();
      expect(lockMock.isCaliberRunning).toHaveBeenCalled();
    });

    it('does NOT short-circuit on the legacy CALIBER_SPAWNED env var alone', async () => {
      // Legacy name is still WRITTEN by spawn helpers for one transition release
      // so stale installed bash hook scripts keep working. But TS guards read
      // CALIBER_SUBPROCESS only — a bare CALIBER_SPAWNED has no effect.
      delete process.env.CALIBER_SUBPROCESS;
      process.env.CALIBER_SPAWNED = '1';

      const lockMock = { isCaliberRunning: vi.fn().mockReturnValue(true) };
      vi.doMock('../../lib/lock.js', () => lockMock);

      const { refreshCommand } = await import('../refresh.js');
      await expect(refreshCommand({ quiet: true })).resolves.toBeUndefined();
      expect(lockMock.isCaliberRunning).toHaveBeenCalled();
    });
  });

  describe('learnFinalizeCommand (auto mode)', () => {
    it('returns immediately without doing any work when CALIBER_SUBPROCESS=1', async () => {
      process.env.CALIBER_SUBPROCESS = '1';

      const lockMock = { isCaliberRunning: vi.fn(), acquireFinalizeLock: vi.fn() };
      vi.doMock('../../lib/lock.js', () => lockMock);

      const { learnFinalizeCommand } = await import('../learn.js');
      await expect(learnFinalizeCommand({ auto: true })).resolves.toBeUndefined();
      expect(lockMock.isCaliberRunning).not.toHaveBeenCalled();
    });

    it('proceeds normally when CALIBER_SUBPROCESS is not set', async () => {
      delete process.env.CALIBER_SUBPROCESS;

      // acquireFinalizeLock returns false → early exit, but the point is we got past the guard
      const storageMock = {
        acquireFinalizeLock: vi.fn().mockReturnValue(false),
        releaseFinalizeLock: vi.fn(),
        readAllEvents: vi.fn().mockReturnValue([]),
        readState: vi.fn().mockReturnValue({ eventCount: 0 }),
        writeState: vi.fn(),
        clearSession: vi.fn(),
        resetState: vi.fn(),
        getEventCount: vi.fn().mockReturnValue(0),
        appendEvent: vi.fn(),
        appendPromptEvent: vi.fn(),
      };
      vi.doMock('../../learner/storage.js', () => storageMock);

      const { learnFinalizeCommand } = await import('../learn.js');
      await expect(learnFinalizeCommand({ auto: true })).resolves.toBeUndefined();
      expect(storageMock.acquireFinalizeLock).toHaveBeenCalled();
    });
  });

  describe('learnObserveCommand', () => {
    it('returns immediately when CALIBER_SUBPROCESS=1', async () => {
      process.env.CALIBER_SUBPROCESS = '1';

      const { learnObserveCommand } = await import('../learn.js');
      // Should return without reading stdin or doing anything
      await expect(learnObserveCommand({})).resolves.toBeUndefined();
    });
  });
});
