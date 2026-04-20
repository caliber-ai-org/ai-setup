---
name: writers-pattern
description: Adds a new platform writer in src/writers/ following existing patterns (claude, cursor, codex). Generates platform-specific CLAUDE.md, .cursor/rules/, or AGENTS.md configs and integrates with writeSetup(). Use when adding support for a new agent platform or AI tool. Trigger phrases: 'add platform', 'new writer', 'support new agent', 'integrate with X'. Do NOT use for modifying existing writers or one-off file generation.
---
# Writers Pattern

## Critical

- Writers MUST return `string[]` (array of file paths written) — **synchronously**, not `Promise<string[]>`
- Each writer lives in `src/writers/{platform}/index.ts` with a named export `write{Platform}Config(config: {PlatformConfig}): string[]`
- Writers are registered in `src/writers/index.ts` within the `writeSetup()` function (not a Map)
- All file I/O uses synchronous `fs` APIs (`fs.writeFileSync`, `fs.mkdirSync`)
- Test files go in `src/writers/__tests__/{platform}.test.ts` (not nested under the writer directory)

## Instructions

**Step 1: Study existing writers**
Read `src/writers/claude/index.ts`, `src/writers/cursor/index.ts`, and `src/writers/codex/index.ts` to understand:
- Input: `WriteSetup` type from `src/writers/types.ts`
- Output: `Promise<string[]>` (list of written file paths)
- File structure: how each platform writes configs to project root
- Integration: how they call staging functions (`ensureStaged()`, `writeFile()`)

Verify the `WriteSetup` type includes: `claudeMd`, `rules`, `agents`, `hooks`, `skills`, `manifest`.

**Step 2: Create platform directory**
Create `src/writers/{platform}/` with `index.ts`.

Example structure for `openai-gpt` platform:
```
src/writers/openai-gpt/
└── index.ts
```

**Step 3: Implement write{Platform}Config() export**
Write the function matching the claude/cursor/codex pattern. Follow this template:
```typescript
import fs from 'fs';
import path from 'path';
import { appendPreCommitBlock, appendLearningsBlock } from '../pre-commit-block.js';

interface OpenaiGptConfig {
  instructions: string;
  rules?: Array<{ filename: string; content: string }>;
  skills?: Array<{ name: string; description: string; content: string }>;
}

export function writeOpenaiGptConfig(config: OpenaiGptConfig): string[] {
  const written: string[] = [];

  // 1. Write main config file
  fs.writeFileSync('.openai/instructions.md', appendLearningsBlock(appendPreCommitBlock(config.instructions, 'openai-gpt')));
  written.push('.openai/instructions.md');

  // 2. Write rules (if any)
  if (config.rules?.length) {
    const rulesDir = path.join('.openai', 'rules');
    fs.mkdirSync(rulesDir, { recursive: true });
    for (const rule of config.rules) {
      const rulePath = path.join(rulesDir, rule.filename);
      fs.writeFileSync(rulePath, rule.content);
      written.push(rulePath);
    }
  }

  return written;
}
```

Verify: function is synchronous; every `fs.writeFileSync` is preceded by `fs.mkdirSync`; every written path is in the returned array.

**Step 4: Register in src/writers/index.ts**
```typescript
import { writeOpenaiGptConfig } from './openai-gpt/index.js';
```

Add to `AgentSetup`:
- Add `'openai-gpt'` to the `targetAgent` tuple
- Add `'openaiGpt'?: Parameters<typeof writeOpenaiGptConfig>[0]`

Add to `writeSetup()` and `getFilesToWrite()`:
```typescript
if (setup.targetAgent.includes('openai-gpt') && setup.openaiGpt) {
  written.push(...writeOpenaiGptConfig(setup.openaiGpt));
}
```

**Step 5: Write tests in src/writers/__tests__/{platform}.test.ts**
Follow the pattern from `src/writers/__tests__/codex.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
vi.mock('fs');
import { writeOpenaiGptConfig } from '../openai-gpt/index.js';

describe('writeOpenaiGptConfig', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(fs.existsSync).mockReturnValue(false); });
  it('writes instructions.md', () => {
    const written = writeOpenaiGptConfig({ instructions: '# Config' });
    expect(written).toContain('.openai/instructions.md');
  });
});
```

**Step 6: Run tests and type check**
```bash
npm test -- src/writers/__tests__/{platform}.test.ts
npx tsc --noEmit
```

Verify no type errors and all tests pass.

## Examples

**User says:** "Add support for GitHub Copilot (new platform)"

**Actions:**
1. Create `src/writers/github-copilot/index.ts` with `GithubCopilotConfig` interface
2. Implement `export function writeGithubCopilotConfig(config: GithubCopilotConfig): string[]` — synchronous, writes `.github/copilot-instructions.md` and `.github/instructions/` files
3. Add to `src/writers/index.ts`: import `{ writeGithubCopilotConfig }`, add to `AgentSetup`, call in `writeSetup()`
4. Create `src/writers/__tests__/github-copilot.test.ts` with `vi.mock('fs')` tests
5. Verify `npm run build && npm test` passes

**Result:** New writer integrated; `writeSetup()` calls `writeGithubCopilotConfig()` when `'github-copilot'` is in `targetAgent`.

## Common Issues

**"TypeError: write{Platform}Config is not a function"**
- Verify function is exported with `export function write{Platform}Config(...)` — no `default`, no `async`
- Check import in `src/writers/index.ts` uses `{ write{Platform}Config }` (named import, `.js` extension)

**"ENOENT: no such file or directory"**
- `fs.mkdirSync(parentDir, { recursive: true })` must be called BEFORE `fs.writeFileSync`
- See `src/writers/claude/index.ts` for the correct order

**"written array is empty but files were created"**
- Every `fs.writeFileSync()` call must be followed by `written.push(filePath)`
- Check every file operation in the writer for a missing push

**"Tests fail with mock not working"**
- `vi.mock('fs')` must be at the top of the test file (before imports)
- Follow pattern from `src/writers/__tests__/codex.test.ts`

**"Type error on AgentSetup"**
- Add platform to `targetAgent` tuple AND add the platform property to `AgentSetup` in `src/writers/index.ts`
- Both must be updated together — missing either causes a type error