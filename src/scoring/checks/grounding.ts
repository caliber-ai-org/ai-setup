import type { Check } from '../index.js';
import {
  POINTS_PROJECT_GROUNDING,
  POINTS_REFERENCE_DENSITY,
  GROUNDING_THRESHOLDS,
} from '../constants.js';
import {
  collectAllConfigContent,
  collectProjectStructure,
  isEntryMentioned,
  extractReferences,
  analyzeMarkdownStructure,
  calculateDensityPoints,
  sumPathReferenceDensityWeights,
} from '../utils.js';

export function checkGrounding(dir: string): Check[] {
  const checks: Check[] = [];

  const configContent = collectAllConfigContent(dir);
  const configLower = configContent.toLowerCase();
  const projectStructure = collectProjectStructure(dir);

  // 1. Project grounding — does the config reference real project dirs/files?
  const allProjectEntries = [
    ...projectStructure.dirs,
    ...projectStructure.files,
  ];

  const meaningfulEntries = allProjectEntries.filter(e => e.length > 2);

  const mentioned: string[] = [];
  const notMentioned: string[] = [];

  for (const entry of meaningfulEntries) {
    if (isEntryMentioned(entry, configLower)) {
      mentioned.push(entry);
    } else {
      notMentioned.push(entry);
    }
  }

  const groundingRatio = meaningfulEntries.length > 0
    ? mentioned.length / meaningfulEntries.length
    : 0;

  const groundingThreshold = GROUNDING_THRESHOLDS.find(t => groundingRatio >= t.minRatio);
  const groundingPoints = meaningfulEntries.length === 0
    ? 0
    : groundingThreshold?.points ?? 0;

  const topDirs = projectStructure.dirs
    .filter(d => !d.includes('/'))
    .filter(d => d.length > 2);

  const unmentionedTopDirs = topDirs.filter(d => !isEntryMentioned(d, configLower));
  const mentionedTopDirs = topDirs.filter(d => isEntryMentioned(d, configLower));

  checks.push({
    id: 'project_grounding',
    name: 'Project grounding',
    category: 'grounding',
    maxPoints: POINTS_PROJECT_GROUNDING,
    earnedPoints: groundingPoints,
    passed: groundingRatio >= 0.2,
    detail: meaningfulEntries.length === 0
      ? 'No project structure detected'
      : `${mentioned.length}/${meaningfulEntries.length} project entries referenced in config (${Math.round(groundingRatio * 100)}%)`,
    suggestion: unmentionedTopDirs.length > 0
      ? `Config doesn't mention: ${unmentionedTopDirs.slice(0, 5).join(', ')}${unmentionedTopDirs.length > 5 ? ` (+${unmentionedTopDirs.length - 5} more)` : ''}`
      : undefined,
    fix: groundingPoints < POINTS_PROJECT_GROUNDING
      ? {
          action: 'add_references',
          data: {
            missing: unmentionedTopDirs.slice(0, 10),
            mentioned: mentionedTopDirs.slice(0, 10),
            totalEntries: meaningfulEntries.length,
            coverage: Math.round(groundingRatio * 100),
          },
          instruction: `Reference these project directories in your config: ${unmentionedTopDirs.slice(0, 5).join(', ')}`,
        }
      : undefined,
  });

  // 2. Reference density — path refs weighted when they resolve to this repo (files/dirs scan + disk); inline code density
  const refs = extractReferences(configContent);
  const mdStructure = analyzeMarkdownStructure(configContent);
  const projectFiles = new Set(projectStructure.files);
  const projectDirs = new Set(projectStructure.dirs);
  const { weightedSum: weightedPathRefs, resolvedCount: refsResolvedInProject } = sumPathReferenceDensityWeights(
    refs,
    dir,
    projectFiles,
    projectDirs,
  );
  const totalSpecificRefs = weightedPathRefs + mdStructure.inlineCodeCount;

  const density = mdStructure.nonEmptyLines > 0
    ? (totalSpecificRefs / mdStructure.nonEmptyLines) * 100
    : 0;

  const densityPoints = configContent.length === 0
    ? 0
    : calculateDensityPoints(density, POINTS_REFERENCE_DENSITY);

  checks.push({
    id: 'reference_density',
    name: 'Reference density',
    category: 'grounding',
    maxPoints: POINTS_REFERENCE_DENSITY,
    earnedPoints: densityPoints,
    passed: densityPoints >= Math.round(POINTS_REFERENCE_DENSITY * 0.5),
    detail: configContent.length === 0
      ? 'No config content'
      : `${totalSpecificRefs} reference units (${refs.length} path-like, ${refsResolvedInProject} resolve to this repo, ${mdStructure.inlineCodeCount} inline marks) / ${mdStructure.nonEmptyLines} non-empty lines → ${Math.round(density)}% line-reference density`,
    suggestion: densityPoints < Math.round(POINTS_REFERENCE_DENSITY * 0.5) && configContent.length > 0
      ? 'Use backticks and paths to reference specific files, commands, and identifiers'
      : undefined,
    fix: densityPoints < Math.round(POINTS_REFERENCE_DENSITY * 0.5) && configContent.length > 0
      ? {
          action: 'add_inline_refs',
          data: {
            densityPercent: Math.round(density),
            referenceUnits: totalSpecificRefs,
            pathLikeCount: refs.length,
            pathLikeResolvedCount: refsResolvedInProject,
            inlineMarkCount: mdStructure.inlineCodeCount,
            nonEmptyLines: mdStructure.nonEmptyLines,
          },
          instruction: 'Add more inline code references (backticks) for file paths, commands, and identifiers.',
        }
      : undefined,
  });

  return checks;
}
