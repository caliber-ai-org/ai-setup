---
name: caliber-testing
description: Writes Vitest tests for caliber modules following project patterns. LLM calls are globally mocked via src/test/setup.ts; override per-test with vi.spyOn. Use temp dirs (os.tmpdir()) for learner/storage tests, mock fs via memfs for fingerprint tests. Use when user says 'write test', 'add test', 'test coverage', or creates files in src/**/__tests__/. Do NOT re-mock llmCall globally — it's already stubbed.
---
# caliber-testing

## Critical

1. **LLMCall is pre-mocked globally** in `src/test/setup.ts`. Do NOT add `vi.mock('src/llm')` or duplicate mocks at the top level. Override only when you need different behavior per test via `vi.spyOn()`.
2. **File paths must match src structure**: Tests live in `src/{module}/__tests__/{filename}.test.ts` (e.g., `src/learner/__tests__/storage.test.ts`).
3. **Verify the setup.ts is loaded** before writing tests: Check that vitest.config.ts has `setupFiles: ['src/test/setup.ts']` in its config.

## Instructions

1. **Identify the module being tested** (e.g., `src/learner/storage.ts`) and create the test file at `src/{module}/__tests__/{name}.test.ts`.
   - Verify the source file exists and exports named or default functions.

2. **Import test utilities and the module**:
   ```typescript
   import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
   import { readFileSync, writeFileSync, existsSync } from 'fs';
   import path from 'path';
   import os from 'os';
   // Import the module under test
   import { myFunction } from '../myFunction';
   ```
   - Verify imports match exact export names from the source.

3. **For file I/O tests (learner, storage, writers)**:
   - Use `os.tmpdir()` to create a temporary directory per test.
   - Always clean up after tests via `afterEach`.
   - Example pattern from `src/learner/__tests__/`:
   ```typescript
   let tmpDir: string;
   beforeEach(() => {
     tmpDir = path.join(os.tmpdir(), `caliber-test-${Date.now()}`);
   });
   afterEach(() => {
     if (existsSync(tmpDir)) {
       // clean up tmpDir
     }
   });
   ```

4. **For filesystem mocking (fingerprint, file-tree tests)**:
   - Use `memfs` instead of temp dirs for isolated, fast fs mocks.
   - Import: `import { vol } from 'memfs'; import fs from 'memfs'` and restore after.
   - Example:
   ```typescript
   beforeEach(() => {
     vol.reset();
     vol.mkdirpSync('/project');
   });
   afterEach(() => vol.reset());
   ```

5. **For LLM-dependent tests** (ai, refine, generate):
   - Do NOT mock llmCall again—it's already stubbed globally.
   - If you need a specific return value, use `vi.spyOn(llmModule, 'llmCall').mockResolvedValueOnce({...})`.
   - Verify llmCall returns the expected shape: `{ content: string, usage: UsageInfo }`.

6. **Structure each test** with Arrange → Act → Assert:
   ```typescript
   it('should validate input and return error', () => {
     // Arrange
     const input = { invalid: true };
     // Act
     const result = myFunction(input);
     // Assert
     expect(result).toEqual({ error: 'Invalid input' });
   });
   ```
   - Verify the expected shape matches the actual return type.

7. **Run tests** to confirm they pass:
   - Single file: `npm run test -- src/learner/__tests__/storage.test.ts`
   - Watch mode: `npm run test:watch`
   - Coverage: `npm run test:coverage`
   - Verify no global mocks are redefined and all assertions pass.

## Examples

### Example 1: Testing a learner storage function

**User says**: "Add tests for src/learner/storage.ts"

**Actions**:
1. Create `src/learner/__tests__/storage.test.ts`.
2. Import storage functions and fs utilities.
3. Use tmpDir pattern:
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import os from 'os';
import { existsSync, readFileSync } from 'fs';
import { saveEntry, loadEntries } from '../storage';

describe('storage', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = path.join(os.tmpdir(), `caliber-test-${Date.now()}`);
  });
  afterEach(() => {
    if (existsSync(tmpDir)) {
      // cleanup
    }
  });

  it('should save and load entries', () => {
    const entry = { id: '1', text: 'test' };
    saveEntry(tmpDir, entry);
    const loaded = loadEntries(tmpDir);
    expect(loaded).toContainEqual(entry);
  });
});
```

**Result**: Test file runs with `npm run test`, no file I/O pollution between tests.

### Example 2: Testing fingerprint with memfs

**User says**: "Write tests for file-tree fingerprinting"

**Actions**:
1. Create `src/fingerprint/__tests__/file-tree.test.ts`.
2. Use memfs to mock the filesystem:
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { vol } from 'memfs';
import { analyzeFileTree } from '../file-tree';

describe('file-tree', () => {
  beforeEach(() => {
    vol.reset();
    vol.mkdirpSync('/project/src');
    vol.writeFileSync('/project/src/index.ts', 'export function x() {}');
  });
  afterEach(() => vol.reset());

  it('should scan TypeScript files', () => {
    const tree = analyzeFileTree('/project');
    expect(tree.files).toContainEqual(expect.objectContaining({ path: 'src/index.ts' }));
  });
});
```

**Result**: Isolated filesystem, no disk writes.

## Anti-patterns

1. **DO NOT re-mock llmCall at the top level** — it's already globally stubbed in `src/test/setup.ts`. Instead, use `vi.spyOn()` per-test to override for specific cases:
   - WRONG: `vi.mock('src/llm', () => ({ llmCall: vi.fn() }))`
   - RIGHT: `vi.spyOn(llm, 'llmCall').mockResolvedValueOnce({ content: '...', usage: {...} })`

2. **DO NOT use real fs.mkdirSync or fs.rmSync in tests**—use tmpdir with explicit cleanup or memfs for isolation. Leaving temp files pollutes the system:
   - WRONG: Tests create files in `/tmp` but never delete them → disk fills up over CI runs.
   - RIGHT: Use `afterEach` with rmSync or vol.reset() to guarantee cleanup.

3. **DO NOT assume llmCall return type without checking UsageInfo shape**. Always verify the mock returns `{ content: string, usage: { ... } }`:
   - WRONG: Stubbing with `{ response: 'text' }` breaks tests expecting `.content`.
   - RIGHT: Return `{ content: 'text', usage: { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 } }`.

## Common Issues

**Error: "llmCall is not a function" or "Cannot spy on undefined"**
- Cause: `src/test/setup.ts` not loaded by vitest.
- Fix: Verify `vitest.config.ts` includes `setupFiles: ['src/test/setup.ts']`. Run `npm run test -- --inspect-brk` to check if setup runs.

**Error: "ENOENT: no such file or directory, rmdir /tmp/caliber-test-..."**
- Cause: afterEach cleanup didn't wait for async operations or directory not empty.
- Fix: Check that all file writes in the test are synchronous or awaited. Use `rimraf(tmpDir, { force: true })` in afterEach or use memfs instead of tmpdir.

**Error: "vol is not defined" or memfs tests fail**
- Cause: memfs not imported or vol not reset between tests.
- Fix: Add `import { vol } from 'memfs'` and ensure `beforeEach(() => vol.reset())` + `afterEach(() => vol.reset())`.

**Error: "Expected mock to have been called" but it was**
- Cause: Test isolation—previous test's spy not cleared.
- Fix: Add `vi.clearAllMocks()` in `beforeEach` if testing call counts, or use `vi.restoreAllMocks()` in `afterEach`.