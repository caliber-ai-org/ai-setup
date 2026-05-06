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
      mockedExecSync.mockImplementation(() => {
        throw new Error('not found');
      });

      const { appendPreCommitBlock } = await import('../pre-commit-block.js');
      const result = appendPreCommitBlock('# My Project');

      // displayCaliberName uses cleaner 'npx @rely-ai/caliber' (no --yes) for display.
      // The --yes form is preserved for actual subprocess invocation via resolveCaliber().
      expect(result).toContain('npx @rely-ai/caliber refresh');
      expect(result).toContain('npx @rely-ai/caliber refresh && git add');
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
      mockedExecSync.mockImplementation(() => {
        throw new Error('not found');
      });

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
      mockedExecSync.mockImplementation(() => {
        throw new Error('not found');
      });

      const { getCursorPreCommitRule } = await import('../pre-commit-block.js');
      const rule = getCursorPreCommitRule();

      expect(rule.content).toContain('npx @rely-ai/caliber refresh');
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
      expect(rule.content).toContain('SYNCED');
      expect(rule.content).toContain('NOT_SYNCED');
      expect(rule.content).toContain('.cursor/skills/setup-caliber/SKILL.md');
    });
  });

  describe('F-P0-3: no absolute caliber path baked into content', () => {
    beforeEach(async () => {
      // Force a "global install" resolution that returns an absolute path with a personal-looking prefix.
      const { resetResolvedCaliber } = await import('../../lib/resolve-caliber.js');
      resetResolvedCaliber();
      process.argv[1] = '/usr/local/bin/caliber';
      delete process.env.npm_execpath;
      mockedExecSync.mockReturnValue('/Users/someone/.nvm/versions/node/v20/bin/caliber\n');
    });

    it('appendPreCommitBlock injects bare "caliber" not the absolute resolution', async () => {
      const { appendPreCommitBlock } = await import('../pre-commit-block.js');
      const out = appendPreCommitBlock('# test\n', 'claude');
      expect(out).not.toContain('/Users/');
      expect(out).not.toContain('.nvm/');
      expect(out).toMatch(/`caliber refresh`/);
    });

    it('getCursorPreCommitRule injects bare "caliber"', async () => {
      const { getCursorPreCommitRule } = await import('../pre-commit-block.js');
      const rule = getCursorPreCommitRule();
      expect(rule.content).not.toContain('/Users/');
      expect(rule.content).toMatch(/`caliber refresh/);
    });

    it('appendSyncBlock injects bare "caliber"', async () => {
      const { appendSyncBlock } = await import('../pre-commit-block.js');
      const out = appendSyncBlock('# test\n', 'claude');
      expect(out).not.toContain('/Users/');
      expect(out).toMatch(/`caliber refresh`/);
    });

    it('getCursorSyncRule injects bare "caliber"', async () => {
      const { getCursorSyncRule } = await import('../pre-commit-block.js');
      const rule = getCursorSyncRule();
      expect(rule.content).not.toContain('/Users/');
      expect(rule.content).toMatch(/`caliber refresh`/);
    });
  });

  describe('activeTargets path filtering', () => {
    beforeEach(async () => {
      const { resetResolvedCaliber } = await import('../../lib/resolve-caliber.js');
      resetResolvedCaliber();
      process.argv[1] = '/usr/local/bin/caliber';
      delete process.env.npm_execpath;
      mockedExecSync.mockReturnValue('/usr/local/bin/caliber\n');
    });

    it('includes only claude paths when activeTargets is [claude]', async () => {
      const { appendPreCommitBlock } = await import('../pre-commit-block.js');
      const result = appendPreCommitBlock('# Test', 'claude', ['claude']);
      expect(result).toContain('CLAUDE.md');
      expect(result).toContain('.claude/');
      expect(result).not.toContain('.cursor/');
      expect(result).not.toContain('AGENTS.md');
      expect(result).not.toContain('.opencode/');
    });

    it('includes cursor paths when cursor is an active target', async () => {
      const { appendPreCommitBlock } = await import('../pre-commit-block.js');
      const result = appendPreCommitBlock('# Test', 'claude', ['claude', 'cursor']);
      expect(result).toContain('.cursor/');
      expect(result).toContain('.cursorrules');
      expect(result).not.toContain('AGENTS.md');
    });

    it('includes all paths when activeTargets is undefined (backward compat)', async () => {
      const { appendPreCommitBlock } = await import('../pre-commit-block.js');
      const result = appendPreCommitBlock('# Test', 'claude');
      expect(result).toContain('.cursor/');
      expect(result).toContain('AGENTS.md');
      expect(result).toContain('.opencode/');
    });

    it('omits claude paths for copilot-only target', async () => {
      const { appendPreCommitBlock } = await import('../pre-commit-block.js');
      const result = appendPreCommitBlock('# Test', 'copilot', ['github-copilot']);
      expect(result).toContain('.github/copilot-instructions.md');
      expect(result).not.toContain('CLAUDE.md');
      expect(result).not.toContain('.claude/');
    });

    it('getCursorPreCommitRule respects activeTargets', async () => {
      const { getCursorPreCommitRule } = await import('../pre-commit-block.js');
      const rule = getCursorPreCommitRule(['claude', 'cursor']);
      expect(rule.content).toContain('.cursor/');
      expect(rule.content).not.toContain('AGENTS.md');
      expect(rule.content).not.toContain('.opencode/');
    });

    it('empty activeTargets array produces only CALIBER_LEARNINGS.md', async () => {
      const { appendPreCommitBlock } = await import('../pre-commit-block.js');
      const result = appendPreCommitBlock('# Test', 'claude', []);
      expect(result).toContain('CALIBER_LEARNINGS.md');
      expect(result).not.toContain('CLAUDE.md');
      expect(result).not.toContain('.cursor/');
    });
  });

  describe('appendManagedBlocks de-duplication (F-P0-10)', () => {
    beforeEach(async () => {
      const { resetResolvedCaliber } = await import('../../lib/resolve-caliber.js');
      resetResolvedCaliber();
      process.argv[1] = '/usr/local/bin/caliber';
      delete process.env.npm_execpath;
      mockedExecSync.mockReturnValue('/usr/local/bin/caliber\n');
    });

    it('hasPreCommitBlock detects unmarked inlined "Before Committing" with caliber', async () => {
      const { hasPreCommitBlock } = await import('../pre-commit-block.js');
      const inlined = '# proj\n\n## Before Committing\n\nRun `caliber refresh` before commit.\n';
      expect(hasPreCommitBlock(inlined)).toBe(true);
    });

    it('hasPreCommitBlock returns false for unrelated "Before Committing" heading', async () => {
      const { hasPreCommitBlock } = await import('../pre-commit-block.js');
      const unrelated = '# proj\n\n## Before Committing\n\nRun npm test.\n';
      expect(hasPreCommitBlock(unrelated)).toBe(false);
    });

    it('appendPreCommitBlock does NOT duplicate when inlined version exists', async () => {
      const { appendPreCommitBlock } = await import('../pre-commit-block.js');
      const inlined = '# proj\n\n## Before Committing\n\nRun `caliber refresh` before commit.\n';
      const out = appendPreCommitBlock(inlined, 'claude');
      expect(out).toBe(inlined);
      expect((out.match(/## Before Committing/g) || []).length).toBe(1);
    });

    it('hasLearningsBlock detects unmarked inlined "Session Learnings" with CALIBER_LEARNINGS', async () => {
      const { hasLearningsBlock } = await import('../pre-commit-block.js');
      const inlined = '# proj\n\n## Session Learnings\n\nRead CALIBER_LEARNINGS.md for patterns.\n';
      expect(hasLearningsBlock(inlined)).toBe(true);
    });

    it('hasModelBlock detects unmarked inlined "Model Configuration" with CALIBER_MODEL', async () => {
      const { hasModelBlock } = await import('../pre-commit-block.js');
      const inlined = '# proj\n\n## Model Configuration\n\nUse CALIBER_MODEL env var to pin.\n';
      expect(hasModelBlock(inlined)).toBe(true);
    });

    it('hasSyncBlock detects unmarked inlined "Context Sync" with caliber-ai-org link', async () => {
      const { hasSyncBlock } = await import('../pre-commit-block.js');
      const inlined =
        '# proj\n\n## Context Sync\n\nThis project uses [Caliber](https://github.com/caliber-ai-org/ai-setup).\n';
      expect(hasSyncBlock(inlined)).toBe(true);
    });

    it('hasPreCommitBlock returns FALSE when "caliber" is in another section, not under "Before Committing"', async () => {
      // Reviewer nit on PR #203: scope marker check to text between heading and next `## `.
      // Here the user has a "## Before Committing" heading documenting their own
      // pre-commit checks (no caliber), and "caliber" appears in an unrelated
      // "## Tools We Use" section. Caliber-managed dedup must NOT fire.
      const { hasPreCommitBlock } = await import('../pre-commit-block.js');
      const content = `# proj

## Before Committing

Run npm test and lint.

## Tools We Use

We use \`caliber\` for some other purpose, and prettier, eslint, etc.
`;
      expect(hasPreCommitBlock(content)).toBe(false);
    });

    it('hasLearningsBlock returns FALSE when CALIBER_LEARNINGS is mentioned outside the "Session Learnings" section', async () => {
      const { hasLearningsBlock } = await import('../pre-commit-block.js');
      const content = `# proj

## Session Learnings

We track lessons in our own format here.

## Tools

The \`CALIBER_LEARNINGS\` env var configures something else.
`;
      expect(hasLearningsBlock(content)).toBe(false);
    });

    it('hasModelBlock returns FALSE when CALIBER_MODEL is mentioned outside "Model Configuration"', async () => {
      const { hasModelBlock } = await import('../pre-commit-block.js');
      const content = `# proj

## Model Configuration

We use claude-sonnet-4-6.

## Env Vars

\`CALIBER_MODEL\` is documented here for our internal tools.
`;
      expect(hasModelBlock(content)).toBe(false);
    });

    it('hasSyncBlock returns FALSE when caliber-ai-org link is outside "Context Sync"', async () => {
      const { hasSyncBlock } = await import('../pre-commit-block.js');
      const content = `# proj

## Context Sync

We sync via our own internal tooling.

## See Also

[Caliber](https://github.com/caliber-ai-org/ai-setup) is a related project.
`;
      expect(hasSyncBlock(content)).toBe(false);
    });

    it('appendManagedBlocks on already-inlined CLAUDE.md is a no-op', async () => {
      const { appendManagedBlocks } = await import('../pre-commit-block.js');
      const inlined = `# proj

## Before Committing

Run \`caliber refresh\` before commit.

## Session Learnings

Read CALIBER_LEARNINGS.md for patterns.

## Model Configuration

Use CALIBER_MODEL env var to pin.

## Context Sync

This project uses [Caliber](https://github.com/caliber-ai-org/ai-setup).
`;
      const out = appendManagedBlocks(inlined, 'claude');
      expect(out).toBe(inlined);
      expect((out.match(/## Before Committing/g) || []).length).toBe(1);
      expect((out.match(/## Session Learnings/g) || []).length).toBe(1);
      expect((out.match(/## Model Configuration/g) || []).length).toBe(1);
      expect((out.match(/## Context Sync/g) || []).length).toBe(1);
    });
  });
});
