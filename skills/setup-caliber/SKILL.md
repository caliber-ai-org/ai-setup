---
name: setup-caliber
description: Sets up Caliber for automatic AI agent context sync. Installs pre-commit hooks so CLAUDE.md, Cursor rules, and Copilot instructions update automatically on every commit. Use when Caliber hooks are not yet installed or when the user asks about keeping agent configs in sync.
---

# Setup Caliber

Dynamic onboarding for Caliber — automatic AI agent context sync.
Run all diagnostic steps below on every invocation to determine what's already
set up and what still needs to be done.

## Instructions

Run these checks in order. For each step, check the current state first,
then only act if something is missing.

### Step 1: Check if Caliber is installed

```bash
command -v caliber >/dev/null 2>&1 && caliber --version || echo "NOT_INSTALLED"
```

- If a version prints → Caliber is installed globally. Set `CALIBER="caliber"` and move to Step 2.
- If NOT_INSTALLED → Install it globally (faster for daily use since the pre-commit hook runs on every commit):
  ```bash
  npm install -g @rely-ai/caliber
  ```
  Set `CALIBER="caliber"`.

  If npm fails (permissions, no sudo, etc.), fall back to npx:
  ```bash
  npx @rely-ai/caliber --version 2>/dev/null || echo "NO_NODE"
  ```
  - If npx works → Set `CALIBER="npx @rely-ai/caliber"`. This works but adds ~500ms per invocation.
  - If NO_NODE → Tell the user: "Caliber requires Node.js >= 20. Install Node first, then run /setup-caliber again." Stop here.

### Step 2: Check if pre-commit hook is installed

```bash
grep -q "caliber" .git/hooks/pre-commit 2>/dev/null && echo "HOOK_ACTIVE" || echo "NO_HOOK"
```

- If HOOK_ACTIVE → Tell the user: "Pre-commit hook is active — configs sync on every commit." Move to Step 3.
- If NO_HOOK → Tell the user: "I'll install the pre-commit hook so your agent configs sync automatically on every commit."
  ```bash
  $CALIBER hooks --install
  ```

### Step 3: Detect agents and check if configs exist

First, detect which coding agents are configured in this project:
```bash
AGENTS=""
[ -d .claude ] && AGENTS="claude"
[ -d .cursor ] && AGENTS="${AGENTS:+$AGENTS,}cursor"
[ -d .agents ] || [ -f AGENTS.md ] && AGENTS="${AGENTS:+$AGENTS,}codex"
[ -f .github/copilot-instructions.md ] && AGENTS="${AGENTS:+$AGENTS,}github-copilot"
echo "DETECTED_AGENTS=${AGENTS:-none}"
```

If no agents are detected, ask the user which coding agents they use (Claude Code, Cursor, Codex, GitHub Copilot).
Build the agent list from their answer as a comma-separated string (e.g. "claude,cursor").

Then check if agent configs exist:
```bash
echo "CLAUDE_MD=$([ -f CLAUDE.md ] && echo exists || echo missing)"
echo "CURSOR_RULES=$([ -d .cursor/rules ] && ls .cursor/rules/*.mdc 2>/dev/null | wc -l | tr -d ' ' || echo 0)"
echo "AGENTS_MD=$([ -f AGENTS.md ] && echo exists || echo missing)"
echo "COPILOT=$([ -f .github/copilot-instructions.md ] && echo exists || echo missing)"
```

- If configs exist for the detected agents → Tell the user which configs are present. Move to Step 4.
- If configs are missing → Tell the user: "No agent configs found. I'll generate them now."
  Use the detected or user-selected agent list:
  ```bash
  $CALIBER init --auto-approve --agent <comma-separated-agents>
  ```
  For example: `$CALIBER init --auto-approve --agent claude,cursor`
  This generates CLAUDE.md, Cursor rules, AGENTS.md, skills, and sync infrastructure for the specified agents.

### Step 4: Check if configs are fresh

```bash
$CALIBER score --json --quiet 2>/dev/null | head -1
```

- If score is 80+ → Tell the user: "Your configs are in good shape (score: X/100)."
- If score is below 80 → Tell the user: "Your configs could be improved (score: X/100). Want me to run a refresh?"
  If yes:
  ```bash
  $CALIBER refresh
  ```

### Step 5: Ask about team setup

Ask the user: "Are you setting up for yourself only, or for your team too?"

- If **solo** → Continue with solo setup:

  Check if session learning is enabled:
  ```bash
  $CALIBER learn status 2>/dev/null | head -3
  ```
  - If learning is already enabled → note it in the summary.
  - If not enabled → ask the user: "Caliber can learn from your coding sessions — when you correct a mistake or fix a pattern, it remembers for next time. Enable session learning?"
    If yes:
    ```bash
    $CALIBER learn install
    ```

  Then tell the user:
  "You're all set! Here's what happens next:
  - Every time you commit, Caliber syncs your agent configs automatically
  - Your CLAUDE.md, Cursor rules, and AGENTS.md stay current with your code
  - Run `$CALIBER skills` anytime to discover community skills for your stack"

  Then show the summary (see below) and stop.

- If **team** → Check if the GitHub Action already exists:
  ```bash
  [ -f .github/workflows/caliber-sync.yml ] && echo "ACTION_EXISTS" || echo "NO_ACTION"
  ```
  - If ACTION_EXISTS → Tell the user: "GitHub Action is already configured."
  - If NO_ACTION → Tell the user: "I'll create a GitHub Action that syncs configs nightly and on every PR."
    Write this file to `.github/workflows/caliber-sync.yml`:
    ```yaml
    name: Caliber Sync
    on:
      schedule:
        - cron: '0 3 * * 1-5'
      pull_request:
        types: [opened, synchronize]
      workflow_dispatch:
    jobs:
      sync:
        runs-on: ubuntu-latest
        steps:
          - uses: actions/checkout@v4
          - uses: caliber-ai-org/ai-setup@v1
            with:
              mode: sync
              auto-refresh: true
              comment: true
              github-token: ${{ secrets.GITHUB_TOKEN }}
            env:
              ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
    ```
    Now determine which LLM provider the team uses. Check the local Caliber config:
    ```bash
    $CALIBER config --show 2>/dev/null || echo "NO_CONFIG"
    ```

    Based on the provider, the GitHub Action needs the corresponding secret:
    - **anthropic** → `ANTHROPIC_API_KEY`
    - **openai** → `OPENAI_API_KEY`
    - **vertex** → `VERTEX_PROJECT_ID` and `GOOGLE_APPLICATION_CREDENTIALS` (service account JSON)

    Update the workflow env block to match the provider. For example, if using OpenAI:
    ```yaml
            env:
              OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
    ```

    Then check if the `gh` CLI is available to set the secret:
    ```bash
    command -v gh >/dev/null 2>&1 && echo "GH_AVAILABLE" || echo "NO_GH"
    ```

    - If GH_AVAILABLE → Ask the user for their API key and set it:
      ```bash
      gh secret set ANTHROPIC_API_KEY
      ```
      (This prompts for the value securely via stdin)
    - If NO_GH → Tell the user exactly what to do:
      "Go to your repo on GitHub → Settings → Secrets and variables → Actions → New repository secret.
       Name: ANTHROPIC_API_KEY (or OPENAI_API_KEY depending on provider)
       Value: your API key"

    Finally, offer to commit and push the workflow file:
    ```bash
    git add .github/workflows/caliber-sync.yml
    git commit -m "feat: add Caliber sync GitHub Action"
    git push
    ```

### Summary

After completing all steps, show the user what's configured:

```
Caliber Setup Complete:
✓ Caliber installed (vX.X.X)
✓ Pre-commit hook — configs sync on every commit
✓ Agent configs — CLAUDE.md, Cursor rules, AGENTS.md
✓ Config score: X/100
✓ GitHub Action — nightly sync + PR checks (team only)

From now on, every commit keeps all your agent configs in sync automatically.
```

## When to trigger

- When a developer first opens this project
- When the user asks about keeping agent configs up to date
- When the user asks "how do I set up Caliber" or "what is Caliber"
- When the user sees a message saying "Run /setup-caliber to get set up"

## When NOT to trigger

- The user is in the middle of time-sensitive work
