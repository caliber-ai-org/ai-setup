# 03 — Generation, refresh, and hooks audit

## Context

The generation pipeline produces the configs Caliber's value claim depends on. The refresh pipeline keeps them accurate. The hooks make refresh automatic. Each layer is a place where the value claim can quietly fail.

Combined source: ~4,100 lines across `src/ai/`, `src/lib/hooks.ts`, `src/lib/learning-hooks.ts`, `src/lib/lock.ts`, and `src/writers/`.

## Generation pipeline (src/ai/generate.ts — 972 lines)

Per the dispatched explore agent's structural map:

- **Phase 1 (monolithic):** Full setup generated in one LLM call via `streamGeneration()`. Up to 5 retries with token budget increments on `stop_reason === 'max_tokens'`. JSON extracted mid-stream.
- **Phase 2 (parallel fan-out):** Up to 10 concurrent skill generations via `Promise.allSettled`. Individual failures are caught and logged but **don't abort the pipeline** (the documented #142 root cause).
- **Phase 1 JSON parse failure returns `{}` silently** (lines ~501–503). Downstream code proceeds with empty setup; no error surfaced.
- **Race condition risk** between dual timeouts (inactivity + total) and stream completion (likely #143 root cause). The `settled` flag mitigates but the nested-Promise structure remains fragile.
- Phase 2 max-token exhaustion **does not retry** — only Phase 1 has the budget-increment loop.

## Refinement (src/ai/refine.ts — 103 lines)

- Single `provider.stream()` call wrapped in a Promise, with inactivity timeout (configurable via `CALIBER_STREAM_INACTIVITY_TIMEOUT_MS`).
- Buffer accumulated, then `stripMarkdownFences()` + `slice(jsonStart)` + `JSON.parse`.
- On parse failure: surfaces "Failed to parse AI response. Try rephrasing your request." — user-friendly.
- **No total timeout** — only inactivity. A model that stutters slowly forever could keep extending the timer.
- 16,000 max_tokens. Hardcoded.

## Score-based refinement (src/ai/score-refine.ts — 542 lines)

- Per explore agent: up to **3 iterations in `--thorough` mode, 0 iterations in default mode**.
- Calls `llmCall()` per iteration with issue-specific prompts.
- Validates against scoring checks via `validateSetup()`.

**Implication:** README headlines "Auto-refinement based on score" but the default behavior doesn't use it — only `--thorough` does. Users unaware of the flag get a one-shot generation with no validation loop.

## Refresh pipeline (src/ai/refresh.ts — 237 lines)

- Single `llmCall()` to fast model (per `getFastModel()`). 16384 max_tokens.
- Builds prompt with: project context, file tree (capped at 200 entries), diff (committed + staged + unstaged), all existing doc content, sources.
- **`MAX_EXISTING_DOCS_CHARS = 60_000` total cap** (the #174 fix). Per-entry floor of 2,000 chars. Proportional truncation when over budget. Truncates at line boundary.
- Returns structured JSON: `{ updatedDocs, changesSummary, fileChanges, docsUpdated }`.
- `updatedDocs` fields are nullable — null means "don't update this file". This is the no-churn signal.

**Truncation risk:** A repo with 30+ skill files (caliber itself has 8) where each is 5kb means total ~150kb. After ratio truncation: each gets ~24kb visible to the LLM. Important content in the bottom half of each file is dropped.

## Pre-commit hook (src/lib/hooks.ts — 454 lines)

`installPreCommitHook()` (line 407):
- Checks `isPreCommitHookInstalled()` — looks for `# caliber:pre-commit:start` marker.
- **If found, exits early** — never attempts an update.
- Writes `0o755`, prepends if file exists with shebang, otherwise creates.

`getPrecommitBlock()` (line 321) — generates the hook script body:
- Dynamic guard based on resolved caliber binary path
- Windows: tries direct-node-invocation to avoid cmd-shim console flash (the #197 fix)
- Latest source generates: `mkdir -p .caliber`, `refresh --quiet 2>.caliber/refresh-hook.log || true`, auto-stages `.github/`, `.agents/`, `.opencode/` in addition to legacy paths

**Direct comparison: source vs disk on this machine** — captured via `cat .git/hooks/pre-commit`:

```sh
# Currently installed (from caliber 1.40.x, stale):
"caliber" refresh 2>/dev/null || true
"caliber" learn finalize 2>/dev/null || true
git diff --name-only -- CLAUDE.md .claude/ .cursor/ AGENTS.md CALIBER_LEARNINGS.md 2>/dev/null | xargs git add 2>/dev/null

# What 1.48.2 would generate:
mkdir -p .caliber
${invoke} refresh --quiet 2>.caliber/refresh-hook.log || true
${invoke} learn finalize 2>>.caliber/refresh-hook.log || true
git diff --name-only -- CLAUDE.md .claude/ AGENTS.md CALIBER_LEARNINGS.md .github/ .agents/ .opencode/ ... | xargs git add
```

The installed version is missing: stderr-to-log (so refresh failures are silent), `.github/.agents/.opencode/` auto-staging (so Copilot/Codex/OpenCode users' changes aren't picked up), and `--quiet` flag.

## Other Claude Code hooks (src/lib/hooks.ts)

- **Stop hook** (`installStopHook`) — onboarding nudge. Writes `.claude/hooks/caliber-check-sync.sh`. Checks for `caliber` in pre-commit; if absent, throttles via `/tmp/caliber-nudge-<sha8(cwd)>` with 2hr cooldown (`mmin +120 -delete`). Returns `{decision: "block"}` JSON to inject the "want to set up caliber?" message.
- **SessionStart hook** (`installSessionStartHook`) — freshness check. Reads `.caliber/.caliber-state.json`, compares `lastRefreshSha` to current HEAD. If 15+ commits behind: emits `systemMessage` suggesting refresh.
- **Notification hook** (legacy) — same as SessionStart, kept for backwards compat. Not auto-installed anymore.
- **SessionEnd hook** (`installHook` in this same file, separate from SessionEnd in learning-hooks) — invokes `caliber refresh --quiet`.

## Learning hooks (src/lib/learning-hooks.ts — 213 lines)

Installs 4 Claude Code hooks AND 4 Cursor hooks:
- PostToolUse → `caliber learn observe`
- PostToolUseFailure → `caliber learn observe --failure`
- UserPromptSubmit → `caliber learn observe --prompt`
- SessionEnd → `caliber learn finalize --auto`

All embed the resolved `caliber` binary path at install time. Same staleness vulnerability as the pre-commit hook.

## Lock file (src/lib/lock.ts — 67 lines)

- Path: `/tmp/.caliber-<md5(cwd):8>.lock`
- Staleness: 10 minutes
- Liveness check: `process.kill(pid, 0)` (testing existence, not killing)
- **`isCaliberRunning()` calls `buildLockPath()` (fresh)** — but `acquireLock()`/`releaseLock()` use `getLockFile()` (cached at first call).
- This was probably the fix for #150 (false positive after chdir). But it leaves a subtle issue: if `process.cwd()` changes between `acquireLock` (cached cwd A) and `releaseLock` (still cwd A — uses cache), then a separate process at cwd B would correctly compute its own lock path and not see the lock at cwd A. That's correct behavior. ✓

## Subprocess sentinel (src/lib/subprocess-sentinel.ts — 53 lines)

- `CALIBER_SUBPROCESS=1` set on every spawn'd subprocess.
- Legacy alias `CALIBER_SPAWNED=1` also written ("drop in next minor release" comment present in 1.48.2 — should have been dropped already).
- Hook scripts (Stop hook, SessionStart hook, refresh hook block) all check `CALIBER_SUBPROCESS=1` AND `CALIBER_SPAWNED` and exit early.
- This is the documented fix for #150, #169, #171, #194 (recursive cascades).

## Findings

- **[P0] Pre-commit hooks DO NOT auto-update across caliber upgrades.** Empirically verified on this machine: caliber binary upgraded to 1.48.2's source (well, the audit machine has 1.40.4 installed but the source is current), but the pre-commit hook still reflects the old (1.40.x) install. `installPreCommitHook()` short-circuits if the marker is found. Result: a fix or feature added to the hook script (e.g. `.github/` auto-staging, stderr-to-log) **never reaches existing users**. The repo doesn't appear to have an upgrade path or version stamp to detect outdated hooks. Suggested fix: embed a version marker in the hook block (`# caliber:pre-commit:v1.48.2:start`) and re-install on mismatch.

- **[P1] Old hooks silently swallow refresh failures (`refresh 2>/dev/null`).** Combined with the no-auto-update finding above, users on older caliber versions never see refresh errors. If their LLM auth breaks or the model is unavailable, the auto-sync silently degrades. The new hook (1.48.2 source) writes to `.caliber/refresh-hook.log` — better, but still requires the user to check. Either surface log-tail in the next commit's pre-commit output, or print a one-liner like "caliber refresh skipped — see .caliber/refresh-hook.log".

- **[P1] Phase 1 JSON parse failure returns empty `{}` silently.** Per explore agent at `src/ai/generate.ts:501-503`. Every downstream operation proceeds with empty setup — `setup-files.ts` writes nothing to disk, `printSetupSummary` shows nothing, score regression check sees baseline-vs-baseline (no change), and the user is told "Caliber is set up!" with empty configs. The friendlier path is in `init.ts` line 643 which checks `if (!generatedSetup)` and writes the error log — but `{}` is truthy, so this branch never fires.

- **[P1] Phase 2 skill generation failures are aggregated by `allSettled` and logged, never raised.** Per explore agent and #142. User gets a setup with some skills missing, no warning that they failed. Should surface in the `printSetupSummary` (e.g. "Generated 3/5 skills — check `.caliber/error-log.md`").

- **[P1] Refresh prompt cap at 60k chars truncates important content silently.** `src/ai/refresh.ts:12-209`. Each entry is proportionally truncated when total exceeds 60k. For a repo with many skill files (caliber itself has 8 skills, some 200+ lines), each ends up with ~7.5k visible chars (60k / 8). Truncation is at line boundary with "...[truncated]" marker. The LLM may miss critical context near the bottom of long skills. Suggested: prioritize recently-modified docs over older ones (refresh's job is to catch what changed; older docs are more likely already accurate).

- **[P1] Pre-commit hook's caliber-binary resolution is baked at install time.** `hooks.ts:321-381` embeds the resolved path. If user switches Node version managers (nvm), changes from npm-global to pnpm-global, or moves caliber to a different prefix, the hook silently no-ops via the `if [ -x ... ]` guard. No warning. Same issue affects learning hooks. Suggested: hook should re-resolve via `which caliber` at run time as a fallback.

- **[P1] Default `caliber init` does NOT use the score-refine loop — only `--thorough` does.** The README implies the score-based refinement is automatic. Users on the default path get a single-shot generation. If the LLM produced something that failed score checks, no auto-refinement happens. The user only sees the score regression auto-revert (init.ts:906) — which discards the output instead of fixing it.

- **[P2] Refinement loop has no total timeout.** `src/ai/refine.ts` only has inactivity timeout. A model that emits one character per minute could keep the user waiting indefinitely.

- **[P2] Refresh max_tokens hardcoded to 16384.** A large refresh that needs more output is silently truncated. Should scale with model context window.

- **[P2] Stop hook flag-file naming uses 8-char SHA hash of cwd.** Collision probability is low (1 in 4 billion) but possible. If user has two repos whose paths happen to hash-collide, a nudge in one suppresses nudges in the other for 2 hours.

- **[P2] Legacy `CALIBER_SPAWNED` env still being written in 1.48.2.** Comment in `subprocess-sentinel.ts:21-23` says "drop in next minor release." 1.48.2 is well past that promised window. Either drop or update the comment.

- **[P2] Score-refine `--thorough` flag is undocumented in `caliber init --help`** (verify in pre-flight) — based on init.ts options interface, `thorough` is in `InitOptions` but README doesn't mention it.

## Open questions

- Should the pre-commit hook embed a version marker so re-installs can update? Or is the long-tail user base of "installed once, never upgraded" small enough that hand-running `caliber hooks --install --force` is acceptable?
- Is the score-refine loop intentionally gated behind `--thorough`, or did it default-on at some point and get reverted?
- Should `caliber refresh --quiet` write a one-line summary to stdout on failure (e.g. "caliber refresh skipped — model unavailable") even in quiet mode? Silent failure is worse than a noisy success.
