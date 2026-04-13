---
name: caliber-testing
description: Writes Vitest tests following project patterns: __tests__/ dirs, vi.mock() for modules, global LLM mock from src/test/setup.ts, env var save/restore, and describe/it blocks. Use when user says 'write tests', 'add tests', 'test this', or creates *.test.ts files. Do NOT use for non-test code or documentation.
---
# Caliber Testing

## Critical

- **Test location**: All tests live in `__tests__/` directories at the same level as the code being tested. File names: `<module>.test.ts`.
- **Global LLM mock**: `src/test/setup.ts` automatically mocks `@anthropic-ai/sdk`, `@anthropic-ai/vertex-sdk`, and `openai`. Do NOT re-mock these in individual tests—use the global mock.
- **Env var isolation**: Save and restore `process.env` in `beforeEach` / `afterEach`. See example below.
- **Module mocks**: Use `vi.mock()` at the top of test files with `{ spy: true }` or define default behavior. Always import the real module and use `vi.getMocked()` to assert on calls.

## Instructions

1. **Create test file in `__tests__/`**
   - Path: `src/<feature>/__tests__/<module>.test.ts`
   - Verify the directory exists; create if needed.

2. **Import testing utilities and the module under test**
   ```typescript
   import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
   import { functionToTest } from '../index.js';
   ```
   - Note: Use `.js` import extensions (ESM convention in this project).

3. **Save/restore env vars if your code reads `process.env`**
   ```typescript
   let originalEnv: NodeJS.ProcessEnv;
   beforeEach(() => {
     originalEnv = { ...process.env };
   });
   afterEach(() => {
     process.env = originalEnv;
   });
   ```
   - Verify this pattern is in place before running tests.

4. **Mock external modules using `vi.mock()` at file top (if needed)**
   ```typescript
   vi.mock('../dependency.js', () => ({
     dependencyFunc: vi.fn().mockResolvedValue({ data: 'test' }),
   }));
   ```
   - Do NOT mock LLM libraries (`@anthropic-ai/sdk`, `openai`, `@anthropic-ai/vertex-sdk`)—the global setup handles them.
   - Use `{ spy: true }` to spy on the original implementation if needed.

5. **Write test cases using `describe` and `it`**
   ```typescript
   describe('functionToTest', () => {
     it('should return expected value when input is valid', () => {
       const result = functionToTest('input');
       expect(result).toBe('expected');
     });

     it('should throw error when input is invalid', () => {
       expect(() => functionToTest(null)).toThrow('Invalid input');
     });
   });
   ```
   - Verify test names are descriptive and follow "should..." convention.

6. **For async code, use `async/await` in test functions**
   ```typescript
   it('should fetch data', async () => {
     const result = await fetchData();
     expect(result).toBeDefined();
   });
   ```
   - Verify the test waits for all promises to resolve before assertions.

7. **Run tests and verify all pass**
   ```bash
   npm run test -- src/<feature>/__tests__/<module>.test.ts
   ```
   - Or for the whole feature: `npm run test -- src/<feature>/`
   - Verify exit code is 0 and all assertions pass.

## Examples

**User says**: "Write tests for the `detectLanguage` function in `src/fingerprint/code-analysis.ts`."

**Actions**:
1. Create `src/fingerprint/__tests__/code-analysis.test.ts`.
2. Import `detectLanguage` and Vitest utilities.
3. Mock file I/O if needed: `vi.mock('fs/promises')` (not LLM).
4. Write test cases:
   ```typescript
   import { describe, it, expect, vi } from 'vitest';
   import { detectLanguage } from '../code-analysis.js';

   vi.mock('fs/promises', () => ({
     readFile: vi.fn(),
   }));

   describe('detectLanguage', () => {
     it('should detect TypeScript from file extension', () => {
       const lang = detectLanguage('foo.ts');
       expect(lang).toBe('typescript');
     });

     it('should detect Python from file extension', () => {
       const lang = detectLanguage('bar.py');
       expect(lang).toBe('python');
     });

     it('should return unknown for unrecognized extension', () => {
       const lang = detectLanguage('data.xyz');
       expect(lang).toBe('unknown');
     });
   });
   ```
5. Run: `npm run test -- src/fingerprint/__tests__/code-analysis.test.ts`

**Result**: Tests pass, file is committed, patterns replicated in future tests.

## Common Issues

- **"Cannot find module @anthropic-ai/sdk"**: This means `src/test/setup.ts` was not loaded. Verify `vitest.config.ts` has `setupFiles: ['./src/test/setup.ts']` in the config. Check the vitest.config.ts file for correct setup.
- **"ReferenceError: vi is not defined"**: Add `import { vi } from 'vitest'` at the top of the test file.
- **"Module not found: src/llm/anthropic.js"**: Check the import path uses `.js` extension (ESM convention). Verify file exists at `src/llm/anthropic.ts` → import as `./anthropic.js`.
- **"Timeout: async test did not finish"**: Add `async/await` to test function and ensure all promises are awaited. Example: `it('test', async () => { await fn(); expect(...); });`
- **"process.env is dirty after test"**: Verify `beforeEach/afterEach` are saving and restoring `process.env`. Add: `beforeEach(() => { originalEnv = { ...process.env }; }); afterEach(() => { process.env = originalEnv; });`
- **"Mock is not being called"**: Use `vi.getMocked(module).functionName` to assert on mocked function calls. Example: `expect(vi.getMocked(fs).readFile).toHaveBeenCalledWith('path')`.