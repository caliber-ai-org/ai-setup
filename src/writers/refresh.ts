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

  if (docs.cursorSkills) {
    for (const skill of docs.cursorSkills) {
      const skillDir = path.join('.cursor', 'skills', skill.name);
      if (!fs.existsSync(skillDir)) fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skill.content);
      written.push(`.cursor/skills/${skill.name}/SKILL.md`);
    }
  }

  if (docs.codexSkills) {
    for (const skill of docs.codexSkills) {
      const skillDir = path.join('.agents', 'skills', skill.name);
      if (!fs.existsSync(skillDir)) fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skill.content);
      written.push(`.agents/skills/${skill.name}/SKILL.md`);
    }
  }

  if (docs.opencodeSkills) {
    for (const skill of docs.opencodeSkills) {
      const skillDir = path.join('.opencode', 'skills', skill.name);
      if (!fs.existsSync(skillDir)) fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skill.content);
      written.push(`.opencode/skills/${skill.name}/SKILL.md`);
    }
  }

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
