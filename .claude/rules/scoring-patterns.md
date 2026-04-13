---
paths:
  - src/scoring/**
---

# Scoring Check Patterns

- All checks are deterministic — no LLM calls, no network I/O, no randomness
- Check functions return `Check[]` from `src/scoring/index.ts`
- Point constants in `src/scoring/constants.ts` — never hardcode values
- `filterChecksForTarget()` uses sets: `CLAUDE_ONLY_CHECKS`, `CURSOR_ONLY_CHECKS`, `CODEX_ONLY_CHECKS`, `COPILOT_ONLY_CHECKS` in `src/scoring/constants.ts`
- Helpers: `readFileOrNull()`, `collectPrimaryConfigContent()`, `estimateTokens()` in `src/scoring/utils.ts`
- Display: `src/scoring/display.ts` · History: `src/scoring/history.ts` · Dismissed: `src/scoring/dismissed.ts`
- Grade thresholds in `GRADE_THRESHOLDS`, category max in `CATEGORY_MAX`
- Test: `npx vitest run src/scoring/__tests__/accuracy.test.ts`
