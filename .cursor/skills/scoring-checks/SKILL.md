---
name: scoring-checks
description: Adds a new deterministic scoring check in src/scoring/checks/. Follows the Check[] return pattern, uses constants from src/scoring/constants.ts, and integrates in src/scoring/index.ts. Use when user says 'add scoring check', 'new check', 'modify scoring logic'. Do NOT use for display/UI changes, test modifications, or scoring display formatting.
---
# Scoring Checks

## Critical

- **All checks must be deterministic**: No randomness, no external APIs. Same filesystem state → same result.
- **Return type is always `Check[]`**: Each check has `id`, `name`, `category`, `maxPoints`, `earnedPoints`, `passed`, `detail`.
- **Function signature**: `export function check{Category}(dir: string): Check[]` — takes a directory path, not a fingerprint or config object.
- **Only import from `src/scoring/constants.ts`** for `POINTS_*` values. Never hardcode numbers.
- **Check logic is synchronous**. No async/await. Use `fs`, `path`, and `execSync` for git commands.

## Instructions

### Step 1: Add check to the appropriate category file

Choose the right file in `src/scoring/checks/` based on category (`existence.ts`, `quality.ts`, `grounding.ts`, `accuracy.ts`, `freshness.ts`, `bonus.ts`, `sources.ts`). Add your logic to that file's exported function.

Use this template:

```typescript
import type { Check } from '../index.js';
import { POINTS_YOUR_CHECK, YOUR_THRESHOLD_ARRAY } from '../constants.js';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export function checkYourCategory(dir: string): Check[] {
  const checks: Check[] = [];

  // Inspect the filesystem using `dir`
  const metric = /* e.g., count files, parse content */;
  const threshold = YOUR_THRESHOLD_ARRAY.find(t => metric >= t.minValue);
  const earned = threshold?.points ?? 0;

  checks.push({
    id: 'your_unique_check_id',
    name: 'Human-readable check name',
    category: 'quality', // matches the category file
    maxPoints: POINTS_YOUR_CHECK,
    earnedPoints: earned,
    passed: earned >= Math.ceil(POINTS_YOUR_CHECK * 0.6),
    detail: `${earned}/${POINTS_YOUR_CHECK} points — ${metric} items found`,
    suggestion: earned >= POINTS_YOUR_CHECK ? undefined : 'Action to improve',
  });

  return checks;
}
```

Verify the function signature is `check{Category}(dir: string): Check[]` — NOT `(fingerprint, config)` or `(ctx: ScoringContext)`.

### Step 2: Add point constants in `src/scoring/constants.ts`

```typescript
export const POINTS_YOUR_CHECK = 4; // fits within category budget
```

Check the `CATEGORY_MAX` object to ensure your check fits within its category's point budget.

### Step 3: Register new function in `src/scoring/index.ts` (if adding a new function)

If you created a new function (rather than adding to an existing one):

```typescript
import { checkYourCategory } from './checks/your-file.js';
// In computeLocalScore():
const allChecks: Check[] = [
  ...checkExistence(dir),
  ...checkQuality(dir),
  ...checkYourCategory(dir), // ← ADD IN ORDER
  ...checkFreshness(dir),
  ...checkBonus(dir),
];
```

### Step 4: Handle platform-specific filtering (if applicable)

If the check only applies to certain platforms, add its ID to a `*_ONLY_CHECKS` set in `src/scoring/constants.ts`.

### Step 5: Write a test

```typescript
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { checkYourCategory } from '../your-file.js';

it('awards full points when condition passes', () => {
  const dir = mkdtempSync('test-scoring-');
  try {
    writeFileSync(join(dir, 'SOME_FILE.md'), 'content');
    const checks = checkYourCategory(dir);
    const check = checks.find(c => c.id === 'your_unique_check_id');
    expect(check?.passed).toBe(true);
    expect(check?.earnedPoints).toBe(POINTS_YOUR_CHECK);
  } finally {
    rmSync(dir, { recursive: true });
  }
});
```

Verify: `npm run test -- src/scoring/checks/__tests__/{category}.test.ts`.

## Examples

**User says**: "Add a scoring check that penalizes repos without a CLAUDE.md file."

**Actions**:
1. In `src/scoring/checks/existence.ts`, add to the `checkExistence(dir: string): Check[]` function:
   - `const exists = existsSync(join(dir, 'CLAUDE.md'));`
   - Push a check with `id: 'claude_md_exists'`, `maxPoints: POINTS_CLAUDE_MD_EXISTS`, `earnedPoints: exists ? POINTS_CLAUDE_MD_EXISTS : 0`.
2. Add `export const POINTS_CLAUDE_MD_EXISTS = 10;` to `src/scoring/constants.ts`.
3. `checkExistence` is already called in `computeLocalScore()` — no `src/scoring/index.ts` changes needed.
4. Test: create temp dir with/without `CLAUDE.md`, call `checkExistence(dir)`, verify `passed` and `earnedPoints`.

**Result**: Check appears in score output under the existence category.

## Common Issues

**"My check doesn't appear in the score report"**
- Verify the check ID is not in a `*_ONLY_CHECKS` set that excludes your target agent.
- Verify the category function is called and its result is spread into `allChecks` in `computeLocalScore()`.
- Run `npm run build && npm test` to catch import errors.

**"Points are hardcoded"**
- Replace literal numbers with `POINTS_*` constants from `src/scoring/constants.ts`.
- Add a new constant if one doesn't exist for your check.

**"Type error: Property X does not exist on Check"**
- The `Check` interface in `src/scoring/index.ts` requires: `id`, `name`, `category`, `maxPoints`, `earnedPoints`, `passed`, `detail`.
- Optional fields: `suggestion`, `fix` (object with `action`, `data`, `instruction`).
- Do NOT use `score`, `weight`, `reasons` — those are from a different shape.

**"Test fails — can't create real files"**
- Use `mkdtempSync` to create a temp dir; write files with `writeFileSync`; clean up with `rmSync(dir, { recursive: true })` in a `finally` block.
- See `src/scoring/checks/__tests__/` for existing patterns.