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
