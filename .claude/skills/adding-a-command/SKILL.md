---
name: adding-a-command
description: Creates a new CLI command following caliber's pattern: file in src/commands/, named export async function, register in src/cli.ts with tracked(), use ora spinners, throw __exit__ on user-facing failures. Use when user says 'add command', 'new subcommand', 'create CLI action', or adds files to src/commands/. Do NOT use for modifying existing commands or fixing bugs in existing command logic.
---
# Adding a Command

## Critical

1. **Always register new commands in `src/cli.ts`** with `.action(tracked(commandFunction))`. Commands not registered will never execute.
2. **User-facing errors must throw `__exit__`**, not `Error`. Exit codes: `1` (generic failure), `2` (validation), `3` (config missing). Example: `throw __exit__(1, 'Database connection failed')`.
3. **Commands must be async functions** exported as named exports from `src/commands/[name].ts`. Return type should be `Promise<void>` or `Promise<Record<string, any>>` if producing JSON output.
4. **All long-running operations need ora spinners**. Import `import * as ora from 'ora'` and wrap work: `const spinner = ora('Working...').start(); /* do work */; spinner.succeed('Done');`
5. **Never use console.log directly**—use `ora` or `process.stdout.write()` for structured output. Queries use `process.stdout.write(JSON.stringify(result))`.

## Instructions

1. **Create the command file** at `src/commands/[command-name].ts`.
   - Copy the function signature from an existing command (e.g., `src/commands/init.ts` or `src/commands/score.ts`).
   - Define as `export async function [commandName](options: CommandOptions): Promise<void>`.
   - Verify the export is named (not default export).

2. **Add command options type** (if needed).
   - Check `src/commands/` for pattern: `interface InitOptions { configPath?: string; debug?: boolean; }`.
   - Flatten all CLI flags into the interface. Commander.js passes flags as kebab-case properties.

3. **Import required utilities**:
   ```typescript
   import * as ora from 'ora';
   import { __exit__ } from '../lib/state';
   import { getConfig } from '../lib/resolve-caliber';
   ```
   - Verify `__exit__` is imported from `src/lib/state.ts` (not thrown as `new Error`).
   - Verify all imports resolve by running `npm run build`.

4. **Implement error handling**:
   - Wrap external calls in try/catch.
   - On validation failure: `throw __exit__(2, 'Missing required flag: --model')`.
   - On runtime failure: `throw __exit__(1, error.message)` (extract message from Error, don't nest).
   - Verify exit code is one of: `1` (runtime), `2` (validation), `3` (config).

5. **Add spinner for long operations**:
   ```typescript
   const spinner = ora('Generating config...').start();
   try {
     const result = await generateConfig(options);
     spinner.succeed('Config generated');
   } catch (error) {
     spinner.fail('Generation failed');
     throw __exit__(1, (error as Error).message);
   }
   ```
   - Verify spinner is started, then `succeed()` or `fail()` called, never left spinning.

6. **Register in `src/cli.ts`**:
   - Import the command: `import { [commandName] } from './commands/[command-name]'`.
   - Add `.command()` chain before `.action(tracked(...))` (see `init`, `score` examples).
   - Pass options object to `tracked()`: `.action(tracked((options) => [commandName](options)))`.
   - Verify command name in `.command('name')` matches the CLI invocation.

7. **Add tests** in `src/commands/__tests__/[command-name].test.ts` (if complex logic):
   - Mock `ora` as `{ start: () => ({ succeed, fail }) }`.
   - Mock `__exit__` to capture thrown errors.
   - Verify command succeeds with valid input, fails with invalid input.
   - Verify exit codes are correct.
   - Run `npm run test` to confirm all tests pass.

8. **Build and validate**:
   - Run `npm run build` to transpile via tsup.
   - Verify no TypeScript errors: `npx tsc --noEmit`.
   - Test command locally: `node dist/bin.js [command-name] [args]`.
   - Verify help text shows: `node dist/bin.js [command-name] --help`.

## Examples

**User says:** "Add a command to validate the fingerprint"

**Actions:**
1. Create `src/commands/validate-fingerprint.ts`:
   ```typescript
   import * as ora from 'ora';
   import { __exit__ } from '../lib/state';
   import { collectFingerprint } from '../fingerprint';
   
   export async function validateFingerprint(): Promise<void> {
     const spinner = ora('Validating fingerprint...').start();
     try {
       const fp = await collectFingerprint('.');
       spinner.succeed('Fingerprint valid');
       process.stdout.write(JSON.stringify({ hash: fp.hash }, null, 2));
     } catch (error) {
       spinner.fail('Validation failed');
       throw __exit__(1, (error as Error).message);
     }
   }
   ```

2. Update `src/cli.ts`:
   ```typescript
   import { validateFingerprint } from './commands/validate-fingerprint';
   // ...
   cli
     .command('validate-fingerprint')
     .description('Validate the project fingerprint')
     .action(tracked(() => validateFingerprint()));
   ```

3. Run `npm run build && node dist/bin.js validate-fingerprint`.

**Result:** Command executes with spinner, outputs JSON, exits cleanly.

## Anti-patterns

1. **Do NOT throw `new Error('message')` for user-facing failures.** Always `throw __exit__(code, message)`. Errors not thrown via `__exit__` cause stack traces printed to users. Use `__exit__(1, 'Database unreachable')` instead of `throw new Error('DB failed')`.

2. **Do NOT use `console.log()` for progress or interactive output.** Use `ora` spinners. `console.log('Working...')` produces noise in logs and doesn't clear on completion. Use `ora('message').start()` then `.succeed()` or `.fail()`.

3. **Do NOT register commands without wrapping in `tracked()`** in `.action()`. Commands without telemetry tracking are invisible to observability. Ensure pattern is `.action(tracked((opts) => myCommand(opts)))`, not `.action((opts) => myCommand(opts))`.

## Common Issues

**Issue:** Command not found after running `npm run build`.
- **Fix:** Verify command is registered in `src/cli.ts` with `.command('name')` matching the invocation. Check import statement is present. Run `npm run build` again—tsup may not have picked up the new file. Check `dist/commands/` contains the compiled file.

**Issue:** "Cannot find module './commands/my-command'" at runtime.
- **Fix:** Verify the file exists at `src/commands/my-command.ts` (exact spelling, kebab-case). Verify the export is `export async function myCommand()` (camelCase function name). Run `npm run build` and check `dist/commands/my-command.js` is present.

**Issue:** Spinner text not clearing, spins forever, or shows after completion.
- **Fix:** Ensure `spinner.succeed()` or `spinner.fail()` is called in all code paths (success and catch blocks). Never leave spinner without a terminal state. Pattern: `const s = ora('msg').start(); try { work; s.succeed(); } catch (e) { s.fail(); throw __exit__(...); }`.

**Issue:** Exit code not respected; process exits with 0 even after error.
- **Fix:** Verify error is thrown as `__exit__(code, msg)`, not caught and swallowed. Check that `src/cli.ts` does not wrap the command in additional try/catch that catches `__exit__`. Verify `npm run build` compiled latest code.