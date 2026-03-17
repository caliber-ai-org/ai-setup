import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

export function readFileOrNull(filePath: string): string | null {
  try {
    return readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

export function readJsonOrNull(filePath: string): Record<string, unknown> | null {
  const content = readFileOrNull(filePath);
  if (!content) return null;
  try {
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return null;
  }
}

const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', '.next', '.nuxt',
  '__pycache__', '.venv', 'venv', 'env', '.env', 'target', 'vendor',
  '.cache', '.parcel-cache', 'coverage', '.nyc_output', '.turbo',
  '.caliber', '.claude', '.cursor', '.agents', '.codex',
]);

const IGNORED_FILES = new Set([
  '.DS_Store', 'Thumbs.db', '.gitignore', '.editorconfig',
  '.prettierrc', '.prettierignore', '.eslintignore',
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb',
]);

export interface ProjectStructure {
  dirs: string[];
  files: string[];
}

/**
 * Scan the project filesystem up to 2 levels deep.
 * Returns directory and file names relative to root.
 */
export function collectProjectStructure(dir: string, maxDepth = 2): ProjectStructure {
  const dirs: string[] = [];
  const files: string[] = [];

  function walk(currentDir: string, depth: number): void {
    if (depth > maxDepth) return;
    try {
      const entries = readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const name = entry.name;
        if (name.startsWith('.') && IGNORED_DIRS.has(name)) continue;
        if (IGNORED_FILES.has(name)) continue;

        const rel = relative(dir, join(currentDir, name));

        if (entry.isDirectory()) {
          if (IGNORED_DIRS.has(name)) continue;
          dirs.push(rel);
          walk(join(currentDir, name), depth + 1);
        } else if (entry.isFile()) {
          files.push(rel);
        }
      }
    } catch { /* dir doesn't exist or not readable */ }
  }

  walk(dir, 0);
  return { dirs, files };
}

/**
 * Collect primary config file content (CLAUDE.md, .cursorrules, AGENTS.md).
 * Does NOT include skills (they use progressive disclosure — loaded on demand, not all at once).
 */
export function collectPrimaryConfigContent(dir: string): string {
  const parts: string[] = [];

  for (const file of ['CLAUDE.md', '.cursorrules', 'AGENTS.md']) {
    const content = readFileOrNull(join(dir, file));
    if (content) parts.push(content);
  }

  // Cursor .mdc rules (always loaded via frontmatter matching)
  try {
    const rulesDir = join(dir, '.cursor', 'rules');
    const mdcFiles = readdirSync(rulesDir).filter(f => f.endsWith('.mdc'));
    for (const f of mdcFiles) {
      const content = readFileOrNull(join(rulesDir, f));
      if (content) parts.push(content);
    }
  } catch { /* dir doesn't exist */ }

  return parts.join('\n');
}

/**
 * Collect all agent config file content including skills.
 * Used for grounding/reference checks (not token budget).
 */
export function collectAllConfigContent(dir: string): string {
  const parts: string[] = [collectPrimaryConfigContent(dir)];

  // Skills
  for (const skillsDir of [join(dir, '.claude', 'skills'), join(dir, '.agents', 'skills')]) {
    try {
      const entries = readdirSync(skillsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const skill = readFileOrNull(join(skillsDir, entry.name, 'SKILL.md'));
          if (skill) parts.push(skill);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          const content = readFileOrNull(join(skillsDir, entry.name));
          if (content) parts.push(content);
        }
      }
    } catch { /* dir doesn't exist */ }
  }

  return parts.join('\n');
}

/**
 * Estimate token count (same heuristic as llm/utils.ts).
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export interface MarkdownStructure {
  headingCount: number;
  h2Count: number;
  h3Count: number;
  codeBlockCount: number;
  codeBlockLines: number;
  listItemCount: number;
  inlineCodeCount: number;
  totalLines: number;
  nonEmptyLines: number;
}

/**
 * Analyze the markdown structure of config content.
 */
export function analyzeMarkdownStructure(content: string): MarkdownStructure {
  const lines = content.split('\n');
  let headingCount = 0;
  let h2Count = 0;
  let h3Count = 0;
  let codeBlockCount = 0;
  let codeBlockLines = 0;
  let listItemCount = 0;
  let inlineCodeCount = 0;
  let inCodeBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      if (!inCodeBlock) codeBlockCount++;
      inCodeBlock = !inCodeBlock;
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines++;
      continue;
    }

    if (trimmed.startsWith('## ') && !trimmed.startsWith('### ')) h2Count++;
    if (trimmed.startsWith('### ')) h3Count++;
    if (trimmed.startsWith('#')) headingCount++;
    if (/^[-*+]\s/.test(trimmed) || /^\d+\.\s/.test(trimmed)) listItemCount++;

    const inlineMatches = trimmed.match(/`[^`]+`/g);
    if (inlineMatches) inlineCodeCount += inlineMatches.length;
  }

  return {
    headingCount,
    h2Count,
    h3Count,
    codeBlockCount,
    codeBlockLines,
    listItemCount,
    inlineCodeCount,
    totalLines: lines.length,
    nonEmptyLines: lines.filter(l => l.trim().length > 0).length,
  };
}

/**
 * Extract all path-like references and backtick-quoted terms from markdown content.
 * Returns unique references that look like they point to files or directories.
 */
export function extractReferences(content: string): string[] {
  const refs = new Set<string>();

  // Backtick-quoted terms that look like paths (contain / or .)
  const backtickPattern = /`([^`]+)`/g;
  let match: RegExpExecArray | null;
  while ((match = backtickPattern.exec(content)) !== null) {
    const term = match[1].trim();
    // Must look like a path (contains / or ends with .ext) and not be a shell command
    if ((term.includes('/') || /\.\w{1,5}$/.test(term)) && !term.startsWith('-') && term.length < 200) {
      // Skip scoped package names (@scope/package)
      if (term.startsWith('@') && (term.match(/\//g) || []).length === 1) continue;
      // Skip things that look like commands (contain spaces)
      if (term.includes(' ')) continue;
      // Skip semver-like patterns
      if (/^\d+\.\d+/.test(term)) continue;
      // For backtick refs with / but no file extension, only include if
      // they look like directory paths (lowercase, contain common path segments)
      if (term.includes('/') && !/\.\w{1,5}$/.test(term)) {
        // Must be lowercase or contain path-like segments to be a filesystem path
        // "Anthropic/Vertex" or "retry/backoff" are English, not paths
        if (term !== term.toLowerCase() && !/^[a-z]/.test(term)) continue;
        // Very short segments on both sides of / are likely not paths
        const segments = term.split('/');
        if (segments.every(s => s.length <= 3)) continue;
      }
      // Strip trailing punctuation
      const cleaned = term.replace(/[,;:!?)]+$/, '');
      if (cleaned.length > 1) refs.add(cleaned);
    }
  }

  // Bare path-like strings outside backticks (word/word or word/word.ext)
  // Only match paths with a file extension or clear directory structure to avoid
  // matching English phrases like "retry/backoff" or "cheaper/faster"
  const pathPattern = /(?:^|\s)((?:[a-zA-Z0-9_@.-]+\/)+[a-zA-Z0-9_.*-]+\.[a-zA-Z]{1,5})/gm;
  while ((match = pathPattern.exec(content)) !== null) {
    const term = match[1].trim();
    if (term.length > 2 && term.length < 200) {
      if (term.startsWith('@') && (term.match(/\//g) || []).length === 1) continue;
      const cleaned = term.replace(/[,;:!?)]+$/, '');
      if (cleaned.length > 1) refs.add(cleaned);
    }
  }

  return Array.from(refs);
}

/**
 * Validate extracted references against the filesystem.
 * Shared by both the scoring accuracy check and the score-refine loop.
 */
export function validateFileReferences(
  content: string,
  dir: string,
  checkExists: (path: string) => boolean = existsSync,
): { valid: string[]; invalid: string[]; total: number } {
  const refs = extractReferences(content);
  const valid: string[] = [];
  const invalid: string[] = [];

  for (const ref of refs) {
    if (/^https?:\/\//.test(ref)) continue;
    if (/^\d+\.\d+/.test(ref)) continue;
    if (ref.startsWith('#') || ref.startsWith('@')) continue;
    if (ref.includes('*') || ref.includes('..')) continue;
    if (!ref.includes('/') && !ref.includes('.')) continue;

    const fullPath = join(dir, ref);
    if (checkExists(fullPath)) {
      valid.push(ref);
    } else {
      const withoutTrailing = ref.replace(/\/+$/, '');
      if (withoutTrailing !== ref && checkExists(join(dir, withoutTrailing))) {
        valid.push(ref);
      } else {
        invalid.push(ref);
      }
    }
  }

  return { valid, invalid, total: valid.length + invalid.length };
}

/**
 * Count concrete vs abstract lines in markdown content.
 */
export function countConcreteness(content: string): { concrete: number; abstract: number } {
  let concrete = 0;
  let abstract = 0;
  let inCodeBlock = false;

  for (const line of content.split('\n')) {
    if (line.trim().startsWith('```')) { inCodeBlock = !inCodeBlock; continue; }
    const classification = classifyLine(line, inCodeBlock);
    if (classification === 'concrete') concrete++;
    else if (classification === 'abstract') abstract++;
  }

  return { concrete, abstract };
}

/**
 * Count lines matching directory tree patterns inside code blocks.
 */
export function countTreeLines(content: string): number {
  const treeLinePattern = /[├└│─┬]/;
  let count = 0;
  let inCodeBlock = false;

  for (const line of content.split('\n')) {
    if (line.trim().startsWith('```')) { inCodeBlock = !inCodeBlock; continue; }
    if (inCodeBlock && treeLinePattern.test(line)) count++;
  }

  return count;
}

/**
 * Calculate the percentage of lines in content2 that also appear in content1.
 * Lines are trimmed and filtered to > 10 chars.
 */
export function calculateDuplicatePercent(content1: string, content2: string): number {
  const lines1 = new Set(content1.split('\n').map(l => l.trim()).filter(l => l.length > 10));
  const lines2 = content2.split('\n').map(l => l.trim()).filter(l => l.length > 10);
  const overlapping = lines2.filter(l => lines1.has(l)).length;
  return lines2.length > 0 ? Math.round((overlapping / lines2.length) * 100) : 0;
}

/**
 * Calculate density points from a reference density percentage.
 */
export function calculateDensityPoints(density: number, maxPoints: number): number {
  if (density >= 40) return maxPoints;
  if (density >= 25) return Math.round(maxPoints * 0.75);
  if (density >= 15) return Math.round(maxPoints * 0.5);
  if (density >= 5) return Math.round(maxPoints * 0.25);
  return 0;
}

/**
 * Check if a project entry (directory or file) is mentioned in content.
 * Uses word-boundary matching with variants to avoid false positives.
 */
export function isEntryMentioned(entry: string, contentLower: string): boolean {
  const entryLower = entry.toLowerCase();
  const variants = [entryLower, entryLower.replace(/\\/g, '/')];
  const lastSegment = entry.split('/').pop()?.toLowerCase();
  if (lastSegment && lastSegment.length > 3) variants.push(lastSegment);

  return variants.some(v => {
    const escaped = v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|[\\s\`/"'\\.,(])${escaped}(?:[\\s\`/"'.,;:!?)\\\\]|$)`, 'i').test(contentLower);
  });
}

/**
 * Classify a line as "concrete" (has specific project references) or "abstract" (generic prose).
 * Lines inside code blocks, with backticks, or with path-like content are concrete.
 * Returns null for neutral lines (empty, headings) that should be excluded from the ratio.
 */
export function classifyLine(line: string, inCodeBlock: boolean): 'concrete' | 'abstract' | 'neutral' {
  if (inCodeBlock) return 'concrete';
  const trimmed = line.trim();
  if (trimmed.length === 0) return 'neutral';
  if (trimmed.startsWith('#')) return 'neutral';

  // Has inline code references
  if (/`[^`]+`/.test(trimmed)) return 'concrete';
  // Has file path pattern (with extension to avoid matching English like "and/or")
  if (/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+\.[a-zA-Z]{1,5}/.test(trimmed)) return 'concrete';
  // Has directory path pattern (at least one segment > 3 chars)
  if (/[a-zA-Z0-9_]{4,}\/[a-zA-Z0-9_.-]/.test(trimmed)) return 'concrete';
  // References a file with extension
  if (/\b[a-zA-Z0-9_-]+\.[a-zA-Z]{1,5}\b/.test(trimmed) && !/\b(e\.g|i\.e|vs|etc)\b/i.test(trimmed)) return 'concrete';

  return 'abstract';
}
