const BLOCK_START = '<!-- caliber:managed:pre-commit -->';
const BLOCK_END = '<!-- /caliber:managed:pre-commit -->';

const MANAGED_DOC_PATHS = 'CLAUDE.md .claude/ .cursor/ .github/copilot-instructions.md AGENTS.md CALIBER_LEARNINGS.md';

const PRE_COMMIT_BLOCK = `${BLOCK_START}
## Before Committing

Run \`caliber refresh\` before creating git commits to keep docs in sync with code changes.
After it completes, stage any modified doc files before committing:

\`\`\`bash
caliber refresh && git add ${MANAGED_DOC_PATHS} 2>/dev/null
\`\`\`
${BLOCK_END}`;

const CURSOR_RULE_FILENAME = 'caliber-pre-commit.mdc';

const CURSOR_RULE_CONTENT = `---
description: Run caliber refresh before git commits to keep docs in sync
alwaysApply: true
---
Before creating git commits, run \`caliber refresh\` to update docs based on code changes,
then stage modified doc files (${MANAGED_DOC_PATHS}).
`;

export function hasPreCommitBlock(content: string): boolean {
  return content.includes(BLOCK_START);
}

export function appendPreCommitBlock(content: string): string {
  if (hasPreCommitBlock(content)) return content;
  const trimmed = content.trimEnd();
  return trimmed + '\n\n' + PRE_COMMIT_BLOCK + '\n';
}

export function getCursorPreCommitRule(): { filename: string; content: string } {
  return { filename: CURSOR_RULE_FILENAME, content: CURSOR_RULE_CONTENT };
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

// ── Skill listing block ────────────────────────────────────────────────

const SKILLS_HEADING = '## Available Skills';

function truncateDescription(description: string): string {
  const match = description.match(/^[^.]*\.\s/);
  if (match) return match[0].trim();
  if (description.length > 80) return description.slice(0, 77) + '...';
  return description;
}

export function appendSkillListing(
  content: string,
  skills: Array<{ name: string; description: string }>,
  pathPrefix: string,
): string {
  if (skills.length === 0) return content;
  if (content.includes(SKILLS_HEADING)) return content;
  const lines = [
    '',
    SKILLS_HEADING,
    '',
    'The following skill files are available in this repo. Read them when working on related areas:',
    '',
  ];
  for (const skill of skills) {
    const shortDesc = truncateDescription(skill.description);
    lines.push(`- \`${pathPrefix}${skill.name}/SKILL.md\` — ${shortDesc}`);
  }
  return content.trimEnd() + '\n' + lines.join('\n') + '\n';
}
