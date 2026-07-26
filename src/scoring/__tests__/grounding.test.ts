import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';
import { tmpdir } from 'os';
import { checkGrounding } from '../checks/grounding.js';
import {
  collectProjectStructure,
  isNotableGroundingFile,
  selectGroundingEntries,
} from '../utils.js';
import { POINTS_PROJECT_GROUNDING } from '../constants.js';

describe('isNotableGroundingFile', () => {
  it('includes entry points and config/manifests', () => {
    expect(isNotableGroundingFile('package.json')).toBe(true);
    expect(isNotableGroundingFile('src/index.ts')).toBe(true);
    expect(isNotableGroundingFile('tsconfig.json')).toBe(true);
    expect(isNotableGroundingFile('Dockerfile')).toBe(true);
    expect(isNotableGroundingFile('config/app.yaml')).toBe(true);
  });

  it('excludes ordinary leaf source files', () => {
    expect(isNotableGroundingFile('src/util/foo.ts')).toBe(false);
    expect(isNotableGroundingFile('src/commands/init.ts')).toBe(false);
    expect(isNotableGroundingFile('README.md')).toBe(false);
  });
});

describe('selectGroundingEntries', () => {
  it('keeps dirs and notable files only', () => {
    const entries = selectGroundingEntries({
      dirs: ['src', 'src/util'],
      files: ['package.json', 'src/index.ts', 'src/util/foo.ts', 'README.md'],
    });
    expect(entries).toContain('src');
    expect(entries).toContain('src/util');
    expect(entries).toContain('package.json');
    expect(entries).toContain('src/index.ts');
    expect(entries).not.toContain('src/util/foo.ts');
    expect(entries).not.toContain('README.md');
  });
});

describe('checkGrounding', () => {
  let dir: string;
  let _chainable: unknown;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'caliber-grounding-'));
    _chainable = undefined;
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
    const groundingCheck = checks.find((c) => c.id === 'project_grounding');
    expect(groundingCheck?.earnedPoints).toBeGreaterThan(0);
  });

  it('scores low when config does not reference project structure', () => {
    mkdirSync(join(dir, 'src'));
    mkdirSync(join(dir, 'lib'));
    mkdirSync(join(dir, 'infra'));
    writeFileSync(join(dir, 'package.json'), '{}');

    writeFileSync(
      join(dir, 'CLAUDE.md'),
      '# Project\n\nWrite clean code and follow best practices.',
    );

    const checks = checkGrounding(dir);
    const groundingCheck = checks.find((c) => c.id === 'project_grounding');
    expect(groundingCheck?.earnedPoints).toBeLessThan(6);
  });

  it('provides fix data with missing directories', () => {
    mkdirSync(join(dir, 'src'));
    mkdirSync(join(dir, 'deploy'));
    writeFileSync(join(dir, 'CLAUDE.md'), '# Project\n\nSome generic content.');

    const checks = checkGrounding(dir);
    const groundingCheck = checks.find((c) => c.id === 'project_grounding');
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
    const densityCheck = checks.find((c) => c.id === 'reference_density');
    expect(densityCheck?.earnedPoints).toBeGreaterThan(0);
  });

  it('handles empty project gracefully', () => {
    const checks = checkGrounding(dir);
    const groundingCheck = checks.find((c) => c.id === 'project_grounding');
    expect(groundingCheck).toBeDefined();
    expect(groundingCheck?.earnedPoints).toBe(0);
  });

  it('ignores non-notable leaf files in the grounding denominator', () => {
    mkdirSync(join(dir, 'src'));
    mkdirSync(join(dir, 'scripts'));
    mkdirSync(join(dir, 'tests'));
    writeFileSync(join(dir, 'package.json'), '{}');
    writeFileSync(join(dir, 'src', 'index.ts'), 'export {}');
    // Many ordinary leaves that must NOT force tree-style enumeration
    for (let i = 0; i < 40; i++) {
      writeFileSync(join(dir, 'src', `leaf-${i}.ts`), `export const x${i} = ${i};`);
    }

    writeFileSync(
      join(dir, 'CLAUDE.md'),
      [
        '# Project',
        '',
        'Code in `src/` · scripts in `scripts/` · tests in `tests/`.',
        'Entry: `src/index.ts`. Manifest: `package.json`.',
      ].join('\n'),
    );

    const structure = collectProjectStructure(dir);
    expect(structure.files.length).toBeGreaterThan(30);
    const groundingEntries = selectGroundingEntries(structure);
    expect(groundingEntries.every((e) => !e.includes('leaf-'))).toBe(true);

    const checks = checkGrounding(dir);
    const groundingCheck = checks.find((c) => c.id === 'project_grounding');
    expect(groundingCheck?.earnedPoints).toBe(POINTS_PROJECT_GROUNDING);
    expect(groundingCheck?.detail).toMatch(/notable project entries/);
  });

  it('suggests unmentioned notable files when top-level dirs are already covered', () => {
    mkdirSync(join(dir, 'src'));
    mkdirSync(join(dir, 'tests'));
    writeFileSync(join(dir, 'package.json'), '{}');
    writeFileSync(join(dir, 'tsconfig.json'), '{}');
    writeFileSync(join(dir, 'Dockerfile'), 'FROM node');
    writeFileSync(join(dir, 'src', 'index.ts'), 'export {}');
    writeFileSync(
      join(dir, 'CLAUDE.md'),
      '# Project\n\nCode in `src/`. Tests in `tests/`.',
    );

    const checks = checkGrounding(dir);
    const groundingCheck = checks.find((c) => c.id === 'project_grounding');
    // 2 dirs mentioned of 6 notable entries (~33%) — below full marks
    expect(groundingCheck?.earnedPoints).toBeLessThan(POINTS_PROJECT_GROUNDING);
    expect(groundingCheck?.fix?.data.missing).toEqual(
      expect.arrayContaining(['package.json', 'tsconfig.json']),
    );
    expect(groundingCheck?.suggestion).toMatch(/package\.json|tsconfig\.json/);
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
