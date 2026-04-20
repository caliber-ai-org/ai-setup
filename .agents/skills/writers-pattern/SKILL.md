---
name: writers-pattern
description: Adds a new platform writer in src/writers/ following existing patterns (claude, cursor, codex). Returns string[] of generated file paths. Integrates with writeSetup() orchestration. Use when implementing 'add platform', 'new writer', 'support new agent'. Do NOT use for refactoring existing writers or modifying writers/index.ts exports.
---
# Writers Pattern

## Critical

- Each writer MUST export a **named synchronous** function: `export function write{Platform}Config(config: {PlatformConfig}): string[]`
- Writer MUST return `string[]` of written file paths (NOT `Promise<string[]>`) — all file I/O uses synchronous `fs` APIs
- Writers are called from `writeSetup()` in `src/writers/index.ts`; they must be synchronous to compose correctly
- Writer files live in `src/writers/{platform}/index.ts` with a platform-specific config interface defined in the same file
- Never use default exports — `src/writers/index.ts` imports all writers by their named export

## Instructions

1. **Create directory structure**
   - Create `src/writers/{platform}/index.ts` (main writer)
   - Create `src/writers/{platform}/__tests__/index.test.ts` (test file)
   - Verify directory does not already exist: `ls -la src/writers/{platform}/` should return error

2. **Implement writer function signature**
   - Define a platform-specific config interface at the top of the file (see `src/writers/claude/index.ts` for shape)
   - Export named synchronous function: `export function write{Platform}Config(config: {PlatformConfig}): string[]`
   - Initialize `const written: string[] = []` to track all written paths
   - Use synchronous `fs.writeFileSync` and `fs.mkdirSync` — no async/await
   - Return the `written` array at the end

3. **Implement core write logic**
   - For the main config file: use content-wrapping helpers from `src/writers/pre-commit-block.ts` (e.g., `appendPreCommitBlock`, `appendLearningsBlock`)
   - For rules: create `<platform>/rules/` directory, write each rule, push paths to `written`
   - For skills: create `<platform>/skills/<name>/` directory, write `SKILL.md` with YAML frontmatter, push paths to `written`
   - For MCP servers: read existing JSON (if any), merge with spread operator, write back
   - All writes use `fs.writeFileSync`; all directory creation uses `fs.mkdirSync(dir, { recursive: true })`

4. **Add test file**
   - Create `src/writers/__tests__/{platform}.test.ts` following the vitest pattern in `src/writers/__tests__/codex.test.ts`
   - Mock `fs` module: `vi.mock('fs')`
   - Test that main config file is written to correct path and returned in the array
   - Test skill frontmatter format is correct
   - Verify test runs: `npm test -- src/writers/__tests__/{platform}.test.ts`

5. **Register in src/writers/index.ts**
   - Add import: `import { write{Platform}Config } from './{platform}/index.js'`
   - Add platform to `AgentSetup.targetAgent` tuple
   - Add `{platform}?: Parameters<typeof write{Platform}Config>[0]` to `AgentSetup`
   - Add conditional write block in `writeSetup()` and `getFilesToWrite()`

6. **Verify integration**
   - Run `npm run build` — must compile without errors
   - Run `npm run test` — all tests pass
   - Run `npx tsc --noEmit` — no type errors

## Examples

**User says**: "Add support for a new agent platform called Jetbrains"

**Actions**:
1. Create `src/writers/jetbrains/index.ts` with a `JetbrainsConfig` interface
2. Implement `export function writeJetbrainsConfig(config: JetbrainsConfig): string[]` — synchronous, uses `fs.writeFileSync`, returns `written` array
3. Create `src/writers/__tests__/jetbrains.test.ts` using `vi.mock('fs')` pattern from `codex.test.ts`
4. Add to `src/writers/index.ts`: import `{ writeJetbrainsConfig }`, add to `AgentSetup`, call in `writeSetup()`
5. Run `npm run build && npm run test` — all pass

**Result**: New writer available via `writeSetup()` orchestration; files are written synchronously and paths are returned.

## Common Issues

- **"TypeError: write{Platform}Config is not a function"** — Verify the function is exported: `export function write{Platform}Config(...)`. Missing `export` is a common mistake.
- **"ENOENT: no such file or directory"** — Ensure `fs.mkdirSync(parentDir, { recursive: true })` is called BEFORE `fs.writeFileSync(filePath, ...)`. See `src/writers/claude/index.ts` for correct order.
- **"Skill file has no frontmatter"** — Frontmatter format must be `---\nname: ...\ndescription: ...\n---\n<content>` (no extra blank lines). Compare with `src/writers/claude/index.ts` lines 40–48.
- **"written array is empty but files were created"** — Every `fs.writeFileSync()` call must be followed by `written.push(filePath)`. Check every file operation.
- **Build fails: 'platform' already exists** — Check if `src/writers/{platform}/` dir exists from prior attempt; remove or use different platform name