import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { LLMStreamCallbacks } from '../../llm/types.js';

const mockStream = vi.fn();

vi.mock('../../llm/index.js', () => ({
  getProvider: () => ({ stream: mockStream }),
  llmJsonCall: vi.fn().mockResolvedValue({ name: 'test', description: 'test', content: 'test' }),
  TRANSIENT_ERRORS: ['terminated', 'ECONNRESET'],
}));

vi.mock('../../llm/config.js', () => ({
  getFastModel: () => undefined,
  getMaxPromptTokens: () => 100000,
}));

vi.mock('../prompts.js', () => ({
  GENERATION_SYSTEM_PROMPT: 'test system prompt',
  CORE_GENERATION_PROMPT: 'test core prompt',
  SKILL_GENERATION_PROMPT: 'test skill prompt',
  REFINE_SYSTEM_PROMPT: 'test refine prompt',
}));

vi.mock('../../llm/utils.js', () => ({
  stripMarkdownFences: (text: string) =>
    text
      .replace(/^```(?:json)?\s*/im, '')
      .replace(/```\s*$/m, '')
      .trim(),
  estimateTokens: (text: string) => Math.ceil(text.length / 4),
}));

import {
  generateSetup,
  buildDiagnostic,
  parseEnvTimeout,
  DEFAULT_INACTIVITY_TIMEOUT_MS,
} from '../generate.js';
import { refineSetup } from '../refine.js';

const fingerprint = { languages: [], frameworks: [], tools: [], fileTree: [], existingConfigs: {} };

// ─── generateSetup timeout tests ────────────────────────────────────────────

describe('streamGeneration inactivity timeout', () => {
  let savedEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    savedEnv = { ...process.env };
    process.env.CALIBER_STREAM_INACTIVITY_TIMEOUT_MS = '10000';
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env = savedEnv;
  });

  it('triggers when model produces no output', async () => {
    mockStream.mockImplementation(() => Promise.resolve());

    const onError = vi.fn();
    const resultPromise = generateSetup(fingerprint, ['claude'], undefined, {
      onStatus: vi.fn(),
      onComplete: vi.fn(),
      onError,
    });

    await vi.advanceTimersByTimeAsync(10_000);
    const result = await resultPromise;

    expect(result.setup).toBeNull();
    expect(result.stopReason).toBe('timeout_inactivity');
    expect(onError).toHaveBeenCalled();
    expect(onError.mock.calls[0][0]).toContain('no output');
  });

  it('triggers when model stops mid-stream', async () => {
    mockStream.mockImplementation((_opts: unknown, callbacks: LLMStreamCallbacks) => {
      callbacks.onText('STATUS: Analyzing...\n');
      return Promise.resolve();
    });

    const onError = vi.fn();
    const resultPromise = generateSetup(fingerprint, ['claude'], undefined, {
      onStatus: vi.fn(),
      onComplete: vi.fn(),
      onError,
    });

    await vi.advanceTimersByTimeAsync(10_000);
    const result = await resultPromise;

    expect(result.setup).toBeNull();
    expect(result.stopReason).toBe('timeout_inactivity');
    expect(onError).toHaveBeenCalled();
    expect(onError.mock.calls[0][0]).toContain('stopped responding');
  });

  it('includes raw output in result on timeout', async () => {
    mockStream.mockImplementation((_opts: unknown, callbacks: LLMStreamCallbacks) => {
      callbacks.onText('partial json output');
      return Promise.resolve();
    });

    const resultPromise = generateSetup(fingerprint, ['claude']);

    await vi.advanceTimersByTimeAsync(10_000);
    const result = await resultPromise;

    expect(result.raw).toContain('partial json output');
  });

  it('resets timer on each text chunk', async () => {
    let textCallback: ((text: string) => void) | null = null;
    let endCallback: ((meta?: { stopReason?: string }) => void) | null = null;
    mockStream.mockImplementation((_opts: unknown, callbacks: LLMStreamCallbacks) => {
      textCallback = callbacks.onText;
      endCallback = callbacks.onEnd;
      return Promise.resolve();
    });

    const resultPromise = generateSetup(fingerprint, ['claude']);

    // send text at 8s intervals (under the 10s timeout)
    await vi.advanceTimersByTimeAsync(8000);
    if (textCallback) textCallback('{"target');
    await vi.advanceTimersByTimeAsync(8000);
    if (textCallback) textCallback('Agent": "claude"}');
    await vi.advanceTimersByTimeAsync(1);
    if (endCallback) endCallback({ stopReason: 'end_turn' });

    const result = await resultPromise;
    expect(result.setup).toMatchObject({ targetAgent: 'claude' });
  });

  it('does not fire after normal stream completion', async () => {
    const setup = { targetAgent: 'claude' };
    mockStream.mockImplementation((_opts: unknown, callbacks: LLMStreamCallbacks) => {
      callbacks.onText(JSON.stringify(setup));
      callbacks.onEnd({ stopReason: 'end_turn' });
      return Promise.resolve();
    });

    const onError = vi.fn();
    const result = await generateSetup(fingerprint, ['claude'], undefined, {
      onStatus: vi.fn(),
      onComplete: vi.fn(),
      onError,
    });

    // advance well past timeout to verify it was cleared
    await vi.advanceTimersByTimeAsync(20_000);

    expect(result.setup).toMatchObject(setup);
    expect(onError).not.toHaveBeenCalled();
  });

  it('does not fire after stream error', async () => {
    mockStream.mockImplementation((_opts: unknown, callbacks: LLMStreamCallbacks) => {
      callbacks.onError(new Error('API key invalid'));
      return Promise.resolve();
    });

    const onError = vi.fn();
    await generateSetup(fingerprint, ['claude'], undefined, {
      onStatus: vi.fn(),
      onComplete: vi.fn(),
      onError,
    });

    // advance past timeout
    await vi.advanceTimersByTimeAsync(20_000);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBe('API key invalid');
  });
});

describe('streamGeneration total timeout', () => {
  let savedEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    savedEnv = { ...process.env };
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env = savedEnv;
  });

  it('triggers even when model keeps producing output', async () => {
    process.env.CALIBER_STREAM_INACTIVITY_TIMEOUT_MS = '60000';
    process.env.CALIBER_GENERATION_TIMEOUT_MS = '30000';

    let textCallback: ((text: string) => void) | null = null;
    mockStream.mockImplementation((_opts: unknown, callbacks: LLMStreamCallbacks) => {
      textCallback = callbacks.onText;
      return Promise.resolve();
    });

    const onError = vi.fn();
    const resultPromise = generateSetup(fingerprint, ['claude'], undefined, {
      onStatus: vi.fn(),
      onComplete: vi.fn(),
      onError,
    });

    for (let i = 0; i < 10; i++) {
      await vi.advanceTimersByTimeAsync(3000);
      if (textCallback) textCallback('more text... ');
    }

    const result = await resultPromise;

    expect(result.setup).toBeNull();
    expect(result.stopReason).toBe('timeout_total');
    expect(onError).toHaveBeenCalled();
  });

  it('calls onError immediately when total timeout fires', async () => {
    process.env.CALIBER_GENERATION_TIMEOUT_MS = '5000';

    mockStream.mockImplementation(() => Promise.resolve());

    const onError = vi.fn();
    const resultPromise = generateSetup(fingerprint, ['claude'], undefined, {
      onStatus: vi.fn(),
      onComplete: vi.fn(),
      onError,
    });

    // inactivity timeout is 120s default, total is 5s
    await vi.advanceTimersByTimeAsync(5000);
    await resultPromise;

    expect(onError).toHaveBeenCalled();
    expect(onError.mock.calls[0][0]).toContain('total time limit');
  });

  it('fires before inactivity timeout when total is shorter', async () => {
    // total = 5s, inactivity = 60s. Model hangs. Total fires first.
    process.env.CALIBER_GENERATION_TIMEOUT_MS = '5000';
    process.env.CALIBER_STREAM_INACTIVITY_TIMEOUT_MS = '60000';

    mockStream.mockImplementation(() => Promise.resolve());

    const onError = vi.fn();
    const resultPromise = generateSetup(fingerprint, ['claude'], undefined, {
      onStatus: vi.fn(),
      onComplete: vi.fn(),
      onError,
    });

    await vi.advanceTimersByTimeAsync(5000);
    const result = await resultPromise;

    expect(result.stopReason).toBe('timeout_total');
    expect(onError).toHaveBeenCalled();
    expect(onError.mock.calls[0][0]).toContain('total time limit');
  });

  it('ignores text callbacks after total timeout fires', async () => {
    process.env.CALIBER_GENERATION_TIMEOUT_MS = '5000';
    process.env.CALIBER_STREAM_INACTIVITY_TIMEOUT_MS = '60000';

    let textCallback: ((text: string) => void) | null = null;
    mockStream.mockImplementation((_opts: unknown, callbacks: LLMStreamCallbacks) => {
      textCallback = callbacks.onText;
      return Promise.resolve();
    });

    const onComplete = vi.fn();
    const resultPromise = generateSetup(fingerprint, ['claude'], undefined, {
      onStatus: vi.fn(),
      onComplete,
      onError: vi.fn(),
    });

    await vi.advanceTimersByTimeAsync(5000);
    // try sending text after timeout
    if (textCallback) textCallback('{"late": "data"}');

    const result = await resultPromise;

    expect(result.stopReason).toBe('timeout_total');
    expect(onComplete).not.toHaveBeenCalled();
  });
});

describe('streamGeneration settled guards', () => {
  let savedEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    savedEnv = { ...process.env };
    process.env.CALIBER_STREAM_INACTIVITY_TIMEOUT_MS = '10000';
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env = savedEnv;
  });

  it('ignores onEnd after onError has fired', async () => {
    mockStream.mockImplementation((_opts: unknown, callbacks: LLMStreamCallbacks) => {
      callbacks.onError(new Error('Connection terminated'));
      // misbehaving provider calls onEnd after onError
      callbacks.onEnd({ stopReason: 'end_turn' });
      return Promise.resolve();
    });

    const onComplete = vi.fn();
    // first call errors with transient, retries succeed
    let callCount = 0;
    mockStream.mockImplementation((_opts: unknown, callbacks: LLMStreamCallbacks) => {
      callCount++;
      if (callCount === 1) {
        callbacks.onError(new Error('non-transient error'));
      } else {
        callbacks.onText('{"data": true}');
        callbacks.onEnd({ stopReason: 'end_turn' });
      }
      return Promise.resolve();
    });

    const onError = vi.fn();
    const result = await generateSetup(fingerprint, ['claude'], undefined, {
      onStatus: vi.fn(),
      onComplete,
      onError,
    });

    expect(result.setup).toBeNull();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('ignores onEnd/onError after inactivity timeout', async () => {
    let endCallback: ((meta?: { stopReason?: string }) => void) | null = null;
    mockStream.mockImplementation((_opts: unknown, callbacks: LLMStreamCallbacks) => {
      endCallback = callbacks.onEnd;
      return Promise.resolve();
    });

    const onComplete = vi.fn();
    const onError = vi.fn();
    const resultPromise = generateSetup(fingerprint, ['claude'], undefined, {
      onStatus: vi.fn(),
      onComplete,
      onError,
    });

    await vi.advanceTimersByTimeAsync(10_000);
    // provider fires onEnd after timeout
    if (endCallback) endCallback({ stopReason: 'end_turn' });

    const result = await resultPromise;

    expect(result.stopReason).toBe('timeout_inactivity');
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('handles provider .catch() after settlement', async () => {
    mockStream.mockImplementation((_opts: unknown, callbacks: LLMStreamCallbacks) => {
      callbacks.onText('{"ok": true}');
      callbacks.onEnd({ stopReason: 'end_turn' });
      return Promise.reject(new Error('late error'));
    });

    const onError = vi.fn();
    const result = await generateSetup(fingerprint, ['claude'], undefined, {
      onStatus: vi.fn(),
      onComplete: vi.fn(),
      onError,
    });

    expect(result.setup).toMatchObject({ ok: true });
    expect(onError).not.toHaveBeenCalled();
  });
});

describe('streamGeneration retry + timeout interaction', () => {
  let savedEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    savedEnv = { ...process.env };
    process.env.CALIBER_STREAM_INACTIVITY_TIMEOUT_MS = '10000';
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env = savedEnv;
  });

  it('retries on transient error then succeeds', async () => {
    let callCount = 0;
    const setup = { targetAgent: 'claude' };
    mockStream.mockImplementation((_opts: unknown, callbacks: LLMStreamCallbacks) => {
      callCount++;
      if (callCount === 1) {
        callbacks.onError(new Error('Connection terminated'));
      } else {
        callbacks.onText(JSON.stringify(setup));
        callbacks.onEnd({ stopReason: 'end_turn' });
      }
      return Promise.resolve();
    });

    const onStatus = vi.fn();
    const resultPromise = generateSetup(fingerprint, ['claude'], undefined, {
      onStatus,
      onComplete: vi.fn(),
      onError: vi.fn(),
    });

    // advance past the retry delay
    await vi.advanceTimersByTimeAsync(2000);

    const result = await resultPromise;

    expect(callCount).toBe(2);
    expect(result.setup).toMatchObject(setup);
    expect(onStatus).toHaveBeenCalledWith('Connection interrupted, retrying...');
  });

  it('retries on max_tokens then succeeds', async () => {
    let callCount = 0;
    const setup = { targetAgent: 'claude', claude: { claudeMd: '# Test' } };
    mockStream.mockImplementation((_opts: unknown, callbacks: LLMStreamCallbacks) => {
      callCount++;
      if (callCount === 1) {
        callbacks.onText('{"partial": tr');
        callbacks.onEnd({ stopReason: 'max_tokens' });
      } else {
        callbacks.onText(JSON.stringify(setup));
        callbacks.onEnd({ stopReason: 'end_turn' });
      }
      return Promise.resolve();
    });

    const resultPromise = generateSetup(fingerprint, ['claude']);

    // advance past the retry delay
    await vi.advanceTimersByTimeAsync(1000);

    const result = await resultPromise;

    expect(callCount).toBe(2);
    expect(result.setup).toMatchObject(setup);
  });
});

// ─── refineSetup timeout tests ──────────────────────────────────────────────

describe('refineSetup inactivity timeout', () => {
  let savedEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    savedEnv = { ...process.env };
    process.env.CALIBER_STREAM_INACTIVITY_TIMEOUT_MS = '10000';
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env = savedEnv;
  });

  it('triggers when model produces no output', async () => {
    mockStream.mockImplementation(() => Promise.resolve());

    const onError = vi.fn();
    const resultPromise = refineSetup(
      { claude: { claudeMd: 'test' } },
      'add testing section',
      undefined,
      { onComplete: vi.fn(), onError },
    );

    await vi.advanceTimersByTimeAsync(10_000);
    const result = await resultPromise;

    expect(result).toBeNull();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toContain('no output');
  });

  it('triggers when model stops mid-stream', async () => {
    mockStream.mockImplementation((_opts: unknown, callbacks: LLMStreamCallbacks) => {
      callbacks.onText('{"partial":');
      return Promise.resolve();
    });

    const onError = vi.fn();
    const resultPromise = refineSetup({ claude: {} }, 'update', undefined, {
      onComplete: vi.fn(),
      onError,
    });

    await vi.advanceTimersByTimeAsync(10_000);
    const result = await resultPromise;

    expect(result).toBeNull();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toContain('stopped responding');
  });

  it('resets timer on each text chunk', async () => {
    let textCallback: ((text: string) => void) | null = null;
    let endCallback: (() => void) | null = null;
    mockStream.mockImplementation((_opts: unknown, callbacks: LLMStreamCallbacks) => {
      textCallback = callbacks.onText;
      endCallback = callbacks.onEnd;
      return Promise.resolve();
    });

    const resultPromise = refineSetup({ claude: {} }, 'update');

    // send text at 8s intervals (under 10s timeout)
    await vi.advanceTimersByTimeAsync(8000);
    if (textCallback) textCallback('{"claude');
    await vi.advanceTimersByTimeAsync(8000);
    if (textCallback) textCallback('": {"claudeMd": "updated"}}');
    await vi.advanceTimersByTimeAsync(1);
    if (endCallback) endCallback();

    const result = await resultPromise;
    expect(result).toMatchObject({ claude: { claudeMd: 'updated' } });
  });

  it('does not fire after normal completion', async () => {
    const setup = { claude: { claudeMd: '# Updated' } };
    mockStream.mockImplementation((_opts: unknown, callbacks: LLMStreamCallbacks) => {
      callbacks.onText(JSON.stringify(setup));
      callbacks.onEnd();
      return Promise.resolve();
    });

    const onError = vi.fn();
    const result = await refineSetup({ claude: {} }, 'update', undefined, {
      onComplete: vi.fn(),
      onError,
    });

    await vi.advanceTimersByTimeAsync(20_000);

    expect(result).toEqual(setup);
    expect(onError).not.toHaveBeenCalled();
  });

  it('does not fire after stream error', async () => {
    mockStream.mockImplementation((_opts: unknown, callbacks: LLMStreamCallbacks) => {
      callbacks.onError(new Error('Rate limited'));
      return Promise.resolve();
    });

    const onError = vi.fn();
    await refineSetup({ claude: {} }, 'update', undefined, { onComplete: vi.fn(), onError });

    await vi.advanceTimersByTimeAsync(20_000);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBe('Rate limited');
  });

  it('ignores onEnd after timeout has fired', async () => {
    let endCallback: (() => void) | null = null;
    mockStream.mockImplementation((_opts: unknown, callbacks: LLMStreamCallbacks) => {
      endCallback = callbacks.onEnd;
      return Promise.resolve();
    });

    const onComplete = vi.fn();
    const onError = vi.fn();
    const resultPromise = refineSetup({ claude: {} }, 'update', undefined, { onComplete, onError });

    await vi.advanceTimersByTimeAsync(10_000);
    // late onEnd from provider
    if (endCallback) endCallback();

    const result = await resultPromise;

    expect(result).toBeNull();
    expect(onComplete).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('handles .catch() after timeout', async () => {
    mockStream.mockImplementation(() => {
      return new Promise((_, reject) => {
        setTimeout(() => reject(new Error('late rejection')), 15000);
      });
    });

    const onError = vi.fn();
    const resultPromise = refineSetup({ claude: {} }, 'update', undefined, {
      onComplete: vi.fn(),
      onError,
    });

    await vi.advanceTimersByTimeAsync(10_000);
    const result = await resultPromise;

    expect(result).toBeNull();

    // advance to let the rejection fire
    await vi.advanceTimersByTimeAsync(5000);

    // should only have been called once (from timeout, not from .catch)
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('respects custom timeout from env var', async () => {
    process.env.CALIBER_STREAM_INACTIVITY_TIMEOUT_MS = '5000';

    mockStream.mockImplementation(() => Promise.resolve());

    const onError = vi.fn();
    const resultPromise = refineSetup({ claude: {} }, 'update', undefined, {
      onComplete: vi.fn(),
      onError,
    });

    // should NOT have timed out at 4s
    await vi.advanceTimersByTimeAsync(4000);
    expect(onError).not.toHaveBeenCalled();

    // should time out at 5s
    await vi.advanceTimersByTimeAsync(1000);
    const result = await resultPromise;

    expect(result).toBeNull();
    expect(onError).toHaveBeenCalledTimes(1);
  });
});

// ─── buildDiagnostic tests ──────────────────────────────────────────────────

describe('buildDiagnostic', () => {
  let savedEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    savedEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = savedEnv;
  });

  it('reports inactivity timeout with zero output', () => {
    const msg = buildDiagnostic('timeout_inactivity', '', 0);
    expect(msg).toContain('no output');
    expect(msg).toContain('CALIBER_STREAM_INACTIVITY_TIMEOUT_MS');
  });

  it('reports inactivity timeout with partial output', () => {
    const msg = buildDiagnostic('timeout_inactivity', 'some text', 42);
    expect(msg).toContain('stopped responding');
    expect(msg).toContain('42 chars');
  });

  it('reports total timeout', () => {
    const msg = buildDiagnostic('timeout_total', 'partial', 100);
    expect(msg).toContain('total time limit');
    expect(msg).toContain('CALIBER_GENERATION_TIMEOUT_MS');
  });

  it('reports empty output without timeout', () => {
    const msg = buildDiagnostic(undefined, '', 0);
    expect(msg).toContain('no output');
    expect(msg).toContain('API key');
  });

  it('reports non-JSON output with preview', () => {
    const msg = buildDiagnostic(undefined, 'This is plain text, not JSON', 30);
    expect(msg).toContain('not valid JSON');
    expect(msg).toContain('This is plain text');
  });

  it('truncates raw preview to 200 chars', () => {
    const longOutput = 'x'.repeat(500);
    const msg = buildDiagnostic(undefined, longOutput, 500);
    expect(msg.length).toBeLessThan(500 + 100); // message + 200 char preview + label
  });

  it('respects custom timeout value in message', () => {
    process.env.CALIBER_STREAM_INACTIVITY_TIMEOUT_MS = '60000';
    const msg = buildDiagnostic('timeout_inactivity', '', 0);
    expect(msg).toContain('60s');
  });

  it('handles whitespace-only raw output as empty', () => {
    const msg = buildDiagnostic(undefined, '   \n\t  ', 0);
    expect(msg).toContain('no output');
  });
});

// ─── parseEnvTimeout tests ──────────────────────────────────────────────────

describe('parseEnvTimeout', () => {
  let savedEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    savedEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = savedEnv;
  });

  it('returns default when env var is not set', () => {
    delete process.env.TEST_TIMEOUT;
    expect(parseEnvTimeout('TEST_TIMEOUT', 30000)).toBe(30000);
  });

  it('parses valid integer', () => {
    process.env.TEST_TIMEOUT = '60000';
    expect(parseEnvTimeout('TEST_TIMEOUT', 30000)).toBe(60000);
  });

  it('returns default for non-numeric value', () => {
    process.env.TEST_TIMEOUT = 'abc';
    expect(parseEnvTimeout('TEST_TIMEOUT', 30000)).toBe(30000);
  });

  it('returns default when value is below minimum', () => {
    process.env.TEST_TIMEOUT = '1000';
    expect(parseEnvTimeout('TEST_TIMEOUT', 30000, 5000)).toBe(30000);
  });

  it('accepts value at exact minimum', () => {
    process.env.TEST_TIMEOUT = '5000';
    expect(parseEnvTimeout('TEST_TIMEOUT', 30000, 5000)).toBe(5000);
  });

  it('returns default for empty string', () => {
    process.env.TEST_TIMEOUT = '';
    expect(parseEnvTimeout('TEST_TIMEOUT', 30000)).toBe(30000);
  });

  it('returns default for NaN', () => {
    process.env.TEST_TIMEOUT = 'NaN';
    expect(parseEnvTimeout('TEST_TIMEOUT', 30000)).toBe(30000);
  });

  it('returns default for Infinity', () => {
    process.env.TEST_TIMEOUT = 'Infinity';
    expect(parseEnvTimeout('TEST_TIMEOUT', 30000)).toBe(30000);
  });
});

// ─── DEFAULT_INACTIVITY_TIMEOUT_MS export test ──────────────────────────────

describe('DEFAULT_INACTIVITY_TIMEOUT_MS', () => {
  it('is 120 seconds', () => {
    expect(DEFAULT_INACTIVITY_TIMEOUT_MS).toBe(120_000);
  });
});
