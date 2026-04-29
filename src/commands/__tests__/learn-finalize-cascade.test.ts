import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// F-P0-9: learn finalize must skip silently when fired from a SessionEnd hook
// inside a user-initiated `claude -p` session (CLAUDECODE=1 + !CALIBER_SUBPROCESS).
// Otherwise the hook spawns another claude -p for the LLM call, which Claude Code's
// hook timeout cancels mid-cascade — producing visible "Hook cancelled" stderr noise.

describe('learn finalize hook-cascade short-circuit (F-P0-9)', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    vi.resetModules();
    delete process.env.CLAUDECODE;
    delete process.env.CALIBER_SUBPROCESS;
    delete process.env.CALIBER_SPAWNED;
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.resetModules();
  });

  it('skips when --auto AND inside user-initiated Claude Code session', async () => {
    process.env.CLAUDECODE = '1';
    delete process.env.CALIBER_SUBPROCESS;

    const lockMock = { isCaliberRunning: vi.fn(), acquireFinalizeLock: vi.fn() };
    vi.doMock('../../lib/lock.js', () => lockMock);

    const { learnFinalizeCommand } = await import('../learn.js');
    await expect(learnFinalizeCommand({ auto: true })).resolves.toBeUndefined();
    // The cascade short-circuit fires before any lock check.
    expect(lockMock.isCaliberRunning).not.toHaveBeenCalled();
  });

  it('proceeds (does not short-circuit on cascade) when --auto + caliber-spawned', async () => {
    process.env.CLAUDECODE = '1';
    process.env.CALIBER_SUBPROCESS = '1';
    // CALIBER_SUBPROCESS=1 path: existing isCaliberSubprocess() guard fires first
    // (covered by spawned-session-guard.test.ts). The new cascade check only
    // fires when CALIBER_SUBPROCESS is NOT set. This test asserts no crash.
    const { learnFinalizeCommand } = await import('../learn.js');
    await expect(learnFinalizeCommand({ auto: true })).resolves.toBeUndefined();
  });

  it('proceeds when --auto but no CLAUDECODE (e.g. pre-commit hook)', async () => {
    delete process.env.CLAUDECODE;
    delete process.env.CALIBER_SUBPROCESS;
    // Refresh proceeds past the cascade short-circuit. Will return undefined
    // eventually for other reasons (no events to analyze, etc.) — test asserts no throw.
    const { learnFinalizeCommand } = await import('../learn.js');
    await expect(learnFinalizeCommand({ auto: true })).resolves.toBeUndefined();
  });

  it('proceeds (no cascade short-circuit) when CLAUDECODE=1 but NOT --auto', async () => {
    process.env.CLAUDECODE = '1';
    delete process.env.CALIBER_SUBPROCESS;
    // The cascade check is gated on isAuto. A user manually running
    // `caliber learn finalize` from an interactive Claude Code terminal
    // should still work normally.
    const { learnFinalizeCommand } = await import('../learn.js');
    await expect(learnFinalizeCommand({})).resolves.toBeUndefined();
  });
});
