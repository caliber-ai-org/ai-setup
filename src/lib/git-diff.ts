import { execSync } from 'child_process';

const MAX_DIFF_BYTES = 100_000;

const DOC_PATTERNS = [
  'CLAUDE.md',
  'README.md',
  'AGENTS.md',
  '.cursorrules',
  '.cursor/rules/',
  '.cursor/skills/',
  '.claude/skills/',
  '.agents/skills/',
  '.github/copilot-instructions.md',
  '.github/instructions/',
  'CALIBER_LEARNINGS.md',
];

function excludeArgs(): string[] {
  return DOC_PATTERNS.flatMap(p => ['--', `:!${p}`]);
}

function truncateAtLine(text: string, maxBytes: number): string {
  if (text.length <= maxBytes) return text;
  const cut = text.lastIndexOf('\n', maxBytes);
  return cut > 0 ? text.slice(0, cut) : text.slice(0, maxBytes);
}

function safeExec(cmd: string): string {
  try {
    return execSync(cmd, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 10 * 1024 * 1024,
    }).trim();
  } catch {
    return '';
  }
}

export interface DiffResult {
  hasChanges: boolean;
  committedDiff: string;
  stagedDiff: string;
  unstagedDiff: string;
  changedFiles: string[];
  summary: string;
}

export function collectDiff(lastSha: string | null): DiffResult {
  let committedDiff = '';
  let stagedDiff = '';
  let unstagedDiff = '';
  let changedFiles: string[] = [];

  if (lastSha) {
    committedDiff = safeExec(`git diff ${lastSha}..HEAD ${excludeArgs().join(' ')}`);
    const committedFiles = safeExec(`git diff --name-only ${lastSha}..HEAD`);
    if (committedFiles) {
      changedFiles.push(...committedFiles.split('\n').filter(Boolean));
    }
  } else {
    committedDiff = safeExec('git log --oneline -20');
  }

  stagedDiff = safeExec(`git diff --cached ${excludeArgs().join(' ')}`);
  unstagedDiff = safeExec(`git diff ${excludeArgs().join(' ')}`);

  const stagedFiles = safeExec('git diff --cached --name-only');
  if (stagedFiles) {
    changedFiles.push(...stagedFiles.split('\n').filter(Boolean));
  }
  const unstagedFiles = safeExec('git diff --name-only');
  if (unstagedFiles) {
    changedFiles.push(...unstagedFiles.split('\n').filter(Boolean));
  }

  const untrackedFiles = safeExec('git ls-files --others --exclude-standard');
  if (untrackedFiles) {
    changedFiles.push(...untrackedFiles.split('\n').filter(Boolean));
  }

  changedFiles = [...new Set(changedFiles)].filter(
    f => !DOC_PATTERNS.some(p => f === p || f.startsWith(p))
  );

  const totalSize = committedDiff.length + stagedDiff.length + unstagedDiff.length;
  if (totalSize > MAX_DIFF_BYTES) {
    const ratio = MAX_DIFF_BYTES / totalSize;
    committedDiff = truncateAtLine(committedDiff, Math.floor(committedDiff.length * ratio));
    stagedDiff = truncateAtLine(stagedDiff, Math.floor(stagedDiff.length * ratio));
    unstagedDiff = truncateAtLine(unstagedDiff, Math.floor(unstagedDiff.length * ratio));
  }

  const hasChanges = !!(committedDiff || stagedDiff || unstagedDiff || changedFiles.length);

  const parts: string[] = [];
  if (changedFiles.length) parts.push(`${changedFiles.length} files changed`);
  if (committedDiff) parts.push('committed changes');
  if (stagedDiff) parts.push('staged changes');
  if (unstagedDiff) parts.push('unstaged changes');
  const summary = parts.join(', ') || 'no changes';

  return { hasChanges, committedDiff, stagedDiff, unstagedDiff, changedFiles, summary };
}
