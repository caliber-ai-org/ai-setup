# Caliber install + value-prop audit — design

**Date:** 2026-04-29
**Owner:** Alon Peretz
**Status:** Approved, ready for execution

---

## Background

A development team trying out Caliber reported that:
- Installation wasn't straightforward
- They didn't understand what was going on during setup
- The value of the tool wasn't clear
- They didn't know what they could do with it after install

Initial framing was "fix the messaging." After review, the directive shifted: **prove the technology actually works end-to-end before polishing the messaging.** A README rewrite on top of a fragile install flow would just make the broken parts more discoverable.

This document defines the audit that validates Caliber's install + generation + auto-refresh paths against real conditions. Messaging redesign is out of scope and deferred until the audit's findings are addressed.

## Goal

Produce a single, prioritized findings doc that answers four questions for the eng-team-mixed-agents ICP:

1. Does the install actually reach a working state from every advertised entry point?
2. Are the generated configs codebase-specific and useful, or generic boilerplate?
3. Does auto-refresh on commit keep configs accurate without churn or recursive failures?
4. Where do the multi-provider claims hold up vs break?

## Non-goals (deferred)

- README / CLI messaging rewrite — only revisited after audit findings ship as fixes.
- Implementing the fixes themselves — separate brainstorm + plan once findings are in.
- GitHub Action / `caliber-sync.yml` validation — only included if the install audit surfaces it as a failure point.
- New onboarding features (e.g. interactive demo, web preview) — out of scope.

## ICP anchor

Decisions throughout this audit are evaluated against: **an engineering team using a mix of Claude Code, Cursor, and GitHub Copilot, with at least one engineer adopting Caliber and rolling it out to the rest of the team.** When a tradeoff has a "solo dev" answer and a "team" answer, the team answer wins.

## Methodology — four phases

### Phase 1 — Code + closed-issue audit *(read-only)*

Walk through the install + generation + refresh source paths and cross-reference against closed issues to extract recurring failure patterns.

**Source files in scope:**
- `src/commands/bootstrap.ts`
- `src/commands/init.ts` (~1024 lines — the main flow)
- `src/commands/init-helpers.ts`, `init-prompts.ts`, `init-display.ts`, `interactive-provider-setup.ts`, `setup-files.ts`
- `src/commands/refresh.ts`
- `src/lib/hooks.ts`, `src/lib/learning-hooks.ts`
- `src/llm/config.ts` (provider resolution + env detection)
- All five providers: `src/llm/claude-cli.ts`, `cursor-acp.ts`, `anthropic.ts`, `openai-compat.ts`, `vertex.ts`
- `src/ai/generate.ts`, `src/ai/refine.ts`, `src/ai/refresh.ts`, `src/ai/prompts.ts`
- `scripts/postinstall.js`
- `skills/setup-caliber/SKILL.md`

**Closed-issue pattern extraction:** #147, #184, #138, #149, #135, #155, #171, #169, #166, #177, #150, #142, #143, #141, #140, #139.

**Output:** A "failure surface map" — categorized list of known failure modes with which code path they originate from.

### Phase 2 — Live install matrix *(end-to-end runs)*

Three test repos, all run with the **Claude CLI seat** provider (the historical fragility hotspot per #147 / #138).

| # | Test repo | Why this target |
|---|-----------|-----------------|
| 1 | Synthetic small repo in `/tmp` (TS + Python, contains `.claude/` `.cursor/` `.github/` dirs) | Controlled baseline, mimics mixed-agent eng team layout |
| 2 | Fresh clone of `caliber` itself in `/tmp` | Dogfood: real TypeScript codebase with existing configs we can compare generated output against |
| 3 | Fresh clone of `vercel/swr` in `/tmp` | Real OSS repo, ~10k LOC, no prior Caliber config — true cold-start representative of an eng team trying Caliber on their own codebase |

**Per repo, capture for each step:**
- Exact prompts shown to user
- Stdout / stderr output
- Latency
- Silent vs loud failures
- Generated file paths and contents
- Resulting `caliber score` value
- Time-to-first-useful-output

**Install paths tested (both, per repo):**

- **Path A — README headline:** `npx @rely-ai/caliber bootstrap` → `/setup-caliber` invoked inside a Claude Code session. This is the path the README leads with, and the one with the most CLI ↔ IDE surface area.
- **Path B — CLI wizard:** `npx @rely-ai/caliber init`. Advertised as the alternate for users without an agent CLI; also referenced in the postinstall message after `npm install -g`. Tests the standalone CLI path.

A third advertised path — `npm install -g @rely-ai/caliber` → `caliber config` → `caliber init` — overlaps with Path B downstream of the global install. We treat Path C as a code-audit-only path; if Path B works end-to-end, Path C's marginal risk is the postinstall message itself, which is read-only.

### Phase 3 — Generation quality eval

For each test repo's generated output, grade against:

- **Specificity:** does it reference real files, real conventions, real tooling visible in the codebase, or is it generic?
- **Accuracy:** do referenced paths exist on disk? Are commands runnable?
- **Cross-agent parity:** for repos targeting Claude + Cursor + Copilot, are the three outputs equally useful or is one obviously degraded?
- **Comparison:** for the caliber dogfood test, compare generated `CLAUDE.md` against the existing hand-written `CLAUDE.md` for fidelity.

### Phase 4 — Auto-refresh test

In one test repo (caliber dogfood is the strongest signal):

1. Make a representative code change (rename a file, add a dependency, modify a command)
2. Stage and commit
3. Observe the pre-commit hook firing
4. Inspect the diff applied to the configs
5. Repeat with a no-op commit to test churn

Verify: hook fires, refresh updates only what changed, no recursive Stop hook (#171), no spurious changes.

## Multi-provider matrix

| Provider | Method | Why |
|----------|--------|-----|
| Claude CLI seat | **Live test** | User-selected; historical hotspot for env-leakage bugs |
| Anthropic API key | Code audit only | Easiest to live-test in follow-up; lowest risk |
| Cursor seat | Code audit only | Cursor ACP integration has its own quirks (timestamp_ms doubling, `--workspace /tmp` workaround) |
| OpenAI | Code audit only | #155 surfaced `max_tokens` vs `max_completion_tokens` bug — verify fix and check siblings |
| Vertex AI | Code audit only | `listModels()` not implemented (TODOS.md P3), unknown live behavior |

## Deliverable

Single audit doc at `docs/superpowers/specs/2026-04-29-caliber-install-audit-findings.md` containing:

1. **Executive summary** — top-line readiness verdict (green / yellow / red) for shipping a messaging redesign on top of the current tech.
2. **Findings table**, each entry:
   - Severity (P0 = blocks install / causes data-loss-like outcome, P1 = degrades trust or partially fails, P2 = polish)
   - Reproduction steps
   - Root cause (file + lines if known)
   - Suggested fix
3. **Provider matrix** — live-tested vs code-audited, with risk flags per provider for what we couldn't verify.
4. **Install model recommendation** — should `bootstrap` and `init` consolidate? Deprecate one? Merge into a single command?
5. **Open product questions** — decisions that block fixes.

## Phasing for this session

| Phase | Target | Status |
|-------|--------|--------|
| Phase 1: Code audit | All listed files + issue cross-ref | This session |
| Phase 2: Live install — synthetic | `/tmp` synthetic TS+Python repo | This session |
| Phase 2: Live install — caliber dogfood | Fresh `/tmp` clone | This session |
| Phase 2: Live install — vercel/swr | Fresh `/tmp` clone | This session |
| Phase 3: Generation quality eval | Per-repo grading | This session |
| Phase 4: Auto-refresh test | Caliber dogfood | This session |
| Multi-provider live tests for Anthropic/Cursor/OpenAI/Vertex | All four | Follow-up — out of session |

If we hit time / token limits in this session, priority order is: **Phase 1 → caliber dogfood (Path A then B) → vercel/swr (Path A then B) → synthetic → refresh test → generation eval**. Cut from the back. Both install paths must be tested per repo before moving to the next repo, so we don't end up with partial coverage that hides path-specific bugs.

## Risks & assumptions

- **Assumption:** Claude CLI is installed and logged in on this machine. Pre-flight check before Phase 2: `command -v claude && claude -p "ok"` must return a successful response. If that fails, the audit pauses and surfaces the missing precondition rather than masking it as a Caliber bug.
- **Risk:** running `caliber init` inside the caliber working directory (Phase 2 dogfood) could mutate the working repo. Mitigated by cloning to `/tmp` rather than running on `/Users/alonpe/personal/caliber` directly.
- **Risk:** the OSS repo (`vercel/swr`) may have its own pre-commit hooks that conflict. Mitigated by running in a clean clone with no contributor setup beyond `git init` state.
- **Risk:** generation requires LLM tokens. Token budget is bounded by the three test repos' size — `vercel/swr` is the largest at ~10k LOC, well within bounds.

## Success criteria for the audit

- Every listed source file has been read and notes captured.
- All three test repos have a recorded outcome for each install step.
- The findings doc has at least one P0 / P1 / P2 entry per phase, OR an explicit "no findings" call-out.
- The install-model recommendation is concrete enough that a follow-up brainstorm can turn it into an implementation plan.
