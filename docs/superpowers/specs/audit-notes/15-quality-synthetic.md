# 15 — Generation quality eval: synthetic repo

## Context

Grade the configs Path B (Task 12) generated for `/tmp/caliber-audit/synthetic/` (7-file Express + vitest + Python repo). Then refreshed once via the rename test (Task 16's manual refresh) so files reflect the post-rename state.

## CLAUDE.md (136 lines)

### Strengths

- **Project identity correct.** Title, description, technology stack all accurate from package.json.
- **Architecture section is specific.** Each file has one-line description with real exports/types:
  - `src/server.ts` — Express app, `GET /health` → `{ ok: true }`, listens on `:3000`
  - `src/identity.ts` — `verifyToken(token: string): boolean`
  - `tests/auth.test.ts` — vitest specs for `verifyToken`
  - `scripts/migrate.py` — Python helper, run inside a venv
  - `tsconfig.json` — `target: ES2022`, `module: ESNext`, `strict: true`, output `dist/`
  - `package.json` — `"type": "module"` (with the implication: ESM extensions required)
- **Captures real conventions:**
  - ESM `.js` extension required for source imports
  - TypeScript `strict: true` → no `any`, prefer `unknown`
  - Express handler pattern with `_req` underscore prefix
  - Python venv requirement (this user's global preference, captured from CLAUDE.md hierarchy)
- **Refresh correctly updated rename references** — all `src/auth.ts` references now say `src/identity.ts` after Task 16's manual refresh.
- **Path-scoped rules listed** — `.claude/rules/api-routes.md` for `src/`, `.claude/rules/test-conventions.md` for `tests/`.
- **Sample-of-5 path accuracy: 4/5 exist** — only `src/auth.ts` is missing, because it was renamed in Task 16.

### Weaknesses

- **DUPLICATED sections.** The "Before Committing", "Session Learnings", "Context Sync", and "Model Configuration" sections each appear TWICE — once as unmarked content and once inside `<!-- caliber:managed:pre-commit -->` markers. Likely root cause: the initial `init` (Task 12) inlined these sections from the LLM prompt, and the subsequent `refresh` ADDED managed blocks on top instead of detecting the duplicates.
- **Absolute caliber path baked into instructional content.** The "Before Committing" section literally says:
  ```
  Run: `/Users/alonpe/.nvm/versions/node/v24.14.0/bin/caliber refresh && git add CLAUDE.md ...`
  ```
  This appears 6+ times in CLAUDE.md. When committed, every teammate's agent reads "run this absolute path" — which doesn't exist on their machine. **Worse than the skill-file path baking** (Task 7) because it's right in the main CLAUDE.md that the agent reads first.
- **136 lines is bloated for a 7-file repo.** caliber's own CLAUDE.md (canonical) is ~100 lines for 314 files — much denser. The synthetic's bloat comes mostly from the duplicated managed-block content (~50 lines of redundancy).

## .github/copilot-instructions.md (95 lines)

- Similar quality to CLAUDE.md but slightly less structured.
- Doesn't include path-scoped rules (Copilot doesn't have an equivalent format).
- Doesn't include the duplicated managed blocks (good — but inconsistent with CLAUDE.md).

## .cursor/rules/

5 rules generated, all with proper Cursor v2 frontmatter (`description`, `globs`, `alwaysApply`):

- `caliber-learnings.mdc` — managed Caliber meta
- `caliber-pre-commit.mdc` — managed Caliber meta
- `caliber-sync.mdc` — managed Caliber meta
- `typescript-conventions.mdc` — codebase-specific, **excellent quality**
- `vitest-tests.mdc` — codebase-specific, **excellent quality**

`typescript-conventions.mdc` content:
```mdc
---
description: TypeScript strict + ESM conventions for src/**
globs: src/**/*.ts
alwaysApply: false
---

# TypeScript Conventions (`src/**/*.ts`)

- `tsconfig.json` is `strict: true`, `target: ES2022`, `module: ESNext`, output to `dist/`.
- Package is `"type": "module"` — sibling imports must use `.js` extensions (e.g. `import { verifyToken } from './identity.js'`).
- No `any`; prefer `unknown` and narrow via type guards.
- Exported functions declare explicit return types (see `verifyToken(token: string): boolean` in `src/identity.ts`).
- Express handlers in `src/server.ts`: `app.METHOD(path, (_req, res) => res.json(...))`; underscore-prefix unused params.
- Keep `src/server.ts` thin; factor logic into modules like `src/identity.ts`.
- Build: `npm run build`. Lint: `npm run lint` (`eslint src/`).
```

This is **production-quality**. Specific globs, specific examples, concrete file/function references. An agent reading this would meaningfully improve at this codebase.

`vitest-tests.mdc` is similarly strong — explicit pattern for test naming, mocking guidance ("never mock pure helpers like `verifyToken`"), watch-mode commands.

## Cross-agent parity

| File | Exists | Quality | Issues |
|------|--------|---------|--------|
| CLAUDE.md | yes | high but bloated (duplicates) | absolute path baking, duplicated sections |
| .github/copilot-instructions.md | yes | high, slightly less structured | absolute path baking less prominent here |
| .cursor/rules/*.mdc | 5 files | excellent — best of the three | absolute path likely in caliber-* rules but typescript/vitest rules are clean |
| AGENTS.md (codex/opencode) | yes | inherits from copilot/CLAUDE.md content | not deeply inspected |

## Findings

- **[P0 confirmed-positive] Generation reasoning quality is genuinely high.** Where the system works (small repo, init succeeds), the output is codebase-specific, captures real conventions, and references actual files. The cursor rules in particular are at production quality. The value claim ("Caliber generates configs that actually help your agent") is supported by this output.

- **[P0] CLAUDE.md contains DUPLICATED sections** — same instructional content (Before Committing, Session Learnings, Context Sync, Model Configuration) appears as both unmanaged content AND inside managed-block markers. Init likely inlined the sections from prompt context, then refresh re-added them inside markers. The unmarked copies will be edited by future LLM refreshes; the marked copies are protected. Both are visible to the agent. Fix: refresh should detect and de-duplicate when adding managed blocks.

- **[P0] Absolute caliber path is injected into CLAUDE.md content** (not just skill files), specifically in the "Before Committing" instructional section. Per Tasks 7, 8, 12 — same root cause. CLAUDE.md is the single most-shared file in a Caliber'd repo. Path-baking here breaks every teammate's experience the moment the file is committed.

- **[P1] CLAUDE.md is bloated for tiny repos** — 136 lines for a 7-file project. Mostly due to the duplicated managed-block sections (~50 redundant lines). After dedup it would be ~85 lines, still arguably long for the project size but more reasonable.

- **[P2] Cross-agent parity is good but inconsistent.** CLAUDE.md has duplicated managed blocks; copilot-instructions.md doesn't. Both useful, but the inconsistency suggests the managed-block injection only runs for Claude, not Copilot. Either standardize or document the difference.

- **[P2] The agent caught a subtle convention from the user's GLOBAL CLAUDE.md** — "Python: run via `python3` in a venv per global instructions." That global instruction is in `~/.claude/CLAUDE.md` (visible because Claude Code auto-includes parent CLAUDE.md files). The agent surfaced it without being asked. Nice unintentional benefit, but means the generated CLAUDE.md may carry user-specific preferences into a team artifact.

## Outcome

Generation **quality is high enough to be valuable** when the system works. The structural issues (duplicates, path baking) are independent of generation quality — they're cosmetic-but-toxic and easily fixable. The fundamental promise ("the configs are useful") is met.
