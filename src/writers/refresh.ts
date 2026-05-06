import fs from 'fs';
import path from 'path';
import { appendManagedBlocks, type TargetAgent } from './pre-commit-block.js';

interface RefreshDocs {
  agentsMd?: string | null;
  claudeMd?: string | null;
  claudeRules?: Array<{ filename: string; content: string }> | null;
  readmeMd?: string | null;
  cursorrules?: string | null;
  cursorRules?: Array<{ filename: string; content: string }> | null;
  copilotInstructions?: string | null;
  copilotInstructionFiles?: Array<{ filename: string; content: string }> | null;
}

function inferActiveTargets(docs: RefreshDocs): TargetAgent[] {
  const targets: TargetAgent[] = [];
  if (docs.claudeMd) targets.push('claude');
  if (docs.cursorrules || docs.cursorRules) targets.push('cursor');
  if (docs.copilotInstructions || docs.copilotInstructionFiles) targets.push('github-copilot');
  if (docs.agentsMd) targets.push('codex');
  return targets;
}

function writeFileGroup(
  groupDir: string,
  files: Array<{ filename: string; content: string }>,
): string[] {
  fs.mkdirSync(groupDir, { recursive: true });
  return files.map((file) => {
    const filePath = path.join(groupDir, file.filename);
    fs.writeFileSync(filePath, file.content);
    return filePath.replace(/\\/g, '/');
  });
}

export function writeRefreshDocs(docs: RefreshDocs, dir: string = '.'): string[] {
  const written: string[] = [];
  const targets = inferActiveTargets(docs);
  const p = (relPath: string): string =>
    (dir === '.' ? relPath : path.join(dir, relPath)).replace(/\\/g, '/');
  const ensureParent = (filePath: string): void => {
    const parent = path.dirname(filePath);
    if (parent !== '.' && !fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true });
  };

  if (docs.agentsMd) {
    const filePath = p('AGENTS.md');
    ensureParent(filePath);
    fs.writeFileSync(filePath, appendManagedBlocks(docs.agentsMd, 'codex', targets));
    written.push(filePath);
  }

  if (docs.claudeMd) {
    const filePath = p('CLAUDE.md');
    ensureParent(filePath);
    fs.writeFileSync(filePath, appendManagedBlocks(docs.claudeMd, 'claude', targets));
    written.push(filePath);
  }

  if (docs.claudeRules) {
    written.push(...writeFileGroup(p(path.join('.claude', 'rules')), docs.claudeRules));
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
    written.push(...writeFileGroup(p(path.join('.cursor', 'rules')), docs.cursorRules));
  }

  if (docs.copilotInstructions) {
    const filePath = p(path.join('.github', 'copilot-instructions.md'));
    ensureParent(filePath);
    fs.writeFileSync(filePath, appendManagedBlocks(docs.copilotInstructions, 'copilot', targets));
    written.push(filePath);
  }

  if (docs.copilotInstructionFiles) {
    written.push(
      ...writeFileGroup(p(path.join('.github', 'instructions')), docs.copilotInstructionFiles),
    );
  }

  return written;
}
