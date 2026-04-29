# 02 — Provider integrations audit

## Context

Audit the seven LLM providers Caliber claims to support, plus the shared config / types / model recovery layer. Live testing in this audit only covers Claude CLI; this file documents what we infer from code review for the other six.

(Note: README advertises 5 providers but `interactive-provider-setup.ts` exposes 7 — Claude Code, OpenCode, Cursor, Anthropic, Vertex, OpenAI, MiniMax. README/post-install messaging undersells.)

## Per-provider audit

### claude-cli.ts (332 lines) — live-tested in Phase 2

**Spawn pattern:** `spawn(claude, ['-p', '--model', X])` with stdin-piped prompt. On Windows: `shell:true` with explicit per-arg quoting.

**Binary resolution:** Caches result of `which claude`. Falls back through known install paths: `~/.local/bin/claude`, `/usr/local/bin/claude`, `/opt/homebrew/bin/claude`. PATH-independent — works in hook subprocesses where `$PATH` is stripped (Claude Code's hook subprocess only has `/usr/bin:/bin:/usr/sbin:/sbin`).

**Env-var leakage protection (the #147 fix):** `cleanClaudeEnv()` strips `CLAUDECODE`, `CLAUDE_CODE_SIMPLE`, and any `CLAUDE_CODE_*` before spawning. This prevents Claude Code's anti-recursion detection from firing when caliber spawns `claude -p` from inside a Claude Code session.

**Subprocess sentinel:** `withCaliberSubprocessEnv()` sets `CALIBER_SUBPROCESS=1` (and legacy `CALIBER_SPAWNED=1`) so hook entry points short-circuit. Documented as fixing #150, #169, #171, #194.

**Auth detection:** `isClaudeCliLoggedIn()` runs `claude auth status` (5s timeout). Tries to parse JSON `{loggedIn: bool}`; falls back to string match for "not logged in". **Cached for process lifetime** — if the user logs out mid-session OR a token expires, the cache is stale.

**Token tracking:** Uses `estimateTokens()` from `utils.ts` — `Math.ceil(text.length / 4)`. Approximate. The CLI doesn't report real token counts via the headless protocol.

**Error handling:** Both `call()` and `stream()` check stderr AND stdout for auth errors (CLI sometimes writes auth failures to stdout). Friendly messages from `parseSeatBasedError()` regex matching.

**Timeout:** 10 minutes default, configurable via `CALIBER_CLAUDE_CLI_TIMEOUT_MS`. SIGTERM on timeout (no SIGKILL escalation, unlike cursor-acp).

**Known issues addressed:** #147, #138, #166 (file is the lengthy fix surface for these). Issue #166 specifically about Windows ENOENT/EINVAL in the `claude -p` spawn.

### cursor-acp.ts (437 lines) — code-audit only this session

**Spawn pattern:** `agent --print --trust --workspace <tmpdir> --model X --output-format stream-json --stream-partial-output`. The `--workspace os.tmpdir()` prevents the agent from browsing the actual repo (would otherwise activate ACP file-tool behavior).

**Pre-warm support:** `prewarm()` spawns the process during fingerprint collection to hide spawn latency. Stored in `warmProcess`, taken later by `takeWarmProcess()` if model matches.

**Stream parser handles the doubling bug:** `--stream-partial-output` sends word-by-word deltas (with `timestamp_ms`) followed by a FINAL event with the complete text (no `timestamp_ms`). The parser skips events without `timestamp_ms` to prevent text doubling. Documented in user's auto-memory and in code comments.

**SIGKILL escalation:** Unlike claude-cli, kills with SIGTERM then SIGKILL after 5s. Better — claude-cli should match.

**Auth detection:** `isCursorLoggedIn()` runs `agent status`, returns false if "not logged in" appears. **Does NOT pass `withCaliberSubprocessEnv()`** — inconsistent with the rest of the file. If Cursor ever sets analogous env vars to Claude Code, this could break similarly to #147.

**Token tracking:** char-based estimate. Same issue as claude-cli. Cursor's stream-json result event includes real `usage` per TODOS.md P2 — already known but not implemented.

**Rate-limit handling:** stream() distinguishes rate-limit errors (won't reject — let retry logic handle) from other errors (rejects).

**Known issues:** #141 (race condition in stream callback) — fix appears to be in place via `settled` flag.

### anthropic.ts (86 lines)

**SDK:** `@anthropic-ai/sdk` v0.78.0 (per package.json).

**Prompt caching:** ON by default — `cache_control: { type: 'ephemeral' }` on the system prompt for both `call()` and `stream()`. Good for cost savings within a session.

**Token tracking:** Real counts from `response.usage` including cache read / cache write breakdown.

**listModels():** Implemented via `client.models.list({ limit: 100 })`. Used by model recovery flow.

**max_tokens defaults:** 4096 for `call()`, 10240 for `stream()`. Different defaults are surprising — should be one constant.

**No timeout configurability** at the provider level — relies on SDK defaults.

### openai-compat.ts (113 lines)

**SDK:** `openai` v6.29.0.

**Custom base URL:** Optional `baseURL` for OpenAI-compatible endpoints (LM Studio, vLLM, etc.).

**`max_completion_tokens` (#155 fix verified):** Lines 41 and 83 both use `max_completion_tokens` not `max_tokens`. The fix is in. ✓

**Streaming:** Per-chunk delta accumulation. Tracks `finish_reason` and maps `'length'` → `'max_tokens'`.

**Token tracking:** Real counts from `response.usage`. **No cache token tracking** — OpenAI's caching API isn't surfaced, even though OpenAI now offers prompt caching.

**Timeout:** Configurable via `CALIBER_OPENAI_TIMEOUT_MS`, default 10 minutes.

**Temperature:** Optional override at construction. Default: undefined (let API decide).

### vertex.ts (112 lines)

**SDK:** `@anthropic-ai/vertex-sdk` v0.14.4 + `google-auth-library` v9.

**Auth:** Three modes — inline JSON `vertexCredentials`, file path (treated as `GOOGLE_APPLICATION_CREDENTIALS`), or ADC (default).

**Region:** Default `us-east5`. Configurable via `vertexRegion` config or env.

**Prompt caching:** ON by default — same `cache_control: ephemeral` pattern as Anthropic. ✓

**Token tracking:** Real counts including cache breakdown.

**Timeout:** Hardcoded 10 minutes in client construction. **Not configurable.** Slow GCP regions could hit this unnecessarily.

**listModels(): NOT IMPLEMENTED.** Per TODOS.md P3. When model recovery needs alternatives, falls back to hardcoded `KNOWN_MODELS['vertex']` (only 5 models) which is `@version`-suffixed Vertex-style names.

### opencode.ts (283 lines)

**Spawn pattern:** `opencode run --format json --model X -- -` with stdin-piped prompt.

**Binary:** Bare `opencode` (NOT resolved to absolute path). Code comment warns this would break on Windows if it became an absolute path with spaces (`shell:true` quote-handling). Defensive but fragile.

**Env:** Sets `OPENCODE_DISABLE_AUTOCOMPACT=TRUE` for stable output.

**Auth detection:** `opencode auth status` parsing. Same pattern as Claude CLI. Cached for process lifetime.

**Token tracking:** char-based estimate. Same limitation.

**Timeout:** 10 minutes, configurable via `CALIBER_OPENCODE_TIMEOUT_MS`.

**Stream parser:** Line-by-line JSON. Looks for `event.type === 'text'` with `event.part?.text`. Other event types ignored.

### minimax.ts (23 lines, not deeply read)

Mentioned for completeness — newest provider, smallest surface. Should follow OpenAI-compat pattern based on file size.

### Shared layer

**model-recovery.ts (170 lines):**
- `KNOWN_MODELS` is a hardcoded fallback list per provider. Updates require code changes — no dynamic refresh.
- `handleModelNotAvailable`: tries `provider.listModels()`, falls back to KNOWN_MODELS, prompts user via inquirer.
- **`if (!process.stdin.isTTY) return null` at line 97** — non-interactive mode (CI, hooks, `--auto-approve`) cannot recover from a model-not-available error. Just exits with a "run caliber config" message.
- Persists selection to `~/.caliber/config.json` AND sets `process.env.CALIBER_MODEL` for the current process.

**seat-based-errors.ts (19 lines):**
- 4 regex patterns for: not-logged-in, rate-limit, usage-limit, model-not-found.
- Returns user-friendly message or null. Used by all 3 CLI providers.
- Tight, well-bounded.

**index.ts (229 lines):**
- `createProvider()` switch — fails loudly on missing CLI / not-logged-in for seat-based providers BEFORE attempting first call.
- `llmCall()` — 3 retries with exponential backoff for transient/overloaded/rate-limit errors.
- `validateModel()` — lightweight ping (`maxTokens: 1`). **Skipped for seat-based providers.** Reason given: "seat-based providers use whatever model the service provides." But this means a Claude CLI user with a misconfigured model name doesn't fail-fast.

**config.ts (196 lines):**
- `loadConfig()` — file first, then env. Order: ANTHROPIC_API_KEY, VERTEX/GCP_PROJECT_ID, OPENAI_API_KEY, MINIMAX_API_KEY, then explicit `CALIBER_USE_*` flags for seat-based.
- `getMaxPromptTokens()` — based on `MODEL_CONTEXT_WINDOWS` (hardcoded). Default 200k context, 60% input budget, max 300k cap.
- `getFastModel()` — `ANTHROPIC_SMALL_FAST_MODEL` env var only honored for anthropic/vertex/claude-cli (per llm-patterns.md rule).

**usage.ts (40 lines):**
- In-memory map of `model → {input, output, cacheRead, cacheWrite, calls}`.
- No persistence — usage is lost between commands. Each `caliber init` starts fresh.

## Findings

- **[P1] Char-based token estimation for 3 of 7 providers.** `claude-cli.ts:142, 197`, `cursor-acp.ts:78, 96`, `opencode.ts:252, 274` all use `estimateTokens(text)` (`length / 4`). Real token counts diverge from this estimate by 10–30% depending on content. Implications: (1) `displayTokenUsage()` shows misleading numbers labeled "Estimated"; (2) the LLM provider's actual quota usage is invisible to caliber. TODOS.md P2 mentions Cursor parsing as a known fix; same fix applies to OpenCode (its `--format json` output likely contains usage), Claude CLI may not expose usage in headless mode.

- **[P1] `isCursorLoggedIn()` skips the subprocess sentinel.** `src/llm/cursor-acp.ts:426-437` calls `execFileSync(agent, ['status'])` without `withCaliberSubprocessEnv()`. Inconsistent with the rest of the file. Symptom: if Cursor ever sets analogous env vars to Claude Code's anti-recursion ones, the login check could trigger them. Defensive fix is one-line (wrap the env).

- **[P1] Cached login status is stale-vulnerable.** `claude-cli.ts:304-332`, `opencode.ts:22-59`. `isClaudeCliLoggedIn()` and `isOpenCodeLoggedIn()` cache results for process lifetime. If a token expires mid-session OR the user runs `claude logout` in a parallel terminal, caliber will continue assuming "logged in" until the *real* call fails. The auth-failure error message users see at first generation (e.g. "Not logged in · Please run /login" in #147) confused users into thinking caliber's detection was wrong. Mitigations: shorter cache TTL, OR re-check on every auth-error retry.

- **[P1] `validateModel()` skipped for seat-based providers** is a UX regression. `src/llm/index.ts:198-199`. A user with `~/.caliber/config.json` set to `provider: claude-cli, model: bogus-name` won't see the failure until generation starts streaming. Before that, the init flow has already burned 30s on fingerprint + parallel skill search. Proposed fix: ping with a short prompt for seat-based too (small token cost, large UX win).

- **[P1] `handleModelNotAvailable` cannot recover in non-interactive mode.** `src/llm/model-recovery.ts:97-104`. Pre-commit hooks, CI runs, `--auto-approve`, and any TTY-stripped subprocess will hit this dead end. Combined with `KNOWN_MODELS` going stale (vertex `claude-sonnet-4-6@20250514` is from May), a CI sync that's been working for months can suddenly break with no recovery path. Suggested: in non-interactive mode, fall back to the first KNOWN_MODELS entry that isn't the failed model and proceed (with a warning).

- **[P1] Vertex `listModels()` not implemented.** `src/llm/vertex.ts` — confirmed missing per TODOS.md P3. Means Vertex-using teams have no automatic model discovery; recovery is limited to the 5 hardcoded `KNOWN_MODELS['vertex']` entries (most likely stale because they're @-suffixed Vertex names with deprecated dates).

- **[P1] OpenAI provider does not track cache tokens.** `src/llm/openai-compat.ts:50-56`. OpenAI's API now reports `prompt_tokens_details.cached_tokens`. Caliber's tracking shows only `prompt_tokens` and `completion_tokens`. Implication: cost displays understate value of Anthropic caching but overstate raw OpenAI cost.

- **[P2] OpenCode binary cannot become an absolute path under Windows without breaking.** `src/llm/opencode.ts:14-17` documents this as a comment. Latent footgun for the next contributor who tries to "improve" path resolution.

- **[P2] AnthropicProvider streaming default `max_tokens` differs from non-streaming.** `src/llm/anthropic.ts:17, 59` — 4096 vs 10240. Same in vertex.ts. Should be a named constant (e.g. `DEFAULT_STREAM_MAX_TOKENS = 10240`).

- **[P2] Vertex client timeout is hardcoded.** `src/llm/vertex.ts:41, 43` — 10 minutes, no env override. All other providers expose a `CALIBER_*_TIMEOUT_MS` env var. Inconsistent.

- **[P2] Token usage tracking is in-memory only.** `src/llm/usage.ts` — Map cleared at process start. Each `caliber init` reports its own usage but there's no per-day or per-week aggregation. For seat-based users worried about quota, this is invisible.

- **[P2] `KNOWN_MODELS` go stale silently.** `src/llm/model-recovery.ts:12-32`. Vertex names use `@20250514` which is 11 months old. Users on a current account who hit a fallback will see stale model names suggested. Could fetch on first run and cache.

- **[P2] `parseJsonResponse` is fragile to LLM markdown wrapping.** `src/llm/utils.ts:34-55`. Strips one-line ``` fences only. Multi-line nested fences (which models occasionally produce) would slip through and fail JSON.parse. The fallback `extractJson` does bracket-counting but won't handle markdown-quoted strings inside the JSON.

- **[P2] Provider count mismatch between README and code.** README mentions 5 providers; `interactive-provider-setup.ts:13-21` exposes 7 (adds OpenCode and MiniMax). Either keep README current or hide the unfinished ones from the picker.

## Open questions

- Should seat-based providers be excluded from `validateModel()` permanently, or is the exclusion just because the early implementations didn't have a "ping with short prompt" path that worked headlessly?
- Should login-status caches have a TTL (e.g. 60s) instead of process-lifetime? Cost: extra `auth status` call per generation. Benefit: stale-cache bugs go away.
- Is `MiniMax` a first-class provider or experimental? It's in the picker but absent from the README. Decide before any messaging redesign.
- Why `withCaliberSubprocessEnv` writes both `CALIBER_SUBPROCESS` and the legacy `CALIBER_SPAWNED` — the file says "drop in next minor release" but v1.48.2 still writes both. Is the migration window done?
