---
name: caliber-testing
description: Write Vitest tests following Caliber patterns: tests in __tests__/ directories, use vi.mock() for modules, leverage global LLM mock from src/test/setup.ts, save/restore env vars. Trigger: user says 'write tests', 'add tests', 'test this', or creates *.test.ts files. Do NOT use for non-test code or when user is debugging existing tests.
---
# Caliber Testing

## Critical

- **Test location**: Always place tests in `__tests__/` subdirectory alongside source code (e.g., `src/commands/__tests__/score.test.ts` for `src/commands/score.ts`)
- **Global LLM mock**: src/test/setup.ts provides `mockLLM` and `mockLLMStream` globally — use these instead of creating new mocks
- **Environment variables**: Wrap tests in `beforeEach(() => { process.env.SAVED = ... })` and `afterEach(() => { process.env.SAVED = null })` to avoid test pollution
- **Import extensions**: Use `.js` extensions for all relative imports (ESM convention)
- **Test file naming**: `[module].test.ts` (not `.spec.ts`)

## Instructions

1. **Set up test file structure**
   - Create file at `src/[feature]/__tests__/[name].test.ts`
   - Import testing utilities: `import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'`
   - Import source file under test
   - Verify file location matches existing test patterns in project

2. **Handle environment variables**
   - Save original values in `beforeEach`: `const savedEnv = { ...process.env }`
   - Restore in `afterEach`: `Object.assign(process.env, savedEnv); delete process.env.NEW_VAR`
   - This prevents tests from affecting each other
   - Verify cleanup runs with `afterEach` or test will fail on subsequent runs

3. **Mock external modules with vi.mock()**
   - Place `vi.mock()` calls at top of test file before imports
   - Use hoisted pattern: `vi.mock('../path/to/module.js', () => ({ default: { /* mock */ } }))`
   - For functions: `vi.mock('../utils/fetch.js', () => ({ fetchData: vi.fn() }))`
   - Verify mock is applied before any test runs by checking first test imports the mocked module

4. **Use global LLM mock from setup.ts**
   - Global `mockLLM` and `mockLLMStream` are auto-registered in vitest.config.ts setupFiles
   - Import from `src/test/setup.js`: `import { mockLLM } from '../test/setup.js'`
   - Configure per test: `mockLLM.mockResolvedValue({ /* response */ })`
   - Reset between tests: `mockLLM.mockReset()` in `afterEach`
   - Verify mock was called: `expect(mockLLM).toHaveBeenCalledWith(...)`

5. **Structure test groups with describe blocks**
   - Group related tests: `describe('scoreCommand', () => { it('should...', ...) })`
   - Use nested describes for sub-features: `describe('error handling', () => { ... })`
   - Verify each describe has at least one test

6. **Write assertions matching project style**
   - Use `expect()` with `.toEqual()`, `.toBeDefined()`, `.rejects.toThrow()`
   - For async: `await expect(asyncFn()).resolves.toEqual(...)`
   - For errors: `await expect(asyncFn()).rejects.toThrow('message')`
   - Verify assertion matches the actual return type

## Examples

**User says: "Write tests for src/scoring/index.ts"**

Actions:
1. Create `src/scoring/__tests__/index.test.ts`
2. Import: `import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'`
3. Import under test: `import { scoreConfig } from '../index.js'`
4. Set up env var handling:
   ```typescript
   let savedEnv: Record<string, string | undefined>
   beforeEach(() => {
     savedEnv = { ...process.env }
   })
   afterEach(() => {
     Object.assign(process.env, savedEnv)
     delete process.env.CUSTOM_VAR
   })
   ```
5. Write test using global `mockLLM`:
   ```typescript
   describe('scoreConfig', () => {
     it('should score with default weights', async () => {
       const result = await scoreConfig({ /* ... */ })
       expect(result.score).toBeDefined()
       expect(mockLLM).toHaveBeenCalled()
     })
   })
   ```

Result: Test file at correct path, uses global mock, cleans up env vars, follows project conventions.

## Common Issues

**Error: "Cannot find module '../test/setup.js'"**
- Verify import path uses `.js` extension (ESM)
- If accessing `mockLLM`, ensure it's imported: `import { mockLLM } from '../test/setup.js'`
- Check that setup.ts exports the mock in src/test/setup.ts

**Error: "Test timeout" or "mock not called"**
- Verify `vi.mock()` is at top of file, before all imports
- Check that mocked module path matches actual import in source file
- Ensure async test uses `await` or returns Promise: `it('name', async () => { ... })`

**Error: "process.env.VAR is not defined in next test"**
- Verify `afterEach` restores env vars: `Object.assign(process.env, savedEnv)`
- Check that `beforeEach` saves original: `const savedEnv = { ...process.env }`
- If adding new env vars, delete them: `delete process.env.NEW_VAR` in afterEach

**Test passes locally but fails in CI**
- Verify no hardcoded absolute paths (use relative imports)
- Check that mocks reset between tests: add `mockLLM.mockReset()` in afterEach
- Ensure test doesn't depend on file system state (use memfs for file operations)