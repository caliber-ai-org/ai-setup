import { describe, it, expect, vi, beforeEach } from 'vitest';
import { existsSync } from 'fs';
import { validateSetup, scoreAndRefine } from '../score-refine.js';
import type { ProjectStructure } from '../../scoring/utils.js';

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return { ...actual, existsSync: vi.fn() };
});

vi.mock('../../llm/index.js', () => ({
  llmCall: vi.fn(),
  getProvider: vi.fn(),
}));

vi.mock('../../llm/utils.js', () => ({
  stripMarkdownFences: (text: string) => text,
}));

import { llmCall } from '../../llm/index.js';

const mockExistsSync = existsSync as ReturnType<typeof vi.fn>;
const mockLlmCall = llmCall as ReturnType<typeof vi.fn>;

const emptyStructure: ProjectStructure = { dirs: [], files: [] };

function makeSetup(claudeMd: string): Record<string, unknown> {
  return {
    targetAgent: ['claude'],
    claude: { claudeMd },
    fileDescriptions: { 'CLAUDE.md': 'test' },
  };
}

function makeMultiSetup(claudeMd: string, cursorrules: string): Record<string, unknown> {
  return {
    targetAgent: ['claude', 'cursor'],
    claude: { claudeMd },
    cursor: { cursorrules },
    fileDescriptions: { 'CLAUDE.md': 'test', '.cursorrules': 'test' },
  };
}

function makeSetupWithSkills(
  claudeMd: string,
  skills: Array<{ name: string; description: string; content: string }>,
): Record<string, unknown> {
  return {
    targetAgent: ['claude'],
    claude: { claudeMd, skills },
    fileDescriptions: { 'CLAUDE.md': 'test' },
  };
}

// Content that passes ALL quality, density, and structure checks
const wellFormedContent = [
  '## Commands',
  '',
  '```bash',
  'npm run build',
  '```',
  '',
  '```bash',
  'npm run test',
  '```',
  '',
  '```bash',
  'npm run lint',
  '```',
  '',
  '## Architecture',
  '',
  '- Entry: `src/index.ts` → `src/app.ts`',
  '- Config: `tsconfig.json` and `package.json`',
  '- Tests: `src/__tests__/` with `vitest`',
  '',
  '## Conventions',
  '',
  '- Lint: `eslint` with config in `.eslintrc.js`',
  '- Format: `prettier` with `.prettierrc`',
  '- Run `npm run build` before `npm publish`',
].join('\n');

describe('validateSetup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(false);
  });

  it('returns no issues for a well-formed setup', () => {
    mockExistsSync.mockReturnValue(true);
    const setup = makeSetup(wellFormedContent);
    const issues = validateSetup(setup, '/project', undefined, emptyStructure);
    expect(issues).toHaveLength(0);
  });

  it('detects invalid references', () => {
    mockExistsSync.mockImplementation((path: string) => {
      if (typeof path === 'string' && path.includes('real-file.ts')) return true;
      return false;
    });

    const setup = makeSetup([
      '## Files',
      '',
      '- `src/real-file.ts` exists',
      '- `src/fake-file.ts` does not exist',
      '- `nonexistent/path/` missing',
    ].join('\n'));

    const issues = validateSetup(setup, '/project', undefined, emptyStructure);
    const refIssue = issues.find(i => i.check === 'References valid');
    expect(refIssue).toBeDefined();
    expect(refIssue!.fixInstruction).toContain('fake-file.ts');
    expect(refIssue!.fixInstruction).toContain('nonexistent/path');
    expect(refIssue!.pointsLost).toBeGreaterThan(0);
  });

  it('detects directory tree listings', () => {
    const treeLines = Array.from({ length: 15 }, (_, i) =>
      `│   ├── file${i}.ts`
    );
    const setup = makeSetup([
      '## Structure',
      '',
      '```',
      ...treeLines,
      '```',
    ].join('\n'));

    const issues = validateSetup(setup, '/project', undefined, emptyStructure);
    const treeIssue = issues.find(i => i.check === 'No directory tree listings');
    expect(treeIssue).toBeDefined();
    expect(treeIssue!.pointsLost).toBe(3);
  });

  it('detects missing code blocks', () => {
    mockExistsSync.mockReturnValue(true);
    const setup = makeSetup([
      '## Commands',
      '',
      '- Run `npm run build` to build',
      '- Run `npm run test` to test',
      '',
      '## Architecture',
      '',
      '- Entry: `src/index.ts`',
      '',
      '## Conventions',
      '',
      '- Use TypeScript',
    ].join('\n'));

    const issues = validateSetup(setup, '/project', undefined, emptyStructure);
    const blockIssue = issues.find(i => i.check === 'Executable content');
    expect(blockIssue).toBeDefined();
    expect(blockIssue!.pointsLost).toBeGreaterThan(0);
  });

  it('detects low concreteness', () => {
    const setup = makeSetup([
      '## Guidelines',
      '',
      'Always write clean code.',
      'Follow best practices for testing.',
      'Ensure code quality is maintained.',
      'Use proper error handling.',
      'Write documentation for all functions.',
      'Keep the codebase organized.',
      'Review code before merging.',
      'Test thoroughly before deploying.',
    ].join('\n'));

    const issues = validateSetup(setup, '/project', undefined, emptyStructure);
    const concIssue = issues.find(i => i.check === 'Concrete instructions');
    expect(concIssue).toBeDefined();
    expect(concIssue!.pointsLost).toBeGreaterThan(0);
  });

  it('returns empty for setup with no config content', () => {
    const setup = { targetAgent: ['claude'], claude: {} };
    const issues = validateSetup(setup, '/project', undefined, emptyStructure);
    expect(issues).toHaveLength(0);
  });

  it('sorts issues by points lost descending', () => {
    mockExistsSync.mockReturnValue(false);
    const setup = makeSetup([
      '## Stuff',
      '',
      'Generic prose line.',
      '- `src/nonexistent.ts` a path',
      '- `src/also-fake.ts` another path',
    ].join('\n'));

    const issues = validateSetup(setup, '/project', undefined, emptyStructure);
    for (let i = 1; i < issues.length; i++) {
      expect(issues[i - 1].pointsLost).toBeGreaterThanOrEqual(issues[i].pointsLost);
    }
  });

  // New checks

  it('detects low project grounding', () => {
    mockExistsSync.mockReturnValue(true);
    const setup = makeSetup([
      '## Commands',
      '',
      '```bash',
      'npm run build',
      '```',
      '',
      '## Architecture',
      '',
      '- Uses TypeScript',
      '',
      '## Conventions',
      '',
      '- Follow standard patterns',
    ].join('\n'));

    const structure: ProjectStructure = {
      dirs: ['src', 'tests', 'docs', 'scripts'],
      files: ['package.json', 'tsconfig.json', 'README.md'],
    };

    const issues = validateSetup(setup, '/project', undefined, structure);
    const groundingIssue = issues.find(i => i.check === 'Project grounding');
    expect(groundingIssue).toBeDefined();
    expect(groundingIssue!.pointsLost).toBeGreaterThan(0);
    expect(groundingIssue!.fixInstruction).toContain('src');
  });

  it('returns no grounding issue when dirs are mentioned', () => {
    mockExistsSync.mockReturnValue(true);
    const setup = makeSetup([
      '## Architecture',
      '',
      '- Source: `src/` · `tests/` · `docs/`',
      '- Config: `package.json` · `tsconfig.json` · `README.md`',
      '- Deploy: `scripts/`',
      '',
      '## Commands',
      '',
      '```bash',
      'npm test',
      '```',
      '',
      '```bash',
      'npm build',
      '```',
      '',
      '```bash',
      'npm lint',
      '```',
      '',
      '## Conventions',
      '',
      '- Use `eslint` and `prettier`',
    ].join('\n'));

    const structure: ProjectStructure = {
      dirs: ['src', 'tests', 'docs', 'scripts'],
      files: ['package.json', 'tsconfig.json', 'README.md'],
    };

    const issues = validateSetup(setup, '/project', undefined, structure);
    const groundingIssue = issues.find(i => i.check === 'Project grounding');
    expect(groundingIssue).toBeUndefined();
  });

  it('detects low reference density', () => {
    const setup = makeSetup([
      '## Overview',
      '',
      'This project uses standard patterns.',
      'Follow the coding conventions.',
      'Write tests for all features.',
      'Use proper error handling.',
      'Keep code organized.',
      '',
      '## Architecture',
      '',
      '- The source code is organized by feature',
      '',
      '## Conventions',
      '',
      '- Standard TypeScript practices',
    ].join('\n'));

    const issues = validateSetup(setup, '/project', undefined, emptyStructure);
    const densityIssue = issues.find(i => i.check === 'Reference density');
    expect(densityIssue).toBeDefined();
    expect(densityIssue!.pointsLost).toBeGreaterThan(0);
  });

  it('detects duplicate content between claude and cursor', () => {
    const sharedContent = [
      '## Commands',
      '',
      '- Run `npm run build` to build the project',
      '- Run `npm run test` to run tests',
      '- Run `npm run lint` to lint code',
      '',
      '## Architecture',
      '',
      '- Entry: `src/index.ts`',
      '- Config: `tsconfig.json`',
    ].join('\n');

    const setup = makeMultiSetup(sharedContent, sharedContent);
    const issues = validateSetup(setup, '/project', undefined, emptyStructure);
    const dupIssue = issues.find(i => i.check === 'No duplicate content');
    expect(dupIssue).toBeDefined();
    expect(dupIssue!.pointsLost).toBe(2);
  });

  it('detects low-quality skills', () => {
    mockExistsSync.mockImplementation((path: string) => {
      if (typeof path === 'string' && path.includes('nonexistent')) return false;
      return true;
    });

    const setup = makeSetupWithSkills(wellFormedContent, [
      {
        name: 'deploy-guide',
        description: 'Deployment instructions',
        content: [
          'Follow the deployment process.',
          'Make sure everything is ready.',
          'Use the correct environment variables.',
          'Check that the build succeeds.',
          'Deploy to the staging environment first.',
          'Verify the deployment was successful.',
          'Reference `src/nonexistent/path.ts` for config.',
        ].join('\n'),
      },
    ]);

    const issues = validateSetup(setup, '/project', undefined, emptyStructure);
    const skillIssue = issues.find(i => i.check === 'Skill quality: deploy-guide');
    expect(skillIssue).toBeDefined();
    expect(skillIssue!.pointsLost).toBe(0);
    expect(skillIssue!.detail).toContain('no code blocks');
  });

  it('includes enriched directory contents in grounding fix instruction', () => {
    mockExistsSync.mockReturnValue(true);
    const setup = makeSetup([
      '## Architecture',
      '',
      '- Generic description',
      '',
      '## Commands',
      '',
      '- Standard commands',
      '',
      '## Conventions',
      '',
      '- Follow conventions',
    ].join('\n'));

    const structure: ProjectStructure = {
      dirs: ['src', 'src/api', 'src/models', 'tests'],
      files: ['package.json', 'src/index.ts', 'src/api/routes.ts'],
    };

    const issues = validateSetup(setup, '/project', undefined, structure);
    const groundingIssue = issues.find(i => i.check === 'Project grounding');
    expect(groundingIssue).toBeDefined();
    // Fix instruction should include subdirectory contents
    expect(groundingIssue!.fixInstruction).toContain('api');
    expect(groundingIssue!.fixInstruction).toContain('models');
  });
});

describe('scoreAndRefine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(true);
  });

  it('returns setup unchanged when no issues found', async () => {
    const setup = makeSetup(wellFormedContent);

    const history: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    const result = await scoreAndRefine(setup, '/project', history);
    expect(result).toBe(setup);
    expect(mockLlmCall).not.toHaveBeenCalled();
  });

  it('calls llmCall with targeted content when issues are found', async () => {
    mockExistsSync.mockImplementation((path: string) => {
      if (typeof path === 'string' && path.includes('nonexistent')) return false;
      return true;
    });

    const originalSetup = makeSetup('## Files\n\n- `src/nonexistent.ts` bad ref\n- `src/index.ts` good ref\n- `tsconfig.json` good ref\n\n## Commands\n\n## Architecture\n\n## Conventions\n\n```bash\nnpm test\n```\n\n```bash\nnpm build\n```\n\n```bash\nnpm lint\n```');

    const fixedContent = '## Files\n\n- `src/index.ts` good ref\n- `tsconfig.json` good ref\n- `package.json` good ref\n\n## Commands\n\n## Architecture\n\n## Conventions\n\n```bash\nnpm test\n```\n\n```bash\nnpm build\n```\n\n```bash\nnpm lint\n```';

    mockLlmCall.mockResolvedValueOnce(JSON.stringify({ claudeMd: fixedContent }));

    const history: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    const result = await scoreAndRefine(originalSetup, '/project', history);

    expect(mockLlmCall).toHaveBeenCalled();
    const claude = result.claude as Record<string, unknown>;
    expect(claude.claudeMd).toBe(fixedContent);
    expect(history.length).toBeGreaterThanOrEqual(2);
  });

  it('returns best setup when refinement makes things worse', async () => {
    mockExistsSync.mockReturnValue(false);

    const originalSetup = makeSetup('## A\n\n## B\n\n## C\n\n- `src/one-bad.ts` ref\n\n```bash\nnpm test\n```\n\n```bash\nnpm build\n```\n\n```bash\nnpm lint\n```');
    const worseContent = '## A\n\n- `bad1.ts` ref\n- `bad2.ts` ref\n- `bad3.ts` ref';

    mockLlmCall.mockResolvedValueOnce(worseContent);
    mockLlmCall.mockResolvedValueOnce(worseContent);

    const history: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    const result = await scoreAndRefine(originalSetup, '/project', history);
    expect(result).toBe(originalSetup);
  });

  it('handles llmCall throwing gracefully', async () => {
    mockExistsSync.mockReturnValue(false);

    const setup = makeSetup('## A\n\n- `src/nonexistent.ts` ref');
    mockLlmCall.mockRejectedValueOnce(new Error('LLM error'));

    const history: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    const result = await scoreAndRefine(setup, '/project', history);
    expect(result).toBe(setup);
  });

  it('respects max iteration limit', async () => {
    mockExistsSync.mockReset();
    mockLlmCall.mockReset();
    mockExistsSync.mockImplementation((path: string) => {
      if (typeof path === 'string' && path.includes('fake')) return false;
      return true;
    });

    const baseContent = [
      '## Files',
      '',
      '- `src/fake.ts` bad ref',
      '- `src/other.ts` good ref',
      '- `src/another.ts` good ref',
    ].join('\n');
    const setup = makeSetup(baseContent);

    const stillBadContent = baseContent.replace('fake.ts', 'still-fake.ts');
    mockLlmCall.mockResolvedValue(JSON.stringify({ claudeMd: stillBadContent }));

    const history: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    await scoreAndRefine(setup, '/project', history);
    expect(mockLlmCall).toHaveBeenCalledTimes(2);
  });

  it('does not trigger LLM for zero-point-only issues', async () => {
    mockExistsSync.mockImplementation((path: string) => {
      if (typeof path === 'string' && path.includes('nonexistent')) return false;
      return true;
    });

    // Well-formed content with a low-quality skill (0 pts lost)
    const setup = makeSetupWithSkills(wellFormedContent, [
      {
        name: 'bad-skill',
        description: 'A vague skill',
        content: 'Follow best practices.\nWrite clean code.\nEnsure quality.\nMaintain standards.\nUse proper patterns.\nKeep things organized.\nReview everything.\nTest thoroughly.',
      },
    ]);

    const history: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    await scoreAndRefine(setup, '/project', history);
    expect(mockLlmCall).not.toHaveBeenCalled();
  });

  it('includes skills in fix when point-losing issues also exist', async () => {
    mockExistsSync.mockImplementation((path: string) => {
      if (typeof path === 'string' && path.includes('nonexistent')) return false;
      return true;
    });

    const setup = makeSetupWithSkills(
      '## A\n\n- `src/nonexistent.ts` ref\n\n## B\n\n## C',
      [{
        name: 'test-skill',
        description: 'A skill',
        content: [
          'This is generic advice.',
          'Be sure to follow standard practices.',
          'Write clean code always.',
          'Keep things organized properly.',
          'Always test before merging.',
          'Review code before deploying.',
          'Reference `src/nonexistent/config.ts` for details.',
        ].join('\n'),
      }],
    );

    const fixedMd = '## A\n\n- `src/index.ts` ref\n\n## B\n\n## C';
    mockLlmCall.mockResolvedValueOnce(JSON.stringify({
      claudeMd: fixedMd,
      'skill:test-skill': 'Fixed skill with `src/index.ts` ref.\n\n```bash\nnpm test\n```',
    }));

    const history: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    const result = await scoreAndRefine(setup, '/project', history);

    expect(mockLlmCall).toHaveBeenCalled();
    const prompt = mockLlmCall.mock.calls[0][0].prompt as string;
    expect(prompt).toContain('test-skill');

    const claude = result.claude as Record<string, unknown>;
    const skills = claude.skills as Array<{ name: string; content: string }>;
    const updatedSkill = skills.find(s => s.name === 'test-skill');
    expect(updatedSkill?.content).toContain('src/index.ts');
  });
});
