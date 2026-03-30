/**
 * src/fingerprint/__tests__/large-file-scan.test.ts
 *
 * Unit tests for scanLargeFiles().
 *
 * All tests use injected statSync / readdirSync stubs (same pattern as
 * src/ai/__tests__/detect.test.ts).  Zero disk I/O, zero temp files.
 *
 * Path handling: all VFS keys are normalized through path.normalize() so
 * tests pass on both POSIX (forward slash) and Windows (backslash).
 */

import path from 'path';
import { describe, it, expect } from 'vitest';
import {
  scanLargeFiles,
  DEFAULT_IGNORE_DIRS,
  DEFAULT_THRESHOLD_BYTES,
  type LargeFileWarning,
} from '../large-file-scan.js';

// ─── VFS builder ──────────────────────────────────────────────────────────────

const MiB = 1_048_576;

/**
 * Builds injected statSync / readdirSync stubs from a flat map.
 * Keys are POSIX-style absolute paths — internally normalized to the
 * platform separator so the stubs work correctly on Windows too.
 */
function buildVfs(tree: Record<string, number | 'dir'>) {
  // Normalize every key to the platform-native separator.
  const norm: Record<string, number | 'dir'> = {};
  for (const [k, v] of Object.entries(tree)) {
    norm[path.normalize(k)] = v;
  }

  function statSync(p: string) {
    const entry = norm[path.normalize(p)];
    if (entry === undefined) {
      throw Object.assign(
        new Error(`ENOENT: no such file — ${p}`),
        { code: 'ENOENT' },
      );
    }
    const isDir = entry === 'dir';
    return {
      isFile:      () => !isDir,
      isDirectory: () => isDir,
      size:        isDir ? 0 : (entry as number),
    };
  }

  function readdirSync(p: string) {
    const np = path.normalize(p);
    if (norm[np] !== 'dir') {
      throw Object.assign(
        new Error(`ENOTDIR: not a directory — ${p}`),
        { code: 'ENOTDIR' },
      );
    }
    // Build prefix with platform separator so startsWith works on Windows.
    const prefix = np.endsWith(path.sep) ? np : `${np}${path.sep}`;
    const children = new Set<string>();
    for (const abs of Object.keys(norm)) {
      if (abs === np) continue;
      if (!abs.startsWith(prefix)) continue;
      const rest  = abs.slice(prefix.length);
      const first = rest.split(path.sep)[0];
      if (first) children.add(first);
    }
    return [...children];
  }

  return { statSync, readdirSync };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('scanLargeFiles', () => {

  // ── Basic detection ──────────────────────────────────────────────────────

  it('returns empty array when no files exceed the threshold', () => {
    const { statSync, readdirSync } = buildVfs({
      '/project':          'dir',
      '/project/README.md': 500,
      '/project/src':      'dir',
      '/project/src/index.ts': 20_000,
    });

    const result = scanLargeFiles('/project', { statSync, readdirSync });

    expect(result).toHaveLength(0);
  });

  it('detects a single large file', () => {
    const { statSync, readdirSync } = buildVfs({
      '/project':           'dir',
      '/project/data.csv':  5 * MiB,
    });

    const result = scanLargeFiles('/project', { statSync, readdirSync });

    expect(result).toHaveLength(1);
    expect(result[0].filePath).toBe(path.normalize('/project/data.csv'));
    expect(result[0].sizeBytes).toBe(5 * MiB);
  });

  it('detects multiple large files across different subdirectories', () => {
    const { statSync, readdirSync } = buildVfs({
      '/project':                          'dir',
      '/project/data':                     'dir',
      '/project/data/dump.sqlite':         50 * MiB,
      '/project/notebooks':                'dir',
      '/project/notebooks/analysis.ipynb': 3 * MiB,
      '/project/src':                      'dir',
      '/project/src/index.ts':             10_000,   // small — must NOT appear
    });

    const result = scanLargeFiles('/project', { statSync, readdirSync });
    const paths  = result.map((w) => w.filePath).sort();

    expect(paths).toEqual([
      path.normalize('/project/data/dump.sqlite'),
      path.normalize('/project/notebooks/analysis.ipynb'),
    ]);
  });

  // ── Extension agnosticism ─────────────────────────────────────────────────

  it('warns about a large .json (no extension allowlist)', () => {
    const { statSync, readdirSync } = buildVfs({
      '/project':                   'dir',
      '/project/package-lock.json': 80 * MiB,
    });

    const result = scanLargeFiles('/project', { statSync, readdirSync });

    expect(result).toHaveLength(1);
    expect(result[0].filePath).toBe(path.normalize('/project/package-lock.json'));
  });

  it('does NOT warn about small files of any extension', () => {
    const { statSync, readdirSync } = buildVfs({
      '/project':              'dir',
      '/project/data.csv':     100,
      '/project/model.pkl':    900_000,   // 0.86 MiB — under 1 MiB default
      '/project/weights.npy':  500_000,
    });

    const result = scanLargeFiles('/project', { statSync, readdirSync });

    expect(result).toHaveLength(0);
  });

  // ── Threshold ─────────────────────────────────────────────────────────────

  it('respects a custom thresholdBytes', () => {
    const { statSync, readdirSync } = buildVfs({
      '/project':           'dir',
      '/project/small.bin': 400_000,
      '/project/large.bin': 2 * MiB,
    });

    const lowThreshold = scanLargeFiles('/project', {
      thresholdBytes: 300_000,
      statSync,
      readdirSync,
    });
    expect(lowThreshold).toHaveLength(2);

    const highThreshold = scanLargeFiles('/project', {
      thresholdBytes: 1 * MiB,
      statSync,
      readdirSync,
    });
    expect(highThreshold).toHaveLength(1);
    expect(highThreshold[0].filePath).toBe(path.normalize('/project/large.bin'));
  });

  it('exports DEFAULT_THRESHOLD_BYTES as exactly 1 MiB', () => {
    expect(DEFAULT_THRESHOLD_BYTES).toBe(1_048_576);
  });

  // ── Ignored directories ───────────────────────────────────────────────────

  it('skips node_modules by default', () => {
    const { statSync, readdirSync } = buildVfs({
      '/project':                          'dir',
      '/project/node_modules':             'dir',
      '/project/node_modules/bloat.wasm':  100 * MiB,
    });

    expect(scanLargeFiles('/project', { statSync, readdirSync })).toHaveLength(0);
  });

  it('skips .git by default', () => {
    const { statSync, readdirSync } = buildVfs({
      '/project':                          'dir',
      '/project/.git':                     'dir',
      '/project/.git/pack-objects.pack':   50 * MiB,
    });

    expect(scanLargeFiles('/project', { statSync, readdirSync })).toHaveLength(0);
  });

  it('skips every directory in DEFAULT_IGNORE_DIRS', () => {
    const tree: Record<string, number | 'dir'> = { '/project': 'dir' };
    for (const dir of DEFAULT_IGNORE_DIRS) {
      tree[`/project/${dir}`]          = 'dir';
      tree[`/project/${dir}/huge.bin`] = 200 * MiB;
    }
    const { statSync, readdirSync } = buildVfs(tree);

    expect(scanLargeFiles('/project', { statSync, readdirSync })).toHaveLength(0);
  });

  it('respects a custom ignoreDirs set', () => {
    const { statSync, readdirSync } = buildVfs({
      '/project':                  'dir',
      '/project/fixtures':         'dir',
      '/project/fixtures/seed.db': 10 * MiB,
    });

    // Without custom ignore — detected
    expect(
      scanLargeFiles('/project', { statSync, readdirSync }),
    ).toHaveLength(1);

    // With 'fixtures' added to ignore — skipped
    expect(
      scanLargeFiles('/project', {
        ignoreDirs: new Set([...DEFAULT_IGNORE_DIRS, 'fixtures']),
        statSync,
        readdirSync,
      }),
    ).toHaveLength(0);
  });

  // ── Return shape ──────────────────────────────────────────────────────────

  it('result objects have the correct shape', () => {
    const { statSync, readdirSync } = buildVfs({
      '/project':              'dir',
      '/project/weights.bin':  10 * MiB,
    });

    const result: LargeFileWarning[] = scanLargeFiles('/project', { statSync, readdirSync });

    expect(result[0]).toMatchObject<LargeFileWarning>({
      filePath:  path.normalize('/project/weights.bin'),
      sizeBytes: 10 * MiB,
      sizeMB:    '10.00',
    });
  });

  it('formats sizeMB to exactly 2 decimal places', () => {
    const { statSync, readdirSync } = buildVfs({
      '/project':          'dir',
      '/project/data.bin': Math.round(1.5 * MiB),   // 1.50 MiB
    });

    const result = scanLargeFiles('/project', { statSync, readdirSync });

    expect(result[0].sizeMB).toBe('1.50');
  });

  // ── Error handling ────────────────────────────────────────────────────────

  it('returns empty array when root dir is unreadable (EACCES)', () => {
    const statSync = (_p: string) => ({
      isFile: () => false, isDirectory: () => true, size: 0,
    });
    const readdirSync = (_p: string): string[] => {
      throw Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
    };

    expect(scanLargeFiles('/restricted', { statSync, readdirSync })).toHaveLength(0);
  });

  it('scans siblings when one subdirectory is denied (EACCES)', () => {
    const tree: Record<string, number | 'dir'> = {
      '/project':              'dir',
      '/project/open':         'dir',
      '/project/open/big.bin': 5 * MiB,
      '/project/secret':       'dir',
    };
    const { statSync } = buildVfs(tree);

    const readdirSync = (p: string): string[] => {
      const np = path.normalize(p);
      if (np === path.normalize('/project/secret')) {
        throw Object.assign(
          new Error('EACCES: permission denied'),
          { code: 'EACCES' },
        );
      }
      if (np === path.normalize('/project'))      return ['open', 'secret'];
      if (np === path.normalize('/project/open')) return ['big.bin'];
      return [];
    };

    const result = scanLargeFiles('/project', { statSync, readdirSync });

    expect(result).toHaveLength(1);
    expect(result[0].filePath).toBe(path.normalize('/project/open/big.bin'));
  });

  it('re-throws unexpected errors from readdirSync', () => {
    const statSync = (_p: string) => ({
      isFile: () => false, isDirectory: () => true, size: 0,
    });
    const readdirSync = (_p: string): string[] => {
      throw new Error('unexpected disk failure');   // no .code → re-thrown
    };

    expect(
      () => scanLargeFiles('/project', { statSync, readdirSync }),
    ).toThrow('unexpected disk failure');
  });

  it('skips broken symlinks silently (statSync throws for child)', () => {
    const readdirSync = (p: string): string[] => {
      if (path.normalize(p) === path.normalize('/project')) return ['broken-link.csv'];
      return [];
    };
    const statSync = (p: string) => {
      if (path.normalize(p) === path.normalize('/project')) {
        return { isFile: () => false, isDirectory: () => true, size: 0 };
      }
      throw Object.assign(new Error('ENOENT: dangling symlink'), { code: 'ENOENT' });
    };

    expect(scanLargeFiles('/project', { statSync, readdirSync })).toHaveLength(0);
  });

});
