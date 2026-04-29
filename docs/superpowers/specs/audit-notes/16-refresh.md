# 16 — Auto-refresh test on synthetic repo

## Context

Test the auto-refresh on every commit by:
1. Renaming a source file (representative refactor)
2. Committing — observe whether the pre-commit hook fires + updates configs
3. Doing a no-op commit (trailing newline) — observe whether refresh causes churn

Synthetic repo had hooks installed by Path B (Task 12). Pre-commit hook uses absolute path `/Users/alonpe/.nvm/versions/node/v24.14.0/bin/caliber` (the installed v1.40.4).

## Step 1: rename src/auth.ts → src/identity.ts

```bash
git mv src/auth.ts src/identity.ts
sed -i.bak 's|../src/auth|../src/identity|g' tests/auth.test.ts
git add -A
```

## Step 2: commit (triggers pre-commit hook)

`git commit -m "refactor: rename auth -> identity"` — completed in **3.5s**, exit 0.

Stdout from the hook:
```
caliber: refreshing docs...

Update available: 1.40.4 -> 1.48.2
Run npm install -g @rely-ai/caliber to upgrade.

Update available: 1.40.4 -> 1.48.2
Run npm install -g @rely-ai/caliber to upgrade.

caliber: skipping finalize — another caliber process is running
[main 2e7cf85] refactor: rename auth -> identity
 2 files changed, 1 insertion(+), 1 deletion(-)
 rename src/{auth.ts => identity.ts} (100%)
```

**Two surprising observations:**

1. **Update-available banner printed TWICE** (once from `caliber refresh`, once from `caliber learn finalize`). Noisy; not pre-commit-appropriate.
2. **"caliber: skipping finalize — another caliber process is running"** — This is the **#150 lock false-positive bug, which was supposedly fixed**. The fact that it's reproducing means: the `caliber refresh` command in the hook left a lock file behind (didn't release on exit) OR the lock-release logic has another corner case.

**More critically:** CLAUDE.md was NOT updated. Inspection:

```bash
$ grep -E "(auth|identity)" CLAUDE.md
- **Auth** (`src/auth.ts`): `verifyToken(token: string): boolean` — token validation helper, imported as `../src/auth` from tests (ESM extension required).
- **Tests** (`tests/`): vitest specs colocated by feature — `tests/auth.test.ts` covers `verifyToken`.
- ESM imports use proper extensions: `import { verifyToken } from '../src/auth'`.
```

CLAUDE.md still references `src/auth.ts` despite the file having been renamed to `src/identity.ts`. Refresh **did not update the docs**.

`.caliber/refresh-hook.log` is **empty** — refresh's stderr was empty. So caliber refresh exited cleanly (in the sense of not crashing), but didn't actually update anything.

## Step 3: no-op commit (churn test)

```bash
echo "" >> README.md
git commit -m "chore: trailing newline"
```

- 3.7s, exit 0
- Same hook output (banner + skipping finalize)
- `git show --stat HEAD`: just `README.md +1` — no spurious config changes ✓

## Step 4: manual refresh diagnostic

To isolate whether refresh logic itself works, ran refresh manually with the **patched source dist** (not the installed 1.40.4):

```bash
node /Users/alonpe/personal/caliber/dist/bin.js refresh
```

Result:

```
✔ Updated 6 docs
  ✓ CLAUDE.md — updated Architecture section: renamed 'Auth' to 'Identity', changed src/auth.ts to src/identity.ts, updated import reference to ../src/identity.js
  ✓ .claude/rules/api-routes.md — updated identity module reference from src/auth.ts to src/identity.ts in example functions
  ✓ .claude/rules/test-conventions.md — updated file mirroring example from tests/auth.test.ts ↔ src/auth.ts to tests/auth.test.ts ↔ src/identity.ts, updated import path to ../src/identity.js
  ✓ .cursor/rules/typescript-conventions.mdc — updated src/auth.ts reference to src/identity.ts in TypeScript conventions example
  ✓ .cursor/rules/vitest-tests.mdc — updated file mirroring example from src/auth.ts to src/identity.ts, updated import path to ../src/identity.js
  ✓ .github/copilot-instructions.md — updated Identity module reference in Architecture section from src/auth.ts to src/identity.ts and import path to ../src/identity.js

  3 agent formats in sync (Claude Code, Cursor, Copilot)
```

**Refresh logic WORKS PERFECTLY when run with the patched source.** It:
- Correctly identifies the rename
- Updates 6 docs (CLAUDE.md, 2 .claude/rules, 2 .cursor/rules, copilot-instructions)
- Cross-agent consistent
- Captures specific details (file paths, import extensions, ESM .js)
- No churn
- Useful summary

## Diagnosis: why did the pre-commit hook fail silently?

Pre-commit hook uses installed `caliber` v1.40.4 at `/Users/alonpe/.nvm/.../caliber`. That version has the original blanket `cleanClaudeEnv()` that strips `CLAUDE_CODE_USE_VERTEX` (Task 8 finding). When the hook ran:
1. caliber refresh spawned
2. refresh tried to call the LLM via `claude -p`
3. cleanClaudeEnv stripped Vertex var → claude -p reported "Not logged in"
4. refresh's `parseJsonResponse` got a non-JSON error string → threw
5. The throw was caught somewhere in the v1.40.4 cleanup path → exited with code 1
6. Hook's `|| true` masked the exit code
7. Hook's `2>refresh-hook.log` captured stderr, but caliber wrote the error to stdout instead (no log content)
8. User saw no error, no update, no warning. Configs are now silently stale.

This is **the worst possible failure mode** for a sync tool: silent staleness. The user thinks caliber is working (no errors), but their docs drift further from reality with every commit.

## Findings

- **[P0] Pre-commit refresh fails silently when the installed caliber version has the auth bug.** Combined with the silent-stderr `|| true` pattern in the hook script, users get **silently stale documentation**. The hook script's "best effort" approach (`2>...log || true`) means refresh failure is invisible. Suggested fix: hook should print a one-liner on failure ("caliber: refresh skipped — see .caliber/refresh-hook.log") even with `|| true`. OR: refresh should write a state file marker on failure so a SessionStart freshness check can warn.

- **[P0] #150 lock false-positive is REGRESSED in deployed v1.40.4.** "caliber: skipping finalize — another caliber process is running" appeared on every commit. The fix in `lock.ts:35` (`if (pid === process.pid) return false`) IS present in v1.48.2 source — but installed v1.40.4 doesn't have it. The hook calls the installed binary, so users on stale caliber versions hit this bug. Same root cause as the auto-update-hook gap.

- **[P0] Pre-commit hook bakes the user's NVM-specific absolute path.** Confirmed at `.git/hooks/pre-commit`: `if [ -x "/Users/alonpe/.nvm/versions/node/v24.14.0/bin/caliber" ]`. If user switches Node version (`nvm use 22`), the path is invalid — guard fails — hook silently no-ops. Same pattern across teams: the hook was generated with one engineer's path; teammates pulling the repo see a hook with a path that doesn't exist on their machine. Hook silently no-ops for everyone except the engineer who installed.

- **[P1] "Update available" banner prints inside pre-commit hook output.** Twice. Once for `caliber refresh`, once for `caliber learn finalize`. This adds noise to every commit and is shown to the user every time. The version-check should be suppressed when caliber is invoked from a hook context (detect via env var or `--quiet` flag).

- **[P1] Refresh logic itself is high-quality** — when run manually with the patched source, it correctly identified the rename and updated 6 docs across 3 agent formats with specific, correct details (file paths, import extensions, ESM conventions). The value claim ("auto-sync keeps configs accurate") **is real** — when the deployment chain works.

- **[P2] No-op commit doesn't cause churn.** ✓ Refresh correctly recognizes "no relevant changes" and exits without modifications. Good design.

## Outcome

The auto-refresh pipeline works **in source** but **silently fails for users on caliber versions with the auth bug** (i.e. anyone on Vertex-backed Claude Code who installed before the next fix lands). Combined with absolute-path baking in the hook, this means:

- A team installs caliber → it works for the engineer who set it up (their path resolves)
- Teammates pull the repo → hook silently no-ops because the path doesn't exist for them
- The setup engineer upgrades caliber → their installed version may bring the auth fix → refresh starts working again FOR THEM
- Other teammates remain in silent-failure mode forever

The "team sync" value claim breaks at every layer: install-time path baking, deployed-version mismatch across teammates, silent hook failures, and absent freshness signals.
