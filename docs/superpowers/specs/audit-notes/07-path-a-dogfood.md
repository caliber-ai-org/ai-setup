# 07 — Path A on caliber dogfood

## Context

Reproduce the README's headline install path on a fresh clone of caliber:
1. `caliber bootstrap` (CLI — installs the 3 builtin skills)
2. `/setup-caliber` (in a Claude Code session — orchestrates the rest)

Provider: Claude CLI seat. Both stdouts captured under `audit-notes/raw/07-*.txt`.

## Pre-state

- Repo: `/tmp/caliber-audit/caliber-dogfood`, fresh clone of caliber master at `0c8e138`
- Existing configs: caliber's own CLAUDE.md, AGENTS.md, .cursor/rules/, .claude/, .agents/, .opencode/, .github/ all present (this is caliber's own canonical setup)
- Pre-existing pre-commit hook: gitleaks (from this user's global git template)
- caliber on PATH: `/Users/alonpe/.nvm/versions/node/v24.14.0/bin/caliber` v1.40.4
- caliber source: `node /Users/alonpe/personal/caliber/dist/bin.js` v1.48.2

## Step 1: bootstrap

Command: `node /Users/alonpe/personal/caliber/dist/bin.js bootstrap`

- Exit code: 0
- Latency: 1.17s
- Files written (9 — 3 skills × 3 platforms):
  - `.claude/skills/{find-skills,save-learning,setup-caliber}/SKILL.md`
  - `.cursor/skills/{find-skills,save-learning,setup-caliber}/SKILL.md`
  - `.agents/skills/{find-skills,save-learning,setup-caliber}/SKILL.md`
- Stdout summary: clean three-color list, ends with "Just tell your agent: 'Run /setup-caliber'"

**Anomaly:** of the 9 files written, **only 6 showed as `M` in `git status`** — `setup-caliber/SKILL.md` for each platform was identical to what was already committed. The find-skills and save-learning content **was** different.

### Diff inspection — find-skills SKILL.md

```diff
-   caliber skills --query "<relevant terms>"
+   /Users/alonpe/.nvm/versions/node/v24.14.0/bin/caliber skills --query "<relevant terms>"
```

Same substitution throughout — every `caliber` command in find-skills/SKILL.md and save-learning/SKILL.md is replaced with the resolved absolute path.

### Root cause

`src/lib/builtin-skills.ts:11, 65` — `getFindSkillsContent()` and `getSaveLearningContent()` call `resolveCaliber()` and embed the result directly into the skill content via template strings:

```typescript
const bin = resolveCaliber();
return `... ${bin} skills --query "<relevant terms>" ...`;
```

`getSetupCaliberContent()` does NOT do this — it uses `$CALIBER` shell variable that the agent sets dynamically per-machine. That's the correct pattern.

### Implication

`bootstrap` (and `init`'s skill-write step) bakes the **user's machine-specific absolute path** into skill files that are intended to be **committed to git for the team**. When teammate B clones the repo:
- Their `.claude/skills/find-skills/SKILL.md` references `/Users/alonpe/.nvm/...` — a path that doesn't exist on B's machine.
- The skill silently fails when invoked — agent runs the command, gets "no such file or directory", reports back.
- B never realizes their skill was machine-poisoned by A.

This is the core "context infrastructure for teams" promise broken at the file-write layer. Path-injection turns a team artifact into a personal one.

**The skill-write code violates its own pattern** — `setup-caliber/SKILL.md` correctly uses `$CALIBER` runtime variable. `find-skills/SKILL.md` and `save-learning/SKILL.md` correctly should.

## Step 2: /setup-caliber via claude -p

Command:
```bash
claude -p "Use the /setup-caliber skill in .claude/skills/setup-caliber/SKILL.md to set up Caliber for this repo. When asked solo vs team, pick solo. Work non-interactively — make reasonable defaults. The locally installed caliber binary works."
```

- Exit code: 0
- **Latency: 4 minutes 52 seconds wall-clock** (20.5s user, 10s sys, 10% CPU — most of that is waiting on LLM responses for the diagnostic steps)
- Final stdout (the agent's summary message — 14 lines):

```
Caliber Setup Complete (solo):

✓ Caliber installed (v1.40.4 globally — note: upgrade to 1.48.2 available)
✓ Pre-commit hook active — caliber refresh runs on every commit
✓ Agent configs present — CLAUDE.md, AGENTS.md, 5 Cursor rules (.cursor/rules/*.mdc), .claude/, .agents/
✓ Config score: 95/100 (A) — no refresh needed
✓ Session learning enabled — Claude + Cursor hooks installed, 31 events recorded (threshold 25)

Detected agents: claude, cursor, codex (no GitHub Copilot).

From now on, every commit syncs your agent configs automatically. The Stop / SessionEnd / SessionStart / Notification hooks in .claude/settings.json keep things observed and refreshed during sessions too.

One thing worth doing soon: npm install -g @rely-ai/caliber to upgrade the global binary from 1.40.4 → 1.48.2.
SessionEnd hook [caliber learn finalize --auto] failed: Hook cancelled
```

### Observations

- **Agent followed the skill correctly.** Detected platforms (claude, cursor, codex), checked installed version, ran `caliber score`, checked learning hooks, reported results.
- **Pre-commit hook installed in 1.48.2 format**, even though `caliber` on PATH is 1.40.4. Either the agent ran `node /path/dist/bin.js hooks --install` per my prompt's hint about "the locally installed caliber binary works", or the v1.40.4 hooks --install code already wrote this format. Inspection of the resulting hook content shows `mkdir -p .caliber`, `refresh --quiet 2>.caliber/refresh-hook.log`, and the new `.github/.agents/.opencode/` paths — consistent with v1.48.2 source.
- **The agent surfaced the version delta proactively** — "upgrade to 1.48.2 available". Good UX, but only because *the agent* noticed; the skill itself doesn't check for upgrades.
- **`SessionEnd hook [caliber learn finalize --auto] failed: Hook cancelled`** appeared again in stderr at the very end — the same pre-flight finding (every claude -p in this repo cascades).
- **Headless mode hides the agent's tool calls.** `claude -p` returns only the final response — the actual `caliber` commands executed are invisible. For audit purposes this is a gap; for users this is fine.

### Pre-commit hook merged correctly

Final `.git/hooks/pre-commit` content shows:
1. The pre-existing global-template gitleaks block (untouched at the top)
2. The caliber block appended below, with the v1.48.2 format

Merge worked cleanly.

## Comparison to spec

- **Did the user reach a working state?** Yes.
- **How long did it take?** ~4m54s end-to-end (1.2s bootstrap + 4m52s setup). Significantly longer than the README implies ("one-time, 2 seconds").
- **Did the user understand what was happening?** From `claude -p` the user sees only the final 14-line summary — they don't see the agent's diagnostic steps. In an interactive Claude Code session they would see live progress.
- **Where did the user have to context-switch?** Once: from terminal (`bootstrap`) to IDE chat (`/setup-caliber`). The README warns about this.

## Findings

- **[P0] `find-skills` and `save-learning` SKILL.md files contain the user's machine-specific absolute caliber path, baked in at install time.** `src/lib/builtin-skills.ts:11, 65`. When committed to git (which `/setup-caliber` instructs), every teammate's skills point to one user's nvm/homebrew/whatever path. Skills silently break for everyone else. Fix: mirror `setup-caliber/SKILL.md`'s pattern — use `$CALIBER` shell var that the agent resolves at runtime, OR use bare `caliber` and rely on PATH.

- **[P1] Path A end-to-end latency is ~5 minutes on a happy-path machine** (Claude CLI logged in, fast network, repo already mostly configured). Bootstrap is 1.2s, but `/setup-caliber` agent execution is 4m52s. README's "one-time, 2 seconds" wording sets an expectation that doesn't match reality — a user evaluating Caliber might bounce off the silent multi-minute agent run with no progress feedback in `claude -p` headless mode.

- **[P1] `claude -p` headless invocation hides the agent's tool calls.** From an audit perspective, we can't see exactly what commands the agent ran. From a user perspective in headless mode, you have to wait 5 minutes staring at a blank terminal. **Interactive `claude` session would show progress in real time** — but the README's recommended workflow ("in your terminal, start a Claude Code or Cursor CLI session and type /setup-caliber") doesn't quite specify whether `claude -p` (headless) or `claude` (interactive) is intended. Plain `claude` suggests interactive, but users automating setup may hit headless and get the worse experience.

- **[P1] SessionEnd hook still cancelling at end of every claude -p.** Per pre-flight finding, but confirmed in this run too — `SessionEnd hook [caliber learn finalize --auto] failed: Hook cancelled` appeared in stderr.

- **[P2] Bootstrap reports "X.XX skills installed!" with full file paths**, but the user's intent at this stage is "give me the skill so I can run /setup-caliber" — file-by-file listing is overkill. Either a tighter summary (`Installed 3 skills for claude, cursor, codex`) or omit entirely.

- **[P2] The agent's summary said "`caliber refresh` runs on every commit" but the actual hook content runs `caliber refresh --quiet`** with stderr to log. Minor accuracy gap in the agent's summary, but a careful user might check and conclude the agent was wrong.

- **[P2] No mechanism to know that 1.48.2 is "out" — the agent had to know.** The agent surfaced "upgrade to 1.48.2" because it could parse the version response — but if 1.49 ships next week, `/setup-caliber` skill content on this user's disk doesn't know about it. The skill should either npm-check for latest version OR caliber should check on its own.

## Open questions

- Was the agent supposed to use `node /path/dist/bin.js` (per my prompt's hint) or the PATH `caliber`? Do the resulting actions differ depending on which it picked?
- Should `bootstrap` warn when the resolved binary path differs from `caliber` on PATH (suggesting a path-baking risk)?
