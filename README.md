<p align="center">
  <img src="assets/social-preview.png" alt="Caliber — AI setup tailored for your codebase" width="640">
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@rely-ai/caliber"><img src="https://img.shields.io/npm/v/@rely-ai/caliber" alt="npm version"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/npm/l/@rely-ai/caliber" alt="license"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/node/v/@rely-ai/caliber" alt="node"></a>
</p>

<p align="center">
  <img src="assets/demo.gif" alt="Caliber demo" width="640">
</p>

---

Caliber analyzes your codebase — languages, frameworks, dependencies, architecture — and generates tailored, high-quality configs for **Claude Code**, **Cursor**, and **OpenAI Codex**. If configs already exist, it scores them, fixes what's stale, and keeps everything in sync as your code evolves.

```bash
npm install -g @rely-ai/caliber
caliber init
```

No API key required — works with your existing **Claude Code** or **Cursor** subscription. Or bring your own key (Anthropic, OpenAI, Vertex AI, any OpenAI-compatible endpoint).

## 💡 What Caliber Does

| Without Caliber | With Caliber |
|---|---|
| Hand-write CLAUDE.md, Cursor rules, AGENTS.md separately | One command generates all three, tuned to your actual codebase |
| Configs reference files that no longer exist | Deterministic scoring catches stale references and drift |
| New team members start with no AI context | `caliber init` gives any contributor a complete setup in seconds |
| Configs diverge across AI tools | Cross-platform parity — Claude, Cursor, and Codex stay consistent |
| No idea if your config is actually helping | Score your setup (A–F grade) and see exactly what to improve |

## ⚙️ How It Works

```
caliber init
│
├─ 1. 🔌 Connect      Choose your LLM provider — Claude Code seat, Cursor seat,
│                      or an API key (Anthropic, OpenAI, Vertex AI)
│
├─ 2. 🔍 Discover     Fingerprint your project: languages, frameworks, dependencies,
│                      file structure, and existing agent configs
│
├─ 3. 🛠️  Generate     Build optimized configs with parallel LLM calls
│                      (heavy model for docs, fast model for skills)
│
├─ 4. 👀 Review       See a diff of every proposed change — accept, refine
│                      via chat, or decline. All originals are backed up
│
└─ 5. 🧩 Skills       Search community registries and install relevant
                       skills for your tech stack
```

Already have a setup? If your existing config scores **95+**, Caliber skips full regeneration and applies targeted fixes to the specific checks that are failing.

### 📦 What It Generates

**Claude Code**
- `CLAUDE.md` — Project context, build/test commands, architecture, conventions
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

If these files already exist, Caliber audits them and suggests improvements — keeping what works, fixing what's stale, adding what's missing.

## ✨ Key Features

### 🌍 Any Codebase
TypeScript, Python, Go, Rust, Java, Ruby, Terraform, and more. Language and framework detection is fully LLM-driven — no hardcoded mappings. Caliber works on any project.

### 🔀 Any AI Tool
Target a single platform or all three at once:
```bash
caliber init --agent claude        # Claude Code only
caliber init --agent cursor        # Cursor only
caliber init --agent codex         # Codex only
caliber init --agent all           # All three
caliber init --agent claude,cursor # Comma-separated
```

### 💬 Chat-Based Refinement
Not happy with the generated output? During review, refine via natural language — describe what you want changed and Caliber iterates until you're satisfied.

### 🔗 MCP Server Discovery
Caliber detects the tools your project uses (databases, APIs, services) and auto-configures matching MCP servers for Claude Code and Cursor.

### 📊 Deterministic Scoring
`caliber score` evaluates your config quality without any LLM calls — purely by cross-referencing config files against your actual project filesystem.

```
  Agent Config Score    88 / 100    Grade A

  FILES & SETUP                                17 / 17
  QUALITY                                      21 / 23
  GROUNDING                                    20 / 20
  ACCURACY                                     10 / 15
  FRESHNESS & SAFETY                           10 / 10
  BONUS                                         5 / 5
```

<details>
<summary>Scoring breakdown</summary>

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

### 🔄 Auto-Refresh
Keep configs in sync with your codebase automatically:

| Hook | Trigger | What it does |
|---|---|---|
| **Claude Code** | End of each session | Runs `caliber refresh` and updates docs |
| **Git pre-commit** | Before each commit | Refreshes docs and stages updated files |

```bash
caliber hooks --install    # Enable all hooks
caliber hooks --remove     # Disable all hooks
```

The `refresh` command analyzes your git diff (committed, staged, and unstaged changes) and updates config files to reflect what changed. Works across multiple repos when run from a parent directory.

### 🛡️ Fully Reversible
Every change Caliber makes can be undone:
- **Automatic backups** — originals saved to `.caliber/backups/` before every write
- **Score regression guard** — if a regeneration produces a lower score, changes are auto-reverted
- **Full undo** — `caliber undo` restores everything to its previous state
- **Dry run** — preview changes with `--dry-run` before applying

## 📋 Commands

| Command | Description |
|---|---|
| `caliber init` | Full setup wizard — analyze, generate, review, install skills |
| `caliber score` | Score config quality (deterministic, no LLM) |
| `caliber regenerate` | Re-analyze and regenerate configs (aliases: `regen`, `re`) |
| `caliber refresh` | Update docs based on recent code changes |
| `caliber skills` | Discover and install community skills |
| `caliber hooks` | Manage auto-refresh hooks |
| `caliber config` | Configure LLM provider, API key, and model |
| `caliber status` | Show current setup status |
| `caliber undo` | Revert all changes made by Caliber |

## 🔌 LLM Providers

No API key? No problem. Caliber works with your existing AI tool subscription:

| Provider | Setup | Default Model |
|---|---|---|
| **Claude Code** (your seat) | `caliber config` → Claude Code | Inherited from Claude Code |
| **Cursor** (your seat) | `caliber config` → Cursor | Inherited from Cursor |
| **Anthropic** | `export ANTHROPIC_API_KEY=sk-ant-...` | `claude-sonnet-4-6` |
| **OpenAI** | `export OPENAI_API_KEY=sk-...` | `gpt-4.1` |
| **Vertex AI** | `export VERTEX_PROJECT_ID=my-project` | `claude-sonnet-4-6` |
| **Custom endpoint** | `OPENAI_API_KEY` + `OPENAI_BASE_URL` | `gpt-4.1` |

Override the model for any provider: `export CALIBER_MODEL=<model-name>` or use `caliber config`.

Caliber uses a **two-tier model system** — lightweight tasks (classification, scoring) auto-use a faster model, while heavy tasks (generation, refinement) use the default. This keeps costs low and speed high.

Configuration is stored in `~/.caliber/config.json` with restricted permissions (`0600`). API keys are never written to project files.

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
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `OPENAI_API_KEY` | OpenAI API key |
| `OPENAI_BASE_URL` | Custom OpenAI-compatible endpoint |
| `VERTEX_PROJECT_ID` | GCP project ID for Vertex AI |
| `VERTEX_REGION` | Vertex AI region (default: `us-east5`) |
| `VERTEX_SA_CREDENTIALS` | Service account JSON (inline) |
| `GOOGLE_APPLICATION_CREDENTIALS` | Service account JSON file path |
| `CALIBER_USE_CLAUDE_CLI` | Use Claude Code CLI (`1` to enable) |
| `CALIBER_USE_CURSOR_SEAT` | Use Cursor subscription (`1` to enable) |
| `CALIBER_MODEL` | Override model for any provider |
| `CALIBER_FAST_MODEL` | Override fast model for any provider |

</details>

## 📋 Requirements

- **Node.js** >= 20
- **One LLM provider:** your **Claude Code** or **Cursor** subscription (no API key), or an API key for Anthropic / OpenAI / Vertex AI

## 🤝 Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed guidelines.

```bash
git clone https://github.com/rely-ai-org/caliber.git
cd caliber
npm install
npm run dev      # Watch mode
npm run test     # Run tests
npm run build    # Compile
```

Uses [conventional commits](https://www.conventionalcommits.org/) — `feat:` for features, `fix:` for bug fixes.

## 📄 License

MIT
