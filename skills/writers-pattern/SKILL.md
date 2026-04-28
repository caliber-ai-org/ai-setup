---
name: writers-pattern
description: Add a new platform writer module in src/writers/ that generates and writes agent config files for a supported platform. Each writer exports a function that accepts a config interface, creates directories (rules/, skills/, mcp configs), writes files with proper formatting and frontmatter, and returns string[] of written file paths. Use when adding platform support for a new agent, integrating a new code AI tool, or extending caliber to support new targets. Do NOT use for modifying existing writers, refactoring scoring logic, or changing how writers are invoked.
paths:
  - src/writers/*/index.ts
  - src/writers/__tests__/*.test.ts
  - src/writers/index.ts
---
# Platform Writer Pattern

## Critical

- **Every writer MUST**:
  1. Export a single named function: `write<Platform>Config(config: <PlatformConfig>): string[]`
  2. Accept a platform-specific config interface defining what content to write
  3. Return `string[]` of all written file paths (used by manifest and progress display)
  4. Create parent directories with `fs.mkdirSync(dir, { recursive: true })` before writing files
  5. Wrap skill frontmatter exactly as shown in Step 4 (YAML between `---` markers)
  6. NOT modify files outside the intended platform directories (e.g., Claude writer only touches `.claude/`, `CLAUDE.md`, `.mcp.json`)

- **Integration point**: Every writer MUST be imported and called in `src/writers/index.ts` within the `writeSetup()` function. Missing this step means the writer will never execute.

- **Validation before Step 1**: Verify the platform name is unique (`ls src/writers/` shows no `<platform>/index.ts`). If it exists, you are modifying, not adding.

## Instructions

### Step 1: Define the Platform Config Interface
Verify the platform name is unique (see Critical). Create `src/writers/<platform>/index.ts`.

At the top of the file, define a config interface that describes all content the writer accepts. The interface MUST include:
- A main markdown/text file (e.g., `claudeMd`, `cursorrules`, `agentsMd`, `instructions`)
- Optional nested arrays: `rules`, `skills`, `mcpServers`, `instructionFiles`, etc.
- Each rule/skill/file has at minimum: `name` or `filename`, `content`, and for skills, `description`

Example (matching GitHub Copilot pattern already in codebase):
```typescript
interface CopilotConfig {
  instructions: string;  // Main content
  instructionFiles?: Array<{ filename: string; content: string }>;
}
```

**Validation**: Confirm the interface property names match platform conventions (e.g., Claude uses `claudeMd`, Cursor uses `cursorrules`). Check existing writers: `src/writers/claude/index.ts` line 9, `src/writers/cursor/index.ts` line 9, `src/writers/codex/index.ts` line 5.

### Step 2: Implement the Writer Export Function
Export a function named `write<Platform>Config(config: <PlatformConfig>): string[]` that:

1. Initialize an empty `written: string[] = []` array to track all written paths.
2. For the **main config file** (e.g., `CLAUDE.md` for Claude, `.cursorrules` for Cursor):
   - Wrap the content with **platform-specific blocks**: Use helpers from `src/writers/pre-commit-block.ts`
   - Common blocks: `appendPreCommitBlock(content, platform)`, `appendLearningsBlock(content)`, `appendSyncBlock(content)`
   - Examples from actual codebase:
     - **Claude** (`src/writers/claude/index.ts` line 19-22): `appendSyncBlock(appendLearningsBlock(appendPreCommitBlock(config.claudeMd)))`
     - **Cursor** (`src/writers/cursor/index.ts` line 19-22): No sync block; injects rules instead (pre-commit, learnings, sync as separate files)
     - **Codex** (`src/writers/codex/index.ts` line 13-16): `appendLearningsBlock(appendPreCommitBlock(config.agentsMd, 'codex'))`
     - **Copilot** (`src/writers/github-copilot/index.ts` line 19-22): `appendSyncBlock(appendLearningsBlock(appendPreCommitBlock(config.instructions, 'copilot')))`
   - Write to the exact path (e.g., `fs.writeFileSync('CLAUDE.md', wrappedContent)`) and push to `written`.

3. For **rules** (if applicable): Platform convention determines directory.
   - Cursor uses `.cursor/rules/`, Claude uses `.claude/rules/` (see `src/writers/index.ts` lines 123-126 and 135-137)
   - For each rule: create the directory, write to `<dir>/<rule.filename>`, push path to `written`
   - **Cursor special case** (`src/writers/cursor/index.ts` line 24-27): Cursor injects three system rules:
     ```typescript
     const preCommitRule = getCursorPreCommitRule();
     const learningsRule = getCursorLearningsRule();
     const syncRule = getCursorSyncRule();
     const allRules = [...(config.rules || []), preCommitRule, learningsRule, syncRule];
     ```

4. For **skills**: Write with YAML frontmatter.
   - Directory pattern: `.claude/skills/<skillName>/SKILL.md`, `.cursor/skills/<skillName>/SKILL.md`, `.agents/skills/<skillName>/SKILL.md`, `.opencode/skills/<skillName>/SKILL.md`
   - Frontmatter format (exact indentation from `src/writers/claude/index.ts` line 40-47):
     ```
     ---
     name: <skill.name>
     description: <skill.description>
     paths:
       - <optional path pattern 1>
       - <optional path pattern 2>
     ---
     <skill.content>
     ```
   - For **Opencode** (`src/writers/opencode/index.ts` line 30): Use `buildSkillContent(skill)` from `src/lib/builtin-skills.js` instead of manual frontmatter.
   - Create directory with `fs.mkdirSync(skillDir, { recursive: true })`, write skill, push to `written`

5. For **MCP Servers** (if applicable): Write/merge JSON at platform-specific path.
   - **Claude** (`src/writers/claude/index.ts` line 54-65): `.mcp.json` at root
   - **Cursor** (`src/writers/cursor/index.ts` line 54-69): `.cursor/mcp.json`
   - Pattern: Read existing servers (if file exists, try to parse JSON with try/catch), merge with new servers using spread operator `{ ...existingServers, ...config.mcpServers }`, write merged object
   - Wrap in `{ mcpServers: mergedServers }` and output as pretty-printed JSON: `JSON.stringify(wrapped, null, 2)`

6. For **instruction files** (GitHub Copilot, `src/writers/github-copilot/index.ts` line 26-33): Write to `.github/instructions/` directory.
   - Create directory, iterate files, write each to `<dir>/<file.filename>`, push paths

Return the `written` array.

**Validation**: Confirm all file write operations are synchronous (`fs.writeFileSync`, `fs.mkdirSync`). Ensure every written path is added to the array. No async operations allowed.

### Step 3: Add Type Exports (if complex interface)
If the config interface may be reused elsewhere (e.g., in `src/writers/index.ts` for the `AgentSetup` type), export the interface from the module.

**Validation**: Check `src/writers/index.ts` lines 15-19 to see if new agent setup params are needed.

### Step 4: Import and Register in `src/writers/index.ts`
Open `src/writers/index.ts`. At the top (around line 2-6), add:
```typescript
import { write<Platform>Config } from './<platform>/index.js';
```

Update the `AgentSetup` interface (around line 12-20):
- Add `'<platform>'` to the `targetAgent` tuple (line 13: `('claude' | 'cursor' | 'codex' | 'opencode' | 'github-copilot' | '<platform>')[]`)
- Add a new property: `<platform>?: Parameters<typeof write<Platform>Config>[0];`

Update `getFilesToWrite()` function (starting line 117): Add a new conditional block:
```typescript
if (setup.targetAgent.includes('<platform>') && setup.<platform>) {
  files.push('<main-config-file>');
  if (setup.<platform>.rules) {
    for (const r of setup.<platform>.rules) files.push(`<rules-dir>/${r.filename}`);
  }
  if (setup.<platform>.skills) {
    for (const s of setup.<platform>.skills) files.push(`<skills-dir>/${s.name}/SKILL.md`);
  }
  // ... repeat for other config types (mcpServers, instructionFiles, etc.)
}
```

Update `writeSetup()` function (starting line 22): Add a new conditional block before the return (after line 56):
```typescript
if (setup.targetAgent.includes('<platform>') && setup.<platform>) {
  written.push(...write<Platform>Config(setup.<platform>));
}
```

**Validation**: Confirm the function call order in `writeSetup()` is consistent (line 37-56): claude → cursor → codex → opencode → github-copilot → (new platform). This ensures AGENTS.md is written once if shared (as with Codex/Opencode, see line 50-52).

### Step 5: Add Tests
Create `src/writers/__tests__/<platform>.test.ts` following the vitest pattern in `src/writers/__tests__/codex.test.ts`:

1. Mock `fs` module: `vi.mock('fs')`
2. Mock return values in `beforeEach`: `vi.mocked(fs.existsSync).mockReturnValue(false)`
3. Test that:
   - Main config file is written to correct path
   - Returned array includes all written paths
   - Directories are created before file writes (use `.toHaveBeenCalledWith(path, { recursive: true })`)
   - Skills have correct frontmatter format (check `vi.mocked(fs.writeFileSync).mock.calls`)
   - MCP/instruction files are merged/created correctly
   - Pre-commit/learnings/sync blocks are included in main file (expect content `.toContain('caliber:managed:pre-commit')`)

Run: `npm test -- src/writers/__tests__/<platform>.test.ts`

**Validation**: All tests pass. Confirm mocked file operations match actual file system structure.

### Step 6: Update `detectSyncedAgents()` in `src/commands/refresh.ts` (Optional)
If the platform writes config files with distinct naming (e.g., `.newplatform/`), update the detection logic around line 68-77 so end-user refresh output correctly identifies the synced platform:

```typescript
if (joined.includes('.newplatform/') || joined.includes('newplatform-config')) {
  agents.push('<Platform Name>');
}
```

**Validation**: Run `npm run refresh` and confirm the summary message lists the new platform.

## Examples

### Example 1: Add a hypothetical "DevCode" platform writer

**User says**: "Add support for DevCode, a new agent that reads config from `.devcode/settings.md` and `.devcode/rules/` directory."

**Actions taken**:

1. Create `src/writers/devcode/index.ts` (matching pattern from `src/writers/claude/index.ts`):
   ```typescript
   import fs from 'fs';
   import path from 'path';
   import { appendPreCommitBlock, appendLearningsBlock } from '../pre-commit-block.js';

   interface DevcodeConfig {
     settingsMd: string;
     rules?: Array<{ filename: string; content: string }>;
   }

   export function writeDevcodeConfig(config: DevcodeConfig): string[] {
     const written: string[] = [];

     fs.writeFileSync(
       '.devcode/settings.md',
       appendLearningsBlock(appendPreCommitBlock(config.settingsMd, 'devcode'))
     );
     written.push('.devcode/settings.md');

     if (config.rules?.length) {
       const rulesDir = path.join('.devcode', 'rules');
       if (!fs.existsSync(rulesDir)) fs.mkdirSync(rulesDir, { recursive: true });
       for (const rule of config.rules) {
         const rulePath = path.join(rulesDir, rule.filename);
         fs.writeFileSync(rulePath, rule.content);
         written.push(rulePath);
       }
     }

     return written;
   }
   ```

2. Update `src/writers/index.ts`:
   - Line 2: Add `import { writeDevcodeConfig } from './devcode/index.js';`
   - Line 13: Change `targetAgent` tuple to include `'devcode'`
   - Line 19: Add `devcode?: Parameters<typeof writeDevcodeConfig>[0];`
   - Line 117+: Add devcode block to `getFilesToWrite()` (match Codex pattern lines 144-149)
   - Line 37+: Add devcode block to `writeSetup()` (match Codex pattern lines 45-47)
   - Line 68+: Update `detectSyncedAgents()` to check for `.devcode/`

3. Create `src/writers/__tests__/devcode.test.ts` (matching `src/writers/__tests__/codex.test.ts`):
   ```typescript
   import { describe, it, expect, vi, beforeEach } from 'vitest';
   import fs from 'fs';
   import path from 'path';

   vi.mock('fs');

   import { writeDevcodeConfig } from '../devcode/index.js';

   describe('writeDevcodeConfig', () => {
     beforeEach(() => {
       vi.clearAllMocks();
       vi.mocked(fs.existsSync).mockReturnValue(false);
     });

     it('writes settings.md and rules', () => {
       const config = {
         settingsMd: '# DevCode Config',
         rules: [{ filename: 'style.md', content: 'Style rules' }],
       };
       const written = writeDevcodeConfig(config);
       expect(written).toContain('.devcode/settings.md');
       expect(written).toContain(path.join('.devcode', 'rules', 'style.md'));
     });
   });
   ```

4. Run: `npm test && npm run build`

**Result**: Caliber now generates `.devcode/settings.md` and rules on `caliber refresh` and `caliber init`.

## Common Issues

**Issue**: "TypeError: write<Platform>Config is not a function"
- **Fix**: Verify the function is **exported** (not just defined). Check `export function write<Platform>Config(...)` in the writer file. Missing `export` is a common mistake.

**Issue**: "ENOENT: no such file or directory, open '.platform/config.md'"
- **Fix**: The parent directory was not created. Ensure `fs.mkdirSync(parentDir, { recursive: true })` is called **before** `fs.writeFileSync(filePath, content)`. See correct order in `src/writers/claude/index.ts` lines 26-27.

**Issue**: "Skill file has no frontmatter / malformed YAML"
- **Fix**: Verify frontmatter format is exactly (no extra blank lines):
  ```
  ---\nname: <name>\ndescription: <desc>\n---\n<content>
  ```
  Use `[...].join('\n')` and test with a single skill first. Compare with working code in `src/writers/claude/index.ts` lines 40-48.

**Issue**: "MCP servers not merging, file is truncated"
- **Fix**: Confirm the merge pattern from `src/writers/claude/index.ts` line 54-65: read existing JSON (with try/catch), parse safely, merge with spread operator `{ ...existingServers, ...config.mcpServers }`, then write the merged object. Do NOT overwrite — always merge.

**Issue**: "new writer is called but written files are empty array"
- **Fix**: Verify the writer function returns the `written` array. Check that every file operation pushes to `written`. Missing a `written.push(filePath)` after `fs.writeFileSync()` is the most common error. See `src/writers/codex/index.ts` lines 17 and 32 for correct pattern.

**Issue**: "Tests mock fs but actual files are created in .tmp/ or cause permission errors"
- **Fix**: Ensure `vi.mock('fs')` is at the top of the test file before any imports. All `fs` operations will be mocked and return mock values from `beforeEach` setup. See `src/writers/__tests__/codex.test.ts` line 5.

**Issue**: "Cursor pre-commit rule not applied, or learnings block missing"
- **Fix**: Cursor injects system rules during the write, unlike Claude which uses block appenders. Check that `getCursorPreCommitRule()`, `getCursorLearningsRule()`, and `getCursorSyncRule()` are called and concatenated with user rules **before** iterating (see `src/writers/cursor/index.ts` lines 24-27). Claude and Codex use block-append helpers instead.