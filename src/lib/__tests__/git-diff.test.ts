import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { execSync as ExecSyncType } from 'child_process';

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

import { execSync } from 'child_process';
import { collectDiff } from '../git-diff.js';

const mockedExecSync = vi.mocked(execSync);

function makeExecSync(overrides: Record<string, string> = {}): typeof ExecSyncType {
  return ((cmd: unknown) => {
    const c = String(cmd);
    for (const [pattern, result] of Object.entries(overrides)) {
      if (c.includes(pattern)) return result;
    }
    return '';
  }) as unknown as typeof ExecSyncType;
}

describe('collectDiff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('caps changedFiles at 500 when untracked files are numerous', () => {
    const manyUntrackedFiles = Array.from({ length: 2000 }, (_, i) => `build/output-${i}.o`).join(
      '\n',
    );

    mockedExecSync.mockImplementation(
      makeExecSync({
        '--name-only': 'src/index.ts\nsrc/utils.ts',
        '--others': manyUntrackedFiles,
        '--cached --name-only': '',
        '--cached': '',
      }),
    );

    const result = collectDiff(null);
    expect(result.changedFiles.length).toBeLessThanOrEqual(500);
  });

  it('deduplicates files before applying the cap', () => {
    // Same file repeated across committed, staged, unstaged, and untracked lists
    const repeated = Array.from({ length: 600 }, (_, i) => `src/file-${i}.ts`).join('\n');

    mockedExecSync.mockImplementation(
      makeExecSync({
        '--name-only': repeated,
        '--others': repeated,
        '--cached --name-only': repeated,
        '--cached': '',
      }),
    );

    const result = collectDiff(null);
    // Dedup runs before cap, so result should have at most 500 unique entries
    expect(result.changedFiles.length).toBeLessThanOrEqual(500);
    const unique = new Set(result.changedFiles);
    expect(unique.size).toBe(result.changedFiles.length);
  });

  it('excludes doc patterns from changedFiles', () => {
    mockedExecSync.mockImplementation(
      makeExecSync({
        '--name-only': 'CLAUDE.md\nAGENTS.md\nsrc/index.ts',
        '--others': '',
        '--cached --name-only': '',
        '--cached': '',
      }),
    );

    const result = collectDiff(null);
    expect(result.changedFiles).not.toContain('CLAUDE.md');
    expect(result.changedFiles).not.toContain('AGENTS.md');
    expect(result.changedFiles).toContain('src/index.ts');
  });

  it('reports hasChanges=true when changedFiles are present', () => {
    mockedExecSync.mockImplementation(
      makeExecSync({
        '--name-only': 'src/app.ts',
        '--others': '',
        '--cached --name-only': '',
        '--cached': '',
      }),
    );

    const result = collectDiff(null);
    expect(result.hasChanges).toBe(true);
  });
});
