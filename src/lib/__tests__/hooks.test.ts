import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

const mockedExecSync = vi.mocked(execSync);

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'hooks-test-'));
}

describe('pre-commit hook generation', () => {
  let originalArgv: string[];
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    originalArgv = [...process.argv];
    originalEnv = { ...process.env };

    const { resetResolvedCaliber } = await import('../resolve-caliber.js');
    resetResolvedCaliber();
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.env = originalEnv;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  describe('npx context', () => {
    beforeEach(() => {
      process.argv[1] = '/home/user/.npm/_npx/abc123/node_modules/.bin/caliber';
    });

    it('uses command -v npx guard and unquoted invocation when npx path is unknown', async () => {
      const { installPreCommitHook } = await import('../hooks.js');

      const tmpDir = makeTmpDir();
      const gitDir = path.join(tmpDir, '.git');
      const hooksDir = path.join(gitDir, 'hooks');
      fs.mkdirSync(hooksDir, { recursive: true });

      mockedExecSync.mockImplementation((cmd: string) => {
        if (typeof cmd === 'string' && (cmd.includes('which') || cmd.includes('where'))) {
          throw new Error('not found');
        }
        return `${gitDir}\n`;
      });

      const origCwd = process.cwd();
      process.chdir(tmpDir);
      try {
        installPreCommitHook();
        const hookContent = fs.readFileSync(path.join(hooksDir, 'pre-commit'), 'utf-8');

        expect(hookContent).toContain('command -v npx >/dev/null 2>&1');
        expect(hookContent).not.toContain('[ -x "npx');
        expect(hookContent).not.toContain('command -v "npx --yes');
        expect(hookContent).not.toContain('"npx --yes @rely-ai/caliber"');
        expect(hookContent).toContain('npx --yes @rely-ai/caliber refresh');
        expect(hookContent).toContain('npx --yes @rely-ai/caliber learn finalize');
      } finally {
        process.chdir(origCwd);
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('uses absolute npx path and -x guard when npx is found on PATH', async () => {
      const { resetResolvedCaliber } = await import('../resolve-caliber.js');
      resetResolvedCaliber();
      const { installPreCommitHook } = await import('../hooks.js');

      const tmpDir = makeTmpDir();
      const gitDir = path.join(tmpDir, '.git');
      const hooksDir = path.join(gitDir, 'hooks');
      fs.mkdirSync(hooksDir, { recursive: true });

      mockedExecSync.mockImplementation((cmd: string) => {
        if (
          typeof cmd === 'string' &&
          (cmd.includes('which caliber') || cmd.includes('where caliber'))
        ) {
          throw new Error('not found');
        }
        if (typeof cmd === 'string' && (cmd.includes('which npx') || cmd.includes('where npx'))) {
          return '/opt/homebrew/bin/npx\n';
        }
        return `${gitDir}\n`;
      });

      const origCwd = process.cwd();
      process.chdir(tmpDir);
      try {
        installPreCommitHook();
        const hookContent = fs.readFileSync(path.join(hooksDir, 'pre-commit'), 'utf-8');

        expect(hookContent).toContain('[ -x "/opt/homebrew/bin/npx" ]');
        expect(hookContent).not.toContain('command -v npx');
        expect(hookContent).toContain('"/opt/homebrew/bin/npx" --yes @rely-ai/caliber refresh');
        expect(hookContent).toContain(
          '"/opt/homebrew/bin/npx" --yes @rely-ai/caliber learn finalize',
        );
      } finally {
        process.chdir(origCwd);
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe('Windows global install context (cmd shim flash bypass)', () => {
    // pandorum 2026-04-28: every commit triggered a brief cmd window flash
    // because the bash hook resolved `caliber` to `caliber.cmd`, which goes
    // through `cmd.exe /d /s /c` and allocates a console. Worse, npm's shim
    // emits `title %COMSPEC%` so the flash *looks* identical to an elevated
    // cmd window. The fix: when on Windows and the resolved binary ends in
    // .cmd, derive the package's bin.js and call node directly instead.

    const WIN_CALIBER_CMD = 'C:\\Users\\dev\\AppData\\Roaming\\npm\\caliber.cmd';
    const WIN_NODE = 'C:\\Program Files\\nodejs\\node.exe';

    async function withWin32<T>(fn: () => T | Promise<T>): Promise<T> {
      const original = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
      try {
        // The await keeps process.platform pinned to 'win32' across the
        // microtask the inner code awaits (e.g. dynamic imports). A sync
        // try/finally would restore the value before the awaited body
        // ever runs — same shape bug as withScope wrappers in test
        // helpers everywhere.
        return await fn();
      } finally {
        Object.defineProperty(process, 'platform', { value: original, configurable: true });
      }
    }

    async function withPosix<T>(fn: () => T | Promise<T>): Promise<T> {
      const original = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
      try {
        return await fn();
      } finally {
        Object.defineProperty(process, 'platform', { value: original, configurable: true });
      }
    }

    beforeEach(() => {
      delete process.env.npm_execpath;
      process.argv[1] = WIN_CALIBER_CMD;
    });

    it('emits direct node invocation when bin.js + node are present', async () => {
      const { resetResolvedCaliber } = await import('../resolve-caliber.js');
      resetResolvedCaliber();

      const tmpDir = makeTmpDir();
      const gitDir = path.join(tmpDir, '.git');
      const hooksDir = path.join(gitDir, 'hooks');
      fs.mkdirSync(hooksDir, { recursive: true });

      // Lay down a real bin.js so the existsSync probe finds it. The
      // node path is mocked via where, so it doesn't need to exist.
      const fakeBinJs = path.join(tmpDir, 'fake-bin.js');
      fs.writeFileSync(fakeBinJs, '');
      const fakeCmd = path.join(tmpDir, 'fake-caliber.cmd');
      fs.writeFileSync(fakeCmd, '');
      const fakeNpmDir = tmpDir;
      const expectedBinJs = path.join(
        fakeNpmDir,
        'node_modules',
        '@rely-ai',
        'caliber',
        'dist',
        'bin.js',
      );
      fs.mkdirSync(path.dirname(expectedBinJs), { recursive: true });
      fs.writeFileSync(expectedBinJs, '');

      mockedExecSync.mockImplementation((cmd: string) => {
        if (typeof cmd === 'string' && cmd.includes('where caliber')) {
          return fakeCmd + '\n';
        }
        if (typeof cmd === 'string' && cmd.includes('where node')) {
          return WIN_NODE + '\n';
        }
        if (typeof cmd === 'string' && cmd.includes('rev-parse')) {
          return `${gitDir}\n`;
        }
        return '';
      });

      const origCwd = process.cwd();
      process.chdir(tmpDir);
      try {
        await withWin32(async () => {
          const { installPreCommitHook } = await import('../hooks.js');
          installPreCommitHook();
        });
        const hookContent = fs.readFileSync(path.join(hooksDir, 'pre-commit'), 'utf-8');

        // The hook must call node directly with forward-slashed paths
        // — not the .cmd shim — so no console window allocates per call.
        expect(hookContent).toContain('"C:/Program Files/nodejs/node.exe"');
        expect(hookContent).toContain('/node_modules/@rely-ai/caliber/dist/bin.js"');
        expect(hookContent).not.toContain('caliber.cmd');
        // Forward slashes on the resolved paths — no Windows-style
        // ``C:\`` or ``\\`` segments leaked from the where output.
        // (\\033 ANSI escapes inside echo are fine and expected.)
        expect(hookContent).not.toMatch(/C:\\/);
        expect(hookContent).not.toMatch(/\\nodejs\\/);
        expect(hookContent).not.toMatch(/\\node_modules\\/);
        // Guard checks node, not caliber.cmd.
        expect(hookContent).toContain('[ -x "C:/Program Files/nodejs/node.exe" ]');
      } finally {
        process.chdir(origCwd);
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('falls back to .cmd shim when bin.js is missing (pnpm / custom layout)', async () => {
      const { resetResolvedCaliber } = await import('../resolve-caliber.js');
      resetResolvedCaliber();

      const tmpDir = makeTmpDir();
      const gitDir = path.join(tmpDir, '.git');
      const hooksDir = path.join(gitDir, 'hooks');
      fs.mkdirSync(hooksDir, { recursive: true });

      // .cmd present but no node_modules tree alongside — simulates pnpm
      // (which symlinks the bin) or a yarn-classic layout.
      const fakeCmd = path.join(tmpDir, 'fake-caliber.cmd');
      fs.writeFileSync(fakeCmd, '');

      mockedExecSync.mockImplementation((cmd: string) => {
        if (typeof cmd === 'string' && cmd.includes('where caliber')) {
          return fakeCmd + '\n';
        }
        if (typeof cmd === 'string' && cmd.includes('where node')) {
          return WIN_NODE + '\n';
        }
        if (typeof cmd === 'string' && cmd.includes('rev-parse')) {
          return `${gitDir}\n`;
        }
        return '';
      });

      const origCwd = process.cwd();
      process.chdir(tmpDir);
      try {
        await withWin32(async () => {
          const { installPreCommitHook } = await import('../hooks.js');
          installPreCommitHook();
        });
        const hookContent = fs.readFileSync(path.join(hooksDir, 'pre-commit'), 'utf-8');

        // Falls back to invoking the .cmd shim — keeps existing behaviour
        // working rather than silently no-opping the hook.
        expect(hookContent).toContain('caliber.cmd');
        expect(hookContent).not.toContain('"C:/Program Files/nodejs/node.exe"');
      } finally {
        process.chdir(origCwd);
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('falls back to .cmd shim when node is not on PATH', async () => {
      const { resetResolvedCaliber } = await import('../resolve-caliber.js');
      resetResolvedCaliber();

      const tmpDir = makeTmpDir();
      const gitDir = path.join(tmpDir, '.git');
      const hooksDir = path.join(gitDir, 'hooks');
      fs.mkdirSync(hooksDir, { recursive: true });

      // Lay down a valid bin.js — only node is missing.
      const fakeCmd = path.join(tmpDir, 'fake-caliber.cmd');
      fs.writeFileSync(fakeCmd, '');
      const expectedBinJs = path.join(
        tmpDir,
        'node_modules',
        '@rely-ai',
        'caliber',
        'dist',
        'bin.js',
      );
      fs.mkdirSync(path.dirname(expectedBinJs), { recursive: true });
      fs.writeFileSync(expectedBinJs, '');

      mockedExecSync.mockImplementation((cmd: string) => {
        if (typeof cmd === 'string' && cmd.includes('where caliber')) {
          return fakeCmd + '\n';
        }
        if (typeof cmd === 'string' && cmd.includes('where node')) {
          throw new Error('not found');
        }
        if (typeof cmd === 'string' && cmd.includes('rev-parse')) {
          return `${gitDir}\n`;
        }
        return '';
      });

      const origCwd = process.cwd();
      process.chdir(tmpDir);
      try {
        await withWin32(async () => {
          const { installPreCommitHook } = await import('../hooks.js');
          installPreCommitHook();
        });
        const hookContent = fs.readFileSync(path.join(hooksDir, 'pre-commit'), 'utf-8');

        expect(hookContent).toContain('caliber.cmd');
        expect(hookContent).not.toContain('node.exe');
      } finally {
        process.chdir(origCwd);
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('does not transform on POSIX even when path looks like .cmd', async () => {
      // Belt-and-braces: a POSIX user with a file literally named foo.cmd
      // on PATH should not trigger the Windows-only transformation.
      const { resetResolvedCaliber } = await import('../resolve-caliber.js');
      resetResolvedCaliber();

      const tmpDir = makeTmpDir();
      const gitDir = path.join(tmpDir, '.git');
      const hooksDir = path.join(gitDir, 'hooks');
      fs.mkdirSync(hooksDir, { recursive: true });

      // Override the WIN_CALIBER_CMD argv[1] set in beforeEach so
      // resolveCaliber's argv-shortcut returns a POSIX-shaped path.
      process.argv[1] = '/usr/local/bin/caliber';

      // Answer both `which caliber` (POSIX) and `where caliber` (Windows)
      // so this test passes regardless of which CLI resolveCaliber shells
      // out to — the matrix runs on Windows runners too.
      mockedExecSync.mockImplementation((cmd: string) => {
        if (
          typeof cmd === 'string' &&
          (cmd.includes('which caliber') || cmd.includes('where caliber'))
        ) {
          return '/usr/local/bin/caliber.cmd\n';
        }
        if (typeof cmd === 'string' && cmd.includes('rev-parse')) {
          return `${gitDir}\n`;
        }
        return '';
      });

      const origCwd = process.cwd();
      process.chdir(tmpDir);
      try {
        // Pin platform to 'linux' so this exercises the POSIX code path
        // regardless of host runner OS — the test's premise is about the
        // code branch, not the OS the test happens to land on.
        await withPosix(async () => {
          const { installPreCommitHook } = await import('../hooks.js');
          installPreCommitHook();
        });
        const hookContent = fs.readFileSync(path.join(hooksDir, 'pre-commit'), 'utf-8');

        // Plain absolute-path invocation, no node redirection.
        expect(hookContent).toContain('"/usr/local/bin/caliber.cmd"');
        expect(hookContent).not.toContain('node_modules/@rely-ai/caliber');
      } finally {
        process.chdir(origCwd);
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe('global install context', () => {
    beforeEach(() => {
      process.argv[1] = '/usr/local/bin/caliber';
      delete process.env.npm_execpath;
      mockedExecSync.mockImplementation((cmd: string) => {
        if (
          typeof cmd === 'string' &&
          (cmd.includes('which caliber') || cmd.includes('where caliber'))
        ) {
          return '/usr/local/bin/caliber\n';
        }
        if (typeof cmd === 'string' && cmd.includes('rev-parse')) {
          return '.git\n';
        }
        return '';
      });
    });

    it('uses quoted binary path with -x check', async () => {
      const { resetResolvedCaliber } = await import('../resolve-caliber.js');
      resetResolvedCaliber();
      const { installPreCommitHook } = await import('../hooks.js');

      const tmpDir = makeTmpDir();
      const gitDir = path.join(tmpDir, '.git');
      const hooksDir = path.join(gitDir, 'hooks');
      fs.mkdirSync(hooksDir, { recursive: true });

      mockedExecSync.mockImplementation((cmd: string) => {
        if (
          typeof cmd === 'string' &&
          (cmd.includes('which caliber') || cmd.includes('where caliber'))
        ) {
          return '/usr/local/bin/caliber\n';
        }
        if (typeof cmd === 'string' && cmd.includes('rev-parse')) {
          return `${gitDir}\n`;
        }
        return '';
      });

      const origCwd = process.cwd();
      process.chdir(tmpDir);
      try {
        installPreCommitHook();
        const hookContent = fs.readFileSync(path.join(hooksDir, 'pre-commit'), 'utf-8');

        expect(hookContent).toContain('[ -x "/usr/local/bin/caliber" ]');
        expect(hookContent).toContain('"/usr/local/bin/caliber" refresh');
      } finally {
        process.chdir(origCwd);
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });
});

describe('script hook paths use forward slashes', () => {
  let originalCwd: string;
  let tmpDir: string;

  beforeEach(async () => {
    const { resetResolvedCaliber } = await import('../resolve-caliber.js');
    resetResolvedCaliber();
    tmpDir = makeTmpDir();
    originalCwd = process.cwd();
    process.chdir(tmpDir);

    mockedExecSync.mockImplementation(() => {
      throw new Error('not found');
    });
    process.argv[1] = '/usr/local/bin/caliber';
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('Stop hook script path contains only forward slashes', async () => {
    const { installStopHook } = await import('../hooks.js');
    installStopHook();

    const settings = JSON.parse(
      fs.readFileSync(path.join(tmpDir, '.claude', 'settings.json'), 'utf-8'),
    );
    const command = settings.hooks.Stop[0].hooks[0].command;
    expect(command).not.toContain('\\');
    expect(command).toBe('.claude/hooks/caliber-check-sync.sh');
  });

  it('SessionStart hook script path contains only forward slashes', async () => {
    const { installSessionStartHook } = await import('../hooks.js');
    installSessionStartHook();

    const settings = JSON.parse(
      fs.readFileSync(path.join(tmpDir, '.claude', 'settings.json'), 'utf-8'),
    );
    const command = settings.hooks.SessionStart[0].hooks[0].command;
    expect(command).not.toContain('\\');
    expect(command).toBe('.claude/hooks/caliber-session-freshness.sh');
  });

  it('Notification hook script path contains only forward slashes', async () => {
    const { installNotificationHook } = await import('../hooks.js');
    installNotificationHook();

    const settings = JSON.parse(
      fs.readFileSync(path.join(tmpDir, '.claude', 'settings.json'), 'utf-8'),
    );
    const command = settings.hooks.Notification[0].hooks[0].command;
    expect(command).not.toContain('\\');
    expect(command).toBe('.claude/hooks/caliber-freshness-notify.sh');
  });
});

describe('pre-commit block on Windows paths', () => {
  let originalCwd: string;
  let tmpDir: string;
  let originalArgv: string[];

  beforeEach(async () => {
    const { resetResolvedCaliber } = await import('../resolve-caliber.js');
    resetResolvedCaliber();
    tmpDir = makeTmpDir();
    fs.mkdirSync(path.join(tmpDir, '.git', 'hooks'), { recursive: true });
    originalCwd = process.cwd();
    originalArgv = [...process.argv];
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('normalizes Windows backslashes in caliber path so bash quote-removal does not eat them', async () => {
    // Simulate Windows resolveCaliber result: absolute path with backslashes.
    // Without bashPath() the embedded path becomes `"C:\Users\foo\caliber.cmd"`
    // and bash quote-removal strips the backslashes, leaving `C:Usersfoocaliber.cmd`
    // — which doesn't exist.
    const winPath = 'C:\\Users\\First Last\\AppData\\Roaming\\npm\\caliber.cmd';
    process.argv[1] = '/path/to/some/caliber'; // not npx
    mockedExecSync.mockImplementation((cmd: string) => {
      if (typeof cmd === 'string' && cmd.includes('rev-parse')) {
        return `${path.join(tmpDir, '.git')}\n`;
      }
      // resolveCaliber `where caliber` lookup
      return `${winPath}\n`;
    });

    const { installPreCommitHook } = await import('../hooks.js');
    installPreCommitHook();

    const hookContent = fs.readFileSync(path.join(tmpDir, '.git', 'hooks', 'pre-commit'), 'utf-8');
    expect(hookContent).not.toContain('\\Users');
    expect(hookContent).not.toContain('\\AppData');
    expect(hookContent).toContain('C:/Users/First Last/AppData/Roaming/npm/caliber.cmd');
  });

  it('normalizes Windows backslashes for npx-resolved invocations too', async () => {
    const winNpx = 'C:\\Program Files\\nodejs\\npx.cmd';
    process.argv[1] = '/some/.npm/_npx/abc/node_modules/.bin/caliber';
    mockedExecSync.mockImplementation((cmd: string) => {
      if (typeof cmd === 'string' && cmd.includes('rev-parse')) {
        return `${path.join(tmpDir, '.git')}\n`;
      }
      return `${winNpx}\n`;
    });

    const { installPreCommitHook } = await import('../hooks.js');
    installPreCommitHook();

    const hookContent = fs.readFileSync(path.join(tmpDir, '.git', 'hooks', 'pre-commit'), 'utf-8');
    expect(hookContent).not.toContain('Program Files\\nodejs');
    expect(hookContent).toContain('C:/Program Files/nodejs/npx.cmd');
  });
});

describe('SessionEnd hook command', () => {
  let originalArgv: string[];
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    originalArgv = [...process.argv];
    originalEnv = { ...process.env };
    const { resetResolvedCaliber } = await import('../resolve-caliber.js');
    resetResolvedCaliber();
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.env = originalEnv;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('uses bare npx command in Claude settings when caliber is not globally installed', async () => {
    process.argv[1] = '/home/user/.npm/_npx/abc/node_modules/.bin/caliber';
    // Neither caliber nor npx on PATH — falls back to bare 'npx --yes @rely-ai/caliber'
    mockedExecSync.mockImplementation(() => {
      throw new Error('not found');
    });

    const { installHook } = await import('../hooks.js');

    const tmpDir = makeTmpDir();
    const origCwd = process.cwd();
    process.chdir(tmpDir);
    try {
      installHook();
      const settingsPath = path.join(tmpDir, '.claude', 'settings.json');
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));

      const sessionEndHook = settings.hooks.SessionEnd[0].hooks[0];
      expect(sessionEndHook.command).toBe('npx --yes @rely-ai/caliber refresh --quiet');
    } finally {
      process.chdir(origCwd);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('pre-commit hook version marker (F-P0-4)', () => {
  let originalArgv: string[];
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    originalArgv = [...process.argv];
    originalEnv = { ...process.env };
    process.argv[1] = '/usr/local/bin/caliber';
    delete process.env.npm_execpath;
    const { resetResolvedCaliber } = await import('../resolve-caliber.js');
    resetResolvedCaliber();
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.env = originalEnv;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  function setupTmpRepo(): { tmpDir: string; hooksDir: string; gitDir: string } {
    const tmpDir = makeTmpDir();
    const gitDir = path.join(tmpDir, '.git');
    const hooksDir = path.join(gitDir, 'hooks');
    fs.mkdirSync(hooksDir, { recursive: true });
    mockedExecSync.mockImplementation((cmd: string) => {
      if (typeof cmd === 'string' && (cmd.includes('which') || cmd.includes('where'))) {
        return '/usr/local/bin/caliber\n';
      }
      return `${gitDir}\n`;
    });
    return { tmpDir, hooksDir, gitDir };
  }

  it('installs current-version hook when none present', async () => {
    const { installPreCommitHook, isPreCommitHookCurrent } = await import('../hooks.js');
    const { tmpDir, hooksDir } = setupTmpRepo();
    const origCwd = process.cwd();
    process.chdir(tmpDir);
    try {
      const result = installPreCommitHook();
      expect(result.installed).toBe(true);
      expect(result.upgraded).toBe(false);
      expect(isPreCommitHookCurrent()).toBe(true);
      const content = fs.readFileSync(path.join(hooksDir, 'pre-commit'), 'utf-8');
      expect(content).toContain('# caliber:pre-commit:v2:start');
    } finally {
      process.chdir(origCwd);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('reports alreadyInstalled when current-version hook present', async () => {
    const { installPreCommitHook } = await import('../hooks.js');
    const { tmpDir } = setupTmpRepo();
    const origCwd = process.cwd();
    process.chdir(tmpDir);
    try {
      installPreCommitHook();
      const result = installPreCommitHook();
      expect(result.alreadyInstalled).toBe(true);
      expect(result.upgraded).toBe(false);
    } finally {
      process.chdir(origCwd);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('detects legacy unversioned hook as installed-but-stale', async () => {
    const { isPreCommitHookInstalled, isPreCommitHookCurrent } = await import('../hooks.js');
    const { tmpDir, hooksDir } = setupTmpRepo();
    const hookPath = path.join(hooksDir, 'pre-commit');
    fs.writeFileSync(
      hookPath,
      '#!/bin/sh\n\n# caliber:pre-commit:start\nold body\n# caliber:pre-commit:end\n',
    );
    fs.chmodSync(hookPath, 0o755);
    const origCwd = process.cwd();
    process.chdir(tmpDir);
    try {
      expect(isPreCommitHookInstalled()).toBe(true);
      expect(isPreCommitHookCurrent()).toBe(false);
    } finally {
      process.chdir(origCwd);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('upgrades a legacy unversioned hook to current version', async () => {
    const { installPreCommitHook } = await import('../hooks.js');
    const { tmpDir, hooksDir } = setupTmpRepo();
    const hookPath = path.join(hooksDir, 'pre-commit');
    fs.writeFileSync(
      hookPath,
      '#!/bin/sh\n\n# caliber:pre-commit:start\nold body that uses old refresh flags\n# caliber:pre-commit:end\n',
    );
    const origCwd = process.cwd();
    process.chdir(tmpDir);
    try {
      const result = installPreCommitHook();
      expect(result.upgraded).toBe(true);
      expect(result.installed).toBe(false);
      expect(result.alreadyInstalled).toBe(false);

      const newContent = fs.readFileSync(hookPath, 'utf-8');
      expect(newContent).toContain('# caliber:pre-commit:v2:start');
      expect(newContent).not.toContain('old body that uses old refresh flags');
    } finally {
      process.chdir(origCwd);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('preserves non-caliber hook content during upgrade', async () => {
    const { installPreCommitHook } = await import('../hooks.js');
    const { tmpDir, hooksDir } = setupTmpRepo();
    const hookPath = path.join(hooksDir, 'pre-commit');
    fs.writeFileSync(
      hookPath,
      '#!/bin/sh\n\n# caliber:pre-commit:start\nold body\n# caliber:pre-commit:end\n\n# someone-else gitleaks\ngitleaks detect --no-banner\n',
    );
    const origCwd = process.cwd();
    process.chdir(tmpDir);
    try {
      installPreCommitHook();
      const newContent = fs.readFileSync(hookPath, 'utf-8');
      expect(newContent).toContain('gitleaks detect --no-banner');
      expect(newContent).toContain('# caliber:pre-commit:v2:start');
    } finally {
      process.chdir(origCwd);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('removePreCommitHook removes legacy unversioned blocks', async () => {
    const { removePreCommitHook } = await import('../hooks.js');
    const { tmpDir, hooksDir } = setupTmpRepo();
    const hookPath = path.join(hooksDir, 'pre-commit');
    fs.writeFileSync(
      hookPath,
      '#!/bin/sh\n\n# caliber:pre-commit:start\nold body\n# caliber:pre-commit:end\n',
    );
    const origCwd = process.cwd();
    process.chdir(tmpDir);
    try {
      const result = removePreCommitHook();
      expect(result.removed).toBe(true);
      expect(fs.existsSync(hookPath)).toBe(false);
    } finally {
      process.chdir(origCwd);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('removePreCommitHook removes versioned blocks', async () => {
    const { installPreCommitHook, removePreCommitHook } = await import('../hooks.js');
    const { tmpDir } = setupTmpRepo();
    const origCwd = process.cwd();
    process.chdir(tmpDir);
    try {
      installPreCommitHook();
      const result = removePreCommitHook();
      expect(result.removed).toBe(true);
    } finally {
      process.chdir(origCwd);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('hook block emits a visible warning when refresh fails (F-P0-5)', async () => {
    const { installPreCommitHook } = await import('../hooks.js');
    const { tmpDir, hooksDir } = setupTmpRepo();
    const origCwd = process.cwd();
    process.chdir(tmpDir);
    try {
      installPreCommitHook();
      const content = fs.readFileSync(path.join(hooksDir, 'pre-commit'), 'utf-8');
      expect(content).toMatch(/refresh skipped/i);
      expect(content).toMatch(/refresh-hook\.log/);
      // Must redirect to stderr so it survives normal stdout suppression in
      // git output. The previous '|| true' silenced everything.
      expect(content).toMatch(/>&2/);
    } finally {
      process.chdir(origCwd);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
