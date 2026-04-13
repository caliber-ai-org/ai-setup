import fs from 'fs';
import { BUILTIN_SKILLS, buildSkillContent } from '../lib/builtin-skills.js';
import { sanitizePath } from '../lib/sanitize.js';

export { buildSkillContent };

export function collectSetupFiles(
  setup: Record<string, unknown>,
  targetAgent?: ('claude' | 'cursor' | 'codex' | 'opencode' | 'github-copilot')[],
): Array<{ path: string; content: string }> {
  const files: Array<{ path: string; content: string }> = [];
  const claude = setup.claude as Record<string, unknown> | undefined;
  const cursor = setup.cursor as Record<string, unknown> | undefined;
  const codex = setup.codex as Record<string, unknown> | undefined;

  if (claude) {
    if (claude.claudeMd) files.push({ path: 'CLAUDE.md', content: claude.claudeMd as string });
    const skills = claude.skills as
      | Array<{ name: string; description: string; content: string }>
      | undefined;
    if (Array.isArray(skills)) {
      for (const skill of skills) {
        files.push({
          path: `.claude/skills/${sanitizePath(skill.name)}/SKILL.md`,
          content: buildSkillContent(skill),
        });
      }
    }
    for (const builtin of BUILTIN_SKILLS) {
      files.push({
        path: `.claude/skills/${builtin.name}/SKILL.md`,
        content: buildSkillContent(builtin),
      });
    }
  }

  if (codex) {
    if (codex.agentsMd) files.push({ path: 'AGENTS.md', content: codex.agentsMd as string });
    const codexSkills = codex.skills as
      | Array<{ name: string; description: string; content: string }>
      | undefined;
    if (Array.isArray(codexSkills)) {
      for (const skill of codexSkills) {
        files.push({
          path: `.agents/skills/${sanitizePath(skill.name)}/SKILL.md`,
          content: buildSkillContent(skill),
        });
      }
    }
    for (const builtin of BUILTIN_SKILLS) {
      files.push({
        path: `.agents/skills/${builtin.name}/SKILL.md`,
        content: buildSkillContent(builtin),
      });
    }
  }

  if (cursor) {
    if (cursor.cursorrules)
      files.push({ path: '.cursorrules', content: cursor.cursorrules as string });
    const cursorSkills = cursor.skills as
      | Array<{ name: string; description: string; content: string }>
      | undefined;
    if (Array.isArray(cursorSkills)) {
      for (const skill of cursorSkills) {
        files.push({
          path: `.cursor/skills/${sanitizePath(skill.name)}/SKILL.md`,
          content: buildSkillContent(skill),
        });
      }
    }
    for (const builtin of BUILTIN_SKILLS) {
      files.push({
        path: `.cursor/skills/${builtin.name}/SKILL.md`,
        content: buildSkillContent(builtin),
      });
    }
    const rules = cursor.rules as Array<{ filename: string; content: string }> | undefined;
    if (Array.isArray(rules)) {
      for (const rule of rules) {
        files.push({ path: `.cursor/rules/${sanitizePath(rule.filename)}`, content: rule.content });
      }
    }
  }

  const opencode = setup.opencode as Record<string, unknown> | undefined;
  if (opencode) {
    if (opencode.agentsMd && !files.some((f) => f.path === 'AGENTS.md')) {
      files.push({ path: 'AGENTS.md', content: opencode.agentsMd as string });
    }
    const opencodeSkills = opencode.skills as
      | Array<{ name: string; description: string; content: string }>
      | undefined;
    if (Array.isArray(opencodeSkills)) {
      for (const skill of opencodeSkills) {
        files.push({
          path: `.opencode/skills/${sanitizePath(skill.name)}/SKILL.md`,
          content: buildSkillContent(skill),
        });
      }
    }
    for (const builtin of BUILTIN_SKILLS) {
      files.push({
        path: `.opencode/skills/${builtin.name}/SKILL.md`,
        content: buildSkillContent(builtin),
      });
    }
  }

  const copilot = setup.copilot as Record<string, unknown> | undefined;
  if (copilot) {
    if (copilot.instructions)
      files.push({
        path: '.github/copilot-instructions.md',
        content: copilot.instructions as string,
      });
    const instructionFiles = copilot.instructionFiles as
      | Array<{ filename: string; content: string }>
      | undefined;
    if (Array.isArray(instructionFiles)) {
      for (const file of instructionFiles) {
        files.push({
          path: `.github/instructions/${sanitizePath(file.filename)}`,
          content: file.content,
        });
      }
    }
  }

  const codexTargeted = targetAgent ? targetAgent.includes('codex') : false;
  const opencodeTargeted = targetAgent ? targetAgent.includes('opencode') : false;
  if ((codexTargeted || opencodeTargeted) && !fs.existsSync('AGENTS.md') && !(codex && codex.agentsMd) && !(opencode && opencode.agentsMd)) {
    const agentRefs: string[] = [];
    if (claude) agentRefs.push('See `CLAUDE.md` for Claude Code configuration.');
    if (cursor) agentRefs.push('See `.cursor/rules/` for Cursor rules.');
    if (agentRefs.length === 0)
      agentRefs.push('See CLAUDE.md and .cursor/rules/ for agent configurations.');

    const stubContent = `# AGENTS.md\n\nThis project uses AI coding agents configured by [Caliber](https://github.com/caliber-ai-org/ai-setup).\n\n${agentRefs.join(' ')}\n`;
    files.push({ path: 'AGENTS.md', content: stubContent });
  }

  return files;
}
