# 06 — Test repo setup

All three test repos created under `/tmp/caliber-audit/`. No mutations to the working caliber repo at `/Users/alonpe/personal/caliber/`.

## /tmp/caliber-audit/synthetic

- Files: 7 (post-commit, single commit) — package.json, tsconfig.json, src/server.ts, src/auth.ts, tests/auth.test.ts, scripts/migrate.py, README.md
- Languages: TypeScript, Python (polyglot mix to test stack detection)
- Pre-existing agent dirs: `.claude/`, `.cursor/`, `.github/` (all empty — created to mimic mixed-agent eng team setup)
- HEAD: `005bd1b`
- Branch: `master` (default for this user's git config)

## /tmp/caliber-audit/caliber-dogfood

- HEAD: `0c8e138` (matches the audit branch's HEAD on master at clone time)
- Files: 314 (full caliber source tree)
- Pre-existing CLAUDE.md: yes (the canonical hand-curated baseline used for Phase 3 quality eval)
- Branch: `master`

## /tmp/caliber-audit/swr

- HEAD: `46f3954`
- Files: 348 (depth=1 clone)
- Pre-existing agent configs: **none** — true cold-start. No CLAUDE.md, no AGENTS.md, no .cursor/, no .github/copilot-instructions.md
- Branch: `main`

## Environmental observation: global git template installs pre-commit hooks

This machine has `init.templateDir = /Users/alonpe/dotfiles/.git-template` which auto-installs `pre-commit` and `pre-push` hooks on every `git init`. The pre-commit hook runs `gitleaks` for secret-scanning. So `/tmp/caliber-audit/synthetic/.git/hooks/pre-commit` already exists with a non-caliber hook before caliber's install runs.

This is a **representative real-world condition** — many engineers have global pre-commit hooks (gitleaks, husky, lefthook, etc.). When `caliber init` runs, it must merge cleanly with these existing hooks via the `# caliber:pre-commit:start` / `:end` markers.

**Implication:** Phase 2 Path A and Path B on `synthetic` will exercise the merge-into-existing-hook code path — the most common real-world scenario. If caliber's install ever broke this merge, every user with husky / gitleaks / lefthook would lose secret-scanning when caliber installs.

## Decisions

- All test repos live under `/tmp/caliber-audit/`. None touch the working caliber repo at `/Users/alonpe/personal/caliber/`.
- Each Path A / Path B run starts from a fresh `git stash -u && git checkout master` (or `main` for swr) plus `git clean -fdx` to reset.
- For caliber-dogfood, `node_modules` is preserved across runs (massive size, no value in re-installing) via `git clean -fdx -e node_modules`.
- Both Path A and Path B are tested per repo before moving to the next, per the plan's cut-from-the-back priority.
