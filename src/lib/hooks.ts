import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { resolveCaliber, isCaliberCommand, isNpxResolution } from './resolve-caliber.js';

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
  scriptContent: string;
  description: string;
}

function createScriptHook(config: ScriptHookConfig) {
  const { eventName, scriptPath, scriptContent, description } = config;

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
    fs.writeFileSync(scriptPath, scriptContent);
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
  scriptPath: path.join('.claude', 'hooks', 'caliber-check-sync.sh'),
  scriptContent: STOP_HOOK_SCRIPT_CONTENT,
  description: 'Caliber: offer setup if not configured',
});

export const installStopHook = stopHook.install;
export const removeStopHook = stopHook.remove;

// ── Freshness check script ───────────────────────────────────────────

const FRESHNESS_SCRIPT = `#!/bin/sh
STATE_FILE=".caliber/.caliber-state.json"
[ ! -f "$STATE_FILE" ] && exit 0
LAST_SHA=$(grep -o '"lastRefreshSha":"[^"]*"' "$STATE_FILE" 2>/dev/null | cut -d'"' -f4)
[ -z "$LAST_SHA" ] && exit 0
CURRENT_SHA=$(git rev-parse HEAD 2>/dev/null)
[ "$LAST_SHA" = "$CURRENT_SHA" ] && exit 0
COMMITS_BEHIND=$(git rev-list --count "$LAST_SHA".."$CURRENT_SHA" 2>/dev/null || echo 0)
if [ "$COMMITS_BEHIND" -gt 15 ]; then
  printf '{"systemMessage":"Caliber: agent configs are %s commits behind. Run caliber refresh to sync."}' "$COMMITS_BEHIND"
fi
`;

// ── SessionStart hook (freshness check on session start) ────────────

const sessionStartHook = createScriptHook({
  eventName: 'SessionStart',
  scriptPath: path.join('.claude', 'hooks', 'caliber-session-freshness.sh'),
  scriptContent: FRESHNESS_SCRIPT,
  description: 'Caliber: check config freshness on session start',
});

export const isSessionStartHookInstalled = sessionStartHook.isInstalled;
export const installSessionStartHook = sessionStartHook.install;
export const removeSessionStartHook = sessionStartHook.remove;

// ── Notification hook (kept for backwards compat, not auto-installed) ─

const notificationHook = createScriptHook({
  eventName: 'Notification',
  scriptPath: path.join('.claude', 'hooks', 'caliber-freshness-notify.sh'),
  scriptContent: FRESHNESS_SCRIPT,
  description: 'Caliber: warn when agent configs are stale',
});

export const isNotificationHookInstalled = notificationHook.isInstalled;
export const installNotificationHook = notificationHook.install;
export const removeNotificationHook = notificationHook.remove;

// ── Pre-commit hook ──────────────────────────────────────────────────

const PRECOMMIT_START = '# caliber:pre-commit:start';
const PRECOMMIT_END = '# caliber:pre-commit:end';

function getPrecommitBlock(): string {
  const cmd = resolveCaliber();
  const npx = isNpxResolution();

  let guard: string;
  let invoke: string;

  if (npx) {
    // cmd is either 'npx --yes @rely-ai/caliber' (bare) or '/abs/path/npx --yes @rely-ai/caliber'
    const npxBin = cmd.split(' ')[0];
    if (npxBin.startsWith('/')) {
      // Absolute path — guard on the binary directly, no $PATH lookup needed
      guard = `[ -x "${npxBin}" ]`;
      const npxArgs = cmd.slice(npxBin.length); // ' --yes @rely-ai/caliber'
      invoke = `"${npxBin}"${npxArgs}`;
    } else {
      // Bare 'npx' — fall back to PATH-based check; leave unquoted for word-splitting
      guard = 'command -v npx >/dev/null 2>&1';
      invoke = cmd;
    }
  } else {
    // cmd is an absolute path (e.g. /opt/homebrew/bin/caliber) or bare 'caliber' as last resort
    if (cmd.startsWith('/')) {
      guard = `[ -x "${cmd}" ]`;
    } else {
      guard = `[ -x "${cmd}" ] || command -v "${cmd}" >/dev/null 2>&1`;
    }
    invoke = `"${cmd}"`;
  }

  return `${PRECOMMIT_START}
if ${guard}; then
  mkdir -p .caliber
  echo "\\033[2mcaliber: refreshing docs...\\033[0m"
  ${invoke} refresh --quiet 2>.caliber/refresh-hook.log || true
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

export function isPreCommitHookInstalled(): boolean {
  const hookPath = getPreCommitPath();
  if (!hookPath || !fs.existsSync(hookPath)) return false;
  const content = fs.readFileSync(hookPath, 'utf-8');
  return content.includes(PRECOMMIT_START);
}

export function installPreCommitHook(): { installed: boolean; alreadyInstalled: boolean } {
  if (isPreCommitHookInstalled()) {
    return { installed: false, alreadyInstalled: true };
  }

  const hookPath = getPreCommitPath();
  if (!hookPath) return { installed: false, alreadyInstalled: false };

  const hooksDir = path.dirname(hookPath);
  if (!fs.existsSync(hooksDir)) fs.mkdirSync(hooksDir, { recursive: true });

  let content = '';
  if (fs.existsSync(hookPath)) {
    content = fs.readFileSync(hookPath, 'utf-8');
    if (!content.endsWith('\n')) content += '\n';
    content += '\n' + getPrecommitBlock() + '\n';
  } else {
    content = '#!/bin/sh\n\n' + getPrecommitBlock() + '\n';
  }

  fs.writeFileSync(hookPath, content);
  fs.chmodSync(hookPath, 0o755);
  return { installed: true, alreadyInstalled: false };
}

export function removePreCommitHook(): { removed: boolean; notFound: boolean } {
  const hookPath = getPreCommitPath();
  if (!hookPath || !fs.existsSync(hookPath)) {
    return { removed: false, notFound: true };
  }

  let content = fs.readFileSync(hookPath, 'utf-8');
  if (!content.includes(PRECOMMIT_START)) {
    return { removed: false, notFound: true };
  }

  const regex = new RegExp(`\\n?${PRECOMMIT_START}[\\s\\S]*?${PRECOMMIT_END}\\n?`);
  content = content.replace(regex, '\n');

  // If only the shebang remains, remove the file entirely
  if (content.trim() === '#!/bin/sh' || content.trim() === '') {
    fs.unlinkSync(hookPath);
  } else {
    fs.writeFileSync(hookPath, content);
  }

  return { removed: true, notFound: false };
}
