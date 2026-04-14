import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockSelect, mockConfirm, mockWriteConfigFile, mockQuestion } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockConfirm: vi.fn().mockResolvedValue(true),
  mockWriteConfigFile: vi.fn(),
  mockQuestion: vi.fn(),
}));

vi.mock('@inquirer/select', () => ({ default: mockSelect }));
vi.mock('@inquirer/confirm', () => ({ default: mockConfirm }));
vi.mock('../../llm/cursor-acp.js', () => ({ isCursorAgentAvailable: () => false }));
vi.mock('../../llm/claude-cli.js', () => ({ isClaudeCliAvailable: () => false }));
vi.mock('../../llm/config.js', () => ({
  writeConfigFile: (...args: unknown[]) => mockWriteConfigFile(...args),
  DEFAULT_MODELS: {
    anthropic: 'claude-sonnet-4-6',
    vertex: 'claude-sonnet-4-6',
    openai: 'gpt-5.4-mini',
    cursor: 'default',
    'claude-cli': 'default',
  },
}));

vi.mock('readline', () => ({
  default: {
    createInterface: () => ({
      question: (_q: string, cb: (answer: string) => void) => mockQuestion(_q, cb),
      close: vi.fn(),
    }),
  },
}));

import { runInteractiveProviderSetup } from '../interactive-provider-setup.js';

describe('runInteractiveProviderSetup', () => {
  let origIsTTY: boolean | undefined;
  beforeEach(() => {
    vi.clearAllMocks();
    // Tests simulate an interactive (TTY) session — promptInput() guards on isTTY
    origIsTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
  });
  afterEach(() => {
    Object.defineProperty(process.stdin, 'isTTY', { value: origIsTTY, configurable: true });
  });

  it('configures claude-cli provider without API key', async () => {
    mockSelect.mockResolvedValue('claude-cli');

    const config = await runInteractiveProviderSetup();

    expect(config.provider).toBe('claude-cli');
    expect(config.model).toBe('default');
    expect(config.apiKey).toBeUndefined();
    expect(mockWriteConfigFile).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'claude-cli', model: 'default' }),
    );
  });

  it('configures cursor provider with default model', async () => {
    mockSelect.mockResolvedValue('cursor');
    mockQuestion.mockImplementationOnce((_q: string, cb: (answer: string) => void) => cb(''));

    const config = await runInteractiveProviderSetup();

    expect(config.provider).toBe('cursor');
    expect(config.model).toBe('default');
    expect(config.apiKey).toBeUndefined();
    expect(mockWriteConfigFile).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'cursor', model: 'default' }),
    );
  });

  it('configures cursor provider with custom model', async () => {
    mockSelect.mockResolvedValue('cursor');
    mockQuestion.mockImplementationOnce((_q: string, cb: (answer: string) => void) => cb('auto'));

    const config = await runInteractiveProviderSetup();

    expect(config.provider).toBe('cursor');
    expect(config.model).toBe('auto');
    expect(mockWriteConfigFile).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'cursor', model: 'auto' }),
    );
  });

  it('configures anthropic provider with API key and model', async () => {
    mockSelect.mockResolvedValue('anthropic');
    mockQuestion
      .mockImplementationOnce((_q: string, cb: (answer: string) => void) => cb('sk-ant-test123'))
      .mockImplementationOnce((_q: string, cb: (answer: string) => void) => cb(''));

    const config = await runInteractiveProviderSetup();

    expect(config.provider).toBe('anthropic');
    expect(config.apiKey).toBe('sk-ant-test123');
    expect(config.model).toBe('claude-sonnet-4-6');
    expect(mockWriteConfigFile).toHaveBeenCalled();
  });

  it('throws __exit__ when anthropic API key is empty', async () => {
    mockSelect.mockResolvedValue('anthropic');
    mockQuestion.mockImplementation((_q: string, cb: (answer: string) => void) => cb(''));

    await expect(runInteractiveProviderSetup()).rejects.toThrow('__exit__');
    expect(mockWriteConfigFile).not.toHaveBeenCalled();
  });

  it('configures openai provider with API key and custom base URL', async () => {
    mockSelect.mockResolvedValue('openai');
    mockQuestion
      .mockImplementationOnce((_q: string, cb: (answer: string) => void) => cb('sk-openai-test'))
      .mockImplementationOnce((_q: string, cb: (answer: string) => void) =>
        cb('http://localhost:11434/v1'),
      )
      .mockImplementationOnce((_q: string, cb: (answer: string) => void) => cb(''));

    const config = await runInteractiveProviderSetup();

    expect(config.provider).toBe('openai');
    expect(config.apiKey).toBe('sk-openai-test');
    expect(config.baseUrl).toBe('http://localhost:11434/v1');
    expect(config.model).toBe('gpt-5.4-mini');
  });

  it('throws __exit__ when openai API key is empty', async () => {
    mockSelect.mockResolvedValue('openai');
    mockQuestion.mockImplementation((_q: string, cb: (answer: string) => void) => cb(''));

    await expect(runInteractiveProviderSetup()).rejects.toThrow('__exit__');
  });

  it('configures vertex provider with project ID and region', async () => {
    mockSelect.mockResolvedValue('vertex');
    mockQuestion
      .mockImplementationOnce((_q: string, cb: (answer: string) => void) => cb('my-gcp-project'))
      .mockImplementationOnce((_q: string, cb: (answer: string) => void) => cb(''))
      .mockImplementationOnce((_q: string, cb: (answer: string) => void) => cb(''))
      .mockImplementationOnce((_q: string, cb: (answer: string) => void) => cb(''));

    const config = await runInteractiveProviderSetup();

    expect(config.provider).toBe('vertex');
    expect(config.vertexProjectId).toBe('my-gcp-project');
    expect(config.vertexRegion).toBe('us-east5');
    expect(config.model).toBe('claude-sonnet-4-6');
  });

  it('throws __exit__ when vertex project ID is empty', async () => {
    mockSelect.mockResolvedValue('vertex');
    mockQuestion.mockImplementation((_q: string, cb: (answer: string) => void) => cb(''));

    await expect(runInteractiveProviderSetup()).rejects.toThrow('__exit__');
  });

  it('passes custom select message to inquirer', async () => {
    mockSelect.mockResolvedValue('claude-cli');

    await runInteractiveProviderSetup({ selectMessage: 'Pick your provider' });

    expect(mockSelect).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Pick your provider' }),
    );
  });

  it('uses default select message when none provided', async () => {
    mockSelect.mockResolvedValue('cursor');
    mockQuestion.mockImplementationOnce((_q: string, cb: (answer: string) => void) => cb(''));

    await runInteractiveProviderSetup();

    expect(mockSelect).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Select LLM provider' }),
    );
  });
});
