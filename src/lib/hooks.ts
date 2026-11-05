import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import {
  isCaliberCommand,
  isNpxResolution,
  resolveWindowsNodeBinInvocation,
} from './resolve-caliber.js';
import {
  HOOK_LAUNCHER_SHELL_PATH,
  hasStaleCaliberPath,
  resolveHookBinary,
  resolveHookCommand,
} from './hook-launcher.js';
import { bashPath } from '../utils/windows.js';

const SETTINGS_PATH = path.join('.claude', 'settings.json');
const REFRESH_TAIL = 'refresh --quiet';
const HOOK_DESCRIPTION = 'Caliber: auto-refreshing docs based on code changes';

function getHookCommand(): string {
  // Use node-direct on Windows (no VBS — SessionEnd may need stdout).
  const cmd = resolveHookCommand();
  const direct = resolveWindowsNodeBinInvocation(cmd);
  return `${direct ?? cmd} ${REFRESH_TAIL}`;
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

  const existingIndex = findHookIndex(settings.hooks.SessionEnd);
  if (existingIndex !== -1) {
    const staleHooks = settings.hooks.SessionEnd[existingIndex].hooks.filter(
      (hook) => isCaliberCommand(hook.command, REFRESH_TAIL) && hasStaleCaliberPath(hook.command),
    );
    if (staleHooks.length === 0) return { installed: false, alreadyInstalled: true };
    for (const hook of staleHooks) hook.command = getHookCommand();
    writeSettings(settings);
    return { installed: true, alreadyInstalled: false };
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
  /** Claude Code tool-name matcher. Empty (the default) matches every tool. */
  matcher?: string;
}

// The hook command Claude Code writes into settings.json must be
// anchored on $CLAUDE_PROJECT_DIR. Claude Code launches hooks via
// `sh -c "<command>"` with cwd = the session's working directory,
// which can be a subdirectory of the project (the assistant cd'd
// during the session). A bare relative path like
// `.claude/hooks/caliber-session-freshness.sh` then resolves
// against that subdirectory and `sh` returns
// `not found` (exit 127) before the script ever executes.
//
// $CLAUDE_PROJECT_DIR is exported by Claude Code and always points
// at the directory containing the .claude/ that registered the
// hook, so prefixing the script path with it makes the launch
// CWD-independent. The shell expands $CLAUDE_PROJECT_DIR inside
// the command string at hook-invocation time.
//
// Always use forward slashes: Claude Code runs hooks through `sh`
// even on Windows (via Git for Windows' bundled bash). Backslashes
// in `command` would be eaten by `sh` as escape characters and
// `path.join` would inject them on win32 — `path.posix.join`
// keeps the form portable.
function commandFor(scriptPath: string): string {
  // Quote so project dirs with spaces survive `sh -c`.
  return `"$CLAUDE_PROJECT_DIR/${scriptPath}"`;
}

// True if a hook entry's `command` is not yet the current
// `$CLAUDE_PROJECT_DIR`-anchored form. Covers bare paths,
// `./`-prefixed / backslash variants, and the unquoted
// `$CLAUDE_PROJECT_DIR/...` form from the first ship of this fix.
function isLegacyBareCommand(command: string, scriptPath: string): boolean {
  if (!command) return false;
  if (command === commandFor(scriptPath)) return false;
  if (command.includes('$CLAUDE_PROJECT_DIR')) {
    const unquoted = `$CLAUDE_PROJECT_DIR/${scriptPath}`;
    return command === unquoted || command === `'${unquoted}'`;
  }
  const normalized = command.replace(/\\/g, '/').replace(/^\.\//, '');
  return normalized === scriptPath;
}

function createScriptHook(config: ScriptHookConfig) {
  const { eventName, scriptPath, description, matcher = '' } = config;
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
      matcher,
      hooks: [{ type: 'command', command: commandFor(scriptPath), description }],
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

  // Rewrite a legacy bare-command entry to the $CLAUDE_PROJECT_DIR-
  // anchored form. Idempotent: returns `{ migrated: false }` when
  // every matching entry is already prefixed (or no entry exists at
  // all). Called by `migrateAllScriptHooks` from `caliber refresh`
  // so existing projects pick up the fix without a re-init. Unlike
  // `install`, this only touches entries Caliber owns (matched by
  // `description`) and never re-writes the on-disk script file —
  // the shell-script content migration is handled separately by
  // re-installing the upstream PR #217 freshness check via the
  // normal install/upgrade path.
  function migrate(): { migrated: boolean } {
    const settings = readSettings();
    const matchers = settings.hooks?.[eventName] as HookMatcher[] | undefined;
    if (!Array.isArray(matchers)) return { migrated: false };

    let changed = false;
    for (const entry of matchers) {
      if (!entry.hooks) continue;
      for (const h of entry.hooks) {
        if (h.description !== description) continue;
        if (isLegacyBareCommand(h.command, scriptPath)) {
          h.command = commandFor(scriptPath);
          changed = true;
        }
      }
    }

    if (!changed) return { migrated: false };
    writeSettings(settings);
    return { migrated: true };
  }

  return { isInstalled, install, remove, migrate };
}

// ── Stop hook (onboarding nudge) ────────────────────────────────────

const STOP_HOOK_SCRIPT_CONTENT = `#!/bin/sh
# Don't block headless claude sessions spawned by caliber itself (e.g. during caliber refresh)
if [ "$CALIBER_SUBPROCESS" = "1" ] || [ -n "$CALIBER_SPAWNED" ]; then
  exit 0
fi

# Resolve the project root — the directory that OWNS this .claude/.
# Pre-fix this script used \`git rev-parse --git-dir\` against $PWD. But
# the hook command in settings.json is "$CLAUDE_PROJECT_DIR/.claude/
# hooks/caliber-check-sync.sh", and Claude Code inherits the SESSION
# cwd as $PWD — which can be a subdirectory of the project that
# happens to be its own git repo (e.g. a nested checkout inside a
# non-git scratch dir). In that layout \`git rev-parse\` from $PWD
# succeeded against the nested .git, the nudge fired, and the
# assistant tried to install Caliber in a directory where Caliber
# has nothing to manage.
# $CLAUDE_PROJECT_DIR is exported by Claude Code and always points
# at the directory containing the .claude/ that registered this
# hook. Script-relative fallback handles the (rare) shell-test
# invocation case where $CLAUDE_PROJECT_DIR isn't set.
if [ -n "$CLAUDE_PROJECT_DIR" ]; then
  PROJECT_DIR="$CLAUDE_PROJECT_DIR"
else
  script_dir=$(cd "$(dirname "$0")" 2>/dev/null && pwd) || script_dir=""
  if [ -n "$script_dir" ]; then
    PROJECT_DIR=$(cd "$script_dir/../.." 2>/dev/null && pwd) || PROJECT_DIR="$PWD"
  else
    PROJECT_DIR="$PWD"
  fi
fi

# Caliber only applies to git repos. Skip the nudge when the project
# root has no git context (e.g. .claude/ shipped into a non-git
# scratch dir, model archive, or a parent dir whose only git presence
# is in nested children). \`git -C <dir>\` confines the lookup to walk
# UP from PROJECT_DIR; it never descends into children.
if ! git -C "$PROJECT_DIR" rev-parse --git-dir >/dev/null 2>&1; then
  exit 0
fi
if grep -q "caliber" "$PROJECT_DIR/.git/hooks/pre-commit" 2>/dev/null; then
  exit 0
fi

# Flag is keyed by PROJECT_DIR (not $PWD) so the once-per-project
# guard still works when the assistant moves between subdirectories
# during the session.
FLAG="/tmp/caliber-nudge-$(echo "$PROJECT_DIR" | (shasum 2>/dev/null || sha1sum 2>/dev/null || md5sum 2>/dev/null || cksum) | cut -c1-8)"
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
export const migrateStopHook = stopHook.migrate;

function createBinaryScriptHook(config: ScriptHookConfig & { scriptContent: () => string }) {
  const hook = createScriptHook(config);

  function install(): { installed: boolean; alreadyInstalled: boolean; upgraded?: boolean } {
    const result = hook.install();
    if (!result.alreadyInstalled || !fs.existsSync(config.scriptPath)) return result;
    if (!hasStaleCaliberPath(fs.readFileSync(config.scriptPath, 'utf-8'))) return result;
    fs.writeFileSync(config.scriptPath, config.scriptContent());
    fs.chmodSync(config.scriptPath, 0o755);
    return { installed: false, alreadyInstalled: false, upgraded: true };
  }

  return { ...hook, install };
}

// ── Freshness check script ───────────────────────────────────────────

export function getFreshnessScript(): string {
  const bin = resolveHookBinary();
  return `#!/bin/sh
# Don't run inside a caliber-spawned headless session — the systemMessage would
# pollute the spawned agent's output and serves no purpose there.
if [ "$CALIBER_SUBPROCESS" = "1" ] || [ -n "$CALIBER_SPAWNED" ]; then
  exit 0
fi
STATE_FILE=".caliber/.caliber-state.json"
[ ! -f "$STATE_FILE" ] && exit 0
LAST_SHA=$(grep -o '"lastRefreshSha": *"[^"]*"' "$STATE_FILE" 2>/dev/null | cut -d'"' -f4)
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

const sessionStartHook = createBinaryScriptHook({
  eventName: 'SessionStart',
  scriptPath: path.posix.join('.claude', 'hooks', 'caliber-session-freshness.sh'),
  scriptContent: getFreshnessScript,
  description: 'Caliber: check config freshness on session start',
});

export const isSessionStartHookInstalled = sessionStartHook.isInstalled;
export const installSessionStartHook = sessionStartHook.install;
export const removeSessionStartHook = sessionStartHook.remove;
export const migrateSessionStartHook = sessionStartHook.migrate;

// ── Agent sync hooks (skills / rules / plugins across providers) ────

// Resolves the directory that owns this .claude/, the same way the Stop hook
// does: $CLAUDE_PROJECT_DIR when Claude Code exports it, else two levels up
// from the script itself. Hooks inherit the SESSION cwd, which may be a
// subdirectory, so neither $PWD nor a relative path is safe here.
const RESOLVE_PROJECT_DIR = `if [ -n "$CLAUDE_PROJECT_DIR" ]; then
  PROJECT_DIR="$CLAUDE_PROJECT_DIR"
else
  script_dir=$(cd "$(dirname "$0")" 2>/dev/null && pwd) || script_dir=""
  if [ -n "$script_dir" ]; then
    PROJECT_DIR=$(cd "$script_dir/../.." 2>/dev/null && pwd) || PROJECT_DIR="$PWD"
  else
    PROJECT_DIR="$PWD"
  fi
fi`;

// Paths that belong to a provider's skills/rules surface. An edit anywhere else
// cannot change what sync would write, so the hook exits without spawning
// anything — this runs after every Write/Edit and has to stay cheap.
const SYNC_PATH_PATTERN =
  '(\\.claude/(skills|rules)|\\.cursor/(skills|rules)|\\.agents/skills|\\.opencode/skills|\\.github/instructions)/';

function getSessionStartSyncScript(): string {
  const bin = resolveHookCommand();
  return `#!/bin/sh
# Mirror skills, rules and plugins across every configured agent at session
# start, so the session begins with each provider holding the same set.
if [ "$CALIBER_SUBPROCESS" = "1" ] || [ -n "$CALIBER_SPAWNED" ]; then
  exit 0
fi
${RESOLVE_PROJECT_DIR}
cd "$PROJECT_DIR" 2>/dev/null || exit 0
OUT=$(${bin} sync --quiet 2>/dev/null) || exit 0
[ -z "$OUT" ] && exit 0
# Escape backslashes then quotes so the line is safe inside a JSON string.
ESCAPED=$(printf '%s' "$OUT" | sed 's/\\\\/\\\\\\\\/g; s/"/\\\\"/g')
printf '{"systemMessage":"%s"}' "$ESCAPED"
`;
}

function getPostToolUseSyncScript(): string {
  const bin = resolveHookCommand();
  return `#!/bin/sh
# After the agent edits a skill or rule in ONE provider, mirror it into the
# others so the change is live for every agent within the same session.
if [ "$CALIBER_SUBPROCESS" = "1" ] || [ -n "$CALIBER_SPAWNED" ]; then
  exit 0
fi
INPUT=$(cat 2>/dev/null)
# Only act when the edited path is part of a provider's skills/rules surface.
printf '%s' "$INPUT" | grep -qE '${SYNC_PATH_PATTERN}' || exit 0
${RESOLVE_PROJECT_DIR}
cd "$PROJECT_DIR" 2>/dev/null || exit 0
${bin} sync --quiet >/dev/null 2>&1
exit 0
`;
}

const sessionStartSyncHook = createBinaryScriptHook({
  eventName: 'SessionStart',
  scriptPath: path.posix.join('.claude', 'hooks', 'caliber-sync-agents.sh'),
  scriptContent: getSessionStartSyncScript,
  description: 'Caliber: mirror skills and rules across agents on session start',
});

export const isSessionStartSyncHookInstalled = sessionStartSyncHook.isInstalled;
export const installSessionStartSyncHook = sessionStartSyncHook.install;
export const removeSessionStartSyncHook = sessionStartSyncHook.remove;
export const migrateSessionStartSyncHook = sessionStartSyncHook.migrate;

const postToolUseSyncHook = createBinaryScriptHook({
  eventName: 'PostToolUse',
  matcher: 'Write|Edit',
  scriptPath: path.posix.join('.claude', 'hooks', 'caliber-sync-on-edit.sh'),
  scriptContent: getPostToolUseSyncScript,
  description: 'Caliber: mirror a skill or rule edit to the other agents',
});

export const isPostToolUseSyncHookInstalled = postToolUseSyncHook.isInstalled;
export const installPostToolUseSyncHook = postToolUseSyncHook.install;
export const removePostToolUseSyncHook = postToolUseSyncHook.remove;
export const migratePostToolUseSyncHook = postToolUseSyncHook.migrate;

// ── Notification hook (kept for backwards compat, not auto-installed) ─

const notificationHook = createBinaryScriptHook({
  eventName: 'Notification',
  scriptPath: path.posix.join('.claude', 'hooks', 'caliber-freshness-notify.sh'),
  scriptContent: getFreshnessScript,
  description: 'Caliber: warn when agent configs are stale',
});

export const isNotificationHookInstalled = notificationHook.isInstalled;
export const installNotificationHook = notificationHook.install;
export const removeNotificationHook = notificationHook.remove;
export const migrateNotificationHook = notificationHook.migrate;

// ── Settings.json hook migration aggregator ─────────────────────────
//
// Runs the per-hook `migrate()` step for every Caliber-owned script
// hook. Returns the count of entries actually rewritten (so callers
// can report "migrated N legacy hook commands" without recomputing).
// Idempotent — safe to call on every `caliber refresh`.
//
// Why this exists: when Caliber was first shipped, the script hook
// installer wrote a bare relative `command` like
// `.claude/hooks/caliber-session-freshness.sh`. Claude Code launches
// hooks with `cwd = session cwd`, which can be a subdirectory of
// the project, so the bare path resolves to nowhere and `sh`
// reports `not found` (exit 127) before the script runs. The fix is
// to anchor the command on `$CLAUDE_PROJECT_DIR`; this migration
// rewrites existing settings.json files in place so users don't
// have to manually re-init.
export function migrateAllScriptHooks(): { migratedHookCount: number } {
  let migratedHookCount = 0;
  if (stopHook.migrate().migrated) migratedHookCount++;
  if (sessionStartHook.migrate().migrated) migratedHookCount++;
  if (notificationHook.migrate().migrated) migratedHookCount++;
  return { migratedHookCount };
}

// ── Pre-commit hook ──────────────────────────────────────────────────

// Hook block version marker. Bumped when the hook script content changes
// in a way that benefits existing users (new managed-doc paths, stderr
// logging, refresh-failure visibility, etc.). installPreCommitHook()
// detects mismatched versions and re-installs so users on stale caliber
// versions get hook upgrades.
//
// Audit finding: F-P0-4 in
// docs/superpowers/specs/2026-04-29-caliber-install-audit-findings.md
//
// v3: staging of refreshed docs is now skippable via
// `git config caliber.autostage false` (#225).
const HOOK_BLOCK_VERSION = 'v3';
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
 * Delegates to ``resolveWindowsNodeBinInvocation`` (shared with the
 * learning-hook invoker). Returns null when the transformation can't
 * apply — callers fall back to the original `.cmd` invocation.
 */
function tryWindowsDirectNodeInvocation(cmd: string): string | null {
  return resolveWindowsNodeBinInvocation(cmd);
}

function getPrecommitBlock(): string {
  const cmd = resolveHookBinary();
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
      if (path.isAbsolute(cmd) || cmd === HOOK_LAUNCHER_SHELL_PATH) {
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
  # Opt out of auto-staging refreshed docs into the in-flight commit with:
  #   git config caliber.autostage false
  # Refreshed files then stay in the working tree for deliberate review/commit.
  if [ "$(git config --get caliber.autostage 2>/dev/null)" != "false" ]; then
    git diff --name-only -- CLAUDE.md .claude/ .cursor/ AGENTS.md CALIBER_LEARNINGS.md .github/ .agents/ .opencode/ 2>/dev/null | xargs git add 2>/dev/null || true
  else
    echo "\\033[2mcaliber: autostage disabled — refreshed docs left unstaged\\033[0m"
  fi
fi
${PRECOMMIT_END}`;
}

function getGitHooksDir(): string | null {
  try {
    const gitDir = execSync('git rev-parse --git-dir', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
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

function isPrecommitBlockCurrent(content: string): boolean {
  if (!content.includes(PRECOMMIT_START)) return false;
  const installedBlocks = content.match(PRECOMMIT_ANY_VERSION_BLOCK_RE) ?? [];
  return !hasStaleCaliberPath(installedBlocks.join('\n'));
}

export function isPreCommitHookCurrent(): boolean {
  const hookPath = getPreCommitPath();
  if (!hookPath || !fs.existsSync(hookPath)) return false;
  const content = fs.readFileSync(hookPath, 'utf-8');
  return isPrecommitBlockCurrent(content);
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
    if (isPrecommitBlockCurrent(content)) {
      return { installed: false, alreadyInstalled: true, upgraded: false };
    }
    // Because old blocks and dead binary paths never self-heal, replace the block.
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
