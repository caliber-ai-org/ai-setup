import { llmCall, parseJsonResponse } from '../llm/index.js';
import { getFastModel } from '../llm/config.js';
import { REFRESH_SYSTEM_PROMPT } from './prompts.js';
import type { SourceSummary } from '../fingerprint/sources.js';
import { formatSourcesForPrompt } from '../fingerprint/sources.js';
import { BUILTIN_SKILL_NAMES } from '../lib/builtin-skills.js';
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
  cursorSkills?: Array<{ name: string; filename: string; content: string }>;
  copilotInstructions?: string;
  copilotInstructionFiles?: Array<{ filename: string; content: string }>;
  codexSkills?: Array<{ name: string; filename: string; content: string }>;
  opencodeSkills?: Array<{ name: string; filename: string; content: string }>;
}

interface ProjectContext {
  languages?: string[];
  frameworks?: string[];
  packageName?: string;
  fileTree?: string[];
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
    codexSkills?: Array<{ name: string; content: string }> | null;
    opencodeSkills?: Array<{ name: string; content: string }> | null;
    cursorSkills?: Array<{ name: string; content: string }> | null;
  };
  changesSummary: string;
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

  const docCount =
    [
      existingDocs.claudeMd,
      existingDocs.agentsMd,
      existingDocs.readmeMd,
      existingDocs.copilotInstructions,
      existingDocs.cursorrules,
    ].filter(Boolean).length +
    (existingDocs.claudeSkills?.length ?? 0) +
    (existingDocs.cursorRules?.length ?? 0) +
    (existingDocs.cursorSkills?.length ?? 0) +
    (existingDocs.copilotInstructionFiles?.length ?? 0) +
    (existingDocs.codexSkills?.length ?? 0) +
    (existingDocs.opencodeSkills?.length ?? 0);
  const maxTokens = Math.min(32768, Math.max(8192, docCount * 4096));

  const raw = await llmCall({
    system: REFRESH_SYSTEM_PROMPT,
    prompt,
    maxTokens,
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
      const skillName = skill.filename.split('/')[0];
      if (BUILTIN_SKILL_NAMES.has(skillName)) continue;
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
  const skillSources: Array<{ skills?: Array<{ name: string; content: string }>; prefix: string }> =
    [
      { skills: existingDocs.cursorSkills, prefix: '.cursor/skills' },
      { skills: existingDocs.codexSkills, prefix: '.agents/skills' },
      { skills: existingDocs.opencodeSkills, prefix: '.opencode/skills' },
    ];
  for (const { skills, prefix } of skillSources) {
    if (!skills?.length) continue;
    for (const skill of skills) {
      if (BUILTIN_SKILL_NAMES.has(skill.name)) continue;
      parts.push(`\n[${prefix}/${skill.name}/SKILL.md]`);
      parts.push(skill.content);
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
