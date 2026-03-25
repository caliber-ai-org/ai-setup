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

    it('uses command -v npx as the guard condition', async () => {
      const { installPreCommitHook } = await import('../hooks.js');

      const tmpDir = makeTmpDir();
      const gitDir = path.join(tmpDir, '.git');
      const hooksDir = path.join(gitDir, 'hooks');
      fs.mkdirSync(hooksDir, { recursive: true });

      mockedExecSync.mockReturnValue(`${gitDir}\n`);

      const origCwd = process.cwd();
      process.chdir(tmpDir);
      try {
        installPreCommitHook();
        const hookContent = fs.readFileSync(path.join(hooksDir, 'pre-commit'), 'utf-8');

        expect(hookContent).toContain('command -v npx >/dev/null 2>&1');
        expect(hookContent).not.toContain('[ -x "npx');
        expect(hookContent).not.toContain('command -v "npx --yes');
      } finally {
        process.chdir(origCwd);
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('invokes npx without quotes so shell word-splits correctly', async () => {
      const { installPreCommitHook } = await import('../hooks.js');

      const tmpDir = makeTmpDir();
      const gitDir = path.join(tmpDir, '.git');
      const hooksDir = path.join(gitDir, 'hooks');
      fs.mkdirSync(hooksDir, { recursive: true });

      mockedExecSync.mockReturnValue(`${gitDir}\n`);

      const origCwd = process.cwd();
      process.chdir(tmpDir);
      try {
        installPreCommitHook();
        const hookContent = fs.readFileSync(path.join(hooksDir, 'pre-commit'), 'utf-8');

        expect(hookContent).not.toContain('"npx --yes @rely-ai/caliber"');
        expect(hookContent).toContain('npx --yes @rely-ai/caliber refresh');
        expect(hookContent).toContain('npx --yes @rely-ai/caliber learn finalize');
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
        if (typeof cmd === 'string' && cmd.includes('which caliber')) {
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
        if (typeof cmd === 'string' && cmd.includes('which caliber')) {
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

        expect(hookContent).toContain('[ -x "caliber" ] || command -v "caliber"');
        expect(hookContent).toContain('"caliber" refresh');
      } finally {
        process.chdir(origCwd);
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
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

  it('uses npx command in Claude settings when in npx context', async () => {
    process.argv[1] = '/home/user/.npm/_npx/abc/node_modules/.bin/caliber';

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
