import fs from 'fs';
import path from 'path';

const CONFIG_FILE_MARKERS = [
  'CLAUDE.md',
  'AGENTS.md',
  '.cursorrules',
  '.github/copilot-instructions.md',
];

const CONFIG_DIR_MARKERS = ['.cursor/rules', '.github/instructions', '.opencode/skills'];

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
  'vendor',
  'target',
]);

// 4 levels covers most monorepo layouts (e.g., packages/frontend/apps/web)
const MAX_DEPTH = 4;

export function hasConfigFiles(dir: string): boolean {
  for (const marker of CONFIG_FILE_MARKERS) {
    if (fs.existsSync(path.join(dir, marker))) return true;
  }
  for (const marker of CONFIG_DIR_MARKERS) {
    const markerPath = path.join(dir, marker);
    if (fs.existsSync(markerPath) && fs.statSync(markerPath).isDirectory()) return true;
  }
  return false;
}

export function discoverConfigDirs(rootDir: string): string[] {
  const dirs: string[] = [];

  if (hasConfigFiles(rootDir)) {
    dirs.push('.');
  }

  walkForConfigs(rootDir, rootDir, 0, dirs);

  // Remove parent dirs that have a child with configs.
  // e.g. if both "packages/frontend" and "packages/frontend/apps/web" exist,
  // keep both — a parent with its own configs is a valid scope.
  // The scoping logic in scopeDiffToDir handles ownership correctly.
  dirs.sort();
  return dirs;
}

function walkForConfigs(
  baseDir: string,
  currentDir: string,
  depth: number,
  result: string[],
): void {
  if (depth >= MAX_DEPTH) return;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(currentDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('.') || IGNORE_DIRS.has(entry.name)) continue;

    const fullPath = path.join(currentDir, entry.name);
    const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/');

    if (hasConfigFiles(fullPath)) {
      result.push(relPath);
    }

    walkForConfigs(baseDir, fullPath, depth + 1, result);
  }
}
