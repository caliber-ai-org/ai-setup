import { it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenCodeProvider, resetOpenCodeLoginCache } from '../opencode.js';
import type { LLMConfig } from '../types.js';
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

it('call() spawns opencode with correct args and pipes combined prompt via stdin', async () => {
  const stdoutChunks = [Buffer.from('Hello from OpenCode.\n')];
  let closeCb: (code: number) => void = () => {
    throw new Error('OpenCode did not close');
  };
  const stdinEnd = vi.fn();
  spawn.mockReturnValue({
    stdin: { end: stdinEnd },
    stdout: {
      on: vi.fn((ev: string, fn: (c: Buffer) => void) => {
        if (ev === 'data') setTimeout(() => stdoutChunks.forEach(fn), 0);
      }),
    },
    stderr: { on: vi.fn() },
    on: vi.fn((ev: string, fn: (code: number) => void) => {
      if (ev === 'close') closeCb = fn;
    }),
    kill: vi.fn(),
  });

  const config: LLMConfig = { provider: 'opencode', model: 'default' };
  const provider = new OpenCodeProvider(config);

  const resultPromise = provider.call({
    system: 'You are helpful.',
    prompt: 'Say hello.',
  });

  await new Promise((r) => setTimeout(r, 10));
  closeCb(0);

  const result = await resultPromise;
  expect(result).toBe('Hello from OpenCode.');

  const call = invocation();
  expect(call.args).toEqual(
    expect.arrayContaining(['run', '--format', 'json', '--auto', '--model', 'default', '--', '-']),
  );
  expect(call.options.cwd).toBe(process.cwd());
  expect(call.options.stdio).toEqual(['pipe', 'pipe', 'pipe']);
  expect(call.options.env.OPENCODE_DISABLE_AUTOCOMPACT).toBe('TRUE');
  expect(call.shell).toBe(IS_WINDOWS);
});

it('call() uses custom model from option', async () => {
  const stdoutChunks = [Buffer.from('response')];
  let closeCb: (code: number) => void = () => {
    throw new Error('OpenCode did not close');
  };
  spawn.mockReturnValue({
    stdin: { end: vi.fn() },
    stdout: {
      on: vi.fn((ev: string, fn: (c: Buffer) => void) => {
        if (ev === 'data') setTimeout(() => stdoutChunks.forEach(fn), 0);
      }),
    },
    stderr: { on: vi.fn() },
    on: vi.fn((ev: string, fn: (code: number) => void) => {
      if (ev === 'close') closeCb = fn;
    }),
    kill: vi.fn(),
  });

  const provider = new OpenCodeProvider({ provider: 'opencode', model: 'default' });
  const resultPromise = provider.call({
    system: 'S',
    prompt: 'P',
    model: 'custom-model',
  });

  await new Promise((r) => setTimeout(r, 10));
  closeCb(0);
  await resultPromise;

  expect(invocation().args.join(' ')).toMatch(/--format json/);
  expect(invocation().args).toContain('--auto');
  expect(invocation().args).not.toContain('--yes');
});

it('call() uses default model from config when no option provided', async () => {
  const stdoutChunks = [Buffer.from('response')];
  let closeCb: (code: number) => void = () => {
    throw new Error('OpenCode did not close');
  };
  spawn.mockReturnValue({
    stdin: { end: vi.fn() },
    stdout: {
      on: vi.fn((ev: string, fn: (c: Buffer) => void) => {
        if (ev === 'data') setTimeout(() => stdoutChunks.forEach(fn), 0);
      }),
    },
    stderr: { on: vi.fn() },
    on: vi.fn((ev: string, fn: (code: number) => void) => {
      if (ev === 'close') closeCb = fn;
    }),
    kill: vi.fn(),
  });

  const provider = new OpenCodeProvider({ provider: 'opencode', model: 'default' });
  const resultPromise = provider.call({
    system: 'S',
    prompt: 'P',
  });

  await new Promise((r) => setTimeout(r, 10));
  closeCb(0);
  await resultPromise;

  expect(invocation().args.join(' ')).toMatch(/--format json/);
  expect(invocation().args).toContain('--auto');
  expect(invocation().args).not.toContain('--yes');
});

it('call() uses provider default model (config) when none given in call', async () => {
  const stdoutChunks = [Buffer.from('response')];
  let closeCb: (code: number) => void = () => {
    throw new Error('OpenCode did not close');
  };
  spawn.mockReturnValue({
    stdin: { end: vi.fn() },
    stdout: {
      on: vi.fn((ev: string, fn: (c: Buffer) => void) => {
        if (ev === 'data') setTimeout(() => stdoutChunks.forEach(fn), 0);
      }),
    },
    stderr: { on: vi.fn() },
    on: vi.fn((ev: string, fn: (code: number) => void) => {
      if (ev === 'close') closeCb = fn;
    }),
    kill: vi.fn(),
  });

  const provider = new OpenCodeProvider({ provider: 'opencode', model: 'my-default' });
  const resultPromise = provider.call({
    system: 'S',
    prompt: 'P',
  });

  await new Promise((r) => setTimeout(r, 10));
  closeCb(0);
  await resultPromise;

  expect(invocation().args.join(' ')).toMatch(/--format json/);
  expect(invocation().args).toContain('--auto');
  expect(invocation().args).not.toContain('--yes');
});

it('call() concatenates multiple stdout chunks', async () => {
  const stdoutChunks = [Buffer.from('Hello, '), Buffer.from('World')];
  let closeCb: (code: number) => void = () => {
    throw new Error('OpenCode did not close');
  };
  spawn.mockReturnValue({
    stdin: { end: vi.fn() },
    stdout: {
      on: vi.fn((ev: string, fn: (c: Buffer) => void) => {
        if (ev === 'data') setTimeout(() => stdoutChunks.forEach(fn), 0);
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

  await new Promise((r) => setTimeout(r, 10));
  closeCb(0);
  const result = await resultPromise;
  expect(result).toBe('Hello, World');
});

it('call() handles rate limit error', async () => {
  let closeCb: (code: number) => void = () => {
    throw new Error('OpenCode did not close');
  };
  spawn.mockReturnValue({
    stdin: { end: vi.fn() },
    stdout: {
      on: vi.fn((ev: string, fn: (c: Buffer) => void) => {
        if (ev === 'data') setTimeout(() => fn(Buffer.from('result')), 0);
      }),
    },
    stderr: {
      on: vi.fn((ev: string, fn: (c: Buffer) => void) => {
        if (ev === 'data') setTimeout(() => fn(Buffer.from('429 Too Many Requests')), 0);
      }),
    },
    on: vi.fn((ev: string, fn: (code: number) => void) => {
      if (ev === 'close') closeCb = fn;
    }),
    kill: vi.fn(),
  });

  const provider = new OpenCodeProvider({ provider: 'opencode', model: 'default' });
  const promise = provider.call({ system: 'S', prompt: 'P' });

  await new Promise((r) => setTimeout(r, 10));
  closeCb(1);
  await expect(promise).rejects.toThrow('Rate limit exceeded. Retrying...');
});

it('call() handles not logged in error', async () => {
  let closeCb: (code: number) => void = () => {
    throw new Error('OpenCode did not close');
  };
  spawn.mockReturnValue({
    stdin: { end: vi.fn() },
    stdout: {
      on: vi.fn((ev: string, fn: (c: Buffer) => void) => {
        if (ev === 'data') setTimeout(() => fn(Buffer.from('result')), 0);
      }),
    },
    stderr: {
      on: vi.fn((ev: string, fn: (c: Buffer) => void) => {
        if (ev === 'data')
          setTimeout(() => fn(Buffer.from('Not logged in. Please authenticate.')), 0);
      }),
    },
    on: vi.fn((ev: string, fn: (code: number) => void) => {
      if (ev === 'close') closeCb = fn;
    }),
    kill: vi.fn(),
  });

  const provider = new OpenCodeProvider({ provider: 'opencode', model: 'default' });
  const promise = provider.call({ system: 'S', prompt: 'P' });

  await new Promise((r) => setTimeout(r, 10));
  closeCb(1);
  await expect(promise).rejects.toThrow(
    'Not logged in. Run the login command for your provider to re-authenticate.',
  );
});

it('call() rejects on child error', async () => {
  const mockError = new Error('spawn failed');
  spawn.mockImplementation(() => {
    throw mockError;
  });

  const provider = new OpenCodeProvider({ provider: 'opencode', model: 'default' });
  const promise = provider.call({ system: 'S', prompt: 'P' });

  await expect(promise).rejects.toThrow('spawn failed');
});

it('call() rejects on timeout', async () => {
  vi.useFakeTimers();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let closeCb: (code: number) => void;
  spawn.mockReturnValue({
    stdin: { end: vi.fn() },
    stdout: {
      on: vi.fn((ev: string, fn: (c: Buffer) => void) => {
        if (ev === 'data') setTimeout(() => fn(Buffer.from('data')), 10000);
      }),
    },
    stderr: { on: vi.fn() },
    on: vi.fn((ev: string, fn: (code: number) => void) => {
      if (ev === 'close') closeCb = fn;
    }),
    kill: vi.fn(),
  });

  const origTimeout = process.env.CALIBER_OPENCODE_TIMEOUT_MS;
  process.env.CALIBER_OPENCODE_TIMEOUT_MS = '100';
  const provider = new OpenCodeProvider({ provider: 'opencode', model: 'default' });
  const promise = provider.call({ system: 'S', prompt: 'P' });

  const rejectionPromise = promise.catch((err) => err);

  await vi.runAllTimersAsync();

  const error = await rejectionPromise;
  expect(error).toBeInstanceOf(Error);
  expect(error.message).toMatch(/timed out after/);
  expect(spawn.mock.results[0].value.kill).toHaveBeenCalledWith('SIGTERM');

  if (origTimeout !== undefined) {
    process.env.CALIBER_OPENCODE_TIMEOUT_MS = origTimeout;
  } else {
    delete process.env.CALIBER_OPENCODE_TIMEOUT_MS;
  }
});
