import { describe, it, expect } from 'vitest';
import { getFilesToWrite } from '../index.js';

describe('getFilesToWrite', () => {
    it('returns skill paths matching the OpenSkills directory format', () => {
        const files = getFilesToWrite({
            targetAgent: ['claude'],
            claude: {
                claudeMd: '# Test',
                skills: [
                    { name: 'My Skill', description: 'desc', content: 'body' },
                    { name: 'another-one', description: 'desc', content: 'body' },
                ],
            },
        });

        expect(files).toContain('.claude/skills/my-skill/SKILL.md');
        expect(files).toContain('.claude/skills/another-one/SKILL.md');
        expect(files).not.toContain('.claude/skills/my-skill.md');
        expect(files).not.toContain('.claude/skills/another-one.md');
    });

    it('returns opencode skill paths', () => {
        const files = getFilesToWrite({
            targetAgent: ['opencode'],
            opencode: {
                agentsMd: '# Test',
                skills: [
                    { name: 'my-skill', description: 'desc', content: 'body' },
                ],
            },
        });

        expect(files).toContain('AGENTS.md');
        expect(files).toContain('.opencode/skills/my-skill/SKILL.md');
    });

    it('avoids duplicate AGENTS.md when codex and opencode are both targeted', () => {
        const files = getFilesToWrite({
            targetAgent: ['codex', 'opencode'],
            codex: { agentsMd: '# Test', skills: [] },
            opencode: { agentsMd: '# Test', skills: [] },
        });

        const agentsMdCount = files.filter(f => f === 'AGENTS.md').length;
        expect(agentsMdCount).toBe(1);
    });
});
