import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ClaudeCliProvider,
  isClaudeCliAvailable,
  isClaudeCliLoggedIn,
  resetClaudeCliLoginCache,
  resetClaudeCliBin,
} from '../claude-cli.js';
import type { LLMConfig } from '../types.js';

const IS_WINDOWS = process.platform === 'win32';
const spawn = vi.fn();
const execSync = vi.fn();
const execFileSync = vi.fn();
// accessSync mock: default throws (not executable) — tests override as needed
const accessSync = vi.fn<(path: import('fs').PathLike | number, mode?: number) => void>(() => {
  throw new Error('not found');
});

vi.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => spawn(...args),
  execSync: (...args: unknown[]) => execSync(...args),
  execFileSync: (...args: unknown[]) => execFileSync(...args),
}));

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    default: {
      ...actual,
      accessSync: (...args: Parameters<typeof actual.accessSync>) => accessSync(...args),
    },
  };
});

describe('ClaudeCliProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetClaudeCliBin();
  });

  it('call() spawns claude -p and pipes combined prompt via stdin', async () => {
    const stdoutChunks = [Buffer.from('Hello from Claude.\n')];
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

    const config: LLMConfig = { provider: 'claude-cli', model: 'default' };
    const provider = new ClaudeCliProvider(config);

    const resultPromise = provider.call({
      system: 'You are helpful.',
      prompt: 'Say hello.',
    });

    await new Promise((r) => setTimeout(r, 10));
    closeCb!(0);

    const result = await resultPromise;
    expect(result).toBe('Hello from Claude.');
    if (IS_WINDOWS) {
      expect(spawn.mock.calls[0][0]).toBe('claude -p');
      expect(spawn.mock.calls[0][1]).toEqual(
        expect.objectContaining({ cwd: process.cwd(), shell: true }),
      );
    } else {
      expect(spawn).toHaveBeenCalledWith(
        'claude',
        expect.arrayContaining(['-p']),
        expect.objectContaining({ cwd: process.cwd() }),
      );
      const args = spawn.mock.calls[0][1];
      expect(args).not.toContain(expect.stringContaining('[[System]]'));
    }
    expect(stdinEnd).toHaveBeenCalledWith(expect.stringContaining('You are helpful.'));
    expect(stdinEnd).toHaveBeenCalledWith(expect.stringContaining('Say hello.'));
  });

  it('stream() pipes prompt via stdin and invokes onText and onEnd', async () => {
    let closeCb: (code: number) => void;
    spawn.mockReturnValue({
      stdin: { end: vi.fn() },
      stdout: {
        on: vi.fn((ev: string, fn: (c: Buffer) => void) => {
          if (ev === 'data') setTimeout(() => fn(Buffer.from('Streamed response.')), 0);
        }),
      },
      stderr: { on: vi.fn() },
      on: vi.fn((ev: string, fn: (code: number) => void) => {
        if (ev === 'close') closeCb = fn;
      }),
      kill: vi.fn(),
    });

    const provider = new ClaudeCliProvider({ provider: 'claude-cli', model: 'default' });
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
  });

  it('call() passes --model flag when options.model is set', async () => {
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

    const provider = new ClaudeCliProvider({ provider: 'claude-cli', model: 'default' });
    const resultPromise = provider.call({
      system: 'S',
      prompt: 'P',
      model: 'claude-haiku-4-5',
    });

    await new Promise((r) => setTimeout(r, 10));
    closeCb!(0);
    await resultPromise;

    if (IS_WINDOWS) {
      const cmdStr = spawn.mock.calls[0][0] as string;
      expect(cmdStr).toContain('--model');
      expect(cmdStr).toContain('claude-haiku-4-5');
    } else {
      const args = spawn.mock.calls[0][1];
      expect(args).toContain('--model');
      expect(args).toContain('claude-haiku-4-5');
    }
  });

  it('call() does not pass --model flag when options.model is not set', async () => {
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

    const provider = new ClaudeCliProvider({ provider: 'claude-cli', model: 'default' });
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

  it('stream() passes --model flag when options.model is set', async () => {
    let closeCb: (code: number) => void;
    spawn.mockReturnValue({
      stdin: { end: vi.fn() },
      stdout: {
        on: vi.fn((ev: string, fn: (c: Buffer) => void) => {
          if (ev === 'data') setTimeout(() => fn(Buffer.from('ok')), 0);
        }),
      },
      stderr: { on: vi.fn() },
      on: vi.fn((ev: string, fn: (code: number) => void) => {
        if (ev === 'close') closeCb = fn;
      }),
      kill: vi.fn(),
    });

    const provider = new ClaudeCliProvider({ provider: 'claude-cli', model: 'default' });
    const streamPromise = provider.stream(
      { system: 'S', prompt: 'P', model: 'claude-haiku-4-5' },
      { onText: vi.fn(), onEnd: vi.fn(), onError: vi.fn() },
    );

    await new Promise((r) => setTimeout(r, 10));
    closeCb!(0);
    await streamPromise;

    if (IS_WINDOWS) {
      const cmdStr = spawn.mock.calls[0][0] as string;
      expect(cmdStr).toContain('--model');
      expect(cmdStr).toContain('claude-haiku-4-5');
    } else {
      const args = spawn.mock.calls[0][1];
      expect(args).toContain('--model');
      expect(args).toContain('claude-haiku-4-5');
    }
  });

  it('call() surfaces auth error from stdout when stderr is empty', async () => {
    let closeCb: (code: number) => void;
    spawn.mockReturnValue({
      stdin: { end: vi.fn() },
      stdout: {
        on: vi.fn((ev: string, fn: (c: Buffer) => void) => {
          if (ev === 'data')
            setTimeout(() => fn(Buffer.from('Not logged in · Please run /login')), 0);
        }),
      },
      stderr: { on: vi.fn() },
      on: vi.fn((ev: string, fn: (code: number) => void) => {
        if (ev === 'close') closeCb = fn;
      }),
      kill: vi.fn(),
    });

    const provider = new ClaudeCliProvider({ provider: 'claude-cli', model: 'default' });
    const resultPromise = provider.call({ system: 'S', prompt: 'P' });

    await new Promise((r) => setTimeout(r, 10));
    closeCb!(1);

    await expect(resultPromise).rejects.toThrow(/Not logged in/);
    // Should use friendly message, not raw stdout
    await expect(resultPromise).rejects.not.toThrow('Please run /login');
  });

  it('stream() surfaces auth error from stdout when stderr is empty', async () => {
    let closeCb: (code: number) => void;
    spawn.mockReturnValue({
      stdin: { end: vi.fn() },
      stdout: {
        on: vi.fn((ev: string, fn: (c: Buffer) => void) => {
          if (ev === 'data')
            setTimeout(() => fn(Buffer.from('Not logged in · Please run /login')), 0);
        }),
      },
      stderr: { on: vi.fn() },
      on: vi.fn((ev: string, fn: (code: number) => void) => {
        if (ev === 'close') closeCb = fn;
      }),
      kill: vi.fn(),
    });

    const provider = new ClaudeCliProvider({ provider: 'claude-cli', model: 'default' });
    const onError = vi.fn();
    const streamPromise = provider.stream(
      { system: 'S', prompt: 'P' },
      { onText: vi.fn(), onEnd: vi.fn(), onError },
    );

    await new Promise((r) => setTimeout(r, 10));
    closeCb!(1);
    await streamPromise.catch(() => {});

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringMatching(/Not logged in/) }),
    );
    expect(onError.mock.calls[0][0].message).not.toContain('Please run /login');
  });

  it('uses CALIBER_CLAUDE_CLI_TIMEOUT_MS when set', () => {
    const orig = process.env.CALIBER_CLAUDE_CLI_TIMEOUT_MS;
    process.env.CALIBER_CLAUDE_CLI_TIMEOUT_MS = '120000';
    const provider = new ClaudeCliProvider({ provider: 'claude-cli', model: 'default' });
    expect(provider).toBeDefined();
    process.env.CALIBER_CLAUDE_CLI_TIMEOUT_MS = orig;
  });
});

describe('isClaudeCliAvailable', () => {
  beforeEach(() => {
    execSync.mockReset();
    accessSync.mockImplementation(() => {
      throw new Error('not found');
    });
    resetClaudeCliBin();
  });

  it('returns true when claude is on PATH', () => {
    execSync.mockReturnValue(undefined);
    expect(isClaudeCliAvailable()).toBe(true);
    // resolveClaudeBin() makes one call (which claude), then isClaudeCliAvailable()
    // makes a second call (which claude --stdio:ignore) as the PATH check
    const lastCall = execSync.mock.calls[execSync.mock.calls.length - 1];
    expect(lastCall[0]).toContain('claude');
    expect(lastCall[1]).toEqual({ stdio: 'ignore' });
  });

  it('returns false when claude is not found', () => {
    execSync.mockImplementation(() => {
      throw new Error('not found');
    });
    expect(isClaudeCliAvailable()).toBe(false);
  });
});

describe('isClaudeCliLoggedIn', () => {
  beforeEach(() => {
    execFileSync.mockReset();
    resetClaudeCliLoginCache();
  });

  it('returns true when auth status reports loggedIn true', () => {
    execFileSync.mockReturnValue(Buffer.from(JSON.stringify({ loggedIn: true })));
    expect(isClaudeCliLoggedIn()).toBe(true);
  });

  it('returns false when auth status reports loggedIn false', () => {
    execFileSync.mockReturnValue(Buffer.from(JSON.stringify({ loggedIn: false })));
    expect(isClaudeCliLoggedIn()).toBe(false);
  });

  it('returns false when auth status command fails', () => {
    execFileSync.mockImplementation(() => {
      throw new Error('exit code 1');
    });
    expect(isClaudeCliLoggedIn()).toBe(false);
  });

  it('returns true for non-JSON output without not logged in', () => {
    execFileSync.mockReturnValue(Buffer.from('some unexpected output'));
    expect(isClaudeCliLoggedIn()).toBe(true);
  });

  it('returns false for non-JSON output containing not logged in', () => {
    execFileSync.mockReturnValue(Buffer.from('not logged in'));
    expect(isClaudeCliLoggedIn()).toBe(false);
  });

  it('caches the result across calls', () => {
    execFileSync.mockReturnValue(Buffer.from(JSON.stringify({ loggedIn: true })));
    expect(isClaudeCliLoggedIn()).toBe(true);
    execFileSync.mockReset();
    expect(isClaudeCliLoggedIn()).toBe(true);
    expect(execFileSync).not.toHaveBeenCalled();
  });
});
