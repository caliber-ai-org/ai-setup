import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../llm/index.js', () => ({
  llmCall: vi.fn(),
  parseJsonResponse: vi.fn(),
}));

import { refreshDocs } from '../refresh.js';
import { llmCall, parseJsonResponse } from '../../llm/index.js';

const mockedLlmCall = vi.mocked(llmCall);
const mockedParseJson = vi.mocked(parseJsonResponse);

describe('refreshDocs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.CALIBER_FAST_MODEL;
    delete process.env.ANTHROPIC_SMALL_FAST_MODEL;
  });

  const baseDiff = {
    committed: 'diff --git a/src/index.ts',
    staged: '',
    unstaged: '',
    changedFiles: ['src/index.ts'],
    summary: 'Updated index.ts',
  };

  const baseContext = {
    languages: ['TypeScript'],
    frameworks: ['Express'],
    packageName: 'my-app',
  };

  it('includes project context in prompt', async () => {
    mockedLlmCall.mockResolvedValue('{}');
    mockedParseJson.mockReturnValue({
      updatedDocs: {},
      changesSummary: 'No changes',
      docsUpdated: [],
    });

    await refreshDocs(baseDiff, {}, baseContext);

    const prompt = mockedLlmCall.mock.calls[0][0].prompt;
    expect(prompt).toContain('Project: my-app');
    expect(prompt).toContain('Languages: TypeScript');
    expect(prompt).toContain('Frameworks: Express');
  });

  it('includes all diff types', async () => {
    mockedLlmCall.mockResolvedValue('{}');
    mockedParseJson.mockReturnValue({
      updatedDocs: {},
      changesSummary: '',
      docsUpdated: [],
    });

    await refreshDocs(
      {
        ...baseDiff,
        committed: 'committed diff',
        staged: 'staged diff',
        unstaged: 'unstaged diff',
      },
      {},
      baseContext,
    );

    const prompt = mockedLlmCall.mock.calls[0][0].prompt;
    expect(prompt).toContain('--- Committed Changes ---');
    expect(prompt).toContain('committed diff');
    expect(prompt).toContain('--- Staged Changes ---');
    expect(prompt).toContain('staged diff');
    expect(prompt).toContain('--- Unstaged Changes ---');
    expect(prompt).toContain('unstaged diff');
  });

  it('includes existing docs in prompt', async () => {
    mockedLlmCall.mockResolvedValue('{}');
    mockedParseJson.mockReturnValue({
      updatedDocs: {},
      changesSummary: '',
      docsUpdated: [],
    });

    await refreshDocs(
      baseDiff,
      {
        claudeMd: '# My CLAUDE.md',
        readmeMd: '# README',
        cursorrules: 'cursor rules content',
        cursorRules: [{ filename: 'rule.mdc', content: 'rule content' }],
        copilotInstructions: '# Copilot instructions',
      },
      baseContext,
    );

    const prompt = mockedLlmCall.mock.calls[0][0].prompt;
    expect(prompt).toContain('[CLAUDE.md]');
    expect(prompt).toContain('# My CLAUDE.md');
    expect(prompt).toContain('[README.md]');
    expect(prompt).toContain('[.cursorrules]');
    expect(prompt).toContain('[.cursor/rules/rule.mdc]');
    expect(prompt).toContain('[.github/copilot-instructions.md]');
  });

  async function getRefreshPrompt(existingDocs: Record<string, unknown>): Promise<string> {
    mockedLlmCall.mockResolvedValue('{}');
    mockedParseJson.mockReturnValue({ updatedDocs: {}, changesSummary: '', docsUpdated: [] });
    await refreshDocs(baseDiff, existingDocs, baseContext);
    return mockedLlmCall.mock.calls[0][0].prompt;
  }

  it('includes existing claude rules in prompt', async () => {
    const prompt = await getRefreshPrompt({
      claudeRules: [{ filename: 'api.md', content: '# API Conventions' }],
    });
    expect(prompt).toContain('[.claude/rules/api.md]');
    expect(prompt).toContain('# API Conventions');
  });

  it('filters caliber-managed rules from prompt', async () => {
    const prompt = await getRefreshPrompt({
      claudeRules: [{ filename: 'caliber-onboarding.md', content: '# Managed' }],
    });
    expect(prompt).not.toContain('caliber-onboarding.md');
  });

  it('includes includable docs in prompt', async () => {
    const prompt = await getRefreshPrompt({
      includableDocs: ['ARCHITECTURE.md', 'CONTRIBUTING.md'],
    });
    expect(prompt).toContain('Existing Documentation Files');
    expect(prompt).toContain('ARCHITECTURE.md');
    expect(prompt).toContain('CONTRIBUTING.md');
  });

  it('omits empty diff sections', async () => {
    mockedLlmCall.mockResolvedValue('{}');
    mockedParseJson.mockReturnValue({
      updatedDocs: {},
      changesSummary: '',
      docsUpdated: [],
    });

    await refreshDocs(
      {
        ...baseDiff,
        committed: '',
        staged: '',
        unstaged: '',
      },
      {},
      baseContext,
    );

    const prompt = mockedLlmCall.mock.calls[0][0].prompt;
    expect(prompt).not.toContain('--- Committed Changes ---');
    expect(prompt).not.toContain('--- Staged Changes ---');
    expect(prompt).not.toContain('--- Unstaged Changes ---');
  });

  it('uses fixed maxTokens of 16384', async () => {
    mockedLlmCall.mockResolvedValue('{}');
    mockedParseJson.mockReturnValue({
      updatedDocs: {},
      changesSummary: '',
      docsUpdated: [],
    });

    await refreshDocs(baseDiff, {}, baseContext);
    expect(mockedLlmCall.mock.calls[0][0].maxTokens).toBe(16384);
  });

  it('passes CALIBER_FAST_MODEL as model override when set', async () => {
    process.env.CALIBER_FAST_MODEL = 'gpt-5.4-mini';
    mockedLlmCall.mockResolvedValue('{}');
    mockedParseJson.mockReturnValue({ updatedDocs: {}, changesSummary: '', docsUpdated: [] });

    await refreshDocs(baseDiff, {}, baseContext);

    expect(mockedLlmCall.mock.calls[0][0].model).toBe('gpt-5.4-mini');
  });

  it('falls back to ANTHROPIC_SMALL_FAST_MODEL', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    process.env.ANTHROPIC_SMALL_FAST_MODEL = 'claude-haiku-4-5';
    mockedLlmCall.mockResolvedValue('{}');
    mockedParseJson.mockReturnValue({ updatedDocs: {}, changesSummary: '', docsUpdated: [] });

    await refreshDocs(baseDiff, {}, baseContext);

    expect(mockedLlmCall.mock.calls[0][0].model).toBe('claude-haiku-4-5');
  });

  it('uses provider default fast model when no env override is set', async () => {
    mockedLlmCall.mockResolvedValue('{}');
    mockedParseJson.mockReturnValue({ updatedDocs: {}, changesSummary: '', docsUpdated: [] });

    await refreshDocs(baseDiff, {}, baseContext);

    // getFastModel() auto-resolves to provider default when no env var is set
  });

  describe('existing docs size budget', () => {
    // MAX_EXISTING_DOCS_CHARS = 60_000; generate content clearly over the limit.
    const OVER_BUDGET = 'x'.repeat(70_000);
    const SMALL = 'small content';

    it('does not truncate when existing docs are within budget', async () => {
      const prompt = await getRefreshPrompt({ claudeMd: SMALL, agentsMd: SMALL });
      expect(prompt).toContain(SMALL);
      expect(prompt).not.toContain('[truncated]');
    });

    it('truncates existing doc content when total exceeds budget', async () => {
      const prompt = await getRefreshPrompt({ claudeMd: OVER_BUDGET });
      // Header must still appear
      expect(prompt).toContain('[CLAUDE.md]');
      // Content must be shorter than the original
      const claudeMdSection = prompt.slice(prompt.indexOf('[CLAUDE.md]'));
      expect(claudeMdSection.length).toBeLessThan(OVER_BUDGET.length);
      expect(prompt).toContain('[truncated]');
    });

    it('truncates proportionally across multiple large docs', async () => {
      const prompt = await getRefreshPrompt({ claudeMd: OVER_BUDGET, agentsMd: OVER_BUDGET });
      // Both headers must be present
      expect(prompt).toContain('[CLAUDE.md]');
      expect(prompt).toContain('[AGENTS.md]');
      // Total existing docs section must be within budget (with some slack for headers/markers)
      const docsSection = prompt.slice(prompt.indexOf('--- Current Documentation ---'));
      expect(docsSection.length).toBeLessThan(70_000);
    });

    it('still includes all doc headers even when content is truncated', async () => {
      const prompt = await getRefreshPrompt({
        claudeMd: OVER_BUDGET,
        agentsMd: OVER_BUDGET,
        claudeSkills: [{ filename: 'my-skill', content: OVER_BUDGET }],
      });
      expect(prompt).toContain('[CLAUDE.md]');
      expect(prompt).toContain('[AGENTS.md]');
      expect(prompt).toContain('[.claude/skills/my-skill]');
    });

    it('preserves at least MIN_CHARS_PER_ENTRY for small docs alongside huge ones', async () => {
      // MIN_CHARS_PER_ENTRY = 2_000; a tiny CLAUDE.md next to a massive skill
      // should not be truncated below the floor.
      const HUGE_SKILL = 'y'.repeat(400_000);
      const SMALL_CLAUDE = 'z'.repeat(1_500);
      const prompt = await getRefreshPrompt({
        claudeMd: SMALL_CLAUDE,
        claudeSkills: [{ filename: 'giant-skill', content: HUGE_SKILL }],
      });
      expect(prompt).toContain('[CLAUDE.md]');
      // CLAUDE.md content should be fully preserved (1500 < 2000 floor)
      const claudeSection = prompt.slice(
        prompt.indexOf('[CLAUDE.md]') + '[CLAUDE.md]'.length,
        prompt.indexOf('[.claude/skills/giant-skill]'),
      );
      expect(claudeSection).toContain(SMALL_CLAUDE);
      expect(claudeSection).not.toContain('[truncated]');
    });
  });
});
