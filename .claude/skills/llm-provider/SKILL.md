---
name: llm-provider
description: Implements or modifies an LLM provider in src/llm/ by implementing the LLMProvider interface (call() + stream() methods) from src/llm/types.ts. All provider calls route through src/llm/index.ts (llmCall, llmJsonCall). Use when user says 'add provider', 'new LLM', 'support model X', or modifies src/llm/ files. Do NOT use for calling LLM from commands — use existing llmCall/llmJsonCall instead.
---
# LLM Provider Implementation

## Critical

1. **All new providers MUST implement the `LLMProvider` interface** from `src/llm/types.ts`:
   ```typescript
   interface LLMProvider {
     call(req: LLMRequest): Promise<LLMResponse>;
     stream(req: LLMRequest): AsyncGenerator<LLMChunk, void>;
   }
   ```
2. **Register provider in `src/llm/index.ts`** via the `llmCall()` and `llmJsonCall()` exports — this is the only entrypoint commands use.
3. **Handle `TRANSIENT_ERRORS`** (network, rate-limit, timeout) by catching and re-throwing as `Error` with message matching pattern in `src/llm/model-recovery.ts`.
4. **Never catch `SeatBasedError`** — let it propagate; use `parseSeatBasedError()` from `src/llm/seat-based-errors.ts` in caller if needed.
5. **Verify token estimation** with `estimateTokens()` from `src/llm/utils.ts` for cost tracking via `trackUsage()` in `src/llm/usage.ts`.

## Instructions

1. **Create provider file in `src/llm/`** (e.g., `src/llm/my-provider.ts`).
   - Verify it exports a class implementing `LLMProvider`.
   - Validate constructor accepts config from `src/llm/config.ts` (type `LLMConfig`).

2. **Implement `call(req: LLMRequest): Promise<LLMResponse>`**.
   - Extract request fields: `messages`, `model`, `maxTokens`, `temperature`, `systemPrompt`, `jsonMode`.
   - Call provider API with correct field mappings (e.g., Anthropic uses `max_tokens`, OpenAI uses `max_tokens`).
   - On success: return `{ content: string, inputTokens: number, outputTokens: number, model: string }`.
   - On transient error: throw `Error` with message containing 'timeout', 'rate limit', or 'connection'.
   - On auth/quota error: throw error with message matching `seat-based-errors.ts` patterns (e.g., 'quota', 'billing').
   - Verify response parsing with `extractJson()` from `src/llm/utils.ts` if `jsonMode: true`.

3. **Implement `stream(req: LLMRequest): AsyncGenerator<LLMChunk, void>`**.
   - Yield chunks as `{ delta: string, inputTokens?: number, outputTokens?: number }`.
   - Track final token counts; yield final chunk with cumulative counts.
   - On error: throw the same error types as `call()`.
   - Use `src/ai/stream-parser.ts` to parse tool calls if needed.

4. **Export provider from `src/llm/index.ts`**.
   - Add import: `import { MyProvider } from './my-provider'`.
   - Update `getProvider()` function to instantiate your provider based on config type.
   - Verify `llmCall()` and `llmJsonCall()` delegate to `provider.call()`.

5. **Add provider to `src/llm/config.ts`** if it requires new config fields.
   - Update `LLMConfig` type union to include new provider config type.
   - Export type so callers can pass correct config shape.

6. **Test with `vitest`** in `src/llm/__tests__/`.
   - Mock API calls; verify `call()` returns correct `LLMResponse` shape.
   - Verify `stream()` yields correct `LLMChunk` objects.
   - Test transient error handling: mock network timeout, verify error message matches `TRANSIENT_ERRORS` pattern.
   - Run `npm run test -- src/llm/__tests__/my-provider.test.ts` to validate.

## Examples

**User**: "Add support for OpenAI-compatible endpoints."

**Actions**:
1. Create `src/llm/openai-compat.ts` (already exists as reference).
2. Import `LLMProvider`, `LLMRequest`, `LLMResponse`, `LLMConfig` from `src/llm/types.ts`.
3. Define class `OpenAICompatProvider implements LLMProvider`.
4. In `call()`: map `req.messages` to OpenAI format, call provider, extract tokens, return `LLMResponse`.
5. In `stream()`: iterate provider stream, yield `LLMChunk` per delta.
6. Export from `src/llm/index.ts`; update `getProvider()` to instantiate based on config.
7. Test: `npm run test -- src/llm/__tests__/openai-compat.test.ts`.

**Result**: Commands using `llmCall({ messages, model })` automatically route to OpenAI-compatible endpoint based on config; token counts tracked via `trackUsage()`.

## Anti-patterns

1. **DO NOT** call provider API directly from commands — use `llmCall()` from `src/llm/index.ts`. CORRECT: `import { llmCall } from './llm'; const res = await llmCall({ messages, model });`

2. **DO NOT** handle `SeatBasedError` inside provider — let it bubble up. Commands catch it via `try/catch` and call `parseSeatBasedError()`. CORRECT: throw raw error; let caller parse with `parseSeatBasedError(error.message)`.

3. **DO NOT** forget to track usage for cost reporting — always return `inputTokens` and `outputTokens` in `LLMResponse`. CORRECT: after API call, estimate tokens with `estimateTokens()` or extract from provider response, call `trackUsage()` in caller context.

## Common Issues

- **Error: "Provider not registered in llmCall()"**
  - Verify import statement in `src/llm/index.ts`: `import { MyProvider } from './my-provider'`.
  - Verify `getProvider()` function instantiates your provider: `if (config.type === 'my-provider') return new MyProvider(config)`.
  - Run `npm run build` and verify no TypeScript errors.

- **Error: "Transient error not caught, request retried infinitely"**
  - Check error message from provider matches one of `TRANSIENT_ERRORS` patterns in `src/llm/model-recovery.ts` (e.g., 'timeout', 'ECONNREFUSED', 'rate_limit_exceeded').
  - If not: wrap provider error in `new Error()` with message containing transient keyword, e.g., `throw new Error('timeout calling provider')`.
  - Verify `model-recovery.ts` retry logic kicks in: `npm run test -- src/llm/__tests__/model-recovery.test.ts`.

- **Error: "Token count mismatch, usage not tracked"**
  - Verify `call()` returns `inputTokens` and `outputTokens` as numbers (not strings).
  - If provider doesn't return token counts: use `estimateTokens(messages, model)` from `src/llm/utils.ts` to estimate before API call.
  - Verify caller invokes `trackUsage()` after `llmCall()` succeeds (check `src/ai/generate.ts` for pattern).