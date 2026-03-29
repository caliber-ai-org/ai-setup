---
name: llm-provider
description: Adds a new LLM provider implementing LLMProvider interface with call() and stream() methods. Integrates config in src/llm/config.ts, factory in src/llm/index.ts, and error handling. Use when adding a new provider backend, integrating a model API, or extending LLM capabilities. Do NOT use for modifying existing providers or fixing provider bugs.
---
# llm-provider

## Critical

- All providers MUST implement the `LLMProvider` interface from `src/llm/types.ts`: `call(prompt, options)` and `stream(prompt, options)` methods.
- Stream method MUST yield `{ delta: string; timestamp_ms?: number }` objects. Final event MUST omit `timestamp_ms` to avoid duplication.
- Provider MUST handle `unknown` error types, never `any`. Validate inputs before API calls.
- Config env vars MUST be loaded in `src/llm/config.ts` with fallback to `process.env`.
- Provider MUST be registered in factory function in `src/llm/index.ts`.
- Do NOT hardcode model names or tool behaviors. All detection is LLM-driven.

## Instructions

1. **Define the provider file** in `src/llm/<provider-name>.ts`
   - Import `LLMProvider`, `LLMOptions`, `StreamEvent` from `src/llm/types.ts`
   - Import `logger` from `src/lib/log.js` (if available) or use `console`
   - Export a class implementing `LLMProvider` with `call()` and `stream()` async methods
   - Verify the class signature matches existing providers (e.g., `anthropic.ts`, `openai-compat.ts`)

2. **Implement `call()` method**
   - Accept `(prompt: string, options: LLMOptions)` parameters
   - Make API request with model, temperature, max_tokens from options
   - Return `{ text: string }` on success
   - Wrap API calls in try/catch, catch unknown, and throw standardized error with `code` and `message` properties
   - Verify error response includes error details before proceeding

3. **Implement `stream()` method**
   - Accept same parameters as `call()`
   - Yield `{ delta: string; timestamp_ms?: number }` for streamed chunks
   - Final event MUST NOT include `timestamp_ms` (check `openai-compat.ts` or `cursor-acp.ts` for pattern)
   - Handle stream cancellation and connection errors gracefully
   - Verify streaming output does not duplicate final text

4. **Add config in `src/llm/config.ts`**
   - Import provider class at top of file
   - Add env var getters (e.g., `getProviderApiKey()`, `getProviderModel()`)
   - Validate required env vars are present; throw error with clear message if missing
   - Verify config matches pattern in existing config entries

5. **Register in factory `src/llm/index.ts`**
   - Import provider class and config getters
   - Add case to `getProvider()` switch statement matching provider name
   - Return instantiated provider with config passed to constructor
   - Verify factory exports provider in getProvider() function

6. **Test the provider**
   - Create `src/llm/__tests__/<provider-name>.test.ts`
   - Test `call()` returns `{ text: string }` with valid input
   - Test `stream()` yields objects with `delta` and optional `timestamp_ms`; final event has no timestamp
   - Test error handling: invalid API key, network error, malformed response
   - Run `npm run test -- src/llm/__tests__/<provider-name>.test.ts` and verify all pass

## Examples

**User says**: "Add support for Claude API as a provider"

**Actions taken**:
1. Create `src/llm/anthropic.ts` implementing `LLMProvider` with Anthropic SDK
2. Implement `call()` using `client.messages.create()` with model/temp/max_tokens from options
3. Implement `stream()` using `client.messages.create({ stream: true })`, yielding `{ delta }` for each event
4. Add `getAnthropicApiKey()` and `getAnthropicModel()` in `src/llm/config.ts`
5. Register in `src/llm/index.ts` factory: `case 'anthropic': return new AnthropicProvider(...)`
6. Write tests validating both methods, error handling, and stream format

**Result**: Provider callable via `getProvider('anthropic')` with full call/stream support

## Common Issues

- **"Unexpected timestamp_ms in final event"**: Stream method includes `timestamp_ms` on the last chunk. Fix: Check if this is the final event (no more data), then remove `timestamp_ms` before yielding.
- **"Provider is undefined in factory"**: Import statement missing in `src/llm/index.ts`. Fix: Add `import { YourProvider } from './your-provider.js'` at top of file.
- **"API_KEY not found"**: Config getter returns undefined. Fix: Verify env var name in `config.ts` matches `process.env.YOUR_API_KEY`, add fallback check.
- **"Stream yields objects without delta"**: Response structure mismatch. Fix: Verify API returns delta/content field name; map it to `{ delta: string }` before yielding.
- **"call() and stream() signatures don't match LLMProvider"**: Type error on class. Fix: Ensure both methods are `async` and accept `(prompt: string, options: LLMOptions)`, return `Promise<...>`.