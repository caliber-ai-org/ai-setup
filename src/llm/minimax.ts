import type { LLMConfig, LLMProvider } from './types.js';
import { AnthropicProvider } from './anthropic.js';
import { OpenAICompatProvider } from './openai-compat.js';

/** Documented MiniMax regional endpoints (OpenAI- and Anthropic-compatible). */
export const MINIMAX_ENDPOINTS = {
  global_en: {
    openai: 'https://api.minimax.io/v1',
    anthropic: 'https://api.minimax.io/anthropic',
  },
  cn_zh: {
    openai: 'https://api.minimaxi.com/v1',
    anthropic: 'https://api.minimaxi.com/anthropic',
  },
} as const;

export const MINIMAX_MODELS = ['MiniMax-M3.1-Flash', 'MiniMax-M3'] as const;

function resolveMiniMaxConfig(config: LLMConfig): LLMConfig {
  return {
    ...config,
    apiKey: config.apiKey ?? process.env.MINIMAX_API_KEY,
    baseUrl: config.baseUrl ?? process.env.MINIMAX_BASE_URL ?? MINIMAX_ENDPOINTS.global_en.openai,
  };
}

export class MiniMaxProvider extends OpenAICompatProvider {
  constructor(config: LLMConfig) {
    super(
      resolveMiniMaxConfig(config),
      // MiniMax requires temperature in (0.0, 1.0] — 1.0 is the only safe default.
      { temperature: 1.0 },
    );
  }

  // MiniMax API doesn't support model listing; return known models statically.
  override async listModels(): Promise<string[]> {
    return [...MINIMAX_MODELS];
  }
}

export class MiniMaxAnthropicProvider extends AnthropicProvider {
  constructor(config: LLMConfig) {
    super(resolveMiniMaxConfig(config));
  }

  override async listModels(): Promise<string[]> {
    return [...MINIMAX_MODELS];
  }
}

export function createMiniMaxProvider(config: LLMConfig): LLMProvider {
  const baseUrl =
    config.baseUrl ?? process.env.MINIMAX_BASE_URL ?? MINIMAX_ENDPOINTS.global_en.openai;
  return /\/anthropic\/?$/.test(baseUrl)
    ? new MiniMaxAnthropicProvider(config)
    : new MiniMaxProvider(config);
}
