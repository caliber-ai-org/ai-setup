import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

vi.mock('fs');

import { readExistingConfigs } from '../existing-config.js';

describe('readExistingConfigs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(false);
  });

  it('reads cursor skills from .cursor/skills/*/SKILL.md', () => {
    const dir = '/project';

    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const s = String(p);
      if (s === path.join(dir, '.cursor', 'skills')) return true;
      if (s.endsWith('SKILL.md')) return true;
      return false;
    });

    vi.mocked(fs.readdirSync).mockReturnValue(['testing', 'deployment'] as any);

    vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => true } as fs.Stats);

    vi.mocked(fs.readFileSync).mockImplementation(((p: unknown) => {
      const s = String(p);
      if (s.includes('testing')) return '---\nname: Testing\n---\nTest instructions';
      if (s.includes('deployment')) return '---\nname: Deployment\n---\nDeploy instructions';
      return '';
    }) as any);

    const configs = readExistingConfigs(dir);

    expect(configs.cursorSkills).toBeDefined();
    expect(configs.cursorSkills).toHaveLength(2);
    expect(configs.cursorSkills![0].name).toBe('testing');
    expect(configs.cursorSkills![0].filename).toBe('SKILL.md');
    expect(configs.cursorSkills![0].content).toContain('Test instructions');
    expect(configs.cursorSkills![1].name).toBe('deployment');
  });

  it('returns undefined cursorSkills when directory does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const configs = readExistingConfigs('/project');
    expect(configs.cursorSkills).toBeUndefined();
  });
});
