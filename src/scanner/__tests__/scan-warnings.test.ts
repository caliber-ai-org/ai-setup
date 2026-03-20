import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

vi.mock('fs');

import { scanLocalState } from '../index.js';

describe('scanLocalState warnings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.mocked(fs.existsSync).mockReturnValue(false);
  });

  it('warns when .mcp.json cannot be parsed', () => {
    const dir = '/project';
    vi.mocked(fs.existsSync).mockImplementation((p) => String(p) === path.join(dir, '.mcp.json'));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(fs.readFileSync).mockReturnValue('{invalid-json' as any);

    const items = scanLocalState(dir);

    expect(items).toHaveLength(0);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Warning: .mcp.json scan skipped'));
  });

  it('warns when cursor skills directory cannot be read', () => {
    const dir = '/project';
    vi.mocked(fs.existsSync).mockImplementation((p) => String(p) === path.join(dir, '.cursor', 'skills'));
    vi.mocked(fs.readdirSync).mockImplementation(() => {
      throw new Error('EACCES');
    });

    scanLocalState(dir);

    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Warning: .cursor/skills scan skipped'));
  });
});
