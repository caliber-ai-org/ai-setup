---
name: adding-a-command
description: Creates a new CLI command following the Commander.js pattern in src/commands/. Handles command registration in src/cli.ts, telemetry tracking via tracked() wrapper, and option parsing. Use when user says 'add command', 'new CLI command', 'create subcommand', or adds files to src/commands/. Do NOT use for modifying existing commands or fixing bugs in existing commands.
---
# Adding a Command

## Critical

- **All commands must be wrapped in `tracked()`** from `src/telemetry/index.ts`. This is non-negotiable — every command logs its execution for metrics.
- **Commands are exported as default functions** from `src/commands/{name}.ts`. The function signature must match: `export default function commandName(program: Command): void`.
- **Register the command in `src/cli.ts`** in the main CLI builder. Import the command function and call it, passing the program instance.
- **Test the command exists** before merging: `npm run build && npx caliber {command-name} --help` should return the help text without errors.

## Instructions

1. **Create the command file** at `src/commands/{command-name}.ts`.
   - Use kebab-case for file names (`src/commands/my-command.ts`).
   - Export a default async function that receives `program: Command` parameter.
   - The function builds and registers the command via `program.command('name')`.
   - Verify: File exists and exports a default function with the correct signature.

2. **Define the command using Commander.js**.
   - Chain `.description()`, `.option()`, `.action()` on the command object.
   - Use `command.command('name').description('...')` for the command definition.
   - Store the returned command object and call `.action()` on it.
   - Verify: The action callback receives correct parameters (e.g., options object, command instance).

3. **Wrap the action handler in `tracked()`**.
   - Import `tracked` from `src/telemetry/index.ts`.
   - Call `tracked('command-name', async (context) => { ... })` inside `.action()`.
   - The callback receives `context` parameter (telemetry context); use it to report custom metrics if needed.
   - Return the Promise from the tracked wrapper.
   - Verify: The command runs and completes without telemetry errors (check console output).

4. **Parse and validate options**.
   - Extract options from the options object passed to the action callback.
   - Use destructuring: `const { optionName, flag } = options`.
   - For required options, validate they exist and throw an error if missing.
   - Verify: Running the command without required options produces a clear error message.

5. **Register the command in `src/cli.ts`**.
   - Import the command function at the top: `import myCommand from './commands/my-command.js'`.
   - Call it in the buildCli function: `myCommand(program)`.
   - Commands are registered in the order they appear in the function.
   - Verify: `npx caliber --help` lists your command in the available commands.

6. **Write a test** in `src/commands/__tests__/{command-name}.test.ts`.
   - Use Vitest patterns from existing tests (e.g., `src/commands/__tests__/status.test.ts`).
   - Mock external dependencies (filesystem, LLM calls, telemetry).
   - Test: command registration, option parsing, success path, error handling.
   - Verify: `npm run test -- src/commands/__tests__/{command-name}.test.ts` passes.

## Examples

### Example: User requests "add a greet command that takes a --name option"

**Action 1: Create `src/commands/greet.ts`**
```typescript
import { Command } from 'commander';
import { tracked } from '../telemetry/index.js';

export default function greetCommand(program: Command): void {
  const cmd = program
    .command('greet')
    .description('Greet a user by name')
    .option('--name <string>', 'Name to greet', 'World')
    .action(async (options) => {
      return tracked('greet', async (context) => {
        const { name } = options;
        console.log(`Hello, ${name}!`);
      });
    });
}
```

**Action 2: Register in `src/cli.ts`**
- Add import: `import greetCommand from './commands/greet.js'`
- Call in buildCli: `greetCommand(program)`

**Action 3: Test in `src/commands/__tests__/greet.test.ts`**
```typescript
import { describe, it, expect, vi } from 'vitest';
import { Command } from 'commander';
import greetCommand from '../greet.js';

describe('greet', () => {
  it('registers the command', () => {
    const program = new Command();
    greetCommand(program);
    const cmd = program.commands.find((c) => c.name() === 'greet');
    expect(cmd).toBeDefined();
  });

  it('greets with default name', async () => {
    const program = new Command();
    greetCommand(program);
    const consoleSpy = vi.spyOn(console, 'log');
    await program.parseAsync(['node', 'caliber', 'greet']);
    expect(consoleSpy).toHaveBeenCalledWith('Hello, World!');
  });

  it('greets with custom name', async () => {
    const program = new Command();
    greetCommand(program);
    const consoleSpy = vi.spyOn(console, 'log');
    await program.parseAsync(['node', 'caliber', 'greet', '--name', 'Alice']);
    expect(consoleSpy).toHaveBeenCalledWith('Hello, Alice!');
  });
});
```

**Action 4: Verify**
```bash
npm run build
npx caliber greet --help          # Shows help text
npx caliber greet                 # Output: Hello, World!
npx caliber greet --name Alice    # Output: Hello, Alice!
npm run test -- src/commands/__tests__/greet.test.ts  # All tests pass
```

## Common Issues

**Error: "Command 'mycommand' is not a valid command"**
- Verify the command function was called in `src/cli.ts` inside `buildCli()`: look for `myCommand(program)`.
- Verify the import path is correct: `import myCommand from './commands/my-command.js'` (note `.js` extension for ESM).
- Run `npm run build` to regenerate dist/ and try again.

**Error: "tracked is not a function"**
- Verify import: `import { tracked } from '../telemetry/index.js'` at the top of the command file.
- Verify the tracked call is async: `.action(async (options) => { return tracked(...); })`.
- Verify the tracked callback returns or awaits a value; the action must return the Promise.

**Error: "Option parsing failed" or options are undefined**
- Verify options are defined via `.option()` before `.action()`.
- Verify the action callback destructures options correctly: `const { optionName } = options`.
- If testing, ensure the command is parsed with `await program.parseAsync([...])` including the command name and options.

**Command appears in --help but fails when run**
- Verify the tracked wrapper is present and the action callback is async.
- Check for console errors: the action may throw before telemetry completes.
- Verify external dependencies (file reads, LLM calls) are mocked in tests.
- Run in dev mode: `npm run dev` and test locally before committing.

**Test fails with "Command is not registered"**
- Verify the test calls `greetCommand(program)` to register it.
- Verify the command name in the test matches the `.command('name')` call.
- Use `program.commands.find((c) => c.name() === 'name')` to debug if the command exists.