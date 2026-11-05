import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  SYSTEM_PATH,
  createLauncherSandbox,
  runLauncher,
  writeExecutable,
  writeSentinelBinary,
  writeTaggedCaliber,
  type Sandbox,
} from './hook-launcher-fixtures.js';

vi.mock('child_process', async (importActual) => ({
  ...(await importActual<typeof import('child_process')>()),
  execSync: vi.fn(),
}));

const posixDescribe = describe.skipIf(process.platform === 'win32');

const NVM_INSTALL = '.nvm/versions/node/v24.1.0/bin/caliber';

const SELF_REFERENCES: Array<[string, (sandbox: Sandbox) => string]> = [
  ['its own directory', (sandbox) => path.dirname(sandbox.launcherFile)],
  [
    'its own directory with a trailing slash',
    (sandbox) => `${path.dirname(sandbox.launcherFile)}/`,
  ],
  [
    'a symlink to its directory',
    (sandbox) => {
      const alias = path.join(sandbox.root, 'alias');
      fs.symlinkSync(path.dirname(sandbox.launcherFile), alias);
      return alias;
    },
  ],
  [
    'a symlink to the launcher file',
    (sandbox) => {
      const links = path.join(sandbox.root, 'links');
      fs.mkdirSync(links);
      fs.symlinkSync(sandbox.launcherFile, path.join(links, 'caliber'));
      return links;
    },
  ],
];

const UNPREFIXED_LAYOUTS: Array<[string, (version: string) => string]> = [
  ['asdf', (version) => `.asdf/installs/nodejs/${version}/bin/caliber`],
  ['mise', (version) => `.local/share/mise/installs/node/${version}/bin/caliber`],
  ['nodenv', (version) => `.nodenv/versions/${version}/bin/caliber`],
];

const ALL_LAYOUTS: Array<[string, (version: string) => string]> = [
  ['nvm', (version) => `.nvm/versions/node/v${version}/bin/caliber`],
  ['XDG fnm', (version) => `.local/share/fnm/node-versions/v${version}/installation/bin/caliber`],
  ['legacy fnm', (version) => `.fnm/node-versions/v${version}/installation/bin/caliber`],
  [
    'macOS fnm',
    (version) =>
      `Library/Application Support/fnm/node-versions/v${version}/installation/bin/caliber`,
  ],
  ...UNPREFIXED_LAYOUTS,
];

const NON_NVM_LAYOUTS = ALL_LAYOUTS.slice(1);
const nvmLayout = ALL_LAYOUTS[0][1];

const UNUSABLE_CANDIDATES: Array<[string, (file: string) => void]> = [
  ['a directory', (file) => fs.mkdirSync(file, { recursive: true })],
  [
    'a non-executable file',
    (file) => {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, '#!/bin/sh\n', { mode: 0o644 });
    },
  ],
  [
    'a dangling symlink',
    (file) => {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.symlinkSync('../lib/removed.js', file);
    },
  ],
];

posixDescribe('launcher PATH lookup under /bin/sh', () => {
  it('runs caliber from an absolute PATH entry and preserves its arguments', () => {
    const sandbox = createLauncherSandbox();
    const bin = path.join(sandbox.root, 'on-path');
    writeTaggedCaliber(path.join(bin, 'caliber'), 'on-path');

    const result = runLauncher(sandbox, `${bin}:${SYSTEM_PATH}`, ['refresh', 'two words']);

    expect(result.stdout).toBe('on-path[refresh][two words]');
  });

  it('passes the exit status of caliber back to the hook', () => {
    const sandbox = createLauncherSandbox();
    const bin = path.join(sandbox.root, 'on-path');
    writeExecutable(path.join(bin, 'caliber'), '#!/bin/sh\nexit 3\n');

    const result = runLauncher(sandbox, `${bin}:${SYSTEM_PATH}`);

    expect(result.status).toBe(3);
  });

  it.each([
    ['a dot entry', `.:${SYSTEM_PATH}`],
    ['an empty entry', `:${SYSTEM_PATH}`],
  ])('ignores a repo-local caliber reached through %s', (_label, pathEnv) => {
    const sandbox = createLauncherSandbox();
    const sentinel = path.join(sandbox.root, 'repo-binary-ran');
    writeSentinelBinary(path.join(sandbox.project, 'caliber'), sentinel);

    const result = runLauncher(sandbox, pathEnv);

    expect(fs.existsSync(sentinel)).toBe(false);
    expect(result.status).toBe(0);
  });

  it('prefers a PATH hit over an installed Node version', () => {
    const sandbox = createLauncherSandbox();
    const bin = path.join(sandbox.root, 'on-path');
    writeTaggedCaliber(path.join(bin, 'caliber'), 'on-path');
    writeTaggedCaliber(path.join(sandbox.home, NVM_INSTALL), 'nvm');

    const result = runLauncher(sandbox, `${bin}:${SYSTEM_PATH}`);

    expect(result.stdout).toBe('on-path');
  });
});

posixDescribe('launcher self-exec protection under /bin/sh', () => {
  it.each(SELF_REFERENCES)('reaches the real install past %s on PATH', (_label, selfEntry) => {
    const sandbox = createLauncherSandbox();
    writeTaggedCaliber(path.join(sandbox.home, NVM_INSTALL), 'real');

    const result = runLauncher(sandbox, `${selfEntry(sandbox)}:${SYSTEM_PATH}`);

    expect(result.stdout).toBe('real');
  });

  it.each(SELF_REFERENCES)('exits 0 with a hint given only %s on PATH', (_label, selfEntry) => {
    const sandbox = createLauncherSandbox();

    const result = runLauncher(sandbox, `${selfEntry(sandbox)}:${SYSTEM_PATH}`);

    expect(result.status).toBe(0);
    expect(result.stderr).toMatch(/caliber/);
  });
});

posixDescribe('launcher self-exec protection when PATH has no system tools', () => {
  it.each(SELF_REFERENCES)('runs a real install listed after %s', (_label, selfEntry) => {
    const sandbox = createLauncherSandbox();
    const bin = path.join(sandbox.root, 'on-path');
    writeTaggedCaliber(path.join(bin, 'caliber'), 'real');

    const result = runLauncher(sandbox, `${selfEntry(sandbox)}:${bin}`);

    expect(result.stdout).toBe('real');
  });

  it.each(SELF_REFERENCES)('exits 0 with a hint given only %s', (_label, selfEntry) => {
    const sandbox = createLauncherSandbox();

    const result = runLauncher(sandbox, selfEntry(sandbox));

    expect(result.status).toBe(0);
    expect(result.stderr).toMatch(/caliber/);
  });
});

posixDescribe('launcher fallback across version managers under /bin/sh', () => {
  it.each(NON_NVM_LAYOUTS)('%s 26 beats a leftover nvm v20', (_label, layout) => {
    const sandbox = createLauncherSandbox();
    writeTaggedCaliber(path.join(sandbox.home, layout('26.0.0')), 'newer');
    writeTaggedCaliber(path.join(sandbox.home, nvmLayout('20.0.0')), 'older');

    const result = runLauncher(sandbox, SYSTEM_PATH);

    expect(result.stdout).toBe('newer');
  });

  it.each(NON_NVM_LAYOUTS)('nvm v26 beats a leftover %s 20', (_label, layout) => {
    const sandbox = createLauncherSandbox();
    writeTaggedCaliber(path.join(sandbox.home, nvmLayout('26.0.0')), 'newer');
    writeTaggedCaliber(path.join(sandbox.home, layout('20.0.0')), 'older');

    const result = runLauncher(sandbox, SYSTEM_PATH);

    expect(result.stdout).toBe('newer');
  });

  it.each(NON_NVM_LAYOUTS)('%s 24.10.0 beats nvm 24.9.0', (_label, layout) => {
    const sandbox = createLauncherSandbox();
    writeTaggedCaliber(path.join(sandbox.home, layout('24.10.0')), 'newer');
    writeTaggedCaliber(path.join(sandbox.home, nvmLayout('24.9.0')), 'older');

    const result = runLauncher(sandbox, SYSTEM_PATH);

    expect(result.stdout).toBe('newer');
  });
});

posixDescribe('launcher fallback skips unusable installs under /bin/sh', () => {
  it.each(UNUSABLE_CANDIDATES)(
    'runs the working lower version when the highest is %s',
    (_label, plantBlocker) => {
      const sandbox = createLauncherSandbox();
      plantBlocker(path.join(sandbox.home, nvmLayout('26.0.0')));
      writeTaggedCaliber(path.join(sandbox.home, nvmLayout('24.1.0')), 'working');

      const result = runLauncher(sandbox, SYSTEM_PATH);

      expect(result.stdout).toBe('working');
    },
  );
});

posixDescribe('launcher skips unusable PATH candidates under /bin/sh', () => {
  it.each(UNUSABLE_CANDIDATES)('skips %s and runs the next PATH entry', (_label, plantBlocker) => {
    const sandbox = createLauncherSandbox();
    const blocked = path.join(sandbox.root, 'blocked');
    const next = path.join(sandbox.root, 'next');
    plantBlocker(path.join(blocked, 'caliber'));
    writeTaggedCaliber(path.join(next, 'caliber'), 'next');

    const result = runLauncher(sandbox, `${blocked}:${next}:${SYSTEM_PATH}`);

    expect(result.stdout).toBe('next');
  });

  it('skips a directory named caliber and falls back to an installed Node version', () => {
    const sandbox = createLauncherSandbox();
    const blocked = path.join(sandbox.root, 'blocked');
    fs.mkdirSync(path.join(blocked, 'caliber'), { recursive: true });
    writeTaggedCaliber(path.join(sandbox.home, NVM_INSTALL), 'nvm');

    const result = runLauncher(sandbox, `${blocked}:${SYSTEM_PATH}`);

    expect(result.stdout).toBe('nvm');
  });
});

posixDescribe('launcher fallback under /bin/sh', () => {
  it.each(ALL_LAYOUTS)(
    'picks the numerically highest %s version when PATH has no hit',
    (_label, layout) => {
      const sandbox = createLauncherSandbox();
      writeTaggedCaliber(path.join(sandbox.home, layout('9.11.2')), 'v9');
      writeTaggedCaliber(path.join(sandbox.home, layout('24.1.0')), 'v24');

      const result = runLauncher(sandbox, SYSTEM_PATH);

      expect(result.stdout).toBe('v24');
    },
  );

  it.each(UNPREFIXED_LAYOUTS)('ignores the lts alias directory of %s', (_label, layout) => {
    const sandbox = createLauncherSandbox();
    writeTaggedCaliber(path.join(sandbox.home, layout('24.1.0')), 'versioned');
    writeTaggedCaliber(path.join(sandbox.home, layout('lts')), 'alias');

    const result = runLauncher(sandbox, SYSTEM_PATH);

    expect(result.stdout).toBe('versioned');
  });

  it('lets a version-managed caliber find the node binary installed beside it', () => {
    const sandbox = createLauncherSandbox();
    const bin = path.dirname(path.join(sandbox.home, NVM_INSTALL));
    writeExecutable(path.join(bin, 'caliber'), '#!/bin/sh\nnode\n');
    writeExecutable(path.join(bin, 'node'), "#!/bin/sh\nprintf '%s' sibling-node\n");

    const result = runLauncher(sandbox, SYSTEM_PATH);

    expect(result.stdout).toBe('sibling-node');
  });
});

posixDescribe('launcher with no install to run under /bin/sh', () => {
  it('exits 0 with a hint on stderr when caliber is not installed', () => {
    const sandbox = createLauncherSandbox();

    const result = runLauncher(sandbox, SYSTEM_PATH);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toMatch(/caliber/);
  });

  it('never falls back to npx', () => {
    const sandbox = createLauncherSandbox();
    const bin = path.join(sandbox.root, 'on-path');
    const sentinel = path.join(sandbox.root, 'npx-ran');
    writeSentinelBinary(path.join(bin, 'npx'), sentinel);

    runLauncher(sandbox, `${bin}:${SYSTEM_PATH}`);

    expect(fs.existsSync(sentinel)).toBe(false);
  });
});
