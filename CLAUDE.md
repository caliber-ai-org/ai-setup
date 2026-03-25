# CLAUDE.md — Caliber

## What Is This

`@rely-ai/caliber` — CLI that fingerprints projects and generates AI agent configs (`CLAUDE.md`, `.cursor/rules/`, `AGENTS.md`, skills). Supports Anthropic, OpenAI, Google Vertex AI, OpenAI-compatible endpoints, Claude Code CLI, and Cursor ACP.

## Commands

```bash
npm run build          # tsup → dist/
npm run dev            # tsup --watch
npm run test           # vitest run
npm run test:watch     # vitest watch
npm run test:coverage  # v8 coverage
npx tsc --noEmit       # type-check only
```

```bash
npm publish --access public   # publish @rely-ai/caliber
npm version patch             # bump patch before publish
```

```bash
caliber init       # generate configs
caliber score      # run scoring checks
caliber refresh    # diff-based update
caliber learn finalize  # finalize learnings
```

## Architecture

**Entry**: `src/bin.ts` → `src/cli.ts` (Commander.js) · commands wrapped with `tracked()` for telemetry

**LLM** (`src/llm/`): `types.ts` · `config.ts` · `anthropic.ts` · `vertex.ts` · `openai-compat.ts` · `claude-cli.ts` · `cursor-acp.ts` · `utils.ts` (`extractJson`, `estimateTokens`) · `usage.ts` (`trackUsage`) · `seat-based-errors.ts` (`parseSeatBasedError`) · `model-recovery.ts` · `index.ts` (`llmCall`, `llmJsonCall`, `TRANSIENT_ERRORS`)

**AI** (`src/ai/`): `generate.ts` · `refine.ts` · `refresh.ts` · `learn.ts` · `detect.ts` · `prompts.ts` · `score-refine.ts` · `stream-parser.ts`

**Commands** (`src/commands/`): `init.ts` · `regenerate.ts` · `status.ts` · `undo.ts` · `config.ts` · `score.ts` · `refresh.ts` · `hooks.ts` · `learn.ts` · `recommend.ts` · `insights.ts` · `setup-files.ts` · `sources.ts` · `publish.ts`

**Fingerprint** (`src/fingerprint/`): `git.ts` · `file-tree.ts` · `existing-config.ts` · `code-analysis.ts` · `cache.ts` · `sources.ts` · `index.ts` (`collectFingerprint`, `computeFingerprintHash`)

**Writers** (`src/writers/`): `claude/index.ts` · `cursor/index.ts` · `codex/index.ts` · `github-copilot/index.ts` · `staging.ts` · `manifest.ts` · `backup.ts` · `refresh.ts` · `pre-commit-block.ts` · `index.ts` (`writeSetup`, `undoSetup`)

**Scoring** (`src/scoring/`): Deterministic, no LLM. Checks in `src/scoring/checks/` — `existence.ts` · `quality.ts` · `grounding.ts` · `accuracy.ts` · `freshness.ts` · `bonus.ts` · `sources.ts`. Constants in `src/scoring/constants.ts`. Display via `src/scoring/display.ts`. Score refinement via `src/ai/score-refine.ts` (`validateSetup`, `scoreAndRefine`).

**Learner** (`src/learner/`): `storage.ts` · `writer.ts` · `roi.ts` · `stdin.ts` · `utils.ts` · `attribution.ts`

**Scanner** (`src/scanner/index.ts`): `detectPlatforms()` · `scanLocalState()` · `compareState()`

**Lib** (`src/lib/`): `hooks.ts` · `learning-hooks.ts` · `git-diff.ts` · `state.ts` · `lock.ts` · `sanitize.ts` · `notifications.ts` · `resolve-caliber.ts` · `debug-report.ts` · `builtin-skills.ts`

**Telemetry** (`src/telemetry/`): `index.ts` (`trackEvent`, `initTelemetry`, `flushTelemetry`) · `events.ts` · `config.ts` — via `posthog-node`

**GitHub Action**: `github-action/index.js` + `github-action/action.yml` — scores PRs, posts comments, optional `auto-refresh`

## LLM Provider Resolution

1. `ANTHROPIC_API_KEY` → Anthropic (`claude-sonnet-4-6`)
2. `VERTEX_PROJECT_ID` / `GCP_PROJECT_ID` → Vertex (`us-east5`)
3. `OPENAI_API_KEY` → OpenAI (`gpt-4.1`; `OPENAI_BASE_URL` for custom endpoints)
4. `CALIBER_USE_CURSOR_SEAT=1` → Cursor ACP (`agent --print --trust`)
5. `CALIBER_USE_CLAUDE_CLI=1` → Claude Code CLI (`claude -p`)
6. `~/.caliber/config.json` — written by `caliber config` · `0600` permissions
7. `CALIBER_MODEL` overrides model · `CALIBER_FAST_MODEL` overrides fast model

Fast model: `claude-haiku-4-5-20251001` (Anthropic/Vertex) · `gpt-4.1-mini` (OpenAI) · `gpt-5.3-codex-fast` (Cursor)

## Key Conventions

- **ES module imports require `.js` extension** even for `.ts` source files
- Prefer `unknown` over `any`; explicit types on all params and return values
- `throw new Error('__exit__')` — clean CLI exit without stack trace
- Use `ora` spinners with `.fail()` before rethrowing async errors
- JSON from LLM: always use `extractJson()` from `src/llm/utils.ts` — never raw `JSON.parse()`
- Seat-based providers (`cursor`, `claude-cli`): spawn with `stdio: ['pipe', 'pipe', 'pipe']` — never `inherit` for stderr
- Error parsing for seat-based: use `parseSeatBasedError()` from `src/llm/seat-based-errors.ts`
- Streaming: `getProvider()` then `provider.stream(options, { onText, onEnd, onError })`
- Cursor stream-json: events are `assistant` deltas with `timestamp_ms`, then `result` — skip duplicates by checking `timestamp_ms`
- All commands in `src/commands/` must be registered in `src/cli.ts` wrapped with `tracked()`
- Backups → `.caliber/backups/` · manifest → `.caliber/manifest.json` · dismissed checks → `.caliber/dismissed-checks.json`
- Session events → `.caliber/learning/current-session.jsonl` · fingerprint cache → `.caliber/cache/fingerprint.json`
- Staged proposals → `.caliber/staged/proposed/` via `src/writers/staging.ts`
- `src/ai/score-refine.ts`: `validateSetup()` + `scoreAndRefine()` auto-fix scoring issues before writing
- Anti-patterns: never import provider SDKs directly from commands; never hardcode point values outside `src/scoring/constants.ts`; never use async in scoring checks

## Testing

- Global LLM mock in `src/test/setup.ts` — do NOT re-mock `llmCall` globally
- Override per-test: `vi.spyOn(llm, 'llmCall').mockResolvedValue(...)`
- Learner tests: use `os.tmpdir()` + `fs.mkdtempSync()` for temp dirs
- Fingerprint tests: use `memfs` virtual filesystem (`vol.fromJSON`)
- Provider tests (`src/llm/__tests__/index.test.ts`): call `vi.unmock('../index.js')` and `resetProvider()` in `beforeEach`
- Run single file: `npx vitest run src/scoring/__tests__/accuracy.test.ts`
- Spawn mock must include `stderr: { on: vi.fn() }` when stdio is `['pipe', 'pipe', 'pipe']`

## Commit Convention

`feat:` → minor · `fix:`/`refactor:`/`chore:` → patch · `feat!:` → major
Do NOT include Co-Authored-By headers in commits.

<!-- caliber:managed:pre-commit -->
## Before Committing

Run `caliber refresh` before creating git commits to keep docs in sync with code changes.
After it completes, stage any modified doc files before committing:

```bash
caliber refresh && git add CLAUDE.md .claude/ .cursor/ AGENTS.md CALIBER_LEARNINGS.md 2>/dev/null
```
<!-- /caliber:managed:pre-commit -->

<!-- caliber:managed:learnings -->
## Session Learnings

Read `CALIBER_LEARNINGS.md` for patterns and anti-patterns learned from previous sessions.
These are auto-extracted from real tool usage — treat them as project-specific rules.
<!-- /caliber:managed:learnings -->

## Available Skills

The following skill files are available in this repo. Read them when working on related areas:

- `.claude/skills/adding-a-command/SKILL.md` — Creates a new CLI command following caliber's pattern: file in src/commands/,...
- `.claude/skills/caliber-testing/SKILL.md` — Writes Vitest tests for caliber modules following project patterns.
- `.claude/skills/fingerprint-pipeline/SKILL.md` — Extends or modifies the project fingerprinting pipeline in src/fingerprint/.
- `.claude/skills/llm-provider/SKILL.md` — Implements or modifies an LLM provider in src/llm/ by implementing the LLMPro...
- `.claude/skills/scoring-checks/SKILL.md` — Adds a new deterministic scoring check to src/scoring/checks/ implementing the Check interface.
- `.claude/skills/writers-pattern/SKILL.md` — Creates or modifies a file writer in src/writers/ following the established pattern for generating AI agent configs.
