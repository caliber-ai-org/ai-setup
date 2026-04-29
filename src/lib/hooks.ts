import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import {
  resolveCaliber,
  isCaliberCommand,
  isNpxResolution,
  pickExecutable,
} from './resolve-caliber.js';
import { bashPath } from '../utils/windows.js';

const SETTINGS_PATH = path.join('.claude', 'settings.json');
const REFRESH_TAIL = 'refresh --quiet';
const HOOK_DESCRIPTION = 'Caliber: auto-refreshing docs based on code changes';

function getHookCommand(): string {
  return `${resolveCaliber()} ${REFRESH_TAIL}`;
}

interface HookEntry {
  type: string;
  command: string;
  description?: string;
}

interface HookMatcher {
  matcher: string;
  hooks: HookEntry[];
}

interface ClaudeSettings {
  hooks?: {
    SessionEnd?: HookMatcher[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

function readSettings(): ClaudeSettings {
  if (!fs.existsSync(SETTINGS_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

function writeSettings(settings: ClaudeSettings): void {
  const dir = path.dirname(SETTINGS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
}

function findHookIndex(sessionEnd: HookMatcher[]): number {
  return sessionEnd.findIndex((entry) =>
    entry.hooks?.some((h) => isCaliberCommand(h.command, REFRESH_TAIL)),
  );
}

export function isHookInstalled(): boolean {
  const settings = readSettings();
  const sessionEnd = settings.hooks?.SessionEnd;
  if (!Array.isArray(sessionEnd)) return false;
  return findHookIndex(sessionEnd) !== -1;
}

export function installHook(): { installed: boolean; alreadyInstalled: boolean } {
  const settings = readSettings();

  if (!settings.hooks) settings.hooks = {};
  if (!Array.isArray(settings.hooks.SessionEnd)) settings.hooks.SessionEnd = [];

  if (findHookIndex(settings.hooks.SessionEnd) !== -1) {
    return { installed: false, alreadyInstalled: true };
  }

  settings.hooks.SessionEnd.push({
    matcher: '',
    hooks: [{ type: 'command', command: getHookCommand(), description: HOOK_DESCRIPTION }],
  });

  writeSettings(settings);
  return { installed: true, alreadyInstalled: false };
}

export function removeHook(): { removed: boolean; notFound: boolean } {
  const settings = readSettings();
  const sessionEnd = settings.hooks?.SessionEnd;

  if (!Array.isArray(sessionEnd)) {
    return { removed: false, notFound: true };
  }

  const idx = findHookIndex(sessionEnd);
  if (idx === -1) {
    return { removed: false, notFound: true };
  }

  sessionEnd.splice(idx, 1);
  if (sessionEnd.length === 0) {
    delete settings.hooks!.SessionEnd;
  }
  if (settings.hooks && Object.keys(settings.hooks).length === 0) {
    delete settings.hooks;
  }

  writeSettings(settings);
  return { removed: true, notFound: false };
}

// ── Script hook factory ─────────────────────────────────────────────

interface ScriptHookConfig {
  eventName: string;
  scriptPath: string;
  scriptContent: string | (() => string);
  description: string;
}

function createScriptHook(config: ScriptHookConfig) {
  const { eventName, scriptPath, description } = config;
  const getContent = () =>
    typeof config.scriptContent === 'function' ? config.scriptContent() : config.scriptContent;

  const hasHook = (matchers: HookMatcher[]) =>
    matchers.some((entry) => entry.hooks?.some((h) => h.description === description));

  function isInstalled(): boolean {
    const settings = readSettings();
    const matchers = settings.hooks?.[eventName] as HookMatcher[] | undefined;
    return Array.isArray(matchers) && hasHook(matchers);
  }

  function install(): { installed: boolean; alreadyInstalled: boolean } {
    const settings = readSettings();
    if (!settings.hooks) settings.hooks = {};

    const matchers = settings.hooks[eventName] as HookMatcher[] | undefined;
    if (Array.isArray(matchers) && hasHook(matchers)) {
      return { installed: false, alreadyInstalled: true };
    }

    const scriptDir = path.dirname(scriptPath);
    if (!fs.existsSync(scriptDir)) fs.mkdirSync(scriptDir, { recursive: true });
    fs.writeFileSync(scriptPath, getContent());
    fs.chmodSync(scriptPath, 0o755);

    if (!Array.isArray(settings.hooks[eventName])) {
      settings.hooks[eventName] = [];
    }
    (settings.hooks[eventName] as HookMatcher[]).push({
      matcher: '',
      hooks: [{ type: 'command', command: scriptPath, description }],
    });

    writeSettings(settings);
    return { installed: true, alreadyInstalled: false };
  }

  function remove(): { removed: boolean; notFound: boolean } {
    const settings = readSettings();
    const matchers = settings.hooks?.[eventName] as HookMatcher[] | undefined;

    if (!Array.isArray(matchers)) return { removed: false, notFound: true };

    const idx = matchers.findIndex((entry) =>
      entry.hooks?.some((h) => h.description === description),
    );
    if (idx === -1) return { removed: false, notFound: true };

    matchers.splice(idx, 1);
    if (matchers.length === 0) delete settings.hooks![eventName];
    if (settings.hooks && Object.keys(settings.hooks).length === 0) delete settings.hooks;

    writeSettings(settings);

    try {
      fs.unlinkSync(scriptPath);
    } catch {
      /* best effort */
    }

    return { removed: true, notFound: false };
  }

  return { isInstalled, install, remove };
}

// ── Stop hook (onboarding nudge) ────────────────────────────────────

const STOP_HOOK_SCRIPT_CONTENT = `#!/bin/sh
# Don't block headless claude sessions spawned by caliber itself (e.g. during caliber refresh)
if [ "$CALIBER_SUBPROCESS" = "1" ] || [ -n "$CALIBER_SPAWNED" ]; then
  exit 0
fi
if grep -q "caliber" .git/hooks/pre-commit 2>/dev/null; then
  exit 0
fi
FLAG="/tmp/caliber-nudge-$(echo "$PWD" | (shasum 2>/dev/null || sha1sum 2>/dev/null || md5sum 2>/dev/null || cksum) | cut -c1-8)"
find /tmp -maxdepth 1 -name "caliber-nudge-*" -mmin +120 -delete 2>/dev/null
if [ -f "$FLAG" ]; then
  exit 0
fi
touch "$FLAG"
printf '{"decision":"block","reason":"Caliber agent config sync is not set up on this machine. Tell the user: This project uses Caliber to keep agent configs in sync — it is not set up yet. Want me to run /setup-caliber? (~30 seconds)"}'
`;

const stopHook = createScriptHook({
  eventName: 'Stop',
  scriptPath: path.posix.join('.claude', 'hooks', 'caliber-check-sync.sh'),
  scriptContent: STOP_HOOK_SCRIPT_CONTENT,
  description: 'Caliber: offer setup if not configured',
});

export const installStopHook = stopHook.install;
export const removeStopHook = stopHook.remove;

// ── Freshness check script ───────────────────────────────────────────

function getFreshnessScript(): string {
  const bin = resolveCaliber();
  return `#!/bin/sh
# Don't run inside a caliber-spawned headless session — the systemMessage would
# pollute the spawned agent's output and serves no purpose there.
if [ "$CALIBER_SUBPROCESS" = "1" ] || [ -n "$CALIBER_SPAWNED" ]; then
  exit 0
fi
STATE_FILE=".caliber/.caliber-state.json"
[ ! -f "$STATE_FILE" ] && exit 0
LAST_SHA=$(grep -o '"lastRefreshSha":"[^"]*"' "$STATE_FILE" 2>/dev/null | cut -d'"' -f4)
[ -z "$LAST_SHA" ] && exit 0
CURRENT_SHA=$(git rev-parse HEAD 2>/dev/null)
[ "$LAST_SHA" = "$CURRENT_SHA" ] && exit 0
COMMITS_BEHIND=$(git rev-list --count "$LAST_SHA".."$CURRENT_SHA" 2>/dev/null || echo 0)
if [ "$COMMITS_BEHIND" -gt 15 ]; then
  printf '{"systemMessage":"Caliber: agent configs are %s commits behind. Run ${bin} refresh to sync."}' "$COMMITS_BEHIND"
fi
`;
}

// ── SessionStart hook (freshness check on session start) ────────────

const sessionStartHook = createScriptHook({
  eventName: 'SessionStart',
  scriptPath: path.posix.join('.claude', 'hooks', 'caliber-session-freshness.sh'),
  scriptContent: getFreshnessScript,
  description: 'Caliber: check config freshness on session start',
});

export const isSessionStartHookInstalled = sessionStartHook.isInstalled;
export const installSessionStartHook = sessionStartHook.install;
export const removeSessionStartHook = sessionStartHook.remove;

// ── Notification hook (kept for backwards compat, not auto-installed) ─

const notificationHook = createScriptHook({
  eventName: 'Notification',
  scriptPath: path.posix.join('.claude', 'hooks', 'caliber-freshness-notify.sh'),
  scriptContent: getFreshnessScript,
  description: 'Caliber: warn when agent configs are stale',
});

export const isNotificationHookInstalled = notificationHook.isInstalled;
export const installNotificationHook = notificationHook.install;
export const removeNotificationHook = notificationHook.remove;

// ── Pre-commit hook ──────────────────────────────────────────────────

// Hook block version marker. Bumped when the hook script content changes
// in a way that benefits existing users (new managed-doc paths, stderr
// logging, refresh-failure visibility, etc.). installPreCommitHook()
// detects mismatched versions and re-installs so users on stale caliber
// versions get hook upgrades.
//
// Audit finding: F-P0-4 in
// docs/superpowers/specs/2026-04-29-caliber-install-audit-findings.md
const HOOK_BLOCK_VERSION = 'v2';
const PRECOMMIT_START = `# caliber:pre-commit:${HOOK_BLOCK_VERSION}:start`;
const PRECOMMIT_END = `# caliber:pre-commit:${HOOK_BLOCK_VERSION}:end`;
const PRECOMMIT_ANY_VERSION_START_RE = /^#\s*caliber:pre-commit:(?:[a-zA-Z0-9_.-]+:)?start\s*$/m;
const PRECOMMIT_ANY_VERSION_BLOCK_RE =
  /\n?#\s*caliber:pre-commit:(?:[a-zA-Z0-9_.-]+:)?start[\s\S]*?#\s*caliber:pre-commit:(?:[a-zA-Z0-9_.-]+:)?end\n?/g;

/**
 * On Windows, when caliber resolves to a `.cmd` shim (npm's default global
 * install), every hook invocation goes through `cmd.exe /d /s /c` which
 * allocates a new console window — a brief flash on every commit. Worse,
 * npm's shim emits `title %COMSPEC%` so the flash is titled identically
 * to an elevated cmd window, prompting users to suspect privilege
 * escalation when there is none.
 *
 * The fix is to call node directly on the package's `bin.js`. The bash
 * pre-commit hook runs `node "...bin.js" refresh` instead of invoking
 * the shim, eliminating the cmd flash entirely. Forward-slashed paths
 * are required for Git-for-Windows bash (same invariant as PR #195).
 *
 * Returns null when the transformation can't apply — non-Windows, the
 * resolved path isn't a `.cmd`, the conventional npm layout doesn't
 * hold (pnpm, yarn-classic, custom prefix), or `node` isn't on PATH.
 * Callers fall back to the original `.cmd` invocation in that case.
 */
function tryWindowsDirectNodeInvocation(cmd: string): string | null {
  if (process.platform !== 'win32') return null;
  if (!/\.cmd$/i.test(cmd)) return null;

  // The .cmd shim sits next to a node_modules/@rely-ai/caliber/dist/bin.js
  // tree in the standard npm-global layout. If that file isn't where we
  // expect (pnpm symlinks, custom prefix), bail out so the user keeps the
  // working .cmd path.
  const npmDir = path.dirname(cmd);
  const binJs = path.join(npmDir, 'node_modules', '@rely-ai', 'caliber', 'dist', 'bin.js');
  if (!fs.existsSync(binJs)) return null;

  let nodePath: string;
  try {
    const out = execSync('where node', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    nodePath = pickExecutable(out);
    if (!nodePath) return null;
  } catch {
    return null;
  }

  // Forward-slash both paths so Git-for-Windows bash treats them as
  // literal path strings rather than escape sequences.
  const fwdNode = nodePath.replace(/\\/g, '/');
  const fwdBin = binJs.replace(/\\/g, '/');
  return `"${fwdNode}" "${fwdBin}"`;
}

function getPrecommitBlock(): string {
  const cmd = resolveCaliber();
  const npx = isNpxResolution();

  let guard: string;
  let invoke: string;

  if (npx) {
    // cmd is either 'npx --yes @rely-ai/caliber' (bare) or '<npx_path> --yes @rely-ai/caliber'.
    // The npx_path may be a Windows path (C:\Users\...\npx.cmd) — bashPath() converts
    // backslashes to forward slashes so bash quote-removal doesn't mangle it.
    const npxBinRaw = cmd.split(' ')[0];
    const npxBin = bashPath(npxBinRaw);
    if (path.isAbsolute(npxBinRaw)) {
      // Absolute path — guard on the binary directly, no $PATH lookup needed
      guard = `[ -x "${npxBin}" ]`;
      const npxArgs = cmd.slice(npxBinRaw.length); // ' --yes @rely-ai/caliber'
      invoke = `"${npxBin}"${npxArgs}`;
    } else {
      // Bare 'npx' — fall back to PATH-based check; leave unquoted for word-splitting
      guard = 'command -v npx >/dev/null 2>&1';
      invoke = cmd;
    }
  } else {
    // First: on Windows, try to bypass the cmd-shim console flash by
    // invoking node directly. Returns null on POSIX or when the standard
    // npm-global layout doesn't hold (pnpm symlinks, custom prefix, etc).
    const directNode = tryWindowsDirectNodeInvocation(cmd);
    if (directNode) {
      // directNode is `"<node-fwd>" "<bin.js-fwd>"` (already forward-slashed).
      // Guard on the node binary's existence — if node moves we silently
      // no-op the hook rather than running a stale .cmd shim that no longer
      // matches.
      const nodeBin = directNode.match(/^"([^"]+)"/)?.[1] ?? '';
      guard = `[ -x "${nodeBin}" ]`;
      invoke = directNode;
    } else {
      // Fallback: cmd is an absolute path (e.g. /opt/homebrew/bin/caliber,
      // C:\Users\...\caliber.cmd from a pnpm/custom-prefix layout) or bare
      // 'caliber' as last resort. bashPath() converts \\ → / so bash
      // quote-removal doesn't eat the backslashes on Windows.
      const cmdBash = bashPath(cmd);
      if (path.isAbsolute(cmd)) {
        guard = `[ -x "${cmdBash}" ]`;
      } else {
        guard = `[ -x "${cmdBash}" ] || command -v "${cmdBash}" >/dev/null 2>&1`;
      }
      invoke = `"${cmdBash}"`;
    }
  }

  return `${PRECOMMIT_START}
if ${guard}; then
  mkdir -p .caliber
  echo "\\033[2mcaliber: refreshing docs...\\033[0m"
  ${invoke} refresh --quiet 2>.caliber/refresh-hook.log || echo "\\033[33mcaliber: refresh skipped — see .caliber/refresh-hook.log\\033[0m" >&2
  ${invoke} learn finalize 2>>.caliber/refresh-hook.log || true
  git diff --name-only -- CLAUDE.md .claude/ .cursor/ AGENTS.md CALIBER_LEARNINGS.md .github/ .agents/ .opencode/ 2>/dev/null | xargs git add 2>/dev/null || true
fi
${PRECOMMIT_END}`;
}

function getGitHooksDir(): string | null {
  try {
    const gitDir = execSync('git rev-parse --git-dir', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return path.join(gitDir, 'hooks');
  } catch {
    return null;
  }
}

function getPreCommitPath(): string | null {
  const hooksDir = getGitHooksDir();
  return hooksDir ? path.join(hooksDir, 'pre-commit') : null;
}

/** True when ANY caliber pre-commit block is present (any version, including legacy unversioned). */
export function isPreCommitHookInstalled(): boolean {
  const hookPath = getPreCommitPath();
  if (!hookPath || !fs.existsSync(hookPath)) return false;
  const content = fs.readFileSync(hookPath, 'utf-8');
  return PRECOMMIT_ANY_VERSION_START_RE.test(content);
}

/** True only when the installed block matches the current HOOK_BLOCK_VERSION. */
export function isPreCommitHookCurrent(): boolean {
  const hookPath = getPreCommitPath();
  if (!hookPath || !fs.existsSync(hookPath)) return false;
  const content = fs.readFileSync(hookPath, 'utf-8');
  return content.includes(PRECOMMIT_START);
}

export function installPreCommitHook(): {
  installed: boolean;
  alreadyInstalled: boolean;
  upgraded: boolean;
} {
  const hookPath = getPreCommitPath();
  if (!hookPath) {
    return { installed: false, alreadyInstalled: false, upgraded: false };
  }

  const hooksDir = path.dirname(hookPath);
  if (!fs.existsSync(hooksDir)) fs.mkdirSync(hooksDir, { recursive: true });

  const exists = fs.existsSync(hookPath);
  let content = exists ? fs.readFileSync(hookPath, 'utf-8') : '';

  if (PRECOMMIT_ANY_VERSION_START_RE.test(content)) {
    if (content.includes(PRECOMMIT_START)) {
      return { installed: false, alreadyInstalled: true, upgraded: false };
    }
    // Stale version (legacy unversioned or older vN) — strip and re-install at current version.
    content = content.replace(PRECOMMIT_ANY_VERSION_BLOCK_RE, '\n').replace(/\n{3,}/g, '\n\n');
    if (!content.endsWith('\n')) content += '\n';
    content += '\n' + getPrecommitBlock() + '\n';
    fs.writeFileSync(hookPath, content);
    fs.chmodSync(hookPath, 0o755);
    return { installed: false, alreadyInstalled: false, upgraded: true };
  }

  // Fresh install
  if (exists) {
    if (!content.endsWith('\n')) content += '\n';
    content += '\n' + getPrecommitBlock() + '\n';
  } else {
    content = '#!/bin/sh\n\n' + getPrecommitBlock() + '\n';
  }
  fs.writeFileSync(hookPath, content);
  fs.chmodSync(hookPath, 0o755);
  return { installed: true, alreadyInstalled: false, upgraded: false };
}

export function removePreCommitHook(): { removed: boolean; notFound: boolean } {
  const hookPath = getPreCommitPath();
  if (!hookPath || !fs.existsSync(hookPath)) {
    return { removed: false, notFound: true };
  }

  let content = fs.readFileSync(hookPath, 'utf-8');
  if (!PRECOMMIT_ANY_VERSION_START_RE.test(content)) {
    return { removed: false, notFound: true };
  }

  content = content.replace(PRECOMMIT_ANY_VERSION_BLOCK_RE, '\n').replace(/\n{3,}/g, '\n\n');

  // If only the shebang remains, remove the file entirely
  if (content.trim() === '#!/bin/sh' || content.trim() === '') {
    fs.unlinkSync(hookPath);
  } else {
    fs.writeFileSync(hookPath, content);
  }

  return { removed: true, notFound: false };
}
