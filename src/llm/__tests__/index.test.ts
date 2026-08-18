import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Unmock the global setup mock for llm/index.js so we can test the real module
vi.unmock('../index.js');

const {
  mockLoadConfig,
  mockIsCursorAgentAvailable,
  mockIsCursorLoggedIn,
  mockIsClaudeCliAvailable,
  mockIsClaudeCliLoggedIn,
  MockAnthropicProvider,
  MockVertexProvider,
  MockOpenAIProvider,
  MockAtlasCloudProvider,
  MockOrcaRouterProvider,
  MockCursorAcpProvider,
  MockClaudeCliProvider,
} = vi.hoisted(() => {
  class MockAnthropicProvider {
    config: unknown;
    call = vi.fn();
    stream = vi.fn();
    constructor(c: unknown) {
      this.config = c;
    }
  }
  class MockVertexProvider {
    config: unknown;
    call = vi.fn();
    stream = vi.fn();
    constructor(c: unknown) {
      this.config = c;
    }
  }
  class MockOpenAIProvider {
    config: unknown;
    call = vi.fn();
    stream = vi.fn();
    constructor(c: unknown) {
      this.config = c;
    }
  }
  class MockAtlasCloudProvider {
    config: unknown;
    call = vi.fn();
    stream = vi.fn();
    constructor(c: unknown) {
      this.config = c;
    }
  }
  class MockOrcaRouterProvider {
    config: unknown;
    call = vi.fn();
    stream = vi.fn();
    constructor(c: unknown) {
      this.config = c;
    }
  }
  class MockCursorAcpProvider {
    config: unknown;
    call = vi.fn();
    stream = vi.fn();
    constructor(c: unknown) {
      this.config = c;
    }
  }
  class MockClaudeCliProvider {
    config: unknown;
    call = vi.fn();
    stream = vi.fn();
    constructor(c: unknown) {
      this.config = c;
    }
  }

  return {
    mockLoadConfig: vi.fn(),
    mockIsCursorAgentAvailable: vi.fn(),
    mockIsCursorLoggedIn: vi.fn(),
    mockIsClaudeCliAvailable: vi.fn(),
    mockIsClaudeCliLoggedIn: vi.fn(),
    MockAnthropicProvider,
    MockVertexProvider,
    MockOpenAIProvider,
    MockAtlasCloudProvider,
    MockOrcaRouterProvider,
    MockCursorAcpProvider,
    MockClaudeCliProvider,
  };
});

vi.mock('../config.js', () => ({
  loadConfig: () => mockLoadConfig(),
  writeConfigFile: vi.fn(),
  getConfigFilePath: vi.fn(),
}));

vi.mock('../anthropic.js', () => ({
  AnthropicProvider: MockAnthropicProvider,
}));

vi.mock('../vertex.js', () => ({
  VertexProvider: MockVertexProvider,
}));

vi.mock('../openai-compat.js', () => ({
  OpenAICompatProvider: MockOpenAIProvider,
}));

vi.mock('../atlascloud.js', () => ({
  AtlasCloudProvider: MockAtlasCloudProvider,
}));

vi.mock('../orcarouter.js', () => ({
  OrcaRouterProvider: MockOrcaRouterProvider,
}));

vi.mock('../cursor-acp.js', () => ({
  CursorAcpProvider: MockCursorAcpProvider,
  isCursorAgentAvailable: () => mockIsCursorAgentAvailable(),
  isCursorLoggedIn: () => mockIsCursorLoggedIn(),
}));

vi.mock('../claude-cli.js', () => ({
  ClaudeCliProvider: MockClaudeCliProvider,
  isClaudeCliAvailable: () => mockIsClaudeCliAvailable(),
  isClaudeCliLoggedIn: () => mockIsClaudeCliLoggedIn(),
}));

import { getProvider, getConfig, resetProvider, llmCall } from '../index.js';

describe('getProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetProvider();
  });

  it('creates AnthropicProvider for anthropic config', () => {
    mockLoadConfig.mockReturnValue({
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      apiKey: 'sk-test',
    });

    const provider = getProvider();

    expect(provider).toBeInstanceOf(MockAnthropicProvider);
    expect((provider as InstanceType<typeof MockAnthropicProvider>).config).toEqual({
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      apiKey: 'sk-test',
    });
  });

  it('creates CursorAcpProvider when cursor is configured, available, and logged in', () => {
    mockLoadConfig.mockReturnValue({ provider: 'cursor', model: 'default' });
    mockIsCursorAgentAvailable.mockReturnValue(true);
    mockIsCursorLoggedIn.mockReturnValue(true);

    const provider = getProvider();

    expect(provider).toBeInstanceOf(MockCursorAcpProvider);
  });

  it('creates AtlasCloudProvider for atlascloud config', () => {
    mockLoadConfig.mockReturnValue({
      provider: 'atlascloud',
      model: 'deepseek-ai/deepseek-v4-pro',
      apiKey: 'atlas-key',
      baseUrl: 'https://api.atlascloud.ai/v1',
    });

    const provider = getProvider();

    expect(provider).toBeInstanceOf(MockAtlasCloudProvider);
    expect((provider as InstanceType<typeof MockAtlasCloudProvider>).config).toEqual({
      provider: 'atlascloud',
      model: 'deepseek-ai/deepseek-v4-pro',
      apiKey: 'atlas-key',
      baseUrl: 'https://api.atlascloud.ai/v1',
    });
  });

  it('creates OrcaRouterProvider for orcarouter config', () => {
    mockLoadConfig.mockReturnValue({
      provider: 'orcarouter',
      model: 'openai/gpt-4o',
      apiKey: 'orca-key',
      baseUrl: 'https://api.orcarouter.ai/v1',
    });

    const provider = getProvider();

    expect(provider).toBeInstanceOf(MockOrcaRouterProvider);
    expect((provider as InstanceType<typeof MockOrcaRouterProvider>).config).toEqual({
      provider: 'orcarouter',
      model: 'openai/gpt-4o',
      apiKey: 'orca-key',
      baseUrl: 'https://api.orcarouter.ai/v1',
    });
  });

  it('throws when cursor is configured but agent binary is not available', () => {
    mockLoadConfig.mockReturnValue({ provider: 'cursor', model: 'default' });
    mockIsCursorAgentAvailable.mockReturnValue(false);

    expect(() => getProvider()).toThrow('Cursor provider requires the Cursor Agent CLI');
  });

  it('throws when cursor is configured but not logged in', () => {
    mockLoadConfig.mockReturnValue({ provider: 'cursor', model: 'default' });
    mockIsCursorAgentAvailable.mockReturnValue(true);
    mockIsCursorLoggedIn.mockReturnValue(false);

    expect(() => getProvider()).toThrow('not logged in');
  });

  it('creates ClaudeCliProvider when claude-cli is configured and CLI is available and logged in', () => {
    mockLoadConfig.mockReturnValue({ provider: 'claude-cli', model: 'default' });
    mockIsClaudeCliAvailable.mockReturnValue(true);
    mockIsClaudeCliLoggedIn.mockReturnValue(true);

    const provider = getProvider();

    expect(provider).toBeInstanceOf(MockClaudeCliProvider);
  });

  it('throws when claude-cli is configured but CLI is not available', () => {
    mockLoadConfig.mockReturnValue({ provider: 'claude-cli', model: 'default' });
    mockIsClaudeCliAvailable.mockReturnValue(false);

    expect(() => getProvider()).toThrow('Claude Code provider requires the Claude Code CLI');
  });

  it('throws when claude-cli is configured but not logged in', () => {
    mockLoadConfig.mockReturnValue({ provider: 'claude-cli', model: 'default' });
    mockIsClaudeCliAvailable.mockReturnValue(true);
    mockIsClaudeCliLoggedIn.mockReturnValue(false);

    expect(() => getProvider()).toThrow('not logged in');
  });

  it('throws when no config is available', () => {
    mockLoadConfig.mockReturnValue(null);

    expect(() => getProvider()).toThrow('No LLM provider configured');
  });

  it('caches provider on subsequent calls', () => {
    mockLoadConfig.mockReturnValue({
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      apiKey: 'sk-test',
    });

    const first = getProvider();
    const second = getProvider();

    expect(first).toBe(second);
    expect(mockLoadConfig).toHaveBeenCalledTimes(1);
  });

  it('throws for unknown provider type', () => {
    mockLoadConfig.mockReturnValue({ provider: 'gemini', model: 'gemini-2' });

    expect(() => getProvider()).toThrow('Unknown provider: gemini');
  });
});

describe('getConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetProvider();
  });

  it('returns config from loadConfig', () => {
    mockLoadConfig.mockReturnValue({
      provider: 'openai',
      model: 'gpt-5.4-mini',
      apiKey: 'sk-test',
    });

    const config = getConfig();

    expect(config.provider).toBe('openai');
    expect(config.model).toBe('gpt-5.4-mini');
  });

  it('throws when no config is available', () => {
    mockLoadConfig.mockReturnValue(null);

    expect(() => getConfig()).toThrow('No LLM provider configured');
  });

  it('caches config on subsequent calls', () => {
    mockLoadConfig.mockReturnValue({ provider: 'anthropic', model: 'test', apiKey: 'k' });

    const first = getConfig();
    const second = getConfig();

    expect(first).toBe(second);
    expect(mockLoadConfig).toHaveBeenCalledTimes(1);
  });
});

describe('resetProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetProvider();
  });

  it('clears cached provider so next call re-creates', () => {
    mockLoadConfig
      .mockReturnValueOnce({ provider: 'anthropic', model: 'a', apiKey: 'k1' })
      .mockReturnValueOnce({ provider: 'anthropic', model: 'b', apiKey: 'k2' });

    const first = getProvider();
    resetProvider();
    const second = getProvider();

    expect(first).not.toBe(second);
    expect(mockLoadConfig).toHaveBeenCalledTimes(2);
  });
});

describe('llmCall timeout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetProvider();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects with timeout when provider call hangs', async () => {
    mockLoadConfig.mockReturnValue({ provider: 'anthropic', model: 'test', apiKey: 'k' });

    // Override the cached provider's call to return a never-settling promise
    const provider = getProvider();
    (provider.call as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));

    vi.useFakeTimers();
    const orig = process.env.CALIBER_LLM_TIMEOUT_MS;
    process.env.CALIBER_LLM_TIMEOUT_MS = '1000';

    const promise = llmCall({ system: 'S', prompt: 'P' });
    const rejection = promise.catch((e: unknown) => e);

    await vi.advanceTimersByTimeAsync(1000);

    const error = await rejection;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/timed out after/);

    if (orig !== undefined) {
      process.env.CALIBER_LLM_TIMEOUT_MS = orig;
    } else {
      delete process.env.CALIBER_LLM_TIMEOUT_MS;
    }
    vi.useRealTimers();
  });

  it('preserves underlying transport error when provider rejects before timeout', async () => {
    mockLoadConfig.mockReturnValue({ provider: 'anthropic', model: 'test', apiKey: 'k' });

    const provider = getProvider();
    (provider.call as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('AUTH: invalid api key'),
    );

    vi.useFakeTimers();
    const orig = process.env.CALIBER_LLM_TIMEOUT_MS;
    process.env.CALIBER_LLM_TIMEOUT_MS = '10000';

    const promise = llmCall({ system: 'S', prompt: 'P' });
    const rejection = promise.catch((e: unknown) => e);

    // Advance just a tick so the mock rejection propagates
    await vi.advanceTimersByTimeAsync(1);

    const error = await rejection;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('invalid api key');

    if (orig !== undefined) {
      process.env.CALIBER_LLM_TIMEOUT_MS = orig;
    } else {
      delete process.env.CALIBER_LLM_TIMEOUT_MS;
    }
    vi.useRealTimers();
  });

  it('cleanly resolves when provider responds before timeout', async () => {
    mockLoadConfig.mockReturnValue({ provider: 'anthropic', model: 'test', apiKey: 'k' });

    const provider = getProvider();
    (provider.call as ReturnType<typeof vi.fn>).mockResolvedValue('{"ok": true}');

    vi.useFakeTimers();
    const orig = process.env.CALIBER_LLM_TIMEOUT_MS;
    process.env.CALIBER_LLM_TIMEOUT_MS = '10000';

    const resultPromise = llmCall({ system: 'S', prompt: 'P' });

    // Advance past timeout to verify timer was cleaned up
    await vi.advanceTimersByTimeAsync(10000);

    const result = await resultPromise;
    expect(result).toBe('{"ok": true}');

    if (orig !== undefined) {
      process.env.CALIBER_LLM_TIMEOUT_MS = orig;
    } else {
      delete process.env.CALIBER_LLM_TIMEOUT_MS;
    }
    vi.useRealTimers();
  });

  it('skips the outer timeout for OpenAI-compat providers with their own bound', async () => {
    mockLoadConfig.mockReturnValue({
      provider: 'openai',
      model: 'gpt-4o',
      apiKey: 'k',
    });

    const provider = getProvider();
    let resolveCall!: (v: string) => void;
    (provider.call as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise<string>((resolve) => {
        resolveCall = resolve;
      }),
    );

    vi.useFakeTimers();
    const orig = process.env.CALIBER_LLM_TIMEOUT_MS;
    process.env.CALIBER_LLM_TIMEOUT_MS = '1000';

    const promise = llmCall({ system: 'S', prompt: 'P' });
    // Past the outer 1s — must not reject; OpenAI has its own 10min timeout.
    await vi.advanceTimersByTimeAsync(5000);
    resolveCall('late-ok');
    await expect(promise).resolves.toBe('late-ok');

    if (orig !== undefined) {
      process.env.CALIBER_LLM_TIMEOUT_MS = orig;
    } else {
      delete process.env.CALIBER_LLM_TIMEOUT_MS;
    }
    vi.useRealTimers();
  });
});
