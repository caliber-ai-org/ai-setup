---
name: scoring-checks
description: Adds a new deterministic scoring check in src/scoring/checks/. Follows the Check[] return pattern, uses point constants from src/scoring/constants.ts, and integrates via filterChecksForTarget() in src/scoring/index.ts. Use when user says 'add scoring check', 'new check', 'modify scoring criteria', or works in src/scoring/checks/. Do NOT use for display changes, refactoring scoring logic, or changing how checks are executed.
---
# Scoring Checks

## Critical

- All checks return `Check[]` (array, never null/undefined)
- Point values MUST come from `src/scoring/constants.ts` (e.g., `POINTS.EXISTENCE`, `POINTS.QUALITY`)
- Each check has: `id` (kebab-case), `name`, `value` (number), `passed` (boolean), `reason` (string)
- Register in `src/scoring/index.ts` via `filterChecksForTarget()` — add to the appropriate target's check array
- Tests go in `src/scoring/checks/__tests__/` with `describe()` and `it()` blocks; import setup from `src/test/setup.ts`

## Instructions

**Step 1: Create the check file**

Add `src/scoring/checks/my-check.ts`. Import:
```typescript
import type { Check, ScoringContext } from '../types.js';
import { POINTS } from '../constants.js';
```

Export a function that takes `context: ScoringContext` and returns `Check[]`:
```typescript
export function myCheck(context: ScoringContext): Check[] {
  const checks: Check[] = [];
  // Your logic here
  return checks;
}
```

Verify: Function signature matches existing checks in `src/scoring/checks/`.

**Step 2: Implement check logic**

For each condition:
1. Determine pass/fail via `context.fingerprint` or `context.config`
2. Push a Check object: `{ id: 'check-name', name: 'Human name', value: POINTS.EXISTENCE, passed: boolean, reason: 'Why it passed/failed' }`
3. Do NOT hardcode point values — use constants

Verify: Logic reads from `context` only (no side effects).

**Step 3: Register in scoring index**

Open `src/scoring/index.ts`. Find `filterChecksForTarget()`:
```typescript
if (target === 'claude') {
  return [
    existenceCheck(context),
    qualityCheck(context),
    // Add your check here
    myCheck(context),
  ].flat();
}
```

Import at the top: `import { myCheck } from './checks/my-check.js';`

Verify: Check appears in the correct target block and is imported.

**Step 4: Write tests**

Create `src/scoring/checks/__tests__/my-check.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { myCheck } from '../my-check.js';
import type { ScoringContext } from '../../types.js';

describe('myCheck', () => {
  it('passes when condition is true', () => {
    const context: ScoringContext = { /* mock data */ };
    const checks = myCheck(context);
    expect(checks.some(c => c.id === 'check-name' && c.passed)).toBe(true);
  });

  it('fails when condition is false', () => {
    const context: ScoringContext = { /* different mock */ };
    const checks = myCheck(context);
    expect(checks.some(c => c.id === 'check-name' && c.passed)).toBe(false);
  });
});
```

Verify: `npm run test src/scoring/checks/__tests__/my-check.test.ts` passes.

## Examples

**User**: "Add a check that verifies CLAUDE.md exists and has content"

**Actions**:
1. Create `src/scoring/checks/claude-existence.ts`
2. Extract CLAUDE.md from `context.config.files`, check length > 0
3. Return `[{ id: 'claude-exists', name: 'CLAUDE.md exists', value: POINTS.EXISTENCE, passed: !!file, reason: file ? 'Found' : 'Missing' }]`
4. Add `claudeExistenceCheck(context)` to claude/cursor/codex blocks in `filterChecksForTarget()`
5. Test with mock contexts (CLAUDE.md present, absent, empty)

## Common Issues

**"Check is not being run"**
- Verify: Is `myCheck(context)` called in `filterChecksForTarget()`?
- Verify: Is the import statement at the top of `src/scoring/index.ts`?
- Verify: Does the target (claude/cursor/codex) match where you added it?

**"POINTS.MY_CONSTANT is undefined"**
- All point values must be in `src/scoring/constants.ts`
- Add constant: `MY_CHECK: 10` in the POINTS object
- Then import and use: `value: POINTS.MY_CHECK`

**"Tests fail with 'context.config is undefined'"**
- Mock the full `ScoringContext` type from `src/scoring/types.ts`
- Include: `fingerprint: { ... }`, `config: { files: {...}, ...}`, `target: 'claude'`
- Use `src/test/setup.ts` for common mocks if needed

**"Check always returns empty array"**
- Verify the check pushes to the `checks` array before returning
- Verify: `return checks;` at end (not `return [];`)
- Add console logs inside the function to debug