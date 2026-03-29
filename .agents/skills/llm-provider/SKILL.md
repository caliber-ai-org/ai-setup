---
name: llm-provider
description: Adds a new LLM provider implementing LLMProvider interface from src/llm/types.ts with call() and stream() methods. Integrates config in src/llm/config.ts, factory in src/llm/index.ts, and error handling. Use when adding new provider, 'add LLM backend', integrating external API. Do NOT use for modifying existing providers or debugging provider issues.
---
# LLM Provider

## Critical

- **Interface contract**: Provider MUST implement `LLMProvider` from `src/llm/types.ts` — both `call()` (non-streaming) and `stream()` methods are required
- **No authentication in code**: API keys/tokens come from env vars only (e.g., `process.env.PROVIDER_API_KEY`). Never hardcode secrets
- **Validation before integration**: Provider must pass a unit test in `src/llm/__tests__/` before wiring into config/factory
- **Error handling**: All errors must extend or match the patterns in `src/llm/types.ts` (e.g., `LLMError` or provider-specific exceptions)

## Instructions

**Step 1: Implement the provider in src/llm/**

Create `src/llm/{provider-name}.ts` implementing `LLMProvider<TConfig>` from `src/llm/types.ts`.

Reference existing providers:
- `anthropic.ts` — streaming via `message_start`, `content_block_delta` events
- `openai-compat.ts` — standard OpenAI-compatible API
- `cursor-acp.ts` — headless agent mode with `--stream-partial-output`

Implement:
```typescript
export class MyProvider implements LLMProvider<MyConfig> {
  constructor(config: MyConfig) { this.config = config; }
  
  async call(request: LLMRequest): Promise<string> {
    // Non-streaming call
    // Return full text response
  }
  
  async *stream(request: LLMRequest): AsyncGenerator<string> {
    // Streaming call — yield text chunks
    // Handle protocol-specific events (if any)
  }
}
```

**Verify**: Type-check passes (`npx tsc --noEmit`) and provider exports correctly.

**Step 2: Add configuration in src/llm/config.ts**

Register provider type and config interface in `src/llm/config.ts` alongside existing providers (`anthropic`, `openai`, `cursor`, `claude-cli`).

Add to union type:
```typescript
export type LLMConfig = AnthropicConfig | OpenAIConfig | MyProviderConfig | ...;
```

Add config interface:
```typescript
export interface MyProviderConfig {
  provider: 'my-provider';
  apiKey?: string; // optional if using env var
  model: string;
  // other settings
}
```

**Verify**: Config merges into `LLMConfig` union without conflicts.

**Step 3: Wire into factory in src/llm/index.ts**

Update `src/llm/index.ts` `createLLMClient()` function to instantiate provider:

```typescript
case 'my-provider':
  return new MyProvider(config as MyProviderConfig);
```

Add import at top:
```typescript
import { MyProvider } from './my-provider.js';
```

**Verify**: Factory passes config correctly and type-checks.

**Step 4: Write unit test in src/llm/__tests__/**

Create `src/llm/__tests__/my-provider.test.ts` with:
- Mock API responses matching provider's protocol
- `call()` test: verify request format, response parsing
- `stream()` test: verify chunk parsing, event handling
- Error handling test (invalid API key, timeout, malformed response)

Use existing test patterns from `anthropic.test.ts` or `openai-compat.test.ts`.

**Verify**: `npm run test -- src/llm/__tests__/my-provider.test.ts` passes.

**Step 5: Test integration**

Run full LLM test suite:
```bash
npm run test -- src/llm/
```

Test config loading:
```bash
npm run build && npx caliber config --check
```

If provider requires user setup (interactive prompts), add to `src/commands/interactive-provider-setup.ts` following patterns for Anthropic/OpenAI.

## Examples

**User says**: "Add support for Groq API"

**Actions**:
1. Create `src/llm/groq.ts` → implement `LLMProvider` with OpenAI-compatible fetch calls
2. Update `src/llm/config.ts` → add `GroqConfig` type with `model`, `apiKey` fields
3. Update `src/llm/index.ts` → factory case for `'groq'`
4. Write `src/llm/__tests__/groq.test.ts` → mock Groq API responses, test `call()` and `stream()`
5. Run: `npm run test -- src/llm/groq.test.ts` → passes

**Result**: User can set `LLM_PROVIDER=groq` and `GROQ_API_KEY=...`, caliber uses Groq for all LLM calls.

## Common Issues

**"Cannot find module './my-provider'"**
- Verify file is named `src/llm/{provider-name}.ts` (kebab-case)
- Import uses `.js` extension: `import { MyProvider } from './my-provider.js'`
- Run `npm run build` to check TypeScript

**"MyProvider does not implement LLMProvider"**
- Ensure both `call()` and `stream()` methods exist and match signature in `src/llm/types.ts`
- `call()` returns `Promise<string>`, `stream()` returns `AsyncGenerator<string>`
- Run `npx tsc --noEmit` for full type errors

**"Provider not found in factory"**
- Check `src/llm/index.ts` `createLLMClient()` has `case 'my-provider'` matching config type
- Verify config union in `src/llm/config.ts` includes `MyProviderConfig`

**"API key undefined at runtime"**
- Provider reads from `process.env.PROVIDER_API_KEY` or `config.apiKey`
- User must set env var or pass in config
- Check `.env` file or shell: `echo $PROVIDER_API_KEY`

**"Stream yields nothing / incomplete chunks"**
- Verify `stream()` parses protocol correctly (event vs. line delimiters)
- Test against mock: `npm run test -- src/llm/__tests__/my-provider.test.ts`
- Compare event structure to `anthropic.ts` (SSE) or `openai-compat.ts` (JSON Lines)