# 08 — Path B (init wizard) on caliber dogfood

## Context

`node /Users/alonpe/personal/caliber/dist/bin.js init --auto-approve --agent claude,cursor,github-copilot` against fresh `/tmp/caliber-audit/caliber-dogfood/` clone. Provider: claude-cli (this user is on Vertex-backed Claude Code).

## Run 1 — original v1.48.2 source

- Exit code: **1**
- Latency: 33s wall-clock
- Result: **failure** at the "Generating configs" step

Final stderr-of-trace (after all the spinner frames):

```
✗ Generating configs         Model responded but output was…   20s
✗ Validating & refining config  No config to validate
Failed to generate config.
Error log written to .caliber/error-log.md

Raw LLM output (JSON parse failed):
Claude CLI exited with code 1. Not logged in. Run the login command for your provider to re-authenticate.
```

`.caliber/error-log.md`:
```
**Provider**: claude-cli  **Model**: default  **Stop reason**: error
Raw LLM Output:
Claude CLI exited with code 1. Not logged in. Run the login command for your provider to re-authenticate.
```

But `claude -p "ok"` works fine in this same shell — confirmed in pre-flight.

## Root-cause investigation

Caliber's `cleanClaudeEnv()` in `src/llm/claude-cli.ts:85-93` strips **all** `CLAUDE_CODE_*` env vars before spawning `claude -p`:

```typescript
if (key === 'CLAUDE_CODE_SIMPLE' || key === 'CLAUDECODE' || key.startsWith('CLAUDE_CODE_')) {
  delete env[key];
}
```

This was added as the fix for #147 (Claude Code's anti-recursion detection). The intent: strip recursion-detection markers so the spawned `claude -p` doesn't think it's running inside another Claude Code session.

**Problem:** `CLAUDE_CODE_USE_VERTEX=1` is also stripped. That env var tells Claude Code to authenticate via Vertex (GCP) instead of the regular Pro/Max/Team subscription. When caliber strips it:
- Spawned `claude -p` doesn't know to use Vertex
- Falls back to regular auth
- Reports "Not logged in" because this user has no regular Claude subscription set up — they're on Vertex

**Verified empirically:**

```bash
# WITH Vertex var stripped (caliber's behavior) → fails
node -e "
const env = {...process.env};
for (const k of Object.keys(env)) if (k.startsWith('CLAUDE_CODE_')) delete env[k];
require('child_process').spawn('claude', ['-p', 'ok'], {env, stdio: 'inherit'});
"
# → 'Not logged in'

# WITH Vertex var preserved (proposed fix) → works  
node -e "
const env = {...process.env};
const ANTI_RECURSION = ['CLAUDECODE','CLAUDE_CODE_SIMPLE','CLAUDE_CODE_SESSION_ID','CLAUDE_CODE_ENTRYPOINT','CLAUDE_CODE_EXECPATH'];
for (const k of ANTI_RECURSION) delete env[k];
require('child_process').spawn('claude', ['-p', 'ok'], {env, stdio: 'inherit'});
"
# → 'ok'
```

**Suggested fix:** narrow the strip to only the known anti-recursion vars. Preserve `CLAUDE_CODE_USE_VERTEX`, `CLAUDE_CODE_USE_BEDROCK`, and any other auth-control vars Claude Code adds in the future. Better: maintain an explicit `ANTI_RECURSION_VARS` allowlist.

## Run 2 — with cleanClaudeEnv() patched

I patched `src/llm/claude-cli.ts` to preserve `CLAUDE_CODE_USE_VERTEX` and `CLAUDE_CODE_USE_BEDROCK`, rebuilt dist, and re-ran:

- Exit code: **1**
- Latency: 2 minutes 22 seconds wall-clock
- Result: **different failure** — `Stop reason: timeout_inactivity`, "Model produced no output for…"

`.caliber/error-log.md`:
```
**Provider**: claude-cli  **Model**: default  **Stop reason**: timeout_inactivity
Raw LLM Output: (empty)
This failure was caused by a timeout. ...
```

So the auth bug is the FIRST blocker. After fixing it, init hits a SECOND blocker: the prompt for caliber-dogfood (314 files, large fingerprint) causes the model to either take too long to start streaming OR not produce streaming output for >2 minutes.

Direct `claude -p` with a small prompt (e.g. "list 3 npm packages") works fine on the same env. So the prompt size or shape is the issue.

Also notable from the v1.48.2 run output:
- "✓ Detecting project stack       no languages 10s" — caliber-dogfood is OBVIOUSLY a TypeScript project, but detect.ts returns no languages. Possibly the LLM call returned an empty response that was silently swallowed (the #142 family of silent failures). Or the LLM was truncated.

## Findings

- **[P0] `cleanClaudeEnv()` strips `CLAUDE_CODE_USE_VERTEX`, breaking Vertex-backed Claude Code auth.** `src/llm/claude-cli.ts:85-93`. The fix for #147 over-strips. Enterprise users on Vertex (a primary Claude Code deployment for Pro/Team) cannot use `caliber init` from inside a Claude Code session. Reproduced 100% on this machine. Fix: narrow strip to known anti-recursion vars only. Preserve `CLAUDE_CODE_USE_VERTEX`, `CLAUDE_CODE_USE_BEDROCK`. Likely affects more vars Claude Code may add over time — maintain an explicit allowlist.

- **[P0] `caliber init` times out on large-prompt repos.** Even with the auth bug patched, init on caliber-dogfood (314 files) hit `timeout_inactivity` after 2m9s with no output. Direct `claude -p` returns small responses fine. Either (a) the prompt is too large and the model takes too long to start streaming, OR (b) Vertex's streaming behavior differs from direct Anthropic enough to violate caliber's inactivity assumption. The default `CALIBER_STREAM_INACTIVITY_TIMEOUT_MS=120000` is too tight. Surfaces "Model produced no output" with no actionable next step beyond bumping env var.

- **[P1] `detect.ts` returns "no languages" for a TypeScript project.** This is symptom of one of: (a) LLM returned empty (silent failure, family E), (b) LLM call itself failed silently and detect returned default. Either way: a TypeScript-monorepo-with-package.json should never report "no languages" — that's a smoke test for the detect step.

- **[P1] User-facing CLI output contains the absolute caliber binary path.** The "What's configured" / "Explore" sections print:
  ```
  /Users/alonpe/.nvm/versions/node/v24.14.0/bin/caliber score
  /Users/alonpe/.nvm/versions/node/v24.14.0/bin/caliber undo
  ```
  Same path-baking issue as the skill files (P0 finding from 07-path-a-dogfood.md). When the user shares their terminal output (in a bug report or screenshot), they share their nvm path. Cosmetic, but unprofessional and confusing — most users don't expect their personal install path in output meant to be copy-pasted into the next command.

- **[P1] Init's pre-LLM steps (skill writes) succeed even when the LLM step fails.** The 6 modified skill files (find-skills, save-learning across 3 platforms with the absolute-path injection) are written DURING Step 2 (Setup), BEFORE the LLM-dependent Step 3. So when Step 3 fails, these "side-effect" file writes remain — the user has a partially-applied state with skill modifications but no generated configs. `caliber undo` would revert these but the user has no signal that they SHOULD undo.

## Outcome

Path B on caliber-dogfood is **broken** in v1.48.2 source for any user on Vertex-backed Claude Code (or possibly other non-default auth backends). Path B on smaller repos may succeed (validated separately on synthetic — see Task 12 notes).

The audit now proceeds with the cleanClaudeEnv patch IN PLACE for the remaining live tests. **The patch is documented and will be reverted before the audit's final commit.**
