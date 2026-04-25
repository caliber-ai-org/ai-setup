---
name: scoring-checks
description: Adds a new deterministic scoring check in src/scoring/checks/. Follows the Check[] return pattern, uses constants from src/scoring/constants.ts, and integrates in src/scoring/index.ts. Use when user says 'add scoring check', 'new check', 'modify scoring logic'. Do NOT use for display/UI changes, test modifications, or scoring display formatting.
---
# Scoring Checks

## Critical

- **All checks must be deterministic**: No randomness, no timestamps. Same input → same output.
- **Return type is always `Check[]`**: Each check has `id`, `name`, `weight`, `maxScore`, `score`, `reasons`.
- **Weights must sum to 100** across all checks in `src/scoring/index.ts`. Verify: `existenceWeight + qualityWeight + groundingWeight + accuracyWeight + freshnessWeight + bonusWeight + sourcesWeight === 100`.
- **Only import from `src/scoring/constants.ts`** for weight/threshold values. Never hardcode thresholds.
- **Check logic is synchronous**. No async/await in check functions.

## Instructions

### Step 1: Define the check function in a new file

Create `src/scoring/checks/<checkName>.ts`.

Use this template:

```typescript
import { Check } from '../types.js';
import { <CONSTANT_NAME> } from '../constants.js';

export function <checkName>(
  fingerprint: Fingerprint,
  config: ParsedConfig,
): Check[] {
  const checkId = '<checkName>';
  let score = 0;
  const reasons: string[] = [];

  // Logic here: inspect fingerprint/config, calculate score 0–maxScore
  // Add reason strings for each deduction

  return [
    {
      id: checkId,
      name: 'Check Display Name',
      weight: <WEIGHT_CONSTANT>,
      maxScore: 100,
      score,
      reasons,
    },
  ];
}
```

Verify the function returns exactly one `Check` object (or multiple if logically grouped). Verify `score` is between 0 and `maxScore`.

### Step 2: Export from `src/scoring/checks/index.ts`

Add the import and export:

```typescript
export { <checkName> } from './<checkName>.js';
```

Verify file is listed in the barrel export.

### Step 3: Call the check in `src/scoring/index.ts`

In the `score()` function, add a line:

```typescript
const <checkName>Results = <checkName>(fingerprint, config);
allChecks.push(...<checkName>Results);
```

Verify placement is before the weight-sum validation at the end of `score()`.

### Step 4: Update weight constants in `src/scoring/constants.ts`

If adding a new check type (not modifying an existing one), add the weight constant:

```typescript
export const <CHECK_NAME>_WEIGHT = <number>;
```

Then update all other weight constants so the sum remains 100. Verify the weights comment block lists all active checks.

Verify: Run `npm run test -- src/scoring/__tests__/index.test.ts` to ensure weight validation passes.

### Step 5: Write or update the test

In `src/scoring/__tests__/`, create or update `<checkName>.test.ts`. Test both pass and fail cases:

```typescript
it('returns maxScore when condition is met', () => {
  const result = <checkName>({ /* fingerprint */ }, { /* config */ });
  expect(result[0].score).toBe(100);
});

it('returns 0 when condition is not met', () => {
  const result = <checkName>({ /* fingerprint */ }, { /* config */ });
  expect(result[0].score).toBe(0);
  expect(result[0].reasons.length).toBeGreaterThan(0);
});
```

Verify: Run `npm run test -- src/scoring/__tests__/<checkName>.test.ts`.

## Examples

**User says**: "Add a scoring check that penalizes repos without a CLAUDE.md file."

**Actions**:
1. Create `src/scoring/checks/existence.ts` (or modify if exists).
2. Check if `config.claudeMdPath` exists and is non-empty: if yes, `score = 100`; if no, `score = 0` with reason "CLAUDE.md not found".
3. Add export to `src/scoring/checks/index.ts`.
4. Call `existenceResults = existence(fingerprint, config)` in `src/scoring/index.ts` and push to `allChecks`.
5. Ensure weight is defined in `constants.ts` (e.g., `EXISTENCE_WEIGHT = 20`).
6. Test: `npm run test -- src/scoring/__tests__/existence.test.ts`.

## Common Issues

**Error: "Weights do not sum to 100"**
- Check `src/scoring/index.ts` at the end of `score()`: find the validation that sums all weights.
- List all active checks and their weights from `constants.ts`.
- Adjust the weight constant so the sum equals 100. Example: if adding a new check with weight 15, reduce an existing check's weight by 15.

**Error: "Check returned undefined score"**
- Ensure the check function always initializes `score` to a number before any logic.
- Verify no conditional path leaves `score` unset.
- Check must always return a `Check` object with `score` field.

**Error: "Test fails with 'score out of bounds'"**
- Verify `score` is >= 0 and <= `maxScore` (usually 100).
- Check logic should cap: `Math.max(0, Math.min(maxScore, score))`.
- Verify no negative deductions drop score below 0.

**Error: "Check is called twice or results are duplicated in allChecks"**
- Ensure `<checkName>()` is called exactly once in `src/scoring/index.ts`.
- Verify you push the result array with spread: `allChecks.push(...result)` not `allChecks.push(result)`.

**Error: "Fingerprint/config types are unknown"**
- Import `Fingerprint` from `src/fingerprint/types.js` and `ParsedConfig` from `src/commands/types.js` (or check existing check files for the correct imports).
- Match the type signature of an existing check function.