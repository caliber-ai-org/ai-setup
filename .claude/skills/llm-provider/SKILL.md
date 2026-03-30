---
name: llm-provider
description: Adds a new LLM provider implementing LLMProvider interface with call() and stream() methods. Integrates config in src/llm/config.ts, factory in src/llm/index.ts, and error handling. Use when adding a new provider backend, integrating a model API, or extending LLM capabilities. Do NOT use for modifying existing providers or fixing provider bugs.
---
# llm-provider

## Critical

- **Interface compliance**: Every provider MUST implement `LLMProvider` from `src/llm/types.ts` with exactly two methods: `call(params)` and `stream(params)`. Both return `Promise<LLMResponse>` and `AsyncIterable<StreamChunk>` respectively.
- **No hardcoded model mappings**: Detection and selection MUST be LLM-driven or user-selected, never static. Seat-based providers (Cursor, Claude CLI) must skip validation in `validateModel()` checks.
- **Error handling**: All network/auth errors MUST be caught and wrapped in `LLMError` with code (e.g., `'auth'`, `'rate_limit'`, `'model_not_found'`). Provide actionable error messages.
- **Stream format**: Stream chunks MUST follow `{ type: 'text' | 'stop', text?: string, stop_reason?: string }`. The `stream-parser.ts` expects exact format.
- **Fast model scoping**: `ANTHROPIC_SMALL_FAST_MODEL` env var is scoped ONLY to `anthropic` and `vertex` providers in `getFastModel()`. Other providers must not read this var.

## Instructions

### Step 1: Create the provider file
**File**: `src/llm/{provider-name}.ts`

Start with the exact structure from existing providers (e.g., `anthropic.ts`, `openai-compat.ts`):

```typescript
import { LLMProvider, LLMResponse, StreamChunk, LLMError } from './types.js';

export class MyProvider implements LLMProvider {
  private apiKey: string;
  private baseUrl?: string;

  constructor(apiKey: string, baseUrl?: string) {
    if (!apiKey) throw new Error('API key required for MyProvider');
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  async call(params: {
    model: string;
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    temperature?: number;
    max_tokens?: number;
    system?: string;
  }): Promise<LLMResponse> {
    // Implementation
  }

  async *stream(params: {
    model: string;
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    temperature?: number;
    max_tokens?: number;
    system?: string;
  }): AsyncIterable<StreamChunk> {
    // Implementation
  }
}
```

**Verify**: Both methods exist. Constructor validates required config. No hardcoded API URLs (use env vars or constructor params).

### Step 2: Export from LLM index
**File**: `src/llm/index.ts`

Add import and factory export:

```typescript
import { MyProvider } from './my-provider.js';

export { MyProvider };
export type { /* types if needed */ };

// In the getLLMProvider() factory function:
case 'my-provider':
  return new MyProvider(
    process.env.MY_PROVIDER_API_KEY || '',
    process.env.MY_PROVIDER_BASE_URL
  );
```

**Verify**: Provider is exported. Factory case handles env var reads. No bare API keys in code.

### Step 3: Add configuration in config.ts
**File**: `src/llm/config.ts`

Add to the config object returned by `getConfig()`:

```typescript
my_provider: {
  apiKey: process.env.MY_PROVIDER_API_KEY,
  baseUrl: process.env.MY_PROVIDER_BASE_URL,
  isSeatBased: false, // or true if user-seat-licensed (e.g., Cursor)
  requiresAuth: true,
}
```

If the provider has a fast-model option, add to `getFastModel()`:

```typescript
if (provider === 'my-provider') {
  return process.env.MY_PROVIDER_FAST_MODEL || 'my-provider-fast-default';
}
```

**Verify**: Config key matches case in factory. Env vars are consistent across both files. `isSeatBased` is set correctly.

### Step 4: Implement error handling
**File**: `src/llm/my-provider.ts`

Wrap API calls in try/catch. Map errors to `LLMError`:

```typescript
try {
  const response = await fetch(`${this.baseUrl}/chat`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new LLMError('Invalid API key', 'auth');
    }
    if (response.status === 429) {
      throw new LLMError('Rate limit exceeded', 'rate_limit');
    }
    if (response.status === 404) {
      throw new LLMError(`Model ${params.model} not found`, 'model_not_found');
    }
    throw new LLMError(`HTTP ${response.status}: ${await response.text()}`, 'unknown');
  }
  // Parse and return
} catch (err) {
  if (err instanceof LLMError) throw err;
  throw new LLMError(`Provider error: ${err.message}`, 'unknown');
}
```

**Verify**: All HTTP error codes (401, 429, 404, 5xx) are handled. Network errors are caught. Messages are clear and actionable.

### Step 5: Implement stream() with correct format
**File**: `src/llm/my-provider.ts`

Yield chunks in the exact format expected by `stream-parser.ts`:

```typescript
async *stream(params: {...}): AsyncIterable<StreamChunk> {
  const response = await fetch(`${this.baseUrl}/chat/stream`, { /* ... */ });
  const reader = response.body?.getReader();
  if (!reader) throw new LLMError('Stream not available', 'unknown');

  let buffer = '';
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line || line.startsWith(':')) continue; // SSE comments
        if (line.startsWith('data: ')) {
          const data = JSON.parse(line.slice(6));
          if (data.choices?.[0]?.delta?.content) {
            yield { type: 'text', text: data.choices[0].delta.content };
          }
          if (data.choices?.[0]?.finish_reason) {
            yield { type: 'stop', stop_reason: data.choices[0].finish_reason };
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
```

**Verify**: Stream yields chunks with correct type field. Stop reason is included on finish. Buffer handles partial lines correctly.

### Step 6: Write tests
**File**: `src/llm/__tests__/my-provider.test.ts`

Add minimal tests covering both methods:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { MyProvider } from '../my-provider.js';

describe('MyProvider', () => {
  it('throws if API key is missing', () => {
    expect(() => new MyProvider('')).toThrow('API key required');
  });

  it('call() returns LLMResponse with text', async () => {
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({
        choices: [{ message: { content: 'Hello' } }],
      })))
    ));

    const provider = new MyProvider('test-key');
    const response = await provider.call({
      model: 'gpt-5',
      messages: [{ role: 'user', content: 'Hi' }],
    });

    expect(response.text).toBe('Hello');
  });

  it('stream() yields text chunks', async () => {
    // Mock streaming response
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve(new Response(new ReadableStream({ /* ... */ })))
    ));

    const provider = new MyProvider('test-key');
    const chunks = [];
    for await (const chunk of provider.stream({
      model: 'gpt-5',
      messages: [{ role: 'user', content: 'Hi' }],
    })) {
      chunks.push(chunk);
    }

    expect(chunks.some(c => c.type === 'text')).toBe(true);
  });
});
```

**Verify**: Tests run without errors. `npm run test -- src/llm/__tests__/my-provider.test.ts` passes.

### Step 7: Update types if needed
**File**: `src/llm/types.ts`

If your provider needs additional config fields, extend `ProviderConfig`:

```typescript
export interface ProviderConfig {
  // ... existing fields
  myProvider?: {
    apiKey: string;
    baseUrl?: string;
    customField?: string;
  };
}
```

**Verify**: Type is used consistently in `config.ts` and `index.ts`.

## Examples

### User request:
"Add support for Anthropic's Vertex AI provider."

### Actions taken:

1. Create `src/llm/vertex.ts` implementing `LLMProvider` with `call()` and `stream()` using Vertex SDK.
2. Export from `src/llm/index.ts`: `export { VertexProvider }`.
3. Add factory case in `getLLMProvider()`: `case 'vertex': return new VertexProvider(projectId, location, ...)`
4. Update `src/llm/config.ts` with Vertex env vars and `isSeatBased: false`.
5. Implement error handling for Vertex-specific errors (auth, model not found, quota).
6. Implement `stream()` yielding chunks from Vertex streaming API.
7. Write tests in `src/llm/__tests__/vertex.test.ts` for both methods.
8. Run `npm run test -- src/llm/__tests__/vertex.test.ts` to verify.

### Result:
Caliber now supports Vertex AI. Users can set `VERTEX_PROJECT_ID` and `VERTEX_LOCATION`, then select Vertex as their LLM provider during `caliber init`.

## Common Issues

**Error: "Cannot find module './my-provider.js'"**
- ESM imports require `.js` extensions. Add `.js` to all relative imports in `index.ts`.
- Verify file exists at exact path.

**Error: "LLMError is not exported"**
- Import from `src/llm/types.js` not `src/llm.js`.
- Correct: `import { LLMError } from './types.js';`

**Stream yields empty text or stops early**
- Verify buffer handling in stream loop. Lines must be split on `\n` and incomplete lines stored in buffer.
- Check API response format. Some APIs use Server-Sent Events (`data: `), others use line-delimited JSON.
- Test with `curl` first: `curl -N https://api/stream` to see raw format.

**"Rate limit exceeded" error on every call**
- Verify API key is valid and has quota remaining. Check provider dashboard.
- If seat-based, ensure you have a valid license (Cursor, Claude CLI).
- Check if `isSeatBased: true` is set correctly — seat-based providers bypass rate limit checks in some contexts.

**Provider not appearing in `caliber init` flow**
- Verify provider is exported from `src/llm/index.ts`.
- Check `getLLMProvider()` case statement matches provider name.
- Verify config key exists in `src/llm/config.ts`.
- Run `caliber status` to see if provider is detected.

**Tests fail with "fetch is not defined"**
- Use `vi.stubGlobal('fetch', ...)` in Vitest to mock fetch.
- Or import a fetch polyfill like `node-fetch` if targeting Node < 18.
- Verify `src/test/setup.ts` doesn't stub fetch globally (it shouldn't).