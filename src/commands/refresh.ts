import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { isGitRepo } from '../fingerprint/git.js';
import { collectDiff, scopeDiffToDir, type DiffResult } from '../lib/git-diff.js';
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
import { discoverConfigDirs } from '../lib/config-discovery.js';

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

function detectSyncedAgents(writtenFiles: string[]): string[] {
  const agents: string[] = [];
  const joined = writtenFiles.join(' ');
  if (joined.includes('CLAUDE.md') || joined.includes('.claude/')) agents.push('Claude Code');
  if (joined.includes('.cursor/') || joined.includes('.cursorrules')) agents.push('Cursor');
  if (joined.includes('copilot-instructions') || joined.includes('.github/instructions/'))
    agents.push('Copilot');
  if (joined.includes('AGENTS.md') || joined.includes('.agents/')) agents.push('Codex');
  return agents;
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

export function collectFilesToWrite(
  updatedDocs: Record<string, unknown>,
  dir: string = '.',
): string[] {
  const files: string[] = [];
  const p = (relPath: string): string => (dir === '.' ? relPath : path.join(dir, relPath));
  if (updatedDocs.agentsMd) files.push(p('AGENTS.md'));
  if (updatedDocs.claudeMd) files.push(p('CLAUDE.md'));
  if (updatedDocs.readmeMd) files.push(p('README.md'));
  if (updatedDocs.cursorrules) files.push(p('.cursorrules'));
  if (Array.isArray(updatedDocs.cursorRules)) {
    for (const r of updatedDocs.cursorRules as Array<{ filename: string }>)
      files.push(p(`.cursor/rules/${r.filename}`));
  }
  if (updatedDocs.copilotInstructions) files.push(p('.github/copilot-instructions.md'));
  if (Array.isArray(updatedDocs.copilotInstructionFiles)) {
    for (const f of updatedDocs.copilotInstructionFiles as Array<{ filename: string }>)
      files.push(p(`.github/instructions/${f.filename}`));
  }
  return files;
}

const REFRESH_COOLDOWN_MS = 30_000;

async function refreshDir(
  repoDir: string,
  dir: string,
  diff: DiffResult,
  options: RefreshOptions & { label?: string },
): Promise<{ written: string[] }> {
  const quiet = !!options.quiet;
  const prefix = options.label ? `${chalk.bold(options.label)} ` : '';
  const absDir = dir === '.' ? repoDir : path.resolve(repoDir, dir);
  const scope = dir === '.' ? undefined : dir;

  const spinner = quiet ? null : ora(`${prefix}Analyzing changes...`).start();

  const learnedSection = readLearnedSection();
  const fingerprint = await collectFingerprint(absDir);
  const existingDocs = fingerprint.existingConfigs;
  const projectContext = {
    languages: fingerprint.languages,
    frameworks: fingerprint.frameworks,
    packageName: fingerprint.packageName,
    fileTree: fingerprint.fileTree,
  };

  const workspaces = getDetectedWorkspaces(absDir);
  const sources = resolveAllSources(absDir, [], workspaces);

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
      scope,
    );
  } catch (firstErr) {
    const isTransient =
      firstErr instanceof Error &&
      TRANSIENT_ERRORS.some((e) => firstErr.message.toLowerCase().includes(e.toLowerCase()));
    if (!isTransient) throw firstErr;
    // Retry once — refresh runs from hooks, silent failure means stale docs
    try {
      response = await refreshDocs(
        diffPayload,
        existingDocs,
        projectContext,
        learnedSection,
        sourcesPayload,
        scope,
      );
    } catch {
      spinner?.fail(`${prefix}Refresh failed after retry`);
      throw firstErr;
    }
  }

  if (!response.docsUpdated || response.docsUpdated.length === 0) {
    spinner?.succeed(`${prefix}No doc updates needed`);
    return { written: [] };
  }

  if (options.dryRun) {
    spinner?.info(`${prefix}Dry run — would update:`);
    for (const doc of response.docsUpdated) {
      console.log(`  ${chalk.yellow('~')} ${doc}`);
    }
    if (response.changesSummary) {
      console.log(chalk.dim(`\n  ${response.changesSummary}`));
    }
    return { written: [] };
  }

  const allFilesToWrite = collectFilesToWrite(response.updatedDocs, dir);
  const preRefreshContents = new Map<string, string | null>();
  for (const filePath of allFilesToWrite) {
    const fullPath = path.resolve(repoDir, filePath);
    try {
      preRefreshContents.set(filePath, fs.readFileSync(fullPath, 'utf-8'));
    } catch {
      preRefreshContents.set(filePath, null);
    }
  }

  // Quality gate: skip for subdirectories — infra checks (hooks, permissions)
  // only exist at root and would produce artificially low scores.
  const state = readState();
  const targetAgent = state?.targetAgent ?? detectTargetAgent(repoDir);
  const runQualityGate = dir === '.';
  const preScore = runQualityGate ? computeLocalScore(absDir, targetAgent) : null;

  const written = writeRefreshDocs(response.updatedDocs, dir);
  const trigger = quiet ? ('hook' as const) : ('manual' as const);
  trackRefreshCompleted(written.length, Date.now(), trigger);

  if (runQualityGate && preScore) {
    const postScore = computeLocalScore(absDir, targetAgent);
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
      return { written: [] };
    }
    recordScore(postScore, 'refresh');
  }

  spinner?.succeed(`${prefix}Updated ${written.length} doc${written.length === 1 ? '' : 's'}`);

  const fileChangesMap = new Map(
    (response.fileChanges || []).map((fc: { file: string; description: string }) => [
      fc.file,
      fc.description,
    ]),
  );

  for (const file of written) {
    const desc = fileChangesMap.get(file);
    const suffix = desc ? chalk.dim(` — ${desc}`) : '';
    log(quiet, `  ${chalk.green('✓')} ${file}${suffix}`);
  }

  const agents = detectSyncedAgents(written);
  if (agents.length > 1) {
    log(quiet, chalk.cyan(`\n  ${agents.length} agent formats in sync (${agents.join(', ')})`));
  }

  if (response.changesSummary) {
    log(quiet, chalk.dim(`\n  ${response.changesSummary}`));
  }

  return { written };
}

async function refreshSingleRepo(
  repoDir: string,
  options: RefreshOptions & { label?: string },
): Promise<void> {
  const quiet = !!options.quiet;
  const prefix = options.label ? `${chalk.bold(options.label)} ` : '';

  const state = readState();
  const lastSha = state?.lastRefreshSha ?? null;
  const currentSha = getCurrentHeadSha();

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

  const configDirs = discoverConfigDirs(repoDir);

  if (configDirs.length <= 1) {
    await refreshDir(repoDir, '.', diff, options);
  } else {
    log(quiet, chalk.dim(`${prefix}Found configs in ${configDirs.length} directories\n`));
    let hadFailure = false;
    for (const dir of configDirs) {
      const scopedDiff = scopeDiffToDir(diff, dir, configDirs);
      if (!scopedDiff.hasChanges) continue;
      const dirLabel = dir === '.' ? 'root' : dir;
      try {
        await refreshDir(repoDir, dir, scopedDiff, { ...options, label: dirLabel });
      } catch (err) {
        hadFailure = true;
        log(
          quiet,
          chalk.yellow(
            `  ${dirLabel}: refresh failed — ${err instanceof Error ? err.message : 'unknown error'}`,
          ),
        );
      }
    }
    if (hadFailure) {
      // Don't update state SHA — failed dirs need to be retried on next run
      return;
    }
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
