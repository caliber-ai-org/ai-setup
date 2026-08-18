import type { LLMConfig } from './types.js';
import { OpenAICompatProvider } from './openai-compat.js';

export const ORCAROUTER_DEFAULT_BASE_URL = 'https://api.orcarouter.ai/v1';

/**
 * OrcaRouter (https://www.orcarouter.ai) — an OpenAI-compatible router
 * exposing 200+ models (OpenAI, Anthropic, Google, DeepSeek, ...) behind a
 * single API key. Model ids use the router's own `provider/model` format,
 * e.g. `openai/gpt-4o`.
 *
 * Same `/v1/chat/completions` wire format as OpenAI, so we extend the
 * OpenAI-compatible provider and just preset the public endpoint. The base
 * URL stays configurable for self-hosted or regional deployments.
 */
export class OrcaRouterProvider extends OpenAICompatProvider {
  constructor(config: LLMConfig) {
    super({
      ...config,
      apiKey: config.apiKey ?? process.env.ORCAROUTER_API_KEY,
      baseUrl: config.baseUrl ?? process.env.ORCAROUTER_BASE_URL ?? ORCAROUTER_DEFAULT_BASE_URL,
    });
  }

  override async listModels(): Promise<string[]> {
    try {
      return await super.listModels();
    } catch {
      return ['openai/gpt-4o', 'openai/gpt-4o-mini', 'deepseek/deepseek-v4-flash'];
    }
  }
}
