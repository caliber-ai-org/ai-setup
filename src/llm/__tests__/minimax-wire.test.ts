import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getConfigFilePath, getFastModel, getMaxPromptTokens } from '../config.js';
import { getProvider, llmCall, resetProvider } from '../index.js';
import type { LLMConfig } from '../types.js';

vi.unmock('../index.js');
vi.mock('../usage.js', () => ({ trackUsage: vi.fn() }));

const endpoints = [
  'https://api.minimax.io/v1',
  'https://api.minimaxi.com/v1',
  'https://api.minimax.io/anthropic',
  'https://api.minimaxi.com/anthropic',
  'https://custom.example/v1',
  'https://custom.example/anthropic',
];
const prompt = { system: 'System instructions', prompt: 'Current prompt' };
const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
let saved: LLMConfig | undefined;
let failSdk = false;

function anthropicMessage(model: unknown) {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model,
    content: [
      { type: 'thinking', thinking: 'Internal reasoning', signature: 'test' },
      { type: 'text', text: 'answer' },
    ],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
  };
}

beforeEach(() => {
  resetProvider();
  saved = undefined;
  failSdk = false;
  requests.length = 0;
  for (const key of [
    'ANTHROPIC_API_KEY',
    'OPENAI_API_KEY',
    'VERTEX_PROJECT_ID',
    'GCP_PROJECT_ID',
    'CALIBER_MODEL',
    'CALIBER_FAST_MODEL',
  ]) {
    vi.stubEnv(key, '');
  }
  vi.stubEnv('MINIMAX_API_KEY', 'fixture-key');
  const exists = fs.existsSync;
  const read = fs.readFileSync;
  vi.spyOn(fs, 'existsSync').mockImplementation((file) =>
    file === getConfigFilePath() ? !!saved : exists(file),
  );
  vi.spyOn(fs, 'readFileSync').mockImplementation((file, options) =>
    file === getConfigFilePath() ? JSON.stringify(saved) : read(file, options),
  );
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const request = new Request(input, init);
      const body = JSON.parse(await request.text()) as Record<string, unknown>;
      requests.push({ url: request.url, body });
      if (failSdk && request.headers.has('x-stainless-lang'))
        throw new TypeError('Fixture SDK connection failure');
      const anthropic = request.url.includes('/anthropic/');
      if (!body.stream) {
        return Response.json(
          anthropic
            ? anthropicMessage(body.model)
            : {
                choices: [
                  { message: { content: 'answer', reasoning_content: 'Internal reasoning' } },
                ],
                usage: { prompt_tokens: 1, completion_tokens: 1 },
              },
        );
      }
      const events = anthropic
        ? [
            {
              type: 'message_start',
              message: { ...anthropicMessage(body.model), content: [], stop_reason: null },
            },
            {
              type: 'content_block_start',
              index: 0,
              content_block: { type: 'thinking', thinking: '', signature: '' },
            },
            {
              type: 'content_block_delta',
              index: 0,
              delta: { type: 'thinking_delta', thinking: 'Internal reasoning' },
            },
            { type: 'content_block_stop', index: 0 },
            { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } },
            {
              type: 'content_block_delta',
              index: 1,
              delta: { type: 'text_delta', text: 'answer' },
            },
            { type: 'content_block_stop', index: 1 },
            {
              type: 'message_delta',
              delta: { stop_reason: 'end_turn', stop_sequence: null },
              usage: { output_tokens: 1 },
            },
            { type: 'message_stop' },
          ]
            .map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
            .join('')
        : `data: ${JSON.stringify({ choices: [{ delta: { content: 'answer' }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`;
      return new Response(events, { headers: { 'Content-Type': 'text/event-stream' } });
    }),
  );
});

afterEach(() => {
  resetProvider();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function expectRequest(endpoint: string, model: string, stream = false) {
  const anthropic = endpoint.endsWith('/anthropic');
  const request = requests.at(-1);
  if (!request) throw new Error('Expected a serialized request');
  expect(request.url).toBe(`${endpoint}${anthropic ? '/v1/messages' : '/chat/completions'}`);
  expect(request.body.model).toBe(model);
  expect(request.body.stream).toBe(stream ? true : undefined);
  expect(request.body[anthropic ? 'max_tokens' : 'max_completion_tokens']).toBe(123);
  expect(request.body.messages).toEqual(
    expect.arrayContaining([{ role: 'user', content: prompt.prompt }]),
  );
  // Leave reasoning defaults to MiniMax; never disable Flash thinking or send unsupported flags.
  for (const field of [
    'thinking',
    'reasoning_effort',
    'output_config',
    'service_tier',
    'reasoning_split',
  ]) {
    expect(request.body).not.toHaveProperty(field);
  }
}

describe.each(endpoints)('MiniMax wire requests: %s', (endpoint) => {
  beforeEach(() => vi.stubEnv('MINIMAX_BASE_URL', endpoint));

  it('uses Flash for default and fast calls and lists only current choices', async () => {
    expect(getFastModel()).toBe('MiniMax-M3.1-Flash');
    expect(getMaxPromptTokens()).toBe(300_000);
    expect(await getProvider().listModels?.()).toEqual(['MiniMax-M3.1-Flash', 'MiniMax-M3']);
    expect(await llmCall({ ...prompt, maxTokens: 123 })).toBe('answer');
    expectRequest(endpoint, 'MiniMax-M3.1-Flash');
    expect(await llmCall({ ...prompt, model: getFastModel(), maxTokens: 123 })).toBe('answer');
    expectRequest(endpoint, 'MiniMax-M3.1-Flash');
  });

  it.each(['MiniMax-M3', 'MiniMax-M2.7', 'custom-model'])(
    'preserves saved %s and saved fast model',
    async (model) => {
      saved = {
        provider: 'minimax',
        model,
        fastModel: 'saved-fast',
        apiKey: 'fixture-key',
        baseUrl: endpoint,
      };
      expect(await llmCall({ ...prompt, maxTokens: 123 })).toBe('answer');
      expectRequest(endpoint, model);
      expect(await llmCall({ ...prompt, model: getFastModel(), maxTokens: 123 })).toBe('answer');
      expectRequest(endpoint, 'saved-fast');
      expect(saved.model).toBe(model);
    },
  );

  it('preserves environment and per-call overrides', async () => {
    vi.stubEnv('CALIBER_MODEL', 'MiniMax-M2.7');
    vi.stubEnv('CALIBER_FAST_MODEL', 'custom-fast');
    expect(await llmCall({ ...prompt, maxTokens: 123 })).toBe('answer');
    expectRequest(endpoint, 'MiniMax-M2.7');
    expect(await llmCall({ ...prompt, maxTokens: 123, model: getFastModel() })).toBe('answer');
    expectRequest(endpoint, 'custom-fast');
    expect(await llmCall({ ...prompt, maxTokens: 123, model: 'MiniMax-M3' })).toBe('answer');
    expectRequest(endpoint, 'MiniMax-M3');
  });

  it.each([undefined, 'MiniMax-M3', 'custom-model'])(
    'streams with model %s and preserves conversation history',
    async (model) => {
      const onText = vi.fn();
      const history = [{ role: 'assistant' as const, content: 'Previous answer' }];
      await new Promise<void>((resolve, reject) => {
        void getProvider()
          .stream(
            { ...prompt, model, maxTokens: 123, messages: history },
            {
              onText,
              onEnd: () => resolve(),
              onError: reject,
            },
          )
          .catch(reject);
      });
      expect(onText).toHaveBeenCalledWith('answer');
      expectRequest(endpoint, model ?? 'MiniMax-M3.1-Flash', true);
      expect(requests.at(-1)?.body.messages).toEqual(expect.arrayContaining(history));
    },
  );
});

it.each([false, true])('preserves Flash in the raw-fetch fallback (stream=%s)', async (stream) => {
  const endpoint = endpoints[0];
  vi.stubEnv('MINIMAX_BASE_URL', endpoint);
  failSdk = true;
  if (stream) {
    const onText = vi.fn();
    await new Promise<void>((resolve, reject) => {
      void getProvider()
        .stream({ ...prompt, maxTokens: 123 }, { onText, onEnd: () => resolve(), onError: reject })
        .catch(reject);
    });
    expect(onText).toHaveBeenCalledWith('answer');
  } else {
    expect(await llmCall({ ...prompt, maxTokens: 123 })).toBe('answer');
  }
  expect(requests.length).toBeGreaterThan(1);
  expectRequest(endpoint, 'MiniMax-M3.1-Flash', stream);
});
