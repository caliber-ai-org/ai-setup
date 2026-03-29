---
name: adding-a-command
description: Creates a new CLI command following the Commander.js pattern in src/commands/. Handles command registration in src/cli.ts, telemetry tracking via tracked() wrapper, and option parsing. Use when user says 'add command', 'new CLI command', 'create subcommand', or asks to add files to src/commands/. Do NOT use for modifying existing commands or refactoring command logic.
---
# Adding a Command

## Critical

- **Every command must be wrapped with `tracked()`** — this enables telemetry. Without it, the command will not report usage.
- **Commands are registered in `src/cli.ts`**, not auto-discovered. You must manually import and attach each command.
- **Use Commander.js patterns exactly** — `.option()` for flags, `.argument()` for positional args, `.action()` for the handler.
- **Always provide a `.description()`** — it appears in `caliber --help`.

## Instructions

1. **Create the command file** in `src/commands/{{command-name}}.ts`.
   - Signature: `export async function {{commandName}}(options: OptionType, ...args: any[]) { ... }`
   - Use async/await for all async operations (DB, LLM, file I/O).
   - Import `tracked` from `src/lib/hooks.ts`: `import { tracked } from '../lib/hooks.js';`
   - Verify the command exports the handler function before proceeding.

2. **Define the OptionType interface** (if needed).
   - Place above the handler function in the same file.
   - Example from `score.ts`: `interface ScoreOptions { json?: boolean; verbose?: boolean; }`
   - Verify the interface matches all `.option()` calls in Step 3.

3. **Register in `src/cli.ts`**.
   - Import: `import { {{commandName}} } from './commands/{{command-name}}.js';`
   - Attach to program: `program.command('{{cmd-name}}').description('...').option('--flag', '...').action(tracked({{commandName}}));`
   - Use `.option()` for optional flags, `.argument()` for required positional args.
   - Verify the import path includes `.js` extension (ESM).

4. **Add tests** in `src/commands/__tests__/{{command-name}}.test.ts`.
   - Use Vitest + `vi.mock()` for LLM, file I/O, and hooks.
   - Test both success and error paths.
   - Verify tests pass: `npm run test -- {{command-name}}.test.ts`.

5. **Validate telemetry**.
   - Confirm `tracked()` wraps the action handler.
   - Verify the command fires an event in PostHog.

## Examples

**User says:** "Add a 'debug' command that prints the fingerprint JSON."

**Actions taken:**

1. Create `src/commands/debug.ts`:
```typescript
import { tracked } from '../lib/hooks.js';
import { collectFingerprint } from '../fingerprint/index.js';

export async function debug(options: { verbose?: boolean }) {
  const fp = await collectFingerprint();
  console.log(JSON.stringify(fp, null, 2));
}
```

2. Register in `src/cli.ts`:
```typescript
import { debug } from './commands/debug.js';

program
  .command('debug')
  .description('Print fingerprint JSON')
  .option('--verbose', 'Include timing info')
  .action(tracked(debug));
```

3. Test in `src/commands/__tests__/debug.test.ts`:
```typescript
vi.mock('../fingerprint/index.js');
it('should print fingerprint', async () => {
  const consoleSpy = vi.spyOn(console, 'log');
  await debug({ verbose: false });
  expect(consoleSpy).toHaveBeenCalled();
});
```

**Result:** Running `caliber debug` prints the fingerprint and logs a telemetry event.

## Common Issues

- **"tracked is not defined"** — Verify import: `import { tracked } from '../lib/hooks.js';` with `.js` extension.
- **"Command not found"** — Check `src/cli.ts` for the import and `.action(tracked(...))` attachment.
- **"options is undefined"** — Ensure the handler signature is `async function(options: Type, ...args: any[])` and the Commander action passes options as the first parameter.
- **"PostHog event not firing"** — Confirm `tracked()` wraps the action handler; without it, events won't emit.
- **ESM import errors** — Always include `.js` extensions in import paths (e.g., `../lib/hooks.js` not `../lib/hooks`).