import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  pathReferenceResolvesInProject,
  sumPathReferenceDensityWeights,
} from '../utils.js';

describe('pathReferenceResolvesInProject', () => {
  const files = new Set(['package.json', 'src/index.ts']);
  const dirs = new Set(['src']);

  it('matches exact scanned file paths', () => {
    expect(pathReferenceResolvesInProject('package.json', '/root', files, dirs)).toBe(true);
    expect(pathReferenceResolvesInProject('src/index.ts', '/root', files, dirs)).toBe(true);
  });

  it('matches scanned directory paths', () => {
    expect(pathReferenceResolvesInProject('src', '/root', files, dirs)).toBe(true);
  });

  it('returns false for paths not in the project', () => {
    expect(pathReferenceResolvesInProject('nope.ts', '/root', files, dirs)).toBe(false);
  });

  it('resolves via filesystem when file exists under dir (fixes dead entries bug for ignored lockfiles)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'caliber-ref-resolve-'));
    try {
      writeFileSync(join(dir, 'package-lock.json'), 'x');
      const emptyFiles = new Set<string>();
      const emptyDirs = new Set<string>();
      
      // Even if 'package-lock.json' is filtered out of `files` (because it's in IGNORED_FILES),
      // it should still resolve because we correctly detect it on disk.
      expect(pathReferenceResolvesInProject('package-lock.json', dir, emptyFiles, emptyDirs)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('preserves case sensitivity correctly (fixes case-sensitivity bug)', () => {
    const files = new Set(['Dockerfile', 'Cargo.toml']);
    const dirs = new Set<string>();
    
    // We shouldn't blindly lower-case things; they should match exactly or correctly
    expect(pathReferenceResolvesInProject('Dockerfile', '/root', files, dirs)).toBe(true);
    expect(pathReferenceResolvesInProject('dockerfile', '/root', files, dirs)).toBe(false);
    
    expect(pathReferenceResolvesInProject('Cargo.toml', '/root', files, dirs)).toBe(true);
    expect(pathReferenceResolvesInProject('cargo.toml', '/root', files, dirs)).toBe(false);
  });
});

describe('sumPathReferenceDensityWeights', () => {
  it('doubles weight for refs that resolve', () => {
    const files = new Set(['a.ts']);
    const dirs = new Set<string>();
    const { weightedSum, resolvedCount } = sumPathReferenceDensityWeights(
      ['a.ts', 'missing.ts'],
      '/root',
      files,
      dirs,
    );
    expect(resolvedCount).toBe(1);
    expect(weightedSum).toBe(2 + 1);
  });
});
