# 12 — Path B (init wizard) on synthetic repo

## Context

`node /Users/alonpe/personal/caliber/dist/bin.js init --auto-approve --agent claude,cursor,github-copilot` against `/tmp/caliber-audit/synthetic/` (7-file Express + vitest + Python helper repo).

Run with `cleanClaudeEnv()` patched to preserve `CLAUDE_CODE_USE_VERTEX` (per Task 8 finding).

## Result

- Exit code: **0** ✓
- Latency: **4 minutes 1 second** wall-clock (49s user, 25s sys, ~30% CPU)
- Result: **success** — full init completed

This is the counter-evidence to Task 8: when the auth-strip bug is fixed AND the prompt is small enough to not hit the inactivity timeout, init works end-to-end.

## What was generated

- `CLAUDE.md` — 49 lines, codebase-grounded
- `.github/copilot-instructions.md` — codebase-grounded copilot instructions
- `.cursor/rules/` — 5 .mdc files: caliber-learnings, caliber-pre-commit, caliber-sync, typescript-conventions, vitest-tests
- `.claude/skills/` — find-skills, save-learning, setup-caliber (with absolute path baked in per Task 7 finding)
- `.cursor/skills/` — same 3 skills
- `.agents/skills/` — same 3 skills
- `AGENTS.md` — codex/opencode shared
- Pre-commit hook installed in v1.48.2 format
- Score: **95/100 (Grade A)** post-init (no MCP servers, no permissions configured fully, otherwise green)

## Quality of generated CLAUDE.md (preview)

```markdown
# synthetic-audit-app

Small Express + vitest TypeScript app with a Python migration helper (`scripts/migrate.py`). Used as a Caliber audit test target.

@./README.md

## Commands

```bash
npm run build      # tsc → dist/
npm test           # vitest run
npm run lint       # eslint src/
python3 scripts/migrate.py
```

## Architecture

- **Entry**: `src/server.ts` — Express app, `GET /health` → `{ ok: true }`, listens on `:3000`.
- **Auth** (`src/auth.ts`): `verifyToken(token: string): boolean` — token validation helper, imported as `../src/auth` from tests (ESM extension required).
- **Tests** (`tests/`): vitest specs colocated by feature — `tests/auth.test.ts` covers `verifyToken`.
```

**Quality observations:**
- Project name correctly inferred from package.json
- Includes `@./README.md` reference (uses Claude Code's import syntax)
- Commands are real (verified against actual package.json)
- Architecture section is **specific** — names actual file paths, describes actual exports, captures the `GET /health` endpoint and port `:3000` from the source code
- **The agent caught a subtle convention** — "imported as `../src/auth` from tests (ESM extension required)" — even though the test file's import is `from '../src/auth.js'`. The agent inferred the ESM convention from the `"type": "module"` in package.json.
- The Python helper is mentioned with `python3 scripts/migrate.py` as a runnable command.

This is high-quality, codebase-specific output — not generic boilerplate. The value claim ("Caliber generates configs that actually help your agent") holds for this repo.

## Side effects observed

- **Score went from baseline (low — empty CLAUDE.md) to 95/100.** The "+9 Project grounding" and "+8 References point to real files" improvements indicate the LLM correctly grounded its output in real project paths.
- Pre-commit hook installed (v1.48.2 format with `mkdir -p .caliber`, `2>.caliber/refresh-hook.log`, includes new agent dirs in auto-add globs). ✓
- Stop hook, SessionStart hook, learning hooks all installed.

## Issues observed (in addition to Task 7/8 findings)

- **CLI output absolute path in user-facing strings** — confirmed at:
  ```
  ✓  Config generated         /Users/alonpe/.nvm/versions/node/v24.14.0/bin/caliber score for full breakdown
  ✓  Agent skills             /setup-caliber for new team members
  ...
  /Users/alonpe/.nvm/versions/node/v24.14.0/bin/caliber score        Full scoring breakdown
  /Users/alonpe/.nvm/versions/node/v24.14.0/bin/caliber skills       Find community skills
  /Users/alonpe/.nvm/versions/node/v24.14.0/bin/caliber undo         Revert all changes from this run
  /Users/alonpe/.nvm/versions/node/v24.14.0/bin/caliber uninstall    Remove Caliber completely
  ```
  Same path-baking issue as the skill files (Task 7) — confirmed it's not just file output but interactive CLI output too.

- **Total time 4 minutes for a 7-file repo is long.** caliber-dogfood with 314 files would proportionally be much longer; explains the timeout finding from Task 8.

## Findings

- **[P0 confirmed-positive] Generated configs ARE high-quality and codebase-specific** when init succeeds. The value claim holds — this isn't generic boilerplate. The synthetic repo's generated CLAUDE.md correctly identifies project structure, conventions (ESM `.js` extension), commands, and architecture in a way that would meaningfully help an agent reason about the code.

- **[P1] All user-facing CLI output uses `resolveCaliber()` which leaks the absolute install path.** Not just skill files. `init.ts:982-1009` (the "Caliber is set up!" output) interpolates `${bin}` with the resolved path. Same issue surfaces in `init.ts:455-459` (sync-only mode), `init.ts:927-929` (regression revert), and likely many more. Should use the package name (`caliber`) for display purposes.

- **[P1] 4 minutes wall-clock for a 7-file repo means linear-scale-up to ~3 hours for a 300-file repo** would be unacceptable. The actual scaling is sub-linear (the prompt size grows but per-file processing is constant), but the dogfood timeout suggests the model+prompt-size combo crosses a threshold somewhere between 7 and 314 files.

- **[P2] Generated copilot-instructions.md is similar to but slightly less complete than the CLAUDE.md** (missing the `@./README.md` import, slightly different commands listed). Cross-agent parity isn't perfect but is good — both are useful, neither is generic.

## Outcome

Path B works for small repos. Generation quality is genuinely high. Path B does NOT work for the dogfood-scale repo within default timeouts. Both findings are needed for the synthesis doc.
