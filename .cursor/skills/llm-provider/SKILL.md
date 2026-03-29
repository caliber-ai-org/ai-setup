---
name: llm-provider
description: Adds a new LLM provider implementing LLMProvider interface from src/llm/types.ts with call() and stream() methods. Integrates config in src/llm/config.ts and factory in src/llm/index.ts. Use when adding a new AI backend, integrating a new model API, or extending provider support. Do NOT use for modifying existing providers or debugging provider issues.
---
# LLM Provider

## Critical

- **All providers must implement `LLMProvider` interface** from `src/llm/types.ts`: `call(messages, params)` and `stream(messages, params)` returning `AsyncIterable<StreamChunk>`
- **No partial implementations**: Both `call()` and `stream()` must work. Streaming is not optional.
- **StreamChunk format**: `{ type: 'text' | 'error' | 'usage'; value: string; usage?: { input: number; output: number } }`
- **Error handling**: Catch provider-specific errors, map to `ChatError` from `src/llm/types.ts` with `code` (e.g., `'auth'`, `'rate_limit'`, `'network'`) and `message`
- **Model validation**: Call `validateModel(modelId)` in config before accepting the model. Refer to `src/llm/config.ts` for pattern.

## Instructions

1. **Define provider file** at `src/llm/{provider-name}.ts`
   - Import `{ LLMProvider, ChatMessage, ChatParams, StreamChunk, ChatError }` from `src/llm/types.ts`
   - Export class `{ProviderName}Provider implements LLMProvider`
   - Constructor takes `{ apiKey?: string; model: string; baseUrl?: string }` matching config structure
   - Store config in instance: `this.apiKey = apiKey || process.env.{PROVIDER_API_KEY}`
   - Verify API key exists on first call, throw `ChatError` with `code: 'auth'` if missing

2. **Implement `call()` method**
   - Signature: `async call(messages: ChatMessage[], params: ChatParams): Promise<string>`
   - Make HTTP request to provider API with messages and params (temperature, max_tokens, etc.)
   - Extract text from response, return as single string
   - On error (network, auth, rate limit), throw `ChatError` with appropriate `code` and `message`
   - Verify this works before proceeding

3. **Implement `stream()` method**
   - Signature: `async *stream(messages: ChatMessage[], params: ChatParams): AsyncIterable<StreamChunk>`
   - Use provider's streaming endpoint (e.g., SSE, WebSocket, chunked response)
   - Yield `{ type: 'text', value: '<chunk>' }` for each text delta
   - Yield `{ type: 'usage', value: '', usage: { input, output } }` at end if available
   - On error, yield `{ type: 'error', value: '<error message>' }` and return
   - Test streaming with `for await (const chunk of stream(...)) { console.log(chunk) }`

4. **Add config in `src/llm/config.ts`**
   - Import `{ProviderName}Provider` in `getProvider(config, model)` function
   - Add condition: `if (config.provider === '{provider-slug}') return new {ProviderName}Provider({ apiKey: config.apiKey, model, baseUrl: config.baseUrl })`
   - Add case in `validateModel()`: check against provider's official model list or hardcode supported models
   - Export provider slug in `SUPPORTED_PROVIDERS` array if it exists
   - Verify config function accepts and routes your provider

5. **Register in factory at `src/llm/index.ts`**
   - Import provider in `getProvider()` function
   - Add to the conditional chain matching provider name from config
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

- **"Provider not recognized" in factory**: Verify provider slug matches exactly in `getProvider()` condition AND in config file. Check spelling and case sensitivity.
- **"TypeError: stream is not async iterable"**: Ensure `stream()` is a generator function (uses `async *` and `yield`). Test with `for await` loop before deploying.
- **"API key is undefined"**: Verify environment variable name in provider constructor matches what user sets. Log `apiKey` value in error message: `throw new ChatError('auth', 'API key missing: check {ENV_VAR_NAME}')`
- **"Stream stops early or yields garbage"**: Check provider's response format (JSON lines, SSE, etc.). Log raw response chunk: `console.error('Raw chunk:', chunk)` to debug parsing.
- **"Model validation fails but model is valid"**: Ensure `validateModel()` in config covers all supported models for this provider. If list is dynamic, call provider's models endpoint and cache.
- **Type errors on ChatError**: Verify import is `from 'src/llm/types.js'` (with `.js` extension for ESM).
- **Tests fail with "fetch is not defined"**: Add `import { fetch } from 'node-fetch'` or mock globally in `src/test/setup.ts`.