import { describe, it, expect, vi } from 'vitest';
import { getFilesToWrite } from '../index.js';

vi.mock('fs');
vi.mock('../../constants.js', () => ({
  CALIBER_DIR: '.caliber',
  MANIFEST_FILE: '.caliber/manifest.json',
}));

describe('getFilesToWrite — Claude skills', () => {
  it('returns .claude/skills/{name}/SKILL.md matching writeClaudeConfig output', () => {
    const files = getFilesToWrite({
      targetAgent: ['claude'],
      claude: {
        claudeMd: '# Test',
        skills: [
          { name: 'my-skill', description: 'A skill', content: 'content' },
          { name: 'Another Skill!', description: 'B skill', content: 'content' },
        ],
      },
    });

    expect(files).toContain('.claude/skills/my-skill/SKILL.md');
    expect(files).toContain('.claude/skills/another-skill-/SKILL.md');
    expect(files).not.toContain('.claude/skills/my-skill.md');
    expect(files).not.toContain('.claude/skills/another-skill-.md');
  });
});
