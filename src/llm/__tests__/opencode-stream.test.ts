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

it('stream() passes model and invokes onText/onEnd correctly', async () => {
  let closeCb: (code: number) => void = () => {
    throw new Error('OpenCode did not close');
  };
  spawn.mockReturnValue({
    stdin: { end: vi.fn() },
    stdout: {
      on: vi.fn((ev: string, fn: (c: Buffer) => void) => {
        if (ev === 'data')
          setTimeout(
            () => fn(Buffer.from('{"type":"text","part":{"text":"Streamed response."}}\n')),
            0,
          );
      }),
    },
    stderr: { on: vi.fn() },
    on: vi.fn((ev: string, fn: (code: number) => void) => {
      if (ev === 'close') closeCb = fn;
    }),
    kill: vi.fn(),
  });

  const provider = new OpenCodeProvider({ provider: 'opencode', model: 'default' });
  const onText = vi.fn();
  const onEnd = vi.fn();

  const streamPromise = provider.stream(
    { system: 'S', prompt: 'P' },
    { onText, onEnd, onError: vi.fn() },
  );

  await new Promise((r) => setTimeout(r, 10));
  closeCb(0);
  await streamPromise;

  expect(onText).toHaveBeenCalledWith('Streamed response.');
  expect(onEnd).toHaveBeenCalledWith({ stopReason: 'end_turn' });
  expect(trackUsage).toHaveBeenCalledWith(
    'default',
    expect.objectContaining({
      inputTokens: expect.any(Number),
      outputTokens: expect.any(Number),
    }),
  );
});

it('stream() uses custom model from option', async () => {
  let closeCb: (code: number) => void = () => {
    throw new Error('OpenCode did not close');
  };
  spawn.mockReturnValue({
    stdin: { end: vi.fn() },
    stdout: {
      on: vi.fn((ev: string, fn: (c: Buffer) => void) => {
        if (ev === 'data')
          setTimeout(() => fn(Buffer.from('{"type":"text","part":{"text":"ok"}}\n')), 0);
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
    { system: 'S', prompt: 'P', model: 'custom' },
    { onText: vi.fn(), onEnd: vi.fn(), onError: vi.fn() },
  );

  await new Promise((r) => setTimeout(r, 10));
  closeCb(0);
  await streamPromise;

  expect(invocation().args.join(' ')).toMatch(/--format json/);
  expect(invocation().args).toContain('--auto');
  expect(invocation().args).not.toContain('--yes');
});

it('stream() handles multiple fragmented JSON lines', async () => {
  let closeCb: (code: number) => void = () => {
    throw new Error('OpenCode did not close');
  };
  const chunks = [
    Buffer.from('{"type":"text","part":{"text":"Hello"}}\n{"type":"text",'),
    Buffer.from('"part":{"text":" World"}}\n'),
  ];
  spawn.mockReturnValue({
    stdin: { end: vi.fn() },
    stdout: {
      on: vi.fn((ev: string, fn: (c: Buffer) => void) => {
        if (ev === 'data') setTimeout(() => chunks.forEach(fn), 0);
      }),
    },
    stderr: { on: vi.fn() },
    on: vi.fn((ev: string, fn: (code: number) => void) => {
      if (ev === 'close') closeCb = fn;
    }),
    kill: vi.fn(),
  });

  const provider = new OpenCodeProvider({ provider: 'opencode', model: 'default' });
  const onText = vi.fn();
  const onEnd = vi.fn();

  const streamPromise = provider.stream(
    { system: 'S', prompt: 'P' },
    { onText, onEnd, onError: vi.fn() },
  );

  await new Promise((r) => setTimeout(r, 20));
  closeCb(0);
  await streamPromise;

  expect(onText).toHaveBeenCalledTimes(2);
  expect(onText).toHaveBeenCalledWith('Hello');
  expect(onText).toHaveBeenCalledWith(' World');
  expect(onEnd).toHaveBeenCalled();
});

it('stream() ignores non-text events', async () => {
  let closeCb: (code: number) => void = () => {
    throw new Error('OpenCode did not close');
  };
  spawn.mockReturnValue({
    stdin: { end: vi.fn() },
    stdout: {
      on: vi.fn((ev: string, fn: (c: Buffer) => void) => {
        if (ev === 'data') setTimeout(() => fn(Buffer.from('{"type":"info","message":"ok"}\n')), 0);
      }),
    },
    stderr: { on: vi.fn() },
    on: vi.fn((ev: string, fn: (code: number) => void) => {
      if (ev === 'close') closeCb = fn;
    }),
    kill: vi.fn(),
  });

  const provider = new OpenCodeProvider({ provider: 'opencode', model: 'default' });
  const onText = vi.fn();
  const onEnd = vi.fn();

  const streamPromise = provider.stream(
    { system: 'S', prompt: 'P' },
    { onText, onEnd, onError: vi.fn() },
  );

  await new Promise((r) => setTimeout(r, 10));
  closeCb(0);
  await streamPromise;

  expect(onText).not.toHaveBeenCalled();
  expect(onEnd).toHaveBeenCalled();
});

it('stream() rejects on non-zero exit code', async () => {
  let closeCb: (code: number) => void = () => {
    throw new Error('OpenCode did not close');
  };
  spawn.mockReturnValue({
    stdin: { end: vi.fn() },
    stdout: {
      on: vi.fn((ev: string, fn: (c: Buffer) => void) => {
        if (ev === 'data') setTimeout(() => fn(Buffer.from('ok')), 0);
      }),
    },
    stderr: {
      on: vi.fn((ev: string, fn: (c: Buffer) => void) => {
        if (ev === 'data') setTimeout(() => fn(Buffer.from('error')), 0);
      }),
    },
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

  await new Promise((r) => setTimeout(r, 10));
  closeCb(1);

  await expect(streamPromise).rejects.toThrow('OpenCode exited with code 1. error');
});

it('stream() rejects on child error', async () => {
  const mockError = new Error('spawn error');
  spawn.mockImplementation(() => {
    throw mockError;
  });

  const provider = new OpenCodeProvider({ provider: 'opencode', model: 'default' });
  const streamPromise = provider.stream(
    { system: 'S', prompt: 'P' },
    { onText: vi.fn(), onEnd: vi.fn(), onError: vi.fn() },
  );

  await expect(streamPromise).rejects.toThrow('spawn error');
});

it('stream() rejects on timeout', async () => {
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

  const streamPromise = provider.stream(
    { system: 'S', prompt: 'P' },
    { onText: vi.fn(), onEnd: vi.fn(), onError: vi.fn() },
  );

  const rejectionPromise = streamPromise.catch((err) => err);

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
