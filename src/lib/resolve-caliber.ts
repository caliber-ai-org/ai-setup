import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { bashPath } from '../utils/windows.js';

let _resolved: string | null = null;

const WINDOWS_EXEC_EXT = /\.(cmd|exe|bat)$/i;
const NPX_RESOLUTION_RE = /[\\/]npx(?:\.(?:cmd|exe|bat))? --yes @rely-ai\/caliber$/i;

/**
 * Pick the best executable from `where`/`which` output.
 *
 * On Windows, npm installs both an extensionless POSIX shell shim and a
 * `.cmd` shim. `where` lists the POSIX shim first, but Node cannot exec it
 * directly — only `.cmd`/`.exe`/`.bat` are spawnable on Windows.
 */
export function pickExecutable(out: string): string {
  const lines = out
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (process.platform === 'win32') {
    return lines.find((l) => WINDOWS_EXEC_EXT.test(l)) ?? lines[0] ?? '';
  }
  return lines[0] ?? '';
}

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
      const out = execSync(whichCmd, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      }).trim();
      const caliberPath = pickExecutable(out);
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
        windowsHide: true,
      }).trim();
      const npxPath = pickExecutable(out);
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
      windowsHide: true,
    }).trim();
    const caliberPath = pickExecutable(out);
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
  if (r === 'npx --yes @rely-ai/caliber') return true;
  // Match absolute paths on POSIX (/npx) and Windows (\npx, \npx.cmd, \npx.exe)
  return NPX_RESOLUTION_RE.test(r);
}

/**
 * Returns a display-friendly caliber binary name for embedding in
 * user-facing text and committed files (CLAUDE.md, skills, cursor rules).
 *
 * Unlike resolveCaliber() — which returns an absolute path so hook
 * subprocesses with stripped PATH can still find the binary — this
 * function returns just `caliber` (or `npx @rely-ai/caliber` for npx
 * users) on the assumption that the user's interactive shell has caliber
 * on PATH and that committed content will be read by teammates whose
 * absolute install paths differ.
 *
 * See audit finding F-P0-3 in
 * docs/superpowers/specs/2026-04-29-caliber-install-audit-findings.md
 */
export function displayCaliberName(): string {
  return isNpxResolution() ? 'npx @rely-ai/caliber' : 'caliber';
}

/** Reset cached resolution — only for tests. */
export function resetResolvedCaliber(): void {
  _resolved = null;
  _resolvedHookInvoker = null;
}

let _resolvedHookInvoker: string | null = null;

/**
 * Shared Windows cmd-shim bypass: given a ``caliber.cmd`` path, return
 * ``"<node>" "<.../dist/bin.js>"`` so callers can skip ``cmd.exe``.
 * Used by both the pre-commit hook (needs stdout — no VBS) and the
 * Claude/Cursor learning-hook invoker (may wrap with VBS).
 *
 * Returns null when the transformation can't apply — non-Windows, not
 * a ``.cmd``, unconventional npm layout, or ``node`` missing from PATH.
 */
export function resolveWindowsNodeBinInvocation(cmd: string): string | null {
  if (process.platform !== 'win32') return null;
  if (!/\.cmd$/i.test(cmd)) return null;

  const npmDir = path.dirname(cmd);
  const binJs = path.join(npmDir, 'node_modules', '@rely-ai', 'caliber', 'dist', 'bin.js');
  if (!fs.existsSync(binJs)) return null;

  let nodePath: string;
  try {
    const out = execSync('where node', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    }).trim();
    nodePath = pickExecutable(out);
    if (!nodePath) return null;
  } catch {
    return null;
  }

  const fwdNode = nodePath.replace(/\\/g, '/');
  const fwdBin = binJs.replace(/\\/g, '/');
  return `"${fwdNode}" "${fwdBin}"`;
}

/**
 * Make a resolved caliber invocation safe to embed in a hook command string.
 *
 * Claude Code and Cursor run hook commands through bash on Windows, which eats
 * the backslashes of `C:\Users\x\caliber.exe` (bun/pnpm/scoop installs).
 * Convert to forward slashes and quote when the path contains whitespace.
 * POSIX is returned unchanged.
 */
export function toHookPath(bin: string): string {
  if (process.platform !== 'win32') return bin;
  const npx = bin.match(/^(.*?)( --yes @rely-ai\/caliber)$/);
  const exe = bashPath(npx ? npx[1] : bin);
  const quoted = /\s/.test(exe) ? `"${exe}"` : exe;
  return npx ? quoted + npx[2] : quoted;
}

function isWscriptAvailable(): boolean {
  try {
    const out = execSync('where wscript', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    }).trim();
    return Boolean(pickExecutable(out));
  } catch {
    return false;
  }
}

/**
 * Return the command prefix to embed in fire-and-forget hook command
 * strings (Claude settings.json / Cursor hooks.json learning hooks).
 *
 * On Windows: bypass the ``.cmd`` shim via ``resolveWindowsNodeBinInvocation``,
 * then optionally wrap with ``wscript`` + ``hook-runner.vbs`` when WSH is
 * available (hides the node.exe console flash). If VBS is present but
 * ``wscript`` is missing/blocked (Group Policy / AV), fall back to the
 * node-direct form rather than a hard hook failure.
 *
 * Do **not** use the VBS wrapper for hooks that need stdout (pre-commit,
 * SessionEnd refresh) — use ``resolveWindowsNodeBinInvocation`` directly.
 */
export function resolveCaliberHookInvoker(): string {
  if (_resolvedHookInvoker) return _resolvedHookInvoker;

  const base = resolveCaliber();
  const nodeDirect = resolveWindowsNodeBinInvocation(base);
  if (!nodeDirect) {
    _resolvedHookInvoker = toHookPath(base);
    return _resolvedHookInvoker;
  }

  // Parse `"node" "bin.js"` back to paths for optional VBS wrapping.
  const match = nodeDirect.match(/^"([^"]+)" "([^"]+)"$/);
  if (!match) {
    _resolvedHookInvoker = nodeDirect;
    return _resolvedHookInvoker;
  }
  const [, fwdNode, fwdBin] = match;
  // hook-runner.vbs is co-located with bin.js in dist/
  const vbsPath = fwdBin.replace(/bin\.js$/i, 'hook-runner.vbs');
  if (fs.existsSync(vbsPath) && isWscriptAvailable()) {
    const fwdVbs = vbsPath.replace(/\\/g, '/');
    _resolvedHookInvoker = `wscript //nologo "${fwdVbs}" "${fwdNode}" "${fwdBin}"`;
    return _resolvedHookInvoker;
  }

  _resolvedHookInvoker = nodeDirect;
  return _resolvedHookInvoker;
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
  // Absolute-path match for Windows ``.cmd`` shim or ``.exe`` (bun): ends with
  // /caliber.cmd|.exe <tail> (case-insensitive suffix)
  if (/[\\/]caliber\.(cmd|exe)"? /i.test(command) && command.endsWith(` ${subcommandTail}`)) {
    return true;
  }
  // Bare npx match
  if (command === `npx --yes @rely-ai/caliber ${subcommandTail}`) return true;
  if (command === `npx @rely-ai/caliber ${subcommandTail}`) return true;
  // Absolute-path npx match: '/abs/path/npx --yes @rely-ai/caliber <tail>'
  if (command.endsWith(`/npx --yes @rely-ai/caliber ${subcommandTail}`)) return true;
  if (command.endsWith(`/npx @rely-ai/caliber ${subcommandTail}`)) return true;
  // Node-direct invocation match: '"<node>" "<...caliber/dist/bin.js>" <tail>'
  // — the Windows cmd-shim bypass. Matches the quoted bin.js suffix +
  // whitespace + tail; node prefix is variable across hosts so we don't
  // pin it. Accepts both forward and back slashes inside the quotes
  // because pre-commit shells store forward, claude.json stores either.
  // ALSO matches the wscript-wrapped form
  // 'wscript //nologo "<vbs>" "<node>" "<bin.js>" <tail>' because the
  // bin.js suffix is identical — anything before it is wrapper noise
  // that doesn't change the caliber identity of the command.
  if (
    /[\\/]@rely-ai[\\/]caliber[\\/]dist[\\/]bin\.js"? /i.test(command) &&
    command.endsWith(` ${subcommandTail}`)
  ) {
    return true;
  }
  return false;
}
