import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

vi.mock('fs');

import { scanLocalState } from '../index.js';

const DIR = '/project';

describe('scanLocalState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(false);
  });

  it('returns empty array when no config files exist', () => {
    const items = scanLocalState(DIR);
    expect(items).toHaveLength(0);
  });

  describe('Claude: CLAUDE.md', () => {
    it('detects CLAUDE.md in project root', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => String(p) === path.join(DIR, 'CLAUDE.md'));
      vi.mocked(fs.readFileSync).mockReturnValue('# Project rules' as any);

      const items = scanLocalState(DIR);
      const match = items.find((i) => i.name === 'CLAUDE.md');

      expect(match).toBeDefined();
      expect(match!.type).toBe('rule');
      expect(match!.platform).toBe('claude');
      expect(match!.path).toBe(path.join(DIR, 'CLAUDE.md'));
      expect(match!.contentHash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('Claude: .claude/skills/*.md', () => {
    it('detects multiple skill files', () => {
      const skillsDir = path.join(DIR, '.claude', 'skills');

      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const s = String(p);
        return s === skillsDir;
      });

      vi.mocked(fs.readdirSync).mockImplementation(((p: unknown) => {
        if (String(p) === skillsDir) return ['skill-a.md', 'skill-b.md', 'readme.txt'];
        return [];
      }) as any);

      vi.mocked(fs.readFileSync).mockReturnValue('skill content' as any);

      const items = scanLocalState(DIR);
      const skills = items.filter((i) => i.type === 'skill' && i.platform === 'claude');

      expect(skills).toHaveLength(2);
      expect(skills.map((s) => s.name)).toEqual(['skill-a.md', 'skill-b.md']);
    });

    it('skips non-.md files in skills directory', () => {
      const skillsDir = path.join(DIR, '.claude', 'skills');

      vi.mocked(fs.existsSync).mockImplementation((p) => String(p) === skillsDir);
      vi.mocked(fs.readdirSync).mockImplementation(((p: unknown) => {
        if (String(p) === skillsDir) return ['notes.txt', 'config.json'];
        return [];
      }) as any);

      const items = scanLocalState(DIR);
      const skills = items.filter((i) => i.type === 'skill' && i.platform === 'claude');
      expect(skills).toHaveLength(0);
    });
  });

  describe('Claude: .mcp.json', () => {
    it('detects MCP servers from .mcp.json', () => {
      const mcpPath = path.join(DIR, '.mcp.json');

      vi.mocked(fs.existsSync).mockImplementation((p) => String(p) === mcpPath);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          mcpServers: {
            github: { command: 'gh', args: ['mcp'] },
            postgres: { command: 'pg-mcp' },
          },
        }) as any,
      );

      const items = scanLocalState(DIR);
      const mcps = items.filter((i) => i.type === 'mcp' && i.platform === 'claude');

      expect(mcps).toHaveLength(2);
      expect(mcps.map((m) => m.name).sort()).toEqual(['github', 'postgres']);
      expect(mcps[0].contentHash).toMatch(/^[a-f0-9]{64}$/);
      expect(mcps[0].path).toBe(mcpPath);
    });

    it('handles .mcp.json without mcpServers key', () => {
      const mcpPath = path.join(DIR, '.mcp.json');

      vi.mocked(fs.existsSync).mockImplementation((p) => String(p) === mcpPath);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ version: 1 }) as any);

      const items = scanLocalState(DIR);
      const mcps = items.filter((i) => i.type === 'mcp' && i.platform === 'claude');
      expect(mcps).toHaveLength(0);
    });
  });

  describe('Codex: AGENTS.md', () => {
    it('detects AGENTS.md in project root', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => String(p) === path.join(DIR, 'AGENTS.md'));
      vi.mocked(fs.readFileSync).mockReturnValue('# Agent rules' as any);

      const items = scanLocalState(DIR);
      const match = items.find((i) => i.name === 'AGENTS.md');

      expect(match).toBeDefined();
      expect(match!.type).toBe('rule');
      expect(match!.platform).toBe('codex');
      expect(match!.path).toBe(path.join(DIR, 'AGENTS.md'));
    });
  });

  describe('Codex: .agents/skills/*/SKILL.md', () => {
    it('detects codex skills', () => {
      const skillsDir = path.join(DIR, '.agents', 'skills');
      const skillFile = path.join(skillsDir, 'deploy', 'SKILL.md');

      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const s = String(p);
        return s === skillsDir || s === skillFile;
      });

      vi.mocked(fs.readdirSync).mockImplementation(((p: unknown) => {
        if (String(p) === skillsDir) return ['deploy'];
        return [];
      }) as any);

      vi.mocked(fs.readFileSync).mockReturnValue('deploy skill' as any);

      const items = scanLocalState(DIR);
      const skills = items.filter((i) => i.type === 'skill' && i.platform === 'codex');

      expect(skills).toHaveLength(1);
      expect(skills[0].name).toBe('deploy/SKILL.md');
      expect(skills[0].path).toBe(skillFile);
    });

    it('skips skill dirs without SKILL.md', () => {
      const skillsDir = path.join(DIR, '.agents', 'skills');

      vi.mocked(fs.existsSync).mockImplementation((p) => String(p) === skillsDir);
      vi.mocked(fs.readdirSync).mockImplementation(((p: unknown) => {
        if (String(p) === skillsDir) return ['empty-skill'];
        return [];
      }) as any);

      const items = scanLocalState(DIR);
      const skills = items.filter((i) => i.type === 'skill' && i.platform === 'codex');
      expect(skills).toHaveLength(0);
    });

    it('warns on read error', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const skillsDir = path.join(DIR, '.agents', 'skills');

      vi.mocked(fs.existsSync).mockImplementation((p) => String(p) === skillsDir);
      vi.mocked(fs.readdirSync).mockImplementation(() => {
        throw new Error('EACCES');
      });

      scanLocalState(DIR);

      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Warning: .agents/skills scan skipped'),
      );
    });
  });

  describe('OpenCode: .opencode/skills/*/SKILL.md', () => {
    it('detects opencode skills', () => {
      const skillsDir = path.join(DIR, '.opencode', 'skills');
      const skillFile = path.join(skillsDir, 'lint', 'SKILL.md');

      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const s = String(p);
        return s === skillsDir || s === skillFile;
      });

      vi.mocked(fs.readdirSync).mockImplementation(((p: unknown) => {
        if (String(p) === skillsDir) return ['lint'];
        return [];
      }) as any);

      vi.mocked(fs.readFileSync).mockReturnValue('lint skill' as any);

      const items = scanLocalState(DIR);
      const skills = items.filter((i) => i.type === 'skill' && i.platform === 'opencode');

      expect(skills).toHaveLength(1);
      expect(skills[0].name).toBe('lint/SKILL.md');
    });

    it('warns on read error', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const skillsDir = path.join(DIR, '.opencode', 'skills');

      vi.mocked(fs.existsSync).mockImplementation((p) => String(p) === skillsDir);
      vi.mocked(fs.readdirSync).mockImplementation(() => {
        throw new Error('EPERM');
      });

      scanLocalState(DIR);

      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Warning: .opencode/skills scan skipped'),
      );
    });
  });

  describe('Cursor: .cursorrules', () => {
    it('detects .cursorrules file', () => {
      vi.mocked(fs.existsSync).mockImplementation(
        (p) => String(p) === path.join(DIR, '.cursorrules'),
      );
      vi.mocked(fs.readFileSync).mockReturnValue('cursor rules content' as any);

      const items = scanLocalState(DIR);
      const match = items.find((i) => i.name === '.cursorrules');

      expect(match).toBeDefined();
      expect(match!.type).toBe('rule');
      expect(match!.platform).toBe('cursor');
      expect(match!.path).toBe(path.join(DIR, '.cursorrules'));
    });
  });

  describe('Cursor: .cursor/rules/*.mdc', () => {
    it('detects .mdc rule files', () => {
      const rulesDir = path.join(DIR, '.cursor', 'rules');

      vi.mocked(fs.existsSync).mockImplementation((p) => String(p) === rulesDir);
      vi.mocked(fs.readdirSync).mockImplementation(((p: unknown) => {
        if (String(p) === rulesDir) return ['general.mdc', 'testing.mdc', 'notes.txt'];
        return [];
      }) as any);

      vi.mocked(fs.readFileSync).mockReturnValue('rule content' as any);

      const items = scanLocalState(DIR);
      const rules = items.filter((i) => i.type === 'rule' && i.platform === 'cursor');

      expect(rules).toHaveLength(2);
      expect(rules.map((r) => r.name)).toEqual(['general.mdc', 'testing.mdc']);
    });
  });

  describe('Cursor: .cursor/mcp.json', () => {
    it('detects Cursor MCP servers', () => {
      const mcpPath = path.join(DIR, '.cursor', 'mcp.json');

      vi.mocked(fs.existsSync).mockImplementation((p) => String(p) === mcpPath);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          mcpServers: {
            figma: { command: 'figma-mcp' },
          },
        }) as any,
      );

      const items = scanLocalState(DIR);
      const mcps = items.filter((i) => i.type === 'mcp' && i.platform === 'cursor');

      expect(mcps).toHaveLength(1);
      expect(mcps[0].name).toBe('figma');
      expect(mcps[0].path).toBe(mcpPath);
    });

    it('warns on malformed cursor mcp.json', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const mcpPath = path.join(DIR, '.cursor', 'mcp.json');

      vi.mocked(fs.existsSync).mockImplementation((p) => String(p) === mcpPath);
      vi.mocked(fs.readFileSync).mockReturnValue('not json' as any);

      const items = scanLocalState(DIR);
      const mcps = items.filter((i) => i.type === 'mcp' && i.platform === 'cursor');

      expect(mcps).toHaveLength(0);
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Warning: .cursor/mcp.json scan skipped'),
      );
    });

    it('handles cursor mcp.json without mcpServers key', () => {
      const mcpPath = path.join(DIR, '.cursor', 'mcp.json');

      vi.mocked(fs.existsSync).mockImplementation((p) => String(p) === mcpPath);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ version: 2 }) as any);

      const items = scanLocalState(DIR);
      const mcps = items.filter((i) => i.type === 'mcp' && i.platform === 'cursor');
      expect(mcps).toHaveLength(0);
    });
  });

  describe('multi-platform detection', () => {
    it('detects items across all platforms simultaneously', () => {
      const claudeMd = path.join(DIR, 'CLAUDE.md');
      const agentsMd = path.join(DIR, 'AGENTS.md');
      const cursorrules = path.join(DIR, '.cursorrules');
      const mcpJson = path.join(DIR, '.mcp.json');

      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const s = String(p);
        return [claudeMd, agentsMd, cursorrules, mcpJson].includes(s);
      });

      vi.mocked(fs.readFileSync).mockImplementation(((p: unknown) => {
        if (String(p) === mcpJson) {
          return JSON.stringify({ mcpServers: { srv: { cmd: 'x' } } });
        }
        return 'content';
      }) as any);

      const items = scanLocalState(DIR);

      expect(items.find((i) => i.platform === 'claude' && i.type === 'rule')).toBeDefined();
      expect(items.find((i) => i.platform === 'codex' && i.type === 'rule')).toBeDefined();
      expect(items.find((i) => i.platform === 'cursor' && i.type === 'rule')).toBeDefined();
      expect(items.find((i) => i.platform === 'claude' && i.type === 'mcp')).toBeDefined();
    });
  });

  describe('content hashing', () => {
    it('produces consistent hashes for same content', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => String(p) === path.join(DIR, 'CLAUDE.md'));
      vi.mocked(fs.readFileSync).mockReturnValue('same content' as any);

      const items1 = scanLocalState(DIR);
      const items2 = scanLocalState(DIR);

      expect(items1[0].contentHash).toBe(items2[0].contentHash);
    });

    it('produces different hashes for different content', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const s = String(p);
        return s === path.join(DIR, 'CLAUDE.md') || s === path.join(DIR, 'AGENTS.md');
      });

      vi.mocked(fs.readFileSync).mockImplementation(((p: unknown) => {
        if (String(p) === path.join(DIR, 'CLAUDE.md')) return 'content A';
        return 'content B';
      }) as any);

      const items = scanLocalState(DIR);
      const claude = items.find((i) => i.platform === 'claude');
      const codex = items.find((i) => i.platform === 'codex');

      expect(claude!.contentHash).not.toBe(codex!.contentHash);
    });
  });
});
