import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  resolveCaliber,
  isNpxResolution,
  resetResolvedCaliber,
  isCaliberCommand,
} from '../resolve-caliber.js';
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

  it('returns bare npx command when argv[1] contains _npx and caliber/npx not on PATH', () => {
    process.argv[1] = '/home/user/.npm/_npx/abc123/node_modules/.bin/caliber';
    mockedExecSync.mockImplementation(() => {
      throw new Error('not found');
    });
    const result = resolveCaliber();
    expect(result).toBe('npx --yes @rely-ai/caliber');
  });

  it('returns absolute npx path when in npx context and npx is on PATH but caliber is not', () => {
    process.argv[1] = '/home/user/.npm/_npx/abc123/node_modules/.bin/caliber';
    mockedExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes('which caliber') || cmd.includes('where caliber'))
        throw new Error('not found');
      if (cmd.includes('which npx') || cmd.includes('where npx')) return '/opt/homebrew/bin/npx\n';
      throw new Error('unexpected');
    });
    const result = resolveCaliber();
    expect(result).toBe('/opt/homebrew/bin/npx --yes @rely-ai/caliber');
  });

  it('returns absolute caliber path when in npx context but caliber is globally installed', () => {
    process.argv[1] = '/home/user/.npm/_npx/abc123/node_modules/.bin/caliber';
    mockedExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes('which caliber') || cmd.includes('where caliber'))
        return '/opt/homebrew/bin/caliber\n';
      throw new Error('unexpected');
    });
    const result = resolveCaliber();
    expect(result).toBe('/opt/homebrew/bin/caliber');
  });

  it('returns npx command when npm_execpath contains npx and caliber/npx not on PATH', () => {
    process.argv[1] = '/some/path/caliber';
    process.env.npm_execpath = '/usr/local/lib/node_modules/npm/bin/npx-cli.js';
    mockedExecSync.mockImplementation(() => {
      throw new Error('not found');
    });
    const result = resolveCaliber();
    expect(result).toBe('npx --yes @rely-ai/caliber');
  });

  it('returns absolute path when caliber is found on PATH', () => {
    process.argv[1] = '/usr/local/bin/caliber';
    delete process.env.npm_execpath;
    mockedExecSync.mockReturnValue('/usr/local/bin/caliber\n');
    const result = resolveCaliber();
    expect(result).toBe('/usr/local/bin/caliber');
  });

  it('caches the result across calls', () => {
    process.argv[1] = '/home/user/.npm/_npx/abc/node_modules/.bin/caliber';
    mockedExecSync.mockImplementation(() => {
      throw new Error('not found');
    });
    resolveCaliber();
    process.argv[1] = '/usr/local/bin/caliber';
    expect(resolveCaliber()).toBe('npx --yes @rely-ai/caliber');
  });

  it('resetResolvedCaliber clears the cache', () => {
    process.argv[1] = '/home/user/.npm/_npx/abc/node_modules/.bin/caliber';
    mockedExecSync.mockImplementation(() => {
      throw new Error('not found');
    });
    expect(resolveCaliber()).toBe('npx --yes @rely-ai/caliber');

    resetResolvedCaliber();
    process.argv[1] = '/usr/local/bin/caliber';
    delete process.env.npm_execpath;
    mockedExecSync.mockReturnValue('/usr/local/bin/caliber\n');
    expect(resolveCaliber()).toBe('/usr/local/bin/caliber');
  });
});

describe('isNpxResolution', () => {
  beforeEach(() => {
    resetResolvedCaliber();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns true when resolved to bare npx', () => {
    process.argv[1] = '/home/user/.npm/_npx/abc/node_modules/.bin/caliber';
    mockedExecSync.mockImplementation(() => {
      throw new Error('not found');
    });
    expect(isNpxResolution()).toBe(true);
  });

  it('returns true when resolved to absolute-path npx', () => {
    process.argv[1] = '/home/user/.npm/_npx/abc/node_modules/.bin/caliber';
    mockedExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes('which caliber') || cmd.includes('where caliber'))
        throw new Error('not found');
      if (cmd.includes('which npx') || cmd.includes('where npx')) return '/opt/homebrew/bin/npx\n';
      throw new Error('unexpected');
    });
    expect(isNpxResolution()).toBe(true);
  });

  it('returns false when resolved to absolute caliber path', () => {
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
    expect(isCaliberCommand('/usr/local/bin/caliber refresh --quiet', 'refresh --quiet')).toBe(
      true,
    );
  });

  it('matches npx --yes form', () => {
    expect(isCaliberCommand('npx --yes @rely-ai/caliber refresh --quiet', 'refresh --quiet')).toBe(
      true,
    );
  });

  it('matches npx without --yes', () => {
    expect(isCaliberCommand('npx @rely-ai/caliber refresh --quiet', 'refresh --quiet')).toBe(true);
  });

  it('does not match unrelated commands', () => {
    expect(isCaliberCommand('npm run refresh --quiet', 'refresh --quiet')).toBe(false);
  });
});
