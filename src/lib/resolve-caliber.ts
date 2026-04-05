import fs from 'fs';
import { execSync } from 'child_process';

let _resolved: string | null = null;

/**
 * Resolve the absolute path to the `caliber` binary.
 * Caches the result so the lookup happens at most once per process.
 *
 * Always returns an absolute path when possible so that hook commands
 * embedded in .git/hooks/pre-commit or .claude/settings.json continue
 * to work even when the hook executor runs with a stripped $PATH
 * (e.g. Claude Code hooks use /usr/bin:/bin:/usr/sbin:/sbin on macOS).
 */
export function resolveCaliber(): string {
  if (_resolved) return _resolved;

  const whichCmd = process.platform === 'win32' ? 'where caliber' : 'which caliber';
  const whichNpxCmd = process.platform === 'win32' ? 'where npx' : 'which npx';

  // 0. Detect npx context — temp paths become stale after the npx process exits.
  //    Prefer a globally-installed caliber (stable absolute path). If not found,
  //    resolve npx to an absolute path so the hook command survives restricted $PATH.
  const isNpx = process.argv[1]?.includes('_npx') || process.env.npm_execpath?.includes('npx');
  if (isNpx) {
    // Prefer a globally-installed caliber over the ephemeral npx invocation
    try {
      const out = execSync(whichCmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
      const caliberPath = out.split('\n')[0].trim();
      if (caliberPath) {
        _resolved = caliberPath;
        return _resolved;
      }
    } catch {
      // not globally installed — fall through to npx
    }
    // Resolve npx to an absolute path so hooks don't depend on $PATH at runtime
    try {
      const out = execSync(whichNpxCmd, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      const npxPath = out.split('\n')[0].trim();
      if (npxPath) {
        _resolved = `${npxPath} --yes @rely-ai/caliber`;
        return _resolved;
      }
    } catch {
      // npx not found on PATH — fall back to bare name
    }
    _resolved = 'npx --yes @rely-ai/caliber';
    return _resolved;
  }

  // 1. Find caliber on PATH — capture the absolute path so hook commands work
  //    in restricted $PATH environments (git hooks, Claude Code hooks, CI).
  try {
    const out = execSync(whichCmd, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    const caliberPath = out.split('\n')[0].trim();
    if (caliberPath) {
      _resolved = caliberPath;
      return _resolved;
    }
  } catch {
    // not on PATH — fall through
  }

  // 2. Derive from our own process.argv[1] (the script being executed)
  //    Only accept paths that look like a caliber binary — avoids picking up
  //    test runner scripts (vitest, jest) in CI/test environments.
  const binPath = process.argv[1];
  if (binPath && /caliber/.test(binPath) && fs.existsSync(binPath)) {
    _resolved = binPath;
    return _resolved;
  }

  // 3. Last resort: bare command (may still fail in /bin/sh)
  _resolved = 'caliber';
  return _resolved;
}

/** True when the resolved binary is a multi-word npx invocation (bare or absolute path). */
export function isNpxResolution(): boolean {
  const r = resolveCaliber();
  return r === 'npx --yes @rely-ai/caliber' || r.endsWith('/npx --yes @rely-ai/caliber');
}

/** Reset cached resolution — only for tests. */
export function resetResolvedCaliber(): void {
  _resolved = null;
}

/**
 * Check whether a hook command refers to caliber, regardless of whether
 * it uses a bare `caliber` or an absolute path ending in `caliber`.
 * Matches by looking for the caliber binary name + the subcommand tail.
 *
 * Example: matches both `caliber refresh --quiet` and `/usr/local/bin/caliber refresh --quiet`
 */
export function isCaliberCommand(command: string, subcommandTail: string): boolean {
  // Exact legacy match
  if (command === `caliber ${subcommandTail}`) return true;
  // Absolute-path match: ends with /caliber <tail>
  if (command.endsWith(`/caliber ${subcommandTail}`)) return true;
  // Bare npx match
  if (command === `npx --yes @rely-ai/caliber ${subcommandTail}`) return true;
  if (command === `npx @rely-ai/caliber ${subcommandTail}`) return true;
  // Absolute-path npx match: '/abs/path/npx --yes @rely-ai/caliber <tail>'
  if (command.endsWith(`/npx --yes @rely-ai/caliber ${subcommandTail}`)) return true;
  if (command.endsWith(`/npx @rely-ai/caliber ${subcommandTail}`)) return true;
  return false;
}
