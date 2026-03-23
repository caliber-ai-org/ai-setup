import chalk from 'chalk';
import type { ScoreResult, Check, CheckCategory } from './index.js';

const AGENT_DISPLAY_NAMES: Record<string, string> = {
  claude: 'Claude Code',
  cursor: 'Cursor',
  codex: 'Codex',
};

const CATEGORY_LABELS: Record<CheckCategory, { icon: string; label: string }> = {
  existence: { icon: '📁', label: 'FILES & CONFIG' },
  quality: { icon: '⚡', label: 'QUALITY' },
  grounding: { icon: '🎯', label: 'GROUNDING' },
  accuracy: { icon: '🔍', label: 'ACCURACY' },
  freshness: { icon: '🛡️', label: 'FRESHNESS & SAFETY' },
  bonus: { icon: '⭐', label: 'BONUS' },
};

const CATEGORY_ORDER: CheckCategory[] = ['existence', 'quality', 'grounding', 'accuracy', 'freshness', 'bonus'];

function gradeColor(grade: string): (text: string) => string {
  switch (grade) {
    case 'A': return chalk.green;
    case 'B': return chalk.greenBright;
    case 'C': return chalk.yellow;
    case 'D': return chalk.hex('#f97316');
    case 'F': return chalk.red;
    default: return chalk.white;
  }
}

const GRADIENT_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e'];

function progressBar(score: number, max: number, width = 40): string {
  const filled = Math.round((score / max) * width);
  const empty = width - filled;
  let bar = '';
  for (let i = 0; i < filled; i++) {
    const position = i / (width - 1);
    const colorIndex = Math.min(
      GRADIENT_COLORS.length - 1,
      Math.floor(position * GRADIENT_COLORS.length),
    );
    bar += chalk.hex(GRADIENT_COLORS[colorIndex])('▓');
  }
  bar += chalk.gray('░'.repeat(empty));
  return bar;
}

function formatCheck(check: Check): string {
  const isPartial = !check.passed && check.earnedPoints > 0;
  const isNegative = check.earnedPoints < 0;
  const lostPoints = check.maxPoints - check.earnedPoints;

  const icon = check.passed
    ? chalk.green('✓')
    : isPartial
      ? chalk.yellow('~')
      : isNegative
        ? chalk.red('✗')
        : chalk.gray('✗');

  let points: string;
  if (check.passed) {
    points = chalk.green(`+${check.earnedPoints}`.padStart(4));
  } else if (isNegative) {
    points = chalk.red(`${check.earnedPoints}`.padStart(4));
  } else if (isPartial) {
    points = chalk.yellow(`${check.earnedPoints}/${check.maxPoints}`.padStart(5));
  } else {
    points = chalk.gray(`0/${check.maxPoints}`.padStart(5));
  }

  const name = check.passed
    ? chalk.white(check.name)
    : isNegative
      ? chalk.red(check.name)
      : isPartial
        ? chalk.white(check.name)
        : chalk.gray(check.name);

  const detail = check.detail ? chalk.gray(` (${check.detail})`) : '';

  let suggestion = '';
  if (!check.passed && check.suggestion) {
    const suggColor = isNegative ? chalk.red : chalk.yellow;
    suggestion = suggColor(`\n       → ${check.suggestion}`);
  }

  let recovery = '';
  if (isPartial && lostPoints > 0) {
    recovery = chalk.yellow(`\n       ↑ Fix this for +${lostPoints} more points`);
  }

  return `  ${icon} ${name.padEnd(38)}${points}${detail}${suggestion}${recovery}`;
}

/**
 * Render the full score breakdown to the terminal.
 */
export function displayScore(result: ScoreResult): void {
  const gc = gradeColor(result.grade);

  const agentLabel = result.targetAgent.map(a => AGENT_DISPLAY_NAMES[a] || a).join(' + ');

  // Header
  console.log('');
  console.log(chalk.gray('  ─────────────────────────────────────────────────'));
  console.log('');
  console.log(`  ${chalk.bold('Agent Config Score')}    ${gc(chalk.bold(`${result.score} / ${result.maxScore}`))}    Grade ${gc(chalk.bold(result.grade))}`);
  console.log(`  ${progressBar(result.score, result.maxScore)}`);
  console.log(chalk.dim(`  Target: ${agentLabel}`));
  console.log('');
  console.log(chalk.gray('  ─────────────────────────────────────────────────'));
  console.log('');

  // Category sections
  for (const category of CATEGORY_ORDER) {
    const summary = result.categories[category];
    const categoryChecks = result.checks.filter((c) => c.category === category);
    const { icon, label } = CATEGORY_LABELS[category];
    const gap = summary.max - summary.earned;
    const gapLabel = gap > 0 ? chalk.yellow(` (-${gap} available)`) : '';

    console.log(
      chalk.gray(`  ${icon} ${label}`) +
      chalk.gray(' '.repeat(Math.max(1, 43 - label.length))) +
      chalk.white(`${summary.earned}`) +
      chalk.gray(` / ${summary.max}`) +
      gapLabel
    );

    for (const check of categoryChecks) {
      console.log(formatCheck(check));
    }
    console.log('');
  }

  // Top improvements
  formatTopImprovements(result.checks);
}

function formatTopImprovements(checks: readonly Check[]): void {
  const improvable = checks
    .filter(c => c.earnedPoints < c.maxPoints)
    .map(c => ({ name: c.name, potential: c.maxPoints - c.earnedPoints }))
    .sort((a, b) => b.potential - a.potential)
    .slice(0, 5);

  if (improvable.length === 0) return;

  console.log(chalk.gray('  ─ TOP IMPROVEMENTS ─────────────────────────────'));
  console.log('');

  for (let i = 0; i < improvable.length; i++) {
    const item = improvable[i];
    const num = chalk.gray(`${i + 1}.`);
    const label = chalk.white(item.name.padEnd(42));
    const pts = chalk.yellow(`+${item.potential} pts`);
    console.log(`  ${num} ${label}${pts}`);
  }

  console.log('');
}

/**
 * Render a compact score summary for init flow — score box + top failing checks.
 */
export function displayScoreSummary(result: ScoreResult): void {
  const gc = gradeColor(result.grade);

  const agentLabel = result.targetAgent.map(a => AGENT_DISPLAY_NAMES[a] || a).join(' + ');

  // Compact header
  console.log('');
  console.log(
    chalk.gray('  ') +
    gc(`${result.score}/${result.maxScore}`) +
    chalk.gray(` (Grade ${result.grade})`) +
    chalk.gray(`  ·  ${agentLabel}`) +
    chalk.gray(`  ·  ${progressBar(result.score, result.maxScore, 20)}`)
  );

  // Show failing check names (max 5)
  const failing = result.checks.filter(c => !c.passed);
  if (failing.length > 0) {
    const shown = failing.slice(0, 5);
    for (const check of shown) {
      console.log(chalk.gray(`  ✗ ${check.name}`));
    }
    const remaining = failing.length - shown.length;
    const moreText = remaining > 0 ? ` (+${remaining} more)` : '';
    console.log(chalk.dim(`\n  Run ${chalk.hex('#83D1EB')('caliber score')} for details.${moreText}`));
  }
  console.log('');
}

/**
 * Render a compact before/after comparison.
 */
export function displayScoreDelta(before: ScoreResult, after: ScoreResult): void {
  const delta = after.score - before.score;
  const deltaStr = delta >= 0 ? `+${delta}` : `${delta}`;
  const deltaColor = delta >= 0 ? chalk.green : chalk.red;
  const beforeGc = gradeColor(before.grade);
  const afterGc = gradeColor(after.grade);

  console.log('');
  console.log(chalk.gray('  ─────────────────────────────────────────────────'));
  console.log('');
  console.log(
    `  Score: ${beforeGc(`${before.score}`)} ${chalk.gray('\u2192')} ${afterGc(`${after.score}`)}` +
    `    ${deltaColor(deltaStr + ' pts')}` +
    `    ${beforeGc(before.grade)} ${chalk.gray('\u2192')} ${afterGc(after.grade)}`
  );
  console.log(`  ${progressBar(before.score, before.maxScore, 19)} ${chalk.gray('\u2192')} ${progressBar(after.score, after.maxScore, 19)}`);
  console.log('');
  console.log(chalk.gray('  ─────────────────────────────────────────────────'));
  console.log('');

  // Show what improved
  const improved = after.checks.filter((ac) => {
    const bc = before.checks.find((b) => b.id === ac.id);
    return bc && ac.earnedPoints > bc.earnedPoints;
  });

  if (improved.length > 0) {
    console.log(chalk.gray('  What improved:'));
    for (const check of improved) {
      const bc = before.checks.find((b) => b.id === check.id)!;
      const gain = check.earnedPoints - bc.earnedPoints;
      console.log(
        chalk.green('  +') +
        chalk.white(` ${check.name.padEnd(50)}`) +
        chalk.green(`+${gain}`)
      );
    }
    console.log('');
  }
}

/**
 * Render a one-line score for git hook output.
 */
export function displayScoreOneLiner(result: ScoreResult, drift?: string): void {
  const gc = gradeColor(result.grade);
  const driftMsg = drift
    ? chalk.yellow(` — ${drift}`)
    : chalk.green(' — no drift detected ✓');

  console.log(
    chalk.gray('  caliber ▸ ') +
    gc(`${result.score}/100 (${result.grade})`) +
    driftMsg
  );
}
