import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

vi.mock('fs');

import { scanLocalState } from '../index.js';

describe('scanLocalState — cursor skills', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(false);
  });

  it('detects cursor skills in .cursor/skills/*/SKILL.md', () => {
    const dir = '/project';

    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const s = String(p);
      if (s === path.join(dir, '.cursor', 'skills')) return true;
      if (s === path.join(dir, '.cursor', 'skills', 'my-skill', 'SKILL.md')) return true;
      return false;
    });

    vi.mocked(fs.readdirSync).mockImplementation(((p: unknown) => {
      const s = String(p);
      if (s === path.join(dir, '.cursor', 'skills')) {
        return ['my-skill'];
      }
      return [];
    }) as any);

    vi.mocked(fs.readFileSync).mockReturnValue('---\nname: My Skill\n---\nContent' as any);

    const items = scanLocalState(dir);
    const cursorSkills = items.filter((i) => i.type === 'skill' && i.platform === 'cursor');

    expect(cursorSkills).toHaveLength(1);
    expect(cursorSkills[0].name).toBe('my-skill/SKILL.md');
    expect(cursorSkills[0].path).toBe(path.join(dir, '.cursor', 'skills', 'my-skill', 'SKILL.md'));
    expect(cursorSkills[0].contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('returns no cursor skills when directory does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const items = scanLocalState('/project');
    const cursorSkills = items.filter((i) => i.type === 'skill' && i.platform === 'cursor');
    expect(cursorSkills).toHaveLength(0);
  });
});
