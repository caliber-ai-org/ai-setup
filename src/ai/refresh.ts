import { llmCall, parseJsonResponse } from '../llm/index.js';
import { getFastModel } from '../llm/config.js';
import { REFRESH_SYSTEM_PROMPT } from './prompts.js';
import type { SourceSummary } from '../fingerprint/sources.js';
import { formatSourcesForPrompt } from '../fingerprint/sources.js';
import { stripManagedBlocks } from '../writers/pre-commit-block.js';

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
  cursorrules?: string;
  cursorRules?: Array<{ filename: string; content: string }>;
  copilotInstructions?: string;
  copilotInstructionFiles?: Array<{ filename: string; content: string }>;
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
): Promise<RefreshResponse> {
  const prompt = buildRefreshPrompt(diff, existingDocs, projectContext, learnedSection, sources);
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
): string {
  const parts: string[] = [];

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

  if (existingDocs.agentsMd) {
    parts.push('\n[AGENTS.md]');
    parts.push(stripManagedBlocks(existingDocs.agentsMd));
  }
  if (existingDocs.claudeMd) {
    parts.push('\n[CLAUDE.md]');
    parts.push(stripManagedBlocks(existingDocs.claudeMd));
  }
  if (existingDocs.readmeMd) {
    parts.push('\n[README.md]');
    parts.push(existingDocs.readmeMd);
  }
  if (existingDocs.cursorrules) {
    parts.push('\n[.cursorrules]');
    parts.push(existingDocs.cursorrules);
  }
  if (existingDocs.claudeSkills?.length) {
    for (const skill of existingDocs.claudeSkills) {
      parts.push(`\n[.claude/skills/${skill.filename}]`);
      parts.push(skill.content);
    }
  }
  if (existingDocs.cursorRules?.length) {
    for (const rule of existingDocs.cursorRules) {
      if (rule.filename.startsWith('caliber-')) continue;
      parts.push(`\n[.cursor/rules/${rule.filename}]`);
      parts.push(rule.content);
    }
  }
  if (existingDocs.copilotInstructions) {
    parts.push('\n[.github/copilot-instructions.md]');
    parts.push(stripManagedBlocks(existingDocs.copilotInstructions));
  }
  if (existingDocs.copilotInstructionFiles?.length) {
    for (const file of existingDocs.copilotInstructionFiles) {
      parts.push(`\n[.github/instructions/${file.filename}]`);
      parts.push(file.content);
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
