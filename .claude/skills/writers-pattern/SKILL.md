---
name: writers-pattern
description: Creates or modifies a file writer in src/writers/ following the established pattern for generating AI agent configs. Writers export a named async function returning string[] of written file paths, use fs.writeFileSync for synchronous writes, mkdirSync recursive for dirs, and YAML frontmatter for SKILL.md files. Use when adding support for new platforms or config file formats, or modifying existing writers in src/writers/claude/, src/writers/cursor/, src/writers/codex/, or src/writers/github-copilot/. Do NOT use for reading or parsing existing configs — use fingerprint pattern instead. Do NOT use for telemetry or metrics — use src/telemetry/ pattern.
---
# Writers Pattern

## Critical

1. **Writers ALWAYS export an async function** matching the signature: `export async function writePlatformName(payload: WriterPayload): Promise<string[]>`
2. **Return value MUST be string[]** — array of absolute file paths written. Used by `writeSetup()` in `src/writers/index.ts` for undo/backup tracking.
3. **Use fs.writeFileSync (synchronous)** — no async file I/O. All writers use blocking writes with `{ encoding: 'utf-8' }`.
4. **mkdirSync({ recursive: true })** before every write. Fail fast on permission errors; do NOT swallow them.
5. **For SKILL.md files** (and only SKILL.md): prepend YAML frontmatter block before markdown body. Frontmatter is generated separately; the writer provides structure only.
6. **Verify payload type** before accessing fields. Reference `WriterPayload` from `src/llm/types.ts`.

## Instructions

1. Create file `src/writers/{platform}/index.ts` (replace `{platform}` with lowercase platform name).
   - Verify: Does `src/writers/` already have a directory for this platform? If yes, modify the existing `index.ts`.
   - Reference existing writers: `src/writers/claude/index.ts`, `src/writers/cursor/index.ts`.

2. Import required modules at the top:
   ```typescript
   import path from 'path';
   import { writeFileSync, mkdirSync } from 'fs';
   import { WriterPayload } from '../../llm/types';
   ```
   - Verify: All imports are available in the project. Do NOT use fs.promises or async/await for file ops.

3. Define the async function signature matching the pattern:
   ```typescript
   export async function write{PlatformName}(payload: WriterPayload): Promise<string[]> {
     const writtenPaths: string[] = [];
     // function body
     return writtenPaths;
   }
   ```
   - Replace `{PlatformName}` with camelCase (e.g., `writeCursor`, `writeClaude`).
   - Verify: Function is named `write{Platform}` and is the default export or named export.

4. Extract payload fields and compute target paths:
   ```typescript
   const { projectRoot, configs } = payload;
   const outputDir = path.join(projectRoot, '.cursor', 'rules'); // example
   ```
   - Verify: `projectRoot` exists in payload and is an absolute path. Check existing writers for platform-specific directory conventions.
   - This step uses output from Step 3.

5. For each config to write, create directory with mkdirSync:
   ```typescript
   mkdirSync(outputDir, { recursive: true });
   ```
   - Verify: Directory creation succeeds or throws (do NOT catch and ignore).
   - This step depends on Step 4.

6. Build file content string matching the platform's expected format:
   - If YAML-based (Claude, Cursor): use `yaml.stringify()` from existing writers or format manually.
   - If Markdown: build markdown string directly.
   - If JSON: use `JSON.stringify()` with proper indentation.
   - Verify: Content matches a sample from the codebase (e.g., run `caliber init` on test project).
   - This step uses the payload from Step 3.

7. Write file synchronously:
   ```typescript
   const filePath = path.join(outputDir, 'filename.ext');
   writeFileSync(filePath, content, { encoding: 'utf-8' });
   writtenPaths.push(filePath);
   ```
   - Verify: File exists on disk after write. Check with `fs.existsSync(filePath)`.
   - This step uses output from Steps 5 and 6.

8. For SKILL.md files specifically, check if `configs.skills` is populated:
   ```typescript
   if (payload.configs.skills && payload.configs.skills.length > 0) {
     const skillContent = buildSkillFrontmatter(payload.configs.skills);
     // write skill file
   }
   ```
   - Verify: Frontmatter structure matches `src/writers/claude/index.ts` or `src/writers/cursor/index.ts` examples.
   - This step uses payload from Step 3.

9. Register the new writer in `src/writers/index.ts` by importing and calling it:
   ```typescript
   import { write{PlatformName} } from './{platform}';
   // in writeSetup():
   const paths = await write{PlatformName}(payload);
   writtenPaths.push(...paths);
   ```
   - Verify: `writeSetup()` calls the function and collects returned paths.
   - This step depends on Step 3.

10. Add unit tests in `src/writers/__tests__/{platform}.test.ts`:
    - Mock `fs.writeFileSync` and `mkdirSync` using `vi.mock('fs')`.
    - Verify that returned paths match written files.
    - Test payload validation (missing fields should throw).
    - Verify: Tests pass with `npm run test -- src/writers/__tests__/{platform}.test.ts`.

## Examples

**User says:** "Add a writer for GitHub Copilot that writes to `.github/copilot-instructions.md`"

**Actions taken:**
1. Create `src/writers/github-copilot/index.ts` (note: directory may already exist).
2. Import `path`, `writeFileSync`, `mkdirSync` from fs.
3. Define `export async function writeGithubCopilot(payload: WriterPayload): Promise<string[]>`.
4. Extract `payload.projectRoot` and compute `path.join(projectRoot, '.github')`.
5. Call `mkdirSync(path.join(projectRoot, '.github'), { recursive: true })`.
6. Build markdown content from `payload.configs.claudeMd` and rules.
7. Write file: `writeFileSync(path.join(projectRoot, '.github', 'copilot-instructions.md'), content, { encoding: 'utf-8' })`.
8. Return `[path.join(projectRoot, '.github', 'copilot-instructions.md')]`.
9. In `src/writers/index.ts`, import and call: `const ghPaths = await writeGithubCopilot(payload); writtenPaths.push(...ghPaths);`
10. Write tests verifying file creation, content structure, and error handling.

**Result:** When `caliber init` runs, GitHub Copilot instructions are written alongside Claude and Cursor configs.

## Anti-patterns

1. **DO NOT use async/await for file I/O.** ❌ Wrong: `await writeFile()`, `await mkdir()`. ✅ Correct: Use `writeFileSync()` and `mkdirSync()`. All writers in the codebase use blocking I/O for simplicity and atomicity.

2. **DO NOT swallow fs errors with try/catch.** ❌ Wrong: `try { mkdirSync(...) } catch (e) { /* ignore */ }`. ✅ Correct: Let errors propagate — the caller in `src/writers/index.ts` logs them. Silent failures break undo/backup tracking.

3. **DO NOT call writer functions directly; return file paths and let `writeSetup()` aggregate them.** ❌ Wrong: Calling `writeGithubCopilot()` in a loop manually. ✅ Correct: Return `string[]` from your function and let `src/writers/index.ts` collect and track them.

## Common Issues

**Error: "ENOENT: no such file or directory, open '/path/to/file'"**
- Cause: `mkdirSync()` was not called before `writeFileSync()`.
- Fix: Always call `mkdirSync(dirPath, { recursive: true })` before writing to that directory. Check Step 5.

**Error: "TypeError: payload.configs is undefined"**
- Cause: `WriterPayload` is not destructured correctly or type validation is missing.
- Fix: Add explicit type check: `if (!payload || !payload.configs) throw new Error('Invalid payload');` at function start. Verify `WriterPayload` import from `src/llm/types.ts`.

**Undo/backup files not created when writer runs**
- Cause: Writer function was called outside `writeSetup()` or returned paths were not collected.
- Fix: Ensure the writer is registered in `src/writers/index.ts` and `writeSetup()` collects returned paths: `writtenPaths.push(...resultPaths);`. Verify with `npm run test -- src/writers/__tests__/get-files-to-write.test.ts`.

**SKILL.md frontmatter appears as markdown text instead of parsed metadata**
- Cause: Frontmatter was not returned as `{ frontmatter: string, body: string }` or structure doesn't match YAML spec.
- Fix: Frontmatter must be `---\nkey: value\n---\n` at the start of the file. Check `src/writers/claude/index.ts` for the exact format. Use `yaml.stringify()` for consistency.