---
name: adding-a-command
description: Create a new CLI command following Commander.js pattern. Handles command file in src/commands/, registration in src/cli.ts, telemetry tracking via tracked() wrapper, and option parsing. Use when user says 'add command', 'new CLI command', 'create subcommand', or adds files to src/commands/. Do NOT use for modifying existing commands or refactoring command structure.
---
# Adding a Command

## Critical

- Commands MUST be registered in `src/cli.ts` using `.command()` and `.action()` with the `tracked()` wrapper for telemetry.
- Command file MUST be in `src/commands/{commandName}.ts` and export a default async function with signature: `async (options: CommandOptions, ctx: CLIContext) => Promise<void>`.
- Always use `tracked(commandName, async () => { ... })` wrapper in `src/cli.ts` to enable telemetry tracking.
- Test file MUST be in `src/commands/__tests__/{commandName}.test.ts` with at least one happy-path test.

## Instructions

1. **Create command file** in `src/commands/{commandName}.ts`
   - Export default async function: `export default async (options: any, ctx: CLIContext) => { ... }`
   - Import `CLIContext` from `src/cli.ts`
   - Use `ctx.log()` for output (respects quiet mode via `--quiet`)
   - Use `ctx.spinner()` for async operations
   - Verify function signature matches existing commands like `src/commands/score.ts`

2. **Register in src/cli.ts**
   - Import the command: `import addCommand from './commands/mycommand.js'`
   - Add command definition:
     ```ts
     program
       .command('mycommand')
       .description('One-line description')
       .option('--option', 'Option description')
       .action(tracked('mycommand', addCommand))
     ```
   - Verify imports are `.js` (ESM)
   - Verify `tracked()` wrapper is applied to `.action()`

3. **Add telemetry event** in `src/telemetry/events.ts`
   - Add event type: `export type MyCommandEvent = { type: 'mycommand:start' | 'mycommand:success' | 'mycommand:error'; ... }`
   - Include `duration?: number` field for timed events
   - Update `export type AllEvents = ... | MyCommandEvent`
   - Verify event matches pattern in existing events

4. **Create test file** in `src/commands/__tests__/{commandName}.test.ts`
   - Import `describe`, `it`, `expect`, `vi` from `vitest`
   - Import command from parent: `import addCommand from '../mycommand.js'`
   - Create mock `CLIContext`: `{ log: vi.fn(), spinner: vi.fn().mockReturnValue({ start: vi.fn(), stop: vi.fn() }) }`
   - Test happy path: `await addCommand({}, ctx); expect(ctx.log).toHaveBeenCalled()`
   - Verify test runs: `npx vitest run src/commands/__tests__/{commandName}.test.ts`

5. **Build and validate**
   - Run `npm run build` → verify no TypeScript errors
   - Run `npm run lint` → verify ESLint passes
   - Test command: `node dist/bin.js mycommand --help` → verify options listed
   - Run `npm run test` → verify new test passes

## Examples

User says: "Add a new `verify` command that checks if config files exist"

**Actions:**
1. Create `src/commands/verify.ts`:
   ```ts
   import { CLIContext } from '../cli.js';
   export default async (options: any, ctx: CLIContext) => {
     const spinner = ctx.spinner('Verifying config files...');
     spinner.start();
     const exists = await checkFilesExist();
     spinner.stop();
     ctx.log(`✓ Config files ${exists ? 'found' : 'missing'}`);
   };
   ```
2. Register in `src/cli.ts`:
   ```ts
   import verifyCommand from './commands/verify.js';
   program
     .command('verify')
     .description('Verify configuration files exist')
     .action(tracked('verify', verifyCommand))
   ```
3. Add to `src/telemetry/events.ts`:
   ```ts
   export type VerifyEvent = {
     type: 'verify:start' | 'verify:success' | 'verify:error';
     duration?: number;
   };
   ```
4. Create `src/commands/__tests__/verify.test.ts` with happy-path test
5. Run `npm run build && npm run test && npm run lint`

## Common Issues

**"Cannot find module './commands/mycommand.js'"**
- Verify file is at `src/commands/mycommand.ts` (TypeScript)
- Verify import in `src/cli.ts` uses `.js` extension: `from './commands/mycommand.js'`
- Rebuild: `npm run build`

**"tracked is not exported from src/cli.ts"**
- Verify `tracked()` function exists in `src/cli.ts` (it should; check existing commands)
- Verify you're using it as `.action(tracked('commandName', commandFunction))`

**Test fails with "CLIContext is not a constructor"**
- Create mock object manually: `const ctx = { log: vi.fn(), spinner: vi.fn().mockReturnValue({ start: vi.fn(), stop: vi.fn() }) }`
- Do NOT try to instantiate CLIContext; it's an interface

**"--option not recognized" when testing**
- Verify `.option()` is chained in `src/cli.ts` BEFORE `.action()`
- Rebuild and test with `npm run build && node dist/bin.js mycommand --help`