import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync, execFileSync } from 'child_process';
import chalk from 'chalk';
import ora from 'ora';
import confirm from '@inquirer/confirm';

const __dirname_vc = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  fs.readFileSync(path.resolve(__dirname_vc, '..', 'package.json'), 'utf-8')
);

export function getChannel(version: string): string {
  const match = version.match(/-(dev|next)\./);
  return match ? match[1] : 'latest';
}

export function isNewer(registry: string, current: string): boolean {
  const parse = (v: string) => {
    const [core, pre] = v.split('-');
    const parts = core.split('.').map(Number);
    return { major: parts[0], minor: parts[1], patch: parts[2], pre };
  };
  const r = parse(registry);
  const c = parse(current);
  if (r.major !== c.major) return r.major > c.major;
  if (r.minor !== c.minor) return r.minor > c.minor;
  if (r.patch !== c.patch) return r.patch > c.patch;
  if (!r.pre && c.pre) return true;
  if (r.pre && !c.pre) return false;
  if (r.pre && c.pre) return r.pre > c.pre;
  return false;
}

function getInstalledVersion(): string | null {
  try {
    const globalRoot = execSync('npm root -g', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    const pkgPath = path.join(globalRoot, '@rely-ai', 'caliber', 'package.json');
    return JSON.parse(fs.readFileSync(pkgPath, 'utf-8')).version;
  } catch {
    return null;
  }
}

export async function checkForUpdates(): Promise<void> {
  if (process.env.CALIBER_SKIP_UPDATE_CHECK) return;

  try {
    const current = pkg.version as string;
    const channel = getChannel(current);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    const res = await fetch(`https://registry.npmjs.org/@rely-ai/caliber/${channel}`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) return;

    const data = (await res.json()) as { version?: string };
    const latest = data.version;
    if (!latest) return;

    if (!isNewer(latest, current)) return;

    const isInteractive = process.stdin.isTTY === true;

    if (!isInteractive) {
      const installTag = channel === 'latest' ? '' : `@${channel}`;
      console.log(
        chalk.yellow(
          `\nUpdate available: ${current} -> ${latest}\nRun ${chalk.bold(`npm install -g @rely-ai/caliber${installTag}`)} to upgrade.\n`
        )
      );
      return;
    }

    console.log(
      chalk.yellow(`\nUpdate available: ${current} -> ${latest}`)
    );

    const shouldUpdate = await confirm({ message: 'Would you like to update now? (Y/n)', default: true });
    if (!shouldUpdate) {
      console.log();
      return;
    }

    const tag = channel === 'latest' ? latest : channel;
    if (!/^[\w.\-]+$/.test(tag)) return;
    const spinner = ora('Updating caliber...').start();
    try {
      execFileSync('npm', ['install', '-g', `@rely-ai/caliber@${tag}`], {
        stdio: 'pipe',
        timeout: 120_000,
        env: { ...process.env, npm_config_fund: 'false', npm_config_audit: 'false' },
      });

      const installed = getInstalledVersion();
      if (installed !== latest) {
        spinner.fail(`Update incomplete — got ${installed ?? 'unknown'}, expected ${latest}`);
        console.log(chalk.yellow(`Run ${chalk.bold(`npm install -g @rely-ai/caliber@${tag}`)} manually.\n`));
        return;
      }

      spinner.succeed(chalk.green(`Updated to ${latest}`));

      const args = process.argv.slice(2);
      console.log(chalk.dim(`\nRestarting: caliber ${args.join(' ')}\n`));
      execFileSync('caliber', args, {
        stdio: 'inherit',
        env: { ...process.env, CALIBER_SKIP_UPDATE_CHECK: '1' },
      });
      process.exit(0);
    } catch (err) {
      spinner.fail('Update failed');
      if (err instanceof Error) {
        const stderr = (err as unknown as Record<string, unknown>).stderr;
        const errMsg = stderr ? String(stderr).trim().split('\n').pop() : err.message.split('\n')[0];
        if (errMsg && !errMsg.includes('SIGTERM')) console.log(chalk.dim(`  ${errMsg}`));
      }
      console.log(
        chalk.yellow(
          `Run ${chalk.bold(`npm install -g @rely-ai/caliber@${tag}`)} manually to upgrade.\n`
        )
      );
    }
  } catch {
    // Silently ignore — offline, timeout, registry down, etc.
  }
}
