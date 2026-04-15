---
paths:
  - src/llm/**
---

# LLM Provider Patterns

- Providers implement `LLMProvider` from `src/llm/types.ts`: `call()`, `stream()`, optional `listModels()`
- Config: env vars → `~/.caliber/config.json` via `src/llm/config.ts`
- Seat-based: `isSeatBased()` in `src/llm/types.ts` — `cursor` and `claude-cli` skip `validateModel()`
- Cursor: `agent --print --trust --workspace /tmp` in `src/llm/cursor-acp.ts`
- Fast model: `getFastModel()` in `src/llm/config.ts` — `ANTHROPIC_SMALL_FAST_MODEL` scoped to anthropic/vertex/claude-cli
- Model recovery: `src/llm/model-recovery.ts` handles not-found with interactive fallback
- Usage: `trackUsage()` from `src/llm/usage.ts`
- Errors: `src/llm/seat-based-errors.ts` parses stderr from CLI providers
- JSON: `extractJson()`, `parseJsonResponse()` in `src/llm/utils.ts`
