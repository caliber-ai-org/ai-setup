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
});
