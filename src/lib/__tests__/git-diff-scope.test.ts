import { describe, it, expect } from 'vitest';
import { scopeDiffToDir, type DiffResult } from '../git-diff.js';

function makeDiff(changedFiles: string[], hasDiffText = true): DiffResult {
  return {
    hasChanges: true,
    committedDiff: hasDiffText ? 'diff --git a/file' : '',
    stagedDiff: '',
    unstagedDiff: '',
    changedFiles,
    summary: `${changedFiles.length} files changed`,
  };
}

describe('scopeDiffToDir', () => {
  const allDirs = ['.', 'packages/frontend', 'packages/backend'];

  describe('root scope', () => {
    it('excludes files under other config dirs', () => {
      const diff = makeDiff([
        'tsconfig.json',
        'packages/frontend/src/App.tsx',
        'packages/backend/src/server.ts',
        'scripts/build.sh',
      ]);

      const scoped = scopeDiffToDir(diff, '.', allDirs);
      expect(scoped.changedFiles).toEqual(['tsconfig.json', 'scripts/build.sh']);
      expect(scoped.hasChanges).toBe(true);
    });

    it('returns full diff when only root has configs', () => {
      const diff = makeDiff(['src/index.ts', 'README.md']);
      const scoped = scopeDiffToDir(diff, '.', ['.']);
      expect(scoped.changedFiles).toEqual(['src/index.ts', 'README.md']);
    });

    it('returns hasChanges=false when all files belong to subdirs', () => {
      const diff = makeDiff(
        ['packages/frontend/src/App.tsx', 'packages/backend/src/server.ts'],
        false,
      );
      const scoped = scopeDiffToDir(diff, '.', allDirs);
      expect(scoped.changedFiles).toEqual([]);
      expect(scoped.hasChanges).toBe(false);
    });
  });

  describe('subdirectory scope', () => {
    it('filters to only files under the target dir', () => {
      const diff = makeDiff([
        'tsconfig.json',
        'packages/frontend/src/App.tsx',
        'packages/frontend/package.json',
        'packages/backend/src/server.ts',
      ]);

      const scoped = scopeDiffToDir(diff, 'packages/frontend', allDirs);
      expect(scoped.changedFiles).toEqual(['src/App.tsx', 'package.json']);
    });

    it('strips the dir prefix from file paths', () => {
      const diff = makeDiff(['packages/backend/src/db/models.ts']);
      const scoped = scopeDiffToDir(diff, 'packages/backend', allDirs);
      expect(scoped.changedFiles).toEqual(['src/db/models.ts']);
    });

    it('returns hasChanges=false when no files match', () => {
      const diff = makeDiff(['packages/frontend/src/App.tsx'], false);
      const scoped = scopeDiffToDir(diff, 'packages/backend', allDirs);
      expect(scoped.changedFiles).toEqual([]);
      expect(scoped.hasChanges).toBe(false);
    });

    it('preserves full diff text (does not filter hunks)', () => {
      const diff = makeDiff(['packages/frontend/src/App.tsx']);
      diff.committedDiff = 'full diff content here';

      const scoped = scopeDiffToDir(diff, 'packages/frontend', allDirs);
      expect(scoped.committedDiff).toBe('full diff content here');
    });
  });

  describe('edge cases', () => {
    it('does not match partial dir names', () => {
      const diff = makeDiff(['packages/front/src/index.ts']);
      const scoped = scopeDiffToDir(diff, 'packages/frontend', allDirs);
      expect(scoped.changedFiles).toEqual([]);
    });

    it('handles deeply nested config dirs', () => {
      const dirs = ['.', 'packages/frontend', 'packages/frontend/apps/web'];
      const diff = makeDiff([
        'packages/frontend/src/shared.ts',
        'packages/frontend/apps/web/src/page.tsx',
      ]);

      const frontendScoped = scopeDiffToDir(diff, 'packages/frontend', dirs);
      expect(frontendScoped.changedFiles).toContain('src/shared.ts');

      const webScoped = scopeDiffToDir(diff, 'packages/frontend/apps/web', dirs);
      expect(webScoped.changedFiles).toEqual(['src/page.tsx']);
    });

    it('updates summary correctly', () => {
      const diff = makeDiff(['packages/frontend/a.ts', 'packages/frontend/b.ts'], false);
      const scoped = scopeDiffToDir(diff, 'packages/frontend', allDirs);
      expect(scoped.summary).toContain('2 files changed');
    });
  });
});
