import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenCodeProvider, isOpenCodeAvailable } from '../opencode.js';
import type { LLMConfig } from '../types.js';
import { getUsageSummary, resetUsage } from '../usage.js';

const IS_WINDOWS = process.platform === 'win32';
const spawn = vi.fn();
const execSync = vi.fn();

vi.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => spawn(...args),
  execSync: (...args: unknown[]) => execSync(...args),
}));

vi.mock('../seat-based-errors.js', () => ({
  parseSeatBasedError: vi.fn((stderr: string, _code: number | null) => {
    if (stderr.includes('not logged in') || stderr.includes('unauthorized')) {
      return 'Not logged in. Run the login command for your provider to re-authenticate.';
    }
    if (stderr.includes('rate limit') || stderr.includes('429')) {
      return 'Rate limit exceeded. Retrying...';
    }
    return null;
  }),
}));

describe('OpenCodeProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetUsage();
  });

  describe('call()', () => {
    it('spawns opencode run --format json and pipes prompt via stdin', async () => {
      const stdoutChunks = [Buffer.from('{"type":"text","part":{"text":"Hello from OpenCode."}}')];
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
      expect(spawn).toHaveBeenCalledWith(
        'opencode',
        expect.arrayContaining(['run', '--format', 'json']),
        expect.objectContaining({ cwd: process.cwd() }),
      );
      expect(stdinEnd).toHaveBeenCalledWith(expect.stringContaining('You are helpful.'));
      expect(stdinEnd).toHaveBeenCalledWith(expect.stringContaining('Say hello.'));
    });

    it('passes --model flag when options.model is set', async () => {
      const stdoutChunks = [Buffer.from('{"type":"text","part":{"text":"response"}}')];
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
        model: 'anthropic/claude-sonnet-4-5',
      });

      await new Promise((r) => setTimeout(r, 10));
      closeCb!(0);
      await resultPromise;

      const args = spawn.mock.calls[0][1];
      expect(args).toContain('--model');
      expect(args).toContain('anthropic/claude-sonnet-4-5');
    });

    it('does not pass --model flag when options.model is not set', async () => {
      const stdoutChunks = [Buffer.from('{"type":"text","part":{"text":"response"}}')];
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
      await resultPromise;

      if (IS_WINDOWS) {
        const cmdStr = spawn.mock.calls[0][0] as string;
        expect(cmdStr).not.toContain('--model');
      } else {
        const args = spawn.mock.calls[0][1];
        expect(args).not.toContain('--model');
      }
    });

    it('tracks usage after successful call', async () => {
      const stdoutChunks = [Buffer.from('{"type":"text","part":{"text":"response"}}')];
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

      await resultPromise;

      const usage = getUsageSummary();
      expect(usage).toHaveLength(1);
      expect(usage[0].model).toBe('default');
      expect(usage[0].calls).toBe(1);
    });

    it('includes message history in combined prompt', async () => {
      const stdoutChunks = [Buffer.from('{"type":"text","part":{"text":"response"}}')];
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

      const provider = new OpenCodeProvider({ provider: 'opencode', model: 'default' });
      const streamPromise = provider.stream(
        {
          system: 'You are a helpful assistant.',
          prompt: 'What is the weather?',
          messages: [
            { role: 'user', content: 'Hello!' },
            { role: 'assistant', content: 'Hi there!' },
          ],
        },
        { onText: vi.fn(), onEnd: vi.fn(), onError: vi.fn() },
      );

      await new Promise((r) => setTimeout(r, 10));
      closeCb!(0);

      await streamPromise;

      expect(stdinEnd).toHaveBeenCalledWith(expect.stringContaining('User: Hello!'));
      expect(stdinEnd).toHaveBeenCalledWith(expect.stringContaining('Assistant: Hi there!'));
    });

    it('rejects with error when opencode exits with non-zero code', async () => {
      let closeCb: (code: number) => void;
      spawn.mockReturnValue({
        stdin: { end: vi.fn() },
        stdout: { on: vi.fn() },
        stderr: {
          on: vi.fn((ev: string, fn: (c: Buffer) => void) => {
            if (ev === 'data') fn(Buffer.from('Some error occurred'));
          }),
        },
        on: vi.fn((ev: string, fn: (code: number) => void) => {
          if (ev === 'close') closeCb = fn;
        }),
        kill: vi.fn(),
      });

      const provider = new OpenCodeProvider({ provider: 'opencode', model: 'default' });
      const resultPromise = provider.call({ system: 'S', prompt: 'P' });

      await new Promise((r) => setTimeout(r, 10));
      closeCb!(1);

      await expect(resultPromise).rejects.toThrow('OpenCode exited with code 1');
    });

    it('rejects with error when opencode returns empty response', async () => {
      let closeCb: (code: number) => void;
      spawn.mockReturnValue({
        stdin: { end: vi.fn() },
        stdout: {
          on: vi.fn((ev: string, fn: (c: Buffer) => void) => {
            if (ev === 'data') fn(Buffer.from(''));
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

      await expect(resultPromise).rejects.toThrow('OpenCode returned empty response');
    });

    it('uses parseSeatBasedError for friendly auth errors', async () => {
      let closeCb: (code: number) => void;
      spawn.mockReturnValue({
        stdin: { end: vi.fn() },
        stdout: { on: vi.fn() },
        stderr: {
          on: vi.fn((ev: string, fn: (c: Buffer) => void) => {
            if (ev === 'data') fn(Buffer.from('Error: not logged in'));
          }),
        },
        on: vi.fn((ev: string, fn: (code: number) => void) => {
          if (ev === 'close') closeCb = fn;
        }),
        kill: vi.fn(),
      });

      const provider = new OpenCodeProvider({ provider: 'opencode', model: 'default' });
      const resultPromise = provider.call({ system: 'S', prompt: 'P' });

      await new Promise((r) => setTimeout(r, 10));
      closeCb!(1);

      await expect(resultPromise).rejects.toThrow('Not logged in');
      await expect(resultPromise).rejects.not.toThrow('not logged in');
    });

    it('uses parseSeatBasedError for friendly rate-limit errors', async () => {
      let closeCb: (code: number) => void;
      spawn.mockReturnValue({
        stdin: { end: vi.fn() },
        stdout: { on: vi.fn() },
        stderr: {
          on: vi.fn((ev: string, fn: (c: Buffer) => void) => {
            if (ev === 'data') fn(Buffer.from('Error: rate limit exceeded 429'));
          }),
        },
        on: vi.fn((ev: string, fn: (code: number) => void) => {
          if (ev === 'close') closeCb = fn;
        }),
        kill: vi.fn(),
      });

      const provider = new OpenCodeProvider({ provider: 'opencode', model: 'default' });
      const resultPromise = provider.call({ system: 'S', prompt: 'P' });

      await new Promise((r) => setTimeout(r, 10));
      closeCb!(1);

      await expect(resultPromise).rejects.toThrow('Rate limit exceeded');
    });

    it('parses multi-line JSON event output correctly', async () => {
      const stdoutChunks = [
        Buffer.from('{"type":"text","part":{"text":"Hello"}}\n'),
        Buffer.from('{"type":"text","part":{"text":" World"}}\n'),
        Buffer.from('{"type":"step_finish","reason":"stop"}\n'),
      ];
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
      expect(result).toBe('Hello World');
    });

    it('skips non-JSON lines in output', async () => {
      const stdoutChunks = [
        Buffer.from('some random text\n'),
        Buffer.from('{"type":"text","part":{"text":"actual response"}}\n'),
        Buffer.from('more noise\n'),
      ];
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
      expect(result).toBe('actual response');
    });

    it('skips markdown code fences in output', async () => {
      const stdoutChunks = [
        Buffer.from('```\n'),
        Buffer.from('{"type":"text","part":{"text":"code block"}}\n'),
        Buffer.from('```\n'),
      ];
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
      expect(result).toBe('code block');
    });
  });

  describe('stream()', () => {
    it('pipes prompt via stdin and invokes onText and onEnd', async () => {
      let closeCb: (code: number) => void;
      spawn.mockReturnValue({
        stdin: { end: vi.fn() },
        stdout: {
          on: vi.fn((ev: string, fn: (c: Buffer) => void) => {
            if (ev === 'data') {
              setTimeout(() => fn(Buffer.from('{"type":"text","part":{"text":"Streamed"}}')), 0);
            }
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

      expect(onText).toHaveBeenCalledWith('Streamed');
      expect(onEnd).toHaveBeenCalledWith({ stopReason: 'end_turn' });
    });

    it('tracks usage on stream end', async () => {
      let closeCb: (code: number) => void;
      spawn.mockReturnValue({
        stdin: { end: vi.fn() },
        stdout: {
          on: vi.fn((ev: string, fn: (c: Buffer) => void) => {
            if (ev === 'data') {
              setTimeout(() => fn(Buffer.from('{"type":"text","part":{"text":"Hi"}}')), 0);
            }
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

      await new Promise((r) => setTimeout(r, 10));
      closeCb!(0);

      await streamPromise;

      const usage = getUsageSummary();
      expect(usage).toHaveLength(1);
    });

    it('passes --model flag when options.model is set', async () => {
      let closeCb: (code: number) => void;
      spawn.mockReturnValue({
        stdin: { end: vi.fn() },
        stdout: {
          on: vi.fn((ev: string, fn: (c: Buffer) => void) => {
            if (ev === 'data')
              setTimeout(() => fn(Buffer.from('{"type":"text","part":{"text":"ok"}}')), 0);
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
        { system: 'S', prompt: 'P', model: 'claude-haiku-4-5' },
        { onText: vi.fn(), onEnd: vi.fn(), onError: vi.fn() },
      );

      await new Promise((r) => setTimeout(r, 10));
      closeCb!(0);
      await streamPromise;

      const args = spawn.mock.calls[0][1];
      expect(args).toContain('--model');
      expect(args).toContain('claude-haiku-4-5');
    });

    it('invokes onError when opencode exits with error', async () => {
      let closeCb: (code: number) => void;
      const onError = vi.fn();
      spawn.mockReturnValue({
        stdin: { end: vi.fn() },
        stdout: { on: vi.fn() },
        stderr: {
          on: vi.fn((ev: string, fn: (c: Buffer) => void) => {
            if (ev === 'data') fn(Buffer.from('Error message'));
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
        { onText: vi.fn(), onEnd: vi.fn(), onError },
      );

      await new Promise((r) => setTimeout(r, 10));
      closeCb!(1);

      await streamPromise;

      expect(onError).toHaveBeenCalled();
      const error = onError.mock.calls[0][0] as Error;
      expect(error.message).toContain('OpenCode exited with code 1');
    });

    it('invokes onError for JSON error events during streaming', async () => {
      const onError = vi.fn();
      const onEnd = vi.fn();
      let settleResolve: () => void;
      const settledPromise = new Promise<void>((r) => {
        settleResolve = r;
      });

      spawn.mockReturnValue({
        stdin: { end: vi.fn() },
        stdout: {
          on: vi.fn((ev: string, fn: (c: Buffer) => void) => {
            if (ev === 'data') {
              setTimeout(
                () =>
                  fn(
                    Buffer.from(
                      '{"type":"error","error":{"data":{"message":"Something went wrong"}}}',
                    ),
                  ),
                5,
              );
            }
          }),
        },
        stderr: { on: vi.fn() },
        on: vi.fn((ev: string, fn: (code: number) => void) => {
          if (ev === 'close') {
            setTimeout(() => {
              fn(0);
              setTimeout(() => settleResolve(), 10);
            }, 50);
          }
        }),
        kill: vi.fn(),
      });

      const provider = new OpenCodeProvider({ provider: 'opencode', model: 'default' });
      void provider.stream({ system: 'S', prompt: 'P' }, { onText: vi.fn(), onEnd, onError });

      await settledPromise;

      expect(onError).toHaveBeenCalled();
      const error = onError.mock.calls[0][0] as Error;
      expect(error.message).toBe('Something went wrong');
    });

    it('handles streaming with multiple text events', async () => {
      let closeCb: (code: number) => void;
      const onText = vi.fn();
      spawn.mockReturnValue({
        stdin: { end: vi.fn() },
        stdout: {
          on: vi.fn((ev: string, fn: (c: Buffer) => void) => {
            if (ev === 'data') {
              setTimeout(
                () =>
                  fn(
                    Buffer.from(
                      '{"type":"text","part":{"text":"Hello"}}\n{"type":"text","part":{"text":" World"}}',
                    ),
                  ),
                0,
              );
            }
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
        { onText, onEnd: vi.fn(), onError: vi.fn() },
      );

      await new Promise((r) => setTimeout(r, 10));
      closeCb!(0);
      await streamPromise;

      expect(onText).toHaveBeenCalledTimes(2);
      expect(onText).toHaveBeenNthCalledWith(1, 'Hello');
      expect(onText).toHaveBeenNthCalledWith(2, ' World');
    });
  });

  describe('timeout handling', () => {
    it('uses CALIBER_OPENCODE_TIMEOUT_MS when set', () => {
      const orig = process.env.CALIBER_OPENCODE_TIMEOUT_MS;
      process.env.CALIBER_OPENCODE_TIMEOUT_MS = '120000';
      const provider = new OpenCodeProvider({ provider: 'opencode', model: 'default' });
      expect(provider).toBeDefined();
      process.env.CALIBER_OPENCODE_TIMEOUT_MS = orig;
    });

    it('uses default timeout when env var is invalid', () => {
      const orig = process.env.CALIBER_OPENCODE_TIMEOUT_MS;
      process.env.CALIBER_OPENCODE_TIMEOUT_MS = 'not-a-number';
      const provider = new OpenCodeProvider({ provider: 'opencode', model: 'default' });
      expect(provider).toBeDefined();
      process.env.CALIBER_OPENCODE_TIMEOUT_MS = orig;
    });

    it('uses default timeout when env var is below minimum', () => {
      const orig = process.env.CALIBER_OPENCODE_TIMEOUT_MS;
      process.env.CALIBER_OPENCODE_TIMEOUT_MS = '500';
      const provider = new OpenCodeProvider({ provider: 'opencode', model: 'default' });
      expect(provider).toBeDefined();
      process.env.CALIBER_OPENCODE_TIMEOUT_MS = orig;
    });
  });

  describe('constructor', () => {
    it('should create instance with default config', () => {
      const provider = new OpenCodeProvider({ provider: 'opencode', model: 'default' });
      expect(provider).toBeDefined();
    });

    it('should create instance with custom model', () => {
      const provider = new OpenCodeProvider({
        provider: 'opencode',
        model: 'anthropic/claude-sonnet-4-5',
      });
      expect(provider).toBeDefined();
    });
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
    expect(cmd).toContain('opencode');
    expect(execSync.mock.calls[0][1]).toEqual({ stdio: 'ignore' });
  });

  it('returns false when opencode is not found', () => {
    execSync.mockImplementation(() => {
      throw new Error('not found');
    });
    expect(isOpenCodeAvailable()).toBe(false);
  });
});
