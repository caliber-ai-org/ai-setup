---
name: scoring-checks
description: Adds a new deterministic scoring check to src/scoring/checks/ implementing the Check interface. Point values from src/scoring/constants.ts. Checks are synchronous functions receiving dir:string and returning Check[]. Use when user says 'add scoring check', 'new check', 'score X', or modifies src/scoring/. Do NOT use for LLM-based scoring or checks requiring external API calls.
---
# Scoring Checks

## Critical

- **Synchronous only**: No async/await, no Promise, no LLM calls. Checks must complete instantly on local filesystem inspection.
- **Check interface**: Every check returns `Check[]` where `Check = { name: string; points: number; reason: string }`. Points MUST match a constant in `src/scoring/constants.ts`.
- **No side effects**: Do not write files, modify state, or call external APIs. Only inspect the filesystem.
- **Export as named function**: Export your check function from `src/scoring/checks/your-check.ts` and import it in `src/scoring/checks/index.ts` in the `CHECKS` array.

## Instructions

1. **Review the Check interface and constants**
   - Open `src/scoring/index.ts` and locate the `Check` type: `{ name: string; points: number; reason: string }`
   - Open `src/scoring/constants.ts` and identify point values: `POINTS.EXISTENCE`, `POINTS.QUALITY`, etc.
   - Verify your check's points value exists in constants before proceeding.

2. **Create the check file in src/scoring/checks/**
   - File path: `src/scoring/checks/your-check-name.ts`
   - Import from `src/scoring/constants.ts`: `import { POINTS } from '../constants'`
   - Signature: `export function checkYourName(dir: string): Check[]`
   - Verify the function name is camelCase and matches the check purpose.

3. **Implement the check logic**
   - Use `fs.existsSync()` or `fs.statSync()` to inspect files (no fs/promises)
   - Use `glob.sync()` from the `glob` package for file pattern matching (matches existing checks)
   - Return an empty array `[]` if the check passes or does not apply
   - Return `[{ name: 'Check Name', points: POINTS.CONSTANT, reason: 'Explanation of failure' }]` on failure
   - Example: `fs.existsSync(path.join(dir, '.cursor/rules.md'))` to check file existence
   - Verify your fs calls complete synchronously before proceeding.

4. **Register the check in src/scoring/checks/index.ts**
   - Import your function: `import { checkYourName } from './your-check-name'`
   - Add it to the `CHECKS` array: `export const CHECKS = [checkExistence, checkQuality, ..., checkYourName]`
   - Verify the CHECKS array is exported as a named export.

5. **Add unit tests in src/scoring/checks/__tests__/**
   - File path: `src/scoring/checks/__tests__/your-check-name.test.ts`
   - Use Vitest: `import { describe, it, expect, beforeEach, afterEach } from 'vitest'`
   - Use `memfs` to mock the filesystem (see `src/scoring/checks/__tests__/existence.test.ts` for pattern)
   - Test both pass (empty array) and fail (returns Check with correct points) cases
   - Run `npm run test -- src/scoring/checks/__tests__/your-check-name.test.ts` to verify.

6. **Update src/scoring/constants.ts if needed**
   - If your points value does not exist, add it to `POINTS` object
   - Example: `POINTS.MY_CHECK = 15` (use integers)
   - Verify the constant is exported before proceeding.

## Examples

**User says:** "Add a check that scores points if AGENTS.md exists"

**Actions:**
1. Create `src/scoring/checks/agents-file.ts`:
   ```typescript
   import path from 'path';
   import fs from 'fs';
   import { POINTS } from '../constants';
   import type { Check } from '../index';

   export function checkAgentsFile(dir: string): Check[] {
     const agentsPath = path.join(dir, 'AGENTS.md');
     if (!fs.existsSync(agentsPath)) {
       return [{
         name: 'AGENTS.md exists',
         points: POINTS.EXISTENCE,
         reason: 'AGENTS.md not found'
       }];
     }
     return [];
   }
   ```
2. Add to `src/scoring/checks/index.ts`: `import { checkAgentsFile } from './agents-file'` and add to `CHECKS` array
3. Create `src/scoring/checks/__tests__/agents-file.test.ts` with memfs mocks
4. Run `npm run test -- src/scoring/checks`

**Result:** Check runs synchronously, returns points only if file missing.

## Anti-patterns

1. **Do NOT use async/await or Promise.** Checks must be fully synchronous. Use `fs.readFileSync()`, not `fs.promises.readFile()`. Use `glob.sync()`, not `glob.glob()`. Correct approach: `const files = glob.sync('**/*.ts', { cwd: dir })`

2. **Do NOT call LLM functions or external APIs.** No `llmCall()`, no `fetch()`, no `axios.get()`. Checks run offline and must complete in <100ms. Correct approach: Parse JSON from a local file with `JSON.parse(fs.readFileSync(...))` if needed.

3. **Do NOT return positive points on pass.** Return `[]` (empty array) for passing checks. Only return `Check[]` with points on failure. Correct approach: `if (condition) return []; return [{ name: 'Check', points: POINTS.X, reason: '...' }];`

## Common Issues

- **Error: `fs.readFile is not a function`** → You used `fs/promises`. Use `import fs from 'fs'` (not `fs.promises`) and call `fs.readFileSync(path)` instead.
- **Error: `glob.glob is not a function`** → You used async glob. Use `import { glob } from 'glob'` and call `glob.sync(pattern, { cwd: dir })` instead.
- **Test fails: `ENOENT: no such file or directory`** → Mock the filesystem with memfs before calling your check. See `existence.test.ts`: `const vol = new Volume(); vol.fromJSON({...}); const fs = vol.promises` (note: for sync tests, use `vol` directly).
- **Check not running in `npm run test:coverage`** → Verify your check is added to the `CHECKS` array in `src/scoring/checks/index.ts` and that the test file is named `your-check-name.test.ts` in `src/scoring/checks/__tests__/`.