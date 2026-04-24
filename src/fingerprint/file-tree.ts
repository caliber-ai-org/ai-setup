import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

export const IGNORE_DIRS = new Set([
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
  'vendor',
  'target',
]);

interface TreeEntry {
  relPath: string;
  isDir: boolean;
  mtime: number;
}

export function getFileTree(dir: string, maxDepth = 3): string[] {
  const gitFiles = getGitTrackedFiles(dir);
  const entries: TreeEntry[] = gitFiles
    ? buildTreeFromGitFiles(dir, gitFiles, maxDepth)
    : scanEntries(dir, maxDepth);

  return sortAndFormat(entries);
}

function getGitTrackedFiles(dir: string): string[] | null {
  try {
    const output = execSync('git ls-files --cached --others --exclude-standard', {
      cwd: dir,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return output.trim().split('\n').filter(Boolean);
  } catch {
    return null;
  }
}

function buildTreeFromGitFiles(dir: string, files: string[], maxDepth: number): TreeEntry[] {
  const result: TreeEntry[] = [];
  const seenDirs = new Set<string>();

  for (const relFile of files) {
    const parts = relFile.split('/');
    if (parts.length - 1 > maxDepth) continue;

    const absPath = path.join(dir, relFile);
    let mtime = 0;
    try {
      mtime = fs.statSync(absPath).mtimeMs;
    } catch {
      continue;
    }

    result.push({ relPath: relFile, isDir: false, mtime });

    for (let i = 1; i < parts.length; i++) {
      const dirRel = parts.slice(0, i).join('/') + '/';
      if (seenDirs.has(dirRel)) continue;
      seenDirs.add(dirRel);

      const depth = i;
      if (depth > maxDepth) break;

      let dirMtime = 0;
      try {
        dirMtime = fs.statSync(path.join(dir, dirRel)).mtimeMs;
      } catch {
        /* skip */
      }

      result.push({ relPath: dirRel, isDir: true, mtime: dirMtime });
    }
  }

  return result;
}

function scanEntries(dir: string, maxDepth: number): TreeEntry[] {
  const entries: TreeEntry[] = [];
  scan(dir, '', 0, maxDepth, entries);
  return entries;
}

function sortAndFormat(entries: TreeEntry[]): string[] {
  const dirs: TreeEntry[] = [];
  const files: TreeEntry[] = [];
  for (const e of entries) {
    (e.isDir ? dirs : files).push(e);
  }

  const dirMaxMtime = new Map<string, number>();
  for (const d of dirs) dirMaxMtime.set(d.relPath, d.mtime);

  for (const f of files) {
    let remaining = f.relPath;
    while (true) {
      const lastSlash = remaining.lastIndexOf('/');
      if (lastSlash === -1) break;
      const dirPrefix = remaining.slice(0, lastSlash + 1);
      const current = dirMaxMtime.get(dirPrefix);
      if (current !== undefined && f.mtime > current) {
        dirMaxMtime.set(dirPrefix, f.mtime);
      }
      remaining = remaining.slice(0, lastSlash);
    }
  }

  for (const d of dirs) {
    d.mtime = dirMaxMtime.get(d.relPath) ?? d.mtime;
  }

  dirs.sort((a, b) => b.mtime - a.mtime);
  files.sort((a, b) => b.mtime - a.mtime);

  return [...dirs.map((e) => e.relPath), ...files.map((e) => e.relPath)];
}

function scan(base: string, rel: string, depth: number, maxDepth: number, result: TreeEntry[]) {
  if (depth > maxDepth) return;

  const fullPath = path.join(base, rel);
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(fullPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.name.startsWith('.') && depth === 0 && entry.isDirectory()) continue;
    if (IGNORE_DIRS.has(entry.name)) continue;

    const relPath = rel ? `${rel}/${entry.name}` : entry.name;
    const entryPath = path.join(base, relPath);

    let mtime = 0;
    try {
      mtime = fs.statSync(entryPath).mtimeMs;
    } catch {
      /* skip */
    }

    if (entry.isDirectory()) {
      result.push({ relPath: `${relPath}/`, isDir: true, mtime });
      scan(base, relPath, depth + 1, maxDepth, result);
    } else {
      result.push({ relPath, isDir: false, mtime });
    }
  }
}
