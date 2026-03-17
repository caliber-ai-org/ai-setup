import { existsSync } from 'fs';
import ora from 'ora';
import {
  validateFileReferences,
  estimateTokens,
  analyzeMarkdownStructure,
  countConcreteness,
  countTreeLines,
  collectProjectStructure,
  isEntryMentioned,
  extractReferences,
  calculateDuplicatePercent,
  calculateDensityPoints,
  type ProjectStructure,
} from '../scoring/utils.js';
import {
  TOKEN_BUDGET_THRESHOLDS,
  CODE_BLOCK_THRESHOLDS,
  CONCRETENESS_THRESHOLDS,
  POINTS_REFERENCES_VALID,
  POINTS_NO_DIR_TREE,
  POINTS_HAS_STRUCTURE,
  POINTS_PROJECT_GROUNDING,
  POINTS_REFERENCE_DENSITY,
  POINTS_NO_DUPLICATES,
  GROUNDING_THRESHOLDS,
} from '../scoring/constants.js';
import { llmCall } from '../llm/index.js';
import { stripMarkdownFences } from '../llm/utils.js';

const MAX_REFINE_ITERATIONS = 2;

export interface ScoringIssue {
  readonly check: string;
  readonly detail: string;
  readonly fixInstruction: string;
  readonly pointsLost: number;
}

interface ScoreRefineCallbacks {
  onStatus?: (message: string) => void;
}

interface ConfigContent {
  claudeMd: string | null;
  agentsMd: string | null;
  cursorrules: string | null;
  skills: Array<{ name: string; content: string; platform: string }>;
}

function extractConfigContent(setup: Record<string, unknown>): ConfigContent {
  const claude = setup.claude as Record<string, unknown> | undefined;
  const codex = setup.codex as Record<string, unknown> | undefined;
  const cursor = setup.cursor as Record<string, unknown> | undefined;

  let cursorrules: string | null = null;
  if (typeof cursor?.cursorrules === 'string' && cursor.cursorrules.length > 0) {
    cursorrules = cursor.cursorrules as string;
  }

  const skills: Array<{ name: string; content: string; platform: string }> = [];
  for (const [platform, obj] of [['claude', claude], ['codex', codex], ['cursor', cursor]] as const) {
    const platformSkills = (obj as Record<string, unknown> | undefined)?.skills as
      Array<{ name: string; content: string }> | undefined;
    if (Array.isArray(platformSkills)) {
      for (const skill of platformSkills) {
        if (typeof skill.content === 'string' && skill.content.length > 0) {
          skills.push({ name: skill.name, content: skill.content, platform });
        }
      }
    }
  }

  return {
    claudeMd: (claude?.claudeMd as string) ?? null,
    agentsMd: (codex?.agentsMd as string) ?? null,
    cursorrules,
    skills,
  };
}

function buildGroundingFixInstruction(
  unmentionedTopDirs: string[],
  projectStructure: ProjectStructure,
): string {
  const dirDescriptions = unmentionedTopDirs.slice(0, 8).map(dir => {
    const subdirs = projectStructure.dirs.filter(d => d.startsWith(`${dir}/`) && !d.includes('/', dir.length + 1));
    const files = projectStructure.files.filter(f => f.startsWith(`${dir}/`) && !f.includes('/', dir.length + 1));
    const children = [...subdirs.slice(0, 4), ...files.slice(0, 2)];
    const childList = children.map(c => c.split('/').pop()).join(', ');
    return childList
      ? `- \`${dir}/\` (contains: ${childList})`
      : `- \`${dir}/\``;
  });

  return [
    'Reference these project directories with descriptions of their contents:',
    ...dirDescriptions,
    'Mention them naturally in architecture descriptions using dense inline references.',
  ].join('\n');
}

export function validateSetup(
  setup: Record<string, unknown>,
  dir: string,
  checkExists: (path: string) => boolean = existsSync,
  projectStructure?: ProjectStructure,
): ScoringIssue[] {
  const issues: ScoringIssue[] = [];
  const { claudeMd, agentsMd, cursorrules, skills } = extractConfigContent(setup);
  const primaryContent = [claudeMd, agentsMd].filter(Boolean).join('\n');

  if (!primaryContent) return issues;

  // 1. References valid
  const refs = validateFileReferences(primaryContent, dir, checkExists);
  if (refs.invalid.length > 0 && refs.total > 0) {
    const ratio = refs.valid.length / refs.total;
    const earnedPoints = Math.round(ratio * POINTS_REFERENCES_VALID);
    const lost = POINTS_REFERENCES_VALID - earnedPoints;
    if (lost > 0) {
      issues.push({
        check: 'References valid',
        detail: `${refs.valid.length}/${refs.total} references verified, ${refs.invalid.length} invalid`,
        fixInstruction: `Remove these non-existent paths from the config: ${refs.invalid.map(r => `\`${r}\``).join(', ')}. Do NOT guess replacements — just delete them.`,
        pointsLost: lost,
      });
    }
  }

  // 2. Token budget
  const totalTokens = estimateTokens(primaryContent);
  const tokenThreshold = TOKEN_BUDGET_THRESHOLDS.find(t => totalTokens <= t.maxTokens);
  const tokenPoints = tokenThreshold?.points ?? 0;
  const maxTokenPoints = TOKEN_BUDGET_THRESHOLDS[0].points;
  if (tokenPoints < maxTokenPoints) {
    issues.push({
      check: 'Token budget',
      detail: `~${totalTokens} tokens (target: ≤${TOKEN_BUDGET_THRESHOLDS[0].maxTokens} for full points)`,
      fixInstruction: `Config is ~${totalTokens} tokens. Remove the least important lines to get under ${TOKEN_BUDGET_THRESHOLDS[0].maxTokens} tokens. Prioritize removing verbose prose over code blocks or path references.`,
      pointsLost: maxTokenPoints - tokenPoints,
    });
  }

  // 3. Code blocks
  const content = claudeMd ?? agentsMd ?? '';
  if (content) {
    const structure = analyzeMarkdownStructure(content);
    const blockThreshold = CODE_BLOCK_THRESHOLDS.find(t => structure.codeBlockCount >= t.minBlocks);
    const blockPoints = blockThreshold?.points ?? 0;
    const maxBlockPoints = CODE_BLOCK_THRESHOLDS[0].points;
    if (blockPoints < maxBlockPoints && structure.codeBlockCount < CODE_BLOCK_THRESHOLDS[0].minBlocks) {
      issues.push({
        check: 'Executable content',
        detail: `${structure.codeBlockCount} code block${structure.codeBlockCount === 1 ? '' : 's'} (need ≥${CODE_BLOCK_THRESHOLDS[0].minBlocks} for full points)`,
        fixInstruction: `Add ${CODE_BLOCK_THRESHOLDS[0].minBlocks - structure.codeBlockCount} more code blocks with actual project commands (build, test, lint, deploy).`,
        pointsLost: maxBlockPoints - blockPoints,
      });
    }

    // 4. Concreteness
    const { concrete: concreteCount, abstract: abstractCount } = countConcreteness(content);
    const totalMeaningful = concreteCount + abstractCount;
    const concreteRatio = totalMeaningful > 0 ? concreteCount / totalMeaningful : 1;
    const concThreshold = CONCRETENESS_THRESHOLDS.find(t => concreteRatio >= t.minRatio);
    const concPoints = totalMeaningful === 0 ? 0 : concThreshold?.points ?? 0;
    const maxConcPoints = CONCRETENESS_THRESHOLDS[0].points;
    if (concPoints < maxConcPoints && totalMeaningful > 0 && concreteRatio < CONCRETENESS_THRESHOLDS[0].minRatio) {
      issues.push({
        check: 'Concrete instructions',
        detail: `${Math.round(concreteRatio * 100)}% concrete (need ≥${Math.round(CONCRETENESS_THRESHOLDS[0].minRatio * 100)}%)`,
        fixInstruction: `${abstractCount} lines are generic prose. Replace vague instructions with specific ones that reference project files, paths, or commands in backticks.`,
        pointsLost: maxConcPoints - concPoints,
      });
    }

    // 5. Directory trees
    const treeLineCount = countTreeLines(content);
    if (treeLineCount > 10) {
      issues.push({
        check: 'No directory tree listings',
        detail: `${treeLineCount}-line directory tree found in code blocks`,
        fixInstruction: 'Remove directory tree listings from code blocks. Reference key directories inline with backticks instead.',
        pointsLost: POINTS_NO_DIR_TREE,
      });
    }

    // 6. Structure
    if (structure.h2Count < 3 || structure.listItemCount < 3) {
      const parts: string[] = [];
      if (structure.h2Count < 3) parts.push(`add ${3 - structure.h2Count} more ## sections`);
      if (structure.listItemCount < 3) parts.push('use bullet lists for multi-item instructions');
      issues.push({
        check: 'Structured with headings',
        detail: `${structure.h2Count} sections, ${structure.listItemCount} list items`,
        fixInstruction: `Improve structure: ${parts.join(' and ')}.`,
        pointsLost: POINTS_HAS_STRUCTURE - ((structure.h2Count >= 3 ? 1 : 0) + (structure.listItemCount >= 3 ? 1 : 0)),
      });
    }
  }

  // 7. Project grounding
  const structure = projectStructure ?? collectProjectStructure(dir);
  const allEntries = [...structure.dirs, ...structure.files].filter(e => e.length > 2);

  if (allEntries.length > 0) {
    const contentLower = primaryContent.toLowerCase();
    const mentionedEntries = allEntries.filter(e => isEntryMentioned(e, contentLower));
    const groundingRatio = mentionedEntries.length / allEntries.length;
    const groundingThreshold = GROUNDING_THRESHOLDS.find(t => groundingRatio >= t.minRatio);
    const groundingPoints = groundingThreshold?.points ?? 0;
    const groundingLost = POINTS_PROJECT_GROUNDING - groundingPoints;

    if (groundingLost > 0) {
      const topDirs = structure.dirs.filter(d => !d.includes('/') && d.length > 2);
      const unmentionedTopDirs = topDirs.filter(d => !isEntryMentioned(d, contentLower));

      if (unmentionedTopDirs.length > 0) {
        issues.push({
          check: 'Project grounding',
          detail: `${mentionedEntries.length}/${allEntries.length} project entries referenced (${Math.round(groundingRatio * 100)}%)`,
          fixInstruction: buildGroundingFixInstruction(unmentionedTopDirs, structure),
          pointsLost: groundingLost,
        });
      }
    }
  }

  // 8. Reference density
  const allRefs = extractReferences(primaryContent);
  const primaryStructure = analyzeMarkdownStructure(primaryContent);
  const totalSpecificRefs = allRefs.length + primaryStructure.inlineCodeCount;
  const density = primaryStructure.nonEmptyLines > 0
    ? (totalSpecificRefs / primaryStructure.nonEmptyLines) * 100
    : 0;

  const densityPoints = calculateDensityPoints(density, POINTS_REFERENCE_DENSITY);
  const densityLost = POINTS_REFERENCE_DENSITY - densityPoints;
  if (densityLost > 0) {
    issues.push({
      check: 'Reference density',
      detail: `${totalSpecificRefs} references across ${primaryStructure.nonEmptyLines} lines (${Math.round(density)}% density, need ≥40% for full points)`,
      fixInstruction: `Add more backtick references around file paths, commands, and identifiers. Use the dense reference style: \`src/api/\` routes · \`src/models/\` data. Current density: ${Math.round(density)}%, target: ≥40%.`,
      pointsLost: densityLost,
    });
  }

  // 9. Duplicate content
  if (claudeMd && cursorrules) {
    const duplicatePercent = calculateDuplicatePercent(claudeMd, cursorrules);

    if (duplicatePercent > 50) {
      issues.push({
        check: 'No duplicate content',
        detail: `${duplicatePercent}% overlap between CLAUDE.md and .cursorrules`,
        fixInstruction: 'Deduplicate content. Keep shared instructions in CLAUDE.md only. Make .cursorrules contain only Cursor-specific settings and platform differences.',
        pointsLost: POINTS_NO_DUPLICATES,
      });
    }
  }

  // 10. Skills quality (0 pts — only fixed alongside point-losing issues)
  for (const skill of skills) {
    const skillIssues: string[] = [];

    const skillRefs = validateFileReferences(skill.content, dir, checkExists);
    if (skillRefs.invalid.length > 0) {
      skillIssues.push(`invalid refs: ${skillRefs.invalid.slice(0, 3).join(', ')}`);
    }

    const skillStructure = analyzeMarkdownStructure(skill.content);
    if (skillStructure.codeBlockCount === 0 && skill.content.length > 200) {
      skillIssues.push('no code blocks');
    }

    const { concrete, abstract } = countConcreteness(skill.content);
    const total = concrete + abstract;
    if (total > 3 && concrete / total < 0.3) {
      skillIssues.push('low concreteness');
    }

    if (skillIssues.length > 0) {
      issues.push({
        check: `Skill quality: ${skill.name}`,
        detail: skillIssues.join('; '),
        fixInstruction: `Fix skill "${skill.name}": ${skillIssues.join(', ')}.${skillRefs.invalid.length > 0 ? ` Remove invalid paths: ${skillRefs.invalid.join(', ')}.` : ''} Add code blocks and specific file references.`,
        pointsLost: 0,
      });
    }
  }

  return issues.sort((a, b) => b.pointsLost - a.pointsLost);
}

function buildFeedbackMessage(issues: ScoringIssue[]): string {
  const lines: string[] = [
    'Fix ONLY these scoring issues — do not rewrite, restructure, or make cosmetic changes:\n',
  ];

  for (let i = 0; i < issues.length; i++) {
    const issue = issues[i];
    lines.push(`${i + 1}. ${issue.check.toUpperCase()} (-${issue.pointsLost} pts): ${issue.detail}`);
    lines.push(`   Action: ${issue.fixInstruction}\n`);
  }

  return lines.join('\n');
}

function countIssuePoints(issues: ScoringIssue[]): number {
  return issues.reduce((sum, i) => sum + i.pointsLost, 0);
}

export async function scoreAndRefine(
  setup: Record<string, unknown>,
  dir: string,
  sessionHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
  callbacks?: ScoreRefineCallbacks,
): Promise<Record<string, unknown>> {
  const existsCache = new Map<string, boolean>();
  const cachedExists = (path: string): boolean => {
    const cached = existsCache.get(path);
    if (cached !== undefined) return cached;
    const result = existsSync(path);
    existsCache.set(path, result);
    return result;
  };

  const projectStructure = collectProjectStructure(dir);

  let currentSetup = setup;
  let bestSetup = setup;
  let bestLostPoints = Infinity;

  for (let iteration = 0; iteration < MAX_REFINE_ITERATIONS; iteration++) {
    const issues = validateSetup(currentSetup, dir, cachedExists, projectStructure);
    const lostPoints = countIssuePoints(issues);

    if (lostPoints < bestLostPoints) {
      bestSetup = currentSetup;
      bestLostPoints = lostPoints;
    }

    if (lostPoints === 0) {
      if (callbacks?.onStatus) callbacks.onStatus('Setup passes all scoring checks');
      return bestSetup;
    }

    const pointIssues = issues.filter(i => i.pointsLost > 0);
    const pointIssueNames = pointIssues.map(i => i.check).join(', ');

    if (callbacks?.onStatus) {
      callbacks.onStatus(`Fixing ${pointIssues.length} scoring issue${pointIssues.length === 1 ? '' : 's'}: ${pointIssueNames}...`);
    }

    const refined = await applyTargetedFixes(currentSetup, issues);

    if (!refined) {
      if (callbacks?.onStatus) callbacks.onStatus('Refinement failed, keeping current setup');
      return bestSetup;
    }

    sessionHistory.push({
      role: 'user',
      content: `Fix scoring issues: ${pointIssueNames}`,
    });
    sessionHistory.push({
      role: 'assistant',
      content: `Applied scoring fixes for: ${pointIssueNames}`,
    });

    currentSetup = refined;
  }

  // Final check after last iteration
  const finalIssues = validateSetup(currentSetup, dir, cachedExists, projectStructure);
  const finalLostPoints = countIssuePoints(finalIssues);
  if (finalLostPoints < bestLostPoints) {
    bestSetup = currentSetup;
  }

  return bestSetup;
}

async function applyTargetedFixes(
  setup: Record<string, unknown>,
  issues: ScoringIssue[],
): Promise<Record<string, unknown> | null> {
  const { claudeMd, agentsMd, cursorrules, skills } = extractConfigContent(setup);

  const targets: { key: string; label: string; content: string }[] = [];
  if (claudeMd) targets.push({ key: 'claudeMd', label: 'CLAUDE.md', content: claudeMd });
  if (agentsMd) targets.push({ key: 'agentsMd', label: 'AGENTS.md', content: agentsMd });

  const failingChecks = new Set(issues.map(i => i.check));

  if (cursorrules && failingChecks.has('No duplicate content')) {
    targets.push({ key: 'cursorrules', label: '.cursorrules', content: cursorrules });
  }

  for (const skill of skills) {
    if (failingChecks.has(`Skill quality: ${skill.name}`)) {
      targets.push({ key: `skill:${skill.name}`, label: `Skill: ${skill.name}`, content: skill.content });
    }
  }

  if (targets.length === 0) return null;

  const feedbackMessage = buildFeedbackMessage(issues);

  const contentBlock = targets.map(t =>
    `### ${t.label}\n\`\`\`markdown\n${t.content}\n\`\`\``
  ).join('\n\n');

  const prompt = [
    'Here are the config files with scoring issues:\n',
    contentBlock,
    '\n',
    feedbackMessage,
    `\nReturn ONLY the fixed content as a JSON object with keys ${targets.map(t => `"${t.key}"`).join(', ')}. Each value is the fixed markdown string. No code fences, no explanations.`,
  ].join('\n');

  const maxTokens = Math.min(12000, 4000 + targets.length * 2000);

  try {
    const raw = await llmCall({
      system: 'You fix scoring issues in AI agent configuration files. You may receive CLAUDE.md, AGENTS.md, .cursorrules, and/or skill files. Return only a JSON object with the fixed content — no explanations, no code fences.',
      prompt,
      maxTokens,
    });

    const cleaned = stripMarkdownFences(raw);
    const jsonStart = cleaned.indexOf('{');
    const jsonToParse = jsonStart !== -1 ? cleaned.slice(jsonStart) : cleaned;
    const fixes = JSON.parse(jsonToParse) as Record<string, string>;

    const patched = structuredClone(setup);
    for (const target of targets) {
      const fixedValue = fixes[target.key];
      if (typeof fixedValue !== 'string' || fixedValue.length < 50) continue;

      if (target.key === 'claudeMd') {
        const parent = patched.claude as Record<string, unknown> | undefined;
        if (parent) parent.claudeMd = fixedValue;
      } else if (target.key === 'agentsMd') {
        const parent = patched.codex as Record<string, unknown> | undefined;
        if (parent) parent.agentsMd = fixedValue;
      } else if (target.key === 'cursorrules') {
        const parent = patched.cursor as Record<string, unknown> | undefined;
        if (parent) parent.cursorrules = fixedValue;
      } else if (target.key.startsWith('skill:')) {
        const skillName = target.key.slice(6);
        for (const platform of ['claude', 'cursor', 'codex'] as const) {
          const platformObj = patched[platform] as Record<string, unknown> | undefined;
          const platformSkills = platformObj?.skills as Array<{ name: string; content: string }> | undefined;
          const skill = platformSkills?.find(s => s.name === skillName);
          if (skill) {
            skill.content = fixedValue;
            break;
          }
        }
      }
    }

    return patched;
  } catch {
    return null;
  }
}

export async function runScoreRefineWithSpinner(
  setup: Record<string, unknown>,
  dir: string,
  sessionHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
): Promise<Record<string, unknown>> {
  const spinner = ora('Validating setup against scoring criteria...').start();
  try {
    const refined = await scoreAndRefine(setup, dir, sessionHistory, {
      onStatus: (msg) => { spinner.text = msg; },
    });
    if (refined !== setup) {
      spinner.succeed('Setup refined based on scoring feedback');
    } else {
      spinner.succeed('Setup passes scoring validation');
    }
    return refined;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    spinner.warn(`Scoring validation skipped: ${msg}`);
    return setup;
  }
}
