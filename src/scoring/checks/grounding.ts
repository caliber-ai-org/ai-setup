import type { Check } from '../index.js';
import {
  POINTS_PROJECT_GROUNDING,
  POINTS_REFERENCE_DENSITY,
} from '../constants.js';
import {
  collectAllConfigContent,
  collectProjectStructure,
  isEntryMentioned,
  extractReferences,
  analyzeMarkdownStructure,
  calculateDensityPoints,
  computeGroundingCoverage,
} from '../utils.js';

export function checkGrounding(dir: string): Check[] {
  const checks: Check[] = [];

  const configContent = collectAllConfigContent(dir);
  const configLower = configContent.toLowerCase();
  const projectStructure = collectProjectStructure(dir);

  // 1. Project grounding — does the config reference real project dirs/notable files?
  const {
    entries,
    mentioned,
    notMentioned,
    ratio: groundingRatio,
    points: groundingPoints,
  } = computeGroundingCoverage(configLower, projectStructure);

  const topDirs = projectStructure.dirs
    .filter((d) => !d.includes('/'))
    .filter((d) => d.length > 2);

  const unmentionedTopDirs = topDirs.filter((d) => !isEntryMentioned(d, configLower));
  const mentionedTopDirs = topDirs.filter((d) => isEntryMentioned(d, configLower));
  const missingHints =
    unmentionedTopDirs.length > 0 ? unmentionedTopDirs : notMentioned;

  checks.push({
    id: 'project_grounding',
    name: 'Project grounding',
    category: 'grounding',
    maxPoints: POINTS_PROJECT_GROUNDING,
    earnedPoints: groundingPoints,
    passed: groundingRatio >= 0.2,
    detail:
      entries.length === 0
        ? 'No project structure detected'
        : `${mentioned.length}/${entries.length} notable project entries referenced in config (${Math.round(groundingRatio * 100)}%)`,
    suggestion:
      missingHints.length > 0
        ? `Config doesn't mention: ${missingHints.slice(0, 5).join(', ')}${missingHints.length > 5 ? ` (+${missingHints.length - 5} more)` : ''}`
        : undefined,
    fix:
      groundingPoints < POINTS_PROJECT_GROUNDING
        ? {
            action: 'add_references',
            data: {
              missing: missingHints.slice(0, 10),
              mentioned: mentionedTopDirs.slice(0, 10),
              totalEntries: entries.length,
              coverage: Math.round(groundingRatio * 100),
            },
            instruction: `Reference these project paths in your config: ${missingHints.slice(0, 5).join(', ')}`,
          }
        : undefined,
  });

  // 2. Reference density — how many specific references (backticks, paths) does the config have?
  const refs = extractReferences(configContent);
  const mdStructure = analyzeMarkdownStructure(configContent);
  const totalSpecificRefs = refs.length + mdStructure.inlineCodeCount;

  const density =
    mdStructure.nonEmptyLines > 0
      ? (totalSpecificRefs / mdStructure.nonEmptyLines) * 100
      : 0;

  const densityPoints =
    configContent.length === 0 ? 0 : calculateDensityPoints(density, POINTS_REFERENCE_DENSITY);

  checks.push({
    id: 'reference_density',
    name: 'Reference density',
    category: 'grounding',
    maxPoints: POINTS_REFERENCE_DENSITY,
    earnedPoints: densityPoints,
    passed: densityPoints >= Math.round(POINTS_REFERENCE_DENSITY * 0.5),
    detail:
      configContent.length === 0
        ? 'No config content'
        : `${totalSpecificRefs} specific references across ${mdStructure.nonEmptyLines} lines (${Math.round(density)}%)`,
    suggestion:
      densityPoints < Math.round(POINTS_REFERENCE_DENSITY * 0.5) && configContent.length > 0
        ? 'Use backticks and paths to reference specific files, commands, and identifiers'
        : undefined,
    fix:
      densityPoints < Math.round(POINTS_REFERENCE_DENSITY * 0.5) && configContent.length > 0
        ? {
            action: 'add_inline_refs',
            data: {
              currentDensity: Math.round(density),
              currentRefs: totalSpecificRefs,
              lines: mdStructure.nonEmptyLines,
            },
            instruction:
              'Add more inline code references (backticks) for file paths, commands, and identifiers.',
          }
        : undefined,
  });

  return checks;
}
