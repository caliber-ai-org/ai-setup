---
name: scoring-checks
description: Add a new deterministic scoring check in src/scoring/checks/ that evaluates CLAUDE.md quality. Follows the Check[] return pattern, uses point constants from src/scoring/constants.ts, and integrates via filterChecksForTarget() in src/scoring/index.ts. Use when user says 'add scoring check', 'new check', 'modify scoring criteria', or works in src/scoring/checks/. Do NOT use for display changes, refactoring scoring logic, or changing how checks are executed.
---
# scoring-checks

## Critical

- **All checks are deterministic**: No LLM calls, no network I/O, no randomness. Evaluation must be 100% reproducible given the same input.
- **Return type is `Check[]`**: Each check MUST return an array of objects with `{ id: string; points: number; detail?: string }`. Points are deducted from 100, not added.
- **Point values come from `src/scoring/constants.ts`**: Never hardcode point values. Import `POINTS_*` constants and use them directly. Example: `POINTS_MISSING_TITLE` is the deduction for a missing title.
- **Integration happens automatically**: Once your check exports a default function matching the signature, it is auto-discovered and integrated via `filterChecksForTarget()` in `src/scoring/index.ts`. No manual registration needed.
- **Check signature**: `async (fingerprint: Fingerprint, target: 'claude' | 'cursor' | 'codex', config: Config) => Promise<Check[]>`
- **Use `=== 100` for validation**: When checking if the score is perfect, use strict equality `=== 100`, not `>= 100`. Score cannot exceed 100.

## Instructions

**Step 1: Create the check file**

Create `src/scoring/checks/{name}.ts`. Name must be kebab-case and match the check's purpose.

```typescript
import { Check, Fingerprint } from '../types.js';
import { POINTS_MISSING_CONTENT } from '../constants.js';
import type { Config } from '../../llm/types.js';

export default async function checkMyFeature(
  fingerprint: Fingerprint,
  target: 'claude' | 'cursor' | 'codex',
  config: Config
): Promise<Check[]> {
  const checks: Check[] = [];

  // evaluation logic here
  // if condition fails:
  checks.push({
    id: 'my-feature-missing',
    points: POINTS_MISSING_CONTENT,
    detail: 'User message explaining why this was deducted',
  });

  return checks;
}
```

Verify: File exists at `src/scoring/checks/{name}.ts` with correct function signature.

**Step 2: Determine what to evaluate**

Inspect the fingerprint object (passed as first argument). Common fields:
- `fingerprint.claude_md.content` — raw CLAUDE.md file content
- `fingerprint.claude_md.parsed.sections` — parsed sections (title, instructions, etc.)
- `fingerprint.cursor_rules` — array of Cursor rule files
- `fingerprint.codex_instructions` — Codex instruction content
- `fingerprint.codebase_files` — array of codebase files

Verify: Check `src/fingerprint/types.ts` to see all available fields on `Fingerprint`.

**Step 3: Evaluate the target type**

Use the `target` parameter to apply checks only to the relevant agent config. Example:

```typescript
if (target !== 'claude') return []; // Only check CLAUDE.md

if (!fingerprint.claude_md.parsed?.sections?.instructions) {
  checks.push({
    id: 'missing-instructions',
    points: POINTS_MISSING_INSTRUCTIONS,
    detail: 'CLAUDE.md must include an Instructions section.',
  });
}
```

Verify: Check only evaluates for the correct target. If target is not relevant, return an empty array.

**Step 4: Define point deductions**

Open `src/scoring/constants.ts`. If your deduction type doesn't exist, add it:

```typescript
export const POINTS_MISSING_TITLE = 5;
export const POINTS_VAGUE_INSTRUCTIONS = 10;
// etc.
```

Then import and use in your check:

```typescript
import { POINTS_MISSING_TITLE, POINTS_VAGUE_INSTRUCTIONS } from '../constants.js';

checks.push({ id: 'no-title', points: POINTS_MISSING_TITLE, detail: '...' });
```

Verify: All point values are imported from constants, not hardcoded.

**Step 5: Handle edge cases**

For each check, handle missing or null data gracefully:

```typescript
const content = fingerprint.claude_md.content || '';
if (!content.trim()) {
  checks.push({
    id: 'empty-claude-md',
    points: POINTS_MISSING_CONTENT,
    detail: 'CLAUDE.md is empty or missing.',
  });
}
```

Do NOT throw errors. Always return a `Check[]` array, even if it's empty.

Verify: All code paths return `Promise<Check[]>`. No exceptions are thrown.

**Step 6: Write tests**

Create `src/scoring/__tests__/{name}.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import check from '../checks/{name}.js';
import type { Fingerprint } from '../types.js';

describe('check{Name}', () => {
  it('returns no checks when content is valid', async () => {
    const fingerprint: Fingerprint = {
      claude_md: {
        content: 'valid content',
        parsed: { sections: { instructions: 'do X' } },
      },
      // ... other required fields
    };
    const result = await check(fingerprint, 'claude', {} as any);
    expect(result).toEqual([]);
  });

  it('deducts points when content is missing', async () => {
    const fingerprint: Fingerprint = {
      claude_md: { content: '', parsed: { sections: {} } },
      // ...
    };
    const result = await check(fingerprint, 'claude', {} as any);
    expect(result).toContainEqual(
      expect.objectContaining({ id: 'my-check-id', points: expect.any(Number) })
    );
  });
});
```

Run: `npm run test -- src/scoring/__tests__/{name}.test.ts`

Verify: All tests pass. Test covers happy path and failure cases.

**Step 7: Verify integration**

Run `npm run build && npm run test`. The check is auto-discovered. No changes to `src/scoring/index.ts` are needed.

Run a manual test:

```bash
npm run build
node dist/bin.js score --path /tmp/test-repo
```

Look for your check ID in the output. Verify: Score calculation includes your check's deductions.

## Examples

**User**: "Add a check to verify CLAUDE.md has a title section."

**Actions**:
1. Create `src/scoring/checks/title.ts`
2. Add `POINTS_MISSING_TITLE = 5` to `src/scoring/constants.ts`
3. Write check logic:
   ```typescript
   if (target !== 'claude') return [];
   if (!fingerprint.claude_md.parsed?.sections?.title) {
     checks.push({
       id: 'missing-title',
       points: POINTS_MISSING_TITLE,
       detail: 'CLAUDE.md must have a title section at the top.',
     });
   }
   return checks;
   ```
4. Write tests in `src/scoring/__tests__/title.test.ts`
5. Run `npm run test && npm run build`

**Result**: Score now deducts 5 points if CLAUDE.md lacks a title. Integration is automatic.

---

**User**: "Modify the grounding check to be stricter about vague language."

**Actions**:
1. Open `src/scoring/checks/grounding.ts`
2. Add new detection for vague words: `['roughly', 'approximately', 'maybe']`
3. Create `POINTS_VAGUE_LANGUAGE = 3` in constants
4. Push new check: `{ id: 'vague-language', points: POINTS_VAGUE_LANGUAGE, detail: '...' }`
5. Update tests to cover the new words
6. Run `npm run test -- src/scoring/__tests__/grounding.test.ts`

**Result**: Grounding check now penalizes vague language more strictly.

## Common Issues

**Issue**: "Check not appearing in the score output"
- **Cause**: File is not being imported or function signature is wrong.
- **Fix**: Verify the file is in `src/scoring/checks/`, is named correctly, and exports a default async function with signature `(fingerprint, target, config) => Promise<Check[]>`.
- **Verify**: Run `npm run build` and check for any TypeScript errors. Run `node dist/bin.js score --path /tmp/test` and look for your check ID in output.

**Issue**: "TypeError: Cannot read property 'parsed' of undefined"
- **Cause**: Accessing fingerprint fields without null checks.
- **Fix**: Always guard with optional chaining or explicit checks:
  ```typescript
  const sections = fingerprint.claude_md?.parsed?.sections;
  if (!sections) return []; // Handle gracefully
  ```

**Issue**: "Score calculation includes my check but points don't match"
- **Cause**: Using hardcoded point values instead of constants, or using `>= 100` instead of `=== 100`.
- **Fix**: Import all point values from `src/scoring/constants.ts`. When checking if score is perfect, use `score === 100`, not `score >= 100`.

**Issue**: "Test passes locally but fails in CI"
- **Cause**: Test relies on file system state or environment variables.
- **Fix**: Use `memfs` or mock the fingerprint object directly. See existing tests in `src/scoring/__tests__/` for patterns.

**Issue**: "My check runs but returns incorrect points"
- **Cause**: Logic error in condition or wrong constant value.
- **Fix**: Add console logs or debug statements. Run `npm run test -- --inspect-brk` to step through. Verify the constant value in `constants.ts` matches expected deduction.