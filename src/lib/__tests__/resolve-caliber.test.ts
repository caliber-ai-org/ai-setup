import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resolveCaliber, isNpxResolution, resetResolvedCaliber, isCaliberCommand } from '../resolve-caliber.js';
import { execSync } from 'child_process';

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return { ...actual, default: { ...actual, existsSync: vi.fn(() => false) } };
});

const mockedExecSync = vi.mocked(execSync);

describe('resolveCaliber', () => {
  let originalArgv: string[];
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    resetResolvedCaliber();
    originalArgv = [...process.argv];
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('returns npx command when argv[1] contains _npx', () => {
    process.argv[1] = '/home/user/.npm/_npx/abc123/node_modules/.bin/caliber';
    const result = resolveCaliber();
    expect(result).toBe('npx --yes @rely-ai/caliber');
  });

  it('returns npx command when npm_execpath contains npx', () => {
    process.argv[1] = '/some/path/caliber';
    process.env.npm_execpath = '/usr/local/lib/node_modules/npm/bin/npx-cli.js';
    const result = resolveCaliber();
    expect(result).toBe('npx --yes @rely-ai/caliber');
  });

  it('returns bare caliber when found on PATH', () => {
    process.argv[1] = '/usr/local/bin/caliber';
    delete process.env.npm_execpath;
    mockedExecSync.mockReturnValue('/usr/local/bin/caliber\n');
    const result = resolveCaliber();
    expect(result).toBe('caliber');
  });

  it('caches the result across calls', () => {
    process.argv[1] = '/home/user/.npm/_npx/abc/node_modules/.bin/caliber';
    resolveCaliber();
    process.argv[1] = '/usr/local/bin/caliber';
    expect(resolveCaliber()).toBe('npx --yes @rely-ai/caliber');
  });

  it('resetResolvedCaliber clears the cache', () => {
    process.argv[1] = '/home/user/.npm/_npx/abc/node_modules/.bin/caliber';
    expect(resolveCaliber()).toBe('npx --yes @rely-ai/caliber');

    resetResolvedCaliber();
    process.argv[1] = '/usr/local/bin/caliber';
    delete process.env.npm_execpath;
    mockedExecSync.mockReturnValue('/usr/local/bin/caliber\n');
    expect(resolveCaliber()).toBe('caliber');
  });
});

describe('isNpxResolution', () => {
  beforeEach(() => {
    resetResolvedCaliber();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns true when resolved to npx', () => {
    process.argv[1] = '/home/user/.npm/_npx/abc/node_modules/.bin/caliber';
    expect(isNpxResolution()).toBe(true);
  });

  it('returns false when resolved to bare caliber', () => {
    process.argv[1] = '/usr/local/bin/caliber';
    delete process.env.npm_execpath;
    mockedExecSync.mockReturnValue('/usr/local/bin/caliber\n');
    expect(isNpxResolution()).toBe(false);
  });
});

describe('isCaliberCommand', () => {
  it('matches bare caliber with subcommand', () => {
    expect(isCaliberCommand('caliber refresh --quiet', 'refresh --quiet')).toBe(true);
  });

  it('matches absolute path', () => {
    expect(isCaliberCommand('/usr/local/bin/caliber refresh --quiet', 'refresh --quiet')).toBe(true);
  });

  it('matches npx --yes form', () => {
    expect(isCaliberCommand('npx --yes @rely-ai/caliber refresh --quiet', 'refresh --quiet')).toBe(true);
  });

  it('matches npx without --yes', () => {
    expect(isCaliberCommand('npx @rely-ai/caliber refresh --quiet', 'refresh --quiet')).toBe(true);
  });

  it('does not match unrelated commands', () => {
    expect(isCaliberCommand('npm run refresh --quiet', 'refresh --quiet')).toBe(false);
  });
});
