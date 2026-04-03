import { describe, it, expect, vi, beforeEach } from 'vitest';

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

import { getProvider, getConfig, resetProvider } from '../index.js';

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
