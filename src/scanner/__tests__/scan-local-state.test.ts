// scanLocalState: CLAUDE.md, .claude/skills, .mcp.json, AGENTS.md, .agents/skills,
// .cursorrules, .cursor/rules, .cursor/mcp.json. Cursor skills dir: see cursor-skills-scan.test.ts.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

vi.mock('fs');

import { scanLocalState } from '../index.js';

describe('scanLocalState', () => {
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

  describe('Claude .claude/skills/*.md', () => {
    it('lists flat .md skill files in .claude/skills', () => {
      const dir = '/project';
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const s = String(p);
        return s === path.join(dir, '.claude', 'skills') || s === path.join(dir, '.claude', 'skills', 'deploy.md');
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(fs.readdirSync).mockImplementation(((p: unknown) => {
        if (String(p) === path.join(dir, '.claude', 'skills')) return ['deploy.md'];
        return [];
      }) as any);
      vi.mocked(fs.readFileSync).mockReturnValue('---\nname: deploy\n---\n' as any);

      const items = scanLocalState(dir);
      const skills = items.filter((i) => i.type === 'skill' && i.platform === 'claude');

      expect(skills).toHaveLength(1);
      expect(skills[0].name).toBe('deploy.md');
      expect(skills[0].path).toBe(path.join(dir, '.claude', 'skills', 'deploy.md'));
    });
  });

  describe('Codex AGENTS.md', () => {
    it('detects AGENTS.md when present', () => {
      const dir = '/project';
      vi.mocked(fs.existsSync).mockImplementation(
        (p) => String(p) === path.join(dir, 'AGENTS.md')
      );
      vi.mocked(fs.readFileSync).mockReturnValue('# AGENTS.md\nProject context' as any);

      const items = scanLocalState(dir);
      const agents = items.filter((i) => i.name === 'AGENTS.md' && i.platform === 'codex');

      expect(agents).toHaveLength(1);
      expect(agents[0].type).toBe('rule');
      expect(agents[0].path).toBe(path.join(dir, 'AGENTS.md'));
    });
  });

  describe('Codex .agents/skills/*/SKILL.md', () => {
    it('lists SKILL.md under skill directories', () => {
      const dir = '/project';
      const skillsRoot = path.join(dir, '.agents', 'skills');
      const skillDir = path.join(skillsRoot, 'api');
      const skillFile = path.join(skillDir, 'SKILL.md');
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const s = String(p);
        return s === skillsRoot || s === skillFile;
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(fs.readdirSync).mockImplementation(((p: unknown) => {
        if (String(p) === skillsRoot) return ['api'];
        return [];
      }) as any);
      vi.mocked(fs.readFileSync).mockReturnValue('---\nname: api\n---\n' as any);

      const items = scanLocalState(dir);
      const skills = items.filter((i) => i.type === 'skill' && i.platform === 'codex');

      expect(skills).toHaveLength(1);
      expect(skills[0].name).toBe('api/SKILL.md');
      expect(skills[0].path).toBe(skillFile);
    });
  });

  describe('Cursor .cursorrules', () => {
    it('detects .cursorrules when present', () => {
      const dir = '/project';
      const rulesPath = path.join(dir, '.cursorrules');
      vi.mocked(fs.existsSync).mockImplementation((p) => String(p) === rulesPath);
      vi.mocked(fs.readFileSync).mockReturnValue('Be concise.' as any);

      const items = scanLocalState(dir);
      const rules = items.filter((i) => i.name === '.cursorrules' && i.platform === 'cursor');

      expect(rules).toHaveLength(1);
      expect(rules[0].type).toBe('rule');
      expect(rules[0].path).toBe(rulesPath);
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
      vi.mocked(fs.readFileSync).mockReturnValue('---\ndescription: test\n---\nContent' as any);

      const items = scanLocalState(dir);
      const rules = items.filter((i) => i.type === 'rule' && i.platform === 'cursor');

      expect(rules).toHaveLength(2);
      expect(rules.map((r) => r.name).sort()).toEqual(['lint.mdc', 'testing.mdc']);
    });
  });

  describe('Cursor .cursor/mcp.json', () => {
    it('parses mcpServers from .cursor/mcp.json', () => {
      const dir = '/project';
      const mcpPath = path.join(dir, '.cursor', 'mcp.json');
      vi.mocked(fs.existsSync).mockImplementation((p) => String(p) === mcpPath);
      const body = JSON.stringify({ mcpServers: { db: { command: 'npx', args: ['-y', 'mcp-db'] } } });
      vi.mocked(fs.readFileSync).mockImplementation((p: unknown) => {
        if (String(p) === mcpPath) return body;
        return '{}';
      });

      const items = scanLocalState(dir);
      const mcp = items.filter((i) => i.type === 'mcp' && i.platform === 'cursor');

      expect(mcp).toHaveLength(1);
      expect(mcp[0].name).toBe('db');
      expect(mcp[0].path).toBe(mcpPath);
    });
  });

  describe('Edge cases', () => {
    it('returns empty results when directories do not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const items = scanLocalState('/empty-project');
      expect(items).toHaveLength(0);
    });

    it('handles empty .mcp.json with no mcpServers', () => {
      const dir = '/project';
      vi.mocked(fs.existsSync).mockImplementation((p) => String(p) === path.join(dir, '.mcp.json'));
      vi.mocked(fs.readFileSync).mockReturnValue('{}' as any);

      const items = scanLocalState(dir);
      const mcpItems = items.filter((i) => i.type === 'mcp');

      expect(mcpItems).toHaveLength(0);
    });

    it('handles CLAUDE.md only', () => {
      const dir = '/project';
      vi.mocked(fs.existsSync).mockImplementation(
        (p) => String(p) === path.join(dir, 'CLAUDE.md')
      );
      vi.mocked(fs.readFileSync).mockReturnValue('# CLAUDE' as any);

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
