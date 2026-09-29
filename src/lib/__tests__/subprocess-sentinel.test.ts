import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  CALIBER_SUBPROCESS_ENV,
  CALIBER_SUBPROCESS_LEGACY_ENV,
  GIT_HOOK_ENV,
  isCaliberSubprocess,
  isGitHookInvocation,
  isHookCascadeFromUserClaudeSession,
  withCaliberSubprocessEnv,
} from '../subprocess-sentinel.js';

describe('subprocess-sentinel', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    delete process.env[CALIBER_SUBPROCESS_ENV];
    delete process.env[CALIBER_SUBPROCESS_LEGACY_ENV];
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('isCaliberSubprocess()', () => {
    it('returns false when CALIBER_SUBPROCESS is unset', () => {
      expect(isCaliberSubprocess()).toBe(false);
    });

    it('returns true when CALIBER_SUBPROCESS=1', () => {
      process.env[CALIBER_SUBPROCESS_ENV] = '1';
      expect(isCaliberSubprocess()).toBe(true);
    });

    it('returns false when CALIBER_SUBPROCESS is set to anything other than "1"', () => {
      process.env[CALIBER_SUBPROCESS_ENV] = 'true';
      expect(isCaliberSubprocess()).toBe(false);
      process.env[CALIBER_SUBPROCESS_ENV] = '0';
      expect(isCaliberSubprocess()).toBe(false);
      process.env[CALIBER_SUBPROCESS_ENV] = '';
      expect(isCaliberSubprocess()).toBe(false);
    });

    it('does NOT read the legacy CALIBER_SPAWNED env var (clean rename)', () => {
      // The legacy var is still WRITTEN by withCaliberSubprocessEnv() so stale
      // installed bash hook scripts keep working, but new TS code only reads the
      // canonical CALIBER_SUBPROCESS name. A bare CALIBER_SPAWNED with no
      // CALIBER_SUBPROCESS would mean someone set the env var by hand — not
      // something we want to honor.
      process.env[CALIBER_SUBPROCESS_LEGACY_ENV] = '1';
      expect(isCaliberSubprocess()).toBe(false);
    });
  });

  describe('withCaliberSubprocessEnv()', () => {
    it('sets CALIBER_SUBPROCESS=1 on the returned env', () => {
      const env = withCaliberSubprocessEnv({ FOO: 'bar' } as NodeJS.ProcessEnv);
      expect(env[CALIBER_SUBPROCESS_ENV]).toBe('1');
    });

    it('also sets the legacy CALIBER_SPAWNED=1 for one transition release', () => {
      // Stale .claude/hooks/*.sh files installed by Caliber <= 1.47 check
      // $CALIBER_SPAWNED. Setting both at spawn keeps those scripts working
      // until the user re-runs `caliber init`. Drop in the next minor.
      const env = withCaliberSubprocessEnv({ FOO: 'bar' } as NodeJS.ProcessEnv);
      expect(env[CALIBER_SUBPROCESS_LEGACY_ENV]).toBe('1');
    });

    it('preserves the input env entries', () => {
      const env = withCaliberSubprocessEnv({ FOO: 'bar', BAZ: 'qux' } as NodeJS.ProcessEnv);
      expect(env.FOO).toBe('bar');
      expect(env.BAZ).toBe('qux');
    });

    it('does not mutate the input env object', () => {
      const input: NodeJS.ProcessEnv = { FOO: 'bar' };
      withCaliberSubprocessEnv(input);
      expect(input).toEqual({ FOO: 'bar' });
      expect(CALIBER_SUBPROCESS_ENV in input).toBe(false);
    });

    it('overrides any existing CALIBER_SUBPROCESS/CALIBER_SPAWNED in the input', () => {
      const env = withCaliberSubprocessEnv({
        [CALIBER_SUBPROCESS_ENV]: '0',
        [CALIBER_SUBPROCESS_LEGACY_ENV]: 'no',
      });
      expect(env[CALIBER_SUBPROCESS_ENV]).toBe('1');
      expect(env[CALIBER_SUBPROCESS_LEGACY_ENV]).toBe('1');
    });

    it('handles undefined values in the input env (NodeJS.ProcessEnv shape)', () => {
      const input: NodeJS.ProcessEnv = { FOO: undefined, BAR: 'set' };
      const env = withCaliberSubprocessEnv(input);
      expect(env.FOO).toBeUndefined();
      expect(env.BAR).toBe('set');
      expect(env[CALIBER_SUBPROCESS_ENV]).toBe('1');
    });
  });

  describe('isHookCascadeFromUserClaudeSession (F-P0-9)', () => {
    let originalIsTTY: boolean | undefined;

    beforeEach(() => {
      delete process.env.CLAUDECODE;
      delete process.env[CALIBER_SUBPROCESS_ENV];
      delete process.env[CALIBER_SUBPROCESS_LEGACY_ENV];
      // A real git hook exports this; a test run must not inherit it.
      delete process.env[GIT_HOOK_ENV];
      // Default to non-TTY (the hook-runner case). Tests that need to assert
      // the TTY override flip it explicitly.
      originalIsTTY = process.stdin.isTTY;
      Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
    });

    afterEach(() => {
      Object.defineProperty(process.stdin, 'isTTY', {
        value: originalIsTTY,
        configurable: true,
      });
    });

    it('returns false when not in any claude session', () => {
      expect(isHookCascadeFromUserClaudeSession()).toBe(false);
    });

    it('returns true when CLAUDECODE=1, no CALIBER_SUBPROCESS, stdin not a TTY (the cascade case)', () => {
      process.env.CLAUDECODE = '1';
      expect(isHookCascadeFromUserClaudeSession()).toBe(true);
    });

    it('returns false when in a caliber-spawned claude session (CLAUDECODE=1 + CALIBER_SUBPROCESS=1)', () => {
      process.env.CLAUDECODE = '1';
      process.env[CALIBER_SUBPROCESS_ENV] = '1';
      expect(isHookCascadeFromUserClaudeSession()).toBe(false);
    });

    it('returns false when CALIBER_SUBPROCESS=1 even without CLAUDECODE', () => {
      process.env[CALIBER_SUBPROCESS_ENV] = '1';
      expect(isHookCascadeFromUserClaudeSession()).toBe(false);
    });

    it('returns false when stdin IS a TTY (user manually invoked from terminal inside Claude Code)', () => {
      // CLAUDECODE=1 + !CALIBER_SUBPROCESS but stdin is TTY → user typed the
      // command interactively. They want it to run, not silently no-op.
      process.env.CLAUDECODE = '1';
      Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
      expect(isHookCascadeFromUserClaudeSession()).toBe(false);
    });

    // ── git hooks are not Claude Code hooks ────────────────────────────
    //
    // `git commit` run from inside a Claude Code session hits all three
    // cascade signals, so the pre-commit hook's `refresh --quiet` was
    // skipped on every agent-driven commit — silently, because the skip
    // returns 0 and prints nothing.

    it('returns false inside a git hook even though every cascade signal holds', () => {
      process.env.CLAUDECODE = '1';
      process.env[GIT_HOOK_ENV] = '.git/index';
      // Same state as the cascade case above, which returns true.
      expect(isHookCascadeFromUserClaudeSession()).toBe(false);
    });

    it('still reports the cascade once the git hook env is gone', () => {
      process.env.CLAUDECODE = '1';
      process.env[GIT_HOOK_ENV] = '.git/index';
      expect(isHookCascadeFromUserClaudeSession()).toBe(false);
      delete process.env[GIT_HOOK_ENV];
      expect(isHookCascadeFromUserClaudeSession()).toBe(true);
    });

    it('does not exempt on an empty GIT_INDEX_FILE', () => {
      // Exported-but-empty is not a git hook; do not widen the hole.
      process.env.CLAUDECODE = '1';
      process.env[GIT_HOOK_ENV] = '';
      expect(isHookCascadeFromUserClaudeSession()).toBe(true);
    });
  });

  describe('isGitHookInvocation()', () => {
    beforeEach(() => {
      delete process.env[GIT_HOOK_ENV];
    });

    it('is false in an ordinary process', () => {
      expect(isGitHookInvocation()).toBe(false);
    });

    it('is true when git exports GIT_INDEX_FILE', () => {
      process.env[GIT_HOOK_ENV] = '.git/index';
      expect(isGitHookInvocation()).toBe(true);
    });

    it('is false when the var is exported empty', () => {
      process.env[GIT_HOOK_ENV] = '';
      expect(isGitHookInvocation()).toBe(false);
    });
  });
});
