import { describe, it, expect, vi, onTestFinished } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';
import { HOOK_LAUNCHER_SHELL_PATH, hasStaleCaliberPath } from '../hook-launcher.js';
import { installPreCommitHook } from '../hooks.js';
import { resetResolvedCaliber } from '../resolve-caliber.js';
import {
  NVM_CALIBER,
  PRE_COMMIT_FILE,
  STABLE_CALIBER,
  SYSTEM_PATH,
  claudeLearning,
  createLauncherSandbox,
  createSandbox,
  cursorLearning,
  dequoted,
  freshnessScript,
  preCommit,
  read,
  runLauncher,
  sessionEnd,
  syncScript,
  onEditScript,
  writeExecutable,
  writeSentinelBinary,
  writeTaggedCaliber,
  type Sandbox,
  type Surface,
} from './hook-launcher-fixtures.js';

vi.mock('child_process', async (importActual) => ({
  ...(await importActual<typeof import('child_process')>()),
  execSync: vi.fn(),
}));

const posixDescribe = describe.skipIf(process.platform === 'win32');

const NVM_INSTALL = '.nvm/versions/node/v24.1.0/bin/caliber';
const NPX_BINARY = '/home/dev/.nvm/versions/node/v24.1.0/bin/npx';
const CORE_SURFACES = [claudeLearning, sessionEnd, cursorLearning, preCommit, freshnessScript];

const RELATIVE_PATHS: Array<[string, string, string]> = [
  ['a dot entry', `.:${SYSTEM_PATH}`, '.'],
  ['an empty entry', `:${SYSTEM_PATH}`, '.'],
  ['a relative directory', `tools:${SYSTEM_PATH}`, 'tools'],
];

const NPX_CONTEXTS = [
  { context: 'argv under _npx', argv1: '/home/dev/.npm/_npx/abc/bin/caliber', npmExecpath: '' },
  { context: 'npm_execpath naming npx', argv1: '/opt/runner', npmExecpath: '/opt/npm/npx-cli.js' },
];

const DEAD_QUOTED_PATHS = [
  [
    'a version path under a home with a space',
    '/Users/other dev/.nvm/versions/node/v24/bin/caliber',
  ],
  [
    'a path under Library/Application Support',
    '/Users/other-dev/Library/Application Support/bin/caliber',
  ],
];

const JSON_SURFACES = [claudeLearning, sessionEnd, cursorLearning];
const ALL_SURFACES = [...CORE_SURFACES, syncScript, onEditScript];
const BARE_RESOLUTION_CONTEXT = { argv1: '/opt/runner', npmExecpath: '' };
const LIVE_STABLE_WITH_SPACE = '/opt/my tools/bin/caliber';

const DEAD_UNQUOTED_PATHS = [
  [
    'a version path under a home with a space',
    '/Users/other dev/.nvm/versions/node/v24/bin/caliber',
  ],
  [
    'a macOS fnm path',
    '/Users/other-dev/Library/Application Support/fnm/node-versions/v24.1.0/installation/bin/caliber',
  ],
  ['an unmanaged path with a space', '/Users/other dev/tools/bin/caliber'],
];

const DEAD_UNQUOTED_REPAIRS = JSON_SURFACES.flatMap((surface) =>
  DEAD_UNQUOTED_PATHS.map(([label, dead]) => ({ ...surface, label, dead })),
);

function plantJsonHookPath(surface: Surface, baked: string): void {
  surface.install();
  const artifact = surface.artifact();
  fs.writeFileSync(artifact, read(artifact).replaceAll(STABLE_CALIBER, baked));
}

interface FailedWhichContext {
  argv1: string;
  npmExecpath: string;
}

function failWhichCaliber(sandbox: Sandbox, { argv1, npmExecpath }: FailedWhichContext): void {
  const originalArgv = process.argv;
  process.argv = [originalArgv[0], argv1];
  vi.stubEnv('npm_execpath', npmExecpath);
  onTestFinished(() => {
    process.argv = originalArgv;
    vi.unstubAllEnvs();
  });
  resetResolvedCaliber();
  vi.mocked(execSync).mockImplementation((cmd: string) => {
    if (cmd.includes('which caliber')) throw new Error('not found');
    return cmd.includes('which npx')
      ? `${NPX_BINARY}\n`
      : `${path.join(sandbox.project, '.git')}\n`;
  });
}

function plantDeadPreCommit(sandbox: Sandbox, dead: string): void {
  sandbox.resolveCaliberTo(STABLE_CALIBER);
  installPreCommitHook();
  fs.writeFileSync(PRE_COMMIT_FILE, read(PRE_COMMIT_FILE).replaceAll(STABLE_CALIBER, dead));
  sandbox.resolveCaliberTo(NVM_CALIBER);
}

describe('test home isolation', () => {
  it('points HOME and USERPROFILE at one directory that is not the account home', () => {
    expect(process.env.USERPROFILE).toBe(process.env.HOME);
    expect(os.homedir()).toBe(process.env.HOME);
    expect(process.env.HOME).not.toBe(os.userInfo().homedir);
  });
});

posixDescribe('launcher helpers under a relative PATH', () => {
  it.each(RELATIVE_PATHS)(
    'finds the nvm install and runs no repo helper through %s',
    (_label, pathEnv, helperDir) => {
      const sandbox = createLauncherSandbox();
      const sentinel = path.join(sandbox.root, 'repo-helper-ran');
      for (const helper of ['sort', 'tail', 'cut', 'caliber']) {
        writeSentinelBinary(path.join(sandbox.project, helperDir, helper), sentinel);
      }
      writeTaggedCaliber(path.join(sandbox.home, NVM_INSTALL), 'nvm');

      const result = runLauncher(sandbox, pathEnv);

      expect(fs.existsSync(sentinel)).toBe(false);
      expect(result.stdout).toBe('nvm');
    },
  );

  it.each(RELATIVE_PATHS)('gives caliber a PATH without %s', (_label, pathEnv) => {
    const sandbox = createLauncherSandbox();
    writeExecutable(path.join(sandbox.home, NVM_INSTALL), `#!/bin/sh\nprintf '%s' "$PATH"\n`);

    const result = runLauncher(sandbox, pathEnv);

    const relativeEntries = result.stdout.split(':').filter((entry) => !entry.startsWith('/'));
    expect(relativeEntries).toEqual([]);
  });

  it('keeps absolute PATH entries for caliber', () => {
    const sandbox = createLauncherSandbox();
    const bin = path.join(sandbox.root, 'on-path');
    const extra = path.join(sandbox.root, 'extra');
    writeExecutable(path.join(bin, 'caliber'), `#!/bin/sh\nprintf '%s' "$PATH"\n`);

    const result = runLauncher(sandbox, `.:${bin}:${extra}:${SYSTEM_PATH}`);

    expect(result.stdout.split(':')).toEqual(expect.arrayContaining([bin, extra]));
  });

  it('finds an nvm install when PATH holds only the launcher directory', () => {
    const sandbox = createLauncherSandbox();
    writeTaggedCaliber(path.join(sandbox.home, NVM_INSTALL), 'nvm');

    const result = runLauncher(sandbox, path.dirname(sandbox.launcherFile));

    expect(result.stdout).toBe('nvm');
  });
});

posixDescribe.each(NPX_CONTEXTS)('hooks resolved through npx with $context', (context) => {
  it.each(CORE_SURFACES)('$name keeps the npx invocation and creates no launcher', (surface) => {
    const sandbox = createSandbox(NVM_CALIBER);
    failWhichCaliber(sandbox, context);

    surface.install();

    const generated = dequoted(read(surface.artifact()));
    expect(generated).toContain(`${NPX_BINARY} --yes @rely-ai/caliber`);
    expect(generated).not.toContain(HOOK_LAUNCHER_SHELL_PATH);
    expect(fs.existsSync(sandbox.launcherFile)).toBe(false);
  });

  it.each(CORE_SURFACES)('$name reports alreadyInstalled on reinstall', (surface) => {
    const sandbox = createSandbox(NVM_CALIBER);
    failWhichCaliber(sandbox, context);
    surface.install();

    const result = surface.install();

    expect(result.alreadyInstalled).toBe(true);
  });
});

posixDescribe('hooks using a live launcher', () => {
  it.each(CORE_SURFACES)('$name migrates to a stable install', (surface) => {
    const sandbox = createSandbox(NVM_CALIBER);
    surface.install();
    sandbox.resolveCaliberTo(STABLE_CALIBER);

    const result = surface.install();

    const migrated = dequoted(read(surface.artifact()));
    expect(result.alreadyInstalled).toBe(false);
    expect(migrated).toContain(STABLE_CALIBER);
    expect(migrated).not.toContain(HOOK_LAUNCHER_SHELL_PATH);
    expect(migrated).not.toContain(sandbox.launcherFile);
  });

  it.each(CORE_SURFACES)('$name reports alreadyInstalled after migrating', (surface) => {
    const sandbox = createSandbox(NVM_CALIBER);
    surface.install();
    sandbox.resolveCaliberTo(STABLE_CALIBER);
    surface.install();

    const result = surface.install();

    expect(result.alreadyInstalled).toBe(true);
  });

  it.each(CORE_SURFACES)('$name stays untouched while version-managed', (surface) => {
    createSandbox(NVM_CALIBER);
    surface.install();
    const before = read(surface.artifact());

    const result = surface.install();

    expect(result.alreadyInstalled).toBe(true);
    expect(read(surface.artifact())).toBe(before);
  });
});

posixDescribe('fully quoted caliber paths', () => {
  it.each(DEAD_QUOTED_PATHS)('flags %s', (_label, dead) => {
    createSandbox(STABLE_CALIBER);

    expect(hasStaleCaliberPath(`"${dead}" refresh --quiet`)).toBe(true);
  });

  it.each(DEAD_QUOTED_PATHS)('repairs %s in a pre-commit block', (_label, dead) => {
    const sandbox = createSandbox(NVM_CALIBER);
    plantDeadPreCommit(sandbox, dead);

    const result = installPreCommitHook();

    const repaired = dequoted(read(PRE_COMMIT_FILE));
    expect(result.alreadyInstalled).toBe(false);
    expect(repaired).not.toContain(dead);
    expect(repaired).toContain(HOOK_LAUNCHER_SHELL_PATH);
  });

  it.each(DEAD_QUOTED_PATHS)('reports alreadyInstalled after repairing %s', (_label, dead) => {
    const sandbox = createSandbox(NVM_CALIBER);
    plantDeadPreCommit(sandbox, dead);
    installPreCommitHook();

    expect(installPreCommitHook().alreadyInstalled).toBe(true);
  });

  it.each([STABLE_CALIBER, '/opt/my tools/bin/caliber'])(
    'accepts the current stable path %s',
    (current) => {
      createSandbox(current);

      expect(hasStaleCaliberPath(`"${current}" refresh --quiet`)).toBe(false);
    },
  );

  it('accepts a live path with a space other than the current resolution', () => {
    const sandbox = createSandbox(STABLE_CALIBER);
    const live = path.join(sandbox.root, 'my tools', 'bin', 'caliber');
    writeExecutable(live, '#!/bin/sh\n');

    expect(hasStaleCaliberPath(`"${live}" refresh --quiet`)).toBe(false);
  });
});

posixDescribe('unquoted caliber paths with a space in hook commands', () => {
  it.each(DEAD_UNQUOTED_REPAIRS)('$name repairs $label', (surface) => {
    createSandbox(STABLE_CALIBER);
    plantJsonHookPath(surface, surface.dead);

    const result = surface.install();

    const repaired = read(surface.artifact());
    expect(result.alreadyInstalled).toBe(false);
    expect(repaired).not.toContain(surface.dead);
    expect(repaired).toContain(STABLE_CALIBER);
  });

  it.each(DEAD_UNQUOTED_REPAIRS)('$name reports alreadyInstalled after $label', (surface) => {
    createSandbox(STABLE_CALIBER);
    plantJsonHookPath(surface, surface.dead);
    surface.install();

    expect(surface.install().alreadyInstalled).toBe(true);
  });

  it.each(JSON_SURFACES)('$name keeps a current stable path with a space', (surface) => {
    createSandbox(LIVE_STABLE_WITH_SPACE);
    surface.install();
    const before = read(surface.artifact());

    const result = surface.install();

    expect(result.alreadyInstalled).toBe(true);
    expect(read(surface.artifact())).toBe(before);
  });
});

posixDescribe('unquoted hook commands that stay untouched', () => {
  it.each([
    ['a wrapper around the current stable path', `/usr/bin/time ${STABLE_CALIBER}`],
    ['a non-current absolute npx', '/usr/local/bin/npx --yes @rely-ai/caliber'],
    ['a non-current absolute npx without --yes', '/usr/local/bin/npx @rely-ai/caliber'],
  ])('Claude learning hooks keep %s', (_label, invocation) => {
    createSandbox(STABLE_CALIBER);
    plantJsonHookPath(claudeLearning, invocation);
    const before = read(claudeLearning.artifact());

    const result = claudeLearning.install();

    expect(result.alreadyInstalled).toBe(true);
    expect(read(claudeLearning.artifact())).toBe(before);
  });

  it.each(JSON_SURFACES)('$name keeps a live path with a space', (surface) => {
    const sandbox = createSandbox(STABLE_CALIBER);
    const live = path.join(sandbox.root, 'my tools', 'bin', 'caliber');
    writeExecutable(live, '#!/bin/sh\n');
    plantJsonHookPath(surface, live);
    const before = read(surface.artifact());

    const result = surface.install();

    expect(result.alreadyInstalled).toBe(true);
    expect(read(surface.artifact())).toBe(before);
  });
});

posixDescribe('launcher hooks when which fails and caliber resolves to a bare name', () => {
  it.each(ALL_SURFACES)('$name stays untouched while the launcher is live', (surface) => {
    const sandbox = createSandbox(NVM_CALIBER);
    surface.install();
    const before = read(surface.artifact());
    failWhichCaliber(sandbox, BARE_RESOLUTION_CONTEXT);

    const result = surface.install();

    expect(result.alreadyInstalled).toBe(true);
    expect(read(surface.artifact())).toBe(before);
  });

  it.each(ALL_SURFACES)('$name is repaired when the launcher is missing', (surface) => {
    const sandbox = createSandbox(NVM_CALIBER);
    surface.install();
    fs.rmSync(sandbox.launcherFile);
    failWhichCaliber(sandbox, BARE_RESOLUTION_CONTEXT);

    const result = surface.install();

    const repaired = dequoted(read(surface.artifact()));
    expect(result.alreadyInstalled).toBe(false);
    expect(repaired).not.toContain(HOOK_LAUNCHER_SHELL_PATH);
    expect(repaired).not.toContain(sandbox.launcherFile);
  });
});
