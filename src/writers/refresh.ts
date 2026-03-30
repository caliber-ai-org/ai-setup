import fs from 'fs';
import path from 'path';
import { appendPreCommitBlock, appendLearningsBlock } from './pre-commit-block.js';

interface RefreshDocs {
  agentsMd?: string | null;
  claudeMd?: string | null;
  readmeMd?: string | null;
  cursorrules?: string | null;
  cursorRules?: Array<{ filename: string; content: string }> | null;
  claudeSkills?: Array<{ filename: string; content: string }> | null;
  cursorSkills?: Array<{ name: string; content: string }> | null;
  copilotInstructions?: string | null;
  copilotInstructionFiles?: Array<{ filename: string; content: string }> | null;
  codexSkills?: Array<{ name: string; content: string }> | null;
  opencodeSkills?: Array<{ name: string; content: string }> | null;
}

function writeSkillFiles(
  skills: Array<{ name: string; content: string }>,
  baseDir: string,
  written: string[],
): void {
  for (const skill of skills) {
    const skillDir = path.join(baseDir, skill.name);
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skill.content);
    written.push(`${baseDir}/${skill.name}/SKILL.md`);
  }
}

export function writeRefreshDocs(docs: RefreshDocs): string[] {
  const written: string[] = [];

  if (docs.agentsMd) {
    fs.writeFileSync('AGENTS.md', appendLearningsBlock(appendPreCommitBlock(docs.agentsMd)));
    written.push('AGENTS.md');
  }

  if (docs.claudeMd) {
    fs.writeFileSync('CLAUDE.md', appendLearningsBlock(appendPreCommitBlock(docs.claudeMd)));
    written.push('CLAUDE.md');
  }

  if (docs.readmeMd) {
    fs.writeFileSync('README.md', docs.readmeMd);
    written.push('README.md');
  }

  if (docs.cursorrules) {
    fs.writeFileSync('.cursorrules', docs.cursorrules);
    written.push('.cursorrules');
  }

  if (docs.cursorRules) {
    const rulesDir = path.join('.cursor', 'rules');
    if (!fs.existsSync(rulesDir)) fs.mkdirSync(rulesDir, { recursive: true });
    for (const rule of docs.cursorRules) {
      fs.writeFileSync(path.join(rulesDir, rule.filename), rule.content);
      written.push(`.cursor/rules/${rule.filename}`);
    }
  }

  if (docs.claudeSkills) {
    const skillsDir = path.join('.claude', 'skills');
    if (!fs.existsSync(skillsDir)) fs.mkdirSync(skillsDir, { recursive: true });
    for (const skill of docs.claudeSkills) {
      fs.writeFileSync(path.join(skillsDir, skill.filename), skill.content);
      written.push(`.claude/skills/${skill.filename}`);
    }
  }

  if (docs.cursorSkills) writeSkillFiles(docs.cursorSkills, '.cursor/skills', written);
  if (docs.codexSkills) writeSkillFiles(docs.codexSkills, '.agents/skills', written);
  if (docs.opencodeSkills) writeSkillFiles(docs.opencodeSkills, '.opencode/skills', written);

  if (docs.copilotInstructions) {
    fs.mkdirSync('.github', { recursive: true });
    fs.writeFileSync(
      path.join('.github', 'copilot-instructions.md'),
      appendLearningsBlock(appendPreCommitBlock(docs.copilotInstructions)),
    );
    written.push('.github/copilot-instructions.md');
  }

  if (docs.copilotInstructionFiles) {
    const instructionsDir = path.join('.github', 'instructions');
    fs.mkdirSync(instructionsDir, { recursive: true });
    for (const file of docs.copilotInstructionFiles) {
      fs.writeFileSync(path.join(instructionsDir, file.filename), file.content);
      written.push(`.github/instructions/${file.filename}`);
    }
  }

  return written;
}
