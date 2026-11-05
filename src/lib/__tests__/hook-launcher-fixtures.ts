import { onTestFinished, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync, spawnSync } from 'child_process';
import { HOOK_LAUNCHER_SHELL_PATH, resolveHookBinary } from '../hook-launcher.js';
import { resetResolvedCaliber } from '../resolve-caliber.js';

export const NVM_CALIBER = '/home/dev/.nvm/versions/node/v24.21.0/bin/caliber';
export const SYSTEM_PATH = '/usr/bin:/bin';

export interface Sandbox {
  root: string;
  home: string;
  project: string;
  launcherFile: string;
  resolveCaliberTo: (resolved: string) => void;
}

export function createSandbox(resolved: string, homeName = 'home'): Sandbox {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-launcher-'));
  const home = path.join(root, homeName);
  const project = path.join(root, 'project');
  const gitDir = path.join(project, '.git');
  fs.mkdirSync(home);
  fs.mkdirSync(path.join(gitDir, 'hooks'), { recursive: true });

  const originalHome = process.env.HOME;
  const originalCwd = process.cwd();
  process.env.HOME = home;
  process.chdir(project);
  onTestFinished(() => {
    process.env.HOME = originalHome;
    process.chdir(originalCwd);
    fs.rmSync(root, { recursive: true, force: true });
  });

  const resolveCaliberTo = (next: string) => {
    resetResolvedCaliber();
    vi.mocked(execSync).mockImplementation((cmd: string) =>
      cmd.includes('which caliber') ? `${next}\n` : `${gitDir}\n`,
    );
  };
  resolveCaliberTo(resolved);

  const launcherFile = HOOK_LAUNCHER_SHELL_PATH.replace('$HOME', home);
  return { root, home, project, launcherFile, resolveCaliberTo };
}

export function createLauncherSandbox(): Sandbox {
  const sandbox = createSandbox(NVM_CALIBER);
  resolveHookBinary();
  return sandbox;
}

export function read(file: string): string {
  return fs.readFileSync(file, 'utf-8');
}

export function writeExecutable(file: string, body: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body, { mode: 0o755 });
}

export function writeTaggedCaliber(file: string, tag: string): void {
  writeExecutable(
    file,
    `#!/bin/sh\nprintf '%s' '${tag}'\nfor arg in "$@"; do printf '[%s]' "$arg"; done\n`,
  );
}

export function writeSentinelBinary(file: string, sentinel: string): void {
  writeExecutable(file, `#!/bin/sh\n: > "${sentinel}"\n`);
}

export function runSh(
  sandbox: Sandbox,
  shArgs: string[],
  { pathEnv, input }: { pathEnv: string; input?: string },
) {
  return spawnSync('/bin/sh', shArgs, {
    cwd: sandbox.project,
    encoding: 'utf-8',
    timeout: 10_000,
    input,
    env: { HOME: sandbox.home, PATH: pathEnv },
  });
}

export function runLauncher(sandbox: Sandbox, pathEnv: string, args: string[] = []) {
  return runSh(sandbox, [sandbox.launcherFile, ...args], { pathEnv });
}
