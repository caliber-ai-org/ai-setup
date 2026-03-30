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

export function writeRefreshDocs(docs: RefreshDocs, dir: string = '.'): string[] {
  const written: string[] = [];
  const p = (relPath: string): string => (dir === '.' ? relPath : path.join(dir, relPath));
  const ensureParent = (filePath: string): void => {
    const parent = path.dirname(filePath);
    if (parent !== '.' && !fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true });
  };

  if (docs.agentsMd) {
    const filePath = p('AGENTS.md');
    ensureParent(filePath);
    fs.writeFileSync(filePath, appendManagedBlocks(docs.agentsMd, 'codex'));
    written.push(filePath);
  }

  if (docs.claudeMd) {
    const filePath = p('CLAUDE.md');
    ensureParent(filePath);
    fs.writeFileSync(filePath, appendManagedBlocks(docs.claudeMd));
    written.push(filePath);
  }

  if (docs.readmeMd) {
    const filePath = p('README.md');
    ensureParent(filePath);
    fs.writeFileSync(filePath, docs.readmeMd);
    written.push(filePath);
  }

  if (docs.cursorrules) {
    const filePath = p('.cursorrules');
    ensureParent(filePath);
    fs.writeFileSync(filePath, docs.cursorrules);
    written.push(filePath);
  }

  if (docs.cursorRules) {
    const rulesDir = p(path.join('.cursor', 'rules'));
    if (!fs.existsSync(rulesDir)) fs.mkdirSync(rulesDir, { recursive: true });
    for (const rule of docs.cursorRules) {
      fs.writeFileSync(path.join(rulesDir, rule.filename), rule.content);
      written.push(p(path.join('.cursor', 'rules', rule.filename)));
    }
  }

  if (docs.copilotInstructions) {
    const filePath = p(path.join('.github', 'copilot-instructions.md'));
    ensureParent(filePath);
    fs.writeFileSync(filePath, appendManagedBlocks(docs.copilotInstructions, 'copilot'));
    written.push(filePath);
  }

  if (docs.copilotInstructionFiles) {
    const instructionsDir = p(path.join('.github', 'instructions'));
    if (!fs.existsSync(instructionsDir)) fs.mkdirSync(instructionsDir, { recursive: true });
    for (const file of docs.copilotInstructionFiles) {
      fs.writeFileSync(path.join(instructionsDir, file.filename), file.content);
      written.push(p(path.join('.github', 'instructions', file.filename)));
    }
  }

  return written;
}
