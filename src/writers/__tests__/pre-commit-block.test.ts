import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execSync } from 'child_process';

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

const mockedExecSync = vi.mocked(execSync);

describe('pre-commit-block', () => {
  let originalArgv: string[];
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    originalArgv = [...process.argv];
    originalEnv = { ...process.env };
    const { resetResolvedCaliber } = await import('../../lib/resolve-caliber.js');
    resetResolvedCaliber();
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.env = originalEnv;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  describe('appendPreCommitBlock', () => {
    it('uses npx command in doc block when in npx context', async () => {
      process.argv[1] = '/home/user/.npm/_npx/abc/node_modules/.bin/caliber';

      const { appendPreCommitBlock } = await import('../pre-commit-block.js');
      const result = appendPreCommitBlock('# My Project');

      expect(result).toContain('npx --yes @rely-ai/caliber refresh');
      expect(result).not.toMatch(/Run `caliber refresh`/);
      expect(result).toContain('Run `npx --yes @rely-ai/caliber refresh`');
    });

    it('uses bare caliber in doc block when globally installed', async () => {
      process.argv[1] = '/usr/local/bin/caliber';
      delete process.env.npm_execpath;
      mockedExecSync.mockReturnValue('/usr/local/bin/caliber\n');

      const { appendPreCommitBlock } = await import('../pre-commit-block.js');
      const result = appendPreCommitBlock('# My Project');

      expect(result).toContain('Run `caliber refresh`');
      expect(result).toContain('caliber refresh && git add');
    });

    it('does not duplicate the block', async () => {
      process.argv[1] = '/home/user/.npm/_npx/abc/node_modules/.bin/caliber';

      const { appendPreCommitBlock } = await import('../pre-commit-block.js');
      const first = appendPreCommitBlock('# My Project');
      const second = appendPreCommitBlock(first);
      expect(second).toBe(first);
    });
  });

  describe('getCursorPreCommitRule', () => {
    it('uses npx command in Cursor rule when in npx context', async () => {
      process.argv[1] = '/home/user/.npm/_npx/abc/node_modules/.bin/caliber';

      const { getCursorPreCommitRule } = await import('../pre-commit-block.js');
      const rule = getCursorPreCommitRule();

      expect(rule.content).toContain('npx --yes @rely-ai/caliber refresh');
    });

    it('uses bare caliber in Cursor rule when globally installed', async () => {
      process.argv[1] = '/usr/local/bin/caliber';
      delete process.env.npm_execpath;
      mockedExecSync.mockReturnValue('/usr/local/bin/caliber\n');

      const { getCursorPreCommitRule } = await import('../pre-commit-block.js');
      const rule = getCursorPreCommitRule();

      expect(rule.content).toContain('`caliber refresh`');
      expect(rule.content).not.toContain('npx');
    });
  });
});
