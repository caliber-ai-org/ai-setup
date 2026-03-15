---
name: caliber-testing
description: Testing patterns for @rely-ai/caliber. Use when writing or fixing Vitest tests, understanding the LLM mock setup, checking coverage configuration, or structuring test files for commands, scoring, or LLM utilities.
---
# Testing in Caliber

Caliber uses Vitest with a globally mocked LLM provider — no real API calls in tests.

## Running Tests

```bash
npm run test                                           # all tests
npm run test:coverage                                  # with v8 coverage
npx vitest run src/scoring/__tests__/accuracy.test.ts  # single file
npx vitest run src/llm/__tests__/                      # entire directory
```

## Setup

- **Config**: `vitest.config.ts` — `environment: node`, `globals: true`, `setupFiles: ['./src/test/setup.ts']`
- **Setup file**: `src/test/setup.ts` — runs before every test file, mocks `llmCall`/`llmJsonCall`/`getProvider`
- **Location**: `src/**/__tests__/*.test.ts`

## LLM Mock

All LLM calls are mocked globally. To customize per-test:

```typescript
import { vi } from 'vitest';
import * as llm from '../../llm/index.js';

vi.spyOn(llm, 'llmCall').mockResolvedValue('mocked response');
vi.spyOn(llm, 'llmJsonCall').mockResolvedValue({ frameworks: ['react'] });
```

## Coverage

Excludes: `src/test/**`, `src/bin.ts`, `src/cli.ts`, `src/commands/**`, `dist/**`

Focus coverage on: `src/llm/`, `src/scoring/`, `src/fingerprint/`, `src/ai/`

## Test Patterns by Module

### Scoring checks (`src/scoring/checks/`)
Pure functions — test with temp directories or mocked `fs`:

```typescript
import { checkAccuracy } from '../../scoring/checks/accuracy.js';

it('passes when documented command exists in package.json', () => {
  // write temp files, call checkAccuracy(), assert Check[]
});
```

### LLM utils (`src/llm/utils.ts`)
Pure functions, no mocking needed:

```typescript
import { extractJson, estimateTokens } from '../../llm/utils.js';

it('extracts JSON from prose-wrapped output', () => {
  const raw = 'Here: {"key": "value"} Done.';
  expect(extractJson(raw)).toBe('{"key": "value"}');
});
```

### Fingerprint (`src/fingerprint/`)
Mock `fs` and `child_process.execSync` for git calls.

### Learner (`src/learner/`)
Use temp directories (`os.tmpdir()`) for event storage tests.
Use `memfs` for filesystem mocking when needed.