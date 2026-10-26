import type { LLMConfig } from './types.js';
import { OpenAICompatProvider } from './openai-compat.js';

export const CHEAPERINFERENCE_DEFAULT_BASE_URL = 'https://api.cheaperinference.com/v1';

export class CheaperInferenceProvider extends OpenAICompatProvider {
  constructor(config: LLMConfig) {
    super({
      ...config,
      apiKey:
        config.apiKey ??
        process.env.CHEAPERINFERENCE_API_KEY ??
        process.env.CHEAPER_INFERENCE_API_KEY,
      baseUrl:
        config.baseUrl ??
        process.env.CHEAPERINFERENCE_BASE_URL ??
        process.env.CHEAPER_INFERENCE_BASE_URL ??
        CHEAPERINFERENCE_DEFAULT_BASE_URL,
    });
  }

  override async listModels(): Promise<string[]> {
    try {
      return await super.listModels();
    } catch {
      return ['gpt-5.4-mini', 'gpt-5.4', 'claude-sonnet-5', 'deepseek-v4-flash'];
    }
  }
}
