import { existsSync, statSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';
import type { Check } from '../index.js';
import { resolveCaliber } from '../../lib/resolve-caliber.js';
import {
  POINTS_FRESHNESS,
  POINTS_NO_SECRETS,
  POINTS_PERMISSIONS,
  FRESHNESS_COMMIT_THRESHOLDS,
  SECRET_PATTERNS,
  SECRET_PLACEHOLDER_PATTERNS,
} from '../constants.js';
import { readFileOrNull } from '../utils.js';

/**
 * Get the number of commits since the config file was last modified.
 * Uses git history, but if the file's mtime is more recent than HEAD
 * (e.g., just written by caliber init but not yet committed), treats it as fresh.
 */
function getCommitsSinceConfigUpdate(dir: string): number | null {
  const configFiles = ['CLAUDE.md', 'AGENTS.md', '.cursorrules'];

  // Check if any config file has been modified more recently than HEAD
  // (indicates caliber init just wrote it but hasn't committed yet)
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
          return 0; // file is newer than HEAD — just written, treat as fresh
        }
      } catch { /* skip */ }
    }
  } catch { /* not in git */ }

  for (const file of configFiles) {
    try {
      const hash = execSync(
        `git log -1 --format=%H -- "${file}"`,
        { cwd: dir, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
      ).trim();

      if (hash) {
        const countStr = execSync(
          `git rev-list --count ${hash}..HEAD`,
          { cwd: dir, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
        ).trim();
        return parseInt(countStr, 10) || 0;
      }
    } catch { /* not tracked or not in git */ }
  }

  return null;
}

export function checkFreshness(dir: string): Check[] {
  const checks: Check[] = [];

  // 1. Instructions file freshness (git-based)
  const commitsSince = getCommitsSinceConfigUpdate(dir);
  let freshnessPoints = 0;
  let freshnessDetail = '';

  if (commitsSince === null) {
    freshnessDetail = 'Config files not tracked in git';
    freshnessPoints = 0;
  } else {
    const threshold = FRESHNESS_COMMIT_THRESHOLDS.find(t => commitsSince <= t.maxCommits);
    freshnessPoints = threshold ? threshold.points : 0;
    freshnessDetail = commitsSince === 0
      ? 'Config updated in the latest commit'
      : `${commitsSince} commit${commitsSince === 1 ? '' : 's'} since last config update`;
  }

  checks.push({
    id: 'claude_md_freshness',
    name: 'Config freshness',
    category: 'freshness',
    maxPoints: POINTS_FRESHNESS,
    earnedPoints: freshnessPoints,
    passed: freshnessPoints >= 3,
    detail: freshnessDetail,
    suggestion: commitsSince !== null && freshnessPoints < 3
      ? `Config is ${commitsSince} commits behind — run \`${resolveCaliber()} refresh\` to update it`
      : undefined,
    fix: commitsSince !== null && freshnessPoints < 3
      ? {
          action: 'refresh_config',
          data: { commitsSince },
          instruction: `Config is ${commitsSince} commits behind. Update it to reflect recent changes.`,
        }
      : undefined,
  });

  // 2. No secrets in config files
  const filesToScan = [
    'CLAUDE.md', 'AGENTS.md', '.cursorrules',
    '.claude/settings.json', '.claude/settings.local.json',
    '.mcp.json', '.cursor/mcp.json',
  ];

  const secretFindings: Array<{ file: string; line: number }> = [];

  for (const rel of filesToScan) {
    const content = readFileOrNull(join(dir, rel));
    if (!content) continue;

    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      for (const pattern of SECRET_PATTERNS) {
        if (pattern.test(lines[i])) {
          // Check if this looks like a placeholder, not a real secret
          const isPlaceholder = SECRET_PLACEHOLDER_PATTERNS.some(p => p.test(lines[i]));
          if (!isPlaceholder) {
            secretFindings.push({ file: rel, line: i + 1 });
          }
          break;
        }
      }
    }
  }

  const hasSecrets = secretFindings.length > 0;
  checks.push({
    id: 'no_secrets',
    name: 'No secrets in config files',
    category: 'freshness',
    earnedPoints: hasSecrets ? -POINTS_NO_SECRETS : POINTS_NO_SECRETS,
    maxPoints: POINTS_NO_SECRETS,
    passed: !hasSecrets,
    detail: hasSecrets
      ? `${secretFindings.length} potential secret${secretFindings.length === 1 ? '' : 's'} found in ${secretFindings[0].file}:${secretFindings[0].line}`
      : 'No secrets detected',
    suggestion: hasSecrets
      ? `Remove secrets from ${secretFindings[0].file}:${secretFindings[0].line} — use environment variables instead`
      : undefined,
    fix: hasSecrets
      ? {
          action: 'remove_secrets',
          data: { findings: secretFindings.slice(0, 5) },
          instruction: `Remove credentials from ${secretFindings[0].file}:${secretFindings[0].line}. Use environment variable references instead.`,
        }
      : undefined,
  });

  // 3. Settings permissions configured
  const settingsPath = join(dir, '.claude', 'settings.json');
  let hasPermissions = false;
  let permissionDetail = '';

  const settingsContent = readFileOrNull(settingsPath);
  if (settingsContent) {
    try {
      const settings = JSON.parse(settingsContent) as Record<string, unknown>;
      const permissions = settings.permissions as Record<string, unknown> | undefined;
      const allowList = permissions?.allow as unknown[] | undefined;
      hasPermissions = Array.isArray(allowList) && allowList.length > 0;
      permissionDetail = hasPermissions
        ? `${allowList!.length} permission${allowList!.length === 1 ? '' : 's'} configured`
        : 'permissions.allow is empty or missing';
    } catch {
      permissionDetail = 'settings.json is not valid JSON';
    }
  } else {
    permissionDetail = 'No .claude/settings.json';
  }

  checks.push({
    id: 'permissions_configured',
    name: 'Permissions configured',
    category: 'freshness',
    maxPoints: POINTS_PERMISSIONS,
    earnedPoints: hasPermissions ? POINTS_PERMISSIONS : 0,
    passed: hasPermissions,
    detail: permissionDetail,
    suggestion: hasPermissions
      ? undefined
      : 'Permissions control which shell commands the agent can run without asking. Adds a safety layer for your team',
    fix: hasPermissions
      ? undefined
      : {
          action: 'add_permissions',
          data: {},
          instruction: 'Add a permissions.allow list to .claude/settings.json with commonly used commands.',
        },
  });

  return checks;
}
