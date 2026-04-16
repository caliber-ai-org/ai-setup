import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  OpenCodeProvider,
  isOpenCodeAvailable,
  isOpenCodeLoggedIn,
  resetOpenCodeLoginCache,
} from '../opencode.js';
import type { LLMConfig } from '../types.js';

// Mock trackUsage to verify usage tracking
vi.mock('../usage.js', () => ({
  trackUsage: vi.fn(),
}));

import { trackUsage } from '../usage.js';

const IS_WINDOWS = process.platform === 'win32';
const spawn = vi.fn();
const execSync = vi.fn();

vi.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => spawn(...args),
  execSync: (...args: unknown[]) => execSync(...args),
}));

describe('OpenCodeProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    (trackUsage as unknown as ReturnType<typeof vi.fn>).mockClear();
  });

  it('call() spawns opencode with correct args and pipes combined prompt via stdin', async () => {
    const stdoutChunks = [Buffer.from('Hello from OpenCode.\n')];
    let closeCb: (code: number) => void;
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
    closeCb!(0);

    const result = await resultPromise;
    expect(result).toBe('Hello from OpenCode.');

    if (IS_WINDOWS) {
      const cmdStr = spawn.mock.calls[0][0] as string;
      expect(cmdStr).toBe('opencode run --format json --model default -- -');
      const options = spawn.mock.calls[0][1] as {
        cwd: string;
        shell: boolean;
        stdio: string[];
        env: Record<string, string>;
      };
      expect(options.shell).toBe(true);
      expect(options.cwd).toBe(process.cwd());
      expect(options.stdio).toEqual(['pipe', 'pipe', 'pipe']);
      expect(options.env.OPENCODE_DISABLE_AUTOCOMPACT).toBe('TRUE');
    } else {
      const [cmd, args, options] = spawn.mock.calls[0] as [
        string,
        string[],
        { cwd: string; stdio: string[]; env: Record<string, string> },
      ];
      expect(cmd).toBe('opencode');
      expect(args).toEqual(
        expect.arrayContaining(['run', '--format', 'json', '--model', 'default', '--', '-']),
      );
      expect(options.cwd).toBe(process.cwd());
      expect(options.stdio).toEqual(['pipe', 'pipe', 'pipe']);
      expect(options.env.OPENCODE_DISABLE_AUTOCOMPACT).toBe('TRUE');
    }

    // Check that stdin received combined system and prompt
    const stdinCalls = (stdinEnd as unknown as ReturnType<typeof vi.fn>).mock.calls;
    const combinedInput = stdinCalls.map((call: string[]) => call[0]).join('');
    expect(combinedInput).toContain('You are helpful.');
    expect(combinedInput).toContain('Say hello.');

    // Check usage tracking
    expect(trackUsage).toHaveBeenCalledWith(
      'default',
      expect.objectContaining({
        inputTokens: expect.any(Number),
        outputTokens: expect.any(Number),
      }),
    );
  });

  it('call() uses custom model from option', async () => {
    const stdoutChunks = [Buffer.from('response')];
    let closeCb: (code: number) => void;
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
    closeCb!(0);
    await resultPromise;

    if (IS_WINDOWS) {
      const cmdStr = spawn.mock.calls[0][0] as string;
      expect(cmdStr).toContain('--model custom-model');
    } else {
      const args = spawn.mock.calls[0][1] as string[];
      expect(args).toContain('--model');
      expect(args).toContain('custom-model');
    }
  });

  it('call() uses default model from config when no option provided', async () => {
    const stdoutChunks = [Buffer.from('response')];
    let closeCb: (code: number) => void;
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
    closeCb!(0);
    await resultPromise;

    if (IS_WINDOWS) {
      const cmdStr = spawn.mock.calls[0][0] as string;
      expect(cmdStr).toContain('--model default');
    } else {
      const args = spawn.mock.calls[0][1] as string[];
      expect(args).toContain('--model');
      expect(args).toContain('default');
    }
  });

  it('call() uses provider default model (config) when none given in call', async () => {
    const stdoutChunks = [Buffer.from('response')];
    let closeCb: (code: number) => void;
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
    closeCb!(0);
    await resultPromise;

    if (IS_WINDOWS) {
      const cmdStr = spawn.mock.calls[0][0] as string;
      expect(cmdStr).toContain('--model my-default');
    } else {
      const args = spawn.mock.calls[0][1] as string[];
      expect(args).toContain('--model');
      expect(args).toContain('my-default');
    }
  });

  it('call() concatenates multiple stdout chunks', async () => {
    const stdoutChunks = [Buffer.from('Hello, '), Buffer.from('World')];
    let closeCb: (code: number) => void;
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
    closeCb!(0);
    const result = await resultPromise;
    expect(result).toBe('Hello, World');
  });

  it('call() handles rate limit error', async () => {
    let closeCb: (code: number) => void;
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
    closeCb!(1);
    await expect(promise).rejects.toThrow('Rate limit exceeded. Retrying...');
  });

  it('call() handles not logged in error', async () => {
    let closeCb: (code: number) => void;
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
    closeCb!(1);
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

    // Attach catch to prevent unhandled rejection during timer advancement
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

  it('stream() passes model and invokes onText/onEnd correctly', async () => {
    let closeCb: (code: number) => void;
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
    closeCb!(0);
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
    let closeCb: (code: number) => void;
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
    closeCb!(0);
    await streamPromise;

    if (IS_WINDOWS) {
      const cmdStr = spawn.mock.calls[0][0] as string;
      expect(cmdStr).toContain('--model custom');
    } else {
      const args = spawn.mock.calls[0][1] as string[];
      expect(args).toContain('--model');
      expect(args).toContain('custom');
    }
  });

  it('stream() handles multiple fragmented JSON lines', async () => {
    let closeCb: (code: number) => void;
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
    closeCb!(0);
    await streamPromise;

    expect(onText).toHaveBeenCalledTimes(2);
    expect(onText).toHaveBeenCalledWith('Hello');
    expect(onText).toHaveBeenCalledWith(' World');
    expect(onEnd).toHaveBeenCalled();
  });

  it('stream() ignores non-text events', async () => {
    let closeCb: (code: number) => void;
    spawn.mockReturnValue({
      stdin: { end: vi.fn() },
      stdout: {
        on: vi.fn((ev: string, fn: (c: Buffer) => void) => {
          if (ev === 'data')
            setTimeout(() => fn(Buffer.from('{"type":"info","message":"ok"}\n')), 0);
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
    closeCb!(0);
    await streamPromise;

    expect(onText).not.toHaveBeenCalled();
    expect(onEnd).toHaveBeenCalled();
  });

  it('stream() rejects on non-zero exit code', async () => {
    let closeCb: (code: number) => void;
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
    closeCb!(1);

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

    // Attach catch to prevent unhandled rejection during timer advancement
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
});

describe('isOpenCodeAvailable', () => {
  beforeEach(() => {
    execSync.mockReset();
  });

  it('returns true when opencode is on PATH', () => {
    execSync.mockReturnValue(undefined);
    expect(isOpenCodeAvailable()).toBe(true);
    expect(execSync).toHaveBeenCalled();
    const cmd = execSync.mock.calls[0][0];
    if (IS_WINDOWS) {
      expect(cmd).toContain('where');
      expect(cmd).toContain('opencode');
    } else {
      expect(cmd).toContain('which');
      expect(cmd).toContain('opencode');
    }
    expect(execSync.mock.calls[0][1]).toEqual({ stdio: 'ignore' });
  });

  it('returns false when opencode is not found', () => {
    execSync.mockImplementation(() => {
      throw new Error('not found');
    });
    expect(isOpenCodeAvailable()).toBe(false);
  });
});

describe('isOpenCodeLoggedIn', () => {
  beforeEach(() => {
    execSync.mockReset();
    resetOpenCodeLoginCache();
  });

  it('returns true when auth status reports loggedIn true', () => {
    execSync.mockReturnValue(Buffer.from(JSON.stringify({ loggedIn: true })));
    expect(isOpenCodeLoggedIn()).toBe(true);
  });

  it('returns false when auth status reports loggedIn false', () => {
    execSync.mockReturnValue(Buffer.from(JSON.stringify({ loggedIn: false })));
    expect(isOpenCodeLoggedIn()).toBe(false);
  });

  it('returns false when auth status command fails', () => {
    execSync.mockImplementation(() => {
      throw new Error('exit code 1');
    });
    expect(isOpenCodeLoggedIn()).toBe(false);
  });

  it('returns true for non-JSON output without not logged in', () => {
    execSync.mockReturnValue(Buffer.from('some unexpected output'));
    expect(isOpenCodeLoggedIn()).toBe(true);
  });

  it('returns false for non-JSON output containing not logged in', () => {
    execSync.mockReturnValue(Buffer.from('not logged in'));
    expect(isOpenCodeLoggedIn()).toBe(false);
  });

  it('caches the result across calls', () => {
    execSync.mockReturnValue(Buffer.from(JSON.stringify({ loggedIn: true })));
    expect(isOpenCodeLoggedIn()).toBe(true);
    execSync.mockReset(); // clear mock but cache should still have value
    expect(isOpenCodeLoggedIn()).toBe(true);
    expect(execSync).not.toHaveBeenCalled();
  });
});
