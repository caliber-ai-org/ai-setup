---
name: scoring-checks
description: Add a new deterministic scoring check in src/scoring/checks/ that evaluates config quality. Follows the Check[] return pattern, uses point constants from src/scoring/constants.ts, and integrates via filterChecksForTarget() in src/scoring/index.ts. Use when user says 'add scoring check', 'new check', 'modify scoring criteria', or works in src/scoring/checks/. Do NOT use for display changes or refactoring scoring logic.
paths:
  - src/scoring/checks/**/*.ts
  - src/scoring/constants.ts
  - src/scoring/index.ts
---
# Adding a Scoring Check

Add a new deterministic check that evaluates a single aspect of AI agent config quality. All checks must be filesystem-based with no network calls or LLM inference.

## Critical

- **Check must be deterministic**: Same filesystem state → same result every time. No randomness, no external APIs.
- **Point values come from constants.ts**: Every `earnedPoints` and `maxPoints` must reference `POINTS_*` from `src/scoring/constants.ts`. Do NOT hardcode numbers.
- **Always return `Check[]` array**: Export a function `check<Category>(dir: string): Check[]` where category is one of: `existence`, `quality`, `grounding`, `accuracy`, `freshness`, `bonus`.
- **Every check must have**: `id` (kebab-case, unique), `name`, `category`, `maxPoints`, `earnedPoints`, `passed`, `detail`, and optional `suggestion`/`fix`.
- **Fix object fields**: `action` (string describing what to do), `data` (context for the fix), `instruction` (user-facing guidance).
- **Register in src/scoring/index.ts**: Add the import and spread the result into the `allChecks` array in `computeLocalScore()`.
- **Target filtering**: If the check is platform-specific (Claude-only, Cursor-only, etc.), add its ID to the appropriate `*_ONLY_CHECKS` set in `constants.ts`.

## Instructions

### Step 1: Define point constants in src/scoring/constants.ts

Verify before proceeding: Is your check measurable with a numeric point value?

Add constants below the appropriate category section (existence, quality, grounding, accuracy, freshness, bonus):

```typescript
// In the appropriate CATEGORY section, e.g., Quality checks (25 pts):
export const POINTS_YOUR_CHECK_NAME = 4; // 1-12 pts typical

// If threshold-based, add a companion array:
export const YOUR_THRESHOLD_ARRAY = [
  { minValue: 10, points: 4 },
  { minValue: 5, points: 2 },
] as const;
```

Check existing patterns: Token budgets use `TOKEN_BUDGET_THRESHOLDS`, code blocks use `CODE_BLOCK_THRESHOLDS`, concreteness uses `CONCRETENESS_THRESHOLDS`.

Verify: Review `CATEGORY_MAX` object to ensure your check fits within its category's point budget.

### Step 2: Create or edit check function in src/scoring/checks/

Choose the file based on category. Each file exports a `check<Name>(dir: string): Check[]` function:

- `existence.ts` — files/directories exist (CLAUDE.md, .cursorrules, skills, MCP servers)
- `quality.ts` — config structure, size, clarity (code blocks, token budget, concreteness, duplicates)
- `grounding.ts` — references to actual project files/directory structure
- `accuracy.ts` — validity of references, git-based config drift
- `freshness.ts` — git commit-based staleness, secrets, permissions
- `bonus.ts` — hooks, learned content, OpenSkills format
- `sources.ts` — source configuration and usage

Create the function following this structure:

```typescript
import type { Check } from '../index.js';
import {
  POINTS_YOUR_CHECK,
  YOUR_THRESHOLD_ARRAY,
} from '../constants.js';
import { readFileOrNull } from '../utils.js'; // or other helpers

export function checkYourCategory(dir: string): Check[] {
  const checks: Check[] = [];

  // 1. Measure something concrete
  const yourMetric = /* e.g., countFiles(), validatePaths(), etc. */;
  const threshold = YOUR_THRESHOLD_ARRAY.find(t => yourMetric >= t.minValue);
  const earnedPts = threshold?.points ?? 0;

  checks.push({
    id: 'your_unique_check_id',
    name: 'Human-readable check name',
    category: 'quality', // matches function context
    maxPoints: POINTS_YOUR_CHECK,
    earnedPoints: earnedPts,
    passed: earnedPts >= Math.ceil(POINTS_YOUR_CHECK * 0.6), // or custom logic
    detail: `${earnedPts}/${POINTS_YOUR_CHECK} points — ${yourMetric} items found`,
    suggestion: earnedPts >= POINTS_YOUR_CHECK ? undefined : 'Action to improve',
    fix: earnedPts >= POINTS_YOUR_CHECK ? undefined : {
      action: 'verb_noun', // e.g., 'add_code_blocks', 'fix_references'
      data: { currentValue: yourMetric, targetValue: 10 },
      instruction: 'Specific, actionable guidance for the user.',
    },
  });

  return checks;
}
```

Verify ID uniqueness: Run `grep -r "'your_unique_check_id'" src/scoring/checks/` — should return only your new check.

### Step 3: Handle platform-specific filtering (if applicable)

If your check only applies to certain agents (Claude, Cursor, Codex, GitHub Copilot), register it in `src/scoring/constants.ts`:

```typescript
// Add to the appropriate set:
export const CLAUDE_ONLY_CHECKS = new Set([
  'claude_md_exists',
  'your_new_check_id', // ← add here
  'claude_rules_exist',
]);
```

Available sets (update exactly one if applicable):
- `CLAUDE_ONLY_CHECKS` — Claude Code targets
- `CURSOR_ONLY_CHECKS` — Cursor targets
- `CODEX_ONLY_CHECKS` — Codex/OpenCode targets
- `COPILOT_ONLY_CHECKS` — GitHub Copilot targets
- `BOTH_ONLY_CHECKS` — Both Claude AND Cursor (cross-platform parity)
- `NON_CODEX_CHECKS` — Everything except Codex/OpenCode
- `CLAUDE_OR_CODEX_CHECKS` — Claude OR Codex

Verify filtering: Examine `filterChecksForTarget()` in `src/scoring/index.ts` to ensure your category will work correctly for your target agents.

### Step 4: Register in src/scoring/index.ts

Import your function at the top:

```typescript
import { checkYourCategory } from './checks/your-file.js';
```

Add to `computeLocalScore()` inside the `allChecks` array initialization:

```typescript
export function computeLocalScore(dir: string, targetAgent?: TargetAgent): ScoreResult {
  const target = targetAgent ?? detectTargetAgent(dir);

  const allChecks: Check[] = [
    ...checkExistence(dir),
    ...checkQuality(dir),
    ...checkGrounding(dir),
    ...checkAccuracy(dir),
    ...checkYourCategory(dir), // ← ADD HERE IN ORDER
    ...checkFreshness(dir),
    ...checkBonus(dir),
    ...checkSources(dir),
  ];
  // ... rest of function
}
```

Verify registration: Run `npm test src/scoring/__tests__/accuracy.test.ts` (or similar) — all existing tests should still pass.

### Step 5: Write deterministic unit tests

Create or edit `src/scoring/checks/__tests__/your-file.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { checkYourCategory } from '../your-file.js';
import { POINTS_YOUR_CHECK } from '../../constants.js';

describe('checkYourCategory', () => {
  it('awards full points when condition passes', () => {
    const dir = mkdtempSync('test-scoring-');
    try {
      // Set up the passing condition
      writeFileSync(join(dir, 'SOME_FILE.md'), 'content that satisfies check');
      
      const checks = checkYourCategory(dir);
      const check = checks.find(c => c.id === 'your_unique_check_id');
      
      expect(check).toBeDefined();
      expect(check?.passed).toBe(true);
      expect(check?.earnedPoints).toBe(POINTS_YOUR_CHECK);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it('awards zero points when condition fails', () => {
    const dir = mkdtempSync('test-scoring-');
    try {
      // Don't create the required condition
      const checks = checkYourCategory(dir);
      const check = checks.find(c => c.id === 'your_unique_check_id');
      
      expect(check?.passed).toBe(false);
      expect(check?.earnedPoints).toBe(0);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it('returns correct detail message', () => {
    const dir = mkdtempSync('test-scoring-');
    try {
      const checks = checkYourCategory(dir);
      const check = checks.find(c => c.id === 'your_unique_check_id');
      expect(check?.detail).toBeTruthy();
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
});
```

Run tests: `npm test src/scoring/checks/__tests__/your-file.test.ts`. All must pass before shipping.

## Examples

### Example 1: Existence Check

**Trigger**: User says "Add a check to verify .claude/rules/ directory exists."

**Actions**:
1. Add `export const POINTS_CLAUDE_RULES = 3;` to constants.ts
2. In existence.ts: `existsSync(join(dir, '.claude', 'rules'))` → true/false
3. Import in index.ts and add `...checkExistence(dir)` (already done)
4. Test with mkdtempSync; verify earnedPoints matches POINTS_CLAUDE_RULES

**Result**: Check `id: 'claude_rules_exist'` returns `earnedPoints: 3, passed: true` when dir exists.

### Example 2: Quality Check with Thresholds

**Trigger**: User says "Verify config has at least 3 code blocks with executable commands."

**Actions**:
1. Add to constants.ts:
   ```typescript
   export const CODE_BLOCK_THRESHOLDS = [
     { minBlocks: 3, points: 8 },
     { minBlocks: 2, points: 6 },
     { minBlocks: 1, points: 3 },
   ] as const;
   ```
2. In quality.ts:
   - Parse CLAUDE.md with regex to count \`\`\` blocks
   - Match against CODE_BLOCK_THRESHOLDS
   - Return points based on threshold match
3. In fix: Suggest which commands to add

**Result**: 3+ blocks = 8 pts, 2 blocks = 6 pts, 1 block = 3 pts, 0 blocks = 0 pts.

### Example 3: Accuracy Check (Reference Validation)

**Trigger**: User says "Check that all file paths mentioned in config actually exist."

**Actions**:
1. Add `export const POINTS_REFERENCES_VALID = 8;` to constants.ts
2. In accuracy.ts:
   - Extract backtick-quoted paths and dir patterns from config
   - Check existence with `existsSync(join(dir, path))`
   - Calculate ratio: `valid / total`
   - Award partial points: `Math.round(ratio * POINTS_REFERENCES_VALID)`
3. In fix: List invalid paths the user should fix

**Result**: 80% valid refs = ~6 pts; 100% valid = 8 pts; 0% valid = 0 pts.

## Common Issues

**Issue**: "My check doesn't appear in the score report."
**Fix**: 1) Verify ID in `*_ONLY_CHECKS` if platform-specific. 2) Verify import and spread in `index.ts` `allChecks` array. 3) Run `npm test` to ensure no tsc errors. 4) Check `detectTargetAgent()` returns your target platform.

**Issue**: "Points are hardcoded but should use constants."
**Fix**: Replace all literal numbers like `earnedPoints: 5` with `earnedPoints: POINTS_YOUR_CHECK`. Constants are in `src/scoring/constants.ts` — use them consistently.

**Issue**: "Check makes an API call or network request."
**Fix**: Scoring MUST be deterministic and offline. Use only: `fs` module (readFileSync, existsSync, readdirSync), `path`, `execSync` for git commands. No HTTP, no LLM calls, no external services.

**Issue**: "Platform-specific check appears for the wrong agent."
**Fix**: 1) Verify check ID is in correct `*_ONLY_CHECKS` set. 2) Double-check `filterChecksForTarget()` handles your platform set. 3) Test with `detectTargetAgent()` on a real project.

**Issue**: "Test fails with 'Module not found' error."
**Fix**: Ensure file is in `src/scoring/checks/` (not nested). Use `.js` extension in imports (TypeScript transpiles to ES modules). Run `npm run build` to check for tsc errors.

**Issue**: "Detail message is confusing or too technical."
**Fix**: Use friendly language: `3 code blocks found (need 3 for full points)` instead of `codeBlockCount=3`. Make it clear WHY they got/lost points.

**Issue**: "Threshold-based check gives wrong points for edge cases."
**Fix**: Test all boundaries: value=0, value=threshold, value>>threshold. Use `.find()` to match highest-to-lowest: `find(t => value >= t.minValue)`.

**Issue**: "Two checks have the same ID."
**Fix**: Run `grep -r "'my_id'" src/scoring/checks/` to find duplicates. IDs must be globally unique across all check files. Use descriptive names like `claude_md_exists`, not `check_1`.