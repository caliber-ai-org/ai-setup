<p align="center">
  <img src="assets/logo-dark.svg" alt="Caliber" width="220">
</p>

# Caliber

**Hand-written `CLAUDE.md` files go stale the moment you refactor — Caliber keeps every agent's context accurate as the code changes.**

<p align="center">
  <img src="assets/what-you-get.png" alt="What you get with Caliber: fresh agent context, sync a skill once across Claude Code Cursor Codex and Copilot, compact without summarizing" width="900">
</p>

<p align="center">
  <img src="assets/demo-header.gif" alt="Caliber product demo" width="900">
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@rely-ai/caliber"><img src="https://img.shields.io/npm/v/@rely-ai/caliber" alt="npm version"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/npm/l/@rely-ai/caliber" alt="license"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/node/v/@rely-ai/caliber" alt="node"></a>
  <img src="https://img.shields.io/badge/caliber-94%2F100-brightgreen" alt="Caliber Score">
  <img src="https://img.shields.io/badge/Claude_Code-supported-blue" alt="Claude Code">
  <img src="https://img.shields.io/badge/Cursor-supported-blue" alt="Cursor">
  <img src="https://img.shields.io/badge/Codex-supported-blue" alt="Codex">
  <img src="https://img.shields.io/badge/OpenCode-supported-blue" alt="OpenCode">
  <img src="https://img.shields.io/badge/GitHub_Copilot-supported-blue" alt="GitHub Copilot">
</p>

## Start

Requires **Node.js >= 20**.

```bash
npx @rely-ai/caliber bootstrap
```

Then, in your terminal (not the IDE chat), start Claude Code or Cursor CLI and type:

```
/setup-caliber
```

The agent detects the stack, writes `CLAUDE.md` / Cursor rules / `AGENTS.md` / Copilot instructions, and installs the hooks.

No Claude Code or Cursor? `caliber init` is the same setup as a CLI wizard — Anthropic, OpenAI, MiniMax, or Vertex, your key.

> **Your code stays on your machine.** Bootstrap is local — no LLM calls, no code sent anywhere. Generation uses your seat or your key. Caliber never sees your source.

<details>
<summary><strong>Windows</strong></summary>

- **Run from your terminal** (PowerShell, CMD, or Git Bash) — not from an IDE chat. `cd` into the project, then `npx @rely-ai/caliber bootstrap`.
- **Git Bash is recommended.** Pre-commit hooks and auto-sync scripts use shell syntax. PowerShell-only setups may skip hooks silently.
- **Cursor Agent CLI:** If prompted to install it, download from [cursor.com/downloads](https://www.cursor.com/downloads) instead of the macOS/Linux `curl | bash`. Then `agent login`.
- **One terminal at a time.** Two Caliber processes in one repo will fight over provider detection.

</details>

## Proof

A typical hand-written `CLAUDE.md` and nothing else. Scoring is filesystem math — no LLM, no API calls. It checks whether referenced paths exist, whether code blocks are present, and whether the config drifted since the last commit.

```
  Before                                    After /setup-caliber
  ──────────────────────────────            ──────────────────────────────

  Agent Config Score    35 / 100            Agent Config Score    94 / 100
  Grade D                                   Grade A

  FILES & SETUP           6 / 25            FILES & SETUP          24 / 25
  QUALITY                12 / 25            QUALITY                22 / 25
  GROUNDING               7 / 20            GROUNDING              19 / 20
  ACCURACY                5 / 15            ACCURACY               13 / 15
  FRESHNESS               5 / 10            FRESHNESS              10 / 10
  BONUS                   0 / 5             BONUS                   5 / 5
```

```bash
caliber score --compare main    # how this branch moved the score
```

## Write a skill once. Every agent gets it.

<p align="center">
  <img src="assets/sync-flow.svg" alt="A skill written in Claude Code is mirrored by caliber sync into Cursor, Codex, OpenCode, and Copilot native folders" width="900">
</p>

`caliber sync` — no LLM, cheap enough for every session start.

```bash
caliber sync                    # mirror into every detected agent
caliber sync --status           # what each agent currently holds
caliber sync --dry-run          # preview without writing
caliber sync --from cursor      # pick the source of truth
```

<details>
<summary>What sync writes, what it refuses to clobber</summary>

```
Caliber Sync

  Source: Claude Code — 4 item(s)
  Targets: Cursor, Codex, GitHub Copilot

  wrote  .cursor/skills/deploy/SKILL.md
  wrote  .cursor/rules/house-style.mdc
  wrote  .cursor/mcp.json
  wrote  .agents/skills/deploy/SKILL.md
  wrote  .github/instructions/deploy.instructions.md
  skipped  mcp:linear for codex — Codex MCP servers are configured globally
```

`refresh` rewrites the prose documents. `sync` owns the artifacts. They stay in their lanes.

**Providers are not symmetric, so sync degrades instead of dropping.** Copilot has no skills directory — a skill becomes `.github/instructions/*.instructions.md` with `applyTo` from the skill's `paths`. Codex has no plugin system — a plugin expands into its skills. Anything that cannot be represented is reported with a reason.

**Hand edits are never clobbered.** Sync hashes every file it writes. A file you edited is a conflict until you pass `--force`.

Two optional hooks (`caliber hooks`) keep it continuous:

| Hook | Effect |
|---|---|
| `Agent sync (SessionStart)` | Every agent starts holding the same skills and rules |
| `Agent sync (on edit)` | Editing a skill in one agent mirrors it immediately |

The on-edit hook is path-filtered to provider skill/rule directories, so ordinary edits cost nothing.

</details>

## Compact without summarizing

<p align="center">
  <img src="assets/compact-compare.png" alt="Summarize vs Jev compact: left loses paths and errors, right drops stale tool calls and keeps wording verbatim" width="900">
</p>

[TypeSafe's](https://typesafe.ai) Jev. Stale tool calls drop. Kept text stays verbatim.

> **BYOK:** `AI_GATEWAY_API_KEY` is a Vercel AI Gateway key. `TYPESAFE_API_KEY` is a TypeSafe key. They authenticate different hosts and are not interchangeable. Caliber does not ship, share, or proxy either.

```bash
export CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1   # function hooks are early-access, off by default
export AI_GATEWAY_API_KEY=...                # Vercel AI Gateway — not a TypeSafe key
# or: export TYPESAFE_API_KEY=...            # direct TypeSafe System One

claude plugin marketplace add caliber-ai-org/ai-setup
claude plugin install caliber-jev-compaction@caliber
```

Or vendor it into a repo Caliber already set up:

```bash
caliber plugin install --dry-run   # print the loadable file tree, write nothing
caliber plugin install             # .claude/plugins/ + a local marketplace
caliber plugin list
```

5-minute install → key → live-gate → `/compact`: [`FUNCTIONAL_CHECKLIST.md`](FUNCTIONAL_CHECKLIST.md).

Preview the same scoring without installing anything:

```bash
caliber compact            # report what would be dropped — read-only
```

```
Jev Compaction

  Messages:  248 -> 201
  Chars:     412,880 -> 190,344  (53.9% smaller)
  Calls:     96 scored — 41 kept, 23 results dropped, 26 calls dropped, 6 pinned
```

<details>
<summary>Keys, fallback, and how to verify the real API</summary>

| Key | Host | Model |
|---|---|---|
| `AI_GATEWAY_API_KEY` | Vercel AI Gateway (`/v4/ai/evaluation-model`) | `typesafe-ai/jev` |
| `TYPESAFE_API_KEY` | TypeSafe System One (`api.typesafe.ai/v1/systemone`) | `jev-latest` |

Set one in the environment, or enter it when `claude plugin install` prompts for `gatewayApiKey` / `apiKey`.

| Hook | What it does |
|---|---|
| `session.compact` | Substitutes the verbatim-trimmed transcript for Claude Code's summary |
| `turn.complete` | Requests compaction once context passes `compactAtPercent` (60% by default) |

If Jev fails, the key is missing, the transcript will not fit the state budget, or the reduction is below `minReductionRatio`, the hook logs a fallback and **delegates to Claude Code's built-in compaction** — a bad Jev day degrades compaction, it does not break the session.

Configuration is plugin `userConfig` (`apiKey`, `gatewayApiKey`, `gatewayBaseUrl`, `keepThreshold`, `preserveRecentMessages`, `compactAtPercent`, `minReductionRatio`, `maxStateTokens`, `maxRequestTokens`, `truncateHeadChars`, `model`) — editable from Claude Code, not a Caliber config file.

> **Function hooks are an early-access Claude Code surface** and stay off unless `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` is set. `caliber plugin install` prints the enable steps. Authored against Claude Code 2.1.274; revisit after an upgrade.

The unit suite substitutes the network. To hit the **real** Jev API:

```bash
# Direct TypeSafe System One (a TypeSafe key — not a Vercel key)
TYPESAFE_API_KEY=sk-... npm run e2e:jev

# Vercel AI Gateway — live gate for a Gateway key.
# A Gateway key 401s against api.typesafe.ai. Do not put it in TYPESAFE_API_KEY.
AI_GATEWAY_API_KEY=... npm run e2e:jev:gateway
```

`e2e:jev:gateway` skips when the key is unset (no fake pass). HTTP 403 `"AI Gateway requires a valid credit card on file"` is **Vercel billing**, not a Caliber bug. They never use a Caliber-hosted or shared secret.

`caliber compact` is the same scoring as a one-off report — useful before enabling the plugin, or from an agent that is not Claude Code. Below a 25% reduction it tells you compaction is not worth the request. It never rewrites the transcript.

`caliber sync` also installs a `jev-compaction` skill into every agent, which is the clearest demo of plugin expansion: Claude Code and Cursor get a skill, Copilot gets an instruction file.

The scoring library is bundled under `src/vendor/` (MIT) — no extra install.

</details>

## Audits first, writes second

Caliber never overwrites your existing configs without asking. The workflow mirrors code review:

1. **Score** — read-only audit of your current setup
2. **Propose** — generate or improve configs, shown as a diff
3. **Review** — accept, refine via chat, or decline each change
4. **Backup** — originals saved to `.caliber/backups/` before every write
5. **Undo** — `caliber undo` restores everything to its previous state

If your existing config scores **95+**, Caliber skips full regeneration and applies targeted fixes to the specific checks that are failing.

## How It Works

Bootstrap gives your agent the `/setup-caliber` skill. Your agent analyzes the project — languages, frameworks, dependencies, architecture — generates configs, and installs hooks. From there, it's a loop:

```
  npx @rely-ai/caliber bootstrap       ← one-time, 2 seconds
              │
              ▼
   agent runs /setup-caliber             ← agent handles everything
              │
              ▼
  ┌──── configs generated ◄────────────┐
  │           │                        │
  │           ▼                        │
  │     your code evolves              │
  │     (new deps, renamed files,      │
  │      changed architecture)         │
  │           │                        │
  │           ▼                        │
  └──► caliber refresh ──────────────►─┘
       (auto, on every commit)
```

Pre-commit hooks run the refresh loop automatically. New team members get nudged to bootstrap on their first session.

### What It Generates

**Claude Code**
- `CLAUDE.md` — Project context, build/test commands, architecture, conventions
- `CALIBER_LEARNINGS.md` — Patterns learned from your AI coding sessions
- `.claude/skills/*/SKILL.md` — Reusable skills ([OpenSkills](https://agentskills.io) format)
- `.mcp.json` — Auto-discovered MCP server configurations
- `.claude/settings.json` — Permissions and hooks

**Cursor**
- `.cursor/rules/*.mdc` — Modern rules with frontmatter (description, globs, alwaysApply)
- `.cursor/skills/*/SKILL.md` — Skills for Cursor
- `.cursor/mcp.json` — MCP server configurations

**OpenAI Codex**
- `AGENTS.md` — Project context for Codex
- `.agents/skills/*/SKILL.md` — Skills for Codex

**OpenCode**
- `AGENTS.md` — Project context (shared with Codex when both are targeted)
- `.opencode/skills/*/SKILL.md` — Skills for OpenCode

**GitHub Copilot**
- `.github/copilot-instructions.md` — Project context for Copilot
- `.github/instructions/*.instructions.md` — Skills and rules degraded into scoped instruction files

## Key Features

<details>
<summary><strong>Any Codebase</strong></summary>

TypeScript, Python, Go, Rust, Java, Ruby, Terraform, and more. Language and framework detection is fully LLM-driven — no hardcoded mappings. Caliber works on any project.

</details>

<details>
<summary><strong>Any AI Tool</strong></summary>

`caliber bootstrap` auto-detects which agents you have installed. For manual control:
```bash
caliber init --agent claude        # Claude Code only
caliber init --agent cursor        # Cursor only
caliber init --agent codex         # Codex only
caliber init --agent opencode        # OpenCode only
caliber init --agent github-copilot  # GitHub Copilot only
caliber init --agent all             # All platforms
caliber init --agent claude,cursor   # Comma-separated
```

</details>

<details>
<summary><strong>Chat-Based Refinement</strong></summary>

Not happy with the generated output? During review, refine via natural language — describe what you want changed and Caliber iterates until you're satisfied.

</details>

<details>
<summary><strong>MCP Server Discovery</strong></summary>

Caliber detects the tools your project uses (databases, APIs, services) and auto-configures matching MCP servers for Claude Code and Cursor.

</details>

<details>
<summary><strong>Deterministic Scoring</strong></summary>

`caliber score` evaluates your config quality without any LLM calls — purely by cross-referencing config files against your actual project filesystem.

| Category | Points | What it checks |
|---|---|---|
| **Files & Setup** | 25 | Config files exist, skills present, MCP servers, cross-platform parity |
| **Quality** | 25 | Code blocks, concise token budget, concrete instructions, structured headings |
| **Grounding** | 20 | Config references actual project directories and files |
| **Accuracy** | 15 | Referenced paths exist on disk, config freshness vs. git history |
| **Freshness & Safety** | 10 | Recently updated, no leaked secrets, permissions configured |
| **Bonus** | 5 | Auto-refresh hooks, AGENTS.md, OpenSkills format |

Every failing check includes structured fix data — when `caliber init` runs, the LLM receives exactly what's wrong and how to fix it.

</details>

<details>
<summary><strong>Session Learning</strong></summary>

Caliber watches your AI coding sessions and learns from them. Hooks capture tool usage, failures, and your corrections — then an LLM distills operational patterns into `CALIBER_LEARNINGS.md`.

```bash
caliber learn install      # Install hooks for Claude Code and Cursor
caliber learn status       # View hook status, event count, and ROI summary
caliber learn finalize     # Manually trigger analysis (auto-runs on session end)
caliber learn remove       # Remove hooks
```

Learned items are categorized by type — **[correction]**, **[gotcha]**, **[fix]**, **[pattern]**, **[env]**, **[convention]** — and automatically deduplicated.

</details>

<details>
<summary><strong>Auto-Refresh</strong></summary>

Keep configs in sync with your codebase automatically:

| Hook | Trigger | What it does |
|---|---|---|
| **Git pre-commit** | Before each commit | Refreshes docs and stages updated files |
| **Claude Code session end** | End of each session | Runs `caliber refresh` and updates docs |
| **Learning hooks** | During each session | Captures events for session learning |

```bash
caliber hooks --install    # Enable refresh hooks
caliber hooks --remove     # Disable refresh hooks
```

The `refresh` command analyzes your git diff (committed, staged, and unstaged changes) and updates config files to reflect what changed.

By default the pre-commit hook stages refreshed doc files into the commit in flight. If you prefer to review refreshed docs before committing them (e.g. signed-commit or minimal-diff workflows), disable auto-staging — the refresh still runs, but updated files stay in your working tree:

```bash
git config caliber.autostage false
```

</details>

<details>
<summary><strong>Team Onboarding</strong></summary>

When Caliber is set up in a repo, it automatically nudges new team members to configure it on their machine. A lightweight session hook checks whether the pre-commit hook is installed and prompts setup if not — no manual coordination needed.

</details>

<details>
<summary><strong>Fully Reversible</strong></summary>

- **Automatic backups** — originals saved to `.caliber/backups/` before every write
- **Score regression guard** — if a regeneration produces a lower score, changes are auto-reverted
- **Full undo** — `caliber undo` restores everything to its previous state
- **Clean uninstall** — `caliber uninstall` removes everything Caliber added (hooks, generated sections, skills, learnings) while preserving your own content
- **Dry run** — preview changes with `--dry-run` before applying

</details>

## Commands

| Command | Description |
|---|---|
| `caliber bootstrap` | Install agent skills — the fastest way to get started |
| `caliber init` | Full setup wizard — analyze, generate, review, install hooks |
| `caliber score` | Score config quality (deterministic, no LLM) |
| `caliber score --compare <ref>` | Compare current score against a git ref |
| `caliber regenerate` | Re-analyze and regenerate configs (aliases: `regen`, `re`) |
| `caliber refresh` | Update docs based on recent code changes |
| `caliber sync` | Mirror skills, rules and plugins across every agent (no LLM) |
| `caliber sync --status` | Show what each agent currently holds |
| `caliber compact` | Report what Jev compaction would drop, keeping wording verbatim |
| `caliber plugin install` | Install the bundled Jev compaction plugin into this project |
| `caliber plugin list` | Show bundled plugins and their install state |
| `caliber skills` | Discover and install community skills |
| `caliber learn` | Session learning — install hooks, view status, finalize analysis |
| `caliber hooks` | Manage auto-refresh hooks |
| `caliber config` | Configure LLM provider, API key, and model |
| `caliber status` | Show current setup status |
| `caliber uninstall` | Remove all Caliber resources from a project |
| `caliber undo` | Revert all changes made by Caliber |

## FAQ

<details>
<summary><strong>Does it overwrite my existing configs?</strong></summary>

No. Caliber shows you a diff of every proposed change. You accept, refine, or decline each one. Originals are backed up automatically.

</details>

<details>
<summary><strong>Does it need an API key?</strong></summary>

**Bootstrap & scoring:** No. Both run 100% locally with no LLM.

**Generation** (via `/setup-caliber` or `caliber init`): Uses your existing Claude Code or Cursor subscription (no API key needed), or bring your own key for Anthropic, OpenAI, MiniMax, or Vertex AI.

**Jev compaction** (`caliber compact` / the Claude Code plugin): Yes — your own key as `AI_GATEWAY_API_KEY` (Vercel AI Gateway) or `TYPESAFE_API_KEY` (direct TypeSafe). A Vercel key is not a TypeSafe key. Caliber does not provide one.

</details>

<details>
<summary><strong>What's the difference between bootstrap and init?</strong></summary>

`caliber bootstrap` installs agent skills in 2 seconds — your agent then runs `/setup-caliber` to handle the rest from inside your session. `caliber init` is the full interactive wizard for users who prefer a CLI-driven setup. Both end up in the same place.

</details>

<details>
<summary><strong>What if I don't like what it generates?</strong></summary>

Refine it via chat during review, or decline the changes entirely. If you already accepted, `caliber undo` restores everything. You can also preview with `--dry-run`.

</details>

<details>
<summary><strong>Does it work with monorepos?</strong></summary>

Yes. Run `caliber init` from any directory. `caliber refresh` can update configs across multiple repos when run from a parent directory.

</details>

<details>
<summary><strong>Does it send my code anywhere?</strong></summary>

Scoring is fully local. Generation sends a project summary (languages, structure, dependencies — not source code) to whatever LLM provider you configure — the same provider your AI editor already uses. Anonymous usage analytics (command names, durations — no code, no file contents) are collected via PostHog. To opt out:

- **Per-run**: `caliber --no-traces <command>`
- **Persistent env var**: `export CALIBER_TELEMETRY_DISABLED=1`

</details>

## LLM Providers

No API key? No problem. Caliber works with your existing AI tool subscription:

| Provider | Setup | Default Model |
|---|---|---|
| **Claude Code** (your seat) | `caliber config` → Claude Code | Inherited from Claude Code |
| **Cursor** (your seat) | `caliber config` → Cursor | Inherited from Cursor |
| **Anthropic** | `export ANTHROPIC_API_KEY=sk-ant-...` | `claude-sonnet-4-6` |
| **OpenAI** | `export OPENAI_API_KEY=sk-...` | `gpt-5.4-mini` |
| **MiniMax** | `export MINIMAX_API_KEY=...` | `MiniMax-M3` |
| **Vertex AI** | `export VERTEX_PROJECT_ID=my-project` | `claude-sonnet-4-6` |
| **Custom endpoint** | `OPENAI_API_KEY` + `OPENAI_BASE_URL` | `gpt-5.4-mini` |

Override the model for any provider: `export CALIBER_MODEL=<model-name>` or use `caliber config`.

Caliber uses a **two-tier model system** — lightweight tasks (classification, scoring) auto-use a faster model, while heavy tasks (generation, refinement) use the default. This keeps costs low and speed high.

Configuration is stored in `~/.caliber/config.json` with restricted permissions (`0600`). API keys are never written to project files.

MiniMax supports OpenAI-compatible and Anthropic-compatible requests in both service regions. Set `MINIMAX_BASE_URL` or choose a base URL with `caliber config`:

| Region | OpenAI-compatible base URL | Anthropic-compatible base URL | Documentation |
|---|---|---|---|
| Global | `https://api.minimax.io/v1` | `https://api.minimax.io/anthropic` | [MiniMax platform docs](https://platform.minimax.io/docs) |
| China | `https://api.minimaxi.com/v1` | `https://api.minimaxi.com/anthropic` | [MiniMax platform docs](https://platform.minimaxi.com/docs) |

<details>
<summary>Vertex AI advanced setup</summary>

```bash
# Custom region
export VERTEX_PROJECT_ID=my-gcp-project
export VERTEX_REGION=europe-west1

# Service account credentials (inline JSON)
export VERTEX_PROJECT_ID=my-gcp-project
export VERTEX_SA_CREDENTIALS='{"type":"service_account",...}'

# Service account credentials (file path)
export VERTEX_PROJECT_ID=my-gcp-project
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
```

</details>

<details>
<summary>Environment variables reference</summary>

| Variable | Purpose |
|---|---|
| `AI_GATEWAY_API_KEY` | Your Vercel AI Gateway key for Jev compaction (not a TypeSafe key; not provided by Caliber) |
| `TYPESAFE_API_KEY` | Your TypeSafe System One key for Jev compaction (not provided by Caliber) |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `OPENAI_API_KEY` | OpenAI API key |
| `OPENAI_BASE_URL` | Custom OpenAI-compatible endpoint |
| `MINIMAX_API_KEY` | MiniMax API key |
| `MINIMAX_BASE_URL` | MiniMax OpenAI-compatible or Anthropic-compatible base URL |
| `VERTEX_PROJECT_ID` | GCP project ID for Vertex AI |
| `VERTEX_REGION` | Vertex AI region (default: `us-east5`) |
| `VERTEX_SA_CREDENTIALS` | Service account JSON (inline) |
| `GOOGLE_APPLICATION_CREDENTIALS` | Service account JSON file path |
| `CALIBER_USE_CLAUDE_CLI` | Use Claude Code CLI (`1` to enable) |
| `CALIBER_USE_CURSOR_SEAT` | Use Cursor subscription (`1` to enable) |
| `CALIBER_MODEL` | Override model for any provider |
| `CALIBER_FAST_MODEL` | Override fast model for any provider |
| `CALIBER_MAX_LEARNINGS` | Cap for `CALIBER_LEARNINGS.md` bullets (default: `30`); evicted entries go to `.caliber/learnings-archive.md` |

</details>

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed guidelines.

```bash
git clone https://github.com/caliber-ai-org/ai-setup.git
cd caliber
npm install
npm run dev      # Watch mode
npm run test     # Run tests
npm run build    # Compile
```

Uses [conventional commits](https://www.conventionalcommits.org/) — `feat:` for features, `fix:` for bug fixes.

## Add a Caliber badge to your repo

After scoring your project, add a badge to your README:

![Caliber Score](https://img.shields.io/badge/caliber-94%2F100-brightgreen)

Copy this markdown and replace `94` with your actual score:

```
![Caliber Score](https://img.shields.io/badge/caliber-SCORE%2F100-COLOR)
```

Color guide: `brightgreen` (90+), `green` (70-89), `yellow` (40-69), `red` (<40).

## License

MIT
