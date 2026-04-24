import { llmCall, parseJsonResponse } from '../llm/index.js';
import { getFastModel } from '../llm/config.js';
import { REFRESH_SYSTEM_PROMPT } from './prompts.js';
import type { SourceSummary } from '../fingerprint/sources.js';
import { formatSourcesForPrompt } from '../fingerprint/sources.js';
import { stripManagedBlocks } from '../writers/pre-commit-block.js';
import { CALIBER_MANAGED_PREFIX } from '../fingerprint/existing-config.js';

// Budget for existing doc content (CLAUDE.md, skills, rules, etc.) passed to the LLM.
// Skills can reach hundreds of KB in large projects; without a cap the combined prompt
// exceeds Claude's input token limit and the CLI exits with "prompt is too long".
const MAX_EXISTING_DOCS_CHARS = 60_000;
const MIN_CHARS_PER_ENTRY = 2_000;

function truncateAtLineEnd(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const cut = text.lastIndexOf('\n', maxChars);
  return (cut === -1 ? text.slice(0, maxChars) : text.slice(0, cut)) + '\n...[truncated]';
}

interface RefreshDiff {
  committed: string;
  staged: string;
  unstaged: string;
  changedFiles: string[];
  summary: string;
}

interface ExistingDocs {
  agentsMd?: string;
  claudeMd?: string;
  readmeMd?: string;
  claudeSettings?: Record<string, unknown>;
  claudeSkills?: Array<{ filename: string; content: string }>;
  claudeRules?: Array<{ filename: string; content: string }>;
  cursorrules?: string;
  cursorRules?: Array<{ filename: string; content: string }>;
  copilotInstructions?: string;
  copilotInstructionFiles?: Array<{ filename: string; content: string }>;
  includableDocs?: string[];
}

interface ProjectContext {
  languages?: string[];
  frameworks?: string[];
  packageName?: string;
  fileTree?: string[];
}

interface FileChangeSummary {
  file: string;
  description: string;
}

interface RefreshResponse {
  updatedDocs: {
    agentsMd?: string | null;
    claudeMd?: string | null;
    claudeRules?: Array<{ filename: string; content: string }> | null;
    readmeMd?: string | null;
    cursorrules?: string | null;
    cursorRules?: Array<{ filename: string; content: string }> | null;
    claudeSkills?: Array<{ filename: string; content: string }> | null;
    copilotInstructions?: string | null;
    copilotInstructionFiles?: Array<{ filename: string; content: string }> | null;
  };
  changesSummary: string;
  fileChanges?: FileChangeSummary[];
  docsUpdated: string[];
}

export async function refreshDocs(
  diff: RefreshDiff,
  existingDocs: ExistingDocs,
  projectContext: ProjectContext,
  learnedSection?: string | null,
  sources?: SourceSummary[],
  scope?: string,
): Promise<RefreshResponse> {
  const prompt = buildRefreshPrompt(
    diff,
    existingDocs,
    projectContext,
    learnedSection,
    sources,
    scope,
  );
  const fastModel = getFastModel();

  const raw = await llmCall({
    system: REFRESH_SYSTEM_PROMPT,
    prompt,
    maxTokens: 16384,
    ...(fastModel ? { model: fastModel } : {}),
  });

  return parseJsonResponse<RefreshResponse>(raw);
}

function buildRefreshPrompt(
  diff: RefreshDiff,
  existingDocs: ExistingDocs,
  projectContext: ProjectContext,
  learnedSection?: string | null,
  sources?: SourceSummary[],
  scope?: string,
): string {
  const parts: string[] = [];

  if (scope) {
    parts.push(`You are updating docs for the \`${scope}\` subdirectory of a monorepo.`);
    parts.push('Only include changes relevant to files under this directory.');
    parts.push('The changed files list has been filtered to this directory already.');
    parts.push('Ignore diff content for files outside this directory.\n');
  }

  parts.push('Update documentation based on the following code changes.\n');

  if (projectContext.packageName) parts.push(`Project: ${projectContext.packageName}`);
  if (projectContext.languages?.length)
    parts.push(`Languages: ${projectContext.languages.join(', ')}`);
  if (projectContext.frameworks?.length)
    parts.push(`Frameworks: ${projectContext.frameworks.join(', ')}`);

  if (projectContext.fileTree?.length) {
    const tree = projectContext.fileTree.slice(0, 200);
    parts.push(
      `\nFile tree (${tree.length}/${projectContext.fileTree.length} — only reference paths from this list):\n${tree.join('\n')}`,
    );
  }

  parts.push(`\nChanged files: ${diff.changedFiles.join(', ')}`);
  parts.push(`Summary: ${diff.summary}`);

  if (diff.committed) {
    parts.push('\n--- Committed Changes ---');
    parts.push(diff.committed);
  }
  if (diff.staged) {
    parts.push('\n--- Staged Changes ---');
    parts.push(diff.staged);
  }
  if (diff.unstaged) {
    parts.push('\n--- Unstaged Changes ---');
    parts.push(diff.unstaged);
  }

  parts.push('\n--- Current Documentation ---');

  // Collect existing doc entries as {header, content} pairs so we can apply a
  // combined size budget before joining — prevents "prompt is too long" errors
  // in projects with many large skills or rules files.
  type DocEntry = { header: string; content: string };
  const docEntries: DocEntry[] = [];

  if (existingDocs.agentsMd)
    docEntries.push({
      header: '\n[AGENTS.md]',
      content: stripManagedBlocks(existingDocs.agentsMd),
    });
  if (existingDocs.claudeMd)
    docEntries.push({
      header: '\n[CLAUDE.md]',
      content: stripManagedBlocks(existingDocs.claudeMd),
    });
  if (existingDocs.readmeMd)
    docEntries.push({ header: '\n[README.md]', content: existingDocs.readmeMd });
  if (existingDocs.cursorrules)
    docEntries.push({ header: '\n[.cursorrules]', content: existingDocs.cursorrules });
  if (existingDocs.claudeSkills?.length) {
    for (const skill of existingDocs.claudeSkills)
      docEntries.push({ header: `\n[.claude/skills/${skill.filename}]`, content: skill.content });
  }
  if (existingDocs.claudeRules?.length) {
    for (const rule of existingDocs.claudeRules) {
      if (rule.filename.startsWith(CALIBER_MANAGED_PREFIX)) continue;
      docEntries.push({ header: `\n[.claude/rules/${rule.filename}]`, content: rule.content });
    }
  }
  if (existingDocs.cursorRules?.length) {
    for (const rule of existingDocs.cursorRules) {
      if (rule.filename.startsWith(CALIBER_MANAGED_PREFIX)) continue;
      docEntries.push({ header: `\n[.cursor/rules/${rule.filename}]`, content: rule.content });
    }
  }
  if (existingDocs.copilotInstructions)
    docEntries.push({
      header: '\n[.github/copilot-instructions.md]',
      content: stripManagedBlocks(existingDocs.copilotInstructions),
    });
  if (existingDocs.copilotInstructionFiles?.length) {
    for (const file of existingDocs.copilotInstructionFiles)
      docEntries.push({
        header: `\n[.github/instructions/${file.filename}]`,
        content: file.content,
      });
  }

  // Apply size budget: proportionally truncate each entry's content if total exceeds limit.
  // A per-entry minimum prevents a single huge skill from starving CLAUDE.md to near-zero.
  const totalDocChars = docEntries.reduce((sum, e) => sum + e.content.length, 0);
  if (totalDocChars > MAX_EXISTING_DOCS_CHARS) {
    const ratio = MAX_EXISTING_DOCS_CHARS / totalDocChars;
    for (const entry of docEntries) {
      const proportional = Math.floor(entry.content.length * ratio);
      const floor = Math.min(MIN_CHARS_PER_ENTRY, entry.content.length);
      entry.content = truncateAtLineEnd(entry.content, Math.max(proportional, floor));
    }
  }

  for (const { header, content } of docEntries) {
    parts.push(header);
    parts.push(content);
  }

  if (existingDocs.includableDocs?.length) {
    parts.push(`\n--- Existing Documentation Files (use @include) ---`);
    parts.push(
      'These files exist in the project and can be referenced in CLAUDE.md using @./path:',
    );
    for (const doc of existingDocs.includableDocs) {
      parts.push(`- ${doc}`);
    }
  }

  if (learnedSection) {
    parts.push('\n--- Learned Patterns (from session learning) ---');
    parts.push('Consider these accumulated learnings when deciding what to update:');
    parts.push(learnedSection);
  }

  if (sources?.length) {
    parts.push(formatSourcesForPrompt(sources));
  }

  return parts.join('\n');
}
