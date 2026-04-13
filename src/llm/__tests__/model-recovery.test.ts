import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.unmock('../model-recovery.js');

const { mockWriteConfigFile } = vi.hoisted(() => ({
  mockWriteConfigFile: vi.fn(),
}));

vi.mock('../config.js', () => ({
  writeConfigFile: (...args: unknown[]) => mockWriteConfigFile(...args),
}));

const { mockSelect } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
}));

vi.mock('@inquirer/select', () => ({
  default: (...args: unknown[]) => mockSelect(...args),
}));

import { isModelNotAvailableError, handleModelNotAvailable } from '../model-recovery.js';
import type { LLMConfig, LLMProvider } from '../types.js';

describe('isModelNotAvailableError', () => {
  it('detects 404 with model in message', () => {
    const err = Object.assign(new Error('model not found'), { status: 404 });
    expect(isModelNotAvailableError(err)).toBe(true);
  });

  it('detects "model" + "not found" in message without status', () => {
    expect(isModelNotAvailableError(new Error('The model claude-xyz was not found'))).toBe(true);
  });

  it('detects "model" + "not_found" in message', () => {
    expect(
      isModelNotAvailableError(new Error('error type: not_found_error, model: claude-xyz')),
    ).toBe(true);
  });

  it('detects "model" + "not available" in message', () => {
    expect(
      isModelNotAvailableError(
        new Error('The model claude-opus-4-6 is not available on your vertex deployment'),
      ),
    ).toBe(true);
  });

  it('detects "model" + "does not exist" in message', () => {
    expect(isModelNotAvailableError(new Error("The model 'gpt-5' does not exist"))).toBe(true);
  });

  it('detects "Publisher model" messages (Vertex)', () => {
    expect(
      isModelNotAvailableError(new Error('Publisher model is not found or access denied')),
    ).toBe(true);
  });

  it('detects "usage limit" messages', () => {
    expect(isModelNotAvailableError(new Error("You've reached your normal usage limit."))).toBe(
      true,
    );
  });

  it('detects "out of usage" messages', () => {
    expect(
      isModelNotAvailableError(new Error("You're out of usage. Switch to Auto or Composer 1.5")),
    ).toBe(true);
  });

  it('returns false for unrelated errors', () => {
    expect(isModelNotAvailableError(new Error('ECONNRESET'))).toBe(false);
  });

  it('returns false for 404 without model in message', () => {
    const err = Object.assign(new Error('resource not found'), { status: 404 });
    expect(isModelNotAvailableError(err)).toBe(false);
  });

  it('returns false for overloaded errors', () => {
    expect(isModelNotAvailableError(new Error('529 overloaded'))).toBe(false);
  });
});

describe('handleModelNotAvailable', () => {
  const originalIsTTY = process.stdin.isTTY;
  const originalCaliberModel = process.env.CALIBER_MODEL;
  const originalCaliberFastModel = process.env.CALIBER_FAST_MODEL;

  beforeEach(() => {
    vi.clearAllMocks();
    process.stdin.isTTY = true;
    delete process.env.CALIBER_MODEL;
    delete process.env.CALIBER_FAST_MODEL;
  });

  afterEach(() => {
    process.stdin.isTTY = originalIsTTY;
    if (originalCaliberModel !== undefined) process.env.CALIBER_MODEL = originalCaliberModel;
    else delete process.env.CALIBER_MODEL;
    if (originalCaliberFastModel !== undefined)
      process.env.CALIBER_FAST_MODEL = originalCaliberFastModel;
    else delete process.env.CALIBER_FAST_MODEL;
  });

  const makeProvider = (listModels?: () => Promise<string[]>): LLMProvider => ({
    call: vi.fn(),
    stream: vi.fn(),
    ...(listModels ? { listModels } : {}),
  });

  const makeConfig = (overrides?: Partial<LLMConfig>): LLMConfig => ({
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    ...overrides,
  });

  it('returns null in non-interactive mode', async () => {
    process.stdin.isTTY = false;
    const provider = makeProvider();
    const config = makeConfig();

    const result = await handleModelNotAvailable('claude-sonnet-4-6', provider, config);

    expect(result).toBeNull();
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it('uses provider.listModels() when available', async () => {
    const listModels = vi.fn().mockResolvedValue([
      'claude-sonnet-4-6',
      'claude-haiku-4-5-20251001',
      'claude-opus-4-1-20250620',
      'whisper-1', // should be filtered out
    ]);
    const provider = makeProvider(listModels);
    const config = makeConfig();
    mockSelect.mockResolvedValue('claude-haiku-4-5-20251001');

    const result = await handleModelNotAvailable('claude-sonnet-4-6', provider, config);

    expect(result).toBe('claude-haiku-4-5-20251001');
    expect(listModels).toHaveBeenCalled();
    // Should only show claude- models, excluding the failed one
    expect(mockSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        choices: expect.arrayContaining([
          expect.objectContaining({ value: 'claude-haiku-4-5-20251001' }),
          expect.objectContaining({ value: 'claude-opus-4-1-20250620' }),
        ]),
      }),
    );
    // Should NOT include non-claude models or the failed model
    const choices = mockSelect.mock.calls[0][0].choices;
    expect(choices.find((c: { value: string }) => c.value === 'whisper-1')).toBeUndefined();
    expect(choices.find((c: { value: string }) => c.value === 'claude-sonnet-4-6')).toBeUndefined();
  });

  it('falls back to known models when listModels is not available', async () => {
    const provider = makeProvider(); // no listModels
    const config = makeConfig({ provider: 'vertex' });
    mockSelect.mockResolvedValue('claude-sonnet-4-6@20250514');

    const result = await handleModelNotAvailable('claude-opus-4-6@20250605', provider, config);

    expect(result).toBe('claude-sonnet-4-6@20250514');
  });

  it('falls back to known models when listModels throws', async () => {
    const listModels = vi.fn().mockRejectedValue(new Error('API error'));
    const provider = makeProvider(listModels);
    const config = makeConfig();
    mockSelect.mockResolvedValue('claude-haiku-4-5-20251001');

    const result = await handleModelNotAvailable('claude-sonnet-4-6', provider, config);

    expect(result).toBe('claude-haiku-4-5-20251001');
  });

  it('saves default model to config when the failed model is the default', async () => {
    const provider = makeProvider();
    const config = makeConfig({ provider: 'anthropic', model: 'claude-sonnet-4-6' });
    mockSelect.mockResolvedValue('claude-haiku-4-5-20251001');

    await handleModelNotAvailable('claude-sonnet-4-6', provider, config);

    expect(mockWriteConfigFile).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-haiku-4-5-20251001' }),
    );
    expect(process.env.CALIBER_MODEL).toBe('claude-haiku-4-5-20251001');
  });

  it('saves fast model to config when the failed model differs from default', async () => {
    const provider = makeProvider();
    const config = makeConfig({ provider: 'anthropic', model: 'claude-sonnet-4-6' });
    mockSelect.mockResolvedValue('claude-haiku-4-5-20251001');

    await handleModelNotAvailable('claude-haiku-4-5-20251001', provider, config);

    expect(mockWriteConfigFile).toHaveBeenCalledWith(
      expect.objectContaining({ fastModel: 'claude-haiku-4-5-20251001' }),
    );
    expect(process.env.CALIBER_FAST_MODEL).toBe('claude-haiku-4-5-20251001');
  });

  it('returns null when no alternatives are found', async () => {
    const provider = makeProvider();
    const config = makeConfig({ provider: 'claude-cli' }); // claude-cli has empty known models

    const result = await handleModelNotAvailable('default', provider, config);

    expect(result).toBeNull();
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it('offers cursor fallback models on usage limit', async () => {
    const provider = makeProvider();
    const config = makeConfig({ provider: 'cursor', model: 'sonnet-4.6' });
    mockSelect.mockResolvedValue('auto');

    const result = await handleModelNotAvailable('sonnet-4.6', provider, config);

    expect(result).toBe('auto');
    const choices = mockSelect.mock.calls[0][0].choices;
    const values = choices.map((c: { value: string }) => c.value);
    expect(values).toContain('auto');
    expect(values).toContain('composer-1.5');
    expect(values).not.toContain('sonnet-4.6');
  });

  it('returns null when user cancels selection', async () => {
    const provider = makeProvider();
    const config = makeConfig();
    mockSelect.mockRejectedValue(new Error('User cancelled'));

    const result = await handleModelNotAvailable('claude-sonnet-4-6', provider, config);

    expect(result).toBeNull();
    expect(mockWriteConfigFile).not.toHaveBeenCalled();
  });

  it('filters OpenAI models correctly', async () => {
    const listModels = vi
      .fn()
      .mockResolvedValue([
        'gpt-5.4-mini',
        'gpt-4o',
        'gpt-4o-mini',
        'dall-e-3',
        'text-embedding-3-small',
        'o3-mini',
      ]);
    const provider = makeProvider(listModels);
    const config = makeConfig({ provider: 'openai', model: 'gpt-5.4-mini' });
    mockSelect.mockResolvedValue('gpt-4o');

    await handleModelNotAvailable('gpt-5.4-mini', provider, config);

    const choices = mockSelect.mock.calls[0][0].choices;
    const values = choices.map((c: { value: string }) => c.value);
    expect(values).toContain('gpt-4o');
    expect(values).toContain('gpt-4o-mini');
    expect(values).toContain('o3-mini');
    expect(values).not.toContain('dall-e-3');
    expect(values).not.toContain('text-embedding-3-small');
    expect(values).not.toContain('gpt-5.4-mini'); // failed model excluded
  });
});
