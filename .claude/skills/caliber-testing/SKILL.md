---
name: caliber-testing
description: Writes Vitest tests following project patterns: __tests__/ directories, vi.mock() for module mocking, global LLM mock from src/test/setup.ts, environment variable save/restore, and test file organization. Use when user says 'write tests', 'add test coverage', 'test this', creates *.test.ts files, or when test failures appear in CI. Do NOT use for non-test code or for debugging without writing tests.
---
# caliber-testing

## Critical

- **Test file location**: Always place tests in `__tests__/` subdirectory of the module being tested. File name: `module-name.test.ts`. Example: `src/llm/__tests__/anthropic.test.ts` for `src/llm/anthropic.ts`.
- **Global LLM mock**: Use the mock from `src/test/setup.ts`. It is auto-loaded by Vitest. Do NOT create duplicate LLM mocks in individual test files.
- **Avoid over-mocking**: Mock only external dependencies (HTTP, file I/O, LLM calls). Never mock internal modules or pure logic.
- **Environment cleanup**: Always save and restore `process.env` between tests to prevent cross-test pollution. Use the pattern in Step 4.
- **No hardcoded test data**: Use `beforeEach` to set up fresh mocks and env state for each test.

## Instructions

### Step 1: Set up the test file structure
Create `src/<module>/__tests__/<module-name>.test.ts`. Import `describe`, `it`, `expect`, `beforeEach`, `afterEach` from `vitest`, and import the module under test.

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { functionToTest } from '../module-name.js';
```

Verify: The test file is in the correct `__tests__/` directory parallel to the module it tests.

### Step 2: Mock external dependencies with vi.mock()
At the top of the test file, before `describe`, mock external modules using `vi.mock()`. This applies to:
- HTTP calls (use `vi.mock()` to intercept fetch or axios)
- File I/O (use `vi.mock('fs')` or similar)
- LLM providers (already mocked globally via `src/test/setup.ts`, but document the assumption)

Example:
```typescript
vi.mock('fs', () => ({
  readFileSync: vi.fn(() => 'mock content'),
}));
```

Verify: All external dependencies are mocked. Internal module calls are NOT mocked.

### Step 3: Use beforeEach and afterEach for setup and cleanup
For each test suite, create `beforeEach` to reset mocks and set up test state. Create `afterEach` to clean up.

```typescript
describe('module-name', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should do something', () => {
    // test body
  });
});
```

Verify: `vi.clearAllMocks()` is called in `beforeEach` to reset mock call counts.

### Step 4: Save and restore process.env for env-dependent tests
If a test modifies `process.env`, save the original state and restore it. Use this pattern:

```typescript
describe('env-dependent module', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.resetAllMocks();
  });

  it('should read from process.env.VARIABLE', () => {
    process.env.VARIABLE = 'test-value';
    // test assertion
  });
});
```

Verify: `process.env` is restored to its original state after each test.

### Step 5: Write assertions that match project conventions
Use `expect()` with clear matchers. For async functions, use `await` or `.resolves`.

```typescript
it('should return the expected value', async () => {
  const result = await functionToTest('input');
  expect(result).toEqual({ key: 'value' });
});

it('should throw on invalid input', async () => {
  await expect(functionToTest(null)).rejects.toThrow('Invalid input');
});
```

Verify: Assertions are specific (not just checking truthiness) and async functions use `await` or `.resolves`.

### Step 6: Run and verify the tests
Run the specific test file to ensure it passes:
```bash
npm run test -- src/<module>/__tests__/<module-name>.test.ts
```

Or run all tests:
```bash
npm run test
```

Verify: All tests pass. Check test coverage with `npm run test -- --coverage`.

## Examples

### Example: Testing an LLM provider module

User says: "Write tests for src/llm/anthropic.ts"

**Actions:**
1. Create `src/llm/__tests__/anthropic.test.ts`
2. Import `describe`, `it`, `expect`, `beforeEach`, `afterEach`, `vi` from vitest
3. Mock external HTTP calls (fetch is mocked globally via setup)
4. Write tests for `call()` and `stream()` methods
5. Save/restore `process.env` for API key tests
6. Run: `npm run test -- src/llm/__tests__/anthropic.test.ts`

**Result:**
```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AnthropicProvider } from '../anthropic.js';

describe('AnthropicProvider', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, ANTHROPIC_API_KEY: 'test-key' };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.resetAllMocks();
  });

  it('should call the API with correct parameters', async () => {
    const provider = new AnthropicProvider();
    const response = await provider.call({ messages: [{ role: 'user', content: 'test' }] });
    expect(response).toBeDefined();
  });
});
```

### Example: Testing a utility function

User says: "Add tests for src/utils/sanitize.ts"

**Actions:**
1. Create `src/utils/__tests__/sanitize.test.ts`
2. Import the sanitize function
3. Write tests for different input types
4. No mocking needed (pure logic)
5. Run: `npm run test -- src/utils/__tests__/sanitize.test.ts`

**Result:**
```typescript
import { describe, it, expect } from 'vitest';
import { sanitize } from '../sanitize.js';

describe('sanitize', () => {
  it('should remove dangerous characters', () => {
    expect(sanitize('<script>alert()</script>')).toEqual('scriptalert()script');
  });

  it('should handle null input', () => {
    expect(sanitize(null)).toEqual('');
  });
});
```

## Common Issues

**Issue: "Cannot find module" error when importing from test**
- **Cause**: Missing `.js` extension in ESM imports
- **Fix**: Ensure all imports in test files use `.js` extension: `import { foo } from '../module.js'`

**Issue: "process.env.VARIABLE is undefined" in tests**
- **Cause**: Environment variable not set up in test or not restored properly
- **Fix**: Use the save/restore pattern from Step 4. Set `process.env.VARIABLE = 'value'` in `beforeEach`.

**Issue: "vi.mock is not defined" or mock not working**
- **Cause**: Attempting to mock after imports, or mocking an already-imported module
- **Fix**: Call `vi.mock()` at the top of the file, before any imports of the mocked module.

**Issue: Tests pass locally but fail in CI**
- **Cause**: Mock state or env vars not cleaned up between tests
- **Fix**: Add `vi.clearAllMocks()` in `beforeEach` and restore `process.env` in `afterEach`.

**Issue: "Timeout of 5000ms exceeded"**
- **Cause**: Async test or mock not resolving
- **Fix**: Ensure mocks return resolved promises. Use `vi.fn().mockResolvedValue()` for async mocks.

**Issue: Tests reference global LLM mock but it's not available**
- **Cause**: Test setup not loading `src/test/setup.ts`
- **Fix**: Verify `vitest.config.ts` includes `setupFiles: ['src/test/setup.ts']`. This is already configured in the project.