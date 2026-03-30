---
name: writers-pattern
description: Add a new platform writer in src/writers/ that writes agent config files. Generates a writer module matching claude/index.ts, cursor/index.ts, codex/index.ts pattern. Each writer returns string[] of written paths and integrates with writeSetup() in src/writers/index.ts. Use when: 'add platform support', 'new writer for X agent', 'support Y in caliber'. Do NOT use for: modifying existing writers, changing scoring logic, or LLM provider setup.
---
# Writers Pattern

## Critical

- **All writers are async functions** that take `(config: ResolvedCaliber, options: WriteOptions) => Promise<string[]>`
- **Always return the array of written file paths**. This integrates with `src/writers/index.ts` for manifest tracking and backup.
- **Follow the exact import structure** from existing writers: `import type { ResolvedCaliber } from '../types.js'` and `import type { WriteOptions } from './index.js'`
- **Place the new writer in its own directory** at `src/writers/{platform-name}/index.ts` (e.g., `src/writers/jetbrains/index.ts`)
- **Validate that the writer is exported from `src/writers/index.ts`** before testing. The main writer exports (claude, cursor, codex) must be added to the switch statement in the `writeSetup()` function.
- **Create a test file at `src/writers/{platform-name}/__tests__/index.test.ts`** following the Vitest pattern used in existing writer tests.

## Instructions

### Step 1: Study the existing writer pattern
Examine `src/writers/claude/index.ts`, `src/writers/cursor/index.ts`, or `src/writers/codex/index.ts`.
- Note the function signature: `export default async function writeWriter(config: ResolvedCaliber, options: WriteOptions): Promise<string[]>`
- Identify the config properties being used (e.g., `config.paths.claude`, `config.content.claude`)
- Observe how paths are constructed with `path.join()` and how content is written with `fs.promises.writeFile()`
- Note error handling: wrap file operations in try-catch, log errors, and always include the file path in the return array on success

**Verify**: You can explain what properties from `ResolvedCaliber` and `WriteOptions` are available before proceeding.

### Step 2: Create the writer directory and index file
Create `src/writers/{platform-name}/index.ts`:
```typescript
import path from 'path';
import { promises as fs } from 'fs';
import type { ResolvedCaliber } from '../../types.js';
import type { WriteOptions } from '../index.js';

export default async function write{PlatformName}(
  config: ResolvedCaliber,
  options: WriteOptions,
): Promise<string[]> {
  const writtenPaths: string[] = [];
  const { workspaceRoot, dryRun, verbose } = options;

  try {
    // Get config content (passed from writeSetup)
    const content = config.content['{platform-key}'] || '';
    if (!content) {
      if (verbose) console.log(`No content for {platform-name}`);
      return writtenPaths;
    }

    // Determine output path from config.paths or use default
    const outputPath = path.join(workspaceRoot, config.paths['{platform-key}'] || '{default-path}');

    // Write file if not in dry run
    if (!dryRun) {
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, content, 'utf-8');
    }

    writtenPaths.push(outputPath);
    if (verbose) console.log(`Wrote {platform-name} config to ${outputPath}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Failed to write {platform-name} config: ${message}`);
  }

  return writtenPaths;
}
```

**Verify**: File exists at correct path, function signature matches pattern, imports are correct.

### Step 3: Export the writer from src/writers/index.ts
Open `src/writers/index.ts` and locate the `writeSetup()` function. Add a case for the new platform:
```typescript
case '{platform-key}':
  writeResult = await write{PlatformName}(config, options);
  break;
```

Also add the import at the top:
```typescript
import write{PlatformName} from './{platform-name}/index.js';
```

Locate the `writerMap` object and add an entry:
```typescript
{platform-key}: write{PlatformName},
```

**Verify**: The new writer is callable from `writeSetup()` and `writerMap` is complete.

### Step 4: Create a test file
Create `src/writers/{platform-name}/__tests__/index.test.ts`:
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { memfs } from 'memfs';
import path from 'path';
import write{PlatformName} from '../index.js';
import type { ResolvedCaliber, WriteOptions } from '../../types.js';

describe('write{PlatformName}', () => {
  let vol: ReturnType<typeof memfs>['vol'];
  let workspaceRoot: string;

  beforeEach(() => {
    const { fs: memfsFs } = memfs();
    vol = memfsFs;
    workspaceRoot = '/test-workspace';
  });

  it('writes {platform-name} config to correct path', async () => {
    const config: ResolvedCaliber = {
      paths: { '{platform-key}': '{expected-path}' },
      content: { '{platform-key}': '# Test Config' },
    } as unknown as ResolvedCaliber;

    const options: WriteOptions = {
      workspaceRoot,
      dryRun: false,
      verbose: false,
    };

    const written = await write{PlatformName}(config, options);

    expect(written).toContain(path.join(workspaceRoot, '{expected-path}'));
  });

  it('returns empty array when no content provided', async () => {
    const config: ResolvedCaliber = {
      paths: {},
      content: {},
    } as unknown as ResolvedCaliber;

    const options: WriteOptions = {
      workspaceRoot,
      dryRun: false,
      verbose: false,
    };

    const written = await write{PlatformName}(config, options);

    expect(written).toEqual([]);
  });
});
```

**Verify**: Test file runs without errors. Run `npm run test -- src/writers/{platform-name}/__tests__/`.

### Step 5: Integrate with content generation
If the writer requires generated content, add a case in `src/ai/generate.ts` that populates `config.content['{platform-key}']`. If using existing content paths from `ResolvedCaliber.paths`, no additional generation step is needed.

**Verify**: The new writer receives content via the config object, either from existing paths or generated content.

## Examples

### User: "Add support for VS Code Settings Sync in Caliber"

**Actions taken**:
1. Create `src/writers/vscode-settings/index.ts`
2. Writer reads `config.content.vscodeSettings` (populated by `src/ai/generate.ts`)
3. Writes to `.vscode/settings.json` or path specified in `config.paths.vscodeSettings`
4. Returns `['/path/to/.vscode/settings.json']`
5. Add to `src/writers/index.ts`: `import writeVscodeSettings from './vscode-settings/index.js'`
6. Add case in `writeSetup()`: `case 'vscodeSettings': writeResult = await writeVscodeSettings(config, options);`
7. Create test in `src/writers/vscode-settings/__tests__/index.test.ts`

**Result**: `caliber refresh` now writes VS Code settings alongside CLAUDE.md and .cursor/rules/.

### User: "Add a new writer for GitHub Copilot Chat context"

**Actions taken**:
1. Study `src/writers/github-copilot/index.ts` to understand existing Copilot support
2. Create `src/writers/copilot-chat/index.ts` for Chat-specific context
3. Writer reads `config.content.copilotChat` and writes to `.github/copilot-chat.md`
4. Export from `src/writers/index.ts` with import and writeSetup case
5. Test with `npm run test`

**Result**: New Copilot Chat context file is written as part of the config sync workflow.

## Common Issues

**Issue**: `TypeError: Cannot read property 'content' of undefined`
- **Cause**: Writer function not receiving `ResolvedCaliber` object properly from `writeSetup()`
- **Fix**: 1. Verify the writer is called with `config` parameter in `writeSetup()`. 2. Check that `ResolvedCaliber` type is imported correctly. 3. Log `config` at the start of the writer to confirm structure.

**Issue**: `ENOENT: no such file or directory, open '/path/to/file'`
- **Cause**: Parent directory doesn't exist
- **Fix**: Always call `fs.mkdir(path.dirname(outputPath), { recursive: true })` before writing. This creates parent directories automatically.

**Issue**: Writer returns empty array even though file should exist
- **Cause**: Config.content is empty or undefined, function returns early
- **Fix**: 1. Check that content is being populated in `src/ai/generate.ts` or passed via config.content. 2. Add verbose logging: `if (verbose) console.log('content:', content)` to debug. 3. Verify the platform key matches exactly (case-sensitive).

**Issue**: Test fails with `memfs not set up correctly`
- **Cause**: Mock filesystem not initialized before test
- **Fix**: Ensure `beforeEach` runs before each test and initializes `memfs()` properly. Verify `vi.mock()` patches are applied if mocking `fs.promises`.

**Issue**: `Module not found: src/writers/{platform-name}/index.js`
- **Cause**: Import path in `src/writers/index.ts` is wrong or file doesn't exist
- **Fix**: 1. Verify file exists at `src/writers/{platform-name}/index.ts`. 2. Double-check import path uses `.js` extension (ESM). 3. Run `npm run build` and check for TypeScript errors.