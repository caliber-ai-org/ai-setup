import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

vi.mock('fs');

import { scanLocalState } from '../index.js';

const DIR = '/project';

function mockPaths(existingPaths: string[]) {
  vi.mocked(fs.existsSync).mockImplementation((p) => existingPaths.includes(String(p)));
}

function mockReadFile(content: string) {
  vi.mocked(fs.readFileSync).mockReturnValue(content as any);
}

function mockReadDir(mapping: Record<string, string[]>) {
  vi.mocked(fs.readdirSync).mockImplementation(((p: unknown) => {
    return mapping[String(p)] ?? [];
  }) as any);
}

describe('scanLocalState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.mocked(fs.existsSync).mockReturnValue(false);
  });

  describe('Claude platform', () => {
    it('detects CLAUDE.md with correct type, platform, and name', () => {
      const claudePath = path.join(DIR, 'CLAUDE.md');
      mockPaths([claudePath]);
      mockReadFile('# Project instructions');

      const items = scanLocalState(DIR);

      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({
        type: 'rule',
        platform: 'claude',
        name: 'CLAUDE.md',
        path: claudePath,
      });
      expect(items[0].contentHash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('detects skills in .claude/skills/*.md', () => {
      const skillsDir = path.join(DIR, '.claude', 'skills');
      const skillPath = path.join(skillsDir, 'foo.md');

      mockPaths([skillsDir, skillPath]);
      mockReadDir({ [skillsDir]: ['foo.md', 'readme.txt'] });
      mockReadFile('skill content');

      const items = scanLocalState(DIR);
      const skills = items.filter((i) => i.type === 'skill' && i.platform === 'claude');

      expect(skills).toHaveLength(1);
      expect(skills[0]).toMatchObject({
        type: 'skill',
        platform: 'claude',
        name: 'foo.md',
        path: skillPath,
      });
      expect(skills[0].contentHash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('detects MCP servers from .mcp.json', () => {
      const mcpPath = path.join(DIR, '.mcp.json');
      mockPaths([mcpPath]);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          mcpServers: {
            'my-server': { command: 'node', args: ['server.js'] },
            'other-server': { command: 'python', args: ['app.py'] },
          },
        }) as any,
      );

      const items = scanLocalState(DIR);
      const mcpItems = items.filter((i) => i.type === 'mcp' && i.platform === 'claude');

      expect(mcpItems).toHaveLength(2);
      expect(mcpItems[0]).toMatchObject({
        type: 'mcp',
        platform: 'claude',
        name: 'my-server',
        path: mcpPath,
      });
      expect(mcpItems[1]).toMatchObject({
        type: 'mcp',
        platform: 'claude',
        name: 'other-server',
        path: mcpPath,
      });
      expect(mcpItems[0].contentHash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('Codex platform', () => {
    it('detects AGENTS.md', () => {
      const agentsPath = path.join(DIR, 'AGENTS.md');
      mockPaths([agentsPath]);
      mockReadFile('# Agents config');

      const items = scanLocalState(DIR);
      const codexItems = items.filter((i) => i.platform === 'codex');

      expect(codexItems).toHaveLength(1);
      expect(codexItems[0]).toMatchObject({
        type: 'rule',
        platform: 'codex',
        name: 'AGENTS.md',
        path: agentsPath,
      });
    });

    it('detects skills in .agents/skills/*/SKILL.md', () => {
      const skillsDir = path.join(DIR, '.agents', 'skills');
      const skillFile = path.join(skillsDir, 'test-skill', 'SKILL.md');

      mockPaths([skillsDir, skillFile]);
      mockReadDir({ [skillsDir]: ['test-skill'] });
      mockReadFile('codex skill content');

      const items = scanLocalState(DIR);
      const skills = items.filter((i) => i.type === 'skill' && i.platform === 'codex');

      expect(skills).toHaveLength(1);
      expect(skills[0]).toMatchObject({
        type: 'skill',
        platform: 'codex',
        name: 'test-skill/SKILL.md',
        path: skillFile,
      });
    });
  });

  describe('OpenCode platform', () => {
    it('detects skills in .opencode/skills/*/SKILL.md', () => {
      const skillsDir = path.join(DIR, '.opencode', 'skills');
      const skillFile = path.join(skillsDir, 'oc-skill', 'SKILL.md');

      mockPaths([skillsDir, skillFile]);
      mockReadDir({ [skillsDir]: ['oc-skill'] });
      mockReadFile('opencode skill content');

      const items = scanLocalState(DIR);
      const skills = items.filter((i) => i.type === 'skill' && i.platform === 'opencode');

      expect(skills).toHaveLength(1);
      expect(skills[0]).toMatchObject({
        type: 'skill',
        platform: 'opencode',
        name: 'oc-skill/SKILL.md',
        path: skillFile,
      });
    });
  });

  describe('Cursor platform', () => {
    it('detects .cursorrules', () => {
      const cursorrulesPath = path.join(DIR, '.cursorrules');
      mockPaths([cursorrulesPath]);
      mockReadFile('cursor rules content');

      const items = scanLocalState(DIR);
      const rules = items.filter((i) => i.platform === 'cursor' && i.name === '.cursorrules');

      expect(rules).toHaveLength(1);
      expect(rules[0]).toMatchObject({
        type: 'rule',
        platform: 'cursor',
        name: '.cursorrules',
        path: cursorrulesPath,
      });
    });

    it('detects rules in .cursor/rules/*.mdc', () => {
      const rulesDir = path.join(DIR, '.cursor', 'rules');
      const ruleFile = path.join(rulesDir, 'test.mdc');

      mockPaths([rulesDir]);
      mockReadDir({ [rulesDir]: ['test.mdc', 'notes.txt'] });
      mockReadFile('cursor rule content');

      const items = scanLocalState(DIR);
      const rules = items.filter(
        (i) => i.type === 'rule' && i.platform === 'cursor' && i.name === 'test.mdc',
      );

      expect(rules).toHaveLength(1);
      expect(rules[0]).toMatchObject({
        type: 'rule',
        platform: 'cursor',
        name: 'test.mdc',
        path: ruleFile,
      });
    });

    it('detects skills in .cursor/skills/*/SKILL.md', () => {
      const skillsDir = path.join(DIR, '.cursor', 'skills');
      const skillFile = path.join(skillsDir, 'cursor-skill', 'SKILL.md');

      mockPaths([skillsDir, skillFile]);
      mockReadDir({ [skillsDir]: ['cursor-skill'] });
      mockReadFile('cursor skill content');

      const items = scanLocalState(DIR);
      const skills = items.filter((i) => i.type === 'skill' && i.platform === 'cursor');

      expect(skills).toHaveLength(1);
      expect(skills[0]).toMatchObject({
        type: 'skill',
        platform: 'cursor',
        name: 'cursor-skill/SKILL.md',
        path: skillFile,
      });
    });

    it('detects MCP servers from .cursor/mcp.json', () => {
      const cursorMcpPath = path.join(DIR, '.cursor', 'mcp.json');
      mockPaths([cursorMcpPath]);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          mcpServers: {
            'cursor-mcp': { command: 'npx', args: ['server'] },
          },
        }) as any,
      );

      const items = scanLocalState(DIR);
      const mcpItems = items.filter((i) => i.type === 'mcp' && i.platform === 'cursor');

      expect(mcpItems).toHaveLength(1);
      expect(mcpItems[0]).toMatchObject({
        type: 'mcp',
        platform: 'cursor',
        name: 'cursor-mcp',
        path: cursorMcpPath,
      });
    });
  });

  describe('edge cases', () => {
    it('handles malformed JSON in .mcp.json without throwing', () => {
      const mcpPath = path.join(DIR, '.mcp.json');
      mockPaths([mcpPath]);
      vi.mocked(fs.readFileSync).mockReturnValue('{not valid json!!!' as any);

      const items = scanLocalState(DIR);

      expect(items).toHaveLength(0);
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Warning: .mcp.json scan skipped'),
      );
    });

    it('returns empty array when no config files exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const items = scanLocalState(DIR);

      expect(items).toEqual([]);
    });

    it('returns empty array for a directory with no recognized files', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const items = scanLocalState('/empty-project');

      expect(items).toEqual([]);
    });
  });

  describe('combined: multiple platforms', () => {
    it('discovers items across all platforms in a single scan', () => {
      const claudeMd = path.join(DIR, 'CLAUDE.md');
      const claudeSkillsDir = path.join(DIR, '.claude', 'skills');
      const claudeSkill = path.join(claudeSkillsDir, 'deploy.md');
      const mcpJson = path.join(DIR, '.mcp.json');
      const agentsMd = path.join(DIR, 'AGENTS.md');
      const codexSkillsDir = path.join(DIR, '.agents', 'skills');
      const codexSkill = path.join(codexSkillsDir, 'build', 'SKILL.md');
      const opencodeSkillsDir = path.join(DIR, '.opencode', 'skills');
      const opencodeSkill = path.join(opencodeSkillsDir, 'lint', 'SKILL.md');
      const cursorrules = path.join(DIR, '.cursorrules');
      const cursorRulesDir = path.join(DIR, '.cursor', 'rules');
      const cursorSkillsDir = path.join(DIR, '.cursor', 'skills');
      const cursorSkill = path.join(cursorSkillsDir, 'format', 'SKILL.md');
      const cursorMcp = path.join(DIR, '.cursor', 'mcp.json');

      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const s = String(p);
        return [
          claudeMd,
          claudeSkillsDir,
          claudeSkill,
          mcpJson,
          agentsMd,
          codexSkillsDir,
          codexSkill,
          opencodeSkillsDir,
          opencodeSkill,
          cursorrules,
          cursorRulesDir,
          cursorSkillsDir,
          cursorSkill,
          cursorMcp,
        ].includes(s);
      });

      vi.mocked(fs.readdirSync).mockImplementation(((p: unknown) => {
        const s = String(p);
        if (s === claudeSkillsDir) return ['deploy.md'];
        if (s === codexSkillsDir) return ['build'];
        if (s === opencodeSkillsDir) return ['lint'];
        if (s === cursorRulesDir) return ['style.mdc'];
        if (s === cursorSkillsDir) return ['format'];
        return [];
      }) as any);

      vi.mocked(fs.readFileSync).mockImplementation(((p: unknown) => {
        const s = String(p);
        if (s === mcpJson) {
          return JSON.stringify({ mcpServers: { 'dev-server': { command: 'node' } } });
        }
        if (s === cursorMcp) {
          return JSON.stringify({ mcpServers: { 'cursor-srv': { command: 'python' } } });
        }
        return 'file content';
      }) as any);

      const items = scanLocalState(DIR);

      const byPlatform = (platform: string) => items.filter((i) => i.platform === platform);

      // Claude: CLAUDE.md + 1 skill + 1 MCP server
      expect(byPlatform('claude')).toHaveLength(3);
      // Codex: AGENTS.md + 1 skill
      expect(byPlatform('codex')).toHaveLength(2);
      // OpenCode: 1 skill
      expect(byPlatform('opencode')).toHaveLength(1);
      // Cursor: .cursorrules + 1 rule + 1 skill + 1 MCP server
      expect(byPlatform('cursor')).toHaveLength(4);

      expect(items).toHaveLength(10);

      for (const item of items) {
        expect(item.contentHash).toMatch(/^[a-f0-9]{64}$/);
      }
    });
  });
});
