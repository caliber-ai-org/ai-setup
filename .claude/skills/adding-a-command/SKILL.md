---
name: adding-a-command
description: Creates a new CLI command following the Commander.js pattern in src/commands/. Handles command registration in src/cli.ts, telemetry tracking via tracked() wrapper, and option parsing. Use when user says 'add command', 'new CLI command', 'create subcommand', or adds files to src/commands/. Do NOT use for modifying existing commands or fixing bugs in existing commands.
---
# Adding a Command

## Critical

- All commands MUST be registered in `src/cli.ts` via `.command()` and wrapped with `tracked()` for telemetry
- Commands in `src/commands/` must export a default async function: `export default async (options) => { ... }`
- Use exact naming: kebab-case for file and command name (e.g., `my-command.ts` → `caliber my-command`)
- All user-facing errors must use the `ErrorResponse` type from `src/types.ts`
- Test files go in `src/commands/__tests__/my-command.test.ts` and must import with `.js` extension

## Instructions

1. **Create the command file** in `src/commands/{name}.ts` with boilerplate:
   ```typescript
   import { ErrorResponse } from '../types.js';
   
   export default async (options) => {
     // implementation
   };
   ```
   Verify the file exists and exports a default async function before proceeding.

2. **Register in `src/cli.ts`** using the pattern from existing commands (e.g., `score.ts`, `refresh.ts`):
   ```typescript
   import myCommand from './commands/my-command.js';
   
   program
     .command('my-command')
     .description('Human-readable description')
     .option('--flag <value>', 'option description')
     .action(tracked('my-command', myCommand));
   ```
   Verify the command appears when running `npx caliber --help` before proceeding.

3. **Add telemetry tracking** via `tracked()` wrapper from `src/telemetry/events.ts`. The wrapper automatically captures: command name, execution time, success/error status.
   Verify `src/telemetry/events.ts` exports `tracked()` and examine an existing command's registration for the exact pattern.

4. **Parse options using Commander.js** patterns from existing commands:
   - String options: `.option('--output <path>', 'output file')`
   - Boolean flags: `.option('--dry-run', 'preview only')`
   - Required arguments: `.argument('<name>', 'required argument')`
   Options are passed as the first parameter to the command function.
   Verify options object structure by comparing to similar command (e.g., `score.ts`, `refresh.ts`).

5. **Handle errors consistently** using `ErrorResponse`:
   ```typescript
   if (!condition) {
     throw { error: 'Human message', code: 1 } as ErrorResponse;
   }
   ```
   Verify error handling in at least one existing command and follow that pattern.

6. **Write tests** in `src/commands/__tests__/{name}.test.ts`:
   - Import with `.js` extension: `import myCommand from '../my-command.js'`
   - Mock dependencies using `vi.mock()`
   - Test success case and error cases
   - Verify test runs: `npx vitest run src/commands/__tests__/my-command.test.ts`

## Examples

**User says**: "Add a 'validate' command that checks if CLAUDE.md exists and is valid"

**Actions taken**:
1. Create `src/commands/validate.ts`:
   ```typescript
   import { existsSync, readFileSync } from 'fs';
   import { ErrorResponse } from '../types.js';
   
   export default async (options) => {
     if (!existsSync('CLAUDE.md')) {
       throw { error: 'CLAUDE.md not found', code: 1 } as ErrorResponse;
     }
     const content = readFileSync('CLAUDE.md', 'utf-8');
     console.log('✓ CLAUDE.md is valid');
   };
   ```

2. Register in `src/cli.ts`:
   ```typescript
   import validateCommand from './commands/validate.js';
   program
     .command('validate')
     .description('Validate CLAUDE.md and agent configs')
     .action(tracked('validate', validateCommand));
   ```

3. Create `src/commands/__tests__/validate.test.ts`:
   ```typescript
   import { describe, it, expect, vi } from 'vitest';
   import validateCommand from '../validate.js';
   
   vi.mock('fs');
   
   it('throws error when CLAUDE.md missing', async () => {
     await expect(validateCommand({})).rejects.toMatchObject({
       error: 'CLAUDE.md not found'
     });
   });
   ```

**Result**: `npx caliber validate` now works and is tracked in telemetry.

## Common Issues

- **Command not found**: Verify import in `src/cli.ts` uses `.js` extension and `.command()` name matches kebab-case filename
- **Tests fail with 'module not found'**: Import paths in test files must use `.js` extension (e.g., `import cmd from '../my-command.js'`)
- **Telemetry not recorded**: Ensure command is wrapped with `tracked()` in `src/cli.ts` — check existing commands for exact pattern
- **Option not passed to function**: Verify `.option()` is called before `.action()` in `src/cli.ts` — Commander passes options as first parameter
- **Build fails with 'unknown file extension .ts'**: tsup output uses `.js` — ensure all imports in commands use `.js` extensions