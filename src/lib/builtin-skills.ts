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
  const bin = resolveCaliber();
  return `# Setup Caliber

Set up Caliber for automatic AI agent context sync on this project.
Caliber keeps your CLAUDE.md, Cursor rules, Copilot instructions, and Codex configs
in sync with your codebase — automatically on every commit.

## Instructions

1. Check if Caliber is already set up locally:
   \`\`\`bash
   grep -q "caliber" .git/hooks/pre-commit 2>/dev/null && echo "hook-active" || echo "no-hook"
   \`\`\`

2. If **hook-active**, tell the user: "Caliber is already set up on this repo.
   Your agent configs update automatically on every commit." Then stop.

3. If **no-hook**, ask the user: "Are you setting up Caliber for yourself (solo)
   or for your team?"

### Solo Setup

a. Tell the user: "I'll set up Caliber to sync your agent configs automatically
   on every commit."
b. Install the pre-commit hook:
   \`\`\`bash
   ${bin} hooks --install
   \`\`\`
c. Run a refresh to make sure configs are current:
   \`\`\`bash
   ${bin} refresh
   \`\`\`
d. Tell the user what happened and that configs will auto-sync on every commit.

### Team Setup

a. Tell the user: "I'll set up Caliber for your team — local hooks for you,
   plus a GitHub Action for automatic sync across the team."
b. Install the local pre-commit hook:
   \`\`\`bash
   ${bin} hooks --install
   \`\`\`
c. Run a refresh:
   \`\`\`bash
   ${bin} refresh
   \`\`\`
d. Create the GitHub Action workflow for nightly sync. Write this file to
   \`.github/workflows/caliber-sync.yml\`:
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
e. Tell the user: "Created the GitHub Action workflow. Add your ANTHROPIC_API_KEY
   to your repo secrets (Settings → Secrets → Actions), then commit and push this
   workflow file. From now on, every PR gets a Caliber sync check and configs
   refresh nightly."
f. Offer to commit the workflow file and the updated configs.

### If \`${bin}\` is not found

Install it first:
\`\`\`bash
npm install -g @rely-ai/caliber
\`\`\`
Or use npx (no install needed):
\`\`\`bash
npx @rely-ai/caliber hooks --install
\`\`\`

## When to trigger

- When a developer first opens this project and Caliber hooks are not installed
- When the user asks about keeping agent configs up to date
- When the user asks "how do I set up Caliber" or "what is Caliber"

## When NOT to trigger

- Hooks are already installed and working
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
