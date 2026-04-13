import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initCommand } from './commands/init.js';
import { undoCommand } from './commands/undo.js';
import { statusCommand } from './commands/status.js';
import { regenerateCommand } from './commands/regenerate.js';
import { recommendCommand } from './commands/recommend.js';
import { scoreCommand } from './commands/score.js';
import { refreshCommand } from './commands/refresh.js';
import { hooksCommand } from './commands/hooks.js';
import { configCommand } from './commands/config.js';
import {
  learnObserveCommand,
  learnFinalizeCommand,
  learnInstallCommand,
  learnRemoveCommand,
  learnStatusCommand,
  learnListCommand,
  learnDeleteCommand,
  learnAddCommand,
} from './commands/learn.js';
import { insightsCommand } from './commands/insights.js';
import { sourcesListCommand, sourcesAddCommand, sourcesRemoveCommand } from './commands/sources.js';
import { publishCommand } from './commands/publish.js';
import { bootstrapCommand } from './commands/bootstrap.js';
import { uninstallCommand } from './commands/uninstall.js';
import { setTelemetryDisabled } from './telemetry/config.js';
import { initTelemetry, trackEvent } from './telemetry/index.js';
import { checkPendingNotifications } from './lib/notifications.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf-8'));

const program = new Command();

const displayVersion = process.env.CALIBER_LOCAL ? `${pkg.version}-local` : pkg.version;

program
  .name(process.env.CALIBER_LOCAL ? 'caloc' : 'caliber')
  .description('AI context infrastructure for coding agents')
  .version(displayVersion)
  .option('--no-traces', 'Disable anonymous telemetry for this run');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tracked<T extends (...args: any[]) => any>(commandName: string, handler: T): T {
  const wrapper = async (...args: Parameters<T>) => {
    const start = Date.now();
    const isCI = !!(process.env.CI || process.env.GITHUB_ACTIONS);
    trackEvent('command_started', {
      command: commandName,
      cli_version: pkg.version,
      is_ci: isCI,
    });
    try {
      await handler(...args);
      trackEvent('command_completed', {
        command: commandName,
        duration_ms: Date.now() - start,
        success: true,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      const errorType = err instanceof Error ? err.constructor.name : typeof err;
      if (errorMessage !== '__exit__') {
        trackEvent('command_error', {
          command: commandName,
          error_type: errorType,
          error_message: errorMessage,
        });
      }
      trackEvent('command_completed', {
        command: commandName,
        duration_ms: Date.now() - start,
        success: false,
      });
      throw err;
    }
  };
  return wrapper as unknown as T;
}

program.hook('preAction', (thisCommand) => {
  const opts = thisCommand.optsWithGlobals();
  if (opts.traces === false) {
    setTelemetryDisabled(true);
  }
  initTelemetry();

  // Show pending learning notifications (skip for learn subcommands to avoid recursion)
  const cmdName = thisCommand.name();
  if (cmdName !== 'learn' && cmdName !== 'observe' && cmdName !== 'finalize') {
    checkPendingNotifications();
  }
});

function parseAgentOption(
  value: string,
): ('claude' | 'cursor' | 'codex' | 'opencode' | 'github-copilot')[] {
  if (value === 'both') return ['claude', 'cursor'];
  if (value === 'all') return ['claude', 'cursor', 'codex', 'opencode', 'github-copilot'];
  const valid = ['claude', 'cursor', 'codex', 'opencode', 'github-copilot'];
  const agents = [
    ...new Set(
      value
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter((a) => valid.includes(a)),
    ),
  ];
  if (agents.length === 0) {
    console.error(
      `Invalid agent "${value}". Choose from: claude, cursor, codex, opencode, github-copilot (comma-separated for multiple)`,
    );
    process.exit(1);
  }
  return agents as ('claude' | 'cursor' | 'codex' | 'opencode' | 'github-copilot')[];
}

program
  .command('init')
  .description('Initialize your project for AI-assisted development')
  .option(
    '--agent <type>',
    'Target agents (comma-separated): claude, cursor, codex, opencode, github-copilot',
    parseAgentOption,
  )
  .option('--source <paths...>', 'Related source paths to include as context')
  .option('--dry-run', 'Preview changes without writing files')
  .option('--force', 'Overwrite existing config without prompting')
  .option('--debug-report', undefined, false)
  .option('--show-tokens', 'Show token usage summary at the end')
  .option('--auto-approve', 'Run without interactive prompts (auto-accept all)')
  .option('--verbose', 'Show detailed logs of each step')
  .option('--thorough', 'Deep analysis — more refinement passes for maximum quality')
  .action(tracked('init', initCommand));

program
  .command('bootstrap')
  .description(
    'Install agent skills (/setup-caliber, /find-skills, /save-learning) without running init',
  )
  .action(tracked('bootstrap', bootstrapCommand));

program
  .command('undo')
  .description('Revert all config changes made by Caliber')
  .action(tracked('undo', undoCommand));

program
  .command('uninstall')
  .description('Remove all Caliber resources from this project')
  .option('--force', 'Skip confirmation prompt')
  .action(tracked('uninstall', (options) => uninstallCommand(options)));

program
  .command('status')
  .description('Show current Caliber config status')
  .option('--json', 'Output as JSON')
  .action(tracked('status', statusCommand));

program
  .command('regenerate')
  .alias('regen')
  .alias('re')
  .description('Re-analyze project and regenerate config')
  .option('--dry-run', 'Preview changes without writing files')
  .action(tracked('regenerate', regenerateCommand));

program
  .command('config')
  .description('Configure LLM provider, API key, and model')
  .action(tracked('config', configCommand));

program
  .command('skills')
  .description('Discover and install community skills for your project')
  .option('--query <terms>', 'Search for skills by topic (e.g. "react frontend")')
  .option('--install <slugs>', 'Install specific skills by slug (comma-separated)')
  .action(tracked('skills', recommendCommand));

program
  .command('score')
  .description('Score your AI context configuration (deterministic, no network)')
  .option('--json', 'Output as JSON')
  .option('--quiet', 'One-line output for scripts/hooks')
  .option(
    '--agent <type>',
    'Target agents (comma-separated): claude, cursor, codex, opencode, github-copilot',
    parseAgentOption,
  )
  .option('--compare <ref>', 'Compare score against a git ref (branch, tag, or SHA)')
  .action(tracked('score', scoreCommand));

program
  .command('refresh')
  .description('Update docs based on recent code changes')
  .option('--quiet', 'Suppress output (for use in hooks)')
  .option('--dry-run', 'Preview changes without writing files')
  .action(tracked('refresh', refreshCommand));

program
  .command('hooks')
  .description('Manage auto-refresh hooks (toggle interactively)')
  .option('--install', 'Enable all hooks non-interactively')
  .option('--remove', 'Disable all hooks non-interactively')
  .action(tracked('hooks', hooksCommand));

program
  .command('insights')
  .description('Show agent performance insights and learning impact')
  .option('--json', 'Output as JSON')
  .action(tracked('insights', insightsCommand));

const sources = program
  .command('sources')
  .description('Manage external context sources (related repos, docs)');

sources
  .command('list')
  .description('Show configured and auto-detected sources')
  .action(tracked('sources:list', sourcesListCommand));

sources
  .command('add')
  .description('Add an external source')
  .argument('<path>', 'Path to repo directory or file')
  .action(tracked('sources:add', sourcesAddCommand));

sources
  .command('remove')
  .description('Remove a configured source')
  .argument('<name>', 'Source path or role to remove')
  .action(tracked('sources:remove', sourcesRemoveCommand));

program
  .command('publish')
  .description('Generate a machine-readable summary for other repos to consume')
  .action(tracked('publish', publishCommand));

const learn = program
  .command('learn')
  .description('Manage session learning — extract patterns from your AI coding sessions');

learn
  .command('observe')
  .description('Record a tool event from stdin (called by hooks)')
  .option('--failure', 'Mark event as a tool failure')
  .option('--prompt', 'Record a user prompt event')
  .action(tracked('learn:observe', learnObserveCommand));

learn
  .command('finalize')
  .description('Analyze session events and update CALIBER_LEARNINGS.md (called on SessionEnd)')
  .option('--force', 'Skip the running-process check (for manual invocation)')
  .option('--auto', 'Silent mode for hooks (lower threshold, no interactive output)')
  .option('--incremental', 'Extract learnings mid-session without clearing events')
  .action(
    tracked('learn:finalize', (opts: { force?: boolean; auto?: boolean; incremental?: boolean }) =>
      learnFinalizeCommand(opts),
    ),
  );

learn
  .command('install')
  .description('Install learning hooks into .claude/settings.json')
  .action(tracked('learn:install', learnInstallCommand));

learn
  .command('remove')
  .description('Remove learning hooks from .claude/settings.json')
  .action(tracked('learn:remove', learnRemoveCommand));

learn
  .command('status')
  .description('Show learning system status')
  .action(tracked('learn:status', learnStatusCommand));

learn
  .command('list')
  .description('List all learnings with their source and activation data')
  .option('--verbose', 'Show explanations and activation counts')
  .action(tracked('learn:list', (opts: { verbose?: boolean }) => learnListCommand(opts)));

learn
  .command('delete <index>')
  .description('Delete a learning by its index number (from `caliber learn list`)')
  .action(tracked('learn:delete', (index: string) => learnDeleteCommand(index)));

learn
  .command('add <content>')
  .description('Add a learning directly (used by agent skills)')
  .option('--personal', 'Save as a personal learning instead of project-level')
  .action(tracked('learn:add', learnAddCommand));

export { program };
