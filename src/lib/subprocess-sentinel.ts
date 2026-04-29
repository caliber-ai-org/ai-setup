/**
 * Sentinel for detecting whether the current process was spawned by Caliber itself.
 *
 * Why this exists:
 * Caliber spawns LLM subprocesses (`claude -p`, `cursor agent --print`, `opencode run`)
 * to do its work. Those subprocesses inherit the project's `.claude/settings.json`,
 * which contains hooks Caliber installed itself (Stop, SessionEnd, PostToolUse, etc).
 * Without a sentinel those hooks re-invoke Caliber, which re-spawns the LLM, which
 * re-fires the same hooks — a recursive cascade that has caused multiple bugs
 * (#150, #169, #171, #194). Each was fixed by adding ad-hoc env-var checks at one
 * specific layer; this module consolidates those checks into a single canonical API.
 *
 * The contract:
 *   - Spawn helpers (spawnClaude/spawnOpenCode/cursor agent) wrap their env with
 *     `withCaliberSubprocessEnv()` so all descendants see the sentinel.
 *   - Hook entry points (caliber learn observe, caliber refresh --quiet, the bash
 *     hook scripts) check `isCaliberSubprocess()` and short-circuit if true.
 *
 * Migration note (transition release):
 * Older Caliber releases used the env var name `CALIBER_SPAWNED`. Bash hook scripts
 * installed in user repos by those versions check that name. To keep them working
 * during the upgrade window, `withCaliberSubprocessEnv()` writes BOTH names. New
 * Caliber code only reads the canonical name (`CALIBER_SUBPROCESS`). Drop the
 * legacy write in the next minor release.
 */

export const CALIBER_SUBPROCESS_ENV = 'CALIBER_SUBPROCESS';

/** Legacy name still SET (not read) by withCaliberSubprocessEnv during the transition. */
export const CALIBER_SUBPROCESS_LEGACY_ENV = 'CALIBER_SPAWNED';

/**
 * Returns true when the current process was spawned by Caliber itself.
 * Hook entry points should check this and exit early to prevent recursive cascades.
 */
export function isCaliberSubprocess(): boolean {
  return process.env[CALIBER_SUBPROCESS_ENV] === '1';
}

/**
 * Returns a NEW env object marked as a Caliber subprocess. Pass this to
 * `child_process.spawn(..., { env })` so the marker is inherited by all descendants.
 *
 * Sets both the canonical name and the legacy name so hook scripts installed by
 * older Caliber versions continue to short-circuit.
 */
export function withCaliberSubprocessEnv<T extends NodeJS.ProcessEnv>(env: T): T {
  return {
    ...env,
    [CALIBER_SUBPROCESS_ENV]: '1',
    [CALIBER_SUBPROCESS_LEGACY_ENV]: '1',
  };
}

/**
 * True when this caliber invocation is firing as a SessionEnd / hook
 * cascade from inside an unrelated (user-initiated) Claude Code session.
 *
 * Three signals must all hold:
 *   1. We're inside a Claude Code session (`CLAUDECODE=1`).
 *   2. Caliber did NOT spawn this process (`CALIBER_SUBPROCESS != 1`).
 *   3. Stdin is NOT a TTY — meaning we were invoked by Claude Code's
 *      hook runner (which pipes hook context to stdin), not by the user
 *      typing into a terminal that happens to be inside a Claude Code session.
 *
 * #3 disambiguates a manual `caliber refresh --quiet` typed by a power user
 * in an interactive Claude Code terminal (TTY → run normally) from the
 * SessionEnd-hook-fired version (no TTY → would cascade → skip silently).
 *
 * Without this skip, the user's `claude -p` triggers our SessionEnd hook,
 * which invokes `caliber refresh --quiet` (or `caliber learn finalize --auto`).
 * Doing real LLM work here would spawn ANOTHER claude session, which Claude
 * Code's hook timeout cancels mid-cascade, producing visible "Hook cancelled"
 * stderr noise on every interactive `claude -p` the user runs in a
 * Caliber-equipped repo.
 *
 * Hook entry points should call this first and exit 0 if true.
 *
 * Audit finding: F-P0-9 in
 * docs/superpowers/specs/2026-04-29-caliber-install-audit-findings.md
 */
export function isHookCascadeFromUserClaudeSession(): boolean {
  const inClaudeSession = process.env.CLAUDECODE === '1';
  const isCaliberSpawned = process.env[CALIBER_SUBPROCESS_ENV] === '1';
  const isInteractiveTty = process.stdin.isTTY === true;
  return inClaudeSession && !isCaliberSpawned && !isInteractiveTty;
}
