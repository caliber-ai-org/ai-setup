import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import chalk from 'chalk';
import { computeLocalScore } from '../scoring/index.js';
import type { TargetAgent } from '../scoring/index.js';
import { displayScore } from '../scoring/display.js';
import { readState } from '../lib/state.js';
import { trackScoreComputed } from '../telemetry/events.js';
import { resolveCaliber } from '../lib/resolve-caliber.js';
import { recordScore } from '../scoring/history.js';

interface ScoreOptions {
  json?: boolean;
  quiet?: boolean;
  agent?: TargetAgent;
  compare?: string;
}

const CONFIG_FILES = ['CLAUDE.md', 'AGENTS.md', '.cursorrules', 'CALIBER_LEARNINGS.md'];
const CONFIG_DIRS = ['.claude', '.cursor'];

function scoreBaseRef(
  ref: string,
  target: TargetAgent | undefined,
): { score: number; grade: string } | null {
  if (!/^[\w.\-/~^@{}]+$/.test(ref)) return null;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'caliber-compare-'));
  try {
    for (const file of CONFIG_FILES) {
      try {
        const content = execFileSync('git', ['show', `${ref}:${file}`], {
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        fs.writeFileSync(path.join(tmpDir, file), content);
      } catch {
        /* file doesn't exist in base ref */
      }
    }
    for (const dir of CONFIG_DIRS) {
      try {
        const files = execFileSync('git', ['ls-tree', '-r', '--name-only', ref, `${dir}/`], {
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        })
          .trim()
          .split('\n')
          .filter(Boolean);
        for (const file of files) {
          const filePath = path.join(tmpDir, file);
          fs.mkdirSync(path.dirname(filePath), { recursive: true });
          const content = execFileSync('git', ['show', `${ref}:${file}`], {
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
          });
          fs.writeFileSync(filePath, content);
        }
      } catch {
        /* dir doesn't exist in base ref */
      }
    }
    const result = computeLocalScore(tmpDir, target);
    return { score: result.score, grade: result.grade };
  } catch {
    return null;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

export async function scoreCommand(options: ScoreOptions) {
  const dir = process.cwd();
  const target = options.agent ?? readState()?.targetAgent;
  const result = computeLocalScore(dir, target);
  trackScoreComputed(result.score, target);
  recordScore(result, 'score');

  if (options.compare) {
    const baseResult = scoreBaseRef(options.compare, target);
    if (!baseResult) {
      console.error(
        chalk.red(`Could not score ref "${options.compare}" — branch or ref not found.`),
      );
      process.exitCode = 1;
      return;
    }

    const delta = result.score - baseResult.score;
    if (options.json) {
      console.log(
        JSON.stringify(
          {
            current: result,
            base: { score: baseResult.score, grade: baseResult.grade, ref: options.compare },
            delta,
          },
          null,
          2,
        ),
      );
      return;
    }
    if (options.quiet) {
      const sign = delta > 0 ? '+' : '';
      console.log(`${result.score}/100 (${result.grade}) ${sign}${delta} from ${options.compare}`);
      return;
    }

    displayScore(result);
    const separator = chalk.gray('  ' + '─'.repeat(53));
    console.log(separator);
    if (delta > 0) {
      console.log(
        chalk.green(`  +${delta}`) +
          chalk.gray(` from ${options.compare} (${baseResult.score}/100)`),
      );
    } else if (delta < 0) {
      console.log(
        chalk.red(`  ${delta}`) + chalk.gray(` from ${options.compare} (${baseResult.score}/100)`),
      );
    } else {
      console.log(chalk.gray(`  No change from ${options.compare} (${baseResult.score}/100)`));
    }
    console.log('');
    return;
  }

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (options.quiet) {
    console.log(`${result.score}/100 (${result.grade})`);
    return;
  }

  displayScore(result);

  const separator = chalk.gray('  ' + '─'.repeat(53));
  console.log(separator);

  const bin = resolveCaliber();
  const failing = result.checks
    .filter((c) => !c.passed && c.maxPoints > 0)
    .sort((a, b) => b.maxPoints - b.earnedPoints - (a.maxPoints - a.earnedPoints));

  if (result.score < 70 && failing.length > 0) {
    const topFix = failing[0];
    const pts = topFix.maxPoints - topFix.earnedPoints;
    console.log(
      chalk.gray('  Biggest gain: ') +
        chalk.yellow(`+${pts} pts`) +
        chalk.gray(` from "${topFix.name}"`) +
        (topFix.suggestion ? chalk.gray(` — ${topFix.suggestion}`) : ''),
    );
    console.log(
      chalk.gray('  Run ') +
        chalk.hex('#83D1EB')(`${bin} init`) +
        chalk.gray(' to generate or update your agent config files.'),
    );
  } else if (failing.length > 0) {
    console.log(
      chalk.green('  Looking good!') +
        chalk.gray(
          ` ${failing.length} optional improvement${failing.length === 1 ? '' : 's'} available.`,
        ),
    );
    console.log(
      chalk.gray('  Run ') +
        chalk.hex('#83D1EB')(`${bin} init`) +
        chalk.gray(' to improve, or ') +
        chalk.hex('#83D1EB')(`${bin} regenerate`) +
        chalk.gray(' to rebuild from scratch.'),
    );
  } else {
    console.log(chalk.green('  Perfect score! Your agent configs are fully optimized.'));
  }
  console.log('');
}
