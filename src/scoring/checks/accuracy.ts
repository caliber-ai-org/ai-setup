import { existsSync, statSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';
import type { Check } from '../index.js';
import {
  POINTS_REFERENCES_VALID,
  POINTS_CONFIG_DRIFT,
} from '../constants.js';
import { resolveCaliber } from '../../lib/resolve-caliber.js';
import {
  collectPrimaryConfigContent,
  validateFileReferences,
} from '../utils.js';

function validateReferences(dir: string): { valid: string[]; invalid: string[]; total: number } {
  const configContent = collectPrimaryConfigContent(dir);
  if (!configContent) return { valid: [], invalid: [], total: 0 };
  return validateFileReferences(configContent, dir);
}

/**
 * Detect config drift using git history — how many source commits
 * have happened since the last config file commit.
 */
function detectGitDrift(dir: string): {
  commitsSinceConfigUpdate: number;
  lastConfigCommit: string | null;
  isGitRepo: boolean;
} {
  try {
    // Check if we're in a git repo
    execSync('git rev-parse --git-dir', { cwd: dir, stdio: ['pipe', 'pipe', 'pipe'] });
  } catch {
    return { commitsSinceConfigUpdate: 0, lastConfigCommit: null, isGitRepo: false };
  }

  const configFiles = ['CLAUDE.md', 'AGENTS.md', '.cursorrules', '.cursor/rules'];

  // Check if any config file has been modified more recently than HEAD
  // (e.g., just written by caliber init but not yet committed)
  try {
    const headTimestamp = execSync(
      'git log -1 --format=%ct HEAD',
      { cwd: dir, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
    ).trim();
    const headTime = parseInt(headTimestamp, 10) * 1000;

    for (const file of configFiles) {
      const filePath = join(dir, file);
      if (!existsSync(filePath)) continue;
      try {
        const mtime = statSync(filePath).mtime.getTime();
        if (mtime > headTime) {
          return { commitsSinceConfigUpdate: 0, lastConfigCommit: 'uncommitted (recently modified)', isGitRepo: true };
        }
      } catch { /* skip */ }
    }
  } catch { /* skip */ }

  // Find the most recent commit that touched any config file
  let latestConfigCommitHash: string | null = null;
  for (const file of configFiles) {
    try {
      const hash = execSync(
        `git log -1 --format=%H -- "${file}"`,
        { cwd: dir, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
      ).trim();
      if (!hash) continue;

      if (!latestConfigCommitHash) {
        latestConfigCommitHash = hash;
      } else {
        try {
          // Exit code 0 means latestConfigCommitHash IS an ancestor of hash → hash is newer
          execSync(
            `git merge-base --is-ancestor ${latestConfigCommitHash} ${hash}`,
            { cwd: dir, stdio: ['pipe', 'pipe', 'pipe'] },
          );
          latestConfigCommitHash = hash;
        } catch {
          // Not an ancestor — keep the existing latestConfigCommitHash
        }
      }
    } catch {
      // File might not exist in git history, or merge-base check says it's not an ancestor
    }
  }

  if (!latestConfigCommitHash) {
    return { commitsSinceConfigUpdate: 0, lastConfigCommit: null, isGitRepo: true };
  }

  // Count commits since the last config update
  try {
    const countStr = execSync(
      `git rev-list --count ${latestConfigCommitHash}..HEAD`,
      { cwd: dir, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
    ).trim();
    const commitsSince = parseInt(countStr, 10) || 0;

    const lastDate = execSync(
      `git log -1 --format=%ci ${latestConfigCommitHash}`,
      { cwd: dir, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
    ).trim();

    return {
      commitsSinceConfigUpdate: commitsSince,
      lastConfigCommit: lastDate,
      isGitRepo: true,
    };
  } catch {
    return { commitsSinceConfigUpdate: 0, lastConfigCommit: latestConfigCommitHash, isGitRepo: true };
  }
}

export function checkAccuracy(dir: string): Check[] {
  const checks: Check[] = [];

  // 1. References valid — do paths referenced in config exist on disk?
  const refs = validateReferences(dir);
  const refRatio = refs.total > 0 ? refs.valid.length / refs.total : 0;
  const refPoints = refs.total === 0
    ? 0
    : Math.round(refRatio * POINTS_REFERENCES_VALID);

  checks.push({
    id: 'references_valid',
    name: 'References point to real files',
    category: 'accuracy',
    maxPoints: POINTS_REFERENCES_VALID,
    earnedPoints: refPoints,
    passed: refs.total === 0 ? false : refRatio >= 0.8,
    detail: refs.total === 0
      ? 'No file references found in config'
      : `${refs.valid.length}/${refs.total} references verified`,
    suggestion: refs.invalid.length > 0
      ? `These references don't exist: ${refs.invalid.slice(0, 3).join(', ')}${refs.invalid.length > 3 ? ` (+${refs.invalid.length - 3} more)` : ''}`
      : refs.total === 0
        ? 'Add file path references to make your config grounded in the project'
        : undefined,
    fix: refs.invalid.length > 0
      ? {
          action: 'fix_references',
          data: { invalid: refs.invalid.slice(0, 10), valid: refs.valid.slice(0, 10) },
          instruction: `Remove or update these non-existent paths: ${refs.invalid.slice(0, 5).join(', ')}`,
        }
      : refs.total === 0
        ? {
            action: 'add_references',
            data: { currentRefs: 0 },
            instruction: 'Add file path references (e.g., `src/index.ts`) to ground the config in the project.',
          }
        : undefined,
  });

  // 2. Config drift — has code changed since last config update? (git-based)
  const drift = detectGitDrift(dir);

  let driftPoints = POINTS_CONFIG_DRIFT;
  if (!drift.isGitRepo) {
    driftPoints = POINTS_CONFIG_DRIFT; // can't measure, don't penalize
  } else if (!drift.lastConfigCommit) {
    driftPoints = 0; // config files aren't tracked in git
  } else if (drift.commitsSinceConfigUpdate > 50) {
    driftPoints = 0;
  } else if (drift.commitsSinceConfigUpdate > 30) {
    driftPoints = Math.round(POINTS_CONFIG_DRIFT * 0.25);
  } else if (drift.commitsSinceConfigUpdate > 15) {
    driftPoints = Math.round(POINTS_CONFIG_DRIFT * 0.5);
  } else if (drift.commitsSinceConfigUpdate > 5) {
    driftPoints = Math.round(POINTS_CONFIG_DRIFT * 0.75);
  }

  checks.push({
    id: 'config_drift',
    name: 'Config freshness vs code',
    category: 'accuracy',
    maxPoints: POINTS_CONFIG_DRIFT,
    earnedPoints: driftPoints,
    passed: drift.commitsSinceConfigUpdate <= 15 || !drift.isGitRepo,
    detail: !drift.isGitRepo
      ? 'Not a git repository — skipping drift check'
      : !drift.lastConfigCommit
        ? 'Config files not tracked in git'
        : drift.commitsSinceConfigUpdate === 0
          ? 'Config is up to date with latest commits'
          : `${drift.commitsSinceConfigUpdate} commit${drift.commitsSinceConfigUpdate === 1 ? '' : 's'} since last config update`,
    suggestion: drift.commitsSinceConfigUpdate > 15
      ? `Code has had ${drift.commitsSinceConfigUpdate} commits since last config update — run \`${resolveCaliber()} refresh\` to sync`
      : undefined,
    fix: drift.commitsSinceConfigUpdate > 15
      ? {
          action: 'refresh_config',
          data: { commitsSince: drift.commitsSinceConfigUpdate, lastConfigCommit: drift.lastConfigCommit },
          instruction: `Config is ${drift.commitsSinceConfigUpdate} commits behind. Review recent changes and update config accordingly.`,
        }
      : undefined,
  });

  return checks;
}
