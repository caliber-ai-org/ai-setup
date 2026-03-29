---
name: writers-pattern
description: Add a new platform writer in src/writers/ that writes agent config files. Generates a writer module matching claude/index.ts, cursor/index.ts, codex/index.ts pattern. Each writer returns string[] of written paths and integrates with writeSetup() in src/writers/index.ts. Use when: 'add platform support', 'new writer for X agent', 'support Y in caliber'. Do NOT use for: modifying existing writers, changing scoring logic, or LLM provider setup.
---
# Writers Pattern

## Critical

- Every writer MUST export a default async function with signature `(setup: WriteSetup) => Promise<string[]>`
- Return value MUST be an array of file paths written (used for git diff, undo, telemetry)
- Writers are registered in `src/writers/index.ts` via `writeSetup()` — verify registration exists before testing
- Platform naming MUST match the agent type exactly: claude, cursor, codex, github-copilot (kebab-case in filenames, camelCase in imports)
- Verify `WriteSetup` type matches current interface in `src/writers/index.ts` before importing

## Instructions

1. **Create the writer file** at `src/writers/{platform}/index.ts`
   - Use existing `src/writers/claude/index.ts` as the template
   - Verify your platform name matches agent type (e.g., `github-copilot` for GitHub Copilot)
   - Copy the exact import structure and types from an existing writer

2. **Define the write function** with WriteSetup parameter
   - Import: `import type { WriteSetup } from '../index.js'`
   - Function signature: `export default async function write(setup: WriteSetup): Promise<string[]>`
   - Initialize: `const writtenPaths: string[] = []`
   - Platform-specific config paths vary (e.g., Claude uses `.claude/rules/`, Cursor uses `.cursor/rules/`)

3. **Write config files** following platform conventions
   - Call `setup.writeFile(filePath, content)` for each file
   - Push result path to `writtenPaths` after each write
   - Example: `writtenPaths.push(await setup.writeFile('.claude/rules/example.mdc', content))`
   - Check existing writers for platform-specific directory structures (Claude: `.claude/`, Cursor: `.cursor/`, GitHub Copilot: `.github-copilot/`)

4. **Handle platform-specific logic**
   - Access setup data: `setup.claude` (string), `setup.cursor` (string), `setup.codex` (string), `setup.githubCopilot` (string), `setup.manifest` (object)
   - Filter content based on platform (e.g., only write if `setup.yourPlatform` is truthy)
   - Use `setup.backup(filePath)` before overwriting existing files (returns backup path)

5. **Return written paths**
   - `return writtenPaths` at the end of the function
   - Paths are used for git diffs, telemetry, and undo operations
   - Verify list matches all files actually written

6. **Register in src/writers/index.ts**
   - Import: `import writePlatform from './platform/index.js'`
   - Add to `writeSetup()` function: `const platformPaths = await writePlatform(setup)`
   - Merge into final array: `allPaths.push(...platformPaths)`
   - Test: Run `npm run build && npm test` to verify no import errors

## Examples

**User says:** "Add support for new agent 'my-ai-assistant'"

**Actions taken:**
1. Create `src/writers/my-ai-assistant/index.ts` (directory name matches agent type)
2. Copy function signature from `src/writers/claude/index.ts`
3. Replace `.claude/` paths with `.my-ai-assistant/` or platform-appropriate directory
4. Write config files using `setup.writeFile()`
5. Register in `src/writers/index.ts` under `writeSetup()`
6. Run `npm run build && npm test` to verify

**Result:** New writer generates agent configs for 'my-ai-assistant' platform, integrated into publish flow.

## Common Issues

**Error: "Cannot find module './platform/index.js'" during build**
- Verify file exists at `src/writers/{platform}/index.ts` (exact name matters)
- Check import in `src/writers/index.ts` uses correct path with `.js` extension
- Run `npm run build` to regenerate dist/

**Function not called during publish**
- Verify `writeSetup()` in `src/writers/index.ts` includes line: `const platformPaths = await writePlatform(setup)`
- Check import statement is present: `import writePlatform from './platform/index.js'`
- Confirm function is exported as default: `export default async function write(...)`

**Return value is empty or incomplete**
- Verify every `setup.writeFile()` call pushes to `writtenPaths`: `writtenPaths.push(await setup.writeFile(...))`
- Check all files written are actually returned (don't skip backup files)
- Confirm `return writtenPaths` is at end of function

**WriteSetup type mismatch**
- Open `src/writers/index.ts` and verify current `WriteSetup` interface
- Properties vary by version (e.g., older versions may not have `setup.githubCopilot`)
- Use `setup.manifest` for version-agnostic data
- Check existing writers match current interface