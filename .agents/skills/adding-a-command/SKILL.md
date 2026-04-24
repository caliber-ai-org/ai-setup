---
name: adding-a-command
description: Creates a new CLI command following the Commander.js pattern in src/commands/. Handles command registration in src/cli.ts, telemetry tracking via tracked() wrapper, and option parsing. Use when user says add command, new CLI command, create subcommand, or adds files to src/commands/. Do NOT use for modifying existing commands or fixing bugs in existing commands.
paths:
  - src/commands/**/*.ts
  - src/cli.ts
---
# Adding a Command

## Critical

- **Export pattern**: Command must export a named async function: `export async function myCommand(options?: OptionType)`. Never use default exports.
- **Registration in cli.ts**: Every command must be imported and registered with `.command()` chain in `src/cli.ts`, wrapped with `tracked()` for telemetry.
- **Error signaling**: Use `throw new Error('__exit__')` to exit gracefully without printing the error message. Use chalk for user-facing messages.
- **Options typing**: Commands receiving options must define a TypeScript interface for those options. Pass options as a destructured object parameter.

## Instructions

1. **Create the command file** at `src/commands/{commandName}.ts` with named async export.
   - Signature: `export async function {commandName}Command(options?: { optionName?: optionType }) { ... }`
   - Import only what you need (avoid kitchen-sink imports).
   - Return void (handle all output via console.log or chalk).
   - Verify the file follows the naming convention: camelCase function + "Command" suffix.

2. **Handle errors consistently**: Wrap error-prone operations in try/catch. Distinguish between user errors and system errors:
   - User error (bad input): `console.error(chalk.red('message')); throw new Error('__exit__');`
   - System error (missing dependency): `throw new Error('Detailed error message');` — this will print and exit with code 1.
   - Parse-like errors: Use ora spinner with `.fail()` before throwing.
   - This step prevents double error printing in bin.ts.

3. **Import and register in src/cli.ts** in the correct location:
   - Add import at the top: `import { {commandName}Command } from './commands/{commandName}.js';`
   - Register the command in the appropriate section (main commands, or nested under a group like `sources`).
   - For main commands: `.command('{kebab-name}').description('...').option(...).action(tracked('{kebab-name}', {commandName}Command))`
   - For subcommands (like `sources add`): `sources.command('add').description(...).action(tracked('sources:add', sourcesAddCommand))`
   - Key: Wrap handler with `tracked('{command-name}', handler)` for automatic telemetry.
   - Verify the command name in tracked() uses kebab-case for main commands and colon-separated for subcommands.

4. **Define options (if needed)**:
   - Add `.option()` chains before `.action()`: `.option('--flag', 'Description')` or `.option('--opt <value>', 'Description')`
   - For parsed options (like comma-separated agents), add a parse function: `.option('--opt <value>', 'Description', parseFunction)`
   - Pass options to handler: `.action(tracked('name', (opts) => command(opts)))`
   - Define TypeScript interface for the options object.
   - Verify option names use camelCase (Commander converts kebab-case flags to camelCase).

5. **Verify before proceeding**:
   - Function exports correctly and is imported in cli.ts.
   - Command is registered with tracked() wrapper.
   - Output uses chalk for colors, not plain console.log.
   - Error paths throw `new Error('__exit__')` for user errors.

## Examples

### Example 1: Simple command (status)

User says: "Add a command to show config status"

**Actions taken**:
1. Create src/commands/status.ts with statusCommand() export
2. Import and register in src/cli.ts with tracked() wrapper

**Result**: `caliber status` displays config status; `caliber status --json` outputs JSON.

Code example:
```typescript
import chalk from 'chalk';
import { loadConfig } from '../llm/config.js';

export async function statusCommand(options?: { json?: boolean }) {
  const config = loadConfig();
  
  if (options?.json) {
    console.log(JSON.stringify({ configured: !!config }, null, 2));
    return;
  }
  
  console.log(chalk.bold('Status'));
  console.log(`  LLM: ${chalk.green(config?.provider || 'Not configured')}`);
}
```

Registration in src/cli.ts:
```typescript
import { statusCommand } from './commands/status.js';
program
  .command('status')
  .description('Show config status')
  .option('--json', 'Output as JSON')
  .action(tracked('status', statusCommand));
```

---

### Example 2: Subcommand with arguments

User says: "Add a sources add subcommand"

**Actions taken**:
1. Create src/commands/sources.ts with sourcesAddCommand() export
2. Register under sources group with tracked('sources:add', ...)

**Result**: `caliber sources add ../lib` adds a source.

Code example:
```typescript
export async function sourcesAddCommand(sourcePath: string) {
  if (!fs.existsSync(sourcePath)) {
    console.log(chalk.red(`Path not found: ${sourcePath}`));
    throw new Error('__exit__');
  }
  const existing = loadSourcesConfig(process.cwd());
  existing.push({ type: 'repo', path: sourcePath });
  writeSourcesConfig(process.cwd(), existing);
  console.log(chalk.green(`Added ${sourcePath}`));
}
```

Registration:
```typescript
const sources = program.command('sources');
sources
  .command('add')
  .argument('<path>', 'Path to add')
  .action(tracked('sources:add', sourcesAddCommand));
```

---

### Example 3: Command with option parsing

User says: "Add init with --agent flag supporting comma-separated values"

**Actions taken**:
1. Create parseAgentOption() parser in src/cli.ts
2. Create src/commands/init.ts with initCommand(options)
3. Register with custom parser

**Result**: `caliber init --agent claude,cursor` passes parsed array to handler.

Parser code:
```typescript
function parseAgentOption(value: string) {
  const agents = value.split(',').map(s => s.trim().toLowerCase());
  if (agents.length === 0) {
    console.error('Invalid agent');
    process.exit(1);
  }
  return agents;
}

program.command('init')
  .option('--agent <type>', 'Agents (comma-separated)', parseAgentOption)
  .action(tracked('init', initCommand));
```

## Common Issues

**Issue**: "SyntaxError: The requested module does not provide an export named 'myCommand'"
- **Cause**: Function not exported or exported as default instead of named.
- **Fix**: Use `export async function myCommand(...)` (not `export default`).

**Issue**: Command appears in help but crashes when run
- **Cause**: Handler not wrapped with `tracked()` or function import mismatch.
- **Fix**: Verify import name matches function export. Wrap with `tracked('command-name', handler)`.

**Issue**: "Error: __exit__" appears in output for user errors
- **Cause**: Throwing generic error instead of using error exit pattern.
- **Fix**: Use `console.error(chalk.red('message')); throw new Error('__exit__');` for user-facing errors.

**Issue**: --dry-run flag not recognized
- **Cause**: Option not declared with `.option()` or wrong camelCase in interface.
- **Fix**: Add `.option('--dry-run', 'Description')` and ensure options interface has `dryRun?: boolean`.

**Issue**: Subcommand crashes but parent command works
- **Cause**: Using `program.command()` instead of `groupVar.command()` for subcommands.
- **Fix**: Register on group: `const sources = program.command('sources'); sources.command('add')...`

**Issue**: Telemetry not appearing
- **Cause**: Handler not wrapped with `tracked()` or wrong command name.
- **Fix**: Ensure `.action(tracked('{kebab-case}', handler))` wraps handler. Use colon for subcommands like 'sources:add'.

**Issue**: "Cannot find module" with relative imports
- **Cause**: Using `.ts` extension in imports.
- **Fix**: Always use `.js` extension: `import { x } from '../lib/file.js'` (required for ESM).