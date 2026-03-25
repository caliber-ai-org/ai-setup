---
name: fingerprint-pipeline
description: Extends or modifies the project fingerprinting pipeline in src/fingerprint/. Covers collectFingerprint() orchestration, file-tree scanning, code-analysis extraction, existing-config reading, and cache persistence. Use when user says 'add fingerprint data', 'detect X in projects', 'read existing config', 'scan files', or modifies src/fingerprint/. Do NOT use for LLM-based stack detection (src/ai/detect.ts), dependency graph analysis (npm ls), or git history (src/fingerprint/git.ts baseline — only extend if asked).
---
# Fingerprint Pipeline

## Critical

1. **collectFingerprint() is the orchestrator** — lives in `src/fingerprint/index.ts`. All new fingerprint modules MUST export a named function that takes `(projectRoot: string, options?: {})` and returns `Promise<FingerprintData | null>`. Register in the `const collectors = [...]` array inside `collectFingerprint()` before calling `Promise.all()`.

2. **Cache layer is mandatory** — `src/fingerprint/cache.ts` exports `loadFingerprintCache()` and `saveFingerprintCache()`. ALWAYS call `loadFingerprintCache(projectRoot)` at the start of `collectFingerprint()` and return cached data if hash matches. ALWAYS call `saveFingerprintCache(projectRoot, fingerprint)` before returning. Verify `src/fingerprint/cache.ts` exports these functions.

3. **Type safety via FingerprintData** — defined in `src/fingerprint/index.ts`. All new detection modules MUST conform to existing shape: `{ [key: string]: unknown }`. Add new keys as separate modules, not inline mutations.

4. **No side effects** — fingerprint modules MUST be read-only. Never write files, delete directories, or modify state. Return `null` on error, never throw (caller handles gracefully).

## Instructions

**Step 1: Define the fingerprint module interface**
- Create new file in `src/fingerprint/<module-name>.ts`
- Export one async function: `export async function detect<ModuleName>(projectRoot: string, options?: {}): Promise<ModuleData | null>`
- Return type MUST extend or be compatible with `Record<string, unknown>`
- Return `null` if detection fails (e.g., file not found) — do NOT throw
- Verify function signature matches `(projectRoot: string) => Promise<Record<string, unknown> | null>`

**Step 2: Implement detection logic**
- Use existing helpers: `glob()` from `glob` package (e.g., `await glob('**/*.json', { cwd: projectRoot, ignore: ['node_modules'] })`)
- Read files synchronously: `fs.readFileSync(path.join(projectRoot, file), 'utf-8')`
- Parse JSON: wrap in try/catch, return `null` on error
- For code analysis, use patterns from `src/fingerprint/code-analysis.ts`: regex parsing or AST (if needed, check existing imports)
- Verify file I/O doesn't throw — wrap in try/catch, log via `console.debug()` if needed

**Step 3: Register in collectFingerprint()**
- Open `src/fingerprint/index.ts`
- Import new detector: `import { detect<ModuleName> } from './<module-name>'`
- Add to `const collectors = [...]` array: `{ key: '<snake_case_key>', fn: detect<ModuleName> }`
- Verify array is passed to `Promise.all()` and merged into final `fingerprint` object

**Step 4: Add type definition to FingerprintData**
- Open `src/fingerprint/index.ts` → find `interface FingerprintData`
- Add new property: `<snake_case_key>?: ModuleData` (mark optional if detection may fail)
- Verify TypeScript compiles: `npx tsc --noEmit`

**Step 5: Test and cache validation**
- Write test in `src/fingerprint/__tests__/<module-name>.test.ts` (mirror style from `file-tree.test.ts`)
- Test mock: create fixture in temp directory, call detector, assert shape matches FingerprintData
- Run: `npm run test -- src/fingerprint/__tests__/<module-name>.test.ts`
- Verify: `npm run test:coverage` includes new module in coverage
- Cache is automatic — verify `loadFingerprintCache()` returns cached result on second call with same projectRoot and hash

## Examples

**User:** "Add detection for Playwright test config"

**Actions:**
1. Create `src/fingerprint/playwright.ts`:
```typescript
export async function detectPlaywright(
  projectRoot: string
): Promise<{ configFiles: string[]; hasTests: boolean } | null> {
  try {
    const configFiles = await glob('**/playwright.config.{ts,js}', { cwd: projectRoot, ignore: ['node_modules'] });
    const testFiles = await glob('**/*.spec.ts', { cwd: projectRoot, ignore: ['node_modules', 'dist'] });
    return { configFiles, hasTests: testFiles.length > 0 };
  } catch {
    return null;
  }
}
```
2. Update `src/fingerprint/index.ts`:
```typescript
import { detectPlaywright } from './playwright';

interface FingerprintData {
  // ...
  playwright?: { configFiles: string[]; hasTests: boolean };
}

const collectors = [
  // ...
  { key: 'playwright', fn: detectPlaywright },
];
```
3. Test: `npm run test -- src/fingerprint/__tests__/playwright.test.ts` (new test file mirrors existing patterns)

**Result:** Next `caliber init` call includes `playwright` key in fingerprint, cached for 24h.

## Anti-patterns

1. **Do NOT throw errors in detector functions.** Instead, wrap file I/O in try/catch and return `null`. Caller in `collectFingerprint()` handles gracefully via `Promise.allSettled()` fallback. Bad: `throw new Error('file not found')`. Good: `return null; // File not found, skip detection`.

2. **Do NOT mutate the fingerprint object directly in a detector.** Instead, return a shape that merges cleanly. Bad: `fingerprint.myKey = value;`. Good: `return { myKey: value };` then let `collectFingerprint()` merge via spread operator.

3. **Do NOT call collectFingerprint() recursively or call other detectors inside a detector.** Each detector is independent. Bad: `const fileTree = await collectFileTree(projectRoot);`. Good: `const files = await glob(...); const tree = buildTree(files);` (inline, no cross-detector calls).

## Common Issues

**"TypeError: Cannot read property of undefined in collectFingerprint()"**
- Cause: Detector returned `undefined` instead of `null` on error.
- Fix: Verify detector returns `null` explicitly: `return null;` not `return;`. Update detector function.

**"Cache hit but fingerprint is stale"**
- Cause: `computeFingerprintHash()` in `src/fingerprint/index.ts` changed, but cache key didn't invalidate.
- Fix: Run `caliber refresh` to force recomputation. Verify hash is computed from git state and file structure (see `computeFingerprintHash()` in index.ts).

**"Glob pattern matches too many files, performance slow"**
- Cause: Detector glob pattern is too broad (e.g., `**/*.ts` without `ignore: ['node_modules']`).
- Fix: Add `ignore: ['node_modules', 'dist', 'build', '.next']` to glob options. Verify: `npm run test:coverage` includes new detector in coverage, profile time is < 100ms per detector.