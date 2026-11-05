import { describe, it, expect, vi, onTestFinished } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  HOOK_LAUNCHER_SHELL_PATH,
  hasStaleCaliberPath,
  resolveHookBinary,
} from '../hook-launcher.js';
import {
  installHook,
  installPostToolUseSyncHook,
  installPreCommitHook,
  installSessionStartHook,
  installSessionStartSyncHook,
} from '../hooks.js';
import { installCursorLearningHooks, installLearningHooks } from '../learning-hooks.js';
import {
  NVM_CALIBER,
  SYSTEM_PATH,
  createLauncherSandbox,
  createSandbox,
  read,
  runSh,
  writeExecutable,
  writeSentinelBinary,
  type Sandbox,
} from './hook-launcher-fixtures.js';

vi.mock('child_process', async (importActual) => ({
  ...(await importActual<typeof import('child_process')>()),
  execSync: vi.fn(),
}));

const posixDescribe = describe.skipIf(process.platform === 'win32');

const DEAD_CALIBER = '/Users/other-dev/.nvm/versions/node/v24.20.0/bin/caliber';
const STABLE_CALIBER = '/opt/homebrew/bin/caliber';
const USER_COMMAND = 'user-tool run';
const HOME_NAMES = ['home', 'my home'];

const SETTINGS_FILE = path.join('.claude', 'settings.json');
const CURSOR_FILE = path.join('.cursor', 'hooks.json');
const PRE_COMMIT_FILE = path.join('.git', 'hooks', 'pre-commit');

function installedScript(): string {
  const dir = path.join('.claude', 'hooks');
  return path.join(dir, fs.readdirSync(dir)[0]);
}

// Because quoting varies per surface, real sh runs pin it, not text checks.
function dequoted(text: string): string {
  return text.replace(/\\?"/g, '');
}

function claudeCommands(): string[] {
  const { hooks } = JSON.parse(read(SETTINGS_FILE)) as {
    hooks: Record<string, Array<{ hooks: Array<{ command: string }> }>>;
  };
  return Object.values(hooks)
    .flat()
    .flatMap((entry) => entry.hooks)
    .map((hook) => hook.command);
}

function cursorCommands(): string[] {
  const { hooks } = JSON.parse(read(CURSOR_FILE)) as {
    hooks: Record<string, Array<{ command: string }>>;
  };
  return Object.values(hooks)
    .flat()
    .map((hook) => hook.command);
}

function addClaudeUserHook(): void {
  const settings = JSON.parse(read(SETTINGS_FILE));
  const [event] = Object.keys(settings.hooks);
  settings.hooks[event].push({
    matcher: '',
    hooks: [{ type: 'command', command: USER_COMMAND }],
  });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

function addCursorUserHook(): void {
  const config = JSON.parse(read(CURSOR_FILE));
  const [event] = Object.keys(config.hooks);
  config.hooks[event].push({ command: USER_COMMAND });
  fs.writeFileSync(CURSOR_FILE, JSON.stringify(config, null, 2));
}

function surroundPreCommitWithUserLines(): void {
  const block = read(PRE_COMMIT_FILE).replace('#!/bin/sh\n', '');
  fs.writeFileSync(PRE_COMMIT_FILE, `#!/bin/sh\necho user-before\n${block}\necho user-after\n`);
}

interface Surface {
  name: string;
  install: () => { alreadyInstalled: boolean };
  artifact: () => string;
}

const preCommit: Surface = {
  name: 'pre-commit block',
  install: installPreCommitHook,
  artifact: () => PRE_COMMIT_FILE,
};
const claudeLearning: Surface = {
  name: 'Claude learning hooks',
  install: installLearningHooks,
  artifact: () => SETTINGS_FILE,
};
const sessionEnd: Surface = {
  name: 'Claude SessionEnd hook',
  install: installHook,
  artifact: () => SETTINGS_FILE,
};
const cursorLearning: Surface = {
  name: 'Cursor learning hooks',
  install: installCursorLearningHooks,
  artifact: () => CURSOR_FILE,
};
const freshnessScript: Surface = {
  name: 'freshness script',
  install: installSessionStartHook,
  artifact: installedScript,
};
const syncScript: Surface = {
  name: 'session-start sync script',
  install: installSessionStartSyncHook,
  artifact: installedScript,
};
const onEditScript: Surface = {
  name: 'on-edit sync script',
  install: installPostToolUseSyncHook,
  artifact: installedScript,
};

const SHELL_FORM_SURFACES = [
  preCommit,
  claudeLearning,
  sessionEnd,
  freshnessScript,
  syncScript,
  onEditScript,
];

const HOOK_RUNS = [
  { name: 'pre-commit hook', install: installPreCommitHook, command: () => PRE_COMMIT_FILE },
  {
    name: 'Claude learning hook',
    install: installLearningHooks,
    command: () => claudeCommands()[0],
  },
  { name: 'Claude SessionEnd hook', install: installHook, command: () => claudeCommands()[0] },
  {
    name: 'Cursor learning hook',
    install: installCursorLearningHooks,
    command: () => cursorCommands()[0],
  },
  {
    name: 'session-start sync script',
    install: installSessionStartSyncHook,
    command: installedScript,
  },
  {
    name: 'on-edit sync script',
    install: installPostToolUseSyncHook,
    command: installedScript,
    input: '{"file_path":".claude/skills/x/SKILL.md"}',
  },
];

const shellLauncherForm = () => HOOK_LAUNCHER_SHELL_PATH;
const USER_COMMAND_PATTERN = new RegExp(USER_COMMAND);

const REPAIR_SURFACES = [
  {
    ...claudeLearning,
    launcherForm: shellLauncherForm,
    seedUserContent: addClaudeUserHook,
    userContentFile: SETTINGS_FILE,
    survivingUserContent: USER_COMMAND_PATTERN,
  },
  {
    ...sessionEnd,
    launcherForm: shellLauncherForm,
    seedUserContent: addClaudeUserHook,
    userContentFile: SETTINGS_FILE,
    survivingUserContent: USER_COMMAND_PATTERN,
  },
  {
    ...cursorLearning,
    launcherForm: (sandbox: Sandbox) => sandbox.launcherFile,
    seedUserContent: addCursorUserHook,
    userContentFile: CURSOR_FILE,
    survivingUserContent: USER_COMMAND_PATTERN,
  },
  {
    ...preCommit,
    launcherForm: shellLauncherForm,
    seedUserContent: surroundPreCommitWithUserLines,
    userContentFile: PRE_COMMIT_FILE,
    survivingUserContent: /echo user-before\n[\s\S]*echo user-after\n/,
  },
  {
    ...freshnessScript,
    launcherForm: shellLauncherForm,
    seedUserContent: addClaudeUserHook,
    userContentFile: SETTINGS_FILE,
    survivingUserContent: USER_COMMAND_PATTERN,
  },
];

type RepairSurface = (typeof REPAIR_SURFACES)[number];

const isRoot = process.getuid?.() === 0;

function makeHomeReadOnly(sandbox: Sandbox): void {
  fs.chmodSync(sandbox.home, 0o555);
  onTestFinished(() => fs.chmodSync(sandbox.home, 0o755));
}

function plantDirectoryAtLauncherPath(sandbox: Sandbox): void {
  fs.mkdirSync(sandbox.launcherFile, { recursive: true });
}

// Because root ignores directory modes, this row proves nothing as root.
const UNWRITABLE_HOMES = [
  ...(isRoot ? [] : [{ condition: 'a read-only HOME', makeUnwritable: makeHomeReadOnly }]),
  { condition: 'a directory at the launcher path', makeUnwritable: plantDirectoryAtLauncherPath },
];

function plantDeadHook(surface: RepairSurface, sandbox: Sandbox, current: string): void {
  sandbox.resolveCaliberTo(STABLE_CALIBER);
  surface.install();
  const artifact = surface.artifact();
  fs.writeFileSync(artifact, read(artifact).replaceAll(STABLE_CALIBER, DEAD_CALIBER));
  surface.seedUserContent();
  sandbox.resolveCaliberTo(current);
}

const SHELL_LAUNCHER_REFERENCES = [
  ['the launcher text form', HOOK_LAUNCHER_SHELL_PATH],
  ['the pre-commit launcher form', `"${HOOK_LAUNCHER_SHELL_PATH}"`],
  ['the variable-quoted launcher form', '"$HOME"/.caliber/bin/caliber'],
];

const INSTALLED_LAUNCHER_REFERENCES = SHELL_LAUNCHER_REFERENCES.filter(
  ([, form]) => !form.endsWith('"'),
);

function plantMissingLauncherHook(
  surface: RepairSurface,
  sandbox: Sandbox,
  { form, current }: { form: string; current: string },
): void {
  sandbox.resolveCaliberTo(STABLE_CALIBER);
  surface.install();
  const artifact = surface.artifact();
  const encoded = artifact.endsWith('.json') ? JSON.stringify(form).slice(1, -1) : form;
  const planted = read(artifact).replaceAll(`"${STABLE_CALIBER}"`, encoded);
  fs.writeFileSync(artifact, planted.replaceAll(STABLE_CALIBER, encoded));
  sandbox.resolveCaliberTo(current);
}

function fixUmask(mask: number): void {
  const previous = process.umask(mask);
  onTestFinished(() => {
    process.umask(previous);
  });
}

posixDescribe('test suite isolation', () => {
  it('never exposes the real account home to a test', () => {
    expect(os.homedir()).not.toBe(os.userInfo().homedir);
  });
});

posixDescribe('hooks generated for a version-managed install', () => {
  it.each(SHELL_FORM_SURFACES)('$name invokes the launcher, not a Node version', (surface) => {
    createSandbox(NVM_CALIBER);

    surface.install();

    const generated = read(surface.artifact());
    expect(dequoted(generated)).toContain(HOOK_LAUNCHER_SHELL_PATH);
    expect(generated).not.toContain('.nvm');
  });

  it('Cursor learning hooks invoke the launcher by absolute path', () => {
    const sandbox = createSandbox(NVM_CALIBER);

    installCursorLearningHooks();

    const invokers = cursorCommands().map((command) => dequoted(command).split(' ')[0]);
    expect(new Set(invokers)).toEqual(new Set([sandbox.launcherFile]));
  });

  it('routes through the launcher when which resolves to the launcher itself', () => {
    const sandbox = createSandbox(NVM_CALIBER);
    sandbox.resolveCaliberTo(sandbox.launcherFile);

    expect(resolveHookBinary()).toBe(HOOK_LAUNCHER_SHELL_PATH);
  });

  it('freshness message stays valid JSON and names the launcher', () => {
    const sandbox = createSandbox(NVM_CALIBER);
    installSessionStartHook();
    fs.mkdirSync('.caliber');
    fs.writeFileSync(path.join('.caliber', '.caliber-state.json'), '{"lastRefreshSha": "old"}');
    const fakeBin = path.join(sandbox.root, 'fake-bin');
    writeExecutable(
      path.join(fakeBin, 'git'),
      '#!/bin/sh\n[ "$1" = "rev-list" ] && echo 20 || echo new\n',
    );

    const result = runSh(sandbox, ['-c', installedScript()], {
      pathEnv: `${fakeBin}:${SYSTEM_PATH}`,
    });

    expect(JSON.parse(result.stdout).systemMessage).toContain(HOOK_LAUNCHER_SHELL_PATH);
  });
});

posixDescribe.each(HOME_NAMES)('generated hooks run under sh with HOME named "%s"', (homeName) => {
  it.each(HOOK_RUNS)(
    '$name reaches caliber after a Node upgrade',
    ({ install, command, input }) => {
      const sandbox = createSandbox(NVM_CALIBER, homeName);
      install();
      const invoked = path.join(sandbox.root, 'invoked');
      const upgraded = path.join(sandbox.home, '.nvm/versions/node/v26.0.0/bin/caliber');
      writeSentinelBinary(upgraded, invoked);

      runSh(sandbox, ['-c', command()], { pathEnv: SYSTEM_PATH, input });

      expect(fs.existsSync(invoked)).toBe(true);
    },
  );
});

posixDescribe.each(UNWRITABLE_HOMES)('installers given $condition', ({ makeUnwritable }) => {
  it.each([...SHELL_FORM_SURFACES, cursorLearning])(
    '$name falls back to the resolved path',
    (surface) => {
      const sandbox = createSandbox(NVM_CALIBER);
      makeUnwritable(sandbox);

      surface.install();

      expect(read(surface.artifact())).toContain(NVM_CALIBER);
    },
  );

  it.each([...SHELL_FORM_SURFACES, cursorLearning])(
    '$name reports alreadyInstalled on a repeat install and rewrites nothing',
    (surface) => {
      const sandbox = createSandbox(NVM_CALIBER);
      makeUnwritable(sandbox);
      surface.install();
      const before = read(surface.artifact());

      const result = surface.install();

      expect(result.alreadyInstalled).toBe(true);
      expect(read(surface.artifact())).toBe(before);
    },
  );
});

describe.skipIf(process.platform === 'win32' || isRoot)(
  'a HOME that becomes writable again',
  () => {
    it.each(REPAIR_SURFACES)('$name moves from the resolved path to the launcher', (surface) => {
      const sandbox = createSandbox(NVM_CALIBER);
      fs.chmodSync(sandbox.home, 0o555);
      surface.install();
      fs.chmodSync(sandbox.home, 0o755);

      surface.install();

      const repaired = dequoted(read(surface.artifact()));
      expect(repaired).not.toContain(NVM_CALIBER);
      expect(repaired).toContain(surface.launcherForm(sandbox));
    });
  },
);

posixDescribe.each(INSTALLED_LAUNCHER_REFERENCES)(
  'hooks using %s with no launcher file',
  (_label, form) => {
    it.each(REPAIR_SURFACES)('$name recreates the launcher when version-managed', (surface) => {
      const sandbox = createSandbox(NVM_CALIBER);
      plantMissingLauncherHook(surface, sandbox, { form, current: NVM_CALIBER });

      const result = surface.install();

      expect(result.alreadyInstalled).toBe(false);
      expect(fs.existsSync(sandbox.launcherFile)).toBe(true);
      expect(dequoted(read(surface.artifact()))).toContain(surface.launcherForm(sandbox));
    });

    it.each(REPAIR_SURFACES)('$name moves to a stable install without a launcher', (surface) => {
      const sandbox = createSandbox(STABLE_CALIBER);
      plantMissingLauncherHook(surface, sandbox, { form, current: STABLE_CALIBER });

      const result = surface.install();

      const repaired = read(surface.artifact());
      expect(result.alreadyInstalled).toBe(false);
      expect(repaired).toContain(STABLE_CALIBER);
      expect(dequoted(repaired)).not.toContain(HOOK_LAUNCHER_SHELL_PATH);
      expect(fs.existsSync(sandbox.launcherFile)).toBe(false);
    });

    it.each(REPAIR_SURFACES)('$name reports alreadyInstalled once repaired', (surface) => {
      const sandbox = createSandbox(NVM_CALIBER);
      plantMissingLauncherHook(surface, sandbox, { form, current: NVM_CALIBER });
      surface.install();

      const result = surface.install();

      expect(result.alreadyInstalled).toBe(true);
    });

    it.each(REPAIR_SURFACES)('$name reports alreadyInstalled on the stable path', (surface) => {
      const sandbox = createSandbox(STABLE_CALIBER);
      plantMissingLauncherHook(surface, sandbox, { form, current: STABLE_CALIBER });
      surface.install();

      const result = surface.install();

      expect(result.alreadyInstalled).toBe(true);
    });
  },
);

posixDescribe('a which result under the macOS fnm directory', () => {
  const MACOS_FNM_CALIBER =
    'Library/Application Support/fnm/node-versions/v24.1.0/installation/bin/caliber';

  it.each(REPAIR_SURFACES)('$name invokes the launcher', (surface) => {
    const sandbox = createSandbox(NVM_CALIBER);
    sandbox.resolveCaliberTo(path.join(sandbox.home, MACOS_FNM_CALIBER));

    surface.install();

    const generated = dequoted(read(surface.artifact()));
    expect(generated).toContain(surface.launcherForm(sandbox));
    expect(generated).not.toContain('Application Support');
  });

  it.each(HOOK_RUNS)('$name runs from a HOME with a space', ({ install, command, input }) => {
    const sandbox = createSandbox(NVM_CALIBER, 'my home');
    sandbox.resolveCaliberTo(path.join(sandbox.home, MACOS_FNM_CALIBER));
    install();
    const invoked = path.join(sandbox.root, 'invoked');
    writeSentinelBinary(path.join(sandbox.home, MACOS_FNM_CALIBER), invoked);

    runSh(sandbox, ['-c', command()], { pathEnv: SYSTEM_PATH, input });

    expect(fs.existsSync(invoked)).toBe(true);
  });
});

posixDescribe('Cursor hooks holding a launcher path from elsewhere', () => {
  const FOREIGN_LAUNCHER_DIR = '/Users/other-dev/.caliber/bin';

  function plantForeignCursorHooks(sandbox: Sandbox): void {
    installCursorLearningHooks();
    const launcherDir = path.dirname(sandbox.launcherFile);
    fs.writeFileSync(CURSOR_FILE, read(CURSOR_FILE).replaceAll(launcherDir, FOREIGN_LAUNCHER_DIR));
    addCursorUserHook();
  }

  it('repairs another machine launcher path to this home', () => {
    const sandbox = createSandbox(NVM_CALIBER);
    plantForeignCursorHooks(sandbox);

    const result = installCursorLearningHooks();

    const repaired = dequoted(read(CURSOR_FILE));
    expect(result.alreadyInstalled).toBe(false);
    expect(repaired).not.toContain(FOREIGN_LAUNCHER_DIR);
    expect(repaired).toContain(sandbox.launcherFile);
  });

  it('keeps unrelated user hooks through that repair', () => {
    const sandbox = createSandbox(NVM_CALIBER);
    plantForeignCursorHooks(sandbox);

    installCursorLearningHooks();

    expect(read(CURSOR_FILE)).toContain(USER_COMMAND);
  });

  it('reports alreadyInstalled once repaired', () => {
    const sandbox = createSandbox(NVM_CALIBER);
    plantForeignCursorHooks(sandbox);
    installCursorLearningHooks();

    const result = installCursorLearningHooks();

    expect(result.alreadyInstalled).toBe(true);
  });

  it('recreates a launcher deleted from this home', () => {
    const sandbox = createSandbox(NVM_CALIBER);
    installCursorLearningHooks();
    fs.rmSync(sandbox.launcherFile);

    const result = installCursorLearningHooks();

    expect(result.alreadyInstalled).toBe(false);
    expect(fs.existsSync(sandbox.launcherFile)).toBe(true);
  });
});

posixDescribe('hooks generated for a stable install', () => {
  it.each([...SHELL_FORM_SURFACES, cursorLearning])(
    '$name keeps the stable path and creates no launcher',
    (surface) => {
      const sandbox = createSandbox(STABLE_CALIBER);

      surface.install();

      const generated = read(surface.artifact());
      expect(generated).toContain(STABLE_CALIBER);
      expect(dequoted(generated)).not.toContain(HOOK_LAUNCHER_SHELL_PATH);
      expect(fs.existsSync(sandbox.launcherFile)).toBe(false);
    },
  );

  it.each(REPAIR_SURFACES)('$name stays untouched on reinstall', (surface) => {
    createSandbox(STABLE_CALIBER);
    surface.install();
    const before = read(surface.artifact());

    const result = surface.install();

    expect(result.alreadyInstalled).toBe(true);
    expect(read(surface.artifact())).toBe(before);
  });
});

posixDescribe('repair of hooks with a dead caliber path', () => {
  it.each(REPAIR_SURFACES)('$name replaces a dead path with the launcher', (surface) => {
    const sandbox = createSandbox(NVM_CALIBER);
    plantDeadHook(surface, sandbox, NVM_CALIBER);

    const result = surface.install();

    const repaired = dequoted(read(surface.artifact()));
    expect(result.alreadyInstalled).toBe(false);
    expect(repaired).not.toContain(DEAD_CALIBER);
    expect(repaired).toContain(surface.launcherForm(sandbox));
  });

  it.each(REPAIR_SURFACES)('$name replaces a dead path with a stable install', (surface) => {
    const sandbox = createSandbox(STABLE_CALIBER);
    plantDeadHook(surface, sandbox, STABLE_CALIBER);

    surface.install();

    const repaired = read(surface.artifact());
    expect(repaired).not.toContain(DEAD_CALIBER);
    expect(repaired).toContain(STABLE_CALIBER);
    expect(fs.existsSync(sandbox.launcherFile)).toBe(false);
  });

  it.each(REPAIR_SURFACES)('$name repair keeps unrelated user content', (surface) => {
    const sandbox = createSandbox(NVM_CALIBER);
    plantDeadHook(surface, sandbox, NVM_CALIBER);

    surface.install();

    expect(read(surface.userContentFile)).toMatch(surface.survivingUserContent);
  });

  describe.each(HOME_NAMES)('with HOME named "%s"', (homeName) => {
    it.each(REPAIR_SURFACES)('$name reports alreadyInstalled after a repair', (surface) => {
      const sandbox = createSandbox(NVM_CALIBER, homeName);
      plantDeadHook(surface, sandbox, NVM_CALIBER);
      surface.install();
      const repaired = read(surface.artifact());

      const result = surface.install();

      expect(result.alreadyInstalled).toBe(true);
      expect(read(surface.artifact())).toBe(repaired);
    });
  });
});

posixDescribe('hasStaleCaliberPath', () => {
  it.each([
    ['a dead nvm path', `${DEAD_CALIBER} refresh --quiet`],
    ['a quoted dead path', `"${DEAD_CALIBER}" refresh --quiet`],
    ['a dead path assigned in a script', `bin=${DEAD_CALIBER}\n"$bin" refresh`],
    ['a dead fnm path', '/home/x/.fnm/node-versions/v20.1.0/installation/bin/caliber sync'],
    ['a dead path outside version managers', '/home/other-dev/bin/caliber refresh'],
  ])('flags %s', (_label, text) => {
    createSandbox(STABLE_CALIBER);

    expect(hasStaleCaliberPath(text)).toBe(true);
  });

  it('flags a live version path, which the next Node upgrade would kill', () => {
    const sandbox = createSandbox(NVM_CALIBER);
    const live = path.join(sandbox.home, '.nvm/versions/node/v24.21.0/bin/caliber');
    writeSentinelBinary(live, path.join(sandbox.root, 'unused'));
    sandbox.resolveCaliberTo(live);

    expect(hasStaleCaliberPath(`${live} refresh`)).toBe(true);
  });

  it.each([
    ['the current stable path', `${STABLE_CALIBER} refresh --quiet`],
    ['the braced launcher form', `${HOOK_LAUNCHER_SHELL_PATH.replace('$HOME', '${HOME}')} x`],
    ['the npm package name', 'npx --yes @rely-ai/caliber refresh'],
    ['an absolute npx invocation', '/usr/local/bin/npx --yes @rely-ai/caliber refresh'],
    ['a bare command', 'caliber refresh --quiet'],
    ['a project-relative caliber directory', 'mkdir -p .caliber/logs/caliber'],
  ])('accepts %s', (_label, text) => {
    createSandbox(STABLE_CALIBER);

    expect(hasStaleCaliberPath(text)).toBe(false);
  });

  it.each(SHELL_LAUNCHER_REFERENCES)('accepts %s when the launcher exists', (_label, form) => {
    createLauncherSandbox();

    expect(hasStaleCaliberPath(`${form} refresh`)).toBe(false);
  });

  it.each(SHELL_LAUNCHER_REFERENCES)('flags %s when the launcher is missing', (_label, form) => {
    createSandbox(STABLE_CALIBER);

    expect(hasStaleCaliberPath(`${form} refresh`)).toBe(true);
  });

  it('accepts the Cursor launcher form when the launcher exists in this home', () => {
    const sandbox = createLauncherSandbox();
    const launcherDir = path.dirname(sandbox.launcherFile);

    expect(hasStaleCaliberPath(`"${launcherDir}"/caliber learn observe`)).toBe(false);
  });

  it('flags the Cursor launcher form when the launcher was deleted from this home', () => {
    const sandbox = createLauncherSandbox();
    const launcherDir = path.dirname(sandbox.launcherFile);
    fs.rmSync(sandbox.launcherFile);

    expect(hasStaleCaliberPath(`"${launcherDir}"/caliber learn observe`)).toBe(true);
  });

  it('flags the Cursor launcher form from another machine', () => {
    createSandbox(NVM_CALIBER);

    expect(hasStaleCaliberPath('"/Users/other-dev/.caliber/bin"/caliber learn observe')).toBe(true);
  });

  it('accepts a live stable path other than the current resolution', () => {
    const sandbox = createSandbox(STABLE_CALIBER);
    const live = path.join(sandbox.root, 'tools', 'bin', 'caliber');
    writeSentinelBinary(live, path.join(sandbox.root, 'unused'));

    expect(hasStaleCaliberPath(`${live} refresh`)).toBe(false);
  });
});

posixDescribe('launcher file on disk', () => {
  it.each([0o022, 0o077])('is created with mode 0755 under umask %o', (mask) => {
    const sandbox = createSandbox(NVM_CALIBER);
    fixUmask(mask);

    resolveHookBinary();

    expect(fs.statSync(sandbox.launcherFile).mode & 0o777).toBe(0o755);
  });

  it('leaves a launcher without the generated marker byte-for-byte unchanged', () => {
    const sandbox = createSandbox(NVM_CALIBER);
    const handWritten = Buffer.from('#!/bin/sh\nexec "$HOME/shims/caliber" "$@"\n');
    fs.mkdirSync(path.dirname(sandbox.launcherFile), { recursive: true });
    fs.writeFileSync(sandbox.launcherFile, handWritten, { mode: 0o700 });

    resolveHookBinary();

    expect(fs.readFileSync(sandbox.launcherFile).equals(handWritten)).toBe(true);
  });

  it('replaces an older generated launcher with the current one at mode 0755', () => {
    const sandbox = createSandbox(NVM_CALIBER);
    resolveHookBinary();
    const current = read(sandbox.launcherFile);
    fs.writeFileSync(sandbox.launcherFile, `${current}# older revision\n`);
    fs.chmodSync(sandbox.launcherFile, 0o644);

    resolveHookBinary();

    expect(read(sandbox.launcherFile)).toBe(current);
    expect(fs.statSync(sandbox.launcherFile).mode & 0o777).toBe(0o755);
  });
});
