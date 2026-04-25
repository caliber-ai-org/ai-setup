---
name: writers-pattern
description: Adds a new platform writer in src/writers/ following existing patterns (claude, cursor, codex). Returns string[] of generated file paths. Integrates with writeSetup() orchestration. Use when implementing 'add platform', 'new writer', 'support new agent'. Do NOT use for refactoring existing writers or modifying writers/index.ts exports.
---
# Writers Pattern

## Critical

- Each writer MUST export a default function matching the signature: `(config: WriterConfig, skillLines: SkillLine[]) => Promise<string[]>`
- Writer MUST return full file paths written, not relative paths
- All writers MUST be exported in `src/writers/index.ts` as named exports
- Writer files live in `src/writers/{platform}/index.ts` with sibling `__tests__/index.test.ts`
- Configuration object (`WriterConfig`) is shared across all writers — inspect `src/writers/claude/index.ts` for the exact shape
- Never hardcode file paths or extension detection — use the `config` object and `skillLines` array passed in

## Instructions

1. **Create directory structure**
   - Create `src/writers/{platform}/index.ts` (main writer)
   - Create `src/writers/{platform}/__tests__/index.test.ts` (test file)
   - Verify directory does not already exist: `ls -la src/writers/{platform}/` should return error

2. **Implement writer function signature**
   - Import `WriterConfig` and `SkillLine` from `src/writers/index.ts`
   - Export default async function: `export default async function write{Platform}(config: WriterConfig, skillLines: SkillLine[]): Promise<string[]>`
   - Function receives `config` with properties: `cwd`, `platform`, `agent`, `token` (optional), `quiet` (boolean)
   - Function receives `skillLines` array of objects with `name`, `description`, `path`, `markdown` properties
   - Return array of absolute file paths written (e.g., `['/path/to/file1', '/path/to/file2']`)

3. **Implement core write logic**
   - Determine target directory from `config.cwd` (entry point for all writes)
   - For each skill in `skillLines`, generate platform-specific file(s)
   - Match file structure of existing writer: inspect `src/writers/claude/index.ts` lines 1–50 for pattern (typically generates SKILL.md or equivalent)
   - Use `await fs.promises.writeFile()` or Caliber's `writeFile()` helper if available
   - Catch and handle write errors — log to stderr if `config.quiet` is false
   - Use `path.resolve()` and `path.join()` for all path operations

4. **Add test file**
   - Create `src/writers/{platform}/__tests__/index.test.ts` with vitest imports
   - Test the writer function with mock `WriterConfig` and `SkillLine[]` inputs
   - Assert that returned `string[]` contains expected file paths
   - Mock file I/O if needed using memfs or spy on `fs.promises.writeFile`
   - Verify at least one skill is written per test case

5. **Export writer in src/writers/index.ts**
   - Open `src/writers/index.ts`
   - Add import: `import write{Platform} from './{platform}/index.js'`
   - Export as named export in the module exports object (inspect existing claude, cursor, codex exports)
   - Verify import uses `.js` extension (ESM convention in this project)

6. **Verify integration**
   - Run `npm run build` — must compile without errors
   - Run `npm run test -- src/writers/{platform}/__tests__/` — all tests pass
   - Run `npm run lint` — no linting errors in new writer code
   - Inspect `src/writers/index.ts` to confirm new writer is exported and callable

## Examples

**User says**: "Add support for a new agent platform called Jetbrains"

**Actions**:
1. Create `src/writers/jetbrains/index.ts`
2. Implement `export default async function writeJetbrains(config: WriterConfig, skillLines: SkillLine[]): Promise<string[]>` — reads `config.cwd`, iterates `skillLines`, writes files to `.jetbrains/rules/` (or platform-specific dir)
3. Create `src/writers/jetbrains/__tests__/index.test.ts` with tests
4. Add to `src/writers/index.ts`: `import writeJetbrains from './jetbrains/index.js'` and export
5. Run build + tests + lint — all pass

**Result**: New writer available via `writeSetup()` orchestration; each skill generates a file in the platform-specific directory and returns full paths written.

## Common Issues

- **Type error: 'WriterConfig' not found** — Ensure import is `import type { WriterConfig, SkillLine } from '../index.js'` (use `type` keyword for type imports)
- **Function returns relative paths instead of absolute** — Use `path.resolve(config.cwd, relativePath)` to construct full paths; all returned paths must be absolute
- **Writer not callable in index.ts exports** — Verify default export function in `{platform}/index.ts` is async and returns `Promise<string[]>`, then check `index.ts` import uses `.js` extension
- **Tests fail with 'Cannot find module'** — Confirm `__tests__/index.test.ts` imports writer as `import write{Platform} from '../index.js'` (relative path, ESM)
- **Build fails: 'platform' already exists** — Check if `src/writers/{platform}/` dir exists from prior attempt; remove or use different platform name