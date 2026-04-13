import { join } from 'path';
import type { Check } from '../index.js';
import {
  POINTS_EXECUTABLE_CONTENT,
  POINTS_CONCISE_CONFIG,
  POINTS_CONCRETENESS,
  POINTS_NO_DIR_TREE,
  POINTS_NO_DUPLICATES,
  POINTS_HAS_STRUCTURE,
  TOKEN_BUDGET_THRESHOLDS,
  CODE_BLOCK_THRESHOLDS,
  CONCRETENESS_THRESHOLDS,
} from '../constants.js';
import {
  readFileOrNull,
  collectPrimaryConfigContent,
  estimateTokens,
  analyzeMarkdownStructure,
  classifyLine,
  countConcreteness,
  countTreeLines,
  calculateDuplicatePercent,
} from '../utils.js';

export function checkQuality(dir: string): Check[] {
  const checks: Check[] = [];

  const claudeMd = readFileOrNull(join(dir, 'CLAUDE.md'));
  const cursorrules = readFileOrNull(join(dir, '.cursorrules'));
  const agentsMd = readFileOrNull(join(dir, 'AGENTS.md'));

  const allContent = [claudeMd, cursorrules, agentsMd].filter(Boolean) as string[];
  const combinedContent = allContent.join('\n');
  const primaryInstructions = claudeMd ?? agentsMd ?? cursorrules;

  // 1. Executable content — does the config have code blocks?
  const structure = primaryInstructions ? analyzeMarkdownStructure(primaryInstructions) : null;

  const codeBlockCount = structure?.codeBlockCount ?? 0;
  const codeBlockThreshold = CODE_BLOCK_THRESHOLDS.find((t) => codeBlockCount >= t.minBlocks);
  const execPoints = codeBlockThreshold?.points ?? 0;

  checks.push({
    id: 'has_executable_content',
    name: 'Executable content (code blocks)',
    category: 'quality',
    maxPoints: POINTS_EXECUTABLE_CONTENT,
    earnedPoints: execPoints,
    passed: execPoints >= 6,
    detail: primaryInstructions
      ? `${codeBlockCount} code block${codeBlockCount === 1 ? '' : 's'} found`
      : 'No instructions file to check',
    suggestion:
      execPoints < 6
        ? 'Add code blocks with project commands, build steps, and common workflows'
        : undefined,
    fix:
      execPoints < 6
        ? {
            action: 'add_code_blocks',
            data: { currentCount: codeBlockCount, targetCount: 3 },
            instruction: `Add code blocks with executable commands. Currently ${codeBlockCount}, need at least 3 for full points.`,
          }
        : undefined,
  });

  // 2. Concise config — token budget for primary config files (not skills — they use progressive disclosure)
  const totalContent = collectPrimaryConfigContent(dir);
  const totalTokens = estimateTokens(totalContent);
  const tokenThreshold = TOKEN_BUDGET_THRESHOLDS.find((t) => totalTokens <= t.maxTokens);
  const tokenPoints =
    totalContent.length === 0 ? POINTS_CONCISE_CONFIG : (tokenThreshold?.points ?? 0);

  checks.push({
    id: 'concise_config',
    name: 'Concise config (token budget)',
    category: 'quality',
    maxPoints: POINTS_CONCISE_CONFIG,
    earnedPoints: tokenPoints,
    passed: tokenPoints >= 4,
    detail:
      totalContent.length === 0
        ? 'No config files to measure'
        : `~${totalTokens} tokens total across all config files`,
    suggestion:
      tokenPoints < 4 && totalContent.length > 0
        ? `Config is ~${totalTokens} tokens. Agents work best under ~5000 tokens (~4 pages of text) — trim verbose sections`
        : undefined,
    fix:
      tokenPoints < 4 && totalContent.length > 0
        ? {
            action: 'reduce_size',
            data: { currentTokens: totalTokens, targetTokens: 5000 },
            instruction: `Reduce total config from ~${totalTokens} tokens to under 5000.`,
          }
        : undefined,
  });

  // 3. Concreteness — ratio of concrete lines vs abstract prose
  const { concrete: concreteCount, abstract: abstractCount } = primaryInstructions
    ? countConcreteness(primaryInstructions)
    : { concrete: 0, abstract: 0 };
  const abstractExamples: string[] = [];
  if (primaryInstructions && abstractCount > 0) {
    let inCb = false;
    for (const line of primaryInstructions.split('\n')) {
      if (line.trim().startsWith('```')) {
        inCb = !inCb;
        continue;
      }
      if (!inCb && classifyLine(line, false) === 'abstract' && abstractExamples.length < 3) {
        abstractExamples.push(line.trim().slice(0, 80));
      }
    }
  }

  const totalMeaningful = concreteCount + abstractCount;
  const concreteRatio = totalMeaningful > 0 ? concreteCount / totalMeaningful : 1;
  const concretenessThreshold = CONCRETENESS_THRESHOLDS.find((t) => concreteRatio >= t.minRatio);
  const concretenessPoints = totalMeaningful === 0 ? 0 : (concretenessThreshold?.points ?? 0);

  checks.push({
    id: 'concreteness',
    name: 'Concrete instructions',
    category: 'quality',
    maxPoints: POINTS_CONCRETENESS,
    earnedPoints: concretenessPoints,
    passed: concretenessPoints >= 3,
    detail:
      totalMeaningful === 0
        ? 'No content to analyze'
        : `${Math.round(concreteRatio * 100)}% of lines reference specific files, paths, or code`,
    suggestion:
      concretenessPoints < 3 && totalMeaningful > 0
        ? `${abstractCount} lines are generic prose — replace with specific instructions referencing project files`
        : undefined,
    fix:
      concretenessPoints < 3 && totalMeaningful > 0
        ? {
            action: 'replace_vague',
            data: {
              abstractLines: abstractExamples,
              abstractCount,
              concreteCount,
              ratio: Math.round(concreteRatio * 100),
            },
            instruction: `Replace generic prose with specific references. Examples of vague lines: ${abstractExamples.join('; ')}`,
          }
        : undefined,
  });

  // 4. No directory tree listings
  const treeLineCount = combinedContent ? countTreeLines(combinedContent) : 0;
  const hasLargeTree = treeLineCount > 10;
  checks.push({
    id: 'no_directory_tree',
    name: 'No directory tree listings',
    category: 'quality',
    maxPoints: POINTS_NO_DIR_TREE,
    earnedPoints: hasLargeTree ? 0 : POINTS_NO_DIR_TREE,
    passed: !hasLargeTree,
    detail: hasLargeTree
      ? `${treeLineCount}-line directory tree detected in code block`
      : 'No large directory trees found',
    suggestion: hasLargeTree
      ? 'Remove directory tree listings — agents discover project structure by reading code'
      : undefined,
    fix: hasLargeTree
      ? {
          action: 'remove_tree',
          data: { treeLines: treeLineCount },
          instruction:
            'Remove directory tree listings from code blocks. Reference key directories inline instead.',
        }
      : undefined,
  });

  // 5. No duplicate content across files
  const duplicatePercent =
    claudeMd && cursorrules ? calculateDuplicatePercent(claudeMd, cursorrules) : 0;

  const hasDuplicates = duplicatePercent > 50;
  checks.push({
    id: 'no_duplicate_content',
    name: 'No duplicate content across files',
    category: 'quality',
    maxPoints: POINTS_NO_DUPLICATES,
    earnedPoints: hasDuplicates ? 0 : POINTS_NO_DUPLICATES,
    passed: !hasDuplicates,
    detail:
      claudeMd && cursorrules
        ? hasDuplicates
          ? `${duplicatePercent}% overlap between CLAUDE.md and .cursorrules`
          : `${duplicatePercent}% overlap — acceptable`
        : 'Only one context file (no duplication possible)',
    suggestion: hasDuplicates
      ? 'CLAUDE.md and .cursorrules share >50% content — deduplicate to save tokens'
      : undefined,
    fix: hasDuplicates
      ? {
          action: 'deduplicate',
          data: { overlapPercent: duplicatePercent },
          instruction:
            'Deduplicate content between CLAUDE.md and .cursorrules. Each file should contain platform-specific instructions only.',
        }
      : undefined,
  });

  // 6. Has structure — markdown headings and sections
  const structureScore = structure
    ? (structure.h2Count >= 3 ? 1 : 0) + (structure.listItemCount >= 3 ? 1 : 0)
    : 0;

  checks.push({
    id: 'has_structure',
    name: 'Structured with headings',
    category: 'quality',
    maxPoints: POINTS_HAS_STRUCTURE,
    earnedPoints: primaryInstructions ? structureScore : 0,
    passed: structureScore >= 2,
    detail: primaryInstructions
      ? `${structure!.h2Count} sections, ${structure!.listItemCount} list items`
      : 'No instructions file to check',
    suggestion:
      structureScore < 2 && primaryInstructions
        ? 'Add at least 3 markdown sections (##) and use lists for multi-item instructions'
        : undefined,
    fix:
      structureScore < 2 && primaryInstructions
        ? {
            action: 'add_structure',
            data: { currentH2: structure!.h2Count, currentLists: structure!.listItemCount },
            instruction:
              'Organize content into sections with ## headings and use bullet lists for instructions.',
          }
        : undefined,
  });

  return checks;
}
