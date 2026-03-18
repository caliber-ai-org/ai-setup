import fs from 'fs';
import path from 'path';

const IGNORE_DIRS = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', '.cache',
  '.turbo', 'coverage', '.caliber', '__pycache__', '.venv',
  'vendor', 'target',
]);

interface TreeEntry {
  relPath: string;
  isDir: boolean;
  mtime: number;
}

export function getFileTree(dir: string, maxDepth = 3): string[] {
  const entries: TreeEntry[] = [];
  scan(dir, '', 0, maxDepth, entries);

  const dirs: TreeEntry[] = [];
  const files: TreeEntry[] = [];
  for (const e of entries) {
    (e.isDir ? dirs : files).push(e);
  }

  // Score each directory by the max mtime of any descendant file (single-pass)
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

  return [...dirs.map(e => e.relPath), ...files.map(e => e.relPath)];
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
    } catch { /* skip */ }

    if (entry.isDirectory()) {
      result.push({ relPath: `${relPath}/`, isDir: true, mtime });
      scan(base, relPath, depth + 1, maxDepth, result);
    } else {
      result.push({ relPath, isDir: false, mtime });
    }
  }
}
