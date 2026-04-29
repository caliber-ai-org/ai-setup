import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execSync } from 'child_process';

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

const mockedExecSync = vi.mocked(execSync);

describe('BUILTIN_SKILLS content (F-P0-3 — no absolute paths)', () => {
  let originalArgv: string[];
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    originalArgv = [...process.argv];
    originalEnv = { ...process.env };
    const { resetResolvedCaliber } = await import('../resolve-caliber.js');
    resetResolvedCaliber();
    // Simulate a global install that returns a personal-looking absolute path.
    process.argv[1] = '/usr/local/bin/caliber';
    delete process.env.npm_execpath;
    mockedExecSync.mockReturnValue('/Users/someone/.nvm/versions/node/v20/bin/caliber\n');
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.env = originalEnv;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('find-skills SKILL.md does not contain absolute paths', async () => {
    const { BUILTIN_SKILLS } = await import('../builtin-skills.js');
    const skill = BUILTIN_SKILLS.find((s) => s.name === 'find-skills');
    expect(skill).toBeDefined();
    expect(skill!.content).not.toContain('/Users/');
    expect(skill!.content).not.toContain('.nvm/');
    expect(skill!.content).not.toMatch(/\/usr\/(local\/)?bin\//);
    expect(skill!.content).toContain('caliber skills');
  });

  it('save-learning SKILL.md does not contain absolute paths', async () => {
    const { BUILTIN_SKILLS } = await import('../builtin-skills.js');
    const skill = BUILTIN_SKILLS.find((s) => s.name === 'save-learning');
    expect(skill).toBeDefined();
    expect(skill!.content).not.toContain('/Users/');
    expect(skill!.content).not.toContain('.nvm/');
    expect(skill!.content).not.toMatch(/\/usr\/(local\/)?bin\//);
    expect(skill!.content).toContain('caliber learn add');
  });

  it('setup-caliber SKILL.md does not contain absolute paths', async () => {
    const { BUILTIN_SKILLS } = await import('../builtin-skills.js');
    const skill = BUILTIN_SKILLS.find((s) => s.name === 'setup-caliber');
    expect(skill).toBeDefined();
    expect(skill!.content).not.toContain('/Users/');
    expect(skill!.content).not.toContain('.nvm/');
  });
});
