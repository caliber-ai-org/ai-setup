import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MiniMaxProvider } from '../minimax.js';
import type { LLMConfig } from '../types.js';

const createMock = vi.fn();

vi.mock('openai', () => {
  return {
    default: class MockOpenAI {
      chat = { completions: { create: createMock } };
      models = { list: vi.fn() };
      constructor(public opts: Record<string, unknown>) {}
    },
  };
});

vi.mock('../usage.js', () => ({ trackUsage: vi.fn() }));

import OpenAI from 'openai';

const BASE_CONFIG: LLMConfig = { provider: 'minimax', model: 'MiniMax-M2.7', apiKey: 'test-key' };

describe('MiniMaxProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('constructor passes apiKey and MiniMax base URL to OpenAI client', () => {
    const provider = new MiniMaxProvider(BASE_CONFIG);
    const instance = (provider as unknown as { client: InstanceType<typeof OpenAI> }).client;
    const opts = (instance as unknown as { opts: Record<string, unknown> }).opts;
    expect(opts.apiKey).toBe('test-key');
    expect(opts.baseURL).toBe('https://api.minimax.io/v1');
  });

  it('constructor uses MINIMAX_API_KEY env var when config has no apiKey', () => {
    const orig = process.env.MINIMAX_API_KEY;
    process.env.MINIMAX_API_KEY = 'env-key';
    const provider = new MiniMaxProvider({ provider: 'minimax', model: 'MiniMax-M2.7' });
    const instance = (provider as unknown as { client: InstanceType<typeof OpenAI> }).client;
    const opts = (instance as unknown as { opts: Record<string, unknown> }).opts;
    expect(opts.apiKey).toBe('env-key');
    if (orig !== undefined) process.env.MINIMAX_API_KEY = orig;
    else delete process.env.MINIMAX_API_KEY;
  });

  it('constructor uses MINIMAX_BASE_URL env var when config has no baseUrl', () => {
    const orig = process.env.MINIMAX_BASE_URL;
    process.env.MINIMAX_BASE_URL = 'https://custom.minimax.io/v2';
    const provider = new MiniMaxProvider(BASE_CONFIG);
    const instance = (provider as unknown as { client: InstanceType<typeof OpenAI> }).client;
    const opts = (instance as unknown as { opts: Record<string, unknown> }).opts;
    expect(opts.baseURL).toBe('https://custom.minimax.io/v2');
    if (orig !== undefined) process.env.MINIMAX_BASE_URL = orig;
    else delete process.env.MINIMAX_BASE_URL;
  });

  it('call() sends temperature 1.0', async () => {
    createMock.mockResolvedValue({
      choices: [{ message: { content: 'hello' } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    });
    const provider = new MiniMaxProvider(BASE_CONFIG);
    await provider.call({ system: 'S', prompt: 'P' });
    expect(createMock).toHaveBeenCalledWith(expect.objectContaining({ temperature: 1.0 }));
  });

  it('call() returns response content', async () => {
    createMock.mockResolvedValue({
      choices: [{ message: { content: 'world' } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    });
    const provider = new MiniMaxProvider(BASE_CONFIG);
    const result = await provider.call({ system: 'S', prompt: 'P' });
    expect(result).toBe('world');
  });

  it('stream() sends temperature 1.0', async () => {
    const asyncIter = {
      async *[Symbol.asyncIterator]() {
        yield { choices: [{ delta: { content: 'hi' }, finish_reason: null }] };
        yield { choices: [{ delta: { content: null }, finish_reason: 'stop' }] };
      },
    };
    createMock.mockResolvedValue(asyncIter);
    const provider = new MiniMaxProvider(BASE_CONFIG);
    const onText = vi.fn();
    const onEnd = vi.fn();
    await provider.stream({ system: 'S', prompt: 'P' }, { onText, onEnd, onError: vi.fn() });
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ temperature: 1.0, stream: true }),
    );
    expect(onText).toHaveBeenCalledWith('hi');
    expect(onEnd).toHaveBeenCalled();
  });

  it('listModels() returns hardcoded MiniMax models', async () => {
    const provider = new MiniMaxProvider(BASE_CONFIG);
    const models = await provider.listModels();
    expect(models).toEqual(['MiniMax-M2.7', 'MiniMax-M2.7-highspeed']);
  });
});
