import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';
import { tmpdir } from 'os';
import { checkGrounding } from '../checks/grounding.js';
import { collectProjectStructure } from '../utils.js';

describe('checkGrounding', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'caliber-grounding-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('scores high when config references project directories', () => {
    mkdirSync(join(dir, 'src'));
    mkdirSync(join(dir, 'scripts'));
    mkdirSync(join(dir, 'tests'));
    writeFileSync(join(dir, 'Makefile'), 'build:\n\techo build');

    writeFileSync(
      join(dir, 'CLAUDE.md'),
      '# Project\n\nCode lives in `src/`. Build scripts are in `scripts/`. Tests in `tests/`.\nRun `make build` using the Makefile.',
    );

    const checks = checkGrounding(dir);
    const groundingCheck = checks.find(c => c.id === 'project_grounding');
    expect(groundingCheck?.earnedPoints).toBeGreaterThan(0);
  });

  it('scores low when config does not reference project structure', () => {
    mkdirSync(join(dir, 'src'));
    mkdirSync(join(dir, 'lib'));
    mkdirSync(join(dir, 'infra'));
    writeFileSync(join(dir, 'package.json'), '{}');

    writeFileSync(join(dir, 'CLAUDE.md'), '# Project\n\nWrite clean code and follow best practices.');

    const checks = checkGrounding(dir);
    const groundingCheck = checks.find(c => c.id === 'project_grounding');
    expect(groundingCheck?.earnedPoints).toBeLessThan(6);
  });

  it('provides fix data with missing directories', () => {
    mkdirSync(join(dir, 'src'));
    mkdirSync(join(dir, 'deploy'));
    writeFileSync(join(dir, 'CLAUDE.md'), '# Project\n\nSome generic content.');

    const checks = checkGrounding(dir);
    const groundingCheck = checks.find(c => c.id === 'project_grounding');
    expect(groundingCheck?.fix).toBeDefined();
    expect(groundingCheck?.fix?.action).toBe('add_references');
    expect(groundingCheck?.fix?.data.missing).toBeDefined();
  });

  it('scores reference density based on inline code usage', () => {
    mkdirSync(join(dir, 'src'));
    writeFileSync(
      join(dir, 'CLAUDE.md'),
      '# Project\n\nEntry point is `src/index.ts`.\nRun `build` to compile.\nConfig in `tsconfig.json`.',
    );

    const checks = checkGrounding(dir);
    const densityCheck = checks.find(c => c.id === 'reference_density');
    expect(densityCheck?.earnedPoints).toBeGreaterThan(0);
  });

  it('weights tier-1 path refs higher than generic paths for reference density', () => {
    const filler = Array.from({ length: 18 }, (_, i) => `Narrative line ${i + 1} with no code.`).join('\n');
    const genericMd = `# Project\n\n${filler}\n\nSee \`src/lib/helpers.ts\`.\n`;
    const tier1Md = `# Project\n\n${filler}\n\nSee \`package.json\`.\n`;

    writeFileSync(join(dir, 'package.json'), '{}');
    mkdirSync(join(dir, 'src', 'lib'), { recursive: true });
    writeFileSync(join(dir, 'src', 'lib', 'helpers.ts'), 'export {}');

    writeFileSync(join(dir, 'CLAUDE.md'), genericMd);
    const genericScore = checkGrounding(dir).find(c => c.id === 'reference_density')?.earnedPoints ?? 0;

    writeFileSync(join(dir, 'CLAUDE.md'), tier1Md);
    const tier1Score = checkGrounding(dir).find(c => c.id === 'reference_density')?.earnedPoints ?? 0;

    expect(tier1Score).toBeGreaterThan(genericScore);
  });

  it('handles empty project gracefully', () => {
    const checks = checkGrounding(dir);
    const groundingCheck = checks.find(c => c.id === 'project_grounding');
    expect(groundingCheck).toBeDefined();
    expect(groundingCheck?.earnedPoints).toBe(0);
  });
});

describe('collectProjectStructure respects .gitignore', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'caliber-gitignore-'));
    execSync('git init', { cwd: dir, stdio: 'pipe' });
    execSync('git config user.email "test@test.com"', { cwd: dir, stdio: 'pipe' });
    execSync('git config user.name "Test"', { cwd: dir, stdio: 'pipe' });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('excludes gitignored directories', () => {
    mkdirSync(join(dir, 'src'));
    mkdirSync(join(dir, '.idea'));
    mkdirSync(join(dir, '.vscode'));
    writeFileSync(join(dir, 'src', 'index.ts'), 'export {}');
    writeFileSync(join(dir, '.idea', 'workspace.xml'), '<xml/>');
    writeFileSync(join(dir, '.vscode', 'settings.json'), '{}');
    writeFileSync(join(dir, '.gitignore'), '.idea/\n.vscode/\n');

    // Stage a tracked file so git ls-files returns something
    execSync('git add src .gitignore', { cwd: dir, stdio: 'pipe' });

    const structure = collectProjectStructure(dir);
    expect(structure.dirs).toContain('src');
    expect(structure.dirs).not.toContain('.idea');
    expect(structure.dirs).not.toContain('.vscode');
  });

  it('includes non-gitignored directories', () => {
    mkdirSync(join(dir, 'src'));
    mkdirSync(join(dir, 'scripts'));
    writeFileSync(join(dir, 'src', 'index.ts'), 'export {}');
    writeFileSync(join(dir, 'scripts', 'build.sh'), '#!/bin/bash');

    execSync('git add .', { cwd: dir, stdio: 'pipe' });

    const structure = collectProjectStructure(dir);
    expect(structure.dirs).toContain('src');
    expect(structure.dirs).toContain('scripts');
  });

  it('falls back to including all dirs when not a git repo', () => {
    // Remove the .git directory to simulate non-git context
    rmSync(join(dir, '.git'), { recursive: true, force: true });

    mkdirSync(join(dir, 'src'));
    mkdirSync(join(dir, '.idea'));
    writeFileSync(join(dir, 'src', 'index.ts'), 'export {}');
    writeFileSync(join(dir, '.idea', 'workspace.xml'), '<xml/>');

    const structure = collectProjectStructure(dir);
    expect(structure.dirs).toContain('src');
    // Without git, .idea is not filtered (only hardcoded IGNORED_DIRS apply)
    expect(structure.dirs).toContain('.idea');
  });
});
