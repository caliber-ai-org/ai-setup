import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { Check } from '../index.js';
import {
  POINTS_HAS_COMMANDS,
  POINTS_NOT_BLOATED,
  POINTS_NO_VAGUE,
  POINTS_NO_DIR_TREE,
  POINTS_NO_DUPLICATES,
  POINTS_NO_CONTRADICTIONS,
  BLOAT_THRESHOLDS,
  COMMAND_PATTERNS,
  VAGUE_PATTERNS,
  CONTRADICTION_PAIRS,
} from '../constants.js';

function readFileOrNull(path: string): string | null {
  try {
    return readFileSync(path, 'utf-8');
  } catch {
    return null;
  }
}

function countLines(content: string): number {
  return content.split('\n').length;
}

export function checkQuality(dir: string): Check[] {
  const checks: Check[] = [];

  const claudeMd = readFileOrNull(join(dir, 'CLAUDE.md'));
  const cursorrules = readFileOrNull(join(dir, '.cursorrules'));
  const agentsMd = readFileOrNull(join(dir, 'AGENTS.md'));

  // All context files for aggregate checks
  const allContent = [claudeMd, cursorrules, agentsMd].filter(Boolean) as string[];
  const combinedContent = allContent.join('\n');

  // Primary instructions file (CLAUDE.md, fallback to AGENTS.md for Codex users)
  const primaryInstructions = claudeMd ?? agentsMd;

  // 1. Has build/test/lint commands
  const hasCommands = primaryInstructions
    ? COMMAND_PATTERNS.some((p) => p.test(primaryInstructions))
    : false;
  const matchedCommands = primaryInstructions
    ? COMMAND_PATTERNS.filter((p) => p.test(primaryInstructions)).map((p) => {
        const m = primaryInstructions.match(p);
        return m ? m[0] : '';
      }).filter(Boolean)
    : [];
  checks.push({
    id: 'has_commands',
    name: 'Build/test/lint commands',
    category: 'quality',
    maxPoints: POINTS_HAS_COMMANDS,
    earnedPoints: hasCommands ? POINTS_HAS_COMMANDS : 0,
    passed: hasCommands,
    detail: hasCommands
      ? `Found: ${matchedCommands.slice(0, 3).join(', ')}`
      : primaryInstructions
        ? 'No build/test/lint commands detected'
        : 'No instructions file to check',
    suggestion: hasCommands
      ? undefined
      : 'Add build, test, and lint commands to your instructions file',
  });

  // 2. Not bloated (token budget)
  const primaryFile = claudeMd ?? agentsMd ?? cursorrules;
  const primaryName = claudeMd ? 'CLAUDE.md' : agentsMd ? 'AGENTS.md' : cursorrules ? '.cursorrules' : null;
  let bloatPoints = 0;
  let lineCount = 0;

  if (primaryFile) {
    lineCount = countLines(primaryFile);
    const threshold = BLOAT_THRESHOLDS.find((t) => lineCount <= t.maxLines);
    bloatPoints = threshold ? threshold.points : 0;
  } else {
    // No file = no bloat issue but also no points (handled by existence checks)
    bloatPoints = POINTS_NOT_BLOATED;
  }

  checks.push({
    id: 'not_bloated',
    name: 'Concise context files',
    category: 'quality',
    maxPoints: POINTS_NOT_BLOATED,
    earnedPoints: bloatPoints,
    passed: bloatPoints >= 6,
    detail: primaryName
      ? `${primaryName}: ${lineCount} lines`
      : 'No context files to measure',
    suggestion:
      bloatPoints < POINTS_NOT_BLOATED && primaryName
        ? `${primaryName} is ${lineCount} lines — must be ≤120 lines for full points (currently losing ${POINTS_NOT_BLOATED - bloatPoints} pts)`
        : undefined,
  });

  // 3. No vague instructions
  const vagueMatches: Array<{ pattern: string; line: number }> = [];
  if (combinedContent) {
    const lines = combinedContent.split('\n');
    for (let i = 0; i < lines.length; i++) {
      for (const pattern of VAGUE_PATTERNS) {
        if (pattern.test(lines[i])) {
          vagueMatches.push({ pattern: lines[i].trim(), line: i + 1 });
          break; // one match per line is enough
        }
      }
    }
  }
  checks.push({
    id: 'no_vague_instructions',
    name: 'No vague instructions',
    category: 'quality',
    maxPoints: POINTS_NO_VAGUE,
    earnedPoints: vagueMatches.length === 0 ? POINTS_NO_VAGUE : 0,
    passed: vagueMatches.length === 0,
    detail:
      vagueMatches.length === 0
        ? 'All instructions are specific and actionable'
        : `${vagueMatches.length} vague instruction${vagueMatches.length === 1 ? '' : 's'} found`,
    suggestion:
      vagueMatches.length > 0
        ? `Replace "${vagueMatches[0].pattern.slice(0, 50)}" (line ${vagueMatches[0].line}) with specific, measurable guidance`
        : undefined,
  });

  // 4. No directory tree listings
  const treeLinePattern = /[├└│─┬]/;
  let treeLineCount = 0;
  let inCodeBlock = false;

  if (combinedContent) {
    for (const line of combinedContent.split('\n')) {
      if (line.trim().startsWith('```')) {
        inCodeBlock = !inCodeBlock;
        continue;
      }
      if (inCodeBlock && treeLinePattern.test(line)) {
        treeLineCount++;
      }
    }
  }

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
  });

  // 5. No duplicate content across files
  let duplicatePercent = 0;
  if (claudeMd && cursorrules) {
    const claudeLines = new Set(
      claudeMd
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 10)
    );
    const cursorLines = cursorrules
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 10);

    const overlapping = cursorLines.filter((l) => claudeLines.has(l)).length;
    duplicatePercent =
      cursorLines.length > 0
        ? Math.round((overlapping / cursorLines.length) * 100)
        : 0;
  }

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
  });

  // 6. No contradictions
  const contradictions: string[] = [];
  if (allContent.length >= 2) {
    for (const pair of CONTRADICTION_PAIRS) {
      const fileA = allContent.find((c) => pair.a.test(c));
      const fileB = allContent.find((c) => pair.b.test(c));
      if (fileA && fileB && fileA !== fileB) {
        contradictions.push(`"${pair.a.source}" vs "${pair.b.source}"`);
      }
    }
  }

  // Also check within a single file for contradictions
  for (const content of allContent) {
    for (const pair of CONTRADICTION_PAIRS) {
      if (pair.a.test(content) && pair.b.test(content)) {
        contradictions.push(`Same file contains "${pair.a.source}" and "${pair.b.source}"`);
      }
    }
  }

  const hasContradictions = contradictions.length > 0;
  checks.push({
    id: 'no_contradictions',
    name: 'No contradictions',
    category: 'quality',
    maxPoints: POINTS_NO_CONTRADICTIONS,
    earnedPoints: hasContradictions ? 0 : POINTS_NO_CONTRADICTIONS,
    passed: !hasContradictions,
    detail: hasContradictions
      ? `${contradictions.length} contradiction${contradictions.length === 1 ? '' : 's'} found`
      : 'No conflicting instructions detected',
    suggestion: hasContradictions
      ? `Contradiction: ${contradictions[0]}. Remove or rephrase one of the conflicting statements.`
      : undefined,
  });

  return checks;
}
