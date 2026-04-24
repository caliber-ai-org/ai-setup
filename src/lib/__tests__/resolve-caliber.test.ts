import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  resolveCaliber,
  isNpxResolution,
  resetResolvedCaliber,
  isCaliberCommand,
  pickExecutable,
} from '../resolve-caliber.js';
import { execSync } from 'child_process';

function withPlatform(platform: NodeJS.Platform, fn: () => void): void {
  const original = process.platform;
  Object.defineProperty(process, 'platform', { value: platform, configurable: true });
  try {
    fn();
  } finally {
    Object.defineProperty(process, 'platform', { value: original, configurable: true });
  }
}

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

describe('pickExecutable', () => {
  it('returns the first line on POSIX', () => {
    withPlatform('linux', () => {
      expect(pickExecutable('/usr/local/bin/caliber\n/opt/bin/caliber')).toBe(
        '/usr/local/bin/caliber',
      );
    });
  });

  it('prefers .cmd over the POSIX shim on Windows', () => {
    withPlatform('win32', () => {
      const out =
        'C:\\Users\\dev\\AppData\\Roaming\\npm\\caliber\nC:\\Users\\dev\\AppData\\Roaming\\npm\\caliber.cmd';
      expect(pickExecutable(out)).toBe('C:\\Users\\dev\\AppData\\Roaming\\npm\\caliber.cmd');
    });
  });

  it('prefers .exe / .bat over extensionless on Windows', () => {
    withPlatform('win32', () => {
      expect(pickExecutable('C:\\bin\\foo\nC:\\bin\\foo.exe')).toBe('C:\\bin\\foo.exe');
      expect(pickExecutable('C:\\bin\\foo\nC:\\bin\\foo.bat')).toBe('C:\\bin\\foo.bat');
    });
  });

  it('falls back to first line on Windows when no .cmd/.exe/.bat present', () => {
    withPlatform('win32', () => {
      expect(pickExecutable('C:\\bin\\foo\nC:\\bin\\bar')).toBe('C:\\bin\\foo');
    });
  });

  it('returns empty string for empty input', () => {
    expect(pickExecutable('')).toBe('');
    expect(pickExecutable('\n\n')).toBe('');
  });

  it('handles CRLF line endings from Windows `where`', () => {
    withPlatform('win32', () => {
      expect(pickExecutable('C:\\bin\\foo\r\nC:\\bin\\foo.cmd\r\n')).toBe('C:\\bin\\foo.cmd');
    });
  });

  it('matches the extension only — not `cmd` substrings in directory names', () => {
    withPlatform('win32', () => {
      expect(pickExecutable('C:\\cmd-tools\\bin\\caliber')).toBe('C:\\cmd-tools\\bin\\caliber');
      expect(pickExecutable('C:\\cmd-tools\\bin\\caliber\nC:\\cmd-tools\\bin\\caliber.cmd')).toBe(
        'C:\\cmd-tools\\bin\\caliber.cmd',
      );
    });
  });
});

describe('resolveCaliber on Windows', () => {
  beforeEach(() => {
    resetResolvedCaliber();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('selects caliber.cmd over the POSIX shim', () => {
    withPlatform('win32', () => {
      process.argv[1] = 'C:\\Users\\dev\\AppData\\Roaming\\npm\\caliber';
      delete process.env.npm_execpath;
      mockedExecSync.mockReturnValue(
        'C:\\Users\\dev\\AppData\\Roaming\\npm\\caliber\nC:\\Users\\dev\\AppData\\Roaming\\npm\\caliber.cmd\n',
      );
      expect(resolveCaliber()).toBe('C:\\Users\\dev\\AppData\\Roaming\\npm\\caliber.cmd');
    });
  });

  it('selects npx.cmd over the POSIX shim in npx context', () => {
    withPlatform('win32', () => {
      process.argv[1] =
        'C:\\Users\\dev\\AppData\\Local\\npm-cache\\_npx\\abc\\node_modules\\.bin\\caliber';
      mockedExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('where caliber')) throw new Error('not found');
        if (cmd.includes('where npx'))
          return 'C:\\Users\\dev\\AppData\\Roaming\\npm\\npx\nC:\\Users\\dev\\AppData\\Roaming\\npm\\npx.cmd\n';
        throw new Error('unexpected');
      });
      const result = resolveCaliber();
      expect(result).toBe('C:\\Users\\dev\\AppData\\Roaming\\npm\\npx.cmd --yes @rely-ai/caliber');
      expect(isNpxResolution()).toBe(true);
    });
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
