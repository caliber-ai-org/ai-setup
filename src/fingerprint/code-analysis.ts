import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { sanitizeSecrets } from '../lib/sanitize.js';

const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  'dist',
  'build',
  '.cache',
  '.turbo',
  'coverage',
  '.caliber',
  '__pycache__',
  '.venv',
  'venv',
  'env',
  'vendor',
  'target',
  '.parcel-cache',
  '.nyc_output',
  '.claude',
  '.cursor',
  '.agents',
  '.codex',
]);

const TEXT_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '.pyw',
  '.go',
  '.rs',
  '.rb',
  '.java',
  '.kt',
  '.scala',
  '.cs',
  '.c',
  '.cpp',
  '.h',
  '.hpp',
  '.swift',
  '.m',
  '.php',
  '.lua',
  '.r',
  '.jl',
  '.ex',
  '.exs',
  '.erl',
  '.hs',
  '.sh',
  '.bash',
  '.zsh',
  '.fish',
  '.sql',
  '.graphql',
  '.gql',
  '.prisma',
  '.html',
  '.css',
  '.scss',
  '.sass',
  '.less',
  '.svelte',
  '.vue',
  '.astro',
  '.json',
  '.yaml',
  '.yml',
  '.toml',
  '.ini',
  '.cfg',
  '.xml',
  '.plist',
  '.md',
  '.mdx',
  '.txt',
  '.rst',
  '.tf',
  '.hcl',
  '.proto',
  '.mdc',
]);

const SKIP_FILES = new Set([
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lockb',
  'Cargo.lock',
  'Gemfile.lock',
  'poetry.lock',
  'composer.lock',
  '.DS_Store',
  'Thumbs.db',
]);

const SKIP_PATTERNS = [
  /\.min\.(js|css)$/,
  /\.bundle\.(js|css)$/,
  /\.map$/,
  /\.d\.ts$/,
  /\.generated\./,
  /\.snap$/,
  /^\.env($|\.)/,
];

const COMMENT_LINE: Record<string, RegExp> = {
  c: /^\s*\/\//,
  h: /^\s*#/,
  x: /^\s*<!--.*-->\s*$/,
};

const EXT_COMMENT: Record<string, string> = {
  '.ts': 'c',
  '.tsx': 'c',
  '.js': 'c',
  '.jsx': 'c',
  '.mjs': 'c',
  '.cjs': 'c',
  '.go': 'c',
  '.rs': 'c',
  '.java': 'c',
  '.kt': 'c',
  '.scala': 'c',
  '.cs': 'c',
  '.c': 'c',
  '.cpp': 'c',
  '.h': 'c',
  '.hpp': 'c',
  '.swift': 'c',
  '.php': 'c',
  '.py': 'h',
  '.pyw': 'h',
  '.rb': 'h',
  '.sh': 'h',
  '.bash': 'h',
  '.zsh': 'h',
  '.fish': 'h',
  '.r': 'h',
  '.tf': 'h',
  '.hcl': 'h',
  '.yaml': 'h',
  '.yml': 'h',
  '.toml': 'h',
  '.ini': 'h',
  '.cfg': 'h',
  '.html': 'x',
  '.xml': 'x',
  '.vue': 'x',
  '.svelte': 'x',
};

const SOURCE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '.pyw',
  '.go',
  '.rs',
  '.rb',
  '.java',
  '.kt',
  '.scala',
  '.cs',
  '.c',
  '.cpp',
  '.h',
  '.hpp',
  '.swift',
  '.php',
]);

const TOKEN_BUDGET = 80_000;
const CHAR_BUDGET = TOKEN_BUDGET * 4;

export interface ProjectFile {
  path: string;
  content: string;
  size: number;
  priority: number;
}

export interface CodeAnalysis {
  files: ProjectFile[];
  truncated: boolean;
  totalProjectTokens: number;
  compressedTokens: number;
  includedTokens: number;
  filesAnalyzed: number;
  filesIncluded: number;
  duplicateGroups: number;
}

// ── Compression ──────────────────────────────────────────────────────────

function compressContent(content: string, ext: string): string {
  const cp = EXT_COMMENT[ext] ? COMMENT_LINE[EXT_COMMENT[ext]] : null;
  const lines = content.split('\n');
  const result: string[] = [];
  let prevBlank = false;
  let inBlockComment = false;

  for (const line of lines) {
    const trimmed = line.trimEnd();

    if (!inBlockComment && /^\s*\/\*/.test(trimmed) && !trimmed.includes('*/')) {
      inBlockComment = true;
      continue;
    }
    if (inBlockComment) {
      if (trimmed.includes('*/')) inBlockComment = false;
      continue;
    }
    if (/^\s*\/\*.*\*\/\s*$/.test(trimmed)) continue;

    if (trimmed.length === 0) {
      if (!prevBlank) result.push('');
      prevBlank = true;
      continue;
    }
    prevBlank = false;

    if (cp && cp.test(trimmed)) continue;

    const leading = line.match(/^(\s*)/);
    if (leading) {
      const spaces = leading[1].replace(/\t/g, '    ').length;
      result.push(' '.repeat(Math.floor(spaces / 2) * 2) + line.trimStart().trimEnd());
    } else {
      result.push(trimmed);
    }
  }

  while (result.length > 0 && result[result.length - 1] === '') result.pop();
  return result.join('\n');
}

// ── Skeleton extraction ──────────────────────────────────────────────────

function extractSkeleton(content: string, ext: string): string {
  if (!SOURCE_EXTENSIONS.has(ext)) return content;

  const lines = content.split('\n');
  const result: string[] = [];
  let braceDepth = 0;
  let skipBody = false;

  if (['.py', '.pyw', '.rb'].includes(ext)) {
    return extractSkeletonIndentBased(lines, ext);
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Always keep imports, type definitions, interfaces, enums
    if (/^\s*(import |from |require\(|use |package |module )/.test(line)) {
      result.push(line);
      continue;
    }
    if (/^\s*(export\s+)?(interface|type|enum)\s/.test(trimmed)) {
      result.push(line);
      // Include the full type/interface/enum body
      let depth = 0;
      for (let j = i; j < lines.length; j++) {
        if (j > i) result.push(lines[j]);
        depth += (lines[j].match(/{/g) || []).length;
        depth -= (lines[j].match(/}/g) || []).length;
        if (depth <= 0 && j > i) {
          i = j;
          break;
        }
      }
      continue;
    }

    // Detect function/method/class signatures
    const isFnOrClass =
      /^\s*(export\s+)?(default\s+)?(async\s+)?(function|class|const\s+\w+\s*=\s*(async\s*)?\(|pub\s+fn|fn|func)\s/.test(
        trimmed,
      ) || /^\s*(def|func|fn|pub fn|pub async fn)\s/.test(trimmed);

    if (isFnOrClass && braceDepth === 0) {
      result.push(line);
      // Check if this line opens a body
      const opens = (line.match(/{/g) || []).length;
      const closes = (line.match(/}/g) || []).length;
      if (opens > closes) {
        skipBody = true;
        braceDepth = opens - closes;
        result.push(' '.repeat(line.search(/\S/)) + '  // ...');
      }
      continue;
    }

    if (skipBody) {
      braceDepth += (line.match(/{/g) || []).length;
      braceDepth -= (line.match(/}/g) || []).length;
      if (braceDepth <= 0) {
        result.push(line); // closing brace
        skipBody = false;
        braceDepth = 0;
      }
      continue;
    }

    // Keep top-level declarations
    if (braceDepth === 0) {
      result.push(line);
    }
  }

  return result.join('\n');
}

function extractSkeletonIndentBased(lines: string[], _ext: string): string {
  const result: string[] = [];
  let skipIndent = -1;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;

    const indent = line.search(/\S/);

    // Always keep imports
    if (/^(import |from )/.test(trimmed)) {
      result.push(line);
      skipIndent = -1;
      continue;
    }

    // Keep class and function signatures
    if (/^(class |def |async def )/.test(trimmed)) {
      result.push(line);
      skipIndent = indent;
      continue;
    }

    // Keep decorators
    if (trimmed.startsWith('@')) {
      result.push(line);
      skipIndent = -1;
      continue;
    }

    // Skip function/method bodies (indented deeper than the def)
    if (skipIndent >= 0 && indent > skipIndent) {
      continue;
    }

    skipIndent = -1;
    result.push(line);
  }

  return result.join('\n');
}

// ── Import graph ─────────────────────────────────────────────────────────

function extractImports(content: string, filePath: string): string[] {
  const imports: string[] = [];
  const dir = path.dirname(filePath);

  for (const line of content.split('\n')) {
    const trimmed = line.trim();

    // JS/TS: import ... from './foo' or require('./foo')
    const jsMatch = trimmed.match(/(?:from|require\()\s*['"]([^'"]+)['"]/);
    if (jsMatch && jsMatch[1].startsWith('.')) {
      imports.push(path.normalize(path.join(dir, jsMatch[1])));
      continue;
    }

    // Python: from .foo import bar
    const pyMatch = trimmed.match(/^from\s+(\.[.\w]*)\s+import/);
    if (pyMatch) {
      const modulePath = pyMatch[1].replace(/\./g, '/');
      imports.push(path.normalize(path.join(dir, modulePath)));
      continue;
    }

    // Go: import "project/pkg/foo"
    const goMatch = trimmed.match(/^\s*"([^"]+)"/);
    if (goMatch && !goMatch[1].includes('.')) {
      imports.push(goMatch[1]);
    }
  }

  return imports;
}

function buildImportCounts(files: Map<string, string>): Map<string, number> {
  const counts = new Map<string, number>();

  for (const [filePath, content] of files) {
    const ext = path.extname(filePath).toLowerCase();
    if (!SOURCE_EXTENSIONS.has(ext)) continue;

    const imports = extractImports(content, filePath);
    for (const imp of imports) {
      // Try to match imported path to an actual file
      const candidates = [
        imp,
        imp + '.ts',
        imp + '.js',
        imp + '.tsx',
        imp + '.jsx',
        imp + '/index.ts',
        imp + '/index.js',
        imp + '.py',
      ];
      for (const candidate of candidates) {
        const normalized = candidate.replace(/\\/g, '/');
        if (files.has(normalized)) {
          counts.set(normalized, (counts.get(normalized) || 0) + 1);
          break;
        }
      }
    }
  }

  return counts;
}

// ── Git frequency ────────────────────────────────────────────────────────

function getGitFrequency(dir: string): Map<string, number> {
  const freq = new Map<string, number>();
  try {
    const output = execSync(
      'git log --since="6 months ago" --format="" --name-only --diff-filter=ACMR 2>/dev/null | head -10000',
      { cwd: dir, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 5000 },
    );
    for (const line of output.split('\n')) {
      const trimmed = line.trim();
      if (trimmed) freq.set(trimmed, (freq.get(trimmed) || 0) + 1);
    }
  } catch {
    /* not a git repo or git not available */
  }
  return freq;
}

// ── Directory-level dedup ────────────────────────────────────────────────

interface ScoredFile {
  path: string;
  rawContent: string;
  compressed: string;
  skeleton: string;
  ext: string;
  score: number;
}

function groupByDirectory(files: ScoredFile[]): Map<string, ScoredFile[]> {
  const groups = new Map<string, ScoredFile[]>();
  for (const f of files) {
    const dir = path.dirname(f.path);
    const group = groups.get(dir) || [];
    group.push(f);
    groups.set(dir, group);
  }
  return groups;
}

function structuralFingerprint(content: string, ext: string): string {
  const lines = content.split('\n').filter((l) => l.trim().length > 0);
  const bucket = Math.floor(lines.length / 10) * 10;
  const first = (lines[0] || '').trim().slice(0, 50);
  const imports = lines.filter((l) => /^\s*(import |from |require\(|use )/.test(l)).length;
  const fns = lines.filter((l) =>
    /^\s*(export\s+)?(async\s+)?(function |def |func |fn |pub fn |class )/.test(l),
  ).length;
  return `${ext}:${bucket}:${imports}:${fns}:${first}`;
}

// ── Main ─────────────────────────────────────────────────────────────────

export function analyzeCode(dir: string): CodeAnalysis {
  const allPaths: string[] = [];
  walkDir(dir, '', 0, 10, allPaths);

  // Count total raw size
  let totalChars = 0;
  for (const relPath of allPaths) {
    try {
      totalChars += fs.statSync(path.join(dir, relPath)).size;
    } catch {
      /* skip */
    }
  }

  // Read all files
  const fileContents = new Map<string, string>();
  for (const relPath of allPaths) {
    try {
      const content = fs.readFileSync(path.join(dir, relPath), 'utf-8');
      if (content.split('\n').length <= 500) fileContents.set(relPath, content);
    } catch {
      /* skip */
    }
  }

  // Build scoring signals
  const importCounts = buildImportCounts(fileContents);
  const gitFreq = getGitFrequency(dir);

  // Score, compress, and skeleton each file
  const scored: ScoredFile[] = [];
  let compressedChars = 0;

  for (const [relPath, rawContent] of fileContents) {
    const ext = path.extname(relPath).toLowerCase();
    const compressed = compressContent(rawContent, ext);
    const skeleton = extractSkeleton(compressed, ext);
    compressedChars += compressed.length;

    const priorityScore = filePriority(relPath);
    const importScore = Math.min(importCounts.get(relPath) || 0, 20) * 2;
    const gitScore = Math.min(gitFreq.get(relPath) || 0, 10) * 3;
    const score = priorityScore + importScore + gitScore;

    scored.push({ path: relPath, rawContent, compressed, skeleton, ext, score });
  }

  // Sort by score (highest first)
  scored.sort((a, b) => b.score - a.score);

  // Directory-level dedup: pick representative per directory
  const dirGroups = groupByDirectory(scored);
  const result: ProjectFile[] = [];
  let includedChars = 0;
  let dupGroups = 0;

  for (const [dirPath, group] of dirGroups) {
    if (group.length === 0) continue;

    // Representative = highest scored file in directory
    const rep = group[0]; // already sorted by score

    // Check if files in this directory are structurally similar
    const repFP = structuralFingerprint(rep.compressed, rep.ext);
    const similar = group
      .slice(1)
      .filter((f) => structuralFingerprint(f.compressed, f.ext) === repFP);
    const unique = group
      .slice(1)
      .filter((f) => structuralFingerprint(f.compressed, f.ext) !== repFP);

    // Representative gets full compressed content (sanitized for secrets)
    const repEntry = {
      path: rep.path,
      content: sanitizeSecrets(rep.compressed),
      size: rep.compressed.length,
      priority: rep.score,
    };
    const repSize = rep.path.length + rep.compressed.length + 10;
    if (includedChars + repSize <= CHAR_BUDGET) {
      result.push(repEntry);
      includedChars += repSize;
    }

    // Similar files get a single summary line
    if (similar.length > 0) {
      dupGroups++;
      const names = similar.map((f) => path.basename(f.path));
      const summary = `(${similar.length} similar file${similar.length === 1 ? '' : 's'} in ${dirPath}/: ${names.join(', ')})`;
      const summarySize = summary.length + 30;
      if (includedChars + summarySize <= CHAR_BUDGET) {
        result.push({
          path: `[similar to ${rep.path}]`,
          content: summary,
          size: summary.length,
          priority: rep.score,
        });
        includedChars += summarySize;
      }
    }

    // Unique files in same directory get skeleton (sanitized for secrets)
    for (const f of unique) {
      const skeletonSize = f.path.length + f.skeleton.length + 10;
      if (includedChars + skeletonSize <= CHAR_BUDGET) {
        result.push({
          path: f.path,
          content: sanitizeSecrets(f.skeleton),
          size: f.skeleton.length,
          priority: f.score,
        });
        includedChars += skeletonSize;
      }
    }
  }

  // If there's still budget, fill with skeletons of files not yet included
  const includedPaths = new Set(result.map((f) => f.path));
  for (const f of scored) {
    if (includedPaths.has(f.path)) continue;
    const skeletonSize = f.path.length + f.skeleton.length + 10;
    if (includedChars + skeletonSize > CHAR_BUDGET) continue;
    result.push({
      path: f.path,
      content: sanitizeSecrets(f.skeleton),
      size: f.skeleton.length,
      priority: f.score,
    });
    includedChars += skeletonSize;
  }

  return {
    files: result,
    truncated: includedChars >= CHAR_BUDGET * 0.95,
    totalProjectTokens: Math.ceil(totalChars / 4),
    compressedTokens: Math.ceil(compressedChars / 4),
    includedTokens: Math.ceil(includedChars / 4),
    filesAnalyzed: fileContents.size,
    filesIncluded: result.length,
    duplicateGroups: dupGroups,
  };
}

// ── File walking & priority ──────────────────────────────────────────────

function walkDir(base: string, rel: string, depth: number, maxDepth: number, files: string[]) {
  if (depth > maxDepth) return;
  const fullPath = path.join(base, rel);
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(fullPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    if (entry.name.startsWith('.') && depth === 0 && entry.isDirectory()) continue;

    const relPath = rel ? `${rel}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      walkDir(base, relPath, depth + 1, maxDepth, files);
    } else if (entry.isFile()) {
      if (SKIP_FILES.has(entry.name)) continue;
      if (SKIP_PATTERNS.some((p) => p.test(entry.name))) continue;

      const ext = path.extname(entry.name).toLowerCase();
      if (TEXT_EXTENSIONS.has(ext) || (depth === 0 && !ext && !entry.name.startsWith('.'))) {
        files.push(relPath);
      }
    }
  }
}

function filePriority(filePath: string): number {
  const base = path.basename(filePath);
  const entryPoints = new Set([
    'index.ts',
    'index.js',
    'index.tsx',
    'index.jsx',
    'main.ts',
    'main.py',
    'main.go',
    'main.rs',
    'app.ts',
    'app.js',
    'app.py',
    'server.ts',
    'server.js',
    'mod.rs',
    'lib.rs',
  ]);

  if (entryPoints.has(base)) return 40;
  if (/\.(json|ya?ml|toml|ini|cfg)$|config\.|Makefile|Dockerfile/i.test(filePath)) return 35;
  if (/(route|api|controller|endpoint|handler)/i.test(filePath)) return 30;
  if (/(types|schema|models|entities|migration)/i.test(filePath)) return 25;
  if (/(service|lib|utils|helper|middleware)/i.test(filePath)) return 20;
  if (/(test|spec|__tests__|_test\.|\.test\.)/i.test(filePath)) return 5;
  return 15;
}
