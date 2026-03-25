import { resolveCaliber } from '../lib/resolve-caliber.js';

const BLOCK_START = '<!-- caliber:managed:pre-commit -->';
const BLOCK_END = '<!-- /caliber:managed:pre-commit -->';

const MANAGED_DOC_PATHS = 'CLAUDE.md .claude/ .cursor/ .github/copilot-instructions.md AGENTS.md CALIBER_LEARNINGS.md';

function getPreCommitBlock(): string {
  const bin = resolveCaliber();
  return `${BLOCK_START}
## Before Committing

Run \`${bin} refresh\` before creating git commits to keep docs in sync with code changes.
After it completes, stage any modified doc files before committing:

\`\`\`bash
${bin} refresh && git add ${MANAGED_DOC_PATHS} 2>/dev/null
\`\`\`
${BLOCK_END}`;
}

const CURSOR_RULE_FILENAME = 'caliber-pre-commit.mdc';

function getCursorRuleContent(): string {
  const bin = resolveCaliber();
  return `---
description: Run caliber refresh before git commits to keep docs in sync
alwaysApply: true
---
Before creating git commits, run \`${bin} refresh\` to update docs based on code changes,
then stage modified doc files (${MANAGED_DOC_PATHS}).
`;
}

export function hasPreCommitBlock(content: string): boolean {
  return content.includes(BLOCK_START);
}

export function appendPreCommitBlock(content: string): string {
  if (hasPreCommitBlock(content)) return content;
  const trimmed = content.trimEnd();
  return trimmed + '\n\n' + getPreCommitBlock() + '\n';
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

// ── Model configuration block ────────────────────────────────────────

const MODEL_BLOCK_START = '<!-- caliber:managed:model-config -->';
const MODEL_BLOCK_END = '<!-- /caliber:managed:model-config -->';

const MODEL_BLOCK = `${MODEL_BLOCK_START}
## Model Configuration

Recommended: \`claude-sonnet-4-6\` with high effort.
Set via: \`/model\` in Claude Code, or \`CALIBER_MODEL\` env var.
${MODEL_BLOCK_END}`;

export function hasModelBlock(content: string): boolean {
  return content.includes(MODEL_BLOCK_START);
}

export function appendModelBlock(content: string): string {
  if (hasModelBlock(content)) return content;
  const trimmed = content.trimEnd();
  return trimmed + '\n\n' + MODEL_BLOCK + '\n';
}
