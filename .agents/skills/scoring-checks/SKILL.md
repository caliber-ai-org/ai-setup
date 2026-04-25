---
name: scoring-checks
description: Add a new deterministic scoring check in src/scoring/checks/. Returns Check[] array, uses constants from src/scoring/constants.ts, integrates in src/scoring/index.ts. Use when adding scoring logic, creating checks, modifying check weights. Do NOT use for display/UI changes or check result formatting.
---
# Scoring Checks

## Critical

1. **Check must return `Check[]`** — Never return a single check or a Promise. Return an empty array `[]` if the condition fails.
2. **Use constants from `src/scoring/constants.ts`** — All weights, thresholds, and names must reference constants, never hardcoded values.
3. **Deterministic only** — No LLM calls. Scoring checks inspect existing files, fingerprint data, and git history. Use `src/fingerprint/` data exclusively.
4. **File structure**: Create one file per check in `src/scoring/checks/`. Export a default function with signature `(ctx: ScoringContext) => Check[]`.
5. **Integration point**: Add the check function to the `checks` array in `src/scoring/index.ts` — this is the ONLY place checks are orchestrated.

## Instructions

1. **Create the check file** at `src/scoring/checks/{check-name}.ts`.
   - Import `Check` type from `../types.js`.
   - Import constants from `../constants.js`.
   - Export default function: `export default function {checkName}(ctx: ScoringContext): Check[] { }`
   - Verify file compiles: `npx tsc --noEmit`.

2. **Inspect the ScoringContext** to access fingerprint data.
   - Available: `ctx.fingerprint`, `ctx.manifest` (existing config), `ctx.git` (history).
   - Example: `ctx.fingerprint.sources` (detected sources), `ctx.fingerprint.files` (file tree).
   - Verify using `src/scoring/__tests__/` test setup to mock context.

3. **Build the Check object**.
   - `id`: Unique string, lowercase-kebab (e.g., `'existence'`, `'freshness-days-old'`).
   - `name`: Human-readable display name (e.g., `'CLAUDE.md exists'`).
   - `points`: Number (0–100). Must reference constant from `src/scoring/constants.ts`.
   - `reasons`: String array explaining why the check passed/failed (max 1–2 sentences each).
   - `passed`: Boolean.
   - Return `[check]` if passed, `[]` if failed.

4. **Reference constants for all numeric values**.
   - Open `src/scoring/constants.ts` and use existing constants or add new ones.
   - Example: `const POINTS_EXISTENCE = 10` in constants, then use `points: POINTS_EXISTENCE` in check.
   - Verify constant is exported: `export const POINTS_EXISTENCE = 10`.

5. **Add the check to the orchestrator** in `src/scoring/index.ts`.
   - Import: `import {checkName} from './checks/{check-name}.js'`.
   - Add to `checks` array: `{checkName}(ctx),`.
   - Verify tests pass: `npm test -- src/scoring/__tests__/index.test.ts`.

6. **Write a test** in `src/scoring/checks/__tests__/{check-name}.test.ts`.
   - Mock `ScoringContext` with fingerprint data using `memfs` or fixtures from existing tests.
   - Test both pass and fail cases.
   - Verify test runs: `npx vitest run src/scoring/checks/__tests__/{check-name}.test.ts`.

## Examples

**User says**: "Add a scoring check that verifies CLAUDE.md exists and is not empty."

**Actions**:
1. Create `src/scoring/checks/existence.ts`:
```typescript
import type { Check, ScoringContext } from '../types.js';
import { POINTS_EXISTENCE } from '../constants.js';

export default function existence(ctx: ScoringContext): Check[] {
  const claudeMd = ctx.manifest.claude;
  const passed = claudeMd && claudeMd.trim().length > 0;

  if (!passed) {
    return [];
  }

  return [{
    id: 'existence',
    name: 'CLAUDE.md exists and is not empty',
    points: POINTS_EXISTENCE,
    reasons: ['CLAUDE.md is present and contains configuration.'],
    passed: true,
  }];
}
```

2. Add to `src/scoring/constants.ts`: `export const POINTS_EXISTENCE = 10`.

3. Update `src/scoring/index.ts`:
```typescript
import existence from './checks/existence.js';
// ...
const checks = [
  existence(ctx),
  // other checks
];
```

4. Test with `npm test`.

**Result**: Check is integrated and appears in score output.

## Common Issues

**"Check is not appearing in score output"**
- Verify check is added to `checks` array in `src/scoring/index.ts`.
- Verify it returns `Check[]` (not a single object or Promise).
- Run `npm run build && npm test` to ensure no import errors.

**"Type error: ScoringContext has no property X"**
- Check `src/scoring/types.ts` for available context properties.
- Use `ctx.fingerprint`, `ctx.manifest`, `ctx.git` — not custom properties.
- Verify fingerprint data exists in test fixture: `console.log(ctx)` in test.

**"Constant is undefined"**
- Open `src/scoring/constants.ts` and confirm constant is exported.
- Use `npm run build` to catch missing exports.
- Add new constants if needed and commit to constants.ts first.

**"Test fails with 'memfs is not found'"**
- Import from test setup: `import { vol } from 'memfs'`.
- See existing tests in `src/scoring/checks/__tests__/` for memfs usage patterns.