/**
 * Scoring constants — research-backed weights and thresholds.
 *
 * Sources:
 *  - ETH Zurich AGENTbench (2026): bloat = -3% task success, +20% cost
 *  - SkillsBench (2026): 2-3 curated skills = +18.6pp; 4+ = +5.9pp
 *  - ai-context-kit: token budget warn >2k, error >5k
 *  - HumanLayer: <60 lines ideal, <300 general consensus
 *  - Addy Osmani: agents reference documented tools 1.6x more
 */

// ── Category maximums ──────────────────────────────────────────────────
export const CATEGORY_MAX = {
  existence: 25,
  quality: 25,
  coverage: 20,
  accuracy: 15,
  freshness: 10,
  bonus: 5,
} as const;

// ── Existence checks (25 pts) ─────────────────────────────────────────
export const POINTS_CLAUDE_MD_EXISTS = 6;
export const POINTS_CURSOR_RULES_EXIST = 3;
export const POINTS_SKILLS_EXIST = 6;
export const POINTS_SKILLS_BONUS_PER_EXTRA = 1;
export const POINTS_SKILLS_BONUS_CAP = 2;
export const POINTS_CURSOR_MDC_RULES = 3;
export const POINTS_MCP_SERVERS = 3;
export const POINTS_CROSS_PLATFORM_PARITY = 2;

// ── Quality checks (25 pts) ──────────────────────────────────────────
export const POINTS_HAS_COMMANDS = 8;
export const POINTS_NOT_BLOATED = 6;
export const POINTS_NO_VAGUE = 4;
export const POINTS_NO_DIR_TREE = 3;
export const POINTS_NO_DUPLICATES = 2;
export const POINTS_NO_CONTRADICTIONS = 2;

// ── Coverage checks (20 pts) — NEW ───────────────────────────────────
/** Do configs mention the project's actual dependencies? */
export const POINTS_DEP_COVERAGE = 10;
/** Do detected services (DB, cloud, etc.) have MCP/config coverage? */
export const POINTS_SERVICE_COVERAGE = 6;
/** Are MCP servers configured for the project's services? */
export const POINTS_MCP_COVERAGE = 4;

// ── Accuracy checks (15 pts) — NEW ──────────────────────────────────
/** Do documented commands (npm run X) actually exist in package.json? */
export const POINTS_COMMANDS_VALID = 6;
/** Do documented file paths actually exist on disk? */
export const POINTS_PATHS_VALID = 4;
/** Has the code changed without a corresponding config update? */
export const POINTS_CONFIG_DRIFT = 5;

// ── Freshness & safety checks (10 pts) ───────────────────────────────
export const POINTS_FRESHNESS = 4;
export const POINTS_NO_SECRETS = 4;
export const POINTS_PERMISSIONS = 2;

// ── Bonus checks (5 pts) ────────────────────────────────────────────
export const POINTS_HOOKS = 2;
export const POINTS_AGENTS_MD = 1;
export const POINTS_OPEN_SKILLS_FORMAT = 2;

// ── Thresholds ─────────────────────────────────────────────────────────

/** Line count thresholds for bloat scoring (per context file). */
export const BLOAT_THRESHOLDS = [
  { maxLines: 120, points: 6 },
  { maxLines: 200, points: 4 },
  { maxLines: 300, points: 3 },
  { maxLines: 500, points: 1 },
] as const;

/** Freshness thresholds based on file modification time. */
export const FRESHNESS_THRESHOLDS = [
  { maxDaysOld: 7, points: 4 },
  { maxDaysOld: 14, points: 3 },
  { maxDaysOld: 30, points: 2 },
  { maxDaysOld: 60, points: 1 },
] as const;

/** Patterns that indicate vague, unhelpful instructions. */
export const VAGUE_PATTERNS = [
  /follow\s+best\s+practices/i,
  /write\s+clean\s+code/i,
  /ensure\s+quality/i,
  /be\s+consistent/i,
  /maintain\s+readability/i,
  /keep\s+it\s+simple/i,
  /use\s+appropriate\s+patterns/i,
  /follow\s+coding\s+standards/i,
] as const;

/** Patterns that indicate build/test/lint commands. */
export const COMMAND_PATTERNS = [
  /(?:npm|yarn|pnpm|bun)\s+(?:run\s+)?(?:dev|build|test|lint|start|format)/i,
  /(?:make|cargo|go)\s+(?:build|test|run|lint|vet|fmt)/i,
  /(?:vitest|jest|pytest|mocha|ava)\b/i,
  /(?:eslint|prettier|biome|ruff)\b/i,
  /npx\s+tsc/i,
] as const;

/** Patterns that indicate secret/credential leaks. */
export const SECRET_PATTERNS = [
  /sk-[a-zA-Z0-9]{20,}/,
  /AKIA[A-Z0-9]{16}/,
  /ghp_[a-zA-Z0-9]{36}/,
  /ghu_[a-zA-Z0-9]{36}/,
  /glpat-[a-zA-Z0-9\-_]{20,}/,
  /xox[bpors]-[a-zA-Z0-9\-]{10,}/,
  /(?:password|secret|token|api_key)\s*[:=]\s*["'][^"']{8,}["']/i,
] as const;

/** Package manager contradiction pairs. */
export const CONTRADICTION_PAIRS = [
  { a: /\buse\s+npm\b/i, b: /\buse\s+(?:pnpm|yarn|bun)\b/i },
  { a: /\buse\s+pnpm\b/i, b: /\buse\s+(?:npm|yarn|bun)\b/i },
  { a: /\buse\s+yarn\b/i, b: /\buse\s+(?:npm|pnpm|bun)\b/i },
  { a: /\buse\s+tabs\b/i, b: /\buse\s+spaces\b/i },
  { a: /\bsemicolons?\b.*\balways\b/i, b: /\bno\s+semicolons?\b/i },
] as const;

// ── Platform-specific check IDs ───────────────────────────────────────
/** Checks that only apply when targeting Cursor */
export const CURSOR_ONLY_CHECKS = new Set([
  'cursor_rules_exist',
  'cursor_mdc_rules',
]);

/** Checks that only apply when targeting Claude Code */
export const CLAUDE_ONLY_CHECKS = new Set([
  'claude_md_exists',
  'claude_md_freshness',
]);

/** Checks that only apply when targeting both platforms */
export const BOTH_ONLY_CHECKS = new Set([
  'cross_platform_parity',
  'no_duplicate_content',
]);

/** Checks that only apply when targeting Codex */
export const CODEX_ONLY_CHECKS = new Set([
  'codex_agents_md_exists',
]);

// ── Grading ────────────────────────────────────────────────────────────
export const GRADE_THRESHOLDS = [
  { minScore: 85, grade: 'A' },
  { minScore: 70, grade: 'B' },
  { minScore: 55, grade: 'C' },
  { minScore: 40, grade: 'D' },
  { minScore: 0, grade: 'F' },
] as const;

export function computeGrade(score: number): string {
  for (const { minScore, grade } of GRADE_THRESHOLDS) {
    if (score >= minScore) return grade;
  }
  return 'F';
}
