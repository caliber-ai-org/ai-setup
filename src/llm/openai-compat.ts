import OpenAI from 'openai';
import type {
  LLMProvider,
  LLMCallOptions,
  LLMStreamOptions,
  LLMStreamCallbacks,
  LLMConfig,
  TokenUsage,
} from './types.js';
import { trackUsage } from './usage.js';

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

// Per-request timeout for the OpenAI SDK. Non-streaming `provider.call()`
// invocations (used by refine/detect/recommend/skill scoring) are bounded
// only by this timeout — they do NOT participate in the wall-clock
// `CALIBER_GENERATION_TIMEOUT_MS` that wraps `streamGeneration()`. Slow
// local models (Ollama / vLLM) often need more than the SDK default of
// 600s for a single call.
//
// Resolution order:
//  1. CALIBER_OPENAI_TIMEOUT_MS   — provider-specific (consistent with
//                                   CALIBER_OPENCODE_TIMEOUT_MS and
//                                   CALIBER_CURSOR_TIMEOUT_MS).
//  2. CALIBER_GENERATION_TIMEOUT_MS — shared with streaming, so setting
//                                     one generous value covers both paths.
//  3. 10-minute default.
function resolveTimeoutMs(): number {
  const candidates = [
    process.env.CALIBER_OPENAI_TIMEOUT_MS,
    process.env.CALIBER_GENERATION_TIMEOUT_MS,
  ];
  for (const raw of candidates) {
    if (!raw) continue;
    const parsed = parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed >= 1000) return parsed;
  }
  return DEFAULT_TIMEOUT_MS;
}

export class OpenAICompatProvider implements LLMProvider {
  protected client: OpenAI;
  protected defaultModel: string;
  protected temperature: number | undefined;

  constructor(config: LLMConfig, options?: { temperature?: number }) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      ...(config.baseUrl && { baseURL: config.baseUrl }),
      timeout: resolveTimeoutMs(),
    });
    this.defaultModel = config.model;
    this.temperature = options?.temperature;
  }

  async call(options: LLMCallOptions): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: options.model || this.defaultModel,
      max_completion_tokens: options.maxTokens || 4096,
      ...(this.temperature !== undefined && { temperature: this.temperature }),
      messages: [
        { role: 'system', content: options.system },
        { role: 'user', content: options.prompt },
      ],
    });

    const model = options.model || this.defaultModel;
    if (response.usage) {
      trackUsage(model, {
        inputTokens: response.usage.prompt_tokens ?? 0,
        outputTokens: response.usage.completion_tokens ?? 0,
      });
    }

    return response.choices[0]?.message?.content || '';
  }

  async listModels(): Promise<string[]> {
    const models: string[] = [];
    for await (const model of this.client.models.list()) {
      models.push(model.id);
    }
    return models;
  }

  async stream(options: LLMStreamOptions, callbacks: LLMStreamCallbacks): Promise<void> {
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: options.system },
    ];

    if (options.messages) {
      for (const msg of options.messages) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    messages.push({ role: 'user', content: options.prompt });

    const stream = await this.client.chat.completions.create({
      model: options.model || this.defaultModel,
      max_completion_tokens: options.maxTokens || 10240,
      ...(this.temperature !== undefined && { temperature: this.temperature }),
      messages,
      stream: true,
    });

    try {
      let stopReason: string | undefined;
      let usage: TokenUsage | undefined;
      const model = options.model || this.defaultModel;
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta != null) callbacks.onText(delta);
        const finishReason = chunk.choices[0]?.finish_reason;
        if (finishReason) stopReason = finishReason === 'length' ? 'max_tokens' : finishReason;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const chunkUsage = (chunk as any).usage;
        if (chunkUsage) {
          usage = {
            inputTokens: chunkUsage.prompt_tokens ?? 0,
            outputTokens: chunkUsage.completion_tokens ?? 0,
          };
          trackUsage(model, usage);
        }
      }
      callbacks.onEnd({ stopReason, usage });
    } catch (error) {
      callbacks.onError(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
