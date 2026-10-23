import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  resolveCaliber,
  isNpxResolution,
  resetResolvedCaliber,
  isCaliberCommand,
  pickExecutable,
  displayCaliberName,
  resolveCaliberHookInvoker,
  toHookPath,
} from '../resolve-caliber.js';
import { execSync } from 'child_process';
import fs from 'fs';

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

describe('displayCaliberName (F-P0-3)', () => {
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
    resetResolvedCaliber();
    vi.restoreAllMocks();
  });

  it('returns "caliber" for global install (no npx)', () => {
    process.argv[1] = '/usr/local/bin/caliber';
    delete process.env.npm_execpath;
    mockedExecSync.mockReturnValue('/Users/someone/.nvm/versions/node/v20/bin/caliber\n');
    expect(displayCaliberName()).toBe('caliber');
  });

  it('returns "npx @rely-ai/caliber" when npx resolution is used', () => {
    process.argv[1] = '/home/user/.npm/_npx/abc/node_modules/.bin/caliber';
    mockedExecSync.mockImplementation(() => {
      throw new Error('not found');
    });
    expect(displayCaliberName()).toBe('npx @rely-ai/caliber');
  });

  it('does NOT return an absolute path even when caliber resolves to one', () => {
    process.argv[1] = '/usr/local/bin/caliber';
    delete process.env.npm_execpath;
    mockedExecSync.mockReturnValue('/Users/someone/.nvm/versions/node/v20/bin/caliber\n');
    const display = displayCaliberName();
    expect(display).not.toMatch(/^\//);
    expect(display).not.toContain('.nvm');
    expect(display).not.toContain('Users');
  });
});

describe('resolveCaliberHookInvoker (Windows cmd-shim bypass)', () => {
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
    resetResolvedCaliber();
    vi.restoreAllMocks();
  });

  it('on POSIX returns the resolveCaliber() value unchanged', () => {
    withPlatform('linux', () => {
      mockedExecSync.mockReturnValue('/usr/local/bin/caliber\n');
      expect(resolveCaliberHookInvoker()).toBe('/usr/local/bin/caliber');
    });
  });

  it('on Windows returns the .cmd path with forward slashes when bin.js is missing', () => {
    withPlatform('win32', () => {
      // No bin.js sibling (existsSync mock returns false by default).
      mockedExecSync.mockReturnValue('C:\\Users\\u\\AppData\\Roaming\\npm\\caliber.cmd\n');
      const got = resolveCaliberHookInvoker();
      expect(got).toBe('C:/Users/u/AppData/Roaming/npm/caliber.cmd');
    });
  });

  it('on Windows returns node-direct invocation when .cmd + bin.js + node are present', () => {
    withPlatform('win32', () => {
      // Two execSync calls: first `where caliber`, then `where node`.
      mockedExecSync
        .mockReturnValueOnce('C:\\Users\\u\\AppData\\Roaming\\npm\\caliber.cmd\n')
        .mockReturnValueOnce('C:\\Program Files\\nodejs\\node.exe\n');
      // bin.js sibling exists.
      vi.spyOn(fs, 'existsSync').mockImplementation(
        (p) =>
          String(p).endsWith('@rely-ai\\caliber\\dist\\bin.js') ||
          String(p).endsWith('@rely-ai/caliber/dist/bin.js'),
      );

      const got = resolveCaliberHookInvoker();
      // Forward-slashed both paths, both quoted, no `caliber.cmd` anywhere.
      expect(got).toContain('"C:/Program Files/nodejs/node.exe"');
      expect(got).toContain('@rely-ai/caliber/dist/bin.js"');
      expect(got).not.toContain('.cmd');
    });
  });

  it('on Windows returns wscript-wrapped form when hook-runner.vbs and wscript are present', () => {
    withPlatform('win32', () => {
      mockedExecSync
        .mockReturnValueOnce('C:\\Users\\u\\AppData\\Roaming\\npm\\caliber.cmd\n')
        .mockReturnValueOnce('C:\\Program Files\\nodejs\\node.exe\n')
        .mockReturnValueOnce('C:\\Windows\\System32\\wscript.exe\n');
      vi.spyOn(fs, 'existsSync').mockImplementation(
        (p) =>
          String(p).endsWith('@rely-ai\\caliber\\dist\\bin.js') ||
          String(p).endsWith('@rely-ai/caliber/dist/bin.js') ||
          String(p).endsWith('@rely-ai\\caliber\\dist\\hook-runner.vbs') ||
          String(p).endsWith('@rely-ai/caliber/dist/hook-runner.vbs') ||
          String(p).endsWith('hook-runner.vbs'),
      );

      const got = resolveCaliberHookInvoker();
      expect(got).toMatch(/^wscript /);
      expect(got).toContain('//nologo');
      expect(got).toContain('hook-runner.vbs"');
      expect(got).toContain('"C:/Program Files/nodejs/node.exe"');
      expect(got).toContain('@rely-ai/caliber/dist/bin.js"');
    });
  });

  it('on Windows falls back to node-direct when VBS exists but wscript is unavailable', () => {
    withPlatform('win32', () => {
      mockedExecSync
        .mockReturnValueOnce('C:\\Users\\u\\AppData\\Roaming\\npm\\caliber.cmd\n')
        .mockReturnValueOnce('C:\\Program Files\\nodejs\\node.exe\n')
        .mockImplementationOnce(() => {
          throw new Error('wscript not on PATH');
        });
      vi.spyOn(fs, 'existsSync').mockImplementation(
        (p) =>
          String(p).endsWith('@rely-ai\\caliber\\dist\\bin.js') ||
          String(p).endsWith('@rely-ai/caliber/dist/bin.js') ||
          String(p).endsWith('hook-runner.vbs'),
      );

      const got = resolveCaliberHookInvoker();
      expect(got).not.toMatch(/^wscript /);
      expect(got).toContain('"C:/Program Files/nodejs/node.exe"');
      expect(got).toContain('@rely-ai/caliber/dist/bin.js"');
    });
  });

  it('on Windows falls back to .cmd when `where node` fails', () => {
    withPlatform('win32', () => {
      mockedExecSync
        .mockReturnValueOnce('C:\\Users\\u\\AppData\\Roaming\\npm\\caliber.cmd\n')
        .mockImplementationOnce(() => {
          throw new Error('node not on PATH');
        });
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);

      const got = resolveCaliberHookInvoker();
      expect(got).toBe('C:/Users/u/AppData/Roaming/npm/caliber.cmd');
    });
  });

  it('caches per process — second call does not re-shell out', () => {
    withPlatform('linux', () => {
      mockedExecSync.mockReturnValue('/usr/local/bin/caliber\n');
      const first = resolveCaliberHookInvoker();
      const callsAfterFirst = mockedExecSync.mock.calls.length;
      const second = resolveCaliberHookInvoker();
      expect(second).toBe(first);
      expect(mockedExecSync.mock.calls.length).toBe(callsAfterFirst);
    });
  });
});

describe('isCaliberCommand — node-direct + .cmd shim variants', () => {
  it('matches the node-direct hook invoker output format', () => {
    const cmd =
      '"C:/Program Files/nodejs/node.exe" ' +
      '"C:/Users/u/AppData/Roaming/npm/node_modules/@rely-ai/caliber/dist/bin.js" ' +
      'learn observe';
    expect(isCaliberCommand(cmd, 'learn observe')).toBe(true);
  });

  it('matches an absolute caliber.cmd shim invocation', () => {
    const cmd = '"C:\\Users\\u\\AppData\\Roaming\\npm\\caliber.cmd" learn observe';
    expect(isCaliberCommand(cmd, 'learn observe')).toBe(true);
  });

  it('does not match unrelated bin.js paths', () => {
    const cmd =
      '"C:/Program Files/nodejs/node.exe" ' +
      '"C:/some/other/package/dist/bin.js" ' +
      'learn observe';
    expect(isCaliberCommand(cmd, 'learn observe')).toBe(false);
  });
});

describe('toHookPath', () => {
  it('is a no-op on POSIX', () => {
    withPlatform('linux', () => {
      expect(toHookPath('/usr/local/bin/caliber')).toBe('/usr/local/bin/caliber');
    });
  });

  it('converts a Windows .exe path to forward slashes', () => {
    withPlatform('win32', () => {
      expect(toHookPath('C:\\Users\\dev\\.bun\\bin\\caliber.exe')).toBe(
        'C:/Users/dev/.bun/bin/caliber.exe',
      );
    });
  });

  it('quotes a Windows path containing spaces', () => {
    withPlatform('win32', () => {
      expect(toHookPath('C:\\Users\\Jane Doe\\.bun\\bin\\caliber.exe')).toBe(
        '"C:/Users/Jane Doe/.bun/bin/caliber.exe"',
      );
    });
  });

  it('keeps the npx suffix outside the quotes', () => {
    withPlatform('win32', () => {
      expect(toHookPath('C:\\Program Files\\nodejs\\npx.cmd --yes @rely-ai/caliber')).toBe(
        '"C:/Program Files/nodejs/npx.cmd" --yes @rely-ai/caliber',
      );
    });
  });

  it('leaves bare names untouched', () => {
    withPlatform('win32', () => {
      expect(toHookPath('caliber')).toBe('caliber');
      expect(toHookPath('npx --yes @rely-ai/caliber')).toBe('npx --yes @rely-ai/caliber');
    });
  });
});

describe('resolveCaliberHookInvoker with a bun .exe on Windows', () => {
  beforeEach(() => {
    resetResolvedCaliber();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emits forward slashes so Git Bash does not strip backslashes', () => {
    withPlatform('win32', () => {
      process.argv[1] = 'C:/work/script.js';
      delete process.env.npm_execpath;
      mockedExecSync.mockReturnValue(
        'C:\\Users\\dev\\.bun\\bin\\caliber.exe' + String.fromCharCode(10),
      );
      expect(resolveCaliberHookInvoker()).toBe('C:/Users/dev/.bun/bin/caliber.exe');
    });
  });
});

describe('isCaliberCommand with a caliber.exe path', () => {
  it('matches unquoted and quoted forward-slash .exe commands', () => {
    expect(
      isCaliberCommand('C:/Users/dev/.bun/bin/caliber.exe learn observe', 'learn observe'),
    ).toBe(true);
    expect(
      isCaliberCommand('"C:/Users/dev/.bun/bin/caliber.exe" learn observe', 'learn observe'),
    ).toBe(true);
  });
});
