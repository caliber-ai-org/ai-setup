import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  CheaperInferenceProvider,
  CHEAPERINFERENCE_DEFAULT_BASE_URL,
} from '../cheaperinference.js';
import type { LLMConfig } from '../types.js';

const createMock = vi.fn();
const listMock = vi.fn();

vi.mock('openai', () => {
  return {
    default: class MockOpenAI {
      chat = { completions: { create: createMock } };
      models = { list: listMock };
      constructor(public opts: Record<string, unknown>) {}
    },
  };
});

vi.mock('../usage.js', () => ({ trackUsage: vi.fn() }));

import OpenAI from 'openai';

const BASE_CONFIG: LLMConfig = {
  provider: 'cheaperinference',
  model: 'gpt-5.4-mini',
  apiKey: 'ci-key',
};

describe('CheaperInferenceProvider', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.CHEAPERINFERENCE_API_KEY;
    delete process.env.CHEAPER_INFERENCE_API_KEY;
    delete process.env.CHEAPERINFERENCE_BASE_URL;
    delete process.env.CHEAPER_INFERENCE_BASE_URL;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('constructor passes apiKey and Cheaper Inference base URL to OpenAI client', () => {
    const provider = new CheaperInferenceProvider(BASE_CONFIG);
    const instance = (provider as unknown as { client: InstanceType<typeof OpenAI> }).client;
    const opts = (instance as unknown as { opts: Record<string, unknown> }).opts;
    expect(opts.apiKey).toBe('ci-key');
    expect(opts.baseURL).toBe(CHEAPERINFERENCE_DEFAULT_BASE_URL);
  });

  it('constructor supports CHEAPER_INFERENCE_API_KEY env alias when config has no apiKey', () => {
    process.env.CHEAPER_INFERENCE_API_KEY = 'alias-key';
    const provider = new CheaperInferenceProvider({
      provider: 'cheaperinference',
      model: 'gpt-5.4-mini',
    });
    const instance = (provider as unknown as { client: InstanceType<typeof OpenAI> }).client;
    const opts = (instance as unknown as { opts: Record<string, unknown> }).opts;
    expect(opts.apiKey).toBe('alias-key');
  });

  it('constructor supports CHEAPERINFERENCE_BASE_URL env var when config has no baseUrl', () => {
    process.env.CHEAPERINFERENCE_BASE_URL = 'https://gateway.example.com/v1';
    const provider = new CheaperInferenceProvider(BASE_CONFIG);
    const instance = (provider as unknown as { client: InstanceType<typeof OpenAI> }).client;
    const opts = (instance as unknown as { opts: Record<string, unknown> }).opts;
    expect(opts.baseURL).toBe('https://gateway.example.com/v1');
  });

  it('listModels() falls back to known Cheaper Inference chat models when listing fails', async () => {
    listMock.mockRejectedValue(new Error('listing unavailable'));
    const provider = new CheaperInferenceProvider(BASE_CONFIG);
    await expect(provider.listModels()).resolves.toEqual([
      'gpt-5.4-mini',
      'gpt-5.4',
      'claude-sonnet-5',
      'deepseek-v4-flash',
    ]);
  });
});
