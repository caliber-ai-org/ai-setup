import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execSync, spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

vi.mock('child_process');
vi.mock('fs');

import { detectAvailableEditors, openDiffsInEditor } from '../editor.js';

const IS_WINDOWS = process.platform === 'win32';
const whichCmd = IS_WINDOWS ? 'where' : 'which';

describe('detectAvailableEditors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('not found');
    });
  });

  it('returns cursor and terminal when cursor is available', () => {
    vi.mocked(execSync).mockImplementation((cmd) => {
      if (String(cmd) === `${whichCmd} cursor`) return Buffer.from('/usr/local/bin/cursor');
      throw new Error('not found');
    });

    expect(detectAvailableEditors()).toEqual(['cursor', 'terminal']);
  });

  it('returns vscode and terminal when code is available', () => {
    vi.mocked(execSync).mockImplementation((cmd) => {
      if (String(cmd) === `${whichCmd} code`) return Buffer.from('/usr/local/bin/code');
      throw new Error('not found');
    });

    expect(detectAvailableEditors()).toEqual(['vscode', 'terminal']);
  });

  it('returns all three when both editors are available', () => {
    vi.mocked(execSync).mockImplementation((cmd) => {
      const s = String(cmd);
      if (s === `${whichCmd} cursor`) return Buffer.from('/usr/local/bin/cursor');
      if (s === `${whichCmd} code`) return Buffer.from('/usr/local/bin/code');
      throw new Error('not found');
    });

    expect(detectAvailableEditors()).toEqual(['cursor', 'vscode', 'terminal']);
  });

  it('returns only terminal when no editors are available', () => {
    expect(detectAvailableEditors()).toEqual(['terminal']);
  });
});

describe('openDiffsInEditor', () => {
  const mockUnref = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(spawn).mockReturnValue({ unref: mockUnref } as unknown as ReturnType<typeof spawn>);
  });

  it('opens diff for modified files using --diff with original path', () => {
    openDiffsInEditor('cursor', [
      { originalPath: '/project/CLAUDE.md', proposedPath: '/tmp/proposed/CLAUDE.md' },
    ]);

    if (IS_WINDOWS) {
      // quoteForWindows only wraps when whitespace/quotes are present; these
      // paths have neither, so cmd.exe parses them correctly unquoted.
      expect(spawn).toHaveBeenCalledWith(
        'cursor --diff /project/CLAUDE.md /tmp/proposed/CLAUDE.md',
        { shell: true, stdio: 'ignore', detached: true },
      );
    } else {
      expect(spawn).toHaveBeenCalledWith(
        'cursor',
        ['--diff', '/project/CLAUDE.md', '/tmp/proposed/CLAUDE.md'],
        { stdio: 'ignore', detached: true },
      );
    }
    expect(mockUnref).toHaveBeenCalled();
  });

  it('quotes Windows paths that contain spaces (the actual bug quoteForWindows fixes)', () => {
    if (!IS_WINDOWS) return; // Windows-specific path-quoting test
    openDiffsInEditor('cursor', [
      {
        originalPath: 'C:\\Program Files\\foo\\bar.md',
        proposedPath: 'C:\\Users\\First Last\\Desktop\\bar.md',
      },
    ]);
    expect(spawn).toHaveBeenCalledWith(
      'cursor --diff "C:\\Program Files\\foo\\bar.md" "C:\\Users\\First Last\\Desktop\\bar.md"',
      { shell: true, stdio: 'ignore', detached: true },
    );
  });

  it('opens new files with --diff against empty temp file', () => {
    openDiffsInEditor('vscode', [{ proposedPath: '/tmp/proposed/new.md' }]);

    const expectedTempPath = path.join(os.tmpdir(), 'caliber-diff', 'new.md');
    expect(fs.mkdirSync).toHaveBeenCalled();
    expect(fs.writeFileSync).toHaveBeenCalledWith(expectedTempPath, '');

    if (IS_WINDOWS) {
      // quoteForWindows wraps the temp path only if it contains whitespace.
      // The Windows runner happens to land in C:\Users\RUNNER~1\... (no spaces
      // after the short-path mangling), so the result is unquoted. On a
      // contributor box where USERNAME has spaces, the path WOULD be wrapped.
      // The 'spaces' test below explicitly verifies the wrapping branch.
      expect(spawn).toHaveBeenCalledWith(`code --diff ${expectedTempPath} /tmp/proposed/new.md`, {
        shell: true,
        stdio: 'ignore',
        detached: true,
      });
    } else {
      expect(spawn).toHaveBeenCalledWith(
        'code',
        ['--diff', expectedTempPath, '/tmp/proposed/new.md'],
        { stdio: 'ignore', detached: true },
      );
    }
  });

  it('continues on error for individual files', () => {
    vi.mocked(spawn)
      .mockImplementationOnce(() => {
        throw new Error('failed');
      })
      .mockReturnValueOnce({ unref: mockUnref } as unknown as ReturnType<typeof spawn>);

    openDiffsInEditor('cursor', [
      { proposedPath: '/tmp/proposed/a.md' },
      { proposedPath: '/tmp/proposed/b.md' },
    ]);

    expect(spawn).toHaveBeenCalledTimes(2);
  });
});
