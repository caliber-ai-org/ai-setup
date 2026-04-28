import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  CALIBER_SUBPROCESS_ENV,
  CALIBER_SUBPROCESS_LEGACY_ENV,
  isCaliberSubprocess,
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
});
