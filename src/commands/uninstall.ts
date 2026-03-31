import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import confirm from '@inquirer/confirm';
import {
  removePreCommitHook,
  removeStopHook,
  removeNotificationHook,
  removeSessionStartHook,
} from '../lib/hooks.js';
import { removeLearningHooks, removeCursorLearningHooks } from '../lib/learning-hooks.js';
import { stripManagedBlocks } from '../writers/pre-commit-block.js';
import { BUILTIN_SKILL_NAMES, PLATFORM_CONFIGS } from '../lib/builtin-skills.js';
import { CALIBER_DIR } from '../constants.js';
import { CALIBER_MANAGED_PREFIX } from '../fingerprint/existing-config.js';
import { trackUninstallExecuted } from '../telemetry/events.js';
import { getConfigFilePath } from '../llm/config.js';

interface UninstallOptions {
  force?: boolean;
}

const MANAGED_DOC_FILES = [
  'CLAUDE.md',
  path.join('.github', 'copilot-instructions.md'),
  'AGENTS.md',
];

const SKILL_DIRS = PLATFORM_CONFIGS.map((c) => c.skillsDir);

const CURSOR_RULES_DIR = path.join('.cursor', 'rules');
const CLAUDE_RULES_DIR = path.join('.claude', 'rules');

function removeCaliberManagedFiles(dir: string, extension: string): string[] {
  const removed: string[] = [];
  if (!fs.existsSync(dir)) return removed;
  for (const file of fs.readdirSync(dir)) {
    if (file.startsWith(CALIBER_MANAGED_PREFIX) && file.endsWith(extension)) {
      const fullPath = path.join(dir, file);
      fs.unlinkSync(fullPath);
      removed.push(fullPath);
    }
  }
  return removed;
}

function removeBuiltinSkills(): string[] {
  const removed: string[] = [];
  for (const skillsDir of SKILL_DIRS) {
    if (!fs.existsSync(skillsDir)) continue;
    for (const name of BUILTIN_SKILL_NAMES) {
      const skillDir = path.join(skillsDir, name);
      if (fs.existsSync(skillDir)) {
        fs.rmSync(skillDir, { recursive: true });
        removed.push(skillDir);
      }
    }
  }
  return removed;
}

function stripManagedBlocksFromFiles(): string[] {
  const modified: string[] = [];
  for (const filePath of MANAGED_DOC_FILES) {
    if (!fs.existsSync(filePath)) continue;
    const original = fs.readFileSync(filePath, 'utf-8');
    const stripped = stripManagedBlocks(original);
    if (stripped !== original) {
      const trimmed = stripped.trim();
      if (!trimmed || /^#\s*\S*$/.test(trimmed)) {
        fs.unlinkSync(filePath);
      } else {
        fs.writeFileSync(filePath, stripped);
      }
      modified.push(filePath);
    }
  }
  return modified;
}

function removeDirectory(dir: string): boolean {
  if (!fs.existsSync(dir)) return false;
  fs.rmSync(dir, { recursive: true });
  return true;
}

export async function uninstallCommand(options: UninstallOptions) {
  console.log(chalk.bold('\n  Caliber Uninstall\n'));
  console.log(chalk.dim('  This will remove all Caliber resources from this project:\n'));
  console.log(chalk.dim('    • Pre-commit hook'));
  console.log(chalk.dim('    • Session learning hooks'));
  console.log(chalk.dim('    • Managed blocks in CLAUDE.md, AGENTS.md, copilot-instructions.md'));
  console.log(chalk.dim('    • Cursor rules (caliber-*.mdc)'));
  console.log(chalk.dim('    • Built-in skills (setup-caliber, find-skills, save-learning)'));
  console.log(chalk.dim('    • CALIBER_LEARNINGS.md'));
  console.log(chalk.dim('    • .caliber/ directory (backups, cache, state)\n'));

  if (!options.force) {
    const proceed = await confirm({ message: 'Continue with uninstall?' });
    if (!proceed) {
      console.log(chalk.dim('\n  Cancelled.\n'));
      return;
    }
  }

  console.log('');
  const actions: string[] = [];

  const hookResult = removePreCommitHook();
  if (hookResult.removed) {
    console.log(`  ${chalk.red('✗')} Pre-commit hook removed`);
    actions.push('pre-commit hook');
  }

  const stopHookResult = removeStopHook();
  if (stopHookResult.removed) {
    console.log(`  ${chalk.red('✗')} Onboarding hook removed`);
    actions.push('onboarding hook');
  }

  const notificationHookResult = removeNotificationHook();
  if (notificationHookResult.removed) {
    console.log(`  ${chalk.red('✗')} Notification hook removed`);
    actions.push('notification hook');
  }

  const sessionStartResult = removeSessionStartHook();
  if (sessionStartResult.removed) {
    console.log(`  ${chalk.red('✗')} SessionStart hook removed`);
    actions.push('session-start hook');
  }

  const learnResult = removeLearningHooks();
  if (learnResult.removed) {
    console.log(`  ${chalk.red('✗')} Claude Code learning hooks removed`);
    actions.push('claude learning hooks');
  }

  const cursorLearnResult = removeCursorLearningHooks();
  if (cursorLearnResult.removed) {
    console.log(`  ${chalk.red('✗')} Cursor learning hooks removed`);
    actions.push('cursor learning hooks');
  }

  const strippedFiles = stripManagedBlocksFromFiles();
  for (const file of strippedFiles) {
    console.log(`  ${chalk.yellow('~')} ${file} — managed blocks removed`);
    actions.push(file);
  }

  const removedCursorRules = removeCaliberManagedFiles(CURSOR_RULES_DIR, '.mdc');
  for (const rule of removedCursorRules) {
    console.log(`  ${chalk.red('✗')} ${rule}`);
  }
  if (removedCursorRules.length > 0) actions.push('cursor rules');

  const removedClaudeRules = removeCaliberManagedFiles(CLAUDE_RULES_DIR, '.md');
  for (const rule of removedClaudeRules) {
    console.log(`  ${chalk.red('✗')} ${rule}`);
  }
  if (removedClaudeRules.length > 0) actions.push('claude rules');

  const removedSkills = removeBuiltinSkills();
  for (const skill of removedSkills) {
    console.log(`  ${chalk.red('✗')} ${skill}/`);
  }
  if (removedSkills.length > 0) actions.push('builtin skills');

  if (fs.existsSync('CALIBER_LEARNINGS.md')) {
    fs.unlinkSync('CALIBER_LEARNINGS.md');
    console.log(`  ${chalk.red('✗')} CALIBER_LEARNINGS.md`);
    actions.push('learnings file');
  }

  if (removeDirectory(CALIBER_DIR)) {
    console.log(`  ${chalk.red('✗')} .caliber/ directory`);
    actions.push('.caliber directory');
  }

  if (actions.length === 0) {
    console.log(chalk.dim('  Nothing to remove — Caliber is not installed in this project.\n'));
    return;
  }

  trackUninstallExecuted();

  const configPath = getConfigFilePath();
  if (fs.existsSync(configPath)) {
    console.log('');
    const removeConfig =
      options.force ||
      (await confirm({
        message: `Remove global config (~/.caliber/config.json)? This affects all projects.`,
      }));
    if (removeConfig) {
      fs.unlinkSync(configPath);
      console.log(`  ${chalk.red('✗')} ${configPath}`);
      const configDir = path.dirname(configPath);
      try {
        const remaining = fs.readdirSync(configDir);
        if (remaining.length === 0) fs.rmdirSync(configDir);
      } catch {
        /* best effort */
      }
    }
  }

  console.log(chalk.bold.green(`\n  Caliber has been removed from this project.`));
  console.log(chalk.dim('  Your code is untouched — only Caliber config files were removed.\n'));
}
