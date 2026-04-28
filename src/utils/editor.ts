import { execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { quoteForWindows } from './windows.js';

const IS_WINDOWS = process.platform === 'win32';
const DIFF_TEMP_DIR = path.join(os.tmpdir(), 'caliber-diff');

function getEmptyFilePath(proposedPath: string): string {
  fs.mkdirSync(DIFF_TEMP_DIR, { recursive: true });
  const tempPath = path.join(DIFF_TEMP_DIR, path.basename(proposedPath));
  fs.writeFileSync(tempPath, '');
  return tempPath;
}

export type ReviewMethod = 'cursor' | 'vscode' | 'terminal';

function commandExists(cmd: string): boolean {
  try {
    const check = process.platform === 'win32' ? `where ${cmd}` : `which ${cmd}`;
    execSync(check, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export function detectAvailableEditors(): ReviewMethod[] {
  const methods: ReviewMethod[] = [];
  if (commandExists('cursor')) methods.push('cursor');
  if (commandExists('code')) methods.push('vscode');
  methods.push('terminal');
  return methods;
}

export function openDiffsInEditor(
  editor: 'cursor' | 'vscode',
  files: Array<{ originalPath?: string; proposedPath: string }>,
): void {
  const cmd = editor === 'cursor' ? 'cursor' : 'code';

  for (const file of files) {
    try {
      const leftPath = file.originalPath ?? getEmptyFilePath(file.proposedPath);
      if (IS_WINDOWS) {
        // Use canonical quoteForWindows which escapes embedded quotes per
        // CommandLineToArgvW rules. The previous local quote() didn't escape
        // " inside paths, so a path with a literal quote would break parsing.
        spawn(
          [
            quoteForWindows(cmd),
            '--diff',
            quoteForWindows(leftPath),
            quoteForWindows(file.proposedPath),
          ].join(' '),
          { shell: true, stdio: 'ignore', detached: true },
        ).unref();
      } else {
        spawn(cmd, ['--diff', leftPath, file.proposedPath], {
          stdio: 'ignore',
          detached: true,
        }).unref();
      }
    } catch {
      continue;
    }
  }
}
