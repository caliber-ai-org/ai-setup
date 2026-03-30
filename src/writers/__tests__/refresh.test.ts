import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';

vi.mock('fs');

import { writeRefreshDocs } from '../refresh.js';

describe('writeRefreshDocs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(false);
  });

  it('writes CLAUDE.md directly', () => {
    const written = writeRefreshDocs({
      claudeMd: '# Project\n\nUpdated content.\n',
    });

    expect(written).toContain('CLAUDE.md');
    const content = vi.mocked(fs.writeFileSync).mock.calls[0][1] as string;
    expect(content).toContain('# Project\n\nUpdated content.');
    expect(content).toContain('caliber:managed:pre-commit');
  });

  it('writes other doc types normally', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);

    const written = writeRefreshDocs({
      readmeMd: '# README',
      cursorRules: [{ filename: 'test.mdc', content: 'rule content' }],
    });

    expect(written).toContain('README.md');
    const rulePath = written.find((p) => p.includes('test.mdc'));
    expect(rulePath).toBeDefined();
  });

  it('returns empty array when no docs need updating', () => {
    const written = writeRefreshDocs({});
    expect(written).toEqual([]);
  });

  it('writes copilot instructions when provided', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const written = writeRefreshDocs({
      copilotInstructions: '# Updated Copilot Instructions',
    });

    expect(written).toContain('.github/copilot-instructions.md');
    expect(vi.mocked(fs.mkdirSync)).toHaveBeenCalledWith('.github', { recursive: true });
  });

  it('writes copilot instruction files when provided', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const written = writeRefreshDocs({
      copilotInstructionFiles: [
        { filename: 'ts.instructions.md', content: '---\napplyTo: "**/*.ts"\n---\n\nUse strict.' },
      ],
    });

    const instrPath = written.find((p) => p.includes('ts.instructions.md'));
    expect(instrPath).toBeDefined();
    expect(vi.mocked(fs.mkdirSync)).toHaveBeenCalledWith(expect.stringContaining('instructions'), {
      recursive: true,
    });
  });

  it('skips copilot when null', () => {
    const written = writeRefreshDocs({
      copilotInstructions: null,
      copilotInstructionFiles: null,
    });
    expect(written).toEqual([]);
  });

  it('writes AGENTS.md with all managed blocks (codex platform)', () => {
    const written = writeRefreshDocs({
      agentsMd: '# Agents\n\nProject instructions.\n',
    });
    expect(written).toContain('AGENTS.md');
    const content = vi.mocked(fs.writeFileSync).mock.calls[0][1] as string;
    expect(content).toContain('caliber:managed:pre-commit');
    expect(content).toContain('caliber:managed:learnings');
    expect(content).toContain('caliber:managed:sync');
    expect(content).toContain('.agents/skills/setup-caliber/SKILL.md');
  });

  it('writes CLAUDE.md with all managed blocks', () => {
    const written = writeRefreshDocs({
      claudeMd: '# Project\n\nContent.\n',
    });
    expect(written).toContain('CLAUDE.md');
    const content = vi.mocked(fs.writeFileSync).mock.calls[0][1] as string;
    expect(content).toContain('caliber:managed:pre-commit');
    expect(content).toContain('caliber:managed:learnings');
    expect(content).toContain('caliber:managed:sync');
    expect(content).toContain('/setup-caliber');
  });

  it('writes copilot instructions with all managed blocks (copilot platform)', () => {
    const written = writeRefreshDocs({
      copilotInstructions: '# Copilot\n\nInstructions.\n',
    });
    expect(written).toContain('.github/copilot-instructions.md');
    const call = vi
      .mocked(fs.writeFileSync)
      .mock.calls.find((c) => String(c[0]).includes('copilot-instructions'));
    const content = call![1] as string;
    expect(content).toContain('caliber:managed:pre-commit');
    expect(content).toContain('caliber:managed:learnings');
    expect(content).toContain('caliber:managed:sync');
    expect(content).toContain('/setup-caliber');
  });

  describe('dir parameter', () => {
    it('prefixes CLAUDE.md path with dir', () => {
      const written = writeRefreshDocs({ claudeMd: '# Pkg' }, 'packages/frontend');
      expect(written).toContain('packages/frontend/CLAUDE.md');
    });

    it('prefixes AGENTS.md path with dir', () => {
      const written = writeRefreshDocs({ agentsMd: '# Agents' }, 'packages/backend');
      expect(written).toContain('packages/backend/AGENTS.md');
    });

    it('prefixes cursor rules paths with dir', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      const written = writeRefreshDocs(
        { cursorRules: [{ filename: 'test.mdc', content: 'rule' }] },
        'packages/api',
      );
      expect(written).toContain('packages/api/.cursor/rules/test.mdc');
    });

    it('prefixes copilot instructions path with dir', () => {
      const written = writeRefreshDocs({ copilotInstructions: '# Copilot' }, 'packages/frontend');
      expect(written).toContain('packages/frontend/.github/copilot-instructions.md');
    });

    it('uses root paths when dir is "."', () => {
      const written = writeRefreshDocs({ claudeMd: '# Root' }, '.');
      expect(written).toContain('CLAUDE.md');
    });

    it('creates parent directories for subdirectory writes', () => {
      writeRefreshDocs({ claudeMd: '# Pkg' }, 'packages/frontend');
      expect(vi.mocked(fs.mkdirSync)).toHaveBeenCalledWith('packages/frontend', {
        recursive: true,
      });
    });
  });
});
