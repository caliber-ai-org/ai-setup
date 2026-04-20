---
name: scoring-checks
description: Add a new deterministic scoring check in src/scoring/checks/. Returns Check[] array, uses constants from src/scoring/constants.ts, integrates in src/scoring/index.ts. Use when adding scoring logic, creating checks, modifying check weights. Do NOT use for display/UI changes or check result formatting.
---
# Scoring Checks

## Critical

1. **Check must return `Check[]`** — Never return a single check or a Promise. Return an empty array `[]` only if there are genuinely zero checks; always push at least one check object.
2. **Use constants from `src/scoring/constants.ts`** — All `maxPoints` and `earnedPoints` values must reference `POINTS_*` constants; never hardcode numbers.
3. **Deterministic only** — No LLM calls, no network. Scoring checks use `fs`, `path`, and `execSync` for git commands only.
4. **File structure**: Add checks to existing category files in `src/scoring/checks/`. Export a **named function** with signature `check{Category}(dir: string): Check[]`.
5. **Integration point**: Spread the result into `allChecks` in `computeLocalScore()` inside `src/scoring/index.ts`.

## Instructions

1. **Choose or create a check file** in `src/scoring/checks/` matching the category (`existence.ts`, `quality.ts`, `grounding.ts`, `accuracy.ts`, `freshness.ts`, `bonus.ts`, `sources.ts`).
   - Import `type { Check }` from `../index.js`.
   - Import constants from `../constants.js`.
   - Add a new `export function check{Category}(dir: string): Check[]` function (or add to the existing one).
   - Verify file compiles: `npx tsc --noEmit`.

2. **Inspect the filesystem** using the `dir` parameter.
   - Use `fs.existsSync(join(dir, 'path'))`, `fs.readFileSync(join(dir, 'file'), 'utf-8')`, etc.
   - For git-based checks: `execSync('git log ...', { cwd: dir })`.
   - No external APIs, no LLM calls.

3. **Build the Check object**.
   - `id`: Unique kebab-case string (e.g., `'claude_md_exists'`, `'skills_count'`).
   - `name`: Human-readable display name.
   - `category`: One of `'existence' | 'quality' | 'grounding' | 'accuracy' | 'freshness' | 'bonus'`.
   - `maxPoints` / `earnedPoints`: Must reference `POINTS_*` constants.
   - `passed`: `earnedPoints >= Math.ceil(maxPoints * 0.6)` (or custom logic).
   - `detail`: Human-friendly message explaining the result.
   - Optional: `suggestion` (if not passed) and `fix` object with `action`, `data`, `instruction`.

4. **Reference constants for all numeric values**.
   - Add new constants to `src/scoring/constants.ts` if needed.
   - Example: `export const POINTS_YOUR_CHECK = 4;` then use `maxPoints: POINTS_YOUR_CHECK`.

5. **Register in src/scoring/index.ts**.
   - The existing category functions (`checkExistence`, `checkQuality`, etc.) are already called in `computeLocalScore()`.
   - If adding a new function: import it and spread into `allChecks`.
   - Verify tests pass: `npm test -- src/scoring/__tests__/`.

6. **Write a test** in `src/scoring/checks/__tests__/{category}.test.ts`.
   - Use `mkdtempSync` to create a temp directory; write files to simulate conditions.
   - Test both passing and failing cases.
   - Verify: `npx vitest run src/scoring/checks/__tests__/{category}.test.ts`.

## Examples

**User says**: "Add a scoring check that verifies CLAUDE.md exists and is not empty."

**Actions**:
1. In `src/scoring/checks/existence.ts`, add to the `checkExistence(dir: string): Check[]` function:
```typescript
import type { Check } from '../index.js';
import { POINTS_CLAUDE_MD_EXISTS } from '../constants.js';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export function checkExistence(dir: string): Check[] {
  const checks: Check[] = [];
  const claudeMdPath = join(dir, 'CLAUDE.md');
  const exists = existsSync(claudeMdPath);
  const nonEmpty = exists && readFileSync(claudeMdPath, 'utf-8').trim().length > 0;
  const earned = nonEmpty ? POINTS_CLAUDE_MD_EXISTS : 0;
  checks.push({
    id: 'claude_md_exists',
    name: 'CLAUDE.md exists and is not empty',
    category: 'existence',
    maxPoints: POINTS_CLAUDE_MD_EXISTS,
    earnedPoints: earned,
    passed: earned > 0,
    detail: exists ? (nonEmpty ? 'CLAUDE.md present and non-empty' : 'CLAUDE.md is empty') : 'CLAUDE.md missing',
  });
  return checks;
}
```

2. Add to `src/scoring/constants.ts`: `export const POINTS_CLAUDE_MD_EXISTS = 10;`

3. `checkExistence` is already called in `computeLocalScore()` in `src/scoring/index.ts` — no changes needed there.

4. Test with `npm test -- src/scoring/`.

**Result**: Check appears in score output under the existence category.

## Common Issues

**"Check is not appearing in score output"**
- Verify the check ID is not in a `*_ONLY_CHECKS` set that excludes your target agent.
- Verify the function is called (or its result is spread) in `computeLocalScore()` in `src/scoring/index.ts`.
- Run `npm run build && npm test` to ensure no import errors.

**"Points are hardcoded but should use constants"**
- Replace all literal numbers like `earnedPoints: 5` with `earnedPoints: POINTS_YOUR_CHECK`.
- Constants are in `src/scoring/constants.ts` — add new ones if needed.

**"Platform-specific check appears for wrong agent"**
- Add check ID to the appropriate `*_ONLY_CHECKS` set in `src/scoring/constants.ts`.
- Verify `filterChecksForTarget()` in `src/scoring/index.ts` handles your platform set.

**"Test fails with file not found"**
- Use `mkdtempSync` to create a real temp directory; write files with `writeFileSync`.
- Always clean up in a `finally` block: `rmSync(dir, { recursive: true })`.