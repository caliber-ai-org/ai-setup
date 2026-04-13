---
name: llm-provider
description: Adds a new LLM provider implementing LLMProvider interface with call() and stream() methods. Integrates with provider factory in src/llm/index.ts, config detection in src/llm/config.ts, and error handling via tracking and recovery. Use when adding a new model backend, integrating a third-party LLM API, or extending LLM platform support. Do NOT use for fixing bugs in existing providers, modifying existing provider behavior, or changing the LLMProvider interface.
paths:
  - src/llm/**/*.ts
  - src/llm/__tests__/**/*.ts
---
# LLM Provider

## Critical

1. **All providers MUST implement the LLMProvider interface** from src/llm/types.ts with three methods:
   - call(options: LLMCallOptions): Promise<string> — single non-streaming call returning text
   - stream(options: LLMStreamOptions, callbacks: LLMStreamCallbacks): Promise<void> — streaming call invoking callbacks
   - listModels?(): Promise<string[]> — optional; list available models from the API

2. **Initialize client in constructor and store defaultModel from config**. Example: `this.client = new YourSDK({ apiKey: config.apiKey })`. Never lazy-initialize on first call — providers are instantiated once and cached in src/llm/index.ts.

3. **For EVERY response in call() and stream(), invoke trackUsage(model, usage)** from src/llm/usage.js before returning/ending. This is mandatory — it captures token metrics for CLI telemetry and cost analysis. If the API doesn't return usage data, estimate via estimateTokens(text), which assumes ~4 chars per token.

4. **Both call() and stream() must respect the model parameter** using pattern: `options.model || this.defaultModel`. Never hardcode model names. Callers supply model overrides via LLMCallOptions.model.

5. **Error handling: catch all errors, preserve error messages unchanged**. The retry logic in src/llm/index.ts handles transient errors (ECONNRESET, socket hang up, 529 overload). For seat-based providers (Cursor, Claude CLI), wrap stderr via parseSeatBasedError() for user-friendly messages.

6. **Always update ProviderType union** (Step 2), DEFAULT_MODELS (Step 4), and createProvider() switch case (Step 5) in lock-step. Missing any one breaks the build or causes runtime Unknown provider error.

## Instructions

### Step 1: Create provider class file
Verify directory exists: `ls -la src/llm/`. Create `src/llm/your-provider.ts`. Match existing provider patterns (src/llm/anthropic.ts, src/llm/openai-compat.ts).

Minimal structure:
```typescript
import type { LLMProvider, LLMCallOptions, LLMStreamOptions, LLMStreamCallbacks, LLMConfig, TokenUsage } from './types.js';
import { trackUsage } from './usage.js';
import { estimateTokens } from './utils.js';

export class YourProviderProvider implements LLMProvider {
  private client: YourSDKType;
  private defaultModel: string;

  constructor(config: LLMConfig) {
    if (!config.apiKey) throw new Error('API key required');
    this.client = new YourSDK({ apiKey: config.apiKey, ...(config.baseUrl && { baseURL: config.baseUrl }) });
    this.defaultModel = config.model;
  }

  async call(options: LLMCallOptions): Promise<string> {
    const model = options.model || this.defaultModel;
    const response = await this.client.messages.create({ model, max_tokens: options.maxTokens || 4096, system: options.system, messages: [{ role: 'user', content: options.prompt }] });
    trackUsage(model, { inputTokens: response.usage?.input_tokens || 0, outputTokens: response.usage?.output_tokens || 0 });
    return response.content?.[0]?.text || '';
  }

  async stream(options: LLMStreamOptions, callbacks: LLMStreamCallbacks): Promise<void> {
    const model = options.model || this.defaultModel;
    const messages = [...(options.messages || []), { role: 'user' as const, content: options.prompt }];
    try {
      const stream = await this.client.stream({ model, max_tokens: options.maxTokens || 10240, system: options.system, messages });
      let stopReason: string | undefined, usage: TokenUsage | undefined;
      for await (const chunk of stream) {
        if (chunk.delta?.text) callbacks.onText(chunk.delta.text);
        if (chunk.delta?.stop_reason) stopReason = chunk.delta.stop_reason;
        if (chunk.usage) usage = { inputTokens: chunk.usage.input_tokens, outputTokens: chunk.usage.output_tokens };
      }
      if (usage) trackUsage(model, usage);
      callbacks.onEnd({ stopReason, usage });
    } catch (error) { callbacks.onError(error instanceof Error ? error : new Error(String(error))); }
  }
}
```

Verify: File exports the class; imports match existing providers.

### Step 2: Add to ProviderType union
Edit `src/llm/types.ts` line 1. Add your provider in kebab-case:
```typescript
export type ProviderType = 'anthropic' | 'vertex' | 'openai' | 'cursor' | 'claude-cli' | 'your-provider';
```
Verify: `npx tsc --noEmit` shows no ProviderType errors.

### Step 3: Add config fields
If your provider needs fields beyond apiKey, model, baseUrl, extend LLMConfig in src/llm/types.ts:
```typescript
export interface LLMConfig {
  provider: ProviderType;
  model: string;
  fastModel?: string;
  apiKey?: string;
  baseUrl?: string;
  yourProviderSecret?: string;
}
```

### Step 4: Update config.ts
Edit `src/llm/config.ts`:

**Line 9:** Add to DEFAULT_MODELS:
```typescript
export const DEFAULT_MODELS: Record<ProviderType, string> = {
  anthropic: 'claude-sonnet-4-6',
  vertex: 'claude-sonnet-4-6',
  openai: 'gpt-5.4-mini',
  cursor: 'sonnet-4.6',
  'claude-cli': 'default',
  'your-provider': 'your-provider/default-model',
};
```

**Line 17:** Add to MODEL_CONTEXT_WINDOWS if known:
```typescript
export const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  'your-provider/model-name': 128_000,
};
```

**Line 59:** In resolveFromEnv(), add env detection before final return null:
```typescript
if (process.env.YOUR_PROVIDER_API_KEY) {
  return {
    provider: 'your-provider',
    apiKey: process.env.YOUR_PROVIDER_API_KEY,
    model: process.env.CALIBER_MODEL || DEFAULT_MODELS['your-provider'],
    baseUrl: process.env.YOUR_PROVIDER_BASE_URL,
  };
}
```

**Line 115:** In readConfigFile() validation, add 'your-provider' to includes list.

Verify: `npm run test -- src/llm/__tests__/ -t config` confirms env var detection works.

### Step 5: Register in factory
Edit `src/llm/index.ts`. Add import (line ~4):
```typescript
import { YourProviderProvider } from './your-provider.js';
```

In createProvider() switch (line ~24), add before default case:
```typescript
case 'your-provider':
  return new YourProviderProvider(config);
```

Verify: `npx tsc --noEmit` passes; no type errors on switch cases.

### Step 6: Write tests
Create `src/llm/__tests__/your-provider.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { YourProviderProvider } from '../your-provider.js';

describe('YourProviderProvider', () => {
  let provider: YourProviderProvider;
  beforeEach(() => {
    provider = new YourProviderProvider({ provider: 'your-provider', model: 'test', apiKey: 'test' });
  });

  it('implements LLMProvider interface', () => {
    expect(typeof provider.call).toBe('function');
    expect(typeof provider.stream).toBe('function');
  });

  it('call() returns string', async () => {
    const result = await provider.call({ system: 'helpful', prompt: 'hi' });
    expect(typeof result).toBe('string');
  });

  it('stream() invokes callbacks', async () => {
    const texts: string[] = [];
    let ended = false;
    await provider.stream({ system: 'helpful', prompt: 'hi' }, {
      onText: (t) => texts.push(t),
      onEnd: () => { ended = true; },
      onError: () => {},
    });
    expect(ended).toBe(true);
  });
});
```

Verify: `npm run test -- src/llm/__tests__/your-provider.test.ts` passes.

### Step 7: Integration test
Run factory tests with your provider env var:
```bash
YOUR_PROVIDER_API_KEY=test npm run test -- src/llm/__tests__/index.test.ts
```
Verify: getProvider() instantiates your provider; llmCall() dispatches correctly.

## Examples

### Example 1: Local LM Studio server
User says: "I need caliber to use my local LM Studio instance."

Actions: Create src/llm/lm-studio.ts extending OpenAICompatProvider. Add 'lm-studio' to ProviderType. In config.ts:
```typescript
if (process.env.LM_STUDIO_BASE_URL) {
  return { provider: 'lm-studio', apiKey: '', model: 'local', baseUrl: process.env.LM_STUDIO_BASE_URL };
}
```
Register in createProvider() case. User: `export LM_STUDIO_BASE_URL=http://localhost:8000/v1`. Result: caliber uses local LM Studio; tokens estimated via estimateTokens().

### Example 2: Ollama (seat-based)
User says: "Ollama is auto-detected; no API key needed."

Actions: Create src/llm/ollama.ts extending OpenAICompatProvider. Add 'ollama' to ProviderType and SEAT_BASED_PROVIDERS. In config.ts:
```typescript
if (process.env.OLLAMA_HOST) {
  return { provider: 'ollama', model: 'mistral', baseUrl: process.env.OLLAMA_HOST || 'http://localhost:11434/v1' };
}
```
Result: Offline per-machine LLM without API keys.

## Common Issues

**Unknown provider: your-provider**
- Cause: ProviderType updated but createProvider() case missing.
- Fix: Add case in src/llm/index.ts and import the class.

**Cannot find module './your-provider.js'**
- Cause: File named your_provider.ts (underscore) not your-provider.ts (kebab).
- Fix: Rename file to use kebab-case.

**API key is required for YourProvider**
- Cause: Env var YOUR_PROVIDER_API_KEY not set; resolveFromEnv() didn't detect it.
- Fix: Verify env var name in config.ts matches. Test: `YOUR_PROVIDER_API_KEY=test npm run test -- src/llm/__tests__/index.test.ts`.

**LLM response did not include usage tokens**
- Cause: Provider API doesn't return usage (local models).
- Fix: Estimate tokens: `trackUsage(model, { inputTokens: estimateTokens(options.system + options.prompt), outputTokens: estimateTokens(response.text) });`

**Stream callbacks never fire; onEnd not called**
- Cause: Async iterator not fully consumed before method returns.
- Fix: Ensure iteration completes before onEnd(): `for await (const chunk of stream) { } callbacks.onEnd({ stopReason, usage });`

**My model parameter is ignored**
- Cause: call()/stream() doesn't use `options.model || this.defaultModel`.
- Fix: Replace hardcoded model: `const model = options.model || this.defaultModel; const response = await this.client.create({ model, ... });`

**trackUsage() is never called**
- Cause: Forgot to call trackUsage() in call() or stream().
- Fix: Add after every response: `trackUsage(model, { inputTokens: ..., outputTokens: ... });`

**Type error: Provider doesn't implement LLMProvider**
- Cause: Missing method or wrong signature.
- Fix: Verify all required methods exist with exact signatures from src/llm/types.ts. Copy-paste from anthropic.ts as reference.