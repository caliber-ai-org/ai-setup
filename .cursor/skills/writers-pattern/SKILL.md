---
name: writers-pattern
description: Adds a new platform writer in src/writers/ following existing patterns (claude, cursor, codex). Generates platform-specific CLAUDE.md, .cursor/rules/, or AGENTS.md configs and integrates with writeSetup(). Use when adding support for a new agent platform or AI tool. Trigger phrases: 'add platform', 'new writer', 'support new agent', 'integrate with X'. Do NOT use for modifying existing writers or one-off file generation.
---
# Writers Pattern

## Critical

- Writers MUST return `string[]` (array of file paths written)
- Each writer lives in `src/writers/{platform}/index.ts` with a named export `writeSetup(setup: WriteSetup): Promise<string[]>`
- Writers are registered in `src/writers/index.ts` in the `writers` Map and exported from `getWriters()`
- All writers follow the exact signature: `(setup: WriteSetup) => Promise<string[]>`
- Test files go in `src/writers/{platform}/__tests__/` matching vitest conventions
- Writers are async and must handle file I/O via fs promises (not sync)

## Instructions

**Step 1: Study existing writers**
Read `src/writers/claude/index.ts`, `src/writers/cursor/index.ts`, and `src/writers/codex/index.ts` to understand:
- Input: `WriteSetup` type from `src/writers/types.ts`
- Output: `Promise<string[]>` (list of written file paths)
- File structure: how each platform writes configs to project root
- Integration: how they call staging functions (`ensureStaged()`, `writeFile()`)

Verify the `WriteSetup` type includes: `claudeMd`, `rules`, `agents`, `hooks`, `skills`, `manifest`.

**Step 2: Create platform directory**
Create `src/writers/{platform}/` with `index.ts` and `__tests__/` subdirectory.

Example structure for `openai-gpt` platform:
```
src/writers/openai-gpt/
├── index.ts
└── __tests__/
    └── openai-gpt.test.ts
```

**Step 3: Implement writeSetup() export**
Write the function signature matching claude/cursor/codex. Follow this template:
```typescript
import { WriteSetup } from '../types.js';
import { ensureStaged, writeFile } from '../staging.js';

export async function writeSetup(setup: WriteSetup): Promise<string[]> {
  const written: string[] = [];
  
  // 1. Write platform-specific config file(s)
  // Example: .openai/gpt-rules.json or similar
  if (setup.rules.length > 0) {
    const filePath = '.openai/gpt-rules.json';
    await writeFile(filePath, JSON.stringify(setup.rules, null, 2));
    written.push(filePath);
  }
  
  // 2. Integrate hooks if platform supports them
  if (setup.hooks && setup.hooks.length > 0) {
    // Write hooks in platform-specific location
  }
  
  // 3. Stage files if setup.manifest exists
  if (setup.manifest) {
    await ensureStaged(written, setup.manifest);
  }
  
  return written;
}
```

Verify each write operation appends to `written[]` BEFORE returning.

**Step 4: Register writer in src/writers/index.ts**
Add to the `writers` Map:
```typescript
writers.set('openai-gpt', () => import('./openai-gpt/index.js').then(m => m.writeSetup));
```

Verify export from `getWriters()` function includes the new platform.

**Step 5: Write tests in __tests__/index.test.ts**
Follow vitest patterns from existing tests:
- Mock `WriteSetup` with realistic rules/hooks/agents
- Test file path generation (verify `written[]` matches expected files)
- Test error handling (e.g., writeFile failures)
- Test integration with `ensureStaged()` if applicable

Example:
```typescript
import { describe, it, expect, vi } from 'vitest';
import { writeSetup } from '../index.js';

describe('openai-gpt writer', () => {
  it('writes rules to .openai/gpt-rules.json', async () => {
    const setup = { rules: ['rule1'], manifest: undefined };
    const written = await writeSetup(setup as any);
    expect(written).toContain('.openai/gpt-rules.json');
  });
});
```

**Step 6: Run tests and type check**
Execute:
```bash
npm test -- src/writers/{platform}/__tests__/
npx tsc --noEmit
```

Verify no type errors and all tests pass.

## Examples

**User says:** "Add support for GitHub Copilot (new platform)"

**Actions:**
1. Create `src/writers/github-copilot/index.ts` (already exists, so this is example-only)
2. Implement `writeSetup()` that writes `.copilot/rules.md` from `setup.rules`
3. Add to `src/writers/index.ts`: `writers.set('github-copilot', ...)`
4. Write tests verifying rules are written to correct path
5. Verify `npm test` passes and no TypeScript errors

**Result:** New writer integrated; `getWriters()` now includes `github-copilot`; can be used by `refresh` and `regenerate` commands.

## Common Issues

**"Cannot find module src/writers/{platform}"**
- Verify directory exists and `index.ts` is in it
- Check import path uses `.js` extension per ESM convention
- Run `npm run build` to compile TypeScript

**"writeSetup is not a named export"**
- Ensure function is exported as `export async function writeSetup(...)`
- Do NOT use default export; writers are imported by name in `src/writers/index.ts`

**"written array is empty but files were created"**
- Every `writeFile()` call must append to `written[]` before returning
- Do NOT forget to push file paths to array
- Example: `written.push(filePath)` after each file operation

**"Tests fail with 'ensureStaged not defined'"**
- Verify import: `import { ensureStaged } from '../staging.js'`
- Check staging.ts exports the function
- Mock `fs` if testing file I/O (see vitest setup in `src/test/setup.ts`)

**"Type 'WriteSetup' does not match signature"**
- Verify `WriteSetup` is imported from `../types.js`
- Ensure function signature is exactly: `(setup: WriteSetup) => Promise<string[]>`
- Do NOT add optional parameters or change return type