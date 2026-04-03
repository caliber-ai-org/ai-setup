import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

let _resolved: string | null = null;

/**
 * Resolve the absolute path to the `caliber` binary.
 * Caches the result so the lookup happens at most once per process.
 */
export function resolveCaliber(): string {
  if (_resolved) return _resolved;

  // 0. Detect npx context — temp paths become stale after the npx process exits,
  //    so use `npx --yes @rely-ai/caliber` which always resolves correctly.
  const isNpx = process.argv[1]?.includes('_npx') || process.env.npm_execpath?.includes('npx');
  if (isNpx) {
    _resolved = 'npx --yes @rely-ai/caliber';
    return _resolved;
  }

  // 1. Try to find caliber on PATH — use bare command to stay portable
  try {
    const whichCmd = process.platform === 'win32' ? 'where caliber' : 'which caliber';
    execSync(whichCmd, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    _resolved = 'caliber';
    return _resolved;
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

/** True when the resolved binary is a multi-word npx invocation. */
export function isNpxResolution(): boolean {
  return resolveCaliber().startsWith('npx ');
}

/**
 * Resolve caliber as a [binary, scriptPath] tuple suitable for child_process.spawn()
 * without `shell: true`. On Windows this avoids .cmd shim issues (ENOENT) and
 * prevents a visible cmd.exe window from opening for detached child processes.
 *
 * Returns `[process.execPath, scriptPath]` when running from a known script,
 * or `null` when resolution isn't possible (caller should fall back to shell spawn).
 */
export function resolveCaliberForSpawn(): [string, string] | null {
  // If we're running from a node script, we know process.argv[1] is the entry point
  const scriptPath = process.argv[1];
  if (scriptPath && /caliber/.test(scriptPath) && fs.existsSync(scriptPath)) {
    return [process.execPath, scriptPath];
  }

  // Try to find the script via the npm global shim on Windows
  if (process.platform === 'win32') {
    try {
      const shimPath = execSync('where caliber', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      })
        .trim()
        .split(/\r?\n/)[0];
      // The shim sits next to node_modules/@rely-ai/caliber/dist/bin.js
      const shimDir = path.dirname(shimPath);
      const entryScript = path.join(
        shimDir,
        'node_modules',
        '@rely-ai',
        'caliber',
        'dist',
        'bin.js',
      );
      if (fs.existsSync(entryScript)) {
        return [process.execPath, entryScript];
      }
    } catch {
      // fall through
    }
  }

  return null;
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
  // npx match: `npx --yes @rely-ai/caliber <tail>` or `npx @rely-ai/caliber <tail>`
  if (command === `npx --yes @rely-ai/caliber ${subcommandTail}`) return true;
  if (command === `npx @rely-ai/caliber ${subcommandTail}`) return true;
  return false;
}
