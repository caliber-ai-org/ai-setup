import fs from 'fs';
import path from 'path';
import { PERSONAL_LEARNINGS_FILE } from '../constants.js';

type SkillEntry = { name: string; filename: string; content: string };

export const CALIBER_MANAGED_PREFIX = 'caliber-';

const INCLUDABLE_DOC_PATTERNS = [
  'ARCHITECTURE.md',
  'CONTRIBUTING.md',
  'DEVELOPMENT.md',
  'SETUP.md',
  'docs/ARCHITECTURE.md',
  'docs/CONTRIBUTING.md',
  'docs/DEVELOPMENT.md',
  'docs/API.md',
  'docs/GUIDE.md',
  'docs/SETUP.md',
];

function readSkillsFromDir(skillsDir: string): SkillEntry[] | undefined {
  if (!fs.existsSync(skillsDir)) return undefined;
  try {
    const skills = fs
      .readdirSync(skillsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .reduce<SkillEntry[]>((acc, entry) => {
        const skillPath = path.join(skillsDir, entry.name, 'SKILL.md');
        try {
          acc.push({
            name: entry.name,
            filename: 'SKILL.md',
            content: fs.readFileSync(skillPath, 'utf-8'),
          });
        } catch {
          // SKILL.md doesn't exist in this directory — skip
        }
        return acc;
      }, []);
    return skills.length > 0 ? skills : undefined;
  } catch {
    return undefined;
  }
}

export function readExistingConfigs(dir: string) {
  const configs: {
    claudeMd?: string;
    readmeMd?: string;
    agentsMd?: string;
    claudeSettings?: Record<string, unknown>;
    claudeSkills?: Array<{ filename: string; content: string }>;
    claudeRules?: Array<{ filename: string; content: string }>;
    cursorrules?: string;
    cursorRules?: Array<{ filename: string; content: string }>;
    cursorSkills?: Array<{ name: string; filename: string; content: string }>;
    copilotInstructions?: string;
    copilotInstructionFiles?: Array<{ filename: string; content: string }>;
    codexSkills?: Array<{ name: string; filename: string; content: string }>;
    opencodeSkills?: Array<{ name: string; filename: string; content: string }>;
    claudeMcpServers?: Record<string, unknown>;
    cursorMcpServers?: Record<string, unknown>;
    personalLearnings?: string;
    includableDocs?: string[];
  } = {};

  // README.md
  const readmeMdPath = path.join(dir, 'README.md');
  if (fs.existsSync(readmeMdPath)) {
    configs.readmeMd = fs.readFileSync(readmeMdPath, 'utf-8');
  }

  // AGENTS.md (primary config for Codex)
  const agentsMdPath = path.join(dir, 'AGENTS.md');
  if (fs.existsSync(agentsMdPath)) {
    configs.agentsMd = fs.readFileSync(agentsMdPath, 'utf-8');
  }

  // CLAUDE.md
  const claudeMdPath = path.join(dir, 'CLAUDE.md');
  if (fs.existsSync(claudeMdPath)) {
    configs.claudeMd = fs.readFileSync(claudeMdPath, 'utf-8');
  }

  // .claude/settings.json
  const claudeSettingsPath = path.join(dir, '.claude', 'settings.json');
  if (fs.existsSync(claudeSettingsPath)) {
    try {
      configs.claudeSettings = JSON.parse(fs.readFileSync(claudeSettingsPath, 'utf-8'));
    } catch {
      // ignore
    }
  }

  // .claude/skills/{name}/SKILL.md (OpenSkills) and legacy .claude/skills/*.md
  const skillsDir = path.join(dir, '.claude', 'skills');
  if (fs.existsSync(skillsDir)) {
    try {
      const entries = fs.readdirSync(skillsDir);
      const skills: Array<{ filename: string; content: string }> = [];
      for (const entry of entries) {
        const entryPath = path.join(skillsDir, entry);
        const skillMdPath = path.join(entryPath, 'SKILL.md');
        if (fs.statSync(entryPath).isDirectory() && fs.existsSync(skillMdPath)) {
          skills.push({
            filename: `${entry}/SKILL.md`,
            content: fs.readFileSync(skillMdPath, 'utf-8'),
          });
        } else if (entry.endsWith('.md')) {
          skills.push({ filename: entry, content: fs.readFileSync(entryPath, 'utf-8') });
        }
      }
      if (skills.length > 0) configs.claudeSkills = skills;
    } catch {
      // ignore
    }
  }

  // .claude/rules/*.md
  const claudeRulesDir = path.join(dir, '.claude', 'rules');
  if (fs.existsSync(claudeRulesDir)) {
    try {
      const files = fs.readdirSync(claudeRulesDir).filter((f) => f.endsWith('.md'));
      const rules = files.map((f) => ({
        filename: f,
        content: fs.readFileSync(path.join(claudeRulesDir, f), 'utf-8'),
      }));
      if (rules.length > 0) configs.claudeRules = rules;
    } catch {
      // ignore
    }
  }

  // .cursorrules
  const cursorrulesPath = path.join(dir, '.cursorrules');
  if (fs.existsSync(cursorrulesPath)) {
    configs.cursorrules = fs.readFileSync(cursorrulesPath, 'utf-8');
  }

  // .cursor/rules/*.mdc
  const cursorRulesDir = path.join(dir, '.cursor', 'rules');
  if (fs.existsSync(cursorRulesDir)) {
    try {
      const files = fs.readdirSync(cursorRulesDir).filter((f) => f.endsWith('.mdc'));
      configs.cursorRules = files.map((f) => ({
        filename: f,
        content: fs.readFileSync(path.join(cursorRulesDir, f), 'utf-8'),
      }));
    } catch {
      // ignore
    }
  }

  configs.cursorSkills = readSkillsFromDir(path.join(dir, '.cursor', 'skills'));

  // .github/copilot-instructions.md
  const copilotPath = path.join(dir, '.github', 'copilot-instructions.md');
  if (fs.existsSync(copilotPath)) {
    configs.copilotInstructions = fs.readFileSync(copilotPath, 'utf-8');
  }

  // .github/instructions/*.instructions.md
  const copilotInstructionsDir = path.join(dir, '.github', 'instructions');
  if (fs.existsSync(copilotInstructionsDir)) {
    try {
      const files = fs
        .readdirSync(copilotInstructionsDir)
        .filter((f) => f.endsWith('.instructions.md'));
      if (files.length > 0) {
        configs.copilotInstructionFiles = files.map((f) => ({
          filename: f,
          content: fs.readFileSync(path.join(copilotInstructionsDir, f), 'utf-8'),
        }));
      }
    } catch {
      // ignore
    }
  }

  configs.codexSkills = readSkillsFromDir(path.join(dir, '.agents', 'skills'));
  configs.opencodeSkills = readSkillsFromDir(path.join(dir, '.opencode', 'skills'));

  // .mcp.json (Claude MCP servers)
  const mcpJsonPath = path.join(dir, '.mcp.json');
  if (fs.existsSync(mcpJsonPath)) {
    try {
      const mcpJson = JSON.parse(fs.readFileSync(mcpJsonPath, 'utf-8'));
      if (mcpJson.mcpServers) {
        configs.claudeMcpServers = mcpJson.mcpServers;
      }
    } catch {
      // ignore
    }
  }

  // .cursor/mcp.json (Cursor MCP servers)
  const cursorMcpPath = path.join(dir, '.cursor', 'mcp.json');
  if (fs.existsSync(cursorMcpPath)) {
    try {
      const cursorMcpJson = JSON.parse(fs.readFileSync(cursorMcpPath, 'utf-8'));
      if (cursorMcpJson.mcpServers) {
        configs.cursorMcpServers = cursorMcpJson.mcpServers;
      }
    } catch {
      // ignore
    }
  }

  // Personal learnings (~/.caliber/personal-learnings.md)
  if (fs.existsSync(PERSONAL_LEARNINGS_FILE)) {
    try {
      const content = fs.readFileSync(PERSONAL_LEARNINGS_FILE, 'utf-8');
      const bullets = content
        .split('\n')
        .filter((l) => l.startsWith('- '))
        .join('\n');
      if (bullets) configs.personalLearnings = bullets;
    } catch {
      // ignore — personal learnings are optional
    }
  }

  const found = INCLUDABLE_DOC_PATTERNS.filter((p) => fs.existsSync(path.join(dir, p)));
  if (found.length > 0) configs.includableDocs = found;

  return configs;
}
