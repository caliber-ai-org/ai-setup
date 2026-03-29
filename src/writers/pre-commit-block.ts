import { resolveCaliber } from '../lib/resolve-caliber.js';

export type ConfigPlatform = 'claude' | 'copilot' | 'codex';

const BLOCK_START = '<!-- caliber:managed:pre-commit -->';
const BLOCK_END = '<!-- /caliber:managed:pre-commit -->';

const MANAGED_DOC_PATHS = 'CLAUDE.md .claude/ .cursor/ .cursorrules .github/copilot-instructions.md .github/instructions/ AGENTS.md CALIBER_LEARNINGS.md';

function getCaliberNotFoundFallback(platform: ConfigPlatform, bin: string): string {
  switch (platform) {
    case 'claude':
      return `If \`${bin}\` is not found, tell the user: "This project uses Caliber for agent config sync. Run /setup-caliber to get set up."`;
    case 'codex':
      return `If \`${bin}\` is not found, read \`.agents/skills/setup-caliber/SKILL.md\` and follow its instructions to install Caliber.`;
    case 'copilot':
      return `If \`${bin}\` is not found, install it by running \`npm install -g @rely-ai/caliber\`, then run \`caliber hooks --install\` and \`caliber refresh\`.`;
  }
}

function getPreCommitBlock(platform: ConfigPlatform = 'claude'): string {
  const bin = resolveCaliber();
  return `${BLOCK_START}
## Before Committing

**IMPORTANT:** Before every git commit, you MUST ensure Caliber syncs agent configs with the latest code changes.

First, check if the pre-commit hook is already installed:
\`\`\`bash
grep -q "caliber" .git/hooks/pre-commit 2>/dev/null && echo "hook-active" || echo "no-hook"
\`\`\`

- If **hook-active**: the hook handles sync automatically — just commit normally. Tell the user: "Caliber will sync your agent configs automatically via the pre-commit hook."
- If **no-hook**: run Caliber manually before committing:
  1. Tell the user: "Caliber: Syncing agent configs with your latest changes..."
  2. Run: \`${bin} refresh && git add ${MANAGED_DOC_PATHS} 2>/dev/null\`
  3. After it completes, briefly tell the user what Caliber updated. Then proceed with the commit.

${getCaliberNotFoundFallback(platform, bin)}
${BLOCK_END}`;
}

const CURSOR_RULE_FILENAME = 'caliber-pre-commit.mdc';

function getCursorRuleContent(): string {
  const bin = resolveCaliber();
  return `---
description: Run Caliber sync before git commits to keep agent configs up to date
alwaysApply: true
---
Before every git commit, check if the Caliber pre-commit hook is installed:
Run: \`grep -q "caliber" .git/hooks/pre-commit 2>/dev/null && echo "hook-active" || echo "no-hook"\`

If hook-active: just commit normally — Caliber syncs automatically via the hook. Tell the user: "Caliber will sync your agent configs automatically."
If no-hook: run \`${bin} refresh && git add ${MANAGED_DOC_PATHS} 2>/dev/null\` before committing, and tell the user what was updated.

If \`${bin}\` is not found, read the setup-caliber skill from .cursor/skills/setup-caliber/SKILL.md and follow its instructions to install Caliber.
`;
}

export function hasPreCommitBlock(content: string): boolean {
  return content.includes(BLOCK_START);
}

export function appendPreCommitBlock(content: string, platform: ConfigPlatform = 'claude'): string {
  if (hasPreCommitBlock(content)) return content;
  const trimmed = content.trimEnd();
  return trimmed + '\n\n' + getPreCommitBlock(platform) + '\n';
}

export function getCursorPreCommitRule(): { filename: string; content: string } {
  return { filename: CURSOR_RULE_FILENAME, content: getCursorRuleContent() };
}

// ── Learnings reference block ────────────────────────────────────────

const LEARNINGS_BLOCK_START = '<!-- caliber:managed:learnings -->';
const LEARNINGS_BLOCK_END = '<!-- /caliber:managed:learnings -->';

const LEARNINGS_BLOCK = `${LEARNINGS_BLOCK_START}
## Session Learnings

Read \`CALIBER_LEARNINGS.md\` for patterns and anti-patterns learned from previous sessions.
These are auto-extracted from real tool usage — treat them as project-specific rules.
${LEARNINGS_BLOCK_END}`;

const CURSOR_LEARNINGS_FILENAME = 'caliber-learnings.mdc';

const CURSOR_LEARNINGS_CONTENT = `---
description: Reference session-learned patterns from CALIBER_LEARNINGS.md
alwaysApply: true
---
Read \`CALIBER_LEARNINGS.md\` for patterns and anti-patterns learned from previous sessions.
These are auto-extracted from real tool usage — treat them as project-specific rules.
`;

export function hasLearningsBlock(content: string): boolean {
  return content.includes(LEARNINGS_BLOCK_START);
}

export function appendLearningsBlock(content: string): string {
  if (hasLearningsBlock(content)) return content;
  const trimmed = content.trimEnd();
  return trimmed + '\n\n' + LEARNINGS_BLOCK + '\n';
}

export function getCursorLearningsRule(): { filename: string; content: string } {
  return { filename: CURSOR_LEARNINGS_FILENAME, content: CURSOR_LEARNINGS_CONTENT };
}

// ── Context sync block ────────────────────────────────────────────────

const SYNC_BLOCK_START = '<!-- caliber:managed:sync -->';
const SYNC_BLOCK_END = '<!-- /caliber:managed:sync -->';

function getSyncSetupInstruction(platform: ConfigPlatform, bin: string): string {
  switch (platform) {
    case 'claude':
      return `If the pre-commit hook is not set up, run \`/setup-caliber\` to configure everything automatically.`;
    case 'codex':
      return `If the pre-commit hook is not set up, read \`.agents/skills/setup-caliber/SKILL.md\` and follow the setup instructions.`;
    case 'copilot':
      return `If the pre-commit hook is not set up, install it by running:
\`\`\`bash
npm install -g @rely-ai/caliber
caliber hooks --install
caliber refresh
git add ${MANAGED_DOC_PATHS} 2>/dev/null
\`\`\``;
  }
}

function getSyncBlock(platform: ConfigPlatform = 'claude'): string {
  const bin = resolveCaliber();
  return `${SYNC_BLOCK_START}
## Context Sync

This project uses [Caliber](https://github.com/caliber-ai-org/ai-setup) to keep AI agent configs in sync across Claude Code, Cursor, Copilot, and Codex.
Configs update automatically before each commit via \`${bin} refresh\`.
${getSyncSetupInstruction(platform, bin)}
${SYNC_BLOCK_END}`;
}

export function hasSyncBlock(content: string): boolean {
  return content.includes(SYNC_BLOCK_START);
}

export function appendSyncBlock(content: string, platform: ConfigPlatform = 'claude'): string {
  if (hasSyncBlock(content)) return content;
  const trimmed = content.trimEnd();
  return trimmed + '\n\n' + getSyncBlock(platform) + '\n';
}

export function appendManagedBlocks(content: string, platform: ConfigPlatform = 'claude'): string {
  return appendSyncBlock(appendLearningsBlock(appendPreCommitBlock(content, platform)), platform);
}

// ── Cursor sync rule ─────────────────────────────────────────────────

const CURSOR_SYNC_FILENAME = 'caliber-sync.mdc';

function getCursorSyncContent(): string {
  const bin = resolveCaliber();
  return `---
description: This project uses Caliber for automatic AI agent context sync
alwaysApply: true
---
This project uses Caliber to keep AI agent configs (CLAUDE.md, Cursor rules, Copilot instructions)
in sync with the codebase automatically. Before each commit, run \`${bin} refresh\` to sync configs.
If \`${bin}\` is not found, read the setup-caliber skill from .cursor/skills/setup-caliber/SKILL.md and follow its instructions to install Caliber.
`;
}

export function getCursorSyncRule(): { filename: string; content: string } {
  return { filename: CURSOR_SYNC_FILENAME, content: getCursorSyncContent() };
}

// ── Cursor setup discovery rule ──────────────────────────────────────

const CURSOR_SETUP_FILENAME = 'caliber-setup.mdc';

function getCursorSetupContent(): string {
  return `---
description: Check if Caliber agent config sync is set up and offer installation on new sessions
alwaysApply: true
---
This project uses Caliber to keep AI agent configs in sync automatically.
At the start of each session, silently check if sync is active:

Run: \`grep -q "caliber" .git/hooks/pre-commit 2>/dev/null && echo "SYNC_ACTIVE" || echo "NO_SYNC"\`

If SYNC_ACTIVE: No action needed — Caliber syncs automatically on every commit.
If NO_SYNC: Tell the user: "This project uses Caliber for automatic agent config sync, but it's not set up on your machine yet. Want me to set it up? It takes about 30 seconds."

If the user agrees, read \`.cursor/skills/setup-caliber/SKILL.md\` and follow its instructions step by step.
`;
}

export function getCursorSetupRule(): { filename: string; content: string } {
  return { filename: CURSOR_SETUP_FILENAME, content: getCursorSetupContent() };
}
