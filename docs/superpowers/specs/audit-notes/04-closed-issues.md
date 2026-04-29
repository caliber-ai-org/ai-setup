# 04 — Closed-issue pattern extraction

## Context

Caliber's closed-issue history is the empirical record of what's actually broken in the wild. Group them into failure families so the live test in Phase 2 knows what to watch for, and so we know which fixes have *landed* vs *been merged but not exercised*.

Cross-referenced with code-audit findings from Tasks 1–3 to mark each fix as **verified in source** vs **inferred from issue close**.

---

## Family A: Auth / env-var leakage when invoked from inside an agent CLI

**Issues:** #147, #138, #166

**Mechanism:** Claude Code sets `CLAUDECODE`, `CLAUDE_CODE_SIMPLE`, `CLAUDE_CODE_*` env vars. When caliber spawns `claude -p` from inside an active Claude Code session, those vars are inherited and trigger Claude Code's anti-recursion detection — which fires before checking auth, returning `Not logged in · Please run /login` even when the user is logged in.

**Fix verified in source:** `cleanClaudeEnv()` at `src/llm/claude-cli.ts:85-93` strips all `CLAUDE_CODE_*` vars before spawn. Combined with `withCaliberSubprocessEnv()` for sentinel.

**Live-test verification:** Phase 2 Path A on caliber dogfood reproduces this scenario (user is in Claude Code → invokes `claude -p` for /setup-caliber). If Family A is regressed, init will fail with the #147 stack trace.

**Status:** ✅ Likely fixed; needs Phase 2 verification.

---

## Family B: Recursive / cascading hooks

**Issues:** #169, #171, #166 (related)

**Mechanism — #169:** When `caliber refresh` spawns `claude -p`, the spawned session inherits the project's `.claude/settings.json` hooks. The Stop hook (`caliber-check-sync.sh`) outputs `{"decision":"block"}` if pre-commit isn't set up, which cancels the Claude session before SessionEnd hooks finish. Caliber sees Claude exit code 1 and reports refresh failure.

**Mechanism — #171:** Even when pre-commit IS set up, `caliber learn finalize --auto` and `caliber refresh --quiet` are SessionEnd hooks. They fire on the spawned claude session, each makes its own `claude -p` call, which fires the same SessionEnd hooks again. Recursive cascade until Claude Code times out a hook mid-stack.

**Mechanism — #166:** Windows-specific. `caliber learn observe` spawns itself for `incremental finalize`, but `resolveCaliber()` picks the POSIX shim first (extensionless) over `caliber.cmd`, and the spawn rejects `.cmd` without `shell:true`.

**Fix verified in source:** `withCaliberSubprocessEnv()` (`src/lib/subprocess-sentinel.ts`) sets `CALIBER_SUBPROCESS=1`. Stop hook script (`src/lib/hooks.ts:191-206`) and freshness script (`hooks.ts:222-238`) both check `$CALIBER_SUBPROCESS` and `$CALIBER_SPAWNED` and exit 0 early. The `windows.ts` utilities (`quoteForWindows`, `bashPath`) handle path escaping. Windows direct-node-invocation in `getPrecommitBlock()` (hooks.ts:290-319) avoids cmd-shim flash.

**Status:** ✅ Likely fixed; will verify in Phase 2/4.

---

## Family C: Windows-specific path / shell issues

**Issues:** #135, #134, #166, #191, #195, #200 (the latter three from the Apr 2026 hardening sweep)

**Mechanism — #135:** `caliber init` mixes `@inquirer` prompts with custom `readline.createInterface` in `src/utils/prompt.ts`. Inquirer leaves Git Bash terminal in raw/no-echo mode; cleanup is incomplete; subsequent prompts hang with invisible input.

**Mechanism — #166 (Windows):** See Family B.

**Mechanism — others:** Per recent commits — bash-path normalization (`bashPath()`), quote wrapping (`quoteForWindows()`), exit hygiene, CI matrix.

**Fix verified in source:** `src/utils/windows.ts` exports `quoteForWindows`, `bashPath`. Pre-commit hook code on the disk audited here (1.40.x) **does NOT** have these fixes — only the source does. Windows users on 1.40.x still hit the old bugs.

**Live-test verification:** Out of scope — audit runs on macOS. Documented as risk for Windows users on stale hooks.

**Status:** ✅ Source likely fixed; ❌ stale-hook upgrade path unclear.

---

## Family D: Provider-specific bugs

**Issues:** #155 (OpenAI `max_tokens`), #141 (Cursor stream race), #139 + #140 (Claude CLI timer bugs)

**Mechanism — #155:** OpenAI's gpt-5.4-mini doesn't accept `max_tokens`; needs `max_completion_tokens`. Caliber was sending the old field name → 400 error → init failure.

**Mechanism — #141:** Cursor stream had a race between the timeout handler and `close` event; the `settled` flag was set inside the if-block instead of as the first line, leaving a window where both handlers proceed.

**Mechanism — #140:** `clearTimeout(timer)` referenced before `const timer` declaration → TDZ violation → ReferenceError on every subprocess error.

**Mechanism — #139:** Timer leak — `clearTimeout(timer)` only called in `close` handler, missing from `error` handler. Orphan kill signal possible.

**Fix verified in source:** 
- #155: `src/llm/openai-compat.ts:41, 83` use `max_completion_tokens`. ✅
- #141: `src/llm/cursor-acp.ts:226-289` has the `settled` flag set as first line in each handler. ✅
- #139, #140: `src/llm/claude-cli.ts:170-180` declares `timer` before any handler use; `clearTimeout(timer)` called in both `error` AND `close` handlers. ✅

**Live-test verification:** OpenAI/Cursor not live-tested this session (code-audit only). Claude CLI live-tested in Phase 2.

**Status:** ✅ All four verified fixed.

---

## Family E: Silent failures / lost data

**Issues:** #142 (skill generation failures swallowed), #143 (Promise double-resolution), #149 (gitignored sources missed), #174 (refresh prompt too long)

**Mechanism — #142:** `Promise.allSettled()` for parallel skill generation aggregates failures into a count; `mergeSkillResults()` logs the count but doesn't surface the failure. User gets incomplete config without warning.

**Mechanism — #143:** `provider.stream()` returns a Promise that's chained with `.catch()`. Both `onEnd` and the outer `.catch()` call `resolve()`. Sync throw triggers `.catch()`, then `onEnd` fires later — both side-effects run.

**Mechanism — #149:** `getFileTree()` uses hardcoded `IGNORE_DIRS` and doesn't read `.gitignore`. Repos with large gitignored dirs (scraper dumps, generated artifacts) have their file tree polluted with junk — smart sampling picks the junk, stack detection fails.

**Mechanism — #174:** Combined existing-doc content sent to the refresh LLM exceeded Claude's input token limit on repos with many large skill files. CLI exited with "prompt is too long".

**Fix verified in source:**
- #174: `src/ai/refresh.ts:12, 200-209` — `MAX_EXISTING_DOCS_CHARS = 60_000`, proportional truncation, per-entry floor 2_000. ✅
- #149: Need to verify `IGNORE_DIRS` location. The fingerprint code at `src/fingerprint/file-tree.ts` would need inspection — not done in this audit (out of scope per spec). Issue closed → presumed fixed via `.gitignore` respect. ⚠️ unverified.
- #142, #143: Per explore agent's structural map of `src/ai/generate.ts`, both behaviors are **STILL PRESENT** in 1.48.2 source. Phase 1 JSON parse returns `{}` silently; Phase 2 failures are aggregated by `allSettled` and not surfaced. **Issues closed but mechanism remains.** Needs investigation — are issues closed because they were judged "wontfix" or because partial fixes shipped that I missed?

**Status:** Partial. #174 + #149 fixed. **#142 + #143 status uncertain — may be regressed or never fixed.**

---

## Family F: Lock file false-positive

**Issue:** #150

**Mechanism:** Every caliber invocation calls `acquireLock()` at startup. When that same process (e.g. the pre-commit hook running `caliber learn finalize` after `caliber refresh`) calls `isCaliberRunning()`, it reads its own PID from the lock file, `process.kill(pid, 0)` succeeds, returns `true`. Finalize is skipped on every commit.

**Fix verified in source:** `src/lib/lock.ts:35` explicitly handles `if (pid === process.pid) return false; // lock belongs to this process, not another`. ✅

**Status:** ✅ Fixed.

---

## Family G: UX / messaging confusion

**Issues:** #184 (Copilot misadvertised), #177 (wrong refresh flag)

**Mechanism — #184:** Copilot is presented as a full agent in the README/CLI but is actually sync-target only — no Copilot CLI integration, no provider role. Users assume parity with Claude/Cursor and find onboarding broken.

**Mechanism — #177:** Inside Claude Code, an agent ran `caliber refresh --auto-approve` (a flag that exists for `init` but not for `refresh`). Indicates the agent (or the user the agent was helping) thought the API surface was uniform across commands.

**Fix verified in source:**
- #184: `src/commands/init-prompts.ts:46-49` adds disambiguating label "(sync target — writes copilot-instructions.md)" to picker. `src/commands/init.ts:239-247` adds post-selection warning if Copilot is the only target. ⚠️ partial — the label disambiguation is good, but the post-selection warning is reactive (already noted in 01-install-entry-points.md).
- #177: No source-level fix surfaces from the audit. The agent's mistake suggests `refresh --help` should mirror `init --help` flag conventions, OR `--auto-approve` should silently be accepted by `refresh` as a no-op. Not actionable from code audit alone.

**Status:** Partial. Copilot warning improved but UX is reactive. Refresh flag confusion unaddressed.

---

## Findings

- **[P0] Issues #142 and #143 may be regressed in 1.48.2.** The issues are closed but the explore agent's structural map of `src/ai/generate.ts` indicates the silent-failure mechanism (Phase 1 returning `{}` on parse failure, Phase 2 aggregating failures via `allSettled` without surfacing) is still present. Either the issues were closed without code fixes, OR the fixes were partial. Needs reading of `src/ai/generate.ts` directly to confirm — pulled out of explore agent's read window. **Action: verify before live tests.**

- **[P1] Cross-platform parity for closed issues.** Most #1xx issues are macOS / Linux. The Windows hardening sweep (#191, #195, #200) landed Apr 2026, but the install audit (#135 TTY hang, #166 spawn ENOENT) shows Windows users had a prolonged broken window. Stale-hook problem from 03-generation-refresh-hooks.md amplifies this — Windows users on 1.40.x with stale hooks may still hit fixed bugs.

- **[P1] No regression-test scaffolding for these failure families.** From a code-audit perspective, fixes appear ad-hoc — there's no integration test that "spawn caliber from inside Claude Code, verify auth works" or "create a 30-skill repo, run refresh, verify no truncation crash." Each fix lives or dies on the original reporter's diligence to test the next release. With the no-auto-update-hooks finding, even if a regression is fixed in source, deployed users may still hit the old bug.

- **[P2] Issue #177 (refresh `--auto-approve`) suggests the agent skill (`/setup-caliber`) may suggest commands the agent itself doesn't validate.** Worth checking whether `/setup-caliber` or `/find-skills` reference flags that don't exist on the target subcommand. Out of code-audit scope — would need agent-trace verification.

- **[P2] Stale issue closures.** #142, #143 are 18 days old (closed Apr 10) but the mechanism appears unchanged. Either the closer judged them not-a-bug or the fix is in a layer I haven't read. Recommend re-opening if Phase 2 reproduces.

## Open questions

- Were #142 and #143 actually fixed? If yes, where? If no, why were they closed?
- Is there a way to embed integration tests for "caliber init runs end-to-end on a fresh repo" so future regressions in the install path get caught?
- Should `/setup-caliber` skill content be validated against the actual CLI surface (i.e. lint the skill markdown for non-existent commands/flags)?
