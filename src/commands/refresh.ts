import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { isGitRepo } from '../fingerprint/git.js';
import { readExistingConfigs } from '../fingerprint/existing-config.js';
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

const REFRESH_COOLDOWN_MS = 30_000;

async function refreshSingleRepo(repoDir: string, options: RefreshOptions & { label?: string }): Promise<void> {
  const quiet = !!options.quiet;
  const prefix = options.label ? `${chalk.bold(options.label)} ` : '';

  const state = readState();
  const lastSha = state?.lastRefreshSha ?? null;

  // Rate-limit: skip if last refresh was within cooldown period
  if (state?.lastRefreshTimestamp) {
    const elapsed = Date.now() - new Date(state.lastRefreshTimestamp).getTime();
    if (elapsed < REFRESH_COOLDOWN_MS && elapsed > 0) {
      log(quiet, chalk.dim(`${prefix}Skipped — last refresh was ${Math.round(elapsed / 1000)}s ago.`));
      return;
    }
  }

  const diff = collectDiff(lastSha);
  const currentSha = getCurrentHeadSha();

  if (!diff.hasChanges) {
    if (currentSha) {
      writeState({ lastRefreshSha: currentSha, lastRefreshTimestamp: new Date().toISOString() });
    }
    log(quiet, chalk.dim(`${prefix}No changes since last refresh.`));
    return;
  }

  const spinner = quiet ? null : ora(`${prefix}Analyzing changes...`).start();

  const existingDocs = readExistingConfigs(repoDir);
  const learnedSection = readLearnedSection();
  const fingerprint = await collectFingerprint(repoDir);
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
    response = await refreshDocs(diffPayload, existingDocs, projectContext, learnedSection, sourcesPayload);
  } catch (firstErr) {
    const isTransient = firstErr instanceof Error &&
      TRANSIENT_ERRORS.some(e => firstErr.message.toLowerCase().includes(e.toLowerCase()));
    if (!isTransient) throw firstErr;
    // Retry once on transient LLM failure — refresh runs from hooks, silent failure means stale docs
    try {
      response = await refreshDocs(diffPayload, existingDocs, projectContext, learnedSection, sourcesPayload);
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

  // Quality gate: snapshot pre-refresh score and file contents
  const targetAgent = state?.targetAgent ?? detectTargetAgent(repoDir);
  const preScore = computeLocalScore(repoDir, targetAgent);
  const filesToWrite = response.docsUpdated || [];
  const preRefreshContents = new Map<string, string | null>();
  for (const filePath of filesToWrite) {
    const fullPath = path.resolve(repoDir, filePath);
    try {
      preRefreshContents.set(filePath, fs.readFileSync(fullPath, 'utf-8'));
    } catch {
      preRefreshContents.set(filePath, null);
    }
  }

  const written = writeRefreshDocs(response.updatedDocs);
  const trigger = quiet ? 'hook' as const : 'manual' as const;
  trackRefreshCompleted(written.length, Date.now(), trigger);

  // Quality gate: check for score regression
  const postScore = computeLocalScore(repoDir, targetAgent);
  if (postScore.score < preScore.score) {
    // Revert: restore pre-refresh file contents
    for (const [filePath, content] of preRefreshContents) {
      const fullPath = path.resolve(repoDir, filePath);
      if (content === null) {
        try { fs.unlinkSync(fullPath); } catch { /* file may not exist */ }
      } else {
        fs.writeFileSync(fullPath, content);
      }
    }
    spinner?.warn(`${prefix}Refresh reverted — score would drop from ${preScore.score} to ${postScore.score}`);
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

  try {
    const config = loadConfig();
    if (!config) {
      if (quiet) return;
      console.log(chalk.red('No LLM provider configured. Run ') + chalk.hex('#83D1EB')(`${resolveCaliber()} config`) + chalk.red(' (e.g. choose Cursor) or set an API key.'));
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
      console.log(chalk.red('Not inside a git repository and no git repos found in child directories.'));
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
        log(quiet, chalk.yellow(`${repoName}: refresh failed — ${err instanceof Error ? err.message : 'unknown error'}`));
      }
    }
    process.chdir(originalDir);
  } catch (err) {
    if (err instanceof Error && err.message === '__exit__') throw err;
    if (quiet) return;
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.log(chalk.red(`Refresh failed: ${msg}`));
    throw new Error('__exit__');
  }
}
