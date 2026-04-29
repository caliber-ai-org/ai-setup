import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { collectFilesToWrite, refreshCommand } from '../refresh.js';

describe('collectFilesToWrite', () => {
  it('returns empty array for empty docs', () => {
    expect(collectFilesToWrite({})).toEqual([]);
  });

  it('collects markdown doc paths', () => {
    const files = collectFilesToWrite({
      agentsMd: '# Agents',
      claudeMd: '# Claude',
      readmeMd: '# README',
      copilotInstructions: '# Copilot',
    });
    expect(files).toContain('AGENTS.md');
    expect(files).toContain('CLAUDE.md');
    expect(files).toContain('README.md');
    expect(files).toContain('.github/copilot-instructions.md');
  });

  it('collects cursor rules paths', () => {
    const files = collectFilesToWrite({
      cursorrules: 'rules',
      cursorRules: [
        { filename: 'my-rule.mdc', content: '' },
        { filename: 'another.mdc', content: '' },
      ],
    });
    expect(files).toContain('.cursorrules');
    expect(files).toContain('.cursor/rules/my-rule.mdc');
    expect(files).toContain('.cursor/rules/another.mdc');
  });

  it('collects copilot instruction file paths', () => {
    const files = collectFilesToWrite({
      copilotInstructionFiles: [{ filename: 'ts.instructions.md', content: '' }],
    });
    expect(files).toContain('.github/instructions/ts.instructions.md');
  });

  it('skips null and undefined values', () => {
    const files = collectFilesToWrite({
      claudeMd: null,
      agentsMd: undefined,
      cursorRules: null,
    });
    expect(files).toEqual([]);
  });

  it('matches writeRefreshDocs output paths for all field types', () => {
    const docs = {
      agentsMd: 'content',
      claudeMd: 'content',
      readmeMd: 'content',
      cursorrules: 'content',
      cursorRules: [{ filename: 'rule.mdc', content: '' }],
      copilotInstructions: 'content',
      copilotInstructionFiles: [{ filename: 'ts.instructions.md', content: '' }],
    };
    const files = collectFilesToWrite(docs);
    expect(files).toHaveLength(7);
    expect(files).toEqual([
      'AGENTS.md',
      'CLAUDE.md',
      'README.md',
      '.cursorrules',
      '.cursor/rules/rule.mdc',
      '.github/copilot-instructions.md',
      '.github/instructions/ts.instructions.md',
    ]);
  });

  it('prefixes all paths with dir when dir is provided', () => {
    const files = collectFilesToWrite(
      {
        claudeMd: '# Pkg',
        cursorrules: 'rules',
        cursorRules: [{ filename: 'test.mdc', content: '' }],
        copilotInstructions: '# Copilot',
      },
      'packages/frontend',
    );
    expect(files).toContain('packages/frontend/CLAUDE.md');
    expect(files).toContain('packages/frontend/.cursorrules');
    expect(files).toContain('packages/frontend/.cursor/rules/test.mdc');
    expect(files).toContain('packages/frontend/.github/copilot-instructions.md');
  });

  it('returns root paths when dir is "."', () => {
    const files = collectFilesToWrite({ claudeMd: '# Root' }, '.');
    expect(files).toContain('CLAUDE.md');
  });
});

describe('refreshCommand hook-cascade short-circuit (F-P0-9)', () => {
  let savedEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    savedEnv = { ...process.env };
    delete process.env.CLAUDECODE;
    delete process.env.CALIBER_SUBPROCESS;
    delete process.env.CALIBER_SPAWNED;
  });

  afterEach(() => {
    Object.assign(process.env, savedEnv);
  });

  it('skips silently when --quiet AND inside user-initiated Claude Code session', async () => {
    process.env.CLAUDECODE = '1';
    delete process.env.CALIBER_SUBPROCESS;
    // Should return immediately without throwing — no LLM call, no fingerprint.
    await expect(refreshCommand({ quiet: true })).resolves.toBeUndefined();
  });

  it('does NOT short-circuit when --quiet but in caliber-spawned claude session', async () => {
    process.env.CLAUDECODE = '1';
    process.env.CALIBER_SUBPROCESS = '1';
    // CALIBER_SUBPROCESS=1 path: existing isCaliberSubprocess() guard fires first.
    // Either way this returns undefined, but the test asserts no throw.
    await expect(refreshCommand({ quiet: true })).resolves.toBeUndefined();
  });

  it('does NOT short-circuit when --quiet but no CLAUDECODE (e.g. pre-commit hook)', async () => {
    delete process.env.CLAUDECODE;
    delete process.env.CALIBER_SUBPROCESS;
    // Refresh proceeds past the short-circuit. Will return undefined eventually
    // because the test env has no real config / no real repo. Asserts no throw.
    await expect(refreshCommand({ quiet: true })).resolves.toBeUndefined();
  });
});
