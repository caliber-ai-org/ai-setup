---
name: caliber-testing
description: Writes Vitest tests following project patterns: __tests__/ directories, vi.mock() for module mocking, global LLM mock from src/test/setup.ts, environment variable save/restore, and test file organization. Use when user says 'write tests', 'add test coverage', 'test this', creates *.test.ts files, or when test failures appear in CI. Do NOT use for non-test code or for debugging without writing tests.
---
# Caliber Testing

## Critical

- **Never test internal implementation details.** Test behavior and side effects only.
- **Always use vi.mock() with default implementation** for external dependencies (LLM APIs, file system, git commands).
- **Global LLM mock is pre-configured in `src/test/setup.ts`** — you do NOT need to mock LLM calls in individual tests unless overriding the default.
- **Environment variables must be saved/restored per-test** using `beforeEach`/`afterEach`. Do NOT assume env state between tests.
- **Test files live in `__tests__/` directories** adjacent to the code they test (e.g., `src/scoring/__tests__/accuracy.test.ts` for `src/scoring/accuracy.ts`).

## Instructions

1. **Create the test file** in the correct location: `src/<module>/__tests__/<feature>.test.ts`
   - Verify the `__tests__/` directory exists; create if missing.

2. **Import test utilities** at the top of the file:
   ```typescript
   import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
   import { SomeModule } from '../module.js'; // ESM with .js extension
   ```
   - Always use `.js` extensions in imports (ESM convention).
   - Import only what you need to test.

3. **Set up mocks for external dependencies** using `vi.mock()` before imports:
   ```typescript
   vi.mock('fs/promises');
   vi.mock('../some-internal-module.js');
   ```
   - For LLM calls: do NOT mock — the global mock from `src/test/setup.ts` handles it.
   - For file I/O, git commands, spawn/exec: mock these modules.

4. **Save/restore environment variables per-test**:
   ```typescript
   describe('MyModule', () => {
     beforeEach(() => {
       process.env.MY_VAR = 'test-value';
     });
     afterEach(() => {
       delete process.env.MY_VAR;
     });
   });
   ```
   - Do this even if the test doesn't directly set env vars — tests may inherit from CI or prior tests.

5. **Write focused test cases** with clear intent:
   ```typescript
   it('should return true when condition is met', async () => {
     const result = await myFunction({ input: 'data' });
     expect(result).toBe(true);
   });
   ```
   - One assertion per test when possible; group related assertions in one test.
   - Use descriptive test names that explain the behavior.
   - Verify side effects (file writes, logs, state changes) when relevant.

6. **Run tests locally before committing**:
   ```bash
   npm run test                                          # all tests
   npx vitest run src/scoring/__tests__/accuracy.test.ts # single file
   npm run test -- --coverage                           # coverage report
   ```
   - Verify all tests pass and coverage is acceptable (>80% for critical paths).

## Examples

### User says: "Write tests for the accuracy scoring check"

**File created**: `src/scoring/__tests__/accuracy.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { checkAccuracy } from '../checks/accuracy.js';

describe('checkAccuracy', () => {
  beforeEach(() => {
    process.env.CALIBER_LEARN_ENABLED = 'false';
  });
  afterEach(() => {
    delete process.env.CALIBER_LEARN_ENABLED;
  });

  it('should return 100 when CLAUDE.md matches generated content', async () => {
    const result = await checkAccuracy({
      existing: { path: 'CLAUDE.md', content: 'test' },
      generated: 'test',
    });
    expect(result.score).toBe(100);
  });

  it('should return 0 when content differs significantly', async () => {
    const result = await checkAccuracy({
      existing: { path: 'CLAUDE.md', content: 'old' },
      generated: 'new',
    });
    expect(result.score).toBe(0);
  });
});
```

### User says: "Test the fingerprint collector"

**File created**: `src/fingerprint/__tests__/index.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs/promises';
import { collectFingerprint } from '../index.js';

vi.mock('fs/promises');
vi.mock('../file-tree.js');
vi.mock('../code-analysis.js');

describe('collectFingerprint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return a fingerprint object with all expected fields', async () => {
    const result = await collectFingerprint('/test/project');
    expect(result).toHaveProperty('framework');
    expect(result).toHaveProperty('language');
    expect(result).toHaveProperty('files');
  });
});
```

## Common Issues

**"Cannot find module '__mocks__'"**
- Issue: Attempting to use Jest-style `__mocks__/` directory.
- Fix: Use `vi.mock('module-name')` inline in your test file instead. Caliber uses Vitest, not Jest.

**"ReferenceError: process is not defined"**
- Issue: Test is running in a browser-like environment.
- Fix: Add `environment: 'node'` to `vitest.config.ts` for that test file, or ensure `src/test/setup.ts` is loaded.

**"Test timeout of 10000ms exceeded"**
- Issue: Async operation (file I/O, network) is waiting on a real module instead of a mock.
- Fix: Verify you've called `vi.mock('module-name')` before importing the code under test.
- Check: Run `npx vitest --reporter=verbose` to see which module is blocking.

**"Expected mock to be called but it wasn't"**
- Issue: Mock is defined but the code path doesn't execute.
- Fix: Verify the test input reaches the mocked function. Add `console.log()` before the call, or use `vi.mocked(mockFn).mock.calls` to inspect.

**"env var set in test is visible in next test"**
- Issue: Missing `afterEach(() => delete process.env.VAR)` or similar cleanup.
- Fix: Always pair `beforeEach` with `afterEach` for env vars. Use the pattern shown in Step 4.

**"LLM mock is not being used"**
- Issue: Test is importing LLM module before the mock is active.
- Fix: Do NOT manually mock LLM modules — the global mock in `src/test/setup.ts` handles all LLM calls. If override is needed, call `vi.mocked(mockFn).mockResolvedValueOnce(...)` in your test.