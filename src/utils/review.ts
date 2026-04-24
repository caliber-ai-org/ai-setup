import chalk from 'chalk';
import fs from 'fs';
import select from '@inquirer/select';
import { createTwoFilesPatch } from 'diff';
import { detectAvailableEditors, openDiffsInEditor } from './editor.js';
import type { ReviewMethod } from './editor.js';
import type { StagedFile } from '../writers/staging.js';

interface FileInfo {
  relativePath: string;
  isNew: boolean;
  added: number;
  removed: number;
  lines: number;
  patch: string;
}

export async function promptWantsReview(): Promise<boolean> {
  if (!process.stdin.isTTY) return false;
  return select({
    message: 'Would you like to review the diffs before deciding?',
    choices: [
      { name: 'Yes, show me the diffs', value: true },
      { name: 'No, continue', value: false },
    ],
  });
}

export async function promptReviewMethod(): Promise<ReviewMethod> {
  const available = detectAvailableEditors();
  if (available.length === 1) return 'terminal';
  if (!process.stdin.isTTY) return 'terminal';

  const choices = available.map((method) => {
    switch (method) {
      case 'cursor':
        return { name: 'Cursor (diff view)', value: 'cursor' as const };
      case 'vscode':
        return { name: 'VS Code (diff view)', value: 'vscode' as const };
      case 'terminal':
        return { name: 'Terminal', value: 'terminal' as const };
    }
  });

  return select({ message: 'How would you like to review the changes?', choices });
}

export async function openReview(method: ReviewMethod, stagedFiles: StagedFile[]): Promise<void> {
  if (method === 'cursor' || method === 'vscode') {
    openDiffsInEditor(
      method,
      stagedFiles.map((f) => ({
        originalPath: f.originalPath,
        proposedPath: f.proposedPath,
      })),
    );
    console.log(chalk.dim('  Diffs opened in your editor.\n'));
    return;
  }

  const fileInfos = stagedFiles.map((file) => {
    const proposed = fs.readFileSync(file.proposedPath, 'utf-8');
    const current = file.currentPath ? fs.readFileSync(file.currentPath, 'utf-8') : '';
    const patch = createTwoFilesPatch(
      file.isNew ? '/dev/null' : file.relativePath,
      file.relativePath,
      current,
      proposed,
    );
    let added = 0,
      removed = 0;
    for (const line of patch.split('\n')) {
      if (line.startsWith('+') && !line.startsWith('+++')) added++;
      if (line.startsWith('-') && !line.startsWith('---')) removed++;
    }
    return {
      relativePath: file.relativePath,
      isNew: file.isNew,
      added,
      removed,
      lines: proposed.split('\n').length,
      patch,
    };
  });

  await interactiveDiffExplorer(fileInfos);
}

async function interactiveDiffExplorer(files: FileInfo[]): Promise<void> {
  if (!process.stdin.isTTY) {
    for (const f of files) {
      const icon = f.isNew ? chalk.green('+') : chalk.yellow('~');
      const stats = f.isNew
        ? chalk.dim(`${f.lines} lines`)
        : `${chalk.green(`+${f.added}`)} ${chalk.red(`-${f.removed}`)}`;
      console.log(`    ${icon} ${f.relativePath}  ${stats}`);
    }
    console.log('');
    return;
  }

  const { stdin, stdout } = process;
  let cursor = 0;
  let viewing: number | null = null;
  let scrollOffset = 0;
  let lineCount = 0;

  function getTermHeight(): number {
    return (stdout.rows || 24) - 4;
  }

  function renderFileList(): string {
    const lines: string[] = [];
    lines.push(chalk.bold('  Review changes'));
    lines.push('');

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const ptr = i === cursor ? chalk.cyan('>') : ' ';
      const icon = f.isNew ? chalk.green('+') : chalk.yellow('~');
      const stats = f.isNew
        ? chalk.dim(`${f.lines} lines`)
        : `${chalk.green(`+${f.added}`)} ${chalk.red(`-${f.removed}`)}`;
      lines.push(`  ${ptr} ${icon} ${f.relativePath}  ${stats}`);
    }

    lines.push('');
    lines.push(chalk.dim('  ↑↓ navigate  ⏎ view diff  q done'));
    return lines.join('\n');
  }

  function renderDiff(index: number): string {
    const f = files[index];
    const lines: string[] = [];
    const header = f.isNew
      ? `  ${chalk.green('+')} ${f.relativePath} ${chalk.dim('(new file)')}`
      : `  ${chalk.yellow('~')} ${f.relativePath} ${chalk.green(`+${f.added}`)} ${chalk.red(`-${f.removed}`)}`;
    lines.push(header);
    lines.push(chalk.dim('  ' + '─'.repeat(60)));

    const patchLines = f.patch.split('\n');
    const bodyLines = patchLines.slice(4);
    const maxVisible = getTermHeight() - 4;
    const visibleLines = bodyLines.slice(scrollOffset, scrollOffset + maxVisible);

    for (const line of visibleLines) {
      if (line.startsWith('+')) {
        lines.push(chalk.green('  ' + line));
      } else if (line.startsWith('-')) {
        lines.push(chalk.red('  ' + line));
      } else if (line.startsWith('@@')) {
        lines.push(chalk.cyan('  ' + line));
      } else {
        lines.push(chalk.dim('  ' + line));
      }
    }

    const totalBody = bodyLines.length;
    if (totalBody > maxVisible) {
      const pct = Math.round(((scrollOffset + maxVisible) / totalBody) * 100);
      lines.push(chalk.dim(`  ── ${Math.min(pct, 100)}% ──`));
    }

    lines.push('');
    lines.push(chalk.dim('  ↑↓ scroll  ⎵/esc back to file list'));
    return lines.join('\n');
  }

  function draw(initial: boolean) {
    if (!initial && lineCount > 0) {
      stdout.write(`\x1b[${lineCount}A`);
    }
    stdout.write('\x1b[0J');
    const output = viewing !== null ? renderDiff(viewing) : renderFileList();
    stdout.write(output + '\n');
    lineCount = output.split('\n').length;
  }

  return new Promise((resolve) => {
    console.log('');
    draw(true);

    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    function cleanup() {
      stdin.removeListener('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
    }

    function onData(key: string) {
      if (viewing !== null) {
        const f = files[viewing];
        const totalBody = f.patch.split('\n').length - 4;
        const maxVisible = getTermHeight() - 4;

        switch (key) {
          case '\x1b[A':
            scrollOffset = Math.max(0, scrollOffset - 1);
            draw(false);
            break;
          case '\x1b[B':
            scrollOffset = Math.min(Math.max(0, totalBody - maxVisible), scrollOffset + 1);
            draw(false);
            break;
          case ' ':
          case '\x1b':
            viewing = null;
            scrollOffset = 0;
            draw(false);
            break;
          case 'q':
          case '\x03':
            cleanup();
            console.log('');
            resolve();
            break;
        }
      } else {
        switch (key) {
          case '\x1b[A':
            cursor = (cursor - 1 + files.length) % files.length;
            draw(false);
            break;
          case '\x1b[B':
            cursor = (cursor + 1) % files.length;
            draw(false);
            break;
          case '\r':
          case '\n':
            viewing = cursor;
            scrollOffset = 0;
            draw(false);
            break;
          case 'q':
          case '\x03':
            cleanup();
            console.log('');
            resolve();
            break;
        }
      }
    }

    stdin.on('data', onData);
  });
}
