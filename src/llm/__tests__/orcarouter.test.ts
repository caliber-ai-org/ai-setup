import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OrcaRouterProvider, ORCAROUTER_DEFAULT_BASE_URL } from '../orcarouter.js';
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
  provider: 'orcarouter',
  model: 'openai/gpt-4o',
  apiKey: 'orca-key',
};

describe('OrcaRouterProvider', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.ORCAROUTER_API_KEY;
    delete process.env.ORCAROUTER_BASE_URL;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('constructor passes apiKey and OrcaRouter base URL to OpenAI client', () => {
    const provider = new OrcaRouterProvider(BASE_CONFIG);
    const instance = (provider as unknown as { client: InstanceType<typeof OpenAI> }).client;
    const opts = (instance as unknown as { opts: Record<string, unknown> }).opts;
    expect(opts.apiKey).toBe('orca-key');
    expect(opts.baseURL).toBe(ORCAROUTER_DEFAULT_BASE_URL);
  });

  it('constructor supports ORCAROUTER_API_KEY env var when config has no apiKey', () => {
    process.env.ORCAROUTER_API_KEY = 'env-key';
    const provider = new OrcaRouterProvider({
      provider: 'orcarouter',
      model: 'openai/gpt-4o',
    });
    const instance = (provider as unknown as { client: InstanceType<typeof OpenAI> }).client;
    const opts = (instance as unknown as { opts: Record<string, unknown> }).opts;
    expect(opts.apiKey).toBe('env-key');
  });

  it('constructor supports ORCAROUTER_BASE_URL env var when config has no baseUrl', () => {
    process.env.ORCAROUTER_BASE_URL = 'https://gateway.example.com/v1';
    const provider = new OrcaRouterProvider(BASE_CONFIG);
    const instance = (provider as unknown as { client: InstanceType<typeof OpenAI> }).client;
    const opts = (instance as unknown as { opts: Record<string, unknown> }).opts;
    expect(opts.baseURL).toBe('https://gateway.example.com/v1');
  });

  it('listModels() falls back to known OrcaRouter chat models when listing fails', async () => {
    listMock.mockRejectedValue(new Error('listing unavailable'));
    const provider = new OrcaRouterProvider(BASE_CONFIG);
    await expect(provider.listModels()).resolves.toEqual([
      'openai/gpt-4o',
      'openai/gpt-4o-mini',
      'deepseek/deepseek-v4-flash',
    ]);
  });
});
