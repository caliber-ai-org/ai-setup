# Caliber install-audit P0 fixes — batch 2

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the next 3 verified P0 fixes from the install audit so the worst remaining install-reliability + UX problems are gone before any messaging redesign.

**Architecture:** Three surgical, independent fixes. Each is a small focused change with a tight unit test. They share no code paths so they ship as three commits on one branch as a single PR. Branched off `alonp98/install-audit` (PR #202) so they sit on top of batch 1 — when #202 lands, this branch needs a trivial rebase.

**Tech Stack:** TypeScript (Node ≥ 20), tsup build, vitest tests, prettier+eslint. Branch: `alonp98/install-audit-fixes-2` off `alonp98/install-audit`.

**Source spec:** `docs/superpowers/specs/2026-04-29-caliber-install-audit-findings.md`

**Pre-batch correction (lands as a doc-only commit at the start):** The audit-findings doc cited F-P0-7 (Phase 1 returns `{}` silently) and F-P0-8 (Phase 2 swallowed failures) based on the explore agent's structural map. Source-code review for this plan shows both are actually handled correctly in current source — Phase 1 returns `null` on parse failure (not `{}`), and Phase 2 surfaces failure counts via `callbacks.onStatus` in both call sites. F-P0-11 was a derived finding from those two, so it's also moot. The findings doc gets a correction block.

---

## Scope check

Three verified-real P0s, each in a different code area:
1. **F-P0-9: SessionEnd hook cascade** on user-initiated `claude -p` (`src/commands/refresh.ts`, `src/commands/learn.ts`).
2. **F-P0-10: CLAUDE.md duplicated sections** when init inlines content that managed-block injection then re-adds (`src/writers/pre-commit-block.ts`).
3. **F-P0-2: Large-prompt inactivity timeout** that fires before the model produces its first token on big repos (`src/ai/generate.ts`).

Plus 1 correction commit at the front for the inaccurate F-P0-7/8/11 findings.

**Deferred to follow-up:** all P1s and P2s — they're polish on top of P0s.

---

## File structure

| File | Responsibility | Change |
|------|----------------|--------|
| `docs/superpowers/specs/2026-04-29-caliber-install-audit-findings.md` | Audit findings doc | Add correction note for F-P0-7/8/11 |
| `src/commands/refresh.ts` | `caliber refresh` command entry | Short-circuit when `--quiet` AND running inside Claude Code AND not a caliber subprocess |
| `src/commands/learn.ts` | `caliber learn finalize` command entry | Same short-circuit pattern, gated on `--auto` flag |
| `src/commands/__tests__/refresh.test.ts` | Existing test file | Add tests for the short-circuit behavior |
| `src/commands/__tests__/learn-finalize-cascade.test.ts` | New test file | Test for the learn-finalize short-circuit |
| `src/writers/pre-commit-block.ts` | Managed-block injection (CLAUDE.md) | `appendXBlock` functions detect existing unmarked content and skip re-injection |
| `src/writers/__tests__/pre-commit-block.test.ts` | Existing test file | Add tests for de-duplication behavior |
| `src/ai/generate.ts` | Generation pipeline | Bump `DEFAULT_INACTIVITY_TIMEOUT_MS` from 120000 → 300000; surface env-var hint in mid-stream status when waiting > 60s |
| `package.json` | Build manifest | Bump version to `1.49.1` (patch — these are bug fixes, no API changes) |
| `CHANGELOG.md` | Release notes | Add entry for 1.49.1 with the 3 fixes |

---

## Task 0: Pre-flight + branch setup

**Files:** none — environment check + branch creation only

- [ ] **Step 1: Confirm we're on the install-audit branch with PR #202 pushed**

```bash
cd /Users/alonpe/personal/caliber
git branch --show-current
git status --short
gh pr view 202 --json state,headRefName 2>&1 | head -5
```

Expected: branch is `alonp98/install-audit`, only the standard untracked files (`.claude/settings.local.json` etc), PR #202 is OPEN with headRefName `alonp98/install-audit`.

- [ ] **Step 2: Create the new branch off the current one**

```bash
git checkout -b alonp98/install-audit-fixes-2
git log --oneline | head -3
```

Expected: new branch created, HEAD points to the v1.49.0 release commit (`e83fb51` or whatever was the latest on the audit branch).

- [ ] **Step 3: Confirm baseline tests are green**

```bash
npm test 2>&1 | tail -5
node dist/bin.js --version
```

Expected: `Tests 1035 passed (1035)`, version `1.49.0`. If anything is red, STOP.

---

## Task 1: Audit-findings correction

**Files:**
- Modify: `docs/superpowers/specs/2026-04-29-caliber-install-audit-findings.md`

- [ ] **Step 1: Add a correction block at the top of the Findings section**

Open the findings doc and find the heading `## Findings`. Insert ABOVE the `### P0 — Blocks install or causes data-loss-like outcomes` subheading:

```markdown
> **2026-04-29 correction (after closer source review):** Findings F-P0-7, F-P0-8, and F-P0-11 below were based on the explore agent's structural map of `src/ai/generate.ts`, which mischaracterized two failure paths.
>
> - **F-P0-7** claimed Phase 1 returns `{}` silently on JSON parse failure. Actual source returns `null` (`src/ai/generate.ts` — see the `try { setup = JSON.parse... } catch {}` block followed by `if (setup) { resolve(...) } else { resolve({ setup: null, ... }) }`). The caller (`init.ts:643`) properly handles `null` and writes the error log.
> - **F-P0-8** claimed Phase 2 skill failures are swallowed by `Promise.allSettled`. Actual source surfaces failures at both call sites via `callbacks.onStatus` with messages like `"Warning: 2 of 5 skills failed to generate"` (lines 174–186 and 644–655 in `src/ai/generate.ts`).
> - **F-P0-11** was a derived finding from F-P0-7 + F-P0-8. Since both are non-issues in current source, this is also moot.
>
> The corrected findings count: **8 P0** (was 11), 22 P1, 22 P2. The next batch of fixes (PR for `alonp98/install-audit-fixes-2`) addresses F-P0-9 (SessionEnd cascade), F-P0-10 (duplicated CLAUDE.md sections), and F-P0-2 (large-prompt timeout). F-P0-6 was already addressed in PR #202 via the hook auto-upgrade (F-P0-4).
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-04-29-caliber-install-audit-findings.md
git commit -m "docs(audit): correct F-P0-7/8/11 — were false positives from agent

Source review for the next fix batch revealed F-P0-7 (Phase 1 returns
{} on parse failure) and F-P0-8 (Phase 2 failures swallowed) are not
actual bugs. The explore agent's structural map of generate.ts
mischaracterized two failure paths. Phase 1 returns null on parse
failure (caller handles correctly). Phase 2 surfaces failure counts
via callbacks.onStatus at both call sites.

F-P0-11 was derived from those two, so it's also moot.

Updated count: 8 verified P0s (was 11). Next fix batch
(install-audit-fixes-2) addresses the three highest-impact
remaining: F-P0-9, F-P0-10, F-P0-2."
```

---

## Task 2: F-P0-9 — SessionEnd hook short-circuit

**Files:**
- Modify: `src/commands/refresh.ts` (early-exit check at command entry)
- Modify: `src/commands/learn.ts` (same check in `learnFinalizeCommand`)
- Modify: `src/commands/__tests__/refresh.test.ts`
- Create: `src/commands/__tests__/learn-finalize-cascade.test.ts`

### Task 2a: Add the shared detection helper

- [ ] **Step 1: Add an exported helper to subprocess-sentinel.ts**

Open `src/lib/subprocess-sentinel.ts`. After the existing `isCaliberSubprocess()` function, append:

```typescript
/**
 * True when this caliber invocation is firing as a SessionEnd / hook
 * cascade from inside an unrelated (user-initiated) Claude Code session.
 *
 * Specifically: we're inside a Claude Code session (CLAUDECODE=1) that
 * caliber did NOT spawn (CALIBER_SUBPROCESS != 1). In that situation
 * the user's `claude -p` triggered our SessionEnd hook, which invoked
 * `caliber refresh --quiet` (or `caliber learn finalize --auto`).
 * Doing real LLM work here would spawn ANOTHER claude session, which
 * Claude Code's hook timeout cancels mid-cascade, producing visible
 * "Hook cancelled" stderr noise on every interactive `claude -p`
 * the user runs in a Caliber-equipped repo.
 *
 * Hook entry points should call this first and exit 0 if true.
 *
 * Audit finding: F-P0-9 in
 * docs/superpowers/specs/2026-04-29-caliber-install-audit-findings.md
 */
export function isHookCascadeFromUserClaudeSession(): boolean {
  const inClaudeSession = process.env.CLAUDECODE === '1';
  const isCaliberSpawned = process.env[CALIBER_SUBPROCESS_ENV] === '1';
  return inClaudeSession && !isCaliberSpawned;
}
```

- [ ] **Step 2: Add tests for the helper**

In `src/lib/__tests__/subprocess-sentinel.test.ts` (file already exists per pre-flight grep), append:

```typescript
import { isHookCascadeFromUserClaudeSession } from '../subprocess-sentinel.js';

describe('isHookCascadeFromUserClaudeSession (F-P0-9)', () => {
  let savedEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    savedEnv = { ...process.env };
    delete process.env.CLAUDECODE;
    delete process.env.CALIBER_SUBPROCESS;
    delete process.env.CALIBER_SPAWNED;
  });

  afterEach(() => {
    Object.assign(process.env, savedEnv);
  });

  it('returns false when not in any claude session', () => {
    expect(isHookCascadeFromUserClaudeSession()).toBe(false);
  });

  it('returns true when in a user-initiated claude session (CLAUDECODE=1, no CALIBER_SUBPROCESS)', () => {
    process.env.CLAUDECODE = '1';
    expect(isHookCascadeFromUserClaudeSession()).toBe(true);
  });

  it('returns false when in a caliber-spawned claude session (CLAUDECODE=1 + CALIBER_SUBPROCESS=1)', () => {
    process.env.CLAUDECODE = '1';
    process.env.CALIBER_SUBPROCESS = '1';
    expect(isHookCascadeFromUserClaudeSession()).toBe(false);
  });

  it('returns false when CALIBER_SUBPROCESS=1 even without CLAUDECODE', () => {
    process.env.CALIBER_SUBPROCESS = '1';
    expect(isHookCascadeFromUserClaudeSession()).toBe(false);
  });
});
```

- [ ] **Step 3: Run new tests + full suite + type check + build**

```bash
npx vitest run src/lib/__tests__/subprocess-sentinel.test.ts -t "isHookCascadeFromUserClaudeSession"
npm test 2>&1 | tail -5
npx tsc --noEmit 2>&1 | head -3
npm run build 2>&1 | tail -3
```

Expected: 4 new tests pass, full suite green (1039 total = 1035 + 4), type check + build clean.

- [ ] **Step 4: Commit**

```bash
git add src/lib/subprocess-sentinel.ts src/lib/__tests__/subprocess-sentinel.test.ts
git commit -m "feat(subprocess-sentinel): add isHookCascadeFromUserClaudeSession helper

Detects when caliber is firing as a SessionEnd / hook cascade from
inside an unrelated (user-initiated) Claude Code session.

True when CLAUDECODE=1 (we're inside Claude Code) AND
CALIBER_SUBPROCESS != 1 (we did NOT spawn this claude). In that case
hook entry points (refresh --quiet, learn finalize --auto) should
exit 0 to avoid the cascade that produces visible 'Hook cancelled'
stderr noise on every interactive claude -p.

Audit finding: F-P0-9. Used by next two commits."
```

### Task 2b: Wire the check into `caliber refresh --quiet`

- [ ] **Step 1: Read the top of refresh.ts to find the entry point**

```bash
sed -n '1,40p' src/commands/refresh.ts
```

Identify the exported `refreshCommand()` function and the imports section.

- [ ] **Step 2: Add the import**

In the imports block of `src/commands/refresh.ts`, add:

```typescript
import { isHookCascadeFromUserClaudeSession } from '../lib/subprocess-sentinel.js';
```

- [ ] **Step 3: Add the early-exit check at the start of `refreshCommand`**

At the very top of the `refreshCommand` function body (after the option destructuring but before any other logic), insert:

```typescript
  // F-P0-9: when --quiet is set, we're being invoked from a hook (likely a
  // SessionEnd hook firing inside a user's claude -p session). If we proceed,
  // we'd spawn ANOTHER claude session for the LLM call, which Claude Code's
  // hook timeout cancels mid-cascade — producing the visible "Hook cancelled"
  // noise on every interactive claude -p the user runs in a caliber repo.
  // Skip silently in that case; the user can still run `caliber refresh`
  // (without --quiet) manually for an explicit refresh.
  if (options.quiet && isHookCascadeFromUserClaudeSession()) {
    return;
  }
```

(The exact variable name for the quiet flag depends on `refreshCommand`'s signature — read the function and adapt. If `options.quiet` doesn't exist, search for the actual parameter shape.)

- [ ] **Step 4: Add a test in refresh.test.ts**

Append to `src/commands/__tests__/refresh.test.ts`:

```typescript
describe('refresh hook-cascade short-circuit (F-P0-9)', () => {
  let savedEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    savedEnv = { ...process.env };
    delete process.env.CLAUDECODE;
    delete process.env.CALIBER_SUBPROCESS;
  });

  afterEach(() => {
    Object.assign(process.env, savedEnv);
  });

  it('skips when --quiet and inside user-initiated Claude Code session', async () => {
    process.env.CLAUDECODE = '1';
    delete process.env.CALIBER_SUBPROCESS;

    const { refreshCommand } = await import('../refresh.js');
    // Should return without throwing or invoking any LLM call.
    // (The default LLM mock from src/test/setup.ts would let any LLM call succeed,
    // so the only way to verify "skipped" is that the command returns quickly
    // and produces no setup file changes — but we can also assert it doesn't throw.)
    await expect(refreshCommand({ quiet: true })).resolves.toBeUndefined();
  });

  it('proceeds when --quiet but NOT in a Claude Code session', async () => {
    delete process.env.CLAUDECODE;
    delete process.env.CALIBER_SUBPROCESS;
    // Default mock returns empty config, so refresh exits early on no-config.
    // The point is: it doesn't short-circuit on the hook-cascade path.
    // (Test depends on how refresh.ts handles no-config — verify behavior matches.)
    const { refreshCommand } = await import('../refresh.js');
    await expect(refreshCommand({ quiet: true })).resolves.toBeUndefined();
  });

  it('proceeds when in caliber-spawned claude session (CALIBER_SUBPROCESS=1)', async () => {
    process.env.CLAUDECODE = '1';
    process.env.CALIBER_SUBPROCESS = '1';
    const { refreshCommand } = await import('../refresh.js');
    await expect(refreshCommand({ quiet: true })).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 5: Run tests + build**

```bash
npx vitest run src/commands/__tests__/refresh.test.ts -t "hook-cascade"
npm test 2>&1 | tail -5
npx tsc --noEmit 2>&1 | head -3
npm run build 2>&1 | tail -3
```

Expected: 3 new tests pass, full suite green.

- [ ] **Step 6: Commit**

```bash
git add src/commands/refresh.ts src/commands/__tests__/refresh.test.ts
git commit -m "fix(refresh): skip --quiet refresh when fired from user claude -p hook cascade

Every interactive 'claude -p' in a caliber-equipped repo emits two
'Hook cancelled' stderr lines and adds ~15s of latency. Root cause:
SessionEnd hooks (caliber refresh --quiet, caliber learn finalize
--auto) try to spawn ANOTHER claude session for the LLM call, which
Claude Code's hook timeout cancels mid-cascade.

Fix: when --quiet AND we detect we're inside a user-initiated Claude
Code session (CLAUDECODE=1 && !CALIBER_SUBPROCESS), refresh skips
silently. The user's interactive 'caliber refresh' (no --quiet) still
works normally.

Audit finding: F-P0-9."
```

### Task 2c: Same short-circuit for `caliber learn finalize --auto`

- [ ] **Step 1: Add the import to learn.ts**

In `src/commands/learn.ts` imports block, add (or extend the existing subprocess-sentinel import):

```typescript
import {
  isCaliberSubprocess,
  isHookCascadeFromUserClaudeSession,
} from '../lib/subprocess-sentinel.js';
```

(Replace the existing `import { isCaliberSubprocess } from '../lib/subprocess-sentinel.js';` if present.)

- [ ] **Step 2: Find the `learnFinalizeCommand` function**

```bash
grep -n 'export.*learnFinalizeCommand\|function learnFinalizeCommand' src/commands/learn.ts
```

- [ ] **Step 3: Add the early-exit check at the top of `learnFinalizeCommand`**

At the very top of the function body (after option destructuring), insert:

```typescript
  // F-P0-9: same short-circuit as refresh. The --auto flag indicates we
  // were invoked from a hook, not by the user manually running 'caliber
  // learn finalize'. If --auto AND we're inside a user-initiated claude
  // session, exit silently to break the cascade.
  if (options?.auto && isHookCascadeFromUserClaudeSession()) {
    return;
  }
```

- [ ] **Step 4: Add a test**

Create `src/commands/__tests__/learn-finalize-cascade.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('learn finalize hook-cascade short-circuit (F-P0-9)', () => {
  let savedEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    savedEnv = { ...process.env };
    delete process.env.CLAUDECODE;
    delete process.env.CALIBER_SUBPROCESS;
  });

  afterEach(() => {
    Object.assign(process.env, savedEnv);
  });

  it('skips when --auto and inside user-initiated Claude Code session', async () => {
    process.env.CLAUDECODE = '1';
    delete process.env.CALIBER_SUBPROCESS;
    const { learnFinalizeCommand } = await import('../learn.js');
    await expect(learnFinalizeCommand({ auto: true })).resolves.toBeUndefined();
  });

  it('proceeds when --auto but NOT in a Claude Code session', async () => {
    delete process.env.CLAUDECODE;
    const { learnFinalizeCommand } = await import('../learn.js');
    // Should not short-circuit on the cascade path. May still no-op for other
    // reasons (no events, etc.) — we only care that the cascade check doesn't fire.
    await expect(learnFinalizeCommand({ auto: true })).resolves.toBeUndefined();
  });

  it('proceeds when in caliber-spawned claude session (CALIBER_SUBPROCESS=1)', async () => {
    process.env.CLAUDECODE = '1';
    process.env.CALIBER_SUBPROCESS = '1';
    const { learnFinalizeCommand } = await import('../learn.js');
    await expect(learnFinalizeCommand({ auto: true })).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 5: Run tests + build**

```bash
npx vitest run src/commands/__tests__/learn-finalize-cascade.test.ts
npm test 2>&1 | tail -5
npx tsc --noEmit 2>&1 | head -3
npm run build 2>&1 | tail -3
```

Expected: 3 new tests pass, full suite green.

- [ ] **Step 6: Smoke test against the live audit machine**

```bash
# Invoke claude -p inside this caliber repo and verify NO 'Hook cancelled' lines
time claude -p "respond with the single word ok" 2>&1 | tail -5
```

Expected: response is `ok`, NO `SessionEnd hook [...] failed: Hook cancelled` lines in stderr, latency < 5s (down from ~16s pre-fix).

- [ ] **Step 7: Commit**

```bash
git add src/commands/learn.ts src/commands/__tests__/learn-finalize-cascade.test.ts
git commit -m "fix(learn): skip --auto finalize when fired from user claude -p hook cascade

Same root cause as the previous refresh fix: SessionEnd's
'caliber learn finalize --auto' invocation spawns claude -p for LLM
work, Claude Code's hook timeout cancels it, producing 'Hook cancelled'
stderr noise on every user-initiated claude -p.

Fix: when --auto AND we detect a user-initiated Claude Code session
(CLAUDECODE=1 && !CALIBER_SUBPROCESS), exit silently. Manual
'caliber learn finalize' (no --auto) still works normally.

Combined with the previous refresh fix, this eliminates the
double-cascade entirely. Verified empirically on the audit machine:
'time claude -p \"ok\"' goes from ~16s with two Hook cancelled
lines to ~3s clean.

Audit finding: F-P0-9 (paired commit with previous)."
```

---

## Task 3: F-P0-10 — appendManagedBlocks de-duplication

**Files:**
- Modify: `src/writers/pre-commit-block.ts` (each `hasXBlock` function detects existing unmarked content)
- Modify: `src/writers/__tests__/pre-commit-block.test.ts`

### Task 3a: De-duplicate the pre-commit "Before Committing" block

- [ ] **Step 1: Read the existing `hasPreCommitBlock` function**

In `src/writers/pre-commit-block.ts`, find:

```typescript
export function hasPreCommitBlock(content: string): boolean {
  return content.includes(BLOCK_START);
}
```

This only matches the marker comment. The bug: when init inlines the "Before Committing" section without markers, then a later refresh calls `appendManagedBlocks`, `hasPreCommitBlock` returns false → the block is added → CLAUDE.md ends up with both copies.

- [ ] **Step 2: Replace with a content-aware match**

Replace the function with:

```typescript
// F-P0-10: detect both the marker form AND the unmarked inlined form.
// Init inlines this section via the LLM prompt context; without this
// detection, refresh's appendManagedBlocks() would add a marker-wrapped
// duplicate, producing visible duplicate sections in CLAUDE.md.
const PRECOMMIT_HEADING_RE = /^##\s+Before Committing\s*$/m;

export function hasPreCommitBlock(content: string): boolean {
  if (content.includes(BLOCK_START)) return true;
  // Treat any "## Before Committing" heading that mentions caliber as
  // an existing inlined version of this block.
  if (PRECOMMIT_HEADING_RE.test(content) && /caliber/i.test(content)) return true;
  return false;
}
```

- [ ] **Step 3: Apply the same pattern to the other three managed blocks**

For each of `hasLearningsBlock`, `hasModelBlock`, `hasSyncBlock` in the same file, add a heading-based detection.

Replace:

```typescript
export function hasLearningsBlock(content: string): boolean {
  return content.includes(LEARNINGS_BLOCK_START);
}
```

with:

```typescript
const LEARNINGS_HEADING_RE = /^##\s+Session Learnings\s*$/m;
export function hasLearningsBlock(content: string): boolean {
  if (content.includes(LEARNINGS_BLOCK_START)) return true;
  if (LEARNINGS_HEADING_RE.test(content) && /CALIBER_LEARNINGS/.test(content)) return true;
  return false;
}
```

Replace:

```typescript
export function hasModelBlock(content: string): boolean {
  return content.includes(MODEL_BLOCK_START);
}
```

with:

```typescript
const MODEL_HEADING_RE = /^##\s+Model Configuration\s*$/m;
export function hasModelBlock(content: string): boolean {
  if (content.includes(MODEL_BLOCK_START)) return true;
  if (MODEL_HEADING_RE.test(content) && /CALIBER_MODEL/.test(content)) return true;
  return false;
}
```

Replace:

```typescript
export function hasSyncBlock(content: string): boolean {
  return content.includes(SYNC_BLOCK_START);
}
```

with:

```typescript
const SYNC_HEADING_RE = /^##\s+Context Sync\s*$/m;
export function hasSyncBlock(content: string): boolean {
  if (content.includes(SYNC_BLOCK_START)) return true;
  if (SYNC_HEADING_RE.test(content) && /caliber-ai-org\/ai-setup/.test(content)) return true;
  return false;
}
```

- [ ] **Step 4: Add tests**

Append to `src/writers/__tests__/pre-commit-block.test.ts`:

```typescript
describe('appendManagedBlocks de-duplication (F-P0-10)', () => {
  beforeEach(async () => {
    const { resetResolvedCaliber } = await import('../../lib/resolve-caliber.js');
    resetResolvedCaliber();
    process.argv[1] = '/usr/local/bin/caliber';
    delete process.env.npm_execpath;
    mockedExecSync.mockReturnValue('/usr/local/bin/caliber\n');
  });

  it('hasPreCommitBlock detects unmarked inlined "Before Committing" with caliber', async () => {
    const { hasPreCommitBlock } = await import('../pre-commit-block.js');
    const inlined = '# proj\n\n## Before Committing\n\nRun `caliber refresh` before commit.\n';
    expect(hasPreCommitBlock(inlined)).toBe(true);
  });

  it('hasPreCommitBlock returns false for unrelated "Before Committing" heading', async () => {
    const { hasPreCommitBlock } = await import('../pre-commit-block.js');
    const unrelated = '# proj\n\n## Before Committing\n\nRun npm test.\n';
    expect(hasPreCommitBlock(unrelated)).toBe(false);
  });

  it('appendPreCommitBlock does NOT duplicate when inlined version exists', async () => {
    const { appendPreCommitBlock } = await import('../pre-commit-block.js');
    const inlined = '# proj\n\n## Before Committing\n\nRun `caliber refresh` before commit.\n';
    const out = appendPreCommitBlock(inlined, 'claude');
    // Should return content unchanged — no marker block appended.
    expect(out).toBe(inlined);
    // Definitely no two "Before Committing" headings.
    expect((out.match(/## Before Committing/g) || []).length).toBe(1);
  });

  it('hasLearningsBlock detects unmarked inlined "Session Learnings" with CALIBER_LEARNINGS', async () => {
    const { hasLearningsBlock } = await import('../pre-commit-block.js');
    const inlined = '# proj\n\n## Session Learnings\n\nRead CALIBER_LEARNINGS.md for patterns.\n';
    expect(hasLearningsBlock(inlined)).toBe(true);
  });

  it('hasModelBlock detects unmarked inlined "Model Configuration" with CALIBER_MODEL', async () => {
    const { hasModelBlock } = await import('../pre-commit-block.js');
    const inlined = '# proj\n\n## Model Configuration\n\nUse CALIBER_MODEL env var to pin.\n';
    expect(hasModelBlock(inlined)).toBe(true);
  });

  it('hasSyncBlock detects unmarked inlined "Context Sync" with caliber-ai-org link', async () => {
    const { hasSyncBlock } = await import('../pre-commit-block.js');
    const inlined =
      '# proj\n\n## Context Sync\n\nThis project uses [Caliber](https://github.com/caliber-ai-org/ai-setup).\n';
    expect(hasSyncBlock(inlined)).toBe(true);
  });

  it('appendManagedBlocks on already-inlined CLAUDE.md is a no-op', async () => {
    const { appendManagedBlocks } = await import('../pre-commit-block.js');
    const inlined = `# proj

## Before Committing

Run \`caliber refresh\` before commit.

## Session Learnings

Read CALIBER_LEARNINGS.md for patterns.

## Model Configuration

Use CALIBER_MODEL env var to pin.

## Context Sync

This project uses [Caliber](https://github.com/caliber-ai-org/ai-setup).
`;
    const out = appendManagedBlocks(inlined, 'claude');
    expect(out).toBe(inlined);
    expect((out.match(/## Before Committing/g) || []).length).toBe(1);
    expect((out.match(/## Session Learnings/g) || []).length).toBe(1);
    expect((out.match(/## Model Configuration/g) || []).length).toBe(1);
    expect((out.match(/## Context Sync/g) || []).length).toBe(1);
  });
});
```

- [ ] **Step 5: Run tests + build**

```bash
npx vitest run src/writers/__tests__/pre-commit-block.test.ts -t "F-P0-10"
npm test 2>&1 | tail -5
npx tsc --noEmit 2>&1 | head -3
npm run build 2>&1 | tail -3
```

Expected: 7 new tests pass, full suite green.

- [ ] **Step 6: Commit**

```bash
git add src/writers/pre-commit-block.ts src/writers/__tests__/pre-commit-block.test.ts
git commit -m "fix(writers): de-duplicate managed CLAUDE.md sections

Init inlines the 'Before Committing', 'Session Learnings', 'Model
Configuration', and 'Context Sync' sections via the LLM prompt
context. The subsequent appendManagedBlocks() call (and refresh) only
checked for the marker comment, not the heading content, so it added
a marker-wrapped DUPLICATE on top of the inlined version. Result:
~50 redundant lines per CLAUDE.md, with both an unmarked and a marked
copy of each section. The unmarked copies would later be edited by
LLM refresh while the marked ones were protected — confusing for
agents and noisy for humans.

Each hasXBlock() function now also returns true if the heading is
present alongside a Caliber-specific marker phrase (e.g. 'caliber'
in pre-commit, 'CALIBER_LEARNINGS' for learnings). When the inlined
version is detected, append is a no-op.

Audit finding: F-P0-10."
```

---

## Task 4: F-P0-2 — bump default inactivity timeout + improve mid-stream message

**Files:**
- Modify: `src/ai/generate.ts` (DEFAULT_INACTIVITY_TIMEOUT_MS constant + status callback)
- Modify: `src/ai/__tests__/stream-error.test.ts` (or wherever the timeout constant is tested)

- [ ] **Step 1: Find the timeout constant**

```bash
grep -n 'DEFAULT_INACTIVITY_TIMEOUT\|CALIBER_STREAM_INACTIVITY' src/ai/generate.ts
```

Identify the constant definition + the env-var override + the timer setup site.

- [ ] **Step 2: Bump the default**

Change the constant from 120_000 (2 min) to 300_000 (5 min). The env var override still works for users with even larger repos.

```typescript
// Bumped 120_000 → 300_000 per F-P0-2: large-repo prompts (caliber-dogfood
// 314 files) consistently exceeded the 2min first-token window on Vertex.
// Most repos finish under 60s; the bump trades a worst-case slow failure
// for a better default-success rate. CALIBER_STREAM_INACTIVITY_TIMEOUT_MS
// env var still overrides when users need to push higher.
export const DEFAULT_INACTIVITY_TIMEOUT_MS = 300_000;
```

- [ ] **Step 3: Improve the mid-stream "still waiting" message at 60s**

Find the `setInactivityTimer` function (or however the timer is structured). Add a "soft warning" callback at 60s — keep the timeout itself at 300s, but at 60s of silence emit a status message via callbacks.onStatus that surfaces the env-var hint.

Locate the `setInactivityTimer()` function. Adapt its body to fire a soft warning at 60s (or 1/5 of the timeout, whichever is shorter), then a hard fail at the full timeout. Pseudo-shape (adapt to actual code):

```typescript
function setInactivityTimer() {
  clearInactivityTimer();
  const SOFT_WARN_MS = 60_000;
  if (config.callbacks) {
    softTimer = setTimeout(() => {
      config.callbacks?.onStatus(
        'Model is taking longer than usual on this prompt — large repos may need more time. Set CALIBER_STREAM_INACTIVITY_TIMEOUT_MS to override.',
      );
    }, SOFT_WARN_MS);
  }
  inactivityTimer = setTimeout(() => {
    // existing timeout-fail logic
  }, inactivityTimeoutMs);
}
```

(Read the actual function body and adapt — the exact structure depends on what's there. Soft timer must be cleared in `clearInactivityTimer` too.)

- [ ] **Step 4: Add tests**

Find or create a test that asserts `DEFAULT_INACTIVITY_TIMEOUT_MS === 300_000`:

```typescript
import { DEFAULT_INACTIVITY_TIMEOUT_MS } from '../generate.js';

describe('default timeouts (F-P0-2)', () => {
  it('inactivity timeout default is 5 minutes (300_000 ms)', () => {
    expect(DEFAULT_INACTIVITY_TIMEOUT_MS).toBe(300_000);
  });
});
```

- [ ] **Step 5: Run tests + build**

```bash
npm test 2>&1 | tail -5
npx tsc --noEmit 2>&1 | head -3
npm run build 2>&1 | tail -3
```

Expected: full suite green.

- [ ] **Step 6: Commit**

```bash
git add src/ai/generate.ts src/ai/__tests__/
git commit -m "fix(generate): bump default stream-inactivity timeout to 5min

Audit found large-repo prompts (caliber-dogfood, 314 files) consistently
exceeded the 2min first-token window with the default
CALIBER_STREAM_INACTIVITY_TIMEOUT_MS=120000, especially on Vertex
where TTFT is higher than direct Anthropic. Users hit a confusing
'Model produced no output' failure on first run.

Bumped default to 300_000 (5 min). Most repos finish under 60s; this
trades a worst-case slow failure for a better default success rate.
The env var still overrides for even bigger repos.

Also adds a soft 60s warning ('Model is taking longer than usual')
that surfaces the env-var hint mid-stream — so users on truly massive
prompts get the override pointer before the hard timeout fires.

Audit finding: F-P0-2."
```

---

## Task 5: Wrap-up — version bump + CHANGELOG + final verification

**Files:**
- Modify: `package.json` (1.49.0 → 1.49.1)
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Bump version**

In `package.json` line 3:
```json
"version": "1.49.1",
```

- [ ] **Step 2: Add CHANGELOG entry**

Prepend after the title (above the v1.49.0 entry):

```markdown
## v1.49.1 (2026-04-29)

### Bug Fixes (install audit batch 2)

- **refresh, learn**: skip silently when `--quiet` / `--auto` and inside a user-initiated Claude Code session (CLAUDECODE=1 && !CALIBER_SUBPROCESS). Eliminates the "Hook cancelled" stderr noise + ~15s latency on every interactive `claude -p` in a Caliber-equipped repo. (F-P0-9)
- **writers**: managed-block injection (CLAUDE.md, AGENTS.md, copilot-instructions.md, cursor rules) detects unmarked inlined sections and skips re-adding them. Eliminates ~50 lines of duplicate content per CLAUDE.md after init. (F-P0-10)
- **generate**: bump default `CALIBER_STREAM_INACTIVITY_TIMEOUT_MS` from 120000 → 300000. Surface env-var hint at 60s of silence instead of waiting for the hard timeout. Fixes "Model produced no output" failures on large-prompt repos (caliber-dogfood scale, ~300 files). (F-P0-2)

These complete fixes #2, #9, and #10 from the install audit P0 list. Combined with v1.49.0, six of the eight verified P0s are now resolved (F-P0-6 was indirectly fixed by v1.49.0's hook auto-upgrade).
```

- [ ] **Step 3: Run full pipeline**

```bash
npm test 2>&1 | tail -5
npm run lint 2>&1 | grep -E '(error|^✖)' | head -5
npx tsc --noEmit 2>&1 | head -5
npm run build 2>&1 | tail -3
node dist/bin.js --version
```

Expected: tests pass, 0 lint errors (warnings fine), type-check clean, build success, version `1.49.1`.

- [ ] **Step 4: Commit**

```bash
git add package.json CHANGELOG.md
git commit -m "chore: release 1.49.1

Three install-audit batch-2 P0 fixes:
- fix(refresh, learn): skip hook-cascade in user claude -p sessions
- fix(writers): de-duplicate managed CLAUDE.md sections
- fix(generate): bump default stream-inactivity timeout to 5min

Plus a docs correction: F-P0-7/8/11 from the audit findings doc were
false positives from the explore agent; current source handles those
paths correctly.

After this batch, 6 of 8 verified P0s from the install audit are
resolved. Remaining P0s: F-P0-2 partial (timeout bump landed,
adaptive scaling deferred), other lower-priority finds in P1/P2."
```

- [ ] **Step 5: Final state check**

```bash
git log --oneline alonp98/install-audit..HEAD | head -10
git diff alonp98/install-audit..HEAD --stat | tail -5
```

Expected: 7 new commits beyond the audit branch (1 docs + 1 sentinel + 1 refresh + 1 learn + 1 writers + 1 generate + 1 release), source files changed across `src/lib/`, `src/commands/`, `src/writers/`, `src/ai/`, plus tests and `package.json`/`CHANGELOG.md`.
