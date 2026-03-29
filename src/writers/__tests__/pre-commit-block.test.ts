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
      expect(result).toContain('npx --yes @rely-ai/caliber refresh && git add');
    });

    it('uses bare caliber in doc block when globally installed', async () => {
      process.argv[1] = '/usr/local/bin/caliber';
      delete process.env.npm_execpath;
      mockedExecSync.mockReturnValue('/usr/local/bin/caliber\n');

      const { appendPreCommitBlock } = await import('../pre-commit-block.js');
      const result = appendPreCommitBlock('# My Project');

      expect(result).toContain('caliber refresh');
      expect(result).toContain('caliber refresh && git add');
    });

    it('does not duplicate the block', async () => {
      process.argv[1] = '/home/user/.npm/_npx/abc/node_modules/.bin/caliber';

      const { appendPreCommitBlock } = await import('../pre-commit-block.js');
      const first = appendPreCommitBlock('# My Project');
      const second = appendPreCommitBlock(first);
      expect(second).toBe(first);
    });

    it('uses /setup-caliber fallback for claude platform (default)', async () => {
      process.argv[1] = '/usr/local/bin/caliber';
      delete process.env.npm_execpath;
      mockedExecSync.mockReturnValue('/usr/local/bin/caliber\n');

      const { appendPreCommitBlock } = await import('../pre-commit-block.js');
      const result = appendPreCommitBlock('# My Project');

      expect(result).toContain('Run /setup-caliber to get set up');
    });

    it('uses skill file fallback for codex platform', async () => {
      process.argv[1] = '/usr/local/bin/caliber';
      delete process.env.npm_execpath;
      mockedExecSync.mockReturnValue('/usr/local/bin/caliber\n');

      const { appendPreCommitBlock } = await import('../pre-commit-block.js');
      const result = appendPreCommitBlock('# My Project', 'codex');

      expect(result).toContain('.agents/skills/setup-caliber/SKILL.md');
      expect(result).not.toContain('/setup-caliber to get set up');
    });

    it('uses npx-based fallback for copilot platform', async () => {
      process.argv[1] = '/usr/local/bin/caliber';
      delete process.env.npm_execpath;
      mockedExecSync.mockReturnValue('/usr/local/bin/caliber\n');

      const { appendPreCommitBlock } = await import('../pre-commit-block.js');
      const result = appendPreCommitBlock('# My Project', 'copilot');

      expect(result).toContain('npx @rely-ai/caliber');
      expect(result).toContain('/setup-caliber');
    });
  });

  describe('appendSyncBlock', () => {
    it('uses /setup-caliber for claude platform (default)', async () => {
      process.argv[1] = '/usr/local/bin/caliber';
      delete process.env.npm_execpath;
      mockedExecSync.mockReturnValue('/usr/local/bin/caliber\n');

      const { appendSyncBlock } = await import('../pre-commit-block.js');
      const result = appendSyncBlock('# My Project');

      expect(result).toContain('/setup-caliber');
      expect(result).toContain('configure everything automatically');
    });

    it('uses skill file reference for codex platform', async () => {
      process.argv[1] = '/usr/local/bin/caliber';
      delete process.env.npm_execpath;
      mockedExecSync.mockReturnValue('/usr/local/bin/caliber\n');

      const { appendSyncBlock } = await import('../pre-commit-block.js');
      const result = appendSyncBlock('# My Project', 'codex');

      expect(result).toContain('.agents/skills/setup-caliber/SKILL.md');
    });

    it('uses npx-based instructions for copilot platform', async () => {
      process.argv[1] = '/usr/local/bin/caliber';
      delete process.env.npm_execpath;
      mockedExecSync.mockReturnValue('/usr/local/bin/caliber\n');

      const { appendSyncBlock } = await import('../pre-commit-block.js');
      const result = appendSyncBlock('# My Project', 'copilot');

      expect(result).toContain('npx @rely-ai/caliber hooks --install');
      expect(result).toContain('npx @rely-ai/caliber refresh');
      expect(result).toContain('/setup-caliber');
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

      expect(rule.content).toContain('caliber refresh');
      expect(rule.content).not.toContain('npx');
    });
  });

  describe('getCursorSetupRule', () => {
    it('returns a setup discovery rule', async () => {
      const { getCursorSetupRule } = await import('../pre-commit-block.js');
      const rule = getCursorSetupRule();

      expect(rule.filename).toBe('caliber-setup.mdc');
      expect(rule.content).toContain('alwaysApply: true');
      expect(rule.content).toContain('SYNC_ACTIVE');
      expect(rule.content).toContain('NO_SYNC');
      expect(rule.content).toContain('.cursor/skills/setup-caliber/SKILL.md');
    });
  });
});
