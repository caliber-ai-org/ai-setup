import fs from 'fs';
import path from 'path';
import os from 'os';
import type { LLMConfig, ProviderType } from './types.js';

const CONFIG_DIR = path.join(os.homedir(), '.caliber');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export const DEFAULT_MODELS: Record<ProviderType, string> = {
  anthropic: 'claude-sonnet-4-6',
  vertex: 'claude-sonnet-4-6',
  openai: 'gpt-5.4-mini',
  cursor: 'sonnet-4.6',
  'claude-cli': 'default',
  opencode: 'default',
};

export const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  'claude-sonnet-4-6': 200_000,
  'claude-opus-4-6': 200_000,
  'claude-haiku-4-5-20251001': 200_000,
  'claude-sonnet-4-5-20250514': 200_000,
  'gpt-5.4-mini': 1_000_000,
  'gpt-4o': 128_000,
  'gpt-4o-mini': 128_000,
  'sonnet-4.6': 200_000,
};

const DEFAULT_CONTEXT_WINDOW = 200_000;
const INPUT_BUDGET_FRACTION = 0.6;
const MAX_PROMPT_TOKENS_CAP = 300_000;
const MIN_PROMPT_TOKENS = 30_000;

export function getMaxPromptTokens(): number {
  const config = loadConfig();
  const model = process.env.CALIBER_MODEL || config?.model;
  const contextWindow = model
    ? (MODEL_CONTEXT_WINDOWS[model] ?? DEFAULT_CONTEXT_WINDOW)
    : DEFAULT_CONTEXT_WINDOW;
  const budget = Math.floor(contextWindow * INPUT_BUDGET_FRACTION);
  return Math.max(MIN_PROMPT_TOKENS, Math.min(budget, MAX_PROMPT_TOKENS_CAP));
}

export const DEFAULT_FAST_MODELS: Partial<Record<ProviderType, string>> = {
  anthropic: 'claude-haiku-4-5-20251001',
  vertex: 'claude-haiku-4-5-20251001',
  openai: 'gpt-5.4-mini',
  cursor: 'gpt-5.3-codex-fast',
};

export function loadConfig(): LLMConfig | null {
  // 1. Config file takes priority (explicit user choice from `caliber init` / `caliber config`)
  const fileConfig = readConfigFile();
  if (fileConfig) return fileConfig;

  // 2. Fall back to env vars for auto-detection
  return resolveFromEnv();
}

export function resolveFromEnv(): LLMConfig | null {
  if (process.env.ANTHROPIC_API_KEY) {
    return {
      provider: 'anthropic',
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: process.env.CALIBER_MODEL || DEFAULT_MODELS.anthropic,
    };
  }

  if (process.env.VERTEX_PROJECT_ID || process.env.GCP_PROJECT_ID) {
    return {
      provider: 'vertex',
      model: process.env.CALIBER_MODEL || DEFAULT_MODELS.vertex,
      vertexProjectId: process.env.VERTEX_PROJECT_ID || process.env.GCP_PROJECT_ID,
      vertexRegion: process.env.VERTEX_REGION || process.env.GCP_REGION || 'us-east5',
      vertexCredentials:
        process.env.VERTEX_SA_CREDENTIALS || process.env.GOOGLE_APPLICATION_CREDENTIALS,
    };
  }

  if (process.env.OPENAI_API_KEY) {
    return {
      provider: 'openai',
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.CALIBER_MODEL || DEFAULT_MODELS.openai,
      baseUrl: process.env.OPENAI_BASE_URL,
    };
  }

  // Prefer Cursor seat when explicitly requested (no API key; uses agent acp + agent login)
  if (
    process.env.CALIBER_USE_CURSOR_SEAT === '1' ||
    process.env.CALIBER_USE_CURSOR_SEAT === 'true'
  ) {
    return {
      provider: 'cursor',
      model: process.env.CALIBER_MODEL || DEFAULT_MODELS.cursor,
    };
  }

  // Prefer Claude Code CLI (uses stored app login — Pro/Max/Team; no API key)
  if (process.env.CALIBER_USE_CLAUDE_CLI === '1' || process.env.CALIBER_USE_CLAUDE_CLI === 'true') {
    return {
      provider: 'claude-cli',
      model: process.env.CALIBER_MODEL || DEFAULT_MODELS['claude-cli'],
    };
  }

  return null;
}

export function readConfigFile(): LLMConfig | null {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return null;
    const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (
      !parsed.provider ||
      !['anthropic', 'vertex', 'openai', 'cursor', 'claude-cli', 'opencode'].includes(
        parsed.provider as string,
      )
    ) {
      // Prefer OpenCode (uses opencode auth login)
      if (process.env.CALIBER_USE_OPENCODE === '1' || process.env.CALIBER_USE_OPENCODE === 'true') {
        return {
          provider: 'opencode',
          model: process.env.OPENCODE_MODEL || DEFAULT_MODELS.opencode,
        };
      }

      return null;
    }
    return parsed as unknown as LLMConfig;
  } catch {
    return null;
  }
}

export function writeConfigFile(config: LLMConfig): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }

  const sanitized = { ...config };
  if (sanitized.apiKey) {
    sanitized.apiKey = sanitized.apiKey.trim();
  }

  fs.writeFileSync(CONFIG_FILE, JSON.stringify(sanitized, null, 2) + '\n', { mode: 0o600 });
}

export function getConfigFilePath(): string {
  return CONFIG_FILE;
}

export function getDisplayModel(config: { provider: string; model: string }): string {
  if (config.model === 'default' && config.provider === 'claude-cli') {
    return process.env.ANTHROPIC_MODEL || 'default (inherited from Claude Code)';
  }
  return config.model;
}

export function getFastModel(): string | undefined {
  if (process.env.CALIBER_FAST_MODEL) return process.env.CALIBER_FAST_MODEL;

  const config = loadConfig();
  const provider = config?.provider;

  // ANTHROPIC_SMALL_FAST_MODEL applies to Anthropic/Vertex/Claude CLI (or when no provider is configured)
  if (
    process.env.ANTHROPIC_SMALL_FAST_MODEL &&
    (!provider || provider === 'anthropic' || provider === 'vertex' || provider === 'claude-cli')
  ) {
    return process.env.ANTHROPIC_SMALL_FAST_MODEL;
  }

  if (config?.fastModel) return config.fastModel;
  if (provider) return DEFAULT_FAST_MODELS[provider];

  return undefined;
}
