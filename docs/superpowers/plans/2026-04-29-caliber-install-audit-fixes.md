# Caliber install-audit P0 fixes — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the three top-priority P0 fixes from the install audit so Caliber actually works for the eng-team-mixed-agents ICP. After this lands, the messaging redesign work can proceed on a working foundation.

**Architecture:** Three surgical, independent fixes. Each is a small focused change with a tight unit test. They share no code paths so they can land as three commits on one branch and ship as one PR.

**Tech Stack:** TypeScript (Node ≥ 20), tsup build, vitest tests, prettier+eslint. Branch: `alonp98/install-audit` (continues from the audit commits — pure code additions, no audit-doc changes).

**Source spec:** `docs/superpowers/specs/2026-04-29-caliber-install-audit-findings.md`

---

## Scope check

Three fixes addressing F-P0-1, F-P0-3, F-P0-4 + F-P0-5 (the latter two are paired since one mechanism fixes both). The other 8 P0 findings are deferred to a follow-up plan; they share no code paths with these three and adding them would balloon the PR.

**Fixes in this plan:**
1. **F-P0-1: `cleanClaudeEnv()` allowlist** — narrow the env strip so Vertex/Bedrock auth survives.
2. **F-P0-3: Stop baking absolute caliber paths into committed content** — add `displayCaliberName()` helper, replace `resolveCaliber()` calls in user-facing/committed code paths.
3. **F-P0-4 + F-P0-5: Hook auto-update + visible refresh failures** — embed a version marker in the pre-commit hook block; on install, detect and replace stale versions; add a one-line user-visible warning when refresh fails.

**Deferred to follow-up:**
- F-P0-2 (large-prompt timeout)
- F-P0-6 (#150 lock false-positive in deployed — fixed by F-P0-4 mechanism)
- F-P0-7, F-P0-8 (silent generation failures)
- F-P0-9 (SessionEnd cascade on user `claude -p`)
- F-P0-10 (CLAUDE.md duplicated sections)
- F-P0-11 (false "init succeeded" claim)

---

## File structure

| File | Responsibility | Change |
|------|----------------|--------|
| `src/llm/claude-cli.ts` | Claude CLI provider | Replace blanket `startsWith('CLAUDE_CODE_')` strip with explicit anti-recursion allowlist |
| `src/llm/__tests__/claude-cli.test.ts` | Existing test file | Add tests for `cleanClaudeEnv` preserve-Vertex / strip-recursion behavior |
| `src/lib/resolve-caliber.ts` | Binary resolution | Add new `displayCaliberName()` function for user-facing display |
| `src/lib/__tests__/resolve-caliber.test.ts` | Existing tests | Add tests for `displayCaliberName()` |
| `src/lib/builtin-skills.ts` | Builtin skill content | Replace `${bin}` (resolveCaliber) with `${displayCaliberName()}` in `getFindSkillsContent()` and `getSaveLearningContent()` |
| `src/writers/pre-commit-block.ts` | Managed-block injection | Replace `resolveCaliber()` calls with `displayCaliberName()` in 4 places (lines 28, 56, 174, 206) |
| `src/scoring/display.ts` | Score CLI output | Replace `resolveCaliber()` with `displayCaliberName()` in user-visible "Run X for details" message |
| `src/scoring/checks/sources.ts` | Score check fix-suggestions | Same — 2 places |
| `src/scoring/checks/accuracy.ts` | Score check fix-suggestions | Same — 1 place |
| `src/llm/seat-based-errors.ts` | Provider error messages | Same — 2 places |
| `src/llm/model-recovery.ts` | Recovery prompts | Same — 2 places |
| `src/llm/index.ts` | "no provider configured" error | Same — 2 places |
| `src/commands/init.ts` | Init final-output text | Replace `${bin}` with `${displayCaliberName()}` in lines 982-1009 (final summary) and similar surfaces |
| `src/lib/hooks.ts` | Pre-commit hook | Add version marker (vX.Y.Z) embedded in the start/end markers; install detects + replaces stale versions; refresh-failure echo message |
| `src/lib/__tests__/hooks.test.ts` | Existing tests | Add tests for version-marker detect-and-replace + refresh-failure visibility |
| `src/constants.ts` | Constants module | Verify it exports `VERSION` (or add if missing) so hooks.ts can read it without circular import via package.json |
| `package.json` | Build manifest | Bump version to `1.49.0` (minor — these are bug fixes that change deployed behavior) |
| `CHANGELOG.md` | Release notes | Add entry for 1.49.0 with the three fixes |

**Files explicitly NOT changed:**
- The pre-commit hook script template KEEPS `resolveCaliber()` (absolute path is correct here — hooks run with stripped PATH).
- The `STOP_HOOK_SCRIPT_CONTENT` and `getFreshnessScript` in hooks.ts KEEP `resolveCaliber()` for the same reason.
- All `_npx` resolution logic in resolve-caliber.ts is untouched.

---

## Pre-flight: branch and verify

### Task 0: Branch + pre-fix verification

**Files:** none — environment check only

- [ ] **Step 1: Confirm we're on the audit branch with a clean tree**

```bash
cd /Users/alonpe/personal/caliber
git branch --show-current
git status --short
git log --oneline master..HEAD | head -15
```

Expected: branch `alonp98/install-audit`, no uncommitted source changes (only the standard untracked `.claude/settings.local.json`, `CALIBER_LEARNINGS.md`, `.claude/worktrees/`), 12 audit-doc commits since master.

- [ ] **Step 2: Confirm full test suite is green before any changes**

```bash
npm test 2>&1 | tail -10
```

Expected: `Test Files  82 passed (82)`, `Tests  1008 passed (1008)`. If anything is red, STOP and surface it before changing source.

- [ ] **Step 3: Confirm the `displayCaliberName` helper does not yet exist**

```bash
grep -n 'displayCaliberName' src/ -r
```

Expected: no matches. If something exists, read it before proceeding.

---

## Fix 1: Narrow `cleanClaudeEnv()` env strip (F-P0-1)

### Task 1: Add a failing test for cleanClaudeEnv allowlist behavior

**Files:**
- Modify: `src/llm/__tests__/claude-cli.test.ts`

- [ ] **Step 1: Read the existing test file structure**

Run: `head -80 src/llm/__tests__/claude-cli.test.ts`

This shows existing test patterns (vi.stubEnv usage, etc.) so the new tests match the file's conventions.

- [ ] **Step 2: Add failing tests for cleanClaudeEnv at the end of the file**

`cleanClaudeEnv` is a non-exported function. We'll test its behavior indirectly via `spawnClaude` env capture using `vi.spyOn(child_process, 'spawn')`, OR export `cleanClaudeEnv` for testing. Simpler path: export `cleanClaudeEnv` from the module (rename to indicate test-only if preferred — `_cleanClaudeEnvForTesting`).

Append to `src/llm/__tests__/claude-cli.test.ts`:

```typescript
import { _cleanClaudeEnvForTesting } from '../claude-cli.js';

describe('cleanClaudeEnv allowlist behavior (F-P0-1)', () => {
  beforeEach(() => {
    // Clear any CLAUDE_CODE_* vars from real env before each test
    for (const k of Object.keys(process.env)) {
      if (k.startsWith('CLAUDE') && k !== 'CLAUDE_PATH') delete process.env[k];
    }
  });

  it('strips CLAUDECODE (anti-recursion marker)', () => {
    process.env.CLAUDECODE = '1';
    const env = _cleanClaudeEnvForTesting();
    expect(env.CLAUDECODE).toBeUndefined();
  });

  it('strips CLAUDE_CODE_SIMPLE (anti-recursion marker)', () => {
    process.env.CLAUDE_CODE_SIMPLE = '1';
    const env = _cleanClaudeEnvForTesting();
    expect(env.CLAUDE_CODE_SIMPLE).toBeUndefined();
  });

  it('strips CLAUDE_CODE_SESSION_ID (anti-recursion marker)', () => {
    process.env.CLAUDE_CODE_SESSION_ID = 'abc-123';
    const env = _cleanClaudeEnvForTesting();
    expect(env.CLAUDE_CODE_SESSION_ID).toBeUndefined();
  });

  it('strips CLAUDE_CODE_ENTRYPOINT (anti-recursion marker)', () => {
    process.env.CLAUDE_CODE_ENTRYPOINT = 'cli';
    const env = _cleanClaudeEnvForTesting();
    expect(env.CLAUDE_CODE_ENTRYPOINT).toBeUndefined();
  });

  it('strips CLAUDE_CODE_EXECPATH (anti-recursion marker)', () => {
    process.env.CLAUDE_CODE_EXECPATH = '/some/path';
    const env = _cleanClaudeEnvForTesting();
    expect(env.CLAUDE_CODE_EXECPATH).toBeUndefined();
  });

  it('PRESERVES CLAUDE_CODE_USE_VERTEX (auth-control var) — F-P0-1 fix', () => {
    process.env.CLAUDE_CODE_USE_VERTEX = '1';
    const env = _cleanClaudeEnvForTesting();
    expect(env.CLAUDE_CODE_USE_VERTEX).toBe('1');
  });

  it('PRESERVES CLAUDE_CODE_USE_BEDROCK (auth-control var) — F-P0-1 fix', () => {
    process.env.CLAUDE_CODE_USE_BEDROCK = '1';
    const env = _cleanClaudeEnvForTesting();
    expect(env.CLAUDE_CODE_USE_BEDROCK).toBe('1');
  });

  it('PRESERVES CLAUDE_CODE_MAX_OUTPUT_TOKENS (config var)', () => {
    process.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS = '32768';
    const env = _cleanClaudeEnvForTesting();
    expect(env.CLAUDE_CODE_MAX_OUTPUT_TOKENS).toBe('32768');
  });

  it('preserves unrelated env vars (HOME, PATH)', () => {
    const env = _cleanClaudeEnvForTesting();
    expect(env.HOME).toBe(process.env.HOME);
    expect(env.PATH).toBe(process.env.PATH);
  });
});
```

- [ ] **Step 3: Run the tests — they should FAIL because `_cleanClaudeEnvForTesting` is not yet exported**

Run: `npx vitest run src/llm/__tests__/claude-cli.test.ts -t "cleanClaudeEnv"`

Expected: import error or all tests fail because the export doesn't exist.

### Task 2: Implement the allowlist fix

**Files:**
- Modify: `src/llm/claude-cli.ts:78-93`

- [ ] **Step 1: Replace the cleanClaudeEnv function with the allowlist version**

Replace lines 78-93 of `src/llm/claude-cli.ts` (the existing function definition + its docstring) with:

```typescript
/**
 * Anti-recursion env vars that Claude Code sets when it spawns subprocesses.
 * If passed through to a `claude -p` invocation, these trigger Claude Code's
 * own anti-recursion detection — masquerading as "Not logged in" failures.
 *
 * Only these specific vars are stripped. Other CLAUDE_CODE_* vars (notably
 * the auth-control ones like CLAUDE_CODE_USE_VERTEX / CLAUDE_CODE_USE_BEDROCK)
 * are preserved so enterprise auth backends survive the strip.
 *
 * See audit finding F-P0-1 (docs/superpowers/specs/2026-04-29-caliber-install-audit-findings.md).
 */
const ANTI_RECURSION_ENV_VARS = new Set<string>([
  'CLAUDECODE',
  'CLAUDE_CODE_SIMPLE',
  'CLAUDE_CODE_SESSION_ID',
  'CLAUDE_CODE_ENTRYPOINT',
  'CLAUDE_CODE_EXECPATH',
]);

function cleanClaudeEnv(): Record<string, string | undefined> {
  const env = { ...process.env };
  for (const key of ANTI_RECURSION_ENV_VARS) {
    delete env[key];
  }
  return env;
}

/** Test-only export of cleanClaudeEnv. Do not use in non-test code. */
export const _cleanClaudeEnvForTesting = cleanClaudeEnv;
```

- [ ] **Step 2: Run the tests — they should now PASS**

Run: `npx vitest run src/llm/__tests__/claude-cli.test.ts -t "cleanClaudeEnv"`

Expected: all 9 tests pass.

- [ ] **Step 3: Run the FULL test suite to verify no regressions**

Run: `npm test 2>&1 | tail -15`

Expected: still `1008 + 9 = 1017` (or whatever the total is — the key signal is the SAME number of pre-existing tests still pass plus the new ones).

If any pre-existing test fails: STOP and investigate. Likely a test that assumed CLAUDE_CODE_* gets stripped and now sees them preserved.

- [ ] **Step 4: Type check**

Run: `npx tsc --noEmit 2>&1 | head -10`

Expected: no errors.

- [ ] **Step 5: Build**

Run: `npm run build 2>&1 | tail -5`

Expected: `Build success`. dist updated.

- [ ] **Step 6: Commit**

```bash
git add src/llm/claude-cli.ts src/llm/__tests__/claude-cli.test.ts
git commit -m "fix(claude-cli): preserve CLAUDE_CODE_USE_VERTEX/BEDROCK in env strip

The cleanClaudeEnv() function was stripping ALL CLAUDE_CODE_* env vars
to prevent recursion when caliber spawns claude -p from inside a
Claude Code session (the #147 fix). The blanket startsWith() match
also stripped the auth-control vars CLAUDE_CODE_USE_VERTEX and
CLAUDE_CODE_USE_BEDROCK, breaking enterprise users running on Vertex
or Bedrock auth backends.

This narrows the strip to an explicit allowlist of just the
anti-recursion markers (CLAUDECODE, CLAUDE_CODE_SIMPLE,
CLAUDE_CODE_SESSION_ID, CLAUDE_CODE_ENTRYPOINT, CLAUDE_CODE_EXECPATH).
Auth-control and config vars are preserved.

Audit finding: F-P0-1 in
docs/superpowers/specs/2026-04-29-caliber-install-audit-findings.md
Empirically reproduced 100% on Vertex-backed Claude Code; verified
fixed by direct claude -p invocation with the narrowed env."
```

---

## Fix 2: Stop baking absolute caliber path into committed content (F-P0-3)

### Task 3: Add `displayCaliberName()` helper + tests

**Files:**
- Modify: `src/lib/resolve-caliber.ts`
- Modify: `src/lib/__tests__/resolve-caliber.test.ts`

- [ ] **Step 1: Add the helper to resolve-caliber.ts**

Append after the existing `isCaliberCommand` function (after line 142) in `src/lib/resolve-caliber.ts`:

```typescript
/**
 * Returns a display-friendly caliber binary name for embedding in
 * user-facing text and committed files (CLAUDE.md, skills, cursor rules).
 *
 * Unlike resolveCaliber() — which returns an absolute path so hook
 * subprocesses with stripped PATH can still find the binary — this
 * function returns just `caliber` (or `npx @rely-ai/caliber` for npx
 * users) on the assumption that the user's interactive shell has caliber
 * on PATH and that committed content will be read by teammates whose
 * absolute install paths differ.
 *
 * See audit finding F-P0-3 (docs/superpowers/specs/2026-04-29-caliber-install-audit-findings.md).
 */
export function displayCaliberName(): string {
  return isNpxResolution() ? 'npx @rely-ai/caliber' : 'caliber';
}
```

- [ ] **Step 2: Add tests for the new helper**

Append to `src/lib/__tests__/resolve-caliber.test.ts`:

```typescript
import { displayCaliberName, resetResolvedCaliber } from '../resolve-caliber.js';

describe('displayCaliberName (F-P0-3)', () => {
  beforeEach(() => {
    resetResolvedCaliber();
  });

  afterEach(() => {
    resetResolvedCaliber();
  });

  it('returns "caliber" for global install path', () => {
    // Mock execSync to return a global install path
    const cp = require('child_process');
    const original = cp.execSync;
    cp.execSync = vi.fn((cmd: string) => {
      if (cmd.includes('which caliber') || cmd.includes('where caliber')) {
        return '/usr/local/bin/caliber\n';
      }
      throw new Error('not found');
    });
    try {
      expect(displayCaliberName()).toBe('caliber');
    } finally {
      cp.execSync = original;
    }
  });

  it('returns "npx @rely-ai/caliber" when npx resolution is used', () => {
    const cp = require('child_process');
    const original = cp.execSync;
    const originalArgv = process.argv[1];
    process.argv[1] = '/some/_npx/abc/node_modules/.bin/caliber';
    cp.execSync = vi.fn(() => { throw new Error('not found'); });
    try {
      expect(displayCaliberName()).toBe('npx @rely-ai/caliber');
    } finally {
      cp.execSync = original;
      process.argv[1] = originalArgv;
    }
  });

  it('does NOT return an absolute path', () => {
    const cp = require('child_process');
    const original = cp.execSync;
    cp.execSync = vi.fn(() => '/Users/someone/.nvm/versions/node/v20/bin/caliber\n');
    try {
      const display = displayCaliberName();
      expect(display).not.toMatch(/^\//);
      expect(display).not.toContain('.nvm');
      expect(display).not.toContain('Users');
    } finally {
      cp.execSync = original;
    }
  });
});
```

- [ ] **Step 3: Run the new tests**

Run: `npx vitest run src/lib/__tests__/resolve-caliber.test.ts -t "displayCaliberName"`

Expected: all 3 tests pass.

- [ ] **Step 4: Type check + build**

```bash
npx tsc --noEmit 2>&1 | head -5
npm run build 2>&1 | tail -3
```

Expected: no type errors, build success.

- [ ] **Step 5: Commit**

```bash
git add src/lib/resolve-caliber.ts src/lib/__tests__/resolve-caliber.test.ts
git commit -m "feat(resolve-caliber): add displayCaliberName helper

Returns 'caliber' (or 'npx @rely-ai/caliber') for embedding in
user-facing text and committed files. Distinct from resolveCaliber()
which returns an absolute path for subprocess invocation.

This is the foundation for F-P0-3 — preventing the user's machine-
specific install path from being baked into team-shared content
(CLAUDE.md, skills, cursor rules)."
```

### Task 4: Replace `resolveCaliber()` with `displayCaliberName()` in committed-content writers

**Files:**
- Modify: `src/lib/builtin-skills.ts:11, 65` (the two `bin = resolveCaliber()` lines)
- Modify: `src/writers/pre-commit-block.ts:28, 56, 174, 206` (the four `bin = resolveCaliber()` lines)

- [ ] **Step 1: Update builtin-skills.ts imports**

In `src/lib/builtin-skills.ts`, change line 3 from:
```typescript
import { resolveCaliber } from './resolve-caliber.js';
```
to:
```typescript
import { displayCaliberName } from './resolve-caliber.js';
```

- [ ] **Step 2: Update the two function bodies in builtin-skills.ts**

In `getFindSkillsContent()` (line 10), change:
```typescript
const bin = resolveCaliber();
```
to:
```typescript
const bin = displayCaliberName();
```

In `getSaveLearningContent()` (line 64), make the same change.

- [ ] **Step 3: Update pre-commit-block.ts imports**

In `src/writers/pre-commit-block.ts`, change line 1 from:
```typescript
import { resolveCaliber } from '../lib/resolve-caliber.js';
```
to:
```typescript
import { displayCaliberName } from '../lib/resolve-caliber.js';
```

- [ ] **Step 4: Update all four call sites in pre-commit-block.ts**

Replace `const bin = resolveCaliber();` with `const bin = displayCaliberName();` at lines 28, 56, 174, 206 of `src/writers/pre-commit-block.ts` (all four occurrences).

Run: `grep -n 'resolveCaliber' src/writers/pre-commit-block.ts`

Expected: no matches.

- [ ] **Step 5: Add test verifying generated skill content has no absolute paths**

Create `src/lib/__tests__/builtin-skills.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resetResolvedCaliber } from '../resolve-caliber.js';
import { BUILTIN_SKILLS } from '../builtin-skills.js';

describe('BUILTIN_SKILLS content (F-P0-3 — no absolute paths)', () => {
  beforeEach(() => {
    resetResolvedCaliber();
    const cp = require('child_process');
    cp.execSync = vi.fn(() => '/Users/someone/.nvm/versions/node/v20/bin/caliber\n');
  });

  it('find-skills SKILL.md does not contain absolute paths', () => {
    const skill = BUILTIN_SKILLS.find((s) => s.name === 'find-skills');
    expect(skill).toBeDefined();
    expect(skill!.content).not.toContain('/Users/');
    expect(skill!.content).not.toContain('.nvm/');
    expect(skill!.content).not.toMatch(/\/usr\/(local\/)?bin\//);
    expect(skill!.content).toContain('caliber skills');
  });

  it('save-learning SKILL.md does not contain absolute paths', () => {
    const skill = BUILTIN_SKILLS.find((s) => s.name === 'save-learning');
    expect(skill).toBeDefined();
    expect(skill!.content).not.toContain('/Users/');
    expect(skill!.content).not.toContain('.nvm/');
    expect(skill!.content).not.toMatch(/\/usr\/(local\/)?bin\//);
    expect(skill!.content).toContain('caliber learn add');
  });

  it('setup-caliber SKILL.md does not contain absolute paths', () => {
    const skill = BUILTIN_SKILLS.find((s) => s.name === 'setup-caliber');
    expect(skill).toBeDefined();
    expect(skill!.content).not.toContain('/Users/');
    expect(skill!.content).not.toContain('.nvm/');
  });
});
```

- [ ] **Step 6: Add test for pre-commit-block content**

Append to existing test file `src/writers/__tests__/pre-commit-block.test.ts` (file already exists — verify with `ls src/writers/__tests__/pre-commit-block.test.ts` first):

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resetResolvedCaliber } from '../../lib/resolve-caliber.js';
import {
  appendPreCommitBlock,
  getCursorPreCommitRule,
  appendSyncBlock,
  getCursorSyncRule,
} from '../pre-commit-block.js';

describe('pre-commit-block content (F-P0-3 — no absolute paths)', () => {
  beforeEach(() => {
    resetResolvedCaliber();
    const cp = require('child_process');
    cp.execSync = vi.fn(() => '/Users/someone/.nvm/versions/node/v20/bin/caliber\n');
  });

  it('appendPreCommitBlock injects caliber bare name not absolute path', () => {
    const out = appendPreCommitBlock('# test\n', 'claude');
    expect(out).not.toContain('/Users/');
    expect(out).not.toContain('.nvm/');
    expect(out).toMatch(/`caliber refresh`/);
  });

  it('getCursorPreCommitRule injects caliber bare name', () => {
    const rule = getCursorPreCommitRule();
    expect(rule.content).not.toContain('/Users/');
    expect(rule.content).toMatch(/`caliber refresh/);
  });

  it('appendSyncBlock injects caliber bare name', () => {
    const out = appendSyncBlock('# test\n', 'claude');
    expect(out).not.toContain('/Users/');
    expect(out).toMatch(/`caliber refresh`/);
  });

  it('getCursorSyncRule injects caliber bare name', () => {
    const rule = getCursorSyncRule();
    expect(rule.content).not.toContain('/Users/');
    expect(rule.content).toMatch(/`caliber refresh`/);
  });
});
```

- [ ] **Step 7: Run the new tests**

```bash
npx vitest run src/lib/__tests__/builtin-skills.test.ts
npx vitest run src/writers/__tests__/pre-commit-block.test.ts
```

Expected: all tests pass.

- [ ] **Step 8: Run full test suite + build**

```bash
npm test 2>&1 | tail -5
npx tsc --noEmit
npm run build 2>&1 | tail -3
```

Expected: all green.

- [ ] **Step 9: Commit**

```bash
git add src/lib/builtin-skills.ts src/writers/pre-commit-block.ts \
        src/lib/__tests__/builtin-skills.test.ts \
        src/writers/__tests__/pre-commit-block.test.ts
git commit -m "fix(skills,writers): use bare 'caliber' in committed content

builtin-skills.ts (find-skills, save-learning) and pre-commit-block.ts
(managed CLAUDE.md / cursor rules) were embedding the user's machine-
specific absolute caliber path (e.g. /Users/jdoe/.nvm/.../caliber) into
files intended to be committed and shared with the team. Teammates
pulling the repo got commands referencing paths that don't exist on
their machines.

Replace resolveCaliber() (absolute path) with displayCaliberName()
('caliber' bare or 'npx @rely-ai/caliber' for npx users) in user-
facing/committed content paths. resolveCaliber() is preserved for hook
scripts where PATH may be stripped at subprocess time.

Audit finding: F-P0-3 in
docs/superpowers/specs/2026-04-29-caliber-install-audit-findings.md"
```

### Task 5: Replace `resolveCaliber()` with `displayCaliberName()` in user-facing CLI surfaces

**Files:**
- Modify: `src/scoring/display.ts:197`
- Modify: `src/scoring/checks/sources.ts:28, 54`
- Modify: `src/scoring/checks/accuracy.ts:189`
- Modify: `src/llm/seat-based-errors.ts:6, 7`
- Modify: `src/llm/model-recovery.ts:100, 134`
- Modify: `src/llm/index.ts:88, 103`
- Modify: `src/commands/init.ts:982-1009` (and any other `${bin}` interpolations using `resolveCaliber()`)

- [ ] **Step 1: Inventory all remaining call sites**

Run:

```bash
grep -rn 'resolveCaliber()' src/ --include='*.ts' \
  | grep -v __tests__ \
  | grep -v hooks.ts \
  | grep -v resolve-caliber.ts
```

Expected: 9 lines across 7 files (the call sites listed above). If anything else appears, audit it before proceeding — likely a hook-content site (which should keep `resolveCaliber()`) or an oversight.

- [ ] **Step 2: Update src/scoring/display.ts**

In `src/scoring/display.ts`, change the import statement to add `displayCaliberName`:

```typescript
import { resolveCaliber, displayCaliberName } from '../lib/resolve-caliber.js';
```

(Keep `resolveCaliber` in the import if it's used elsewhere in the file; otherwise replace it.)

Then on line 197, change:
```typescript
console.log(chalk.dim(`\n  Run ${chalk.hex('#83D1EB')(`${resolveCaliber()} score`)} for details.${moreText}`));
```
to:
```typescript
console.log(chalk.dim(`\n  Run ${chalk.hex('#83D1EB')(`${displayCaliberName()} score`)} for details.${moreText}`));
```

- [ ] **Step 3: Update src/scoring/checks/sources.ts**

Replace import to use `displayCaliberName`. On lines 28 and 54, replace `${resolveCaliber()}` with `${displayCaliberName()}`.

- [ ] **Step 4: Update src/scoring/checks/accuracy.ts**

Same — line 189: replace `${resolveCaliber()}` with `${displayCaliberName()}`.

- [ ] **Step 5: Update src/llm/seat-based-errors.ts**

Same — lines 6 and 7: replace `${resolveCaliber()}` with `${displayCaliberName()}`. Update import accordingly.

- [ ] **Step 6: Update src/llm/model-recovery.ts**

Same — lines 100 and 134.

- [ ] **Step 7: Update src/llm/index.ts**

Same — lines 88 and 103.

- [ ] **Step 8: Update src/commands/init.ts**

In `src/commands/init.ts`, find the lines using `${bin}` for display purposes (around lines 455-460, 927-929, 982-1009). The `bin` variable on line 94 is currently `const bin = resolveCaliber();` — that's used for both display AND for examples like `caliber init --force` that the user is meant to run.

Change line 94 from:
```typescript
const bin = resolveCaliber();
```
to:
```typescript
const bin = displayCaliberName();
```

(All downstream `${bin}` interpolations in this file are user-facing display, not subprocess invocation, so the change is safe across the file.)

- [ ] **Step 9: Verify all replacements are complete**

```bash
grep -rn 'resolveCaliber()' src/ --include='*.ts' \
  | grep -v __tests__ \
  | grep -v 'src/lib/hooks.ts' \
  | grep -v 'src/lib/resolve-caliber.ts'
```

Expected: NO matches. (The remaining `resolveCaliber()` calls in hooks.ts and resolve-caliber.ts are intentionally preserved.)

- [ ] **Step 10: Run full test suite + type check + build**

```bash
npm test 2>&1 | tail -5
npx tsc --noEmit 2>&1 | head -10
npm run build 2>&1 | tail -3
```

Expected: all green.

- [ ] **Step 11: Quick smoke test — run `node dist/bin.js score --help` and `node dist/bin.js --version` to verify no runtime errors**

```bash
node dist/bin.js --version
node dist/bin.js score --help 2>&1 | head -5
```

Expected: prints version `1.48.2` (we'll bump to 1.49.0 in Task 8), prints help.

- [ ] **Step 12: Commit**

```bash
git add src/scoring/ src/llm/seat-based-errors.ts src/llm/model-recovery.ts \
        src/llm/index.ts src/commands/init.ts
git commit -m "fix(cli): use displayCaliberName in user-facing text

Replace resolveCaliber() with displayCaliberName() across all user-
facing CLI surfaces: score display, error messages (no provider, model
not available, usage limit), score-check fix suggestions, and init's
final 'Caliber is set up' summary.

Before: 'Run /Users/jdoe/.nvm/.../caliber score for details'
After:  'Run caliber score for details'

resolveCaliber() is intentionally preserved in src/lib/hooks.ts where
the absolute path is correct (hook subprocesses run with stripped PATH).

Audit finding: F-P0-3."
```

---

## Fix 3: Hook auto-update + visible refresh failures (F-P0-4 + F-P0-5)

### Task 6: Add hook version marker + auto-replace stale hooks

**Files:**
- Modify: `src/lib/hooks.ts` (add HOOK_VERSION constant + version-aware install/detect logic)
- Modify: `src/lib/__tests__/hooks.test.ts`

- [ ] **Step 1: Read the existing hooks test file to match its conventions**

Run: `head -40 src/lib/__tests__/hooks.test.ts`

This shows the existing test patterns (vi mocks, fixtures, etc.) so the new tests match.

- [ ] **Step 2: Update hooks.ts to embed a version marker**

In `src/lib/hooks.ts`, replace the constants near line 269:

```typescript
const PRECOMMIT_START = '# caliber:pre-commit:start';
const PRECOMMIT_END = '# caliber:pre-commit:end';
```

with:

```typescript
// Hook block version marker. Bumped when the hook script content changes
// in a way that benefits existing users (new managed-doc paths, stderr
// logging, etc.). installPreCommitHook() detects mismatched versions and
// re-installs so users on stale caliber versions get hook upgrades.
//
// Audit finding: F-P0-4 in
// docs/superpowers/specs/2026-04-29-caliber-install-audit-findings.md
const HOOK_BLOCK_VERSION = 'v2';
const PRECOMMIT_START_PREFIX = '# caliber:pre-commit:';
const PRECOMMIT_START = `${PRECOMMIT_START_PREFIX}${HOOK_BLOCK_VERSION}:start`;
const PRECOMMIT_END = `${PRECOMMIT_START_PREFIX}${HOOK_BLOCK_VERSION}:end`;
const PRECOMMIT_ANY_VERSION_START_RE = /^#\s*caliber:pre-commit:(?:[a-zA-Z0-9_.-]+:)?start\s*$/m;
const PRECOMMIT_ANY_VERSION_BLOCK_RE = /\n?#\s*caliber:pre-commit:(?:[a-zA-Z0-9_.-]+:)?start[\s\S]*?#\s*caliber:pre-commit:(?:[a-zA-Z0-9_.-]+:)?end\n?/g;
```

(`'v2'` because the legacy unversioned format is conceptually `v1`. Future bumps land at `v3`, `v4`, etc.)

- [ ] **Step 3: Update isPreCommitHookInstalled to match any version**

Replace the existing `isPreCommitHookInstalled()` (around line 400) with:

```typescript
export function isPreCommitHookInstalled(): boolean {
  const hookPath = getPreCommitPath();
  if (!hookPath || !fs.existsSync(hookPath)) return false;
  const content = fs.readFileSync(hookPath, 'utf-8');
  return PRECOMMIT_ANY_VERSION_START_RE.test(content);
}

/** True when the installed hook is at the current HOOK_BLOCK_VERSION. */
export function isPreCommitHookCurrent(): boolean {
  const hookPath = getPreCommitPath();
  if (!hookPath || !fs.existsSync(hookPath)) return false;
  const content = fs.readFileSync(hookPath, 'utf-8');
  return content.includes(PRECOMMIT_START);
}
```

- [ ] **Step 4: Update installPreCommitHook to re-install on version mismatch**

Replace the existing `installPreCommitHook()` (around line 407) with:

```typescript
export function installPreCommitHook(): {
  installed: boolean;
  alreadyInstalled: boolean;
  upgraded: boolean;
} {
  const hookPath = getPreCommitPath();
  if (!hookPath) return { installed: false, alreadyInstalled: false, upgraded: false };

  const hooksDir = path.dirname(hookPath);
  if (!fs.existsSync(hooksDir)) fs.mkdirSync(hooksDir, { recursive: true });

  const exists = fs.existsSync(hookPath);
  let content = exists ? fs.readFileSync(hookPath, 'utf-8') : '';

  if (PRECOMMIT_ANY_VERSION_START_RE.test(content)) {
    if (content.includes(PRECOMMIT_START)) {
      return { installed: false, alreadyInstalled: true, upgraded: false };
    }
    // Stale version — strip the old block(s) and re-install at current version.
    content = content.replace(PRECOMMIT_ANY_VERSION_BLOCK_RE, '\n').replace(/\n{3,}/g, '\n\n');
    if (!content.endsWith('\n')) content += '\n';
    content += '\n' + getPrecommitBlock() + '\n';
    fs.writeFileSync(hookPath, content);
    fs.chmodSync(hookPath, 0o755);
    return { installed: false, alreadyInstalled: false, upgraded: true };
  }

  // Fresh install
  if (exists) {
    if (!content.endsWith('\n')) content += '\n';
    content += '\n' + getPrecommitBlock() + '\n';
  } else {
    content = '#!/bin/sh\n\n' + getPrecommitBlock() + '\n';
  }
  fs.writeFileSync(hookPath, content);
  fs.chmodSync(hookPath, 0o755);
  return { installed: true, alreadyInstalled: false, upgraded: false };
}
```

- [ ] **Step 5: Update removePreCommitHook to match any version**

Replace the existing `removePreCommitHook()` (around line 432) with:

```typescript
export function removePreCommitHook(): { removed: boolean; notFound: boolean } {
  const hookPath = getPreCommitPath();
  if (!hookPath || !fs.existsSync(hookPath)) {
    return { removed: false, notFound: true };
  }

  let content = fs.readFileSync(hookPath, 'utf-8');
  if (!PRECOMMIT_ANY_VERSION_START_RE.test(content)) {
    return { removed: false, notFound: true };
  }

  content = content.replace(PRECOMMIT_ANY_VERSION_BLOCK_RE, '\n').replace(/\n{3,}/g, '\n\n');

  if (content.trim() === '#!/bin/sh' || content.trim() === '') {
    fs.unlinkSync(hookPath);
  } else {
    fs.writeFileSync(hookPath, content);
  }

  return { removed: true, notFound: false };
}
```

- [ ] **Step 6: Add tests for version-marker behavior**

Append to `src/lib/__tests__/hooks.test.ts`:

```typescript
import {
  installPreCommitHook,
  isPreCommitHookInstalled,
  isPreCommitHookCurrent,
  removePreCommitHook,
} from '../hooks.js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

describe('pre-commit hook version marker (F-P0-4)', () => {
  let tmpDir: string;
  const originalCwd = process.cwd();

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'caliber-hook-test-'));
    execSync('git init -q', { cwd: tmpDir });
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('installs current-version hook when none present', () => {
    const result = installPreCommitHook();
    expect(result.installed).toBe(true);
    expect(result.upgraded).toBe(false);
    expect(isPreCommitHookCurrent()).toBe(true);
  });

  it('reports alreadyInstalled when current-version hook present', () => {
    installPreCommitHook();
    const result = installPreCommitHook();
    expect(result.alreadyInstalled).toBe(true);
    expect(result.upgraded).toBe(false);
  });

  it('detects legacy unversioned hook as installed-but-stale', () => {
    const hookPath = path.join(tmpDir, '.git', 'hooks', 'pre-commit');
    fs.mkdirSync(path.dirname(hookPath), { recursive: true });
    fs.writeFileSync(
      hookPath,
      '#!/bin/sh\n\n# caliber:pre-commit:start\nold body\n# caliber:pre-commit:end\n',
    );
    fs.chmodSync(hookPath, 0o755);

    expect(isPreCommitHookInstalled()).toBe(true);
    expect(isPreCommitHookCurrent()).toBe(false);
  });

  it('upgrades a legacy unversioned hook to current version', () => {
    const hookPath = path.join(tmpDir, '.git', 'hooks', 'pre-commit');
    fs.mkdirSync(path.dirname(hookPath), { recursive: true });
    fs.writeFileSync(
      hookPath,
      '#!/bin/sh\n\n# caliber:pre-commit:start\nold body that uses old refresh flags\n# caliber:pre-commit:end\n',
    );

    const result = installPreCommitHook();
    expect(result.upgraded).toBe(true);
    expect(result.installed).toBe(false);
    expect(result.alreadyInstalled).toBe(false);

    const newContent = fs.readFileSync(hookPath, 'utf-8');
    expect(newContent).toContain('# caliber:pre-commit:v2:start');
    expect(newContent).not.toContain('old body that uses old refresh flags');
  });

  it('preserves non-caliber hook content during upgrade', () => {
    const hookPath = path.join(tmpDir, '.git', 'hooks', 'pre-commit');
    fs.mkdirSync(path.dirname(hookPath), { recursive: true });
    fs.writeFileSync(
      hookPath,
      '#!/bin/sh\n\n# caliber:pre-commit:start\nold body\n# caliber:pre-commit:end\n\n# someone-else gitleaks\ngitleaks detect --no-banner\n',
    );

    installPreCommitHook();
    const newContent = fs.readFileSync(hookPath, 'utf-8');
    expect(newContent).toContain('gitleaks detect --no-banner');
    expect(newContent).toContain('# caliber:pre-commit:v2:start');
  });

  it('removePreCommitHook removes legacy unversioned blocks', () => {
    const hookPath = path.join(tmpDir, '.git', 'hooks', 'pre-commit');
    fs.mkdirSync(path.dirname(hookPath), { recursive: true });
    fs.writeFileSync(
      hookPath,
      '#!/bin/sh\n\n# caliber:pre-commit:start\nold body\n# caliber:pre-commit:end\n',
    );

    const result = removePreCommitHook();
    expect(result.removed).toBe(true);
    expect(fs.existsSync(hookPath)).toBe(false);
  });

  it('removePreCommitHook removes versioned blocks', () => {
    installPreCommitHook();
    const result = removePreCommitHook();
    expect(result.removed).toBe(true);
  });
});
```

- [ ] **Step 7: Update callers to surface the new "upgraded" outcome**

`installPreCommitHook()` now returns a third state. Two callers need to be updated to display it.

In `src/commands/init.ts` near line 257-262, change:

```typescript
const hookResult = installPreCommitHook();
if (hookResult.installed) {
  console.log(`  ${chalk.green('✓')} Pre-commit hook installed — configs sync on every commit`);
} else if (hookResult.alreadyInstalled) {
  console.log(`  ${chalk.green('✓')} Pre-commit hook — active`);
}
```

to:

```typescript
const hookResult = installPreCommitHook();
if (hookResult.installed) {
  console.log(`  ${chalk.green('✓')} Pre-commit hook installed — configs sync on every commit`);
} else if (hookResult.upgraded) {
  console.log(`  ${chalk.green('✓')} Pre-commit hook — upgraded to latest version`);
} else if (hookResult.alreadyInstalled) {
  console.log(`  ${chalk.green('✓')} Pre-commit hook — active`);
}
```

In `src/commands/hooks.ts`, find the formatter for the install result (around line 42 — it's likely a generic formatter that just prints "installed" or "already installed"). Read it first:

```bash
sed -n '30,80p' src/commands/hooks.ts
```

Then update the result-formatting code to handle the `upgraded` case alongside `installed` and `alreadyInstalled`. The exact change depends on the formatter shape; the principle is: when `upgraded === true`, print something like `"Pre-commit hook upgraded to <version>"` (use `HOOK_BLOCK_VERSION` from hooks.ts if accessible, or just say "to latest version").

- [ ] **Step 8: Run the new tests**

Run: `npx vitest run src/lib/__tests__/hooks.test.ts -t "version marker"`

Expected: all 7 new tests pass. Pre-existing hooks tests should also still pass.

- [ ] **Step 9: Run full test suite + type check + build**

```bash
npm test 2>&1 | tail -5
npx tsc --noEmit 2>&1 | head -5
npm run build 2>&1 | tail -3
```

Expected: all green.

- [ ] **Step 10: Commit**

```bash
git add src/lib/hooks.ts src/lib/__tests__/hooks.test.ts src/commands/init.ts src/commands/hooks.ts
git commit -m "feat(hooks): version pre-commit hook block + auto-upgrade stale installs

Embed a HOOK_BLOCK_VERSION marker in the # caliber:pre-commit:vN:start
markers. installPreCommitHook() now detects unversioned (legacy) or
mismatched-version blocks and re-installs at the current version.

Before: users who installed caliber 1.40 and ran 'npm update -g' to 1.48
kept the 1.40 hook script forever — missing fixes like .github/.agents/
.opencode/ auto-staging and stderr-to-log redirection.

After: re-running 'caliber hooks --install' (or 'caliber init') on a stale
hook upgrades it cleanly. Non-caliber hook content (gitleaks, husky, etc.)
is preserved during the upgrade.

isPreCommitHookCurrent() is exported so the score check / SessionStart
freshness hook can warn users with stale hooks (follow-up).

Audit finding: F-P0-4 (and indirectly F-P0-6, since the lock false-positive
fix in caliber 1.41+ now actually reaches deployed users)."
```

### Task 7: Make pre-commit refresh failures visible

**Files:**
- Modify: `src/lib/hooks.ts:getPrecommitBlock()` (around line 372-381)
- Modify: `src/lib/__tests__/hooks.test.ts`

- [ ] **Step 1: Update the hook block to print a one-liner on refresh failure**

In `src/lib/hooks.ts`, replace the body of `getPrecommitBlock()` (the multi-line return string near line 372). The current ending is:

```typescript
return `${PRECOMMIT_START}
if ${guard}; then
  mkdir -p .caliber
  echo "\\033[2mcaliber: refreshing docs...\\033[0m"
  ${invoke} refresh --quiet 2>.caliber/refresh-hook.log || true
  ${invoke} learn finalize 2>>.caliber/refresh-hook.log || true
  git diff --name-only -- CLAUDE.md .claude/ .cursor/ AGENTS.md CALIBER_LEARNINGS.md .github/ .agents/ .opencode/ 2>/dev/null | xargs git add 2>/dev/null || true
fi
${PRECOMMIT_END}`;
```

Change the two `|| true` lines to surface failures to stderr (refresh) and stay quiet for finalize (less impactful):

```typescript
return `${PRECOMMIT_START}
if ${guard}; then
  mkdir -p .caliber
  echo "\\033[2mcaliber: refreshing docs...\\033[0m"
  ${invoke} refresh --quiet 2>.caliber/refresh-hook.log || echo "\\033[33mcaliber: refresh skipped — see .caliber/refresh-hook.log\\033[0m" >&2
  ${invoke} learn finalize 2>>.caliber/refresh-hook.log || true
  git diff --name-only -- CLAUDE.md .claude/ .cursor/ AGENTS.md CALIBER_LEARNINGS.md .github/ .agents/ .opencode/ 2>/dev/null | xargs git add 2>/dev/null || true
fi
${PRECOMMIT_END}`;
```

The `|| echo ... >&2` pattern keeps the commit non-failing (still allows the commit to proceed) but emits a one-line yellow warning to stderr that the user CAN see. The `\\033[33m` is yellow ANSI; `\\033[0m` resets.

- [ ] **Step 2: Add a test that the generated block contains the failure-visible echo**

Append to `src/lib/__tests__/hooks.test.ts`:

```typescript
describe('pre-commit hook refresh-failure visibility (F-P0-5)', () => {
  let tmpDir: string;
  const originalCwd = process.cwd();

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'caliber-hook-test-'));
    execSync('git init -q', { cwd: tmpDir });
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('hook block prints a visible warning when refresh fails', () => {
    installPreCommitHook();
    const hookPath = path.join(tmpDir, '.git', 'hooks', 'pre-commit');
    const content = fs.readFileSync(hookPath, 'utf-8');
    expect(content).toMatch(/refresh skipped/i);
    expect(content).toMatch(/refresh-hook\.log/);
    // Must redirect to stderr so it survives normal stdout suppression
    expect(content).toMatch(/>&2/);
  });
});
```

- [ ] **Step 3: Run the new test**

Run: `npx vitest run src/lib/__tests__/hooks.test.ts -t "refresh-failure"`

Expected: the new test passes.

- [ ] **Step 4: Run full test suite + type check + build**

```bash
npm test 2>&1 | tail -5
npx tsc --noEmit 2>&1 | head -5
npm run build 2>&1 | tail -3
```

Expected: all green.

- [ ] **Step 5: Smoke-test the new hook end-to-end**

```bash
# Create a throwaway repo, install the hook with the new dist, simulate refresh failure
rm -rf /tmp/caliber-fix-smoke && mkdir /tmp/caliber-fix-smoke
cd /tmp/caliber-fix-smoke && git init -q
node /Users/alonpe/personal/caliber/dist/bin.js hooks --install 2>&1 | tail -5
cat .git/hooks/pre-commit | grep -E '(refresh|skipped|>&2)' | head -5
cd /Users/alonpe/personal/caliber
```

Expected: the output of `cat | grep` shows the new echo + redirect lines.

- [ ] **Step 6: Commit**

```bash
git add src/lib/hooks.ts src/lib/__tests__/hooks.test.ts
git commit -m "feat(hooks): surface refresh failures to stderr in pre-commit hook

Previously the hook used '|| true' to swallow refresh failures so the
commit always succeeded. Combined with '2>.caliber/refresh-hook.log'
for stderr capture, this meant refresh failures were completely
invisible — users with broken auth (e.g. F-P0-1's Vertex strip bug)
saw 'caliber: refreshing docs...' followed by nothing, while their
configs silently went stale on every commit.

Now refresh failures emit a yellow one-liner to stderr:
  caliber: refresh skipped — see .caliber/refresh-hook.log

The commit still succeeds (we don't want refresh blocking commits),
but the user has a visible signal that something is wrong and a
pointer to where to investigate.

learn finalize stays silent on failure (less critical, less noise).

Audit finding: F-P0-5."
```

---

## Wrap-up

### Task 8: Bump version, update CHANGELOG, full verification

**Files:**
- Modify: `package.json` (version bump)
- Modify: `CHANGELOG.md` (release entry)

- [ ] **Step 1: Bump version in package.json from 1.48.2 to 1.49.0**

Change line 3 of `package.json`:
```json
"version": "1.48.2",
```
to:
```json
"version": "1.49.0",
```

- [ ] **Step 2: Update CHANGELOG.md**

Read the existing CHANGELOG to match formatting:

```bash
head -40 CHANGELOG.md
```

Then prepend a new entry. The exact format depends on the project's convention but should resemble (insert at the top after the title):

```markdown
## 1.49.0

### Fixes from install audit

- **fix(claude-cli)**: preserve `CLAUDE_CODE_USE_VERTEX` and `CLAUDE_CODE_USE_BEDROCK` in env strip — Vertex/Bedrock-backed Claude Code users can now use `caliber init` from inside an active Claude Code session. (Previous blanket strip of all `CLAUDE_CODE_*` env vars broke enterprise auth backends.)
- **fix(skills,writers,cli)**: stop baking the user's machine-specific absolute caliber path (e.g. `/Users/jdoe/.nvm/.../caliber`) into committed content (CLAUDE.md, skills, cursor rules) and user-facing CLI output. New `displayCaliberName()` helper returns just `caliber` (or `npx @rely-ai/caliber` for npx users) for display purposes; `resolveCaliber()` is preserved for hook scripts where absolute paths are correct.
- **feat(hooks)**: pre-commit hook block is now versioned (`# caliber:pre-commit:v2:start`). Re-running `caliber hooks --install` on a stale hook upgrades it cleanly. Non-caliber hook content (gitleaks, husky, etc.) is preserved.
- **feat(hooks)**: refresh failures in the pre-commit hook now emit a visible yellow warning to stderr instead of being silently swallowed. Commits still succeed (refresh isn't a commit gate), but the user has a signal that something is wrong.

These fixes address P0 findings F-P0-1, F-P0-3, F-P0-4, and F-P0-5 from the install audit (`docs/superpowers/specs/2026-04-29-caliber-install-audit-findings.md`).
```

- [ ] **Step 3: Run the entire test + lint + type-check + build pipeline**

```bash
npm test 2>&1 | tail -10
npm run lint 2>&1 | tail -5
npx tsc --noEmit 2>&1 | head -10
npm run build 2>&1 | tail -5
```

Expected: all green. If lint fails on any new file, run `npm run lint:fix` and re-commit (no separate commit — fold into the next step).

- [ ] **Step 4: Verify version is bumped in dist**

```bash
node dist/bin.js --version
```

Expected: prints `1.49.0`.

- [ ] **Step 5: Commit**

```bash
git add package.json CHANGELOG.md
git commit -m "chore: release 1.49.0

Three install-audit P0 fixes:
- fix(claude-cli): preserve CLAUDE_CODE_USE_VERTEX/BEDROCK in env strip
- fix(skills,writers,cli): use bare 'caliber' in committed/displayed text
- feat(hooks): versioned pre-commit block + visible refresh-failure warnings

See CHANGELOG.md and the install audit findings doc for context."
```

- [ ] **Step 6: Final verification**

```bash
git log --oneline master..HEAD | head -20
git diff master..HEAD --stat | tail -10
npm test 2>&1 | tail -5
node dist/bin.js --version
```

Expected:
- 6 new fix commits since the audit docs (Tasks 2, 3, 4, 5, 6, 7) plus the wrap-up commit = 7 fix commits, totaling 19 commits since master.
- Source files changed: src/llm/claude-cli.ts, src/lib/resolve-caliber.ts, src/lib/builtin-skills.ts, src/writers/pre-commit-block.ts, src/scoring/display.ts, src/scoring/checks/sources.ts, src/scoring/checks/accuracy.ts, src/llm/seat-based-errors.ts, src/llm/model-recovery.ts, src/llm/index.ts, src/commands/init.ts, src/lib/hooks.ts, package.json, CHANGELOG.md, plus matching test files.
- Tests: > 1008 (1008 baseline + ~25 new tests).
- Version: 1.49.0.
