import fs from 'fs';
import path from 'path';
import { CALIBER_DIR } from '../constants.js';
import { assertPathWithinDir } from '../lib/sanitize.js';

const STAGED_DIR = path.join(CALIBER_DIR, 'staged');
const PROPOSED_DIR = path.join(STAGED_DIR, 'proposed');
const CURRENT_DIR = path.join(STAGED_DIR, 'current');

export interface StagedFile {
  relativePath: string;
  proposedPath: string;
  currentPath?: string;
  originalPath?: string;
  isNew: boolean;
}

export interface StageResult {
  newFiles: number;
  modifiedFiles: number;
  stagedFiles: StagedFile[];
}

function normalizeContent(content: string): string {
  return content
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function stageFiles(
  files: Array<{ path: string; content: string }>,
  projectDir: string,
): StageResult {
  cleanupStaging();

  let newFiles = 0;
  let modifiedFiles = 0;
  const stagedFiles: StagedFile[] = [];

  for (const file of files) {
    assertPathWithinDir(file.path, projectDir);
    const originalPath = path.join(projectDir, file.path);

    // Skip files where the only changes are whitespace/formatting
    if (fs.existsSync(originalPath)) {
      const existing = fs.readFileSync(originalPath, 'utf-8');
      if (normalizeContent(existing) === normalizeContent(file.content)) {
        continue;
      }
    }

    const proposedPath = path.join(PROPOSED_DIR, file.path);
    fs.mkdirSync(path.dirname(proposedPath), { recursive: true });
    fs.writeFileSync(proposedPath, file.content);

    if (fs.existsSync(originalPath)) {
      const currentPath = path.join(CURRENT_DIR, file.path);
      fs.mkdirSync(path.dirname(currentPath), { recursive: true });
      fs.copyFileSync(originalPath, currentPath);
      modifiedFiles++;
      stagedFiles.push({
        relativePath: file.path,
        proposedPath,
        currentPath,
        originalPath,
        isNew: false,
      });
    } else {
      newFiles++;
      stagedFiles.push({ relativePath: file.path, proposedPath, isNew: true });
    }
  }

  return { newFiles, modifiedFiles, stagedFiles };
}

export function getStagedProposedDir(): string {
  return PROPOSED_DIR;
}

export function cleanupStaging(): void {
  if (fs.existsSync(STAGED_DIR)) {
    fs.rmSync(STAGED_DIR, { recursive: true, force: true });
  }
}
