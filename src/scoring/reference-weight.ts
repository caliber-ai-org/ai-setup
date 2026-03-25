/**
 * Heuristic weights for path-like references in agent config (grounding / reference density).
 * High-signal project files count more than generic source paths — see issue #59 Phase 1.
 */

const TIER1_BASENAMES = new Set(
  [
    'package.json',
    'requirements.txt',
    'requirements-dev.txt',
    'constraints.txt',
    'pipfile',
    'poetry.lock',
    'pyproject.toml',
    'setup.py',
    'go.mod',
    'go.sum',
    'cargo.toml',
    'cargo.lock',
    'composer.json',
    'gemfile',
    'gemfile.lock',
    'schema.prisma',
    'docker-compose.yml',
    'docker-compose.yaml',
    'compose.yaml',
    'compose.yml',
    'openapi.yaml',
    'openapi.yml',
    'openapi.json',
    'swagger.yaml',
    'swagger.yml',
    'swagger.json',
    'tsconfig.json',
    'jsconfig.json',
    'pnpm-workspace.yaml',
    'lerna.json',
    'makefile',
    'cmakelists.txt',
    'chart.yaml',
    'values.yaml',
  ].map((s) => s.toLowerCase()),
);

const TIER2_BASENAMES = new Set(
  [
    'main.py',
    'app.py',
    '__main__.py',
    'wsgi.py',
    'asgi.py',
    'manage.py',
    'index.ts',
    'index.tsx',
    'index.js',
    'index.jsx',
    'main.ts',
    'main.tsx',
    'main.js',
    'main.jsx',
    'main.go',
    'main.rs',
    'app.tsx',
    'app.jsx',
    'app.vue',
    'angular.json',
    'nest-cli.json',
    'remix.config.js',
  ].map((s) => s.toLowerCase()),
);

/** Basename patterns for tier-2 framework config (any extension). */
const TIER2_PREFIX_PATTERNS: RegExp[] = [
  /^next\.config\./i,
  /^vite\.config\./i,
  /^nuxt\.config\./i,
  /^svelte\.config\./i,
  /^astro\.config\./i,
  /^webpack\.config\./i,
  /^rollup\.config\./i,
  /^esbuild\.config\./i,
  /^vitest\.config\./i,
  /^jest\.config\./i,
];

/**
 * Multiplier for a single extracted path-like reference (1 = generic, 2 = entry/framework, 3 = core boundary).
 */
export function referenceArchitecturalWeight(ref: string): number {
  const normalized = ref.replace(/\\/g, '/').trim();
  if (normalized.length === 0) return 1;

  const base = (normalized.split('/').pop() ?? normalized).toLowerCase();

  if (TIER1_BASENAMES.has(base)) return 3;
  if (TIER2_BASENAMES.has(base)) return 2;
  if (TIER2_PREFIX_PATTERNS.some((re) => re.test(base))) return 2;

  return 1;
}

/**
 * Sum of architectural weights for extracted references (used as the weighted reference count).
 */
export function sumReferenceWeights(refs: readonly string[]): number {
  let sum = 0;
  for (const r of refs) {
    sum += referenceArchitecturalWeight(r);
  }
  return sum;
}
