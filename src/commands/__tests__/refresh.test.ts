import { describe, it, expect } from 'vitest';
import { collectFilesToWrite } from '../refresh.js';

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
});
