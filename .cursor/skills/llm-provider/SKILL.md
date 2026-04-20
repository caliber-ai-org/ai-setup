---
name: llm-provider
description: Adds a new LLM provider implementing LLMProvider interface from src/llm/types.ts with call() and stream() methods. Integrates config in src/llm/config.ts and factory in src/llm/index.ts. Use when adding a new AI backend, integrating a new model API, or extending provider support. Do NOT use for modifying existing providers or debugging provider issues.
---
# LLM Provider

## Critical

- **All providers must implement `LLMProvider` interface** from `src/llm/types.ts`: `call(options: LLMCallOptions): Promise<string>` and `stream(options: LLMStreamOptions, callbacks: LLMStreamCallbacks): Promise<void>`
- **No partial implementations**: Both `call()` and `stream()` must work. Streaming is not optional.
- **Streaming via callbacks**: `stream()` invokes `callbacks.onText(text)` for each chunk, `callbacks.onEnd(meta?)` when complete, and `callbacks.onError(error)` on failure — it does NOT return an async generator or iterable.
- **Error handling**: Catch all errors and either call `callbacks.onError()` (in `stream()`) or throw (in `call()`). Preserve error messages unchanged.
- **Model validation**: Respect `options.model || this.defaultModel` pattern — never hardcode model names.

## Instructions

1. **Define provider file** at `src/llm/{provider-name}.ts`
   - Import `{ LLMProvider, LLMCallOptions, LLMStreamOptions, LLMStreamCallbacks, LLMConfig }` from `src/llm/types.ts`
   - Export class `{ProviderName}Provider implements LLMProvider`
   - Constructor takes `config: LLMConfig`; store `this.defaultModel = config.model`
   - Initialize SDK client from `config.apiKey` in constructor — never lazy-initialize on first call
   - Verify API key exists in constructor, throw `new Error('API key required')` if missing

2. **Implement `call()` method**
   - Signature: `async call(options: LLMCallOptions): Promise<string>`
   - Make HTTP request to provider API using `options.system`, `options.prompt`, `options.model || this.defaultModel`, `options.maxTokens`
   - Extract text from response, return as single string
   - On error, throw with error message unchanged (retry logic in `src/llm/index.ts` handles transient errors)
   - Verify this works before proceeding

3. **Implement `stream()` method**
   - Signature: `async stream(options: LLMStreamOptions, callbacks: LLMStreamCallbacks): Promise<void>`
   - Use provider's streaming endpoint; iterate chunks
   - For each text chunk: call `callbacks.onText(chunkText)`
   - After iteration completes: call `callbacks.onEnd({ stopReason, usage })` (usage is optional)
   - On error: call `callbacks.onError(error instanceof Error ? error : new Error(String(error)))`
   - Test by verifying `callbacks.onEnd` is called and `callbacks.onText` fires for each chunk

4. **Add config in `src/llm/config.ts`**
   - Add provider to `ProviderType` union in `src/llm/types.ts`
   - Add `LLMConfig` fields if needed (beyond `apiKey`, `model`, `baseUrl`)
   - In `resolveFromEnv()`: add env var detection block before `return null`
   - In `readConfigFile()` validation: add your provider slug to the includes list
   - Verify: `npx tsc --noEmit` shows no ProviderType errors

5. **Register in factory at `src/llm/index.ts`**
   - Import provider class at top of file
   - Add `case 'your-provider': return new YourProviderProvider(config);` in `createProvider()` switch
   - Run `npm run build && npm run test` to verify factory picks up provider

6. **Add tests in `src/llm/__tests__/{provider-name}.test.ts`**
   - Mock API responses using `vitest.mock()` or `fetch` stub
   - Test `call()`: verify message formatting, response parsing, error handling
   - Test `stream()`: verify chunk parsing, usage reporting, error yields
   - Test config validation: invalid model, missing API key
   - Run `npx vitest run src/llm/__tests__/{provider-name}.test.ts`

## Examples

**User says**: "Add support for Groq as a new LLM provider."

**Actions**:
1. Create `src/llm/groq.ts` with `GroqProvider` class
2. Implement `call()` calling `https://api.groq.com/openai/v1/chat/completions` with OpenAI-compatible format
3. Implement `stream()` using same endpoint with `stream: true`
4. In `src/llm/config.ts`, add `if (config.provider === 'groq') return new GroqProvider(...)`
5. In `src/llm/index.ts`, import and route `groq` provider in `getProvider()`
6. Create tests mocking Groq API responses
7. Verify: `npm run test -- src/llm/__tests__/groq.test.ts` passes

**Result**: Caliber can now use Groq models via `{ provider: 'groq', apiKey: '...', model: 'mixtral-8x7b-32768' }`

## Common Issues

- **"Unknown provider: your-provider"**: Verify `ProviderType` union updated AND `createProvider()` switch case added in `src/llm/index.ts`. Both must be updated together.
- **"Stream callbacks never fire; onEnd not called"**: `stream()` must be `async` (not a generator). Ensure `callbacks.onEnd()` is called after the loop completes, not inside it.
- **"API key required"**: Verify env var name in `resolveFromEnv()` matches the variable the user sets. Test: `YOUR_API_KEY=test npm run test -- src/llm/__tests__/index.test.ts`.
- **"Stream stops early"**: Check provider's response format (JSON lines, SSE, etc.). Log raw chunks: `console.error('Raw chunk:', chunk)` to debug parsing.
- **Type errors on LLMStreamCallbacks**: Verify import is `from './types.js'` (with `.js` extension for ESM).
- **Tests fail with "fetch is not defined"**: Add global fetch mock or use `node-fetch` in `src/test/setup.ts`.