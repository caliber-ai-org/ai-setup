import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { isGitRepo } from '../fingerprint/git.js';
import { collectDiff } from '../lib/git-diff.js';
import { readState, writeState, getCurrentHeadSha } from '../lib/state.js';
import { writeRefreshDocs } from '../writers/refresh.js';
import { collectFingerprint } from '../fingerprint/index.js';
import { refreshDocs } from '../ai/refresh.js';
import { readLearnedSection } from '../learner/writer.js';
import { loadConfig } from '../llm/config.js';
import { validateModel, TRANSIENT_ERRORS } from '../llm/index.js';
import { trackRefreshCompleted } from '../telemetry/events.js';
import { resolveCaliber } from '../lib/resolve-caliber.js';
import { resolveAllSources } from '../fingerprint/sources.js';
import { getDetectedWorkspaces } from '../fingerprint/cache.js';
import { ensureBuiltinSkills } from '../lib/builtin-skills.js';
import { computeLocalScore, detectTargetAgent } from '../scoring/index.js';
import { recordScore } from '../scoring/history.js';
import { CALIBER_DIR, REFRESH_LAST_ERROR_FILE } from '../constants.js';

function writeRefreshError(error: unknown): void {
  try {
    if (!fs.existsSync(CALIBER_DIR)) fs.mkdirSync(CALIBER_DIR, { recursive: true });
    fs.writeFileSync(
      REFRESH_LAST_ERROR_FILE,
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          cwd: process.cwd(),
          nodeVersion: process.version,
        },
        null,
        2,
      ),
    );
  } catch {
    // best-effort — don't let crash logging crash
  }
}

function readRefreshError(): { timestamp: string; error: string } | null {
  try {
    if (!fs.existsSync(REFRESH_LAST_ERROR_FILE)) return null;
    return JSON.parse(fs.readFileSync(REFRESH_LAST_ERROR_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

function clearRefreshError(): void {
  try {
    if (fs.existsSync(REFRESH_LAST_ERROR_FILE)) fs.unlinkSync(REFRESH_LAST_ERROR_FILE);
  } catch {
    // best-effort
  }
}

interface RefreshOptions {
  quiet?: boolean;
  dryRun?: boolean;
}

function log(quiet: boolean, ...args: unknown[]) {
  if (!quiet) console.log(...args);
}

function discoverGitRepos(parentDir: string): string[] {
  const repos: string[] = [];
  try {
    const entries = fs.readdirSync(parentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      const childPath = path.join(parentDir, entry.name);
      if (fs.existsSync(path.join(childPath, '.git'))) {
        repos.push(childPath);
      }
    }
  } catch {
    // can't read directory
  }
  return repos.sort();
}

export function collectFilesToWrite(updatedDocs: Record<string, unknown>): string[] {
  const files: string[] = [];
  if (updatedDocs.agentsMd) files.push('AGENTS.md');
  if (updatedDocs.claudeMd) files.push('CLAUDE.md');
  if (updatedDocs.readmeMd) files.push('README.md');
  if (updatedDocs.cursorrules) files.push('.cursorrules');
  if (Array.isArray(updatedDocs.cursorRules)) {
    for (const r of updatedDocs.cursorRules as Array<{ filename: string }>)
      files.push(`.cursor/rules/${r.filename}`);
  }
  if (updatedDocs.copilotInstructions) files.push('.github/copilot-instructions.md');
  if (Array.isArray(updatedDocs.copilotInstructionFiles)) {
    for (const f of updatedDocs.copilotInstructionFiles as Array<{ filename: string }>)
      files.push(`.github/instructions/${f.filename}`);
  }
  return files;
}

const REFRESH_COOLDOWN_MS = 30_000;

async function refreshSingleRepo(
  repoDir: string,
  options: RefreshOptions & { label?: string },
): Promise<void> {
  const quiet = !!options.quiet;
  const prefix = options.label ? `${chalk.bold(options.label)} ` : '';

  const state = readState();
  const lastSha = state?.lastRefreshSha ?? null;
  const currentSha = getCurrentHeadSha();

  // Rate-limit: skip if last refresh was within cooldown AND HEAD hasn't changed
  if (state?.lastRefreshTimestamp && lastSha && currentSha === lastSha) {
    const elapsed = Date.now() - new Date(state.lastRefreshTimestamp).getTime();
    if (elapsed < REFRESH_COOLDOWN_MS && elapsed > 0) {
      log(
        quiet,
        chalk.dim(`${prefix}Skipped — last refresh was ${Math.round(elapsed / 1000)}s ago.`),
      );
      return;
    }
  }

  const diff = collectDiff(lastSha);

  if (!diff.hasChanges) {
    if (currentSha) {
      writeState({ lastRefreshSha: currentSha, lastRefreshTimestamp: new Date().toISOString() });
    }
    log(quiet, chalk.dim(`${prefix}No changes since last refresh.`));
    return;
  }

  const spinner = quiet ? null : ora(`${prefix}Analyzing changes...`).start();

  const learnedSection = readLearnedSection();
  const fingerprint = await collectFingerprint(repoDir);
  const existingDocs = fingerprint.existingConfigs;
  const projectContext = {
    languages: fingerprint.languages,
    frameworks: fingerprint.frameworks,
    packageName: fingerprint.packageName,
    fileTree: fingerprint.fileTree,
  };

  // Resolve sources for context
  const workspaces = getDetectedWorkspaces(repoDir);
  const sources = resolveAllSources(repoDir, [], workspaces);

  const diffPayload = {
    committed: diff.committedDiff,
    staged: diff.stagedDiff,
    unstaged: diff.unstagedDiff,
    changedFiles: diff.changedFiles,
    summary: diff.summary,
  };
  const sourcesPayload = sources.length > 0 ? sources : undefined;

  let response;
  try {
    response = await refreshDocs(
      diffPayload,
      existingDocs,
      projectContext,
      learnedSection,
      sourcesPayload,
    );
  } catch (firstErr) {
    const isTransient =
      firstErr instanceof Error &&
      TRANSIENT_ERRORS.some((e) => firstErr.message.toLowerCase().includes(e.toLowerCase()));
    if (!isTransient) throw firstErr;
    // Retry once on transient LLM failure — refresh runs from hooks, silent failure means stale docs
    try {
      response = await refreshDocs(
        diffPayload,
        existingDocs,
        projectContext,
        learnedSection,
        sourcesPayload,
      );
    } catch {
      spinner?.fail(`${prefix}Refresh failed after retry`);
      throw firstErr;
    }
  }

  if (!response.docsUpdated || response.docsUpdated.length === 0) {
    spinner?.succeed(`${prefix}No doc updates needed`);
    if (currentSha) {
      writeState({ lastRefreshSha: currentSha, lastRefreshTimestamp: new Date().toISOString() });
    }
    return;
  }

  if (options.dryRun) {
    spinner?.info(`${prefix}Dry run — would update:`);
    for (const doc of response.docsUpdated) {
      console.log(`  ${chalk.yellow('~')} ${doc}`);
    }
    if (response.changesSummary) {
      console.log(chalk.dim(`\n  ${response.changesSummary}`));
    }
    return;
  }

  // Quality gate: snapshot pre-refresh score
  const targetAgent = state?.targetAgent ?? detectTargetAgent(repoDir);
  const preScore = computeLocalScore(repoDir, targetAgent);

  // Snapshot ALL files that writeRefreshDocs will touch (not just docsUpdated)
  // so the revert covers skill files the LLM didn't enumerate
  const allFilesToWrite = collectFilesToWrite(response.updatedDocs);
  const preRefreshContents = new Map<string, string | null>();
  for (const filePath of allFilesToWrite) {
    const fullPath = path.resolve(repoDir, filePath);
    try {
      preRefreshContents.set(filePath, fs.readFileSync(fullPath, 'utf-8'));
    } catch {
      preRefreshContents.set(filePath, null);
    }
  }

  const written = writeRefreshDocs(response.updatedDocs);
  const trigger = quiet ? ('hook' as const) : ('manual' as const);
  trackRefreshCompleted(written.length, Date.now(), trigger);

  // Quality gate: check for score regression
  const postScore = computeLocalScore(repoDir, targetAgent);
  if (postScore.score < preScore.score) {
    for (const [filePath, content] of preRefreshContents) {
      const fullPath = path.resolve(repoDir, filePath);
      if (content === null) {
        try {
          fs.unlinkSync(fullPath);
        } catch {
          /* file may not exist */
        }
      } else {
        fs.writeFileSync(fullPath, content);
      }
    }
    spinner?.warn(
      `${prefix}Refresh reverted — score would drop from ${preScore.score} to ${postScore.score}`,
    );
    log(quiet, chalk.dim(`  Config quality gate prevented a regression. No files were changed.`));
    if (currentSha) {
      writeState({ lastRefreshSha: currentSha, lastRefreshTimestamp: new Date().toISOString() });
    }
    return;
  }

  recordScore(postScore, 'refresh');
  spinner?.succeed(`${prefix}Updated ${written.length} doc${written.length === 1 ? '' : 's'}`);

  for (const file of written) {
    log(quiet, `  ${chalk.green('✓')} ${file}`);
  }

  if (response.changesSummary) {
    log(quiet, chalk.dim(`\n  ${response.changesSummary}`));
  }

  const builtinWritten = ensureBuiltinSkills();
  for (const file of builtinWritten) {
    log(quiet, `  ${chalk.green('✓')} ${file} ${chalk.dim('(built-in)')}`);
  }

  clearRefreshError();
  if (currentSha) {
    writeState({ lastRefreshSha: currentSha, lastRefreshTimestamp: new Date().toISOString() });
  }
}

export async function refreshCommand(options: RefreshOptions) {
  const quiet = !!options.quiet;

  // Skip if another caliber process is already running (e.g. hook fired mid-session)
  if (quiet) {
    const { isCaliberRunning } = await import('../lib/lock.js');
    if (isCaliberRunning()) return;
  }

  // Show last refresh error if running interactively
  if (!quiet) {
    const lastError = readRefreshError();
    if (lastError) {
      console.log(chalk.yellow(`\n  ⚠  Last refresh failed (${lastError.timestamp}):`));
      console.log(chalk.dim(`     ${lastError.error}`));
      console.log(
        chalk.dim(
          `     Run with --debug for full details, or report at https://github.com/caliber-ai-org/ai-setup/issues\n`,
        ),
      );
      clearRefreshError();
    }
  }

  try {
    const config = loadConfig();
    if (!config) {
      if (quiet) return;
      console.log(
        chalk.red('No LLM provider configured. Run ') +
          chalk.hex('#83D1EB')(`${resolveCaliber()} config`) +
          chalk.red(' (e.g. choose Cursor) or set an API key.'),
      );
      throw new Error('__exit__');
    }

    // Verify configured model is reachable before starting heavy work
    await validateModel({ fast: true });

    if (isGitRepo()) {
      await refreshSingleRepo(process.cwd(), options);
      return;
    }

    const repos = discoverGitRepos(process.cwd());
    if (repos.length === 0) {
      if (quiet) return;
      console.log(
        chalk.red('Not inside a git repository and no git repos found in child directories.'),
      );
      throw new Error('__exit__');
    }

    log(quiet, chalk.dim(`Found ${repos.length} git repo${repos.length === 1 ? '' : 's'}\n`));

    const originalDir = process.cwd();
    for (const repo of repos) {
      const repoName = path.basename(repo);
      try {
        process.chdir(repo);
        await refreshSingleRepo(repo, { ...options, label: repoName });
      } catch (err) {
        if (err instanceof Error && err.message === '__exit__') continue;
        writeRefreshError(err);
        log(
          quiet,
          chalk.yellow(
            `${repoName}: refresh failed — ${err instanceof Error ? err.message : 'unknown error'}`,
          ),
        );
      }
    }
    process.chdir(originalDir);
  } catch (err) {
    if (err instanceof Error && err.message === '__exit__') throw err;
    writeRefreshError(err);
    if (quiet) return;
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.log(chalk.red(`Refresh failed: ${msg}`));
    throw new Error('__exit__');
  }
}
