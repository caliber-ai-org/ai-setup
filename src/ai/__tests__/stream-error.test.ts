import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LLMStreamCallbacks } from '../../llm/types.js';

const mockStream = vi.fn();

vi.mock('../../llm/index.js', () => ({
  getProvider: () => ({ stream: mockStream }),
  llmJsonCall: vi.fn().mockResolvedValue({ name: 'test', description: 'test', content: 'test' }),
  TRANSIENT_ERRORS: ['terminated', 'ECONNRESET'],
}));

vi.mock('../../llm/config.js', () => ({
  getFastModel: () => undefined,
}));

vi.mock('../prompts.js', () => ({
  GENERATION_SYSTEM_PROMPT: 'test system prompt',
  CORE_GENERATION_PROMPT: 'test core prompt',
  SKILL_GENERATION_PROMPT: 'test skill prompt',
  REFINE_SYSTEM_PROMPT: 'test refine prompt',
}));

vi.mock('../../llm/utils.js', () => ({
  stripMarkdownFences: (text: string) => text.replace(/^```(?:json)?\s*/im, '').replace(/```\s*$/m, '').trim(),
}));

import { generateSetup } from '../generate.js';
import { refineSetup } from '../refine.js';

describe('generateSetup stream error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('catches synchronous stream setup errors', async () => {
    mockStream.mockRejectedValue(new Error('Provider initialization failed'));

    const onError = vi.fn();
    const result = await generateSetup(
      { languages: [], frameworks: [], tools: [], fileTree: [], existingConfigs: {} },
      ['claude'],
      undefined,
      { onStatus: vi.fn(), onComplete: vi.fn(), onError }
    );

    expect(result.setup).toBeNull();
    expect(onError).toHaveBeenCalledWith('Provider initialization failed');
  });

  it('resolves with setup when stream completes successfully', async () => {
    const setup = { targetAgent: 'claude', claude: { claudeMd: '# Test' } };
    mockStream.mockImplementation((_opts: unknown, callbacks: LLMStreamCallbacks) => {
      callbacks.onText(JSON.stringify(setup));
      callbacks.onEnd({ stopReason: 'end_turn' });
      return Promise.resolve();
    });

    const result = await generateSetup(
      { languages: [], frameworks: [], tools: [], fileTree: [], existingConfigs: {} },
      ['claude']
    );

    expect(result.setup).toMatchObject(setup);
  });

  it('returns null setup when JSON is unparseable', async () => {
    mockStream.mockImplementation((_opts: unknown, callbacks: LLMStreamCallbacks) => {
      callbacks.onText('This is not JSON at all');
      callbacks.onEnd({ stopReason: 'end_turn' });
      return Promise.resolve();
    });

    const result = await generateSetup(
      { languages: [], frameworks: [], tools: [], fileTree: [], existingConfigs: {} },
      ['claude']
    );

    expect(result.setup).toBeNull();
    expect(result.raw).toContain('This is not JSON');
  });

  it('retries on transient stream errors', async () => {
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
    const result = await generateSetup(
      { languages: [], frameworks: [], tools: [], fileTree: [], existingConfigs: {} },
      ['claude'],
      undefined,
      { onStatus, onComplete: vi.fn(), onError: vi.fn() }
    );

    expect(callCount).toBe(2);
    expect(result.setup).toMatchObject(setup);
    expect(onStatus).toHaveBeenCalledWith('Connection interrupted, retrying...');
  });
});

describe('refineSetup stream error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('catches synchronous stream setup errors', async () => {
    mockStream.mockRejectedValue(new Error('Stream init failed'));

    const onError = vi.fn();
    const result = await refineSetup(
      { claude: { claudeMd: 'test' } },
      'add testing section',
      undefined,
      { onComplete: vi.fn(), onError }
    );

    expect(result).toBeNull();
    expect(onError).toHaveBeenCalledWith('Stream init failed');
  });

  it('parses valid JSON from stream', async () => {
    const setup = { claude: { claudeMd: '# Updated' } };
    mockStream.mockImplementation((_opts: unknown, callbacks: LLMStreamCallbacks) => {
      callbacks.onText(JSON.stringify(setup));
      callbacks.onEnd();
      return Promise.resolve();
    });

    const result = await refineSetup({ claude: {} }, 'update it');
    expect(result).toEqual(setup);
  });

  it('returns null on unparseable response', async () => {
    mockStream.mockImplementation((_opts: unknown, callbacks: LLMStreamCallbacks) => {
      callbacks.onText('not json');
      callbacks.onEnd();
      return Promise.resolve();
    });

    const onError = vi.fn();
    const result = await refineSetup(
      { claude: {} },
      'update',
      undefined,
      { onComplete: vi.fn(), onError }
    );

    expect(result).toBeNull();
    expect(onError).toHaveBeenCalledWith('Failed to parse AI response. Try rephrasing your request.');
  });

  it('reports stream errors via callbacks', async () => {
    mockStream.mockImplementation((_opts: unknown, callbacks: LLMStreamCallbacks) => {
      callbacks.onError(new Error('Network error'));
      return Promise.resolve();
    });

    const onError = vi.fn();
    const result = await refineSetup(
      { claude: {} },
      'update',
      undefined,
      { onComplete: vi.fn(), onError }
    );

    expect(result).toBeNull();
    expect(onError).toHaveBeenCalledWith('Network error');
  });
});
