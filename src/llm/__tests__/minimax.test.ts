import { describe, it, expect, vi, beforeEach } from 'vitest';

const { MockOpenAI } = vi.hoisted(() => {
  const MockOpenAI = vi.fn().mockImplementation(function () {
    return {
      chat: {
        completions: {
          create: vi.fn(),
        },
      },
      models: {
        list: vi.fn(),
      },
    };
  });
  return { MockOpenAI };
});

vi.mock('openai', () => ({
  default: MockOpenAI,
}));

vi.mock('../usage.js', () => ({
  trackUsage: vi.fn(),
}));

import { MiniMaxProvider } from '../minimax.js';
import { trackUsage } from '../usage.js';

describe('MiniMaxProvider constructor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates client with default base URL', () => {
    new MiniMaxProvider({ provider: 'minimax', model: 'MiniMax-M2.7', apiKey: 'test-key' });
    expect(MockOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'test-key',
        baseURL: 'https://api.minimax.io/v1',
      }),
    );
  });

  it('uses custom baseUrl when provided in config', () => {
    new MiniMaxProvider({
      provider: 'minimax',
      model: 'MiniMax-M2.7',
      apiKey: 'test-key',
      baseUrl: 'https://custom.endpoint/v1',
    });
    expect(MockOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({ baseURL: 'https://custom.endpoint/v1' }),
    );
  });

  it('falls back to MINIMAX_API_KEY env var when apiKey not in config', () => {
    const originalEnv = process.env.MINIMAX_API_KEY;
    process.env.MINIMAX_API_KEY = 'env-api-key';
    try {
      new MiniMaxProvider({ provider: 'minimax', model: 'MiniMax-M2.7' });
      expect(MockOpenAI).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'env-api-key' }));
    } finally {
      process.env.MINIMAX_API_KEY = originalEnv;
    }
  });

  it('falls back to MINIMAX_BASE_URL env var when baseUrl not in config', () => {
    const originalEnv = process.env.MINIMAX_BASE_URL;
    process.env.MINIMAX_BASE_URL = 'https://api.minimax.custom/v1';
    try {
      new MiniMaxProvider({ provider: 'minimax', model: 'MiniMax-M2.7', apiKey: 'test-key' });
      expect(MockOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({ baseURL: 'https://api.minimax.custom/v1' }),
      );
    } finally {
      process.env.MINIMAX_BASE_URL = originalEnv;
    }
  });
});

describe('MiniMaxProvider.listModels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns only MiniMax-M2.7 and MiniMax-M2.7-highspeed', async () => {
    const provider = new MiniMaxProvider({
      provider: 'minimax',
      model: 'MiniMax-M2.7',
      apiKey: 'test-key',
    });
    const models = await provider.listModels();
    expect(models).toEqual(['MiniMax-M2.7', 'MiniMax-M2.7-highspeed']);
  });
});

describe('MiniMaxProvider.call', () => {
  let provider: MiniMaxProvider;
  let mockCreate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new MiniMaxProvider({
      provider: 'minimax',
      model: 'MiniMax-M2.7',
      apiKey: 'test-key',
    });
    const instance = MockOpenAI.mock.results[0].value;
    mockCreate = instance.chat.completions.create;
  });

  it('sends request with temperature 1.0', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: 'Hello' } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    });

    await provider.call({ system: 'You are helpful', prompt: 'Hi', model: 'MiniMax-M2.7' });

    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ temperature: 1.0 }));
  });

  it('returns response text', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: 'Test response' } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    });

    const result = await provider.call({ system: 'sys', prompt: 'prompt' });
    expect(result).toBe('Test response');
  });

  it('uses default model when model not specified in options', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: 'ok' } }],
      usage: null,
    });

    await provider.call({ system: 'sys', prompt: 'prompt' });

    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ model: 'MiniMax-M2.7' }));
  });

  it('tracks usage when usage is present', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: 'ok' } }],
      usage: { prompt_tokens: 20, completion_tokens: 10 },
    });

    await provider.call({ system: 'sys', prompt: 'prompt', model: 'MiniMax-M2.7' });

    expect(trackUsage).toHaveBeenCalledWith('MiniMax-M2.7', {
      inputTokens: 20,
      outputTokens: 10,
    });
  });

  it('returns empty string when no content in response', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: null } }],
      usage: null,
    });

    const result = await provider.call({ system: 'sys', prompt: 'prompt' });
    expect(result).toBe('');
  });
});

describe('MiniMaxProvider.stream', () => {
  let provider: MiniMaxProvider;
  let mockCreate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new MiniMaxProvider({
      provider: 'minimax',
      model: 'MiniMax-M2.7',
      apiKey: 'test-key',
    });
    const instance = MockOpenAI.mock.results[0].value;
    mockCreate = instance.chat.completions.create;
  });

  it('streams text chunks to onText callback', async () => {
    async function* fakeStream() {
      yield { choices: [{ delta: { content: 'Hello' }, finish_reason: null }], usage: null };
      yield { choices: [{ delta: { content: ' World' }, finish_reason: 'stop' }], usage: null };
    }
    mockCreate.mockResolvedValue(fakeStream());

    const onText = vi.fn();
    const onEnd = vi.fn();
    const onError = vi.fn();

    await provider.stream({ system: 'sys', prompt: 'prompt' }, { onText, onEnd, onError });

    expect(onText).toHaveBeenCalledWith('Hello');
    expect(onText).toHaveBeenCalledWith(' World');
    expect(onEnd).toHaveBeenCalledWith({ stopReason: 'stop', usage: undefined });
    expect(onError).not.toHaveBeenCalled();
  });

  it('sends request with temperature 1.0 in stream mode', async () => {
    async function* fakeStream() {}
    mockCreate.mockResolvedValue(fakeStream());

    const onText = vi.fn();
    const onEnd = vi.fn();
    const onError = vi.fn();

    await provider.stream({ system: 'sys', prompt: 'prompt' }, { onText, onEnd, onError });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ temperature: 1.0, stream: true }),
    );
  });

  it('calls onError when stream throws', async () => {
    mockCreate.mockResolvedValue({
      [Symbol.asyncIterator]: async function* () {
        yield { choices: [{ delta: { content: 'partial' }, finish_reason: null }], usage: null };
        throw new Error('network error');
      },
    });

    const onText = vi.fn();
    const onEnd = vi.fn();
    const onError = vi.fn();

    await provider.stream({ system: 'sys', prompt: 'prompt' }, { onText, onEnd, onError });

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'network error' }));
  });
});
