# Caliber install + value-prop audit — findings

**Date:** 2026-04-29
**Owner:** Alon Peretz
**Status:** Audit complete
**Design spec:** `docs/superpowers/specs/2026-04-29-caliber-install-audit-design.md`
**Implementation plan:** `docs/superpowers/plans/2026-04-29-caliber-install-audit.md`
**Per-task notes:** `docs/superpowers/specs/audit-notes/01-..-16-*.md`

---

## Executive summary

**Verdict: 🔴 RED — significant tech debt to clear before any messaging investment makes sense.**

The user's instinct was right. The README rewrite would have polished a flow that doesn't actually work end-to-end for a meaningful slice of users. The audit found **11 P0 bugs** that block or silently degrade the core value claim, and **4 of them combine** into a worst-case scenario where users get progressively more broken configs with no error signal.

**Three things to fix before touching the README:**

1. **The auth-strip regression breaks Vertex-backed Claude Code users.** `cleanClaudeEnv()` over-strips `CLAUDE_CODE_USE_VERTEX`, killing the entire init pipeline for enterprise Claude users running from inside Claude Code. Trivial code fix; massive ICP impact.
2. **Path-baking poisons every team-shared file.** Bootstrap and init both inject the user's `/Users/.../.nvm/.../caliber` absolute path into CLAUDE.md, skill files, and all CLI output. Teammates pulling these files get broken commands. The "team sync" promise breaks at the file-write layer.
3. **The deployed system silently fails for users on stale caliber versions.** Pre-commit hooks aren't auto-updated, so old hooks run old caliber, hit old bugs, and `|| true` swallows the failure. Configs drift further from reality with every commit.

**What works well:**

- **Generation reasoning is genuinely high quality.** When the system runs end-to-end on a working configuration, the produced CLAUDE.md / Cursor rules / copilot-instructions are codebase-specific, accurate, and capture real conventions. The cursor rules with proper frontmatter are at production quality.
- **Refresh logic itself is correct.** When invoked manually with patched source, it correctly identified a file rename and updated 6 docs across 3 agent formats with specific, useful changes — no churn.
- **The bootstrap → /setup-caliber flow worked end-to-end** (Path A on dogfood) — the agent correctly orchestrated the install, surfaced version delta, reported a meaningful score.
- **Most closed-issue fixes are verified in source** — env-var leakage handler, OpenAI `max_completion_tokens`, Cursor stream race fix, claude-cli timer fixes. Source quality is generally good. The gap is between source and what users actually run.

---

## Findings

### P0 — Blocks install or causes data-loss-like outcomes

#### F-P0-1: `cleanClaudeEnv()` strips `CLAUDE_CODE_USE_VERTEX`, breaking Vertex-backed auth

- **Reproduction:** Run `caliber init` from inside a Claude Code session where `CLAUDE_CODE_USE_VERTEX=1` is set in env. Init reports `Claude CLI exited with code 1. Not logged in. Run the login command for your provider to re-authenticate.` despite the user being authenticated. Confirmed reproducing in v1.48.2 source on this machine 100% of the time.
- **Root cause:** `src/llm/claude-cli.ts:85-93` — the regex `key.startsWith('CLAUDE_CODE_')` strips ALL Claude Code env vars including the auth-control ones (`CLAUDE_CODE_USE_VERTEX`, presumably also `CLAUDE_CODE_USE_BEDROCK`). The fix for #147 (anti-recursion env strip) over-strips.
- **Suggested fix:** Maintain an explicit `ANTI_RECURSION_VARS` allowlist (`CLAUDECODE`, `CLAUDE_CODE_SIMPLE`, `CLAUDE_CODE_SESSION_ID`, `CLAUDE_CODE_ENTRYPOINT`, `CLAUDE_CODE_EXECPATH`). Preserve everything else. Empirically validated by patching during this audit — patch made init proceed (and revealed the next P0).
- **Source notes:** `audit-notes/05-preflight.md`, `audit-notes/08-path-b-dogfood.md`

#### F-P0-2: `caliber init` times out on large-prompt repos

- **Reproduction:** Even with F-P0-1 patched, init on caliber-dogfood (314 files) hits `timeout_inactivity` after 2m9s with empty raw LLM output. Direct `claude -p` returns short responses fine in the same env.
- **Root cause:** `CALIBER_STREAM_INACTIVITY_TIMEOUT_MS=120000` (default) is too tight for the prompt size init builds for a 314-file project, especially via Vertex which appears to have higher TTFT than direct Anthropic. The full prompt includes file tree, code analysis, dependencies, existing configs — easily exceeds the model's "fast first token" window for big repos.
- **Suggested fix:** Scale inactivity timeout with prompt size, OR detect "no first token after 60s" and surface as a warning + proceed with longer wait (instead of failing). Also: the error message ("Model produced no output for…") should suggest the user can `export CALIBER_STREAM_INACTIVITY_TIMEOUT_MS=300000` — currently buried in `.caliber/error-log.md` only.
- **Source notes:** `audit-notes/08-path-b-dogfood.md`

#### F-P0-3: Bootstrap and init bake user's absolute caliber path into committable files

- **Reproduction:** Run `bootstrap` or `init` on any repo. Inspect `.claude/skills/find-skills/SKILL.md`, `.claude/skills/save-learning/SKILL.md`, and crucially `CLAUDE.md` content. All contain literal references to `/Users/<your-name>/.nvm/.../caliber` (or wherever caliber resolves on the install machine).
- **Root cause:** `src/lib/builtin-skills.ts:11, 65` — `getFindSkillsContent()` and `getSaveLearningContent()` call `resolveCaliber()` and embed the absolute path via template strings. `src/commands/init.ts:982-1009` does the same in user-facing CLI output. The "Before Committing" managed block in CLAUDE.md (via writers/pre-commit-block.ts) ALSO bakes the path.
- **Effect:** When teammate B pulls the repo, their CLAUDE.md says "Run `/Users/alonpe/.nvm/versions/node/v24.14.0/bin/caliber refresh`" — a path that doesn't exist on B's machine. Skill files reference the same dead path. Agents follow the instructions; commands fail. Caliber's "team sync" value claim breaks at file-write time.
- **Suggested fix:** `setup-caliber/SKILL.md` already does it right — uses `$CALIBER` shell variable resolved by the agent at runtime. Other skills + CLAUDE.md content should follow that pattern OR use bare `caliber` and rely on PATH.
- **Source notes:** `audit-notes/07-path-a-dogfood.md`, `audit-notes/12-path-b-synthetic.md`, `audit-notes/15-quality-synthetic.md`

#### F-P0-4: Pre-commit hook does NOT auto-update across caliber upgrades

- **Reproduction:** Install caliber 1.40.x. Run `caliber init`. Upgrade caliber to 1.48.x (`npm install -g @rely-ai/caliber`). Inspect `.git/hooks/pre-commit` — still has the 1.40.x format, missing post-1.40 features (auto-stage `.github/`, `.agents/`, `.opencode/`; stderr-to-log instead of `2>/dev/null`; `mkdir -p .caliber`).
- **Root cause:** `src/lib/hooks.ts:407-413` — `installPreCommitHook()` checks `isPreCommitHookInstalled()` (just looks for the marker comment) and **exits early** if found. No version check, no diff, no re-install path.
- **Effect:** Bug fixes and feature additions to the hook script never reach existing users via `npm update -g`. Combined with F-P0-5 below, this means deployed hooks silently run old caliber with old bugs.
- **Suggested fix:** Embed a version marker in the hook block (e.g. `# caliber:pre-commit:v1.48.2:start`) and re-install on mismatch. OR provide `caliber hooks --upgrade` and surface it as a recommendation when caliber detects a hook mismatch.
- **Source notes:** `audit-notes/03-generation-refresh-hooks.md`, `audit-notes/16-refresh.md`

#### F-P0-5: Pre-commit refresh fails silently on stale caliber + auth-strip combo

- **Reproduction:** With caliber 1.40.x installed (still has F-P0-1 unfixed) and a v1.48.2 hook NOT installed (per F-P0-4), run any commit in a Vertex-backed env. Hook runs `caliber refresh`, refresh hits the auth bug, exits 1, hook's `|| true` masks it, `2>refresh-hook.log` captures stderr (sometimes empty). User sees "caliber: refreshing docs..." then nothing — appears successful. Configs are NOT updated despite real source changes.
- **Root cause:** Multi-layered.
  1. Hook script in `getPrecommitBlock()` (`src/lib/hooks.ts:372-380`) uses `|| true` to prevent commit failure, but doesn't surface refresh failure.
  2. v1.40.4 has F-P0-1 unfixed, so refresh's LLM call fails.
  3. The `|| true` + `2>log` pattern masks the failure.
  4. No follow-up signal (state file marker, freshness check, etc.).
- **Effect:** Configs drift further from reality with every commit. User has no signal anything is wrong. The "auto-sync on every commit" value claim is silently violated.
- **Suggested fix:** Hook should print a one-liner on refresh failure even with `|| true`: `caliber: refresh skipped — see .caliber/refresh-hook.log`. Refresh on failure should write to `.caliber/.last-refresh-failure` so SessionStart freshness hook can warn.
- **Source notes:** `audit-notes/16-refresh.md`

#### F-P0-6: `learn finalize` skipped with "another caliber process is running" false positive (#150 regressed in deployed)

- **Reproduction:** Run any commit in a caliber'd repo with the v1.40.4 hook. Stdout includes `caliber: skipping finalize — another caliber process is running`. Reproduced 2/2 commits during the refresh test (Task 16).
- **Root cause:** v1.40.4 lock-detection had a self-PID false-positive bug. v1.48.2 source has the fix at `src/lib/lock.ts:35` (`if (pid === process.pid) return false`). But existing users on stale caliber never get the fix.
- **Effect:** Session learnings are never finalized for users on stale caliber. Mid-session learning extraction silently breaks. "Caliber learns from your sessions" claim is silently violated.
- **Suggested fix:** Same as F-P0-4 — fixing the auto-upgrade gap fixes this. Could also publish a one-time warning script to `npm install -g` so existing users see "your caliber is stale, run `caliber hooks --reinstall`."
- **Source notes:** `audit-notes/16-refresh.md`

#### F-P0-7: Phase 1 generation JSON-parse failure returns empty `{}` silently

- **Reproduction:** Trigger a malformed LLM response from Phase 1 generation (e.g. via a flaky model). User sees "Caliber is set up!" with empty configs. No error log.
- **Root cause:** Per explore agent's structural map of `src/ai/generate.ts:501-503` — `try/catch` returns `{}` on JSON parse failure. The init flow's `if (!generatedSetup)` check at `init.ts:643` doesn't fire because `{}` is truthy. Issue #142 was filed for this and closed without an apparent code fix.
- **Effect:** User receives a partially or fully empty config and is told it succeeded.
- **Suggested fix:** Throw on parse failure. Surface error to user and write to `.caliber/error-log.md`. Issue #142 should be re-opened with this evidence.
- **Source notes:** `audit-notes/03-generation-refresh-hooks.md`, `audit-notes/04-closed-issues.md`

#### F-P0-8: Phase 2 skill generation failures swallowed by `Promise.allSettled` (#142 root cause)

- **Reproduction:** Trigger a skill-generation failure (one of the parallel skill LLM calls fails). User gets a setup with that skill missing, no warning.
- **Root cause:** `src/ai/generate.ts:167-187` aggregates failures via `Promise.allSettled` and logs counts but doesn't surface to user. Issue #142 was filed for this and closed without code fix per source review.
- **Effect:** Users get incomplete configs claiming success. Same family as F-P0-7.
- **Suggested fix:** When `failedCount > 0`, surface in `printSetupSummary` (e.g. "Generated 3/5 skills — 2 failed: see `.caliber/error-log.md`"). When ALL skills fail, treat as generation failure.
- **Source notes:** `audit-notes/03-generation-refresh-hooks.md`, `audit-notes/04-closed-issues.md`

#### F-P0-9: SessionEnd hooks cancel on every interactive `claude -p` invocation

- **Reproduction:** In any caliber'd repo, run `claude -p "respond ok"` from a regular shell. After the response prints, stderr emits `SessionEnd hook [caliber refresh --quiet] failed: Hook cancelled` and `SessionEnd hook [caliber learn finalize --auto] failed: Hook cancelled`. Wall-clock takes ~16 seconds for what should be a sub-second response.
- **Root cause:** SessionEnd hooks (`caliber refresh --quiet`, `caliber learn finalize --auto`) try to do real LLM work. Claude Code's hook timeout fires before they finish. The subprocess-sentinel pattern only protects SECOND-level recursion (caliber-spawned-claude → SessionEnd → caliber → spawn-claude), not first-level user-initiated `claude -p`.
- **Effect:** Every `claude -p` invocation in a caliber'd repo emits 2 visible "Hook cancelled" stderr lines and adds ~10–15s latency. Daily friction. Reasonable user concludes "caliber is broken."
- **Suggested fix:** SessionEnd hooks should be no-LLM by default — just write a state file marker. Defer LLM work to the next caliber invocation. OR hooks should detect "headless `claude -p` user invocation" (different from caliber-spawned) and short-circuit.
- **Source notes:** `audit-notes/05-preflight.md`

#### F-P0-10: CLAUDE.md content has duplicated sections after init + refresh

- **Reproduction:** Run `caliber init` on a fresh repo. Inspect generated CLAUDE.md. Sections like "Before Committing", "Session Learnings", "Context Sync", "Model Configuration" appear TWICE — once unmarked and once inside `<!-- caliber:managed:* -->` markers.
- **Root cause:** Init likely inlines the sections via the LLM prompt context, and the subsequent managed-block injection (writers/pre-commit-block.ts:appendManagedBlocks) ADDS them again instead of detecting and replacing the existing inlined content.
- **Effect:** ~50 lines of redundant content per CLAUDE.md. The unmarked copies will be edited by future LLM refreshes; the marked copies are protected. Both visible to the agent — confusing instructions about "if hook-active" appear twice.
- **Suggested fix:** `appendManagedBlocks` should detect content matching the managed-block content (via content hash or section heading match) and de-duplicate before adding markers.
- **Source notes:** `audit-notes/15-quality-synthetic.md`

#### F-P0-11: All "init succeeds" + "Caliber is set up" claims happen even if generation produced empty/incomplete output

- **Reproduction:** Caused by F-P0-7 + F-P0-8 in combination. User gets the celebratory "Caliber is set up!" output even if the LLM produced nothing useful.
- **Root cause:** No post-generation sanity check — `init.ts` trusts that if `generatedSetup` is non-null and the score didn't regress, the run succeeded.
- **Effect:** Trust erosion when user notices their CLAUDE.md is empty/wrong despite the success message.
- **Suggested fix:** After generation, validate that key files have content > a minimum size. If suspiciously empty, surface as warning before celebrating.
- **Source notes:** `audit-notes/15-quality-synthetic.md`, `audit-notes/03-generation-refresh-hooks.md`

### P1 — Degrades trust or causes partial failures

- **F-P1-1: Init's "Step 1/3" header doesn't match the actual 4-step flow** (`init.ts:137`). Trivial fix. (`audit-notes/01-install-entry-points.md`)
- **F-P1-2: `derivePermissions` is hardcoded** (`init-helpers.ts:31-74`). Contradicts the project's "no hardcoded mappings" principle. (`audit-notes/01-install-entry-points.md`)
- **F-P1-3: Pre-commit hook installs BEFORE the user opts into config generation** — declining "Generate?" still leaves the hook active. (`audit-notes/01-install-entry-points.md`)
- **F-P1-4: Special-case Copilot warning fires AFTER selection** in init.ts:239-247; the agent picker label disambiguation already covers it. Redundant noise. (`audit-notes/01-install-entry-points.md`)
- **F-P1-5: Postinstall message and README contradict each other** — README leads with `bootstrap`; postinstall says `config` then `init`. Three different "first commands." (`audit-notes/01-install-entry-points.md`)
- **F-P1-6: Score-regression auto-revert can hide partial-generation bugs.** Silently undoes generation that scored slightly lower. (`audit-notes/01-install-entry-points.md`)
- **F-P1-7: Char-based token estimation in 3 of 7 providers** (claude-cli, cursor, opencode). Estimated counts diverge from reality 10–30%. (`audit-notes/02-providers.md`)
- **F-P1-8: `isCursorLoggedIn()` skips the subprocess sentinel** — inconsistent with the rest of `cursor-acp.ts`. Latent bug if Cursor adds analogous env vars. (`audit-notes/02-providers.md`)
- **F-P1-9: Login-status caches are stale-vulnerable** — claude-cli, opencode cache `loggedIn=true` for process lifetime; mid-session token expiration is invisible. (`audit-notes/02-providers.md`)
- **F-P1-10: `validateModel()` skipped for seat-based providers** — a misconfigured Claude CLI model name fails 30s into init instead of fail-fast. (`audit-notes/02-providers.md`)
- **F-P1-11: `handleModelNotAvailable` cannot recover in non-interactive mode** — pre-commit hooks, CI, `--auto-approve` all hit a dead end on model errors. (`audit-notes/02-providers.md`)
- **F-P1-12: Vertex `listModels()` not implemented** — limits model recovery to 5 hardcoded fallback names that go stale. (`audit-notes/02-providers.md`)
- **F-P1-13: OpenAI provider doesn't track cache tokens** — OpenAI cache savings invisible in usage display. (`audit-notes/02-providers.md`)
- **F-P1-14: Default `caliber init` doesn't use the score-refine loop** — only `--thorough` does. README implies it's automatic. (`audit-notes/03-generation-refresh-hooks.md`)
- **F-P1-15: Refresh prompt cap at 60k chars truncates important content silently** when total existing-doc content exceeds budget. Big-skill repos lose tail content. (`audit-notes/03-generation-refresh-hooks.md`)
- **F-P1-16: Pre-commit hook's caliber-binary resolution baked at install time.** `if [ -x "/Users/alonpe/.nvm/.../caliber" ]` — silent no-op when path is invalid. (`audit-notes/03-generation-refresh-hooks.md`, `audit-notes/16-refresh.md`)
- **F-P1-17: Path A end-to-end latency is ~5 minutes on a happy-path machine.** README's "one-time, 2 seconds" sets wrong expectation. `claude -p` headless mode hides progress. (`audit-notes/07-path-a-dogfood.md`)
- **F-P1-18: `claude -p` headless invocation hides agent's tool calls.** No progress feedback during 5-min setup. (`audit-notes/07-path-a-dogfood.md`)
- **F-P1-19: Init's pre-LLM steps (skill writes) succeed even when LLM step fails.** Partial-state on failed init — user has no signal to undo. (`audit-notes/08-path-b-dogfood.md`)
- **F-P1-20: `detect.ts` returns "no languages" for a clearly-TypeScript project** — symptom of family-E silent failure. (`audit-notes/08-path-b-dogfood.md`)
- **F-P1-21: "Update available" banner prints inside pre-commit hook output, twice per commit.** Noise on every commit. (`audit-notes/16-refresh.md`)
- **F-P1-22: CLAUDE.md is bloated for tiny repos** (136 lines for 7-file project) due to F-P0-10 duplicates. (`audit-notes/15-quality-synthetic.md`)

### P2 — Polish

- F-P2-1: Codex stub generation duplicated in init.ts and setup-files.ts. (`audit-notes/01-install-entry-points.md`)
- F-P2-2: postinstall.js doesn't run on npx — README leads with npx, so first-impression message is empty. (`audit-notes/01-install-entry-points.md`)
- F-P2-3: API key prompts not masked in `interactive-provider-setup.ts`. (`audit-notes/01-install-entry-points.md`)
- F-P2-4: bootstrap defaults to claude when no platforms detected — a Cursor-only user gets claude skills. (`audit-notes/01-install-entry-points.md`)
- F-P2-5: refineLoop has no max iterations — bounded only by user typing "done". (`audit-notes/01-install-entry-points.md`)
- F-P2-6: OpenCode binary cannot become absolute path on Windows without breaking. Latent footgun. (`audit-notes/02-providers.md`)
- F-P2-7: AnthropicProvider's `max_tokens` differs between call (4096) and stream (10240). Should be one constant. (`audit-notes/02-providers.md`)
- F-P2-8: Vertex client timeout hardcoded to 10 minutes — no env override. (`audit-notes/02-providers.md`)
- F-P2-9: Token usage tracking is in-memory only — no per-day/week aggregation for seat-based users. (`audit-notes/02-providers.md`)
- F-P2-10: `KNOWN_MODELS` go stale silently — Vertex names are 11 months old. (`audit-notes/02-providers.md`)
- F-P2-11: `parseJsonResponse` is fragile to LLM markdown wrapping — multi-line nested fences slip through. (`audit-notes/02-providers.md`)
- F-P2-12: Provider count mismatch between README (5) and code (7 — adds OpenCode + MiniMax). (`audit-notes/02-providers.md`)
- F-P2-13: Refinement loop has no total timeout. Stuttering model could keep extending inactivity timer. (`audit-notes/03-generation-refresh-hooks.md`)
- F-P2-14: Refresh max_tokens hardcoded to 16384 — large refreshes silently truncated. (`audit-notes/03-generation-refresh-hooks.md`)
- F-P2-15: Stop hook flag-file naming has 8-char SHA hash — collision possible with low probability. (`audit-notes/03-generation-refresh-hooks.md`)
- F-P2-16: Legacy `CALIBER_SPAWNED` env still being written — comment promised to drop. (`audit-notes/03-generation-refresh-hooks.md`)
- F-P2-17: `--thorough` flag undocumented in `caliber init --help`. (`audit-notes/03-generation-refresh-hooks.md`)
- F-P2-18: Bootstrap output lists files verbose — too much noise for "give me the skill" intent. (`audit-notes/07-path-a-dogfood.md`)
- F-P2-19: Agent's summary said `caliber refresh` runs every commit but actual hook runs `caliber refresh --quiet`. Minor accuracy gap. (`audit-notes/07-path-a-dogfood.md`)
- F-P2-20: Cross-agent parity inconsistent — managed-block injection only runs for Claude, not Copilot. (`audit-notes/15-quality-synthetic.md`)
- F-P2-21: Agent caught user-specific preferences from global CLAUDE.md (Python venv) and put them in a team artifact. May not be desired. (`audit-notes/15-quality-synthetic.md`)
- F-P2-22: No-op commit doesn't cause churn ✓ (positive observation, no fix needed). (`audit-notes/16-refresh.md`)

---

## Provider matrix

| Provider | Live tested | Code audited | Status | Risk flags |
|----------|-------------|--------------|--------|------------|
| Claude CLI seat | yes (failed both Path B configs in this env) | yes | 🔴 BROKEN for Vertex-backed users | F-P0-1 (auth strip), F-P1-9 (cache), F-P1-10 (validateModel skip), F-P0-9 (SessionEnd cascade) |
| Anthropic API | no | yes | 🟡 source looks healthy | F-P1-13 (no cache tracking), F-P2-7 (max_tokens inconsistency) |
| Cursor seat | no | yes | 🟡 source looks healthy, file misnamed (acp not used) | F-P1-7 (char-based tokens), F-P1-8 (sentinel skip) |
| OpenAI | no | yes | 🟡 #155 fix verified | F-P1-13, F-P2-6 |
| Vertex AI | no | yes | 🟡 functional but feature-incomplete | F-P1-12 (no listModels), F-P2-8 (timeout hardcoded) |
| MiniMax | no | minimally | ⚠️ unknown — small file, not deeply read | Not in README; unclear maturity |
| OpenCode | no | yes | 🟡 source looks healthy | F-P1-7, F-P2-6 |

---

## Generation quality summary

| Repo | Init outcome | Specificity | Accuracy | Cross-agent parity | Verdict |
|------|--------------|-------------|----------|--------------------|---------|
| caliber dogfood | ❌ FAILED at LLM step (auth, then timeout) | n/a | n/a | n/a | Cannot evaluate — system never produced output |
| vercel/swr | not tested (deferred — same env constraints would apply) | n/a | n/a | n/a | n/a |
| synthetic | ✅ SUCCESS | high — captures real conventions, file paths, ESM extension | 4/5 sample paths exist (1 was renamed) | good but inconsistent (CLAUDE.md duplicated, copilot not) | 🟢 Quality is genuinely valuable when system works |

**Key insight:** generation reasoning is high quality. The audit's failure was structural (auth bug + path baking + duplicates), not LLM-quality. When the pipeline runs end-to-end, the output is meaningful.

---

## Auto-refresh summary

- **Pre-commit hook fires reliably:** ✅ yes (3.5s overhead per commit)
- **Updates configs to reflect renamed files:** ❌ NO when running through deployed v1.40.4 hook (silent failure due to F-P0-1+F-P0-5). ✅ YES when running v1.48.2 source manually (correctly updated 6 docs across 3 agent formats with specific rename references).
- **No spurious changes on no-op commits:** ✅ yes
- **No recursive hook cascade observed during commit:** ✅ yes (subprocess sentinel works)
- **#171 cascade reproducing on user-initiated `claude -p`:** ❌ yes (F-P0-9)
- **#150 lock false-positive reproducing in deployed v1.40.4:** ❌ yes (F-P0-6) — fix is in source but doesn't reach deployed users

---

## Install model recommendation

Based on observations from Path A and Path B across the repos tested:

**Recommendation:** Keep both `bootstrap` and `init` as separate commands but **bless one as the headline**. Currently the README leads with `bootstrap` → `/setup-caliber`, postinstall leads with `init`, and FAQ acknowledges the confusion. Pick one:

**Option A — bless `bootstrap → /setup-caliber`** (the README's current lead). Reasons in favor:
- Agent-driven setup naturally surfaces issues (the agent runs `caliber score`, etc., and reports problems).
- Lower friction for the eng-team-mixed-agents ICP — the team's first agent invocation is the install.
- 5-min latency is hidden behind a "your agent is working on it" feel rather than a stalled CLI spinner.

Reasons against:
- Excludes Copilot-only users (no Claude CLI / Cursor agent).
- Headless `claude -p` mode (when used for automation) hides progress.

**Option B — bless `init` (CLI wizard)** (postinstall's current lead). Reasons in favor:
- Works without any agent CLI installed.
- Live progress UI (the parallel-task display).
- Direct user control; no agent-mediated translation.

Reasons against:
- All the bugs from this audit live here (F-P0-1, F-P0-2, F-P1-19, F-P1-20).
- "Headless" experience for a tool that's meant to glue your agents to your code is contradictory.

**My recommendation: ship Option A but FIX the underlying bugs first.** Right now neither Option A nor Option B is reliable enough for a confident messaging redesign. The audit's P0 fixes — once landed — make Option A the more compelling choice for the team-mixed-agents ICP.

---

## Open product questions

Decisions required before fixes can be planned:

1. **Pre-commit hook auto-update strategy.** Embed version markers + re-install on mismatch? Or surface upgrade nudges in `caliber score`? Or `npm postinstall` script that detects existing hooks and refreshes them?

2. **`cleanClaudeEnv()` allowlist scope.** Strip only known anti-recursion vars (preserving auth vars for Vertex/Bedrock/future)? Or maintain an allowlist that future Claude Code releases need to be aware of?

3. **SessionEnd hook policy.** Keep doing LLM work in hooks (current — broken for first-level interactive `claude -p`)? Move to deferred-work model (state-file markers, work happens at next caliber invocation)? Or remove hooks entirely and rely on the pre-commit hook?

4. **Path-baking strategy.** Continue resolving caliber to absolute path at install (current — breaks for teams)? Use bare `caliber` and rely on PATH (current Anthropic/etc. providers already do this)? Or hybrid — absolute for hooks, bare for shared content?

5. **Are issues #142 and #143 fixed or wontfix?** Source review suggests they're still present. Verify and either re-open or document as accepted-risk.

6. **MiniMax provider visibility.** It's in the picker but absent from the README. Hide until first-class, or ship to README?

7. **Agent skill upgrade strategy.** Skills installed by bootstrap don't track the caliber version that wrote them. When skill content changes (e.g. new `caliber learn` flag), how do existing installs upgrade?

8. **Claude Code subprocess detection beyond CLAUDE_CODE_*.** F-P0-9 shows the subprocess sentinel only catches second-level recursion. Is there a way to detect "this `claude -p` was user-initiated" (e.g. parent process is the user's shell) so SessionEnd hooks can short-circuit appropriately?

---

## Appendix: Notes index

- 01 — Install entry-point source audit
- 02 — Provider integrations audit
- 03 — Generation, refresh, hooks audit
- 04 — Closed-issue pattern extraction
- 05 — Pre-flight environment snapshot (with one P0 finding from pre-flight smoke test)
- 06 — Test repo setup
- 07 — Path A on caliber dogfood (succeeded)
- 08 — Path B on caliber dogfood (failed: auth, then timeout)
- 12 — Path B on synthetic (succeeded with auth patch)
- 15 — Generation quality eval — synthetic
- 16 — Auto-refresh test (refresh works in source, fails through deployed hook)

**Notes-files NOT produced:** `09-path-a-swr.md`, `10-path-b-swr.md`, `11-path-a-synthetic.md`, `13-quality-dogfood.md`, `14-quality-swr.md`. Skipped because the same bugs surfaced in completed tests; remaining tests would not add new signal.

**Source patch in place during audit:** `src/llm/claude-cli.ts` had a temporary `PRESERVE_AUTH_VARS` allowlist added to `cleanClaudeEnv()` to enable the remaining live tests after F-P0-1 was discovered. **The patch will be reverted in a follow-up commit before the audit branch is merged.**
