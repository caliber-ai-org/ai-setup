import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

vi.mock('fs');

import { scanLocalState } from '../index.js';

describe('scanLocalState — comprehensive coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.mocked(fs.existsSync).mockReturnValue(false);
  });

  describe('Claude MCP from .mcp.json', () => {
    it('parses .mcp.json and lists MCP servers', () => {
      const dir = '/project';
      vi.mocked(fs.existsSync).mockImplementation((p) => String(p) === path.join(dir, '.mcp.json'));

      const mcpContent = JSON.stringify({
        mcpServers: {
          slack: { command: 'npx', args: ['-y', '@anthropic/mcp-slack'] },
          figma: { url: 'http://localhost:3000' },
        },
      });
      vi.mocked(fs.readFileSync).mockImplementation((p: unknown) => {
        if (String(p).includes('.mcp.json')) return mcpContent;
        return '{}';
      });

      const items = scanLocalState(dir);
      const mcpItems = items.filter((i) => i.type === 'mcp' && i.platform === 'claude');

      expect(mcpItems).toHaveLength(2);
      expect(mcpItems.map((i) => i.name).sort()).toEqual(['figma', 'slack']);
      expect(mcpItems[0].path).toBe(path.join(dir, '.mcp.json'));
      expect(mcpItems[0].contentHash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('Codex AGENTS.md', () => {
    it('detects AGENTS.md when present', () => {
      const dir = '/project';
      vi.mocked(fs.existsSync).mockImplementation(
        (p) => String(p) === path.join(dir, 'AGENTS.md')
      );
      vi.mocked(fs.readFileSync).mockReturnValue('# AGENTS.md\nProject context' as never);

      const items = scanLocalState(dir);
      const agents = items.filter((i) => i.name === 'AGENTS.md' && i.platform === 'codex');

      expect(agents).toHaveLength(1);
      expect(agents[0].type).toBe('rule');
      expect(agents[0].path).toBe(path.join(dir, 'AGENTS.md'));
    });
  });

  describe('Cursor .cursor/rules/*.mdc', () => {
    it('scans .cursor/rules for .mdc files', () => {
      const dir = '/project';
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const s = String(p);
        return (
          s === path.join(dir, '.cursor', 'rules') ||
          s === path.join(dir, '.cursor', 'rules', 'testing.mdc') ||
          s === path.join(dir, '.cursor', 'rules', 'lint.mdc')
        );
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(fs.readdirSync).mockImplementation(((p: unknown) => {
        const s = String(p);
        if (s === path.join(dir, '.cursor', 'rules')) {
          return ['testing.mdc', 'lint.mdc'];
        }
        return [];
      }) as any);
      vi.mocked(fs.readFileSync).mockReturnValue('---\ndescription: test\n---\nContent' as never);

      const items = scanLocalState(dir);
      const rules = items.filter((i) => i.type === 'rule' && i.platform === 'cursor');

      expect(rules).toHaveLength(2);
      expect(rules.map((r) => r.name).sort()).toEqual(['lint.mdc', 'testing.mdc']);
    });
  });

  describe('Edge cases', () => {
    it('returns empty results when directories do not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const items = scanLocalState('/empty-project');
      expect(items).toHaveLength(0);
    });

    it('does not throw when .mcp.json has malformed JSON', () => {
      const dir = '/project';
      vi.mocked(fs.existsSync).mockImplementation((p) => String(p) === path.join(dir, '.mcp.json'));
      vi.mocked(fs.readFileSync).mockReturnValue('{invalid-json' as never);

      const items = scanLocalState(dir);

      expect(items).toHaveLength(0);
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Warning: .mcp.json scan skipped')
      );
    });

    it('handles empty .mcp.json with no mcpServers', () => {
      const dir = '/project';
      vi.mocked(fs.existsSync).mockImplementation((p) => String(p) === path.join(dir, '.mcp.json'));
      vi.mocked(fs.readFileSync).mockReturnValue('{}' as never);

      const items = scanLocalState(dir);
      const mcpItems = items.filter((i) => i.type === 'mcp');

      expect(mcpItems).toHaveLength(0);
    });

    it('handles CLAUDE.md only', () => {
      const dir = '/project';
      vi.mocked(fs.existsSync).mockImplementation(
        (p) => String(p) === path.join(dir, 'CLAUDE.md')
      );
      vi.mocked(fs.readFileSync).mockReturnValue('# CLAUDE' as never);

      const items = scanLocalState(dir);

      expect(items).toHaveLength(1);
      expect(items[0].name).toBe('CLAUDE.md');
      expect(items[0].platform).toBe('claude');
    });
  });

  describe('Content hashing', () => {
    it('produces deterministic content hashes for files', () => {
      const dir = '/project';
      const content = 'same content';
      vi.mocked(fs.existsSync).mockImplementation(
        (p) => String(p) === path.join(dir, 'CLAUDE.md')
      );
      vi.mocked(fs.readFileSync).mockImplementation(() => content);

      const run1 = scanLocalState(dir);
      const run2 = scanLocalState(dir);

      expect(run1[0].contentHash).toBe(run2[0].contentHash);
    });
  });
});
