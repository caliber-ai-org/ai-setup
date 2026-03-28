import fs from 'fs';
import path from 'path';
import { resolveCaliber } from './resolve-caliber.js';

export function buildSkillContent(skill: { name: string; description: string; content: string }): string {
  const frontmatter = `---\nname: ${skill.name}\ndescription: ${skill.description}\n---\n\n`;
  return frontmatter + skill.content;
}

function getFindSkillsContent(): string {
  const bin = resolveCaliber();
  return `# Find Skills

Search the public skill registry for community-contributed skills
relevant to the user's current task and install them into this project.

## Instructions

1. Identify the key technologies, frameworks, or task types from the
   user's request that might have community skills available
2. Ask the user: "Would you like me to search for community skills
   for [identified technologies]?"
3. If the user agrees, run:
   \`\`\`bash
   ${bin} skills --query "<relevant terms>"
   \`\`\`
   This outputs the top 5 matching skills with scores and descriptions.
4. Present the results to the user and ask which ones to install
5. Install the selected skills:
   \`\`\`bash
   ${bin} skills --install <slug1>,<slug2>
   \`\`\`
6. Read the installed SKILL.md files to load them into your current
   context so you can use them immediately in this session
7. Summarize what was installed and continue with the user's task

## Examples

User: "let's build a web app using React"
-> "I notice you want to work with React. Would you like me to search
   for community skills that could help with React development?"
-> If yes: run \`${bin} skills --query "react frontend"\`
-> Show the user the results, ask which to install
-> Run \`${bin} skills --install <selected-slugs>\`
-> Read the installed files and continue

User: "help me set up Docker for this project"
-> "Would you like me to search for Docker-related skills?"
-> If yes: run \`${bin} skills --query "docker deployment"\`

User: "I need to write tests for this Python ML pipeline"
-> "Would you like me to find skills for Python ML testing?"
-> If yes: run \`${bin} skills --query "python machine-learning testing"\`

## When NOT to trigger

- The user is working within an already well-configured area
- You already suggested skills for this technology in this session
- The user is in the middle of urgent debugging or time-sensitive work
- The technology is too generic (e.g. just "code" or "programming")
`;
}

function getSaveLearningContent(): string {
  const bin = resolveCaliber();
  return `# Save Learning

Save a user's instruction or preference as a persistent learning that
will be applied in all future sessions on this project.

## Instructions

1. Detect when the user gives an instruction to remember, such as:
   - "remember this", "save this", "always do X", "never do Y"
   - "from now on", "going forward", "in this project we..."
   - Any stated convention, preference, or rule
2. Refine the instruction into a clean, actionable learning bullet with
   an appropriate type prefix:
   - \`**[convention]**\` — coding style, workflow, git conventions
   - \`**[pattern]**\` — reusable code patterns
   - \`**[anti-pattern]**\` — things to avoid
   - \`**[preference]**\` — personal/team preferences
   - \`**[context]**\` — project-specific context
3. Show the refined learning to the user and ask for confirmation
4. If confirmed, run:
   \`\`\`bash
   ${bin} learn add "<refined learning>"
   \`\`\`
   For personal preferences (not project-level), add \`--personal\`:
   \`\`\`bash
   ${bin} learn add --personal "<refined learning>"
   \`\`\`
5. Stage the learnings file for the next commit:
   \`\`\`bash
   git add CALIBER_LEARNINGS.md
   \`\`\`

## Examples

User: "when developing features, push to next branch not master, remember it"
-> Refine: \`**[convention]** Push feature commits to the \\\`next\\\` branch, not \\\`master\\\`\`
-> "I'll save this as a project learning:
    **[convention]** Push feature commits to the \\\`next\\\` branch, not \\\`master\\\`
    Save for future sessions?"
-> If yes: run \`${bin} learn add "**[convention]** Push feature commits to the next branch, not master"\`
-> Run \`git add CALIBER_LEARNINGS.md\`

User: "always use bun instead of npm"
-> Refine: \`**[preference]** Use \\\`bun\\\` instead of \\\`npm\\\` for package management\`
-> Confirm and save

User: "never use any in TypeScript, use unknown instead"
-> Refine: \`**[convention]** Use \\\`unknown\\\` instead of \\\`any\\\` in TypeScript\`
-> Confirm and save

## When NOT to trigger

- The user is giving a one-time instruction for the current task only
- The instruction is too vague to be actionable
- The user explicitly says "just for now" or "only this time"
`;
}

export const FIND_SKILLS_SKILL = {
  name: 'find-skills',
  description:
    "Discovers and installs community skills from the public registry. " +
    "Use when the user mentions a technology, framework, or task that could benefit from specialized skills not yet installed, " +
    "asks 'how do I do X', 'find a skill for X', or starts work in a new technology area. " +
    "Proactively suggest when the user's task involves tools or frameworks without existing skills.",
  get content() { return getFindSkillsContent(); },
};

export const SAVE_LEARNING_SKILL = {
  name: 'save-learning',
  description:
    "Saves user instructions as persistent learnings for future sessions. " +
    "Use when the user says 'remember this', 'always do X', 'from now on', 'never do Y', " +
    "or gives any instruction they want persisted across sessions. " +
    "Proactively suggest when the user states a preference, convention, or rule they clearly want followed in the future.",
  get content() { return getSaveLearningContent(); },
};

function getSetupCaliberContent(): string {
  return `# Setup Caliber

Dynamic onboarding for Caliber — automatic AI agent context sync.
Run all diagnostic steps below on every invocation to determine what's already
set up and what still needs to be done.

## Instructions

Run these checks in order. For each step, check the current state first,
then only act if something is missing.

### Step 1: Check if Caliber is installed

\`\`\`bash
command -v caliber >/dev/null 2>&1 && caliber --version || echo "NOT_INSTALLED"
\`\`\`

- If a version prints → Caliber is installed. Move to Step 2.
- If NOT_INSTALLED → Tell the user: "Caliber isn't installed yet. I'll install it now."
  Then run:
  \`\`\`bash
  npm install -g @rely-ai/caliber
  \`\`\`
  If npm fails (permissions, no Node, etc.), try:
  \`\`\`bash
  npx @rely-ai/caliber --version
  \`\`\`
  If npx works, use \`npx @rely-ai/caliber\` as the command prefix for all subsequent steps.
  If both fail, tell the user: "Caliber requires Node.js >= 20. Install Node first, then run /setup-caliber again."

### Step 2: Check if pre-commit hook is installed

\`\`\`bash
grep -q "caliber" .git/hooks/pre-commit 2>/dev/null && echo "HOOK_ACTIVE" || echo "NO_HOOK"
\`\`\`

- If HOOK_ACTIVE → Tell the user: "Pre-commit hook is active — configs sync on every commit." Move to Step 3.
- If NO_HOOK → Tell the user: "I'll install the pre-commit hook so your agent configs sync automatically on every commit."
  \`\`\`bash
  caliber hooks --install
  \`\`\`

### Step 3: Check if agent configs exist

\`\`\`bash
echo "CLAUDE_MD=$([ -f CLAUDE.md ] && echo exists || echo missing)"
echo "CURSOR_RULES=$([ -d .cursor/rules ] && ls .cursor/rules/*.mdc 2>/dev/null | wc -l | tr -d ' ' || echo 0)"
echo "AGENTS_MD=$([ -f AGENTS.md ] && echo exists || echo missing)"
\`\`\`

- If configs exist → Tell the user which configs are present. Move to Step 4.
- If configs are missing → Tell the user: "No agent configs found. I'll generate them now."
  \`\`\`bash
  caliber init --auto-approve
  \`\`\`
  This generates CLAUDE.md, Cursor rules, AGENTS.md, and skills for all detected agents.

### Step 4: Check if configs are fresh

\`\`\`bash
caliber score --json --quiet 2>/dev/null | head -1
\`\`\`

- If score is 80+ → Tell the user: "Your configs are in good shape (score: X/100)."
- If score is below 80 → Tell the user: "Your configs could be improved (score: X/100). Want me to run a refresh?"
  If yes:
  \`\`\`bash
  caliber refresh
  \`\`\`

### Step 5: Ask about team setup

Ask the user: "Are you setting up for yourself only, or for your team too?"

- If **solo** → Tell the user the summary (see below) and stop.
- If **team** → Check if the GitHub Action already exists:
  \`\`\`bash
  [ -f .github/workflows/caliber-sync.yml ] && echo "ACTION_EXISTS" || echo "NO_ACTION"
  \`\`\`
  - If ACTION_EXISTS → Tell the user: "GitHub Action is already configured."
  - If NO_ACTION → Tell the user: "I'll create a GitHub Action that syncs configs nightly and on every PR."
    Write this file to \`.github/workflows/caliber-sync.yml\`:
    \`\`\`yaml
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
              github-token: \${{ secrets.GITHUB_TOKEN }}
            env:
              ANTHROPIC_API_KEY: \${{ secrets.ANTHROPIC_API_KEY }}
    \`\`\`
    Tell the user: "Add your ANTHROPIC_API_KEY to repo secrets (Settings → Secrets → Actions), then commit and push."

### Summary

After completing all steps, show the user what's configured:

\`\`\`
Caliber Setup Complete:
✓ Caliber installed (vX.X.X)
✓ Pre-commit hook — configs sync on every commit
✓ Agent configs — CLAUDE.md, Cursor rules, AGENTS.md
✓ Config score: X/100
✓ GitHub Action — nightly sync + PR checks (team only)

From now on, every commit keeps all your agent configs in sync automatically.
\`\`\`

## When to trigger

- When a developer first opens this project
- When the user asks about keeping agent configs up to date
- When the user asks "how do I set up Caliber" or "what is Caliber"
- When the user sees a message saying "Run /setup-caliber to get set up"

## When NOT to trigger

- The user is in the middle of time-sensitive work
`;
}

export const SETUP_CALIBER_SKILL = {
  name: 'setup-caliber',
  description:
    "Sets up Caliber for automatic AI agent context sync. " +
    "Installs pre-commit hooks so CLAUDE.md, Cursor rules, and Copilot instructions " +
    "update automatically on every commit. Use when Caliber hooks are not yet installed " +
    "or when the user asks about keeping agent configs in sync.",
  get content() { return getSetupCaliberContent(); },
};

export const BUILTIN_SKILLS = [FIND_SKILLS_SKILL, SAVE_LEARNING_SKILL, SETUP_CALIBER_SKILL];

// Platform root dirs that indicate the platform is configured
const PLATFORM_CONFIGS: Array<{ platformDir: string; skillsDir: string }> = [
  { platformDir: '.claude', skillsDir: path.join('.claude', 'skills') },
  { platformDir: '.cursor', skillsDir: path.join('.cursor', 'skills') },
  { platformDir: '.agents', skillsDir: path.join('.agents', 'skills') },
];

export const BUILTIN_SKILL_NAMES = new Set(BUILTIN_SKILLS.map(s => s.name));

export function ensureBuiltinSkills(): string[] {
  const written: string[] = [];

  for (const { platformDir, skillsDir } of PLATFORM_CONFIGS) {
    if (!fs.existsSync(platformDir)) continue;

    for (const skill of BUILTIN_SKILLS) {
      const skillPath = path.join(skillsDir, skill.name, 'SKILL.md');
      // Always overwrite — builtin skills are managed by Caliber, not the LLM

      fs.mkdirSync(path.dirname(skillPath), { recursive: true });
      fs.writeFileSync(skillPath, buildSkillContent(skill));
      written.push(skillPath);
    }
  }

  return written;
}
