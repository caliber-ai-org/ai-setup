---
name: adding-a-command
description: Create a new CLI command following Commander.js pattern. Handles command file in src/commands/, registration in src/cli.ts, telemetry tracking via tracked() wrapper, and option parsing. Use when user says 'add command', 'new CLI command', 'create subcommand', or adds files to src/commands/. Do NOT use for modifying existing commands or refactoring command structure.
---
# Adding a Command

## Critical

- Commands MUST be registered in `src/cli.ts` using `.command()` and `.action()` with the `tracked()` wrapper for telemetry.
- Command file MUST be in `src/commands/{commandName}.ts` and export a **named** async function: `export async function {commandName}Command(options?: OptionType)`. Never use default exports — `src/cli.ts` imports commands by name.
- Always use `tracked('{kebab-name}', {commandName}Command)` wrapper in `src/cli.ts` to enable telemetry tracking.
- Test file MUST be in `src/commands/__tests__/{commandName}.test.ts` with at least one happy-path test.

## Instructions

1. **Create command file** in `src/commands/{commandName}.ts`
   - Export named async function: `export async function {commandName}Command(options?: { optionName?: type }) { ... }`
   - Return `void`; handle all output via `console.log` or chalk
   - Define a TypeScript interface for options if the command takes any
   - Verify function signature matches existing commands like `src/commands/score.ts`

2. **Register in src/cli.ts**
   - Import the command by name: `import { {commandName}Command } from './commands/{commandName}.js'`
   - Add command definition:
     ```ts
     program
       .command('{kebab-name}')
       .description('One-line description')
       .option('--option', 'Option description')
       .action(tracked('{kebab-name}', {commandName}Command))
     ```
   - Verify imports are `.js` (ESM)
   - Verify `tracked()` wrapper is applied to `.action()`

3. **Handle errors consistently**: Wrap error-prone operations in try/catch:
   - User error (bad input): `console.error(chalk.red('message')); throw new Error('__exit__');`
   - System error: `throw new Error('Detailed error message');`

4. **Create test file** in `src/commands/__tests__/{commandName}.test.ts`
   - Import `describe`, `it`, `expect`, `vi` from `vitest`
   - Import command by name: `import { {commandName}Command } from '../{commandName}.js'`
   - Test happy path and error paths
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
   import chalk from 'chalk';
   import { checkFilesExist } from '../lib/config.js';

   export async function verifyCommand(options?: { json?: boolean }) {
     const exists = await checkFilesExist();
     console.log(chalk.bold('Verify'));
     console.log(`  Config files: ${exists ? chalk.green('found') : chalk.red('missing')}`);
   }
   ```
2. Register in `src/cli.ts`:
   ```ts
   import { verifyCommand } from './commands/verify.js';
   program
     .command('verify')
     .description('Verify configuration files exist')
     .action(tracked('verify', verifyCommand))
   ```
3. Create `src/commands/__tests__/verify.test.ts` with happy-path test
4. Run `npm run build && npm run test`

## Common Issues

**"SyntaxError: The requested module does not provide an export named '{commandName}Command'"**
- Use `export async function {commandName}Command(...)` — named export, not `export default`
- Import in `src/cli.ts` using named import: `import { {commandName}Command } from './commands/{commandName}.js'`
- Rebuild: `npm run build`

**"tracked is not exported from src/cli.ts"**
- `tracked()` is defined in `src/cli.ts` itself; it takes two args: `tracked('kebab-name', handlerFn)`
- Verify you're using it as `.action(tracked('{kebab-name}', {commandName}Command))`

**Command crashes when run but appears in --help**
- Verify import name matches function export in the command file
- Wrap handler with `tracked('command-name', handler)` and ensure the import is correct

**"--option not recognized" when testing**
- Verify `.option()` is chained in `src/cli.ts` BEFORE `.action()`
- Rebuild and test with `npm run build && node dist/bin.js mycommand --help`