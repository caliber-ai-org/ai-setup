import type { LLMConfig } from './types.js';
import { OpenAICompatProvider } from './openai-compat.js';

const MINIMAX_DEFAULT_BASE_URL = 'https://api.minimax.io/v1';

export class MiniMaxProvider extends OpenAICompatProvider {
  constructor(config: LLMConfig) {
    super(
      {
        ...config,
        apiKey: config.apiKey ?? process.env.MINIMAX_API_KEY,
        baseUrl: config.baseUrl ?? process.env.MINIMAX_BASE_URL ?? MINIMAX_DEFAULT_BASE_URL,
      },
      // MiniMax requires temperature in (0.0, 1.0] — 1.0 is the only safe default.
      { temperature: 1.0 },
    );
  }

  // MiniMax API doesn't support model listing; return known models statically.
  override async listModels(): Promise<string[]> {
    return ['MiniMax-M2.7', 'MiniMax-M2.7-highspeed'];
  }
}
