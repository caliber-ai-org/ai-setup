import { it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenCodeProvider, resetOpenCodeLoginCache } from '../opencode.js';
import { trackUsage } from '../usage.js';

const IS_WINDOWS = process.platform === 'win32';
const spawn = vi.fn();
const execSync = vi.fn();
vi.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => spawn(...args),
  execSync: (...args: unknown[]) => execSync(...args),
}));
vi.mock('../usage.js', () => ({ trackUsage: vi.fn() }));

function invocation() {
  if (IS_WINDOWS) {
    const [command, options] = spawn.mock.calls[0] as [string, SpawnOptions];
    return { args: command.split(/\s+/), options, shell: true };
  }
  const [, args, options] = spawn.mock.calls[0] as [string, string[], SpawnOptions];
  return { args, options, shell: false };
}

type SpawnOptions = {
  cwd: string;
  stdio: string[];
  env: Record<string, string>;
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  (trackUsage as unknown as ReturnType<typeof vi.fn>).mockClear();
  resetOpenCodeLoginCache();
});
afterEach(() => vi.useRealTimers());

beforeEach(() => vi.useFakeTimers());

it('stream() args contain --format json and --auto', async () => {
  let closeCb: (code: number) => void = () => {
    throw new Error('OpenCode did not close');
  };
  spawn.mockReturnValue({
    stdin: { end: vi.fn() },
    stdout: {
      on: vi.fn((ev: string, fn: (c: Buffer) => void) => {
        if (ev === 'data') fn(Buffer.from('{"type":"text","part":{"text":"ok"}}\n'));
      }),
    },
    stderr: { on: vi.fn() },
    on: vi.fn((ev: string, fn: (code: number) => void) => {
      if (ev === 'close') closeCb = fn;
    }),
    kill: vi.fn(),
  });

  const provider = new OpenCodeProvider({ provider: 'opencode', model: 'default' });
  const streamPromise = provider.stream(
    { system: 'S', prompt: 'P' },
    { onText: vi.fn(), onEnd: vi.fn(), onError: vi.fn() },
  );

  closeCb(0);
  await vi.runAllTimersAsync();
  await streamPromise;

  expect(invocation().args.join(' ')).toMatch(/--format json/);
  expect(invocation().args).toContain('--auto');
  expect(invocation().args).not.toContain('--yes');
});

it('call() args contain both --auto and --format json', async () => {
  let closeCb: (code: number) => void = () => {
    throw new Error('OpenCode did not close');
  };
  spawn.mockReturnValue({
    stdin: { end: vi.fn() },
    stdout: {
      on: vi.fn((ev: string, fn: (c: Buffer) => void) => {
        if (ev === 'data') fn(Buffer.from('{"type":"text","part":{"text":"result"}}\\n'));
      }),
    },
    stderr: { on: vi.fn() },
    on: vi.fn((ev: string, fn: (code: number) => void) => {
      if (ev === 'close') closeCb = fn;
    }),
    kill: vi.fn(),
  });

  const provider = new OpenCodeProvider({ provider: 'opencode', model: 'default' });
  const resultPromise = provider.call({ system: 'S', prompt: 'P' });

  closeCb(0);
  await vi.runAllTimersAsync();
  await resultPromise;

  expect(invocation().args.join(' ')).toMatch(/--format json/);
  expect(invocation().args).toContain('--auto');
  expect(invocation().args).not.toContain('--yes');
});
