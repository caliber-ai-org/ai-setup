import fs from 'fs';
import path from 'path';
import { appendManagedBlocks } from './pre-commit-block.js';

interface RefreshDocs {
  agentsMd?: string | null;
  claudeMd?: string | null;
  readmeMd?: string | null;
  cursorrules?: string | null;
  cursorRules?: Array<{ filename: string; content: string }> | null;
  copilotInstructions?: string | null;
  copilotInstructionFiles?: Array<{ filename: string; content: string }> | null;
}

export function writeRefreshDocs(docs: RefreshDocs): string[] {
  const written: string[] = [];

  if (docs.agentsMd) {
    fs.writeFileSync('AGENTS.md', appendManagedBlocks(docs.agentsMd, 'codex'));
    written.push('AGENTS.md');
  }

  if (docs.claudeMd) {
    fs.writeFileSync('CLAUDE.md', appendManagedBlocks(docs.claudeMd));
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

  if (docs.copilotInstructions) {
    fs.mkdirSync('.github', { recursive: true });
    fs.writeFileSync(
      path.join('.github', 'copilot-instructions.md'),
      appendManagedBlocks(docs.copilotInstructions, 'copilot'),
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
