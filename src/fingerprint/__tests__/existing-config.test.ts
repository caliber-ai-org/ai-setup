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

    vi.mocked(fs.readdirSync).mockReturnValue([
      { name: 'testing', isDirectory: () => true },
      { name: 'deployment', isDirectory: () => true },
    ] as any);

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

  it('reads codex skills from .agents/skills/*/SKILL.md', () => {
    const dir = '/project';
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const s = String(p);
      return s === path.join(dir, '.agents', 'skills');
    });
    vi.mocked(fs.readdirSync).mockReturnValue([
      { name: 'api-routes', isDirectory: () => true },
    ] as any);
    vi.mocked(fs.readFileSync).mockReturnValue('API route skill content' as any);

    const configs = readExistingConfigs(dir);
    expect(configs.codexSkills).toHaveLength(1);
    expect(configs.codexSkills![0].name).toBe('api-routes');
  });

  it('reads opencode skills from .opencode/skills/*/SKILL.md', () => {
    const dir = '/project';
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const s = String(p);
      return s === path.join(dir, '.opencode', 'skills');
    });
    vi.mocked(fs.readdirSync).mockReturnValue([
      { name: 'testing', isDirectory: () => true },
    ] as any);
    vi.mocked(fs.readFileSync).mockReturnValue('Testing skill' as any);

    const configs = readExistingConfigs(dir);
    expect(configs.opencodeSkills).toHaveLength(1);
    expect(configs.opencodeSkills![0].name).toBe('testing');
  });

  it('reads copilot instructions', () => {
    const dir = '/project';
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      return String(p) === path.join(dir, '.github', 'copilot-instructions.md');
    });
    vi.mocked(fs.readFileSync).mockReturnValue('Copilot instructions content' as any);

    const configs = readExistingConfigs(dir);
    expect(configs.copilotInstructions).toBe('Copilot instructions content');
  });

  it('reads copilot instruction files', () => {
    const dir = '/project';
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      return String(p) === path.join(dir, '.github', 'instructions');
    });
    vi.mocked(fs.readdirSync).mockReturnValue(['typescript.instructions.md'] as any);
    vi.mocked(fs.readFileSync).mockReturnValue('TS instructions' as any);

    const configs = readExistingConfigs(dir);
    expect(configs.copilotInstructionFiles).toHaveLength(1);
    expect(configs.copilotInstructionFiles![0].filename).toBe('typescript.instructions.md');
  });
});
