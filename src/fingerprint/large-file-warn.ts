/**
 * large-file-warn.ts
 *
 * Renders LargeFileWarning[] to the terminal.
 *
 * Deliberately separated from large-file-scan.ts so that:
 *  - Commands can decide if/how to surface warnings (quiet mode, CI, etc.)
 *  - The detection logic remains a pure function with no output side-effects
 *  - Both halves are independently unit-testable
 *
 * Output rules (matching the codebase conventions in spinner-messages.ts):
 *  - Uses chalk (already a dependency) — no raw ANSI escape codes
 *  - When an ora spinner is active, delegates to spinner.warn() so the
 *    spinner frame is not garbled by interleaved writes
 *  - In non-TTY contexts (CI, piped output) chalk.level drops to 0
 *    automatically, so colours are stripped without any extra logic
 */

import chalk from 'chalk';
import type { Ora } from 'ora';
import type { LargeFileWarning } from './large-file-scan.js';

export interface WarnOptions {
  /**
   * Active ora spinner, if one is running.  When provided, output is routed
   * through spinner.warn() so the animation is not corrupted.
   */
  spinner?: Ora;
}

/**
 * Prints a formatted warning block for each large file.
 * No-ops when `warnings` is empty.
 */
export function printLargeFileWarnings(
  warnings: LargeFileWarning[],
  options: WarnOptions = {},
): void {
  if (warnings.length === 0) return;

  const { spinner } = options;

  const header = chalk.yellow.bold(
    `⚠  ${warnings.length} large file${warnings.length === 1 ? '' : 's'} may bloat your AI context window`,
  );

  const fileLines = warnings
    .map((w) => chalk.yellow(`   • ${w.filePath}  (${w.sizeMB} MB)`))
    .join('\n');

  const hint = chalk.dim(
    '   Add them to .gitignore or .caliberignore to keep context lean.',
  );

  const block = `\n${header}\n${fileLines}\n${hint}\n`;

  if (spinner) {
    // ora.warn() stops the spinner frame, prints the message, then resumes —
    // prevents the warning from being interleaved with spinner animation.
    spinner.warn(block);
  } else {
    process.stderr.write(block + '\n');
  }
}

