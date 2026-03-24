import chalk from 'chalk';
import select from '@inquirer/select';
import { writeConfigFile } from './config.js';
import type { LLMConfig, LLMProvider, ProviderType } from './types.js';
import { resolveCaliber } from '../lib/resolve-caliber.js';

/**
 * Curated list of models per provider that caliber is known to work with.
 * Used as fallback when the provider doesn't support listing models (e.g. Vertex)
 * or when the listing call itself fails.
 */
const KNOWN_MODELS: Record<ProviderType, string[]> = {
  anthropic: [
    'claude-sonnet-4-6',
    'claude-sonnet-4-5-20250514',
    'claude-haiku-4-5-20251001',
    'claude-opus-4-6',
    'claude-opus-4-1-20250620',
  ],
  vertex: [
    'claude-sonnet-4-6@20250514',
    'claude-sonnet-4-5-20250514',
    'claude-haiku-4-5-20251001',
    'claude-opus-4-6@20250605',
    'claude-opus-4-1-20250620',
  ],
  openai: [
    'gpt-4.1',
    'gpt-4.1-mini',
    'gpt-4o',
    'gpt-4o-mini',
    'o3-mini',
  ],
  cursor: [],
  'claude-cli': [],
};

/**
 * Detect whether an error indicates the requested model is not available
 * on the user's deployment / account.
 */
export function isModelNotAvailableError(error: Error): boolean {
  const msg = error.message.toLowerCase();
  const status = (error as unknown as Record<string, unknown>).status;

  // 404 with model-related message (Anthropic, OpenAI)
  if (status === 404 && msg.includes('model')) return true;

  // Explicit "model not found / not available" messages
  if (msg.includes('model') && (msg.includes('not found') || msg.includes('not_found'))) return true;
  if (msg.includes('model') && msg.includes('not available')) return true;
  if (msg.includes('model') && msg.includes('does not exist')) return true;

  // Vertex-specific: "Publisher model is not found"
  if (msg.includes('publisher model')) return true;

  return false;
}

/**
 * Filter a raw model list down to models that caliber can meaningfully use.
 */
function filterRelevantModels(models: string[], provider: ProviderType): string[] {
  switch (provider) {
    case 'anthropic':
    case 'vertex':
      return models.filter(m => m.startsWith('claude-'));
    case 'openai':
      return models.filter(m =>
        m.startsWith('gpt-4') || m.startsWith('gpt-3.5') ||
        m.startsWith('o1') || m.startsWith('o3')
      );
    default:
      return models;
  }
}

/**
 * Attempt to recover from a "model not available" error by listing
 * available alternatives and letting the user pick one.
 *
 * Returns the selected model name, or null if recovery was not possible
 * (non-interactive terminal, no alternatives found, user cancelled).
 */
export async function handleModelNotAvailable(
  failedModel: string,
  provider: LLMProvider,
  config: LLMConfig,
): Promise<string | null> {
  // Can't prompt in non-interactive mode
  if (!process.stdin.isTTY) {
    console.error(
      chalk.red(`Model "${failedModel}" is not available. Run \`${resolveCaliber()} config\` to select a different model.`)
    );
    return null;
  }

  console.log(chalk.yellow(`\n⚠  Model "${failedModel}" is not available on your ${config.provider} deployment.`));

  // Try to list available models from the provider API
  let models: string[] = [];
  if (provider.listModels) {
    try {
      const allModels = await provider.listModels();
      models = filterRelevantModels(allModels, config.provider);
    } catch {
      // Provider listing failed — fall through to known models
    }
  }

  // Fall back to curated known models
  if (models.length === 0) {
    models = KNOWN_MODELS[config.provider] ?? [];
  }

  // Remove the model that just failed
  models = models.filter(m => m !== failedModel);

  if (models.length === 0) {
    console.log(chalk.red(`  No alternative models found. Run \`${resolveCaliber()} config\` to configure manually.`));
    return null;
  }

  console.log('');
  let selected: string;
  try {
    selected = await select<string>({
      message: 'Pick an available model',
      choices: models.map(m => ({ name: m, value: m })),
    });
  } catch {
    // User cancelled (Ctrl+C)
    return null;
  }

  // Persist the selection
  const isDefaultModel = failedModel === config.model;
  const updatedConfig = isDefaultModel
    ? { ...config, model: selected }
    : { ...config, fastModel: selected };

  writeConfigFile(updatedConfig);

  // Also set env so the current process picks it up
  // (env vars take priority over config file in loadConfig)
  if (isDefaultModel) {
    process.env.CALIBER_MODEL = selected;
  } else {
    process.env.CALIBER_FAST_MODEL = selected;
  }

  console.log(chalk.green(`✓ Switched to ${selected}\n`));
  return selected;
}
