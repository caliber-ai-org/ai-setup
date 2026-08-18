import {
  isSeatBased,
  type LLMProvider,
  type LLMConfig,
  type LLMCallOptions,
  type ProviderType,
} from './types.js';
import { loadConfig } from './config.js';
import { AnthropicProvider } from './anthropic.js';
import { VertexProvider } from './vertex.js';
import { OpenAICompatProvider } from './openai-compat.js';
import { createMiniMaxProvider } from './minimax.js';
import { AtlasCloudProvider } from './atlascloud.js';
import { OrcaRouterProvider } from './orcarouter.js';
import { CursorAcpProvider, isCursorAgentAvailable, isCursorLoggedIn } from './cursor-acp.js';
import { ClaudeCliProvider, isClaudeCliAvailable, isClaudeCliLoggedIn } from './claude-cli.js';
import { OpenCodeProvider, isOpenCodeAvailable, isOpenCodeLoggedIn } from './opencode.js';
import { parseJsonResponse, extractJson, estimateTokens } from './utils.js';
import { isModelNotAvailableError, handleModelNotAvailable } from './model-recovery.js';
import { isRateLimitError } from './seat-based-errors.js';
import { displayCaliberName } from '../lib/resolve-caliber.js';

export type { LLMProvider, LLMConfig, LLMCallOptions };
export type { LLMStreamOptions, LLMStreamCallbacks, ProviderType } from './types.js';
export { isSeatBased } from './types.js';
export { loadConfig, writeConfigFile, getConfigFilePath, getFastModel } from './config.js';
export { parseJsonResponse, extractJson, estimateTokens };
export { isModelNotAvailableError, handleModelNotAvailable } from './model-recovery.js';
export { trackUsage, getUsageSummary, resetUsage } from './usage.js';
export type { TokenUsage } from './types.js';

let cachedProvider: LLMProvider | null = null;
let cachedConfig: LLMConfig | null = null;

function createProvider(config: LLMConfig): LLMProvider {
  switch (config.provider) {
    case 'anthropic':
      return new AnthropicProvider(config);
    case 'vertex':
      return new VertexProvider(config);
    case 'openai':
      return new OpenAICompatProvider(config);
    case 'minimax':
      return createMiniMaxProvider(config);
    case 'atlascloud':
      return new AtlasCloudProvider(config);
    case 'orcarouter':
      return new OrcaRouterProvider(config);
    case 'cursor': {
      if (!isCursorAgentAvailable()) {
        throw new Error(
          'Cursor provider requires the Cursor Agent CLI. Install it from https://cursor.com/install then run `agent login`. Alternatively set ANTHROPIC_API_KEY or another provider.',
        );
      }
      if (!isCursorLoggedIn()) {
        throw new Error(
          'Cursor Agent CLI is installed but not logged in. Run `agent login` in your terminal to authenticate, then retry.',
        );
      }
      return new CursorAcpProvider(config);
    }
    case 'claude-cli': {
      if (!isClaudeCliAvailable()) {
        throw new Error(
          'Claude Code provider requires the Claude Code CLI. Install it from https://claude.ai/install (or run `claude` once and log in). Alternatively set ANTHROPIC_API_KEY or choose another provider.',
        );
      }
      if (!isClaudeCliLoggedIn()) {
        throw new Error(
          'Claude Code CLI is installed but not logged in. Run `claude` in your terminal to log in, then retry.',
        );
      }
      return new ClaudeCliProvider(config);
    }
    case 'opencode': {
      if (!isOpenCodeAvailable()) {
        throw new Error(
          'OpenCode provider requires the OpenCode CLI. Install it from https://opencode.ai then run `opencode auth login`. Alternatively set ANTHROPIC_API_KEY or choose another provider.',
        );
      }
      if (!isOpenCodeLoggedIn()) {
        throw new Error(
          'OpenCode CLI is installed but not logged in. Run `opencode auth login` in your terminal to authenticate, then retry.',
        );
      }
      return new OpenCodeProvider(config);
    }

    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
}

export function getProvider(): LLMProvider {
  if (cachedProvider) return cachedProvider;

  const config = loadConfig();
  if (!config) {
    throw new Error(
      `No LLM provider configured. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, MINIMAX_API_KEY, ATLASCLOUD_API_KEY, ORCAROUTER_API_KEY, or VERTEX_PROJECT_ID; or run \`${displayCaliberName()} config\` and choose a provider; or set CALIBER_USE_CURSOR_SEAT=1 / CALIBER_USE_CLAUDE_CLI=1 / CALIBER_USE_OPENCODE=1.`,
    );
  }

  cachedConfig = config;
  cachedProvider = createProvider(config);
  return cachedProvider;
}

export function getConfig(): LLMConfig {
  if (cachedConfig) return cachedConfig;

  const config = loadConfig();
  if (!config) {
    throw new Error(
      `No LLM provider configured. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, MINIMAX_API_KEY, ATLASCLOUD_API_KEY, ORCAROUTER_API_KEY, or VERTEX_PROJECT_ID; or run \`${displayCaliberName()} config\` and choose a provider; or set CALIBER_USE_CURSOR_SEAT=1 / CALIBER_USE_CLAUDE_CLI=1 / CALIBER_USE_OPENCODE=1.`,
    );
  }

  cachedConfig = config;
  return config;
}

export function resetProvider(): void {
  cachedProvider = null;
  cachedConfig = null;
}

export const TRANSIENT_ERRORS = [
  'terminated',
  'ECONNRESET',
  'ETIMEDOUT',
  'socket hang up',
  'other side closed',
];
const MAX_RETRIES = 3;
const DEFAULT_LLM_TIMEOUT_MS = 120_000;

/** Providers that already enforce their own (longer) timeouts internally. */
const PROVIDERS_WITH_OWN_TIMEOUT: ReadonlySet<ProviderType> = new Set([
  'openai',
  'minimax',
  'atlascloud',
  'orcarouter',
  'cursor',
  'claude-cli',
  'opencode',
]);

function parseLlmTimeout(): number {
  const val = process.env.CALIBER_LLM_TIMEOUT_MS;
  if (val) {
    const parsed = parseInt(val, 10);
    if (Number.isFinite(parsed) && parsed >= 1000) return parsed;
  }
  return DEFAULT_LLM_TIMEOUT_MS;
}

function shouldApplyOuterTimeout(provider: ProviderType | undefined): boolean {
  // Seat-based / OpenAI-compat already bound calls via CALIBER_*_TIMEOUT_MS
  // (default 10 min). An outer 120s wrapper would cut those off early.
  if (!provider) return true;
  if (isSeatBased(provider)) return false;
  if (PROVIDERS_WITH_OWN_TIMEOUT.has(provider)) return false;
  return true;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error(message));
      }
    }, timeoutMs);
    promise.then(
      (value) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(value);
        }
      },
      (error) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(error);
        }
      },
    );
  });
}

function isTransientError(error: Error): boolean {
  const msg = error.message.toLowerCase();
  return TRANSIENT_ERRORS.some((e) => msg.includes(e.toLowerCase()));
}

function isOverloaded(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.message.includes('529') || err.message.includes('overloaded');
}

export async function llmCall(options: LLMCallOptions): Promise<string> {
  const provider = getProvider();
  const timeoutMs = parseLlmTimeout();
  const applyOuterTimeout = shouldApplyOuterTimeout(cachedConfig?.provider);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const call = provider.call(options);
      return applyOuterTimeout
        ? await withTimeout(
            call,
            timeoutMs,
            `LLM call timed out after ${timeoutMs / 1000}s. Set CALIBER_LLM_TIMEOUT_MS to increase.`,
          )
        : await call;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));

      // Model not available — prompt the user to pick an alternative
      if (isModelNotAvailableError(error) && cachedConfig) {
        const failedModel = options.model || cachedConfig.model;
        const newModel = await handleModelNotAvailable(failedModel, provider, cachedConfig);
        if (newModel) {
          resetProvider();
          const newProvider = getProvider();
          const recoveryCall = newProvider.call({ ...options, model: newModel });
          return applyOuterTimeout
            ? await withTimeout(
                recoveryCall,
                timeoutMs,
                `LLM call timed out after ${timeoutMs / 1000}s. Set CALIBER_LLM_TIMEOUT_MS to increase.`,
              )
            : await recoveryCall;
        }
        throw error;
      }

      if (isOverloaded(error) && attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
        continue;
      }

      if (isRateLimitError(error.message) && attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 2000 * Math.pow(2, attempt - 1)));
        continue;
      }

      if (isTransientError(error) && attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
        continue;
      }

      throw error;
    }
  }

  throw new Error('LLM call failed after max retries');
}

export async function llmJsonCall<T>(options: LLMCallOptions): Promise<T> {
  const text = await llmCall(options);
  return parseJsonResponse<T>(text);
}

/**
 * Lightweight model probe — sends a minimal request to verify the configured
 * model (and optionally the fast model) is reachable. If the model is not
 * available, triggers the interactive recovery flow so the user can pick an
 * alternative *before* the real workload starts (especially streaming calls
 * where mid-flight recovery is harder).
 *
 * Call this early in any command that uses streaming or long-running LLM work.
 */
export async function validateModel(options?: { fast?: boolean }): Promise<void> {
  const provider = getProvider();
  const config = cachedConfig;
  if (!config) return;

  // Seat-based providers use whatever model the service provides; skip validation
  const { isSeatBased } = await import('./types.js');
  if (isSeatBased(config.provider)) return;

  const modelsToCheck = [config.model];
  if (options?.fast) {
    const { getFastModel } = await import('./config.js');
    const fast = getFastModel();
    if (fast && fast !== config.model) modelsToCheck.push(fast);
  }

  for (const model of modelsToCheck) {
    try {
      await provider.call({
        system: 'Respond with OK',
        prompt: 'ping',
        model,
        maxTokens: 1,
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      if (isModelNotAvailableError(error)) {
        const newModel = await handleModelNotAvailable(model, provider, config);
        if (newModel) {
          resetProvider();
          return; // provider cache is reset; subsequent calls will use the new model
        }
        throw error;
      }
      // Non-model errors (network, auth) — don't block startup, let the real call handle it
    }
  }
}
