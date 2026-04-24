import { execSync } from 'child_process';

const MAX_DIFF_BYTES = 100_000;
// Large projects can have tens of thousands of untracked build artifacts.
// The changed-files list is joined into the prompt; cap it to prevent it from
// dominating the token budget before the LLM even sees the actual diffs.
const MAX_CHANGED_FILES = 500;

const DOC_PATTERNS = [
  'CLAUDE.md',
  'AGENTS.md',
  'README.md',
  '.cursorrules',
  '.cursor/rules/',
  '.cursor/skills/',
  '.claude/skills/',
  '.agents/skills/',
  '.opencode/skills/',
  '.github/copilot-instructions.md',
  '.github/instructions/',
  'CALIBER_LEARNINGS.md',
];

function truncateAtLineEnd(text: string, maxBytes: number): string {
  if (text.length <= maxBytes) return text;
  const lastNewline = text.lastIndexOf('\n', maxBytes);
  return lastNewline === -1 ? text.slice(0, maxBytes) : text.slice(0, lastNewline);
}

function excludeArgs(): string[] {
  return DOC_PATTERNS.flatMap((p) => ['--', `:!${p}`]);
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

  changedFiles = [...new Set(changedFiles)]
    .filter((f) => !DOC_PATTERNS.some((p) => f === p || f.startsWith(p)))
    .slice(0, MAX_CHANGED_FILES);

  const totalSize = committedDiff.length + stagedDiff.length + unstagedDiff.length;
  if (totalSize > MAX_DIFF_BYTES) {
    const ratio = MAX_DIFF_BYTES / totalSize;
    committedDiff = truncateAtLineEnd(committedDiff, Math.floor(committedDiff.length * ratio));
    stagedDiff = truncateAtLineEnd(stagedDiff, Math.floor(stagedDiff.length * ratio));
    unstagedDiff = truncateAtLineEnd(unstagedDiff, Math.floor(unstagedDiff.length * ratio));
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

export function scopeDiffToDir(diff: DiffResult, dir: string, allConfigDirs: string[]): DiffResult {
  if (dir === '.') {
    const otherDirs = allConfigDirs.filter((d) => d !== '.');
    if (otherDirs.length === 0) return diff;

    const changedFiles = diff.changedFiles.filter(
      (f) => !otherDirs.some((d) => f.startsWith(`${d}/`)),
    );
    // hasChanges based on scoped changedFiles only — diff text is unfiltered
    // and may contain hunks for other dirs. The LLM scoping instruction handles that.
    const hasChanges = changedFiles.length > 0;

    return {
      ...diff,
      changedFiles,
      hasChanges,
      summary: hasChanges ? `${changedFiles.length} files changed` : 'no changes',
    };
  }

  const prefix = `${dir}/`;
  const changedFiles = diff.changedFiles
    .filter((f) => f.startsWith(prefix))
    .map((f) => f.slice(prefix.length));

  const hasChanges = changedFiles.length > 0;

  return {
    ...diff,
    changedFiles,
    hasChanges,
    summary: hasChanges ? `${changedFiles.length} files changed` : 'no changes',
  };
}
