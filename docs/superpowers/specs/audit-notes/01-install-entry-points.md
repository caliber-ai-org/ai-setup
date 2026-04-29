# 01 — Install entry-point source audit

## Context

Read-only audit of the four entry points that lead a user to a working Caliber state:
- `caliber bootstrap` (CLI) — `src/commands/bootstrap.ts`
- `caliber init` (CLI) — `src/commands/init.ts` and helpers (`init-helpers.ts`, `init-prompts.ts`, `init-display.ts`, `interactive-provider-setup.ts`, `setup-files.ts`)
- `npm install -g @rely-ai/caliber` postinstall message — `scripts/postinstall.js`
- `/setup-caliber` agent slash command — `skills/setup-caliber/SKILL.md`

## Procedure

Read each file end-to-end. For each, capture: what it actually does, what it assumes about prior state, what fails silently, what fails loudly, where the paths overlap or diverge.

## Observations

### bootstrap.ts (52 lines)

A single function. Detects platforms via `detectPlatforms()` (looks for `.claude`/`.cursor`/`.agents`), defaults to `claude` if none found. Iterates `BUILTIN_SKILLS` (3 of them: `setup-caliber`, `find-skills`, `save-learning`) and writes them under `<platform>/skills/<name>/SKILL.md`. Prints "Caliber skills installed!" and tells the user to run `/setup-caliber` in their agent.

**What it does NOT do:** install pre-commit hook, validate provider config, generate any configs, run any LLM call. Pure file-write of static skill content.

**Implication:** the README leads users with `npx @rely-ai/caliber bootstrap` then `/setup-caliber` — meaning the entire install actually happens *inside the agent session* via the SKILL.md instructions. Bootstrap is just a skill installer.

### init.ts (1024 lines)

Organized as a 4-step flow, but with a meaningful branch in Step 2.

- **First-run banner** (lines 97–115): big ASCII art + a "How it works" overview listing 4 steps. Detected via `isFirstRun()` (absence of `.caliber/` dir).
- **Step 1 — Connect** (lines 134–247):
  - Auto-detects existing `~/.caliber/config.json`. If missing, tries seat-based providers in order: Claude CLI → Cursor → OpenCode. Confirms each one with `confirm()` prompt.
  - Falls back to `runInteractiveProviderSetup()` for full picker.
  - **`--auto-approve` mode:** silently picks the first available seat-based provider. If none, exits with config error.
  - Then picks target agents via `detectAgents()` (fs.existsSync for each agent dir). If `--auto-approve` or first-run with detected agents: uses detected list. Otherwise asks via `confirm` then optionally `promptAgent()`.
  - Special yellow warning if `github-copilot` is the *only* agent — reactive, fires after agent picking.
- **Step 2 — Setup** (lines 249–340):
  - Installs pre-commit hook, stop hook, sessionStart hook unconditionally
  - Creates agent dirs that don't exist
  - Writes builtin skills via `ensureBuiltinSkills()` (same content as bootstrap)
  - Installs learning hooks if claude/cursor targeted
  - Computes baseline score via `computeLocalScore()`
- **Branching decision** (lines 342–462):
  - If `hasExistingConfig && score === 100 && !force`: skip generation entirely
  - If `hasExistingConfig && !force && !autoApprove`: prompt "Audit and improve your existing config?"
  - If `!hasExistingConfig && !force && !autoApprove`: prompt "Generate agent configs?"
  - **If user declines (skipGeneration = true):** writes "managed blocks" — injects Caliber sync instructions into existing CLAUDE.md / .cursor/rules / copilot-instructions, then exits. Pre-commit hook and skills are already installed at this point.
- **Step 3 — Generate** (lines 467–752):
  - Phase A: fingerprint via `collectFingerprint()`. Resolves external sources.
  - Phase B: parallel `generateSetup` (LLM call, streaming) + `searchSkills` (community skills lookup, 120s timeout).
  - Phase D: `scoreAndRefine` for auto-refinement based on score.
  - Each step has a `display.update()` call wired to the parallel-task TUI.
- **Step 4 — Finalize** (lines 754–1024):
  - `collectSetupFiles()` → `stageFiles()`
  - Print summary, ask review action (accept/review/refine/decline), refinement loop
  - Write files via `writeSetup()`
  - **Score regression check:** if `afterScore.score < baselineScore.score`, auto-undo via `undoSetup()`
  - Print "Caliber is set up!" + commands list

### init-helpers.ts (198 lines)

- `isFirstRun(dir)`: checks for `.caliber/` directory. Returns true if absent OR if `.caliber` exists as a non-directory.
- `summarizeSetup(action, setup)`: serializes file descriptions for refinement chat history.
- `derivePermissions(fingerprint)`: **hardcoded** language→bash permissions mapping. Maps TypeScript→npm, Python→pip/pytest, Go→go, Rust→cargo, Java/Kotlin→gradle/maven, Ruby→bundle, Terraform/Docker/Make→explicit. **Contradicts the project's "no hardcoded mappings" principle** stated in CLAUDE.md.
- `ensurePermissions(fingerprint)`: writes `.claude/settings.json` only if `permissions.allow` is empty/missing.
- `writeErrorLog`: dumps stop reason + raw output + (for timeouts) env-var hints to `.caliber/error-log.md`.
- `evaluateDismissals`: LLM call to mark scoring checks as "not applicable" (e.g. dismiss "build/test commands" for a config-only repo).

### init-prompts.ts (192 lines)

- `detectAgents(dir)`: fs.existsSync checks for `.claude`, `.cursor`, `.agents`/`AGENTS.md`, `.opencode`, `.github/copilot-instructions.md`.
- `promptAgent`: checkbox UI with 5 agents. Copilot's option label is `"GitHub Copilot (sync target — writes copilot-instructions.md)"` — this disambiguates inside the picker, but the special-case warning in init.ts is still emitted *after* picking. Redundant.
- `promptReviewAction`: accept / review-diffs / refine-via-chat / decline. Has a recursive call when "review" is picked (re-prompts after diffs).
- `classifyRefineIntent`: LLM call (using fast model) to detect whether a user's refinement message is a "valid config change" or a question/chat. On non-valid: tells user to rephrase. On error: defaults to `valid: true`.
- `refineLoop`: while-true loop. Escape: literal "done"/"accept"/"cancel" keywords (case-insensitive). No max iterations.

### init-display.ts (271 lines)

- Pure formatting/printing utilities.
- `printSetupSummary`: file-by-file display with `+`/`~` icons.
- `displayTokenUsage`: prints per-model token counts. For seat-based providers, shows "(Estimated from character count)".

### interactive-provider-setup.ts (188 lines)

- 7 provider choices: claude-cli, opencode, cursor, anthropic, vertex, openai, minimax.
- Per-provider availability + login checks (claude-cli, opencode, cursor) with "Continue anyway?" escape hatch.
- For Anthropic/OpenAI/Vertex/MiniMax: synchronous `promptInput` for API key. **Note**: `promptInput` for an API key isn't masked — typed characters likely echo in the terminal.
- Writes `~/.caliber/config.json`.

### setup-files.ts (144 lines)

- Builds the flat list of `{path, content}` files to write from the generated setup object.
- For every targeted agent platform, **always** appends BUILTIN_SKILLS — same 3 skills bootstrap installs. So init re-installs them.
- Codex/OpenCode share `AGENTS.md` — special handling avoids duplicate entries.
- Codex stub generation duplicated: present in both `setup-files.ts` (lines 130–141) and `init.ts` (lines 854–864). The init.ts one runs after `collectSetupFiles`, so the second stub overrides any earlier one. Code-smell.

### postinstall.js (16 lines)

Prints a coloured "Caliber installed successfully!" banner with two suggested next steps:
- `caliber config` — set up LLM
- `caliber init` — analyze and generate

Does NOT mention `caliber bootstrap` (which the README leads with). Does NOT run on `npx` install (no postinstall hook for npx). So: a user installing globally sees one set of instructions; a user using npx sees only the README.

### setup-caliber/SKILL.md (211 lines)

5-step instruction document for the agent. The skill is a Markdown file consumed by Claude/Cursor when the user types `/setup-caliber`.

- **Step 1**: detect or install caliber (`npm install -g` first, fallback to `npx`).
- **Step 2**: install pre-commit hook (`caliber hooks --install`).
- **Step 3**: detect agents via fs presence checks; ask user if none detected. Then run `caliber init --auto-approve --agent <list>`.
- **Step 4**: `caliber score --json --quiet`. If <80, offer `caliber refresh`.
- **Step 5**: solo vs team. Solo = optionally enable session learning. Team = create `.github/workflows/caliber-sync.yml` and prompt for API key secret.

The agent has wide latitude here — the SKILL.md is instructions, not deterministic code. Behavior across Claude Code vs Cursor vs Copilot may vary.

## Findings

- **[P1] Step counter mismatch — `Step 1/3 — Connect` then `Step 2/4 — Setup`.** `src/commands/init.ts:137` prints "Step 1/3" but every subsequent step prints "x/4". The reproducer output in issue #147 already shows this user-visible inconsistency. Trivial fix: change `'  Step 1/3 — Connect\n'` to `'  Step 1/4 — Connect\n'`.

- **[P1] `derivePermissions` is hardcoded** — `src/commands/init-helpers.ts:31-74`. Contradicts the project's "no hardcoded mappings" principle (CLAUDE.md). Stacks not in the hardcoded list (Elixir, Zig, .NET, etc.) get only `Bash(git *)`. The principle is enforced for language *detection* (LLM-driven via `src/ai/detect.ts`) but violated for permission derivation. Fix candidate: derive permissions from detected build/test commands instead of hardcoded language→tool mapping.

- **[P1] Bootstrap and init have very different surface areas, but the README treats them as alternates.** `bootstrap.ts` writes 3 static skills and exits — no hooks, no provider, no LLM. `init.ts` runs a 4-step flow. The README's "Don't use Claude Code or Cursor? Run `caliber init` instead — it's the same setup as a CLI wizard" is misleading: `init` and `bootstrap → /setup-caliber` are not equivalent — they overlap on output but `bootstrap` requires the agent to do the actual work. This is the root of the bootstrap-vs-init confusion users report.

- **[P1] Pre-commit hook installs *before* the user opts into config generation.** `src/commands/init.ts:257-258`. If the user later declines "Generate agent configs? (Y/n)" with "n", the hook is still installed and will run on every commit. Defensible (sync infra IS the value), but surprising — there's no opt-out shown. A user who wants to evaluate before committing has no path.

- **[P1] Special-case Copilot warning fires *after* selection** — `src/commands/init.ts:239-247`. By that point the user has committed. The agent picker's option label already disambiguates ("sync target — writes copilot-instructions.md"). Either delete the post-selection warning (label suffices) or move the disambiguation into a pre-selection dialog when copilot is the only choice.

- **[P1] Postinstall message and README contradict each other.** Postinstall: `caliber config` → `caliber init`. README: `npx @rely-ai/caliber bootstrap` → `/setup-caliber`. A user who reads both surfaces sees three different "first commands". Recommendation: pick ONE blessed path, mention the other only as a footnote.

- **[P1] Score-regression auto-revert can hide partial-generation bugs.** `src/commands/init.ts:906-932`. If the LLM produces a config that scores lower (even slightly) than baseline, init silently reverts via `undoSetup()`. The user sees "Score would drop from X to Y — reverting changes" but cannot inspect the discarded output. If the score drop is due to a too-strict scoring rule (or a bug in scoring), the user has no recourse besides `--force`. Risk: masks real generation failures as "scoring said no".

- **[P2] Codex stub generation duplicated.** Same logic in `src/commands/setup-files.ts:130-141` and `src/commands/init.ts:854-864`. Init.ts runs after collectSetupFiles, so init.ts's version wins for codex. Cleanup candidate.

- **[P2] postinstall.js doesn't run on npx.** README leads with npx. So the "first impression" output is empty for the user the README is written for. Either remove postinstall message reliance, or sync the two surfaces.

- **[P2] `promptInput` for API key is not masked.** `src/commands/interactive-provider-setup.ts:134, 159, 173`. Typed API keys likely echo to the terminal. Cosmetic concern, but bad practice — `@inquirer/password` exists and would prevent shoulder-surfing / terminal-history leaks.

- **[P2] `bootstrap` defaults to claude when no platforms detected.** `src/commands/bootstrap.ts:20`. A user with only Cursor (no `.cursor` dir yet) gets claude skills written. Mild — `init` does this better via the picker.

- **[P2] First-run banner overview lists 4 steps but not the same 4 steps as the actual flow.** Banner: "Connect / Setup / Generate / Finalize" — actual: identical labels. Match holds. **No finding.**

- **[P2] `refineLoop` has no max iterations.** A user could be stuck in the loop with `classifyRefineIntent` rejecting valid messages. Escape: literal "done"/"accept"/"cancel" — but the LLM-based intent classification means the user might see false "this doesn't look like a config change" rejections and not know to type "done". Minor.

## Open questions

- Is the bootstrap-vs-init split intentional product design (CLI for power users, agent-driven for new users) or accidental drift? If intentional, the README needs to make that distinction much sharper. If accidental, one of them should deprecate.
- Is the postinstall message worth maintaining if it contradicts the README? Consider removing it entirely and pointing to a single source of truth.
- Does `--auto-approve` mean "skip prompts" or "accept everything sight unseen"? Current behavior is the latter. For an audit/CI use case, the former might be safer.
