import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { loadFingerprintCache, saveFingerprintCache, computeTreeSignature } from '../cache.js';
import type { CodeAnalysis } from '../code-analysis.js';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'caliber-cache-'));
}

const tmpDirs: string[] = [];
afterEach(() => {
  for (const d of tmpDirs) {
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch {}
  }
  tmpDirs.length = 0;
});

const mockCodeAnalysis: CodeAnalysis = {
  files: [{ path: 'src/index.ts', content: 'export default 1;', size: 18, priority: 40 }],
  truncated: false,
  totalProjectTokens: 100,
  compressedTokens: 80,
  includedTokens: 100,
  filesAnalyzed: 1,
  filesIncluded: 1,
  duplicateGroups: 0,
};

const mockTree = ['src/', 'src/index.ts', 'package.json'];

describe('fingerprint cache', () => {
  describe('computeTreeSignature', () => {
    it('returns a hex string', () => {
      const tmp = makeTempDir();
      tmpDirs.push(tmp);
      const sig = computeTreeSignature(['a.ts', 'b.ts'], tmp);
      expect(sig).toMatch(/^[a-f0-9]{16}$/);
    });

    it('changes when file tree changes', () => {
      const tmp = makeTempDir();
      tmpDirs.push(tmp);
      const sig1 = computeTreeSignature(['a.ts', 'b.ts'], tmp);
      const sig2 = computeTreeSignature(['a.ts', 'b.ts', 'c.ts'], tmp);
      expect(sig1).not.toBe(sig2);
    });

    it('is deterministic for same inputs', () => {
      const tmp = makeTempDir();
      tmpDirs.push(tmp);
      const sig1 = computeTreeSignature(['a.ts'], tmp);
      const sig2 = computeTreeSignature(['a.ts'], tmp);
      expect(sig1).toBe(sig2);
    });
  });

  describe('saveFingerprintCache + loadFingerprintCache', () => {
    it('roundtrips cache data correctly', () => {
      const tmp = makeTempDir();
      tmpDirs.push(tmp);

      saveFingerprintCache(tmp, mockTree, mockCodeAnalysis, ['TypeScript'], ['React'], ['Docker']);
      const cached = loadFingerprintCache(tmp, mockTree);

      expect(cached).not.toBeNull();
      expect(cached!.languages).toEqual(['TypeScript']);
      expect(cached!.frameworks).toEqual(['React']);
      expect(cached!.tools).toEqual(['Docker']);
      expect(cached!.codeAnalysis.filesAnalyzed).toBe(1);
      expect(cached!.codeAnalysis.files[0].path).toBe('src/index.ts');
    });

    it('returns null when no cache file exists', () => {
      const tmp = makeTempDir();
      tmpDirs.push(tmp);
      const cached = loadFingerprintCache(tmp, mockTree);
      expect(cached).toBeNull();
    });

    it('returns null when cache file is corrupt JSON', () => {
      const tmp = makeTempDir();
      tmpDirs.push(tmp);
      const cacheDir = path.join(tmp, '.caliber', 'cache');
      fs.mkdirSync(cacheDir, { recursive: true });
      fs.writeFileSync(path.join(cacheDir, 'fingerprint.json'), 'not json');

      const cached = loadFingerprintCache(tmp, mockTree);
      expect(cached).toBeNull();
    });

    it('returns null when cache version mismatches', () => {
      const tmp = makeTempDir();
      tmpDirs.push(tmp);
      const cacheDir = path.join(tmp, '.caliber', 'cache');
      fs.mkdirSync(cacheDir, { recursive: true });
      fs.writeFileSync(
        path.join(cacheDir, 'fingerprint.json'),
        JSON.stringify({
          version: 999,
          gitHead: '',
          treeSignature: '',
          codeAnalysis: mockCodeAnalysis,
          languages: [],
          frameworks: [],
          tools: [],
        }),
      );

      const cached = loadFingerprintCache(tmp, mockTree);
      expect(cached).toBeNull();
    });

    it('returns null when tree signature changes', () => {
      const tmp = makeTempDir();
      tmpDirs.push(tmp);

      saveFingerprintCache(tmp, mockTree, mockCodeAnalysis, [], [], []);
      const differentTree = ['src/', 'src/index.ts', 'package.json', 'new-file.ts'];
      const cached = loadFingerprintCache(tmp, differentTree);
      expect(cached).toBeNull();
    });

    it('creates .caliber/cache directory if missing', () => {
      const tmp = makeTempDir();
      tmpDirs.push(tmp);
      const cachePath = path.join(tmp, '.caliber', 'cache', 'fingerprint.json');

      expect(fs.existsSync(cachePath)).toBe(false);
      saveFingerprintCache(tmp, mockTree, mockCodeAnalysis, [], [], []);
      expect(fs.existsSync(cachePath)).toBe(true);
    });
  });
});
