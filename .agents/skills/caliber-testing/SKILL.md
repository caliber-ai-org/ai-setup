---
name: caliber-testing
description: Writes Vitest tests following project patterns: __tests__/ directories, vi.mock() for module mocking with vi.hoisted() for test-time factories, global LLM mock from src/test/setup.ts, environment variable save/restore in beforeEach/afterEach, vi.clearAllMocks() lifecycle, and test file organization. Use when user says 'write tests', 'add test coverage', 'test this', creates *.test.ts files, or when test failures appear in CI. Do NOT use for non-test code or for debugging without writing tests.
paths:
  - src/**/__tests__/*.test.ts
---
# Caliber Testing

## Critical

- All test files MUST be placed in `__tests__/` directories parallel to source files: `src/[module]/__tests__/[module].test.ts`
- Register any new `__tests__/` directories in `vitest.config.ts`'s `include` glob (already configured: `src/**/*.test.ts`)
- NEVER mock `src/test/setup.ts` — it is the global LLM provider mock already applied to all tests
- Environment variable tests MUST save `process.env` in `beforeEach`, restore in `afterEach`, and explicitly delete env vars to test absence
- Temporary file/directory cleanup MUST happen in `afterEach`, not in individual test cleanup. Use `fs.rmSync(dir, { recursive: true, force: true })`
- When a test requires unmocking modules mocked in global setup, call `vi.unmock('../module.js')` BEFORE the import statement
- Run `pnpm test` locally and `pnpm test:coverage` before committing to verify coverage thresholds (lines: 50, functions: 50, branches: 50, statements: 50)

## Instructions

### Step 1: Create the test file in the correct directory
Create `src/[module]/__tests__/[module].test.ts`. The parent source file is `src/[module]/[module].ts`.

**Verify**: The `__tests__` directory exists at the same level as the source file being tested.

### Step 2: Import test framework
At the top of every test file, import from `vitest`:
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
```

Add additional imports based on what you're testing:
- File system: `import fs from 'fs'; import path from 'path'; import os from 'os';`
- Temporary files: Use `fs.mkdtempSync(path.join(os.tmpdir(), 'caliber-prefix-'))`
- Exec: `import { execSync } from 'child_process';`

**Verify**: All required test utilities are imported before test definitions.

### Step 3: Set up module mocking (if needed)
If testing a module that imports other modules you want to mock:

```typescript
vi.mock('../config.js', () => ({
  loadConfig: vi.fn(),
  writeConfigFile: vi.fn(),
}));
```

For complex mocks with test-time factory functions (hoisted):
```typescript
const { mockLoadConfig } = vi.hoisted(() => ({
  mockLoadConfig: vi.fn(),
}));

vi.mock('../config.js', () => ({
  loadConfig: () => mockLoadConfig(),
}));
```

For unmocking global setup mocks (e.g., to test llm/index.js itself):
```typescript
vi.unmock('../index.js');
```

Place all `vi.mock()` and `vi.unmock()` calls BEFORE importing the module under test.

**Verify**: Mock declarations appear before the import of the module being tested.

### Step 4: Organize tests in describe blocks
Group related tests with `describe()`:
```typescript
describe('functionName', () => {
  it('returns X when Y', () => {
    // test body
  });
});
```

**Verify**: Each `it()` test has a clear, complete assertion.

### Step 5: Manage environment and process state
For tests that modify `process.env` or `process.argv`:

```typescript
describe('config tests', () => {
  const originalEnv = process.env;
  const originalArgv = process.argv;

  beforeEach(() => {
    process.env = { ...originalEnv }; // Copy, not reference
    process.argv = [...originalArgv];
    delete process.env.SPECIFIC_VAR; // Explicitly remove vars to test absence
  });

  afterEach(() => {
    process.env = originalEnv;
    process.argv = originalArgv;
  });

  it('tests env var behavior', () => {
    process.env.MY_VAR = 'test';
    // test code
  });
});
```

**Verify**: `beforeEach` creates a copy of env/argv; `afterEach` restores originals; unused env vars are explicitly deleted with `delete process.env.VAR`.

### Step 6: Manage temporary files and directories
For file system tests, create temporary directories and clean them up:

```typescript
describe('file tree', () => {
  const dirs: string[] = [];
  
  afterEach(() => {
    for (const d of dirs) {
      try { fs.rmSync(d, { recursive: true, force: true }); } catch {}
    }
    dirs.length = 0;
  });

  it('processes files', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'caliber-test-'));
    dirs.push(tmp);
    // use tmp directory
  });
});
```

**Verify**: All temporary directories are pushed to a cleanup array and removed in `afterEach`.

### Step 7: Handle mock state cleanup
Before each test, clear mock call history to avoid pollution between tests:

```typescript
beforeEach(() => {
  vi.clearAllMocks(); // Reset all mock call counts and return values
});

afterEach(() => {
  vi.restoreAllMocks(); // Restore original implementations
  vi.resetModules(); // Reset cached module imports (if you reload modules)
});
```

**Verify**: `beforeEach` calls `vi.clearAllMocks()` for providers and `afterEach` calls `vi.restoreAllMocks()`.

### Step 8: Test assertions
Write assertions using `expect()`. Match the patterns from existing tests:

```typescript
// Simple checks
expect(value).toBe(expected);
expect(array).toContain(item);
expect(fn).toThrow('error message');

// Instance checks
expect(obj).toBeInstanceOf(ClassName);

// Mock checks
expect(mockFn).toHaveBeenCalledTimes(1);
expect(mockFn).toHaveBeenCalledWith(arg);

// File system checks
expect(fs.existsSync(path)).toBe(true);
```

**Verify**: Each test has at least one assertion and uses appropriate `expect()` matchers.

### Step 9: Run tests
Run tests locally before committing:
```bash
pnpm test                # Run all tests in watch mode
pnpm test:coverage       # Check coverage thresholds
pnpm test -- src/my/path/__tests__/my.test.ts  # Run single test file
```

**Verify**: All tests pass and coverage thresholds are met (lines: 50%, functions: 50%, branches: 50%).

## Examples

### Example 1: Testing a module with environment variables (config.test.ts pattern)

**User asks**: "Write tests for my config loader that reads from env vars and a config file."

**Actions taken**:
1. Create `src/lib/__tests__/config.test.ts`
2. Import test framework and fs module
3. Mock `fs` and `os`
4. Save/restore `process.env` in beforeEach/afterEach
5. Delete specific env vars to test absence
6. Test each branch: env vars set, file exists, both, neither

**Result**:
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';

vi.mock('fs');
vi.mock('os', () => ({ default: { homedir: () => '/home/user' } }));

import { loadConfig } from '../config.js';

describe('config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns env config when ANTHROPIC_API_KEY is set', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    const config = loadConfig();
    expect(config?.provider).toBe('anthropic');
  });

  it('returns null when no env vars set', () => {
    expect(loadConfig()).toBeNull();
  });
});
```

### Example 2: Testing file system operations with temp cleanup (file-tree.test.ts pattern)

**User asks**: "Write tests for file tree analysis."

**Actions taken**:
1. Create `src/fingerprint/__tests__/file-tree.test.ts`
2. Set up a cleanup array for temp directories
3. Create temp dirs in each test and push to cleanup array
4. Clean up all temp dirs in afterEach
5. Test with various file mtimes and directory structures

**Result**:
```typescript
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { getFileTree } from '../file-tree.js';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch {}
  }
  dirs.length = 0;
});

describe('getFileTree', () => {
  it('returns files sorted by mtime descending', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'caliber-ft-'));
    dirs.push(tmp);

    fs.writeFileSync(path.join(tmp, 'a.ts'), 'a');
    fs.writeFileSync(path.join(tmp, 'b.ts'), 'b');
    const tree = getFileTree(tmp);
    expect(tree).toHaveLength(2);
  });
});
```

### Example 3: Testing with module mocking and factory functions (index.test.ts pattern)

**User asks**: "Write tests for the provider factory that instantiates different providers based on config."

**Actions taken**:
1. Create `src/llm/__tests__/index.test.ts`
2. Use `vi.unmock('../index.js')` to test the real module
3. Create mock classes in `vi.hoisted()`
4. Mock dependencies (config, provider classes)
5. Test provider selection logic
6. Use `resetProvider()` between tests to clear cached instances

**Result**:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.unmock('../index.js');

const { mockLoadConfig, MockAnthropicProvider } = vi.hoisted(() => {
  class MockAnthropicProvider {
    config: unknown;
    call = vi.fn();
    constructor(c: unknown) { this.config = c; }
  }
  return {
    mockLoadConfig: vi.fn(),
    MockAnthropicProvider,
  };
});

vi.mock('../config.js', () => ({
  loadConfig: () => mockLoadConfig(),
}));

vi.mock('../anthropic.js', () => ({
  AnthropicProvider: MockAnthropicProvider,
}));

import { getProvider, resetProvider } from '../index.js';

describe('getProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetProvider();
  });

  it('creates AnthropicProvider for anthropic config', () => {
    mockLoadConfig.mockReturnValue({
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      apiKey: 'sk-test',
    });
    const provider = getProvider();
    expect(provider).toBeInstanceOf(MockAnthropicProvider);
  });
});
```

## Common Issues

**"Cannot find module" when running tests**
- **Cause**: `vi.mock()` called after the import statement
- **Fix**: Move all `vi.mock()` and `vi.unmock()` calls to the TOP of the file, before any `import` statements

**Environment variable persists across tests**
- **Cause**: `beforeEach` assigns by reference instead of copying: `process.env = originalEnv`
- **Fix**: Create a copy in `beforeEach`: `process.env = { ...originalEnv }; delete process.env.VAR`

**Temporary files not cleaned up, filling disk**
- **Cause**: `afterEach` not called or temp paths not tracked
- **Fix**: Use centralized cleanup array: `dirs: string[] = []` pushed to in tests, cleaned in `afterEach` with `fs.rmSync(..., { recursive: true, force: true })`

**Mock return value from previous test bleeds into next test**
- **Cause**: `vi.clearAllMocks()` not called in `beforeEach`
- **Fix**: Add `vi.clearAllMocks()` as first statement in `beforeEach`

**"vi.mocked() is not a function" when accessing mock calls**
- **Cause**: Trying to use `vi.mocked()` on a non-mocked module
- **Fix**: Ensure the module is mocked with `vi.mock()` before importing, then cast: `const mockFn = vi.mocked(importedFn)`

**Test passes locally but fails in CI**
- **Cause**: Tests rely on real file system or network (not mocked)
- **Fix**: Check if temp files are being created in real directories instead of mocked ones. Verify all external calls use `vi.mock()` for fs/http/exec

**Coverage threshold failures: "lines not covered", "statements not covered"**
- **Cause**: Branches or error paths not tested
- **Fix**: Run `pnpm test:coverage` locally to see untested lines. Add `it()` tests for error cases, edge conditions, and branches that return different values
- **Example**: If `if (x) return 'a'; else return 'b';` has 0% branch coverage, add tests: one with x=true, one with x=false

**"expected 1 error but got 0" when testing error throws**
- **Cause**: Error not actually thrown, or thrown asynchronously
- **Fix**: For sync functions: `expect(() => fn()).toThrow('message')`. For async: `expect(async () => { await fn() }).rejects.toThrow('message')` or use `await expect(promise).rejects.toThrow()`

**Mock factory returns undefined**
- **Cause**: `vi.hoisted()` variables used before definition in the same block
- **Fix**: Ensure `vi.hoisted()` block returns all factories, and `vi.mock()` blocks use them after the hoisted definition

**Test flakes (sometimes passes, sometimes fails)**
- **Cause**: Timing issues or file system race conditions in cleanup
- **Fix**: For file cleanup, use `{ force: true }` in `rmSync`. For timing, avoid `setTimeout`; use `vi.useFakeTimers()` and `vi.runAllTimers()` if needed. Check for leftover files from previous test runs in `beforeEach`