import { readFileSync } from 'fs';
import { join } from 'path';

function readFileOrNull(path: string): string | null {
  try {
    return readFileSync(path, 'utf-8');
  } catch {
    return null;
  }
}

function readJsonOrNull(path: string): Record<string, unknown> | null {
  const content = readFileOrNull(path);
  if (!content) return null;
  try {
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function extractNpmDeps(dir: string): string[] {
  const pkg = readJsonOrNull(join(dir, 'package.json'));
  if (!pkg) return [];

  const deps = {
    ...(pkg.dependencies as Record<string, string> | undefined),
    ...(pkg.devDependencies as Record<string, string> | undefined),
  };

  const trivial = new Set([
    'typescript',
    '@types/node',
    'tslib',
    'ts-node',
    'tsx',
    'prettier',
    'eslint',
    '@eslint/js',
    'rimraf',
    'cross-env',
    'dotenv',
    'nodemon',
    'husky',
    'lint-staged',
    'commitlint',
    '@commitlint/cli',
    '@commitlint/config-conventional',
  ]);

  const trivialPatterns = [
    /^@rely-ai\//,
    /^@caliber-ai\//,
    /^eslint-/,
    /^@eslint\//,
    /^prettier-/,
    /^@typescript-eslint\//,
  ];

  return Object.keys(deps)
    .filter(
      (d) => !trivial.has(d) && !d.startsWith('@types/') && !trivialPatterns.some((p) => p.test(d)),
    )
    .slice(0, 30);
}

export function extractPythonDeps(dir: string): string[] {
  const reqTxt = readFileOrNull(join(dir, 'requirements.txt'));
  if (reqTxt) {
    return reqTxt
      .split('\n')
      .map((l) =>
        l
          .trim()
          .split(/[=<>!~[]/)[0]
          .trim(),
      )
      .filter((l) => l && !l.startsWith('#'))
      .slice(0, 30);
  }

  const pyproject = readFileOrNull(join(dir, 'pyproject.toml'));
  if (pyproject) {
    const depMatch = pyproject.match(/dependencies\s*=\s*\[([\s\S]*?)\]/);
    if (depMatch) {
      return depMatch[1]
        .split('\n')
        .map((l) =>
          l
            .trim()
            .replace(/["',]/g, '')
            .split(/[=<>!~[]/)[0]
            .trim(),
        )
        .filter((l) => l.length > 0)
        .slice(0, 30);
    }
  }

  return [];
}

export function extractGoDeps(dir: string): string[] {
  const goMod = readFileOrNull(join(dir, 'go.mod'));
  if (!goMod) return [];

  const requireBlock = goMod.match(/require\s*\(([\s\S]*?)\)/);
  if (!requireBlock) return [];

  return requireBlock[1]
    .split('\n')
    .map((l) => l.trim().split(/\s/)[0])
    .filter((l) => l && !l.startsWith('//'))
    .map((l) => l.split('/').pop() || l)
    .slice(0, 30);
}

export function extractRustDeps(dir: string): string[] {
  const cargo = readFileOrNull(join(dir, 'Cargo.toml'));
  if (!cargo) return [];

  const depSection = cargo.match(/\[dependencies\]([\s\S]*?)(?:\[|$)/);
  if (!depSection) return [];

  return depSection[1]
    .split('\n')
    .map((l) => l.trim().split(/\s*=/)[0].trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'))
    .slice(0, 30);
}

export function extractAllDeps(dir: string): string[] {
  return [
    ...extractNpmDeps(dir),
    ...extractPythonDeps(dir),
    ...extractGoDeps(dir),
    ...extractRustDeps(dir),
  ];
}
