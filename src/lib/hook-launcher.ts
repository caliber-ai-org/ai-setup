import fs from 'fs';
import os from 'os';
import path from 'path';
import { resolveCaliber, resolveCaliberHookInvoker } from './resolve-caliber.js';

export const HOOK_LAUNCHER_SHELL_PATH = '$HOME/.caliber/bin/caliber';
// Only $HOME is quoted so that isCaliberCommand still matches the /caliber suffix.
const HOOK_LAUNCHER_COMMAND = '"$HOME"/.caliber/bin/caliber';

const VERSION_MANAGED_PATH =
  /\/(?:\.nvm\/versions\/node|\.fnm\/node-versions|\.local\/share\/fnm\/node-versions|fnm_multishells|\.asdf\/installs|\.local\/share\/mise\/installs|Library\/Application Support\/fnm\/node-versions|\.nodenv\/versions)\//;

// Because $HOME/x and @rely-ai/caliber are not baked paths, lookbehind skips them.
const BAKED_CALIBER_PATH = /(?<![\w$}@.-]|\$HOME")\/[^\s"'`$():]+\/caliber(?=[\s"'`)]|$)/gm;
const QUOTED_DIR_CALIBER_PATH = /"(\/[^"]+)"\/caliber/g;

// Relative PATH entries are skipped so that a repo cannot pick the binary.
// npx is absent so that hooks never run unpinned registry code.
const GENERATED_MARKER = 'caliber:generated-hook-launcher';
const HOOK_LAUNCHER_SCRIPT = `#!/bin/sh
: ${GENERATED_MARKER}
is_generated_launcher() {
  second_line=""
  { IFS= read -r first_line; IFS= read -r second_line; } 2>/dev/null < "$1"
  [ "$second_line" = ": ${GENERATED_MARKER}" ]
}
caliber_bin=""
set -f
old_ifs=$IFS
IFS=:
for dir in $PATH; do
  [ "\${dir#/}" = "$dir" ] && continue
  [ -f "$dir/caliber" ] && [ -x "$dir/caliber" ] || continue
  is_generated_launcher "$dir/caliber" && continue
  caliber_bin="$dir/caliber"
  break
done
IFS=$old_ifs
set +f
if [ -z "$caliber_bin" ]; then
  caliber_bin=$(
    for candidate in "$HOME"/.nvm/versions/node/v*/bin/caliber \\
      "$HOME"/.local/share/fnm/node-versions/v*/installation/bin/caliber \\
      "$HOME"/.fnm/node-versions/v*/installation/bin/caliber \\
      "$HOME/Library/Application Support/fnm/node-versions"/v*/installation/bin/caliber \\
      "$HOME"/.asdf/installs/nodejs/[0-9]*/bin/caliber \\
      "$HOME"/.local/share/mise/installs/node/[0-9]*/bin/caliber \\
      "$HOME"/.nodenv/versions/[0-9]*/bin/caliber; do
      [ -f "$candidate" ] && [ -x "$candidate" ] || continue
      version=\${candidate%/bin/caliber}
      version=\${version%/installation}
      version=\${version##*/}
      printf '%s\\t%s\\n' "\${version#v}" "$candidate"
    done | sort -V | tail -n 1 | cut -f 2
  )
fi
if [ -z "$caliber_bin" ]; then
  echo "caliber: not found, run: npm install -g @rely-ai/caliber" >&2
  exit 0
fi
PATH="\${caliber_bin%/*}:$PATH"
export PATH
exec "$caliber_bin" "$@"
`;

function launcherAbsolutePath(): string {
  return path.join(os.homedir(), '.caliber', 'bin', 'caliber');
}

function usesHookLauncher(resolved: string): boolean {
  if (process.platform === 'win32') return false;
  return VERSION_MANAGED_PATH.test(resolved) || resolved === launcherAbsolutePath();
}

function writeHookLauncher(target: string): void {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporary, HOOK_LAUNCHER_SCRIPT);
    fs.chmodSync(temporary, 0o755);
    fs.renameSync(temporary, target);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

function ensureHookLauncher(): boolean {
  const target = launcherAbsolutePath();
  try {
    const existing = fs.existsSync(target) ? fs.readFileSync(target, 'utf-8') : null;
    // Unmarked launchers stay untouched so that local wrappers survive reinstalls.
    const keepExisting =
      existing !== null &&
      (existing === HOOK_LAUNCHER_SCRIPT || !existing.includes(GENERATED_MARKER));
    if (!keepExisting) writeHookLauncher(target);
    return true;
  } catch {
    return false;
  }
}

export function resolveHookBinary(): string {
  const resolved = resolveCaliber();
  if (!usesHookLauncher(resolved)) return resolved;
  // Because an unwritable home must not break install, keep the resolved path.
  return ensureHookLauncher() ? HOOK_LAUNCHER_SHELL_PATH : resolved;
}

export function resolveHookCommand(): string {
  const binary = resolveHookBinary();
  return binary === HOOK_LAUNCHER_SHELL_PATH ? HOOK_LAUNCHER_COMMAND : binary;
}

export function resolveHookInvoker(): string {
  const binary = resolveHookBinary();
  return binary === HOOK_LAUNCHER_SHELL_PATH ? HOOK_LAUNCHER_COMMAND : resolveCaliberHookInvoker();
}

/** Absolute because shell expansion in Cursor hook commands is unverified. */
export function resolveCursorHookInvoker(): string {
  const binary = resolveHookBinary();
  return binary === HOOK_LAUNCHER_SHELL_PATH
    ? `"${path.dirname(launcherAbsolutePath())}"/caliber`
    : resolveCaliberHookInvoker();
}

function isStaleCaliberPath(candidate: string): boolean {
  // Because no better binary exists, the path install would write again is not stale.
  if (candidate === resolveCaliber() && resolveHookBinary() === candidate) return false;
  return VERSION_MANAGED_PATH.test(candidate) || !fs.existsSync(candidate);
}

function referencesMissingLauncher(text: string): boolean {
  const referencesLauncher =
    text.includes(HOOK_LAUNCHER_SHELL_PATH) || text.includes(HOOK_LAUNCHER_COMMAND);
  return referencesLauncher && !fs.existsSync(launcherAbsolutePath());
}

export function hasStaleCaliberPath(text: string): boolean {
  if (process.platform === 'win32') return false;
  if (referencesMissingLauncher(text)) return true;
  const bakedPaths = [...text.matchAll(BAKED_CALIBER_PATH)].map(([candidate]) => candidate);
  const quotedDirPaths = [...text.matchAll(QUOTED_DIR_CALIBER_PATH)].map(
    ([, directory]) => `${directory}/caliber`,
  );
  return [...bakedPaths, ...quotedDirPaths].some(isStaleCaliberPath);
}
