import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

vi.mock('fs');
vi.mock('os', () => ({ default: { homedir: () => '/home/user' } }));

import {
  loadConfig,
  resolveFromEnv,
  readConfigFile,
  writeConfigFile,
  DEFAULT_MODELS,
  DEFAULT_FAST_MODELS,
  getFastModel,
  getMaxPromptTokens,
  MODEL_CONTEXT_WINDOWS,
} from '../config.js';

const CONFIG_DIR = path.join('/home/user', '.caliber');

describe('config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.MINIMAX_API_KEY;
    delete process.env.MINIMAX_BASE_URL;
    delete process.env.VERTEX_PROJECT_ID;
    delete process.env.GCP_PROJECT_ID;
    delete process.env.CALIBER_MODEL;
    delete process.env.OPENAI_BASE_URL;
    delete process.env.VERTEX_REGION;
    delete process.env.GCP_REGION;
    delete process.env.VERTEX_SA_CREDENTIALS;
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    delete process.env.CALIBER_USE_CURSOR_SEAT;
    delete process.env.CALIBER_USE_CLAUDE_CLI;
    delete process.env.CALIBER_FAST_MODEL;
    delete process.env.ANTHROPIC_SMALL_FAST_MODEL;

    vi.mocked(fs.existsSync).mockReturnValue(false);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('resolveFromEnv', () => {
    it('returns anthropic config when ANTHROPIC_API_KEY is set', () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
      const config = resolveFromEnv();
      expect(config).toEqual({
        provider: 'anthropic',
        apiKey: 'sk-ant-test',
        model: DEFAULT_MODELS.anthropic,
      });
    });

    it('returns vertex config when VERTEX_PROJECT_ID is set', () => {
      process.env.VERTEX_PROJECT_ID = 'my-project';
      const config = resolveFromEnv();
      expect(config).toEqual({
        provider: 'vertex',
        model: DEFAULT_MODELS.vertex,
        vertexProjectId: 'my-project',
        vertexRegion: 'us-east5',
        vertexCredentials: undefined,
      });
    });

    it('falls back to GCP_PROJECT_ID for vertex', () => {
      process.env.GCP_PROJECT_ID = 'gcp-project';
      const config = resolveFromEnv();
      expect(config?.provider).toBe('vertex');
      expect(config?.vertexProjectId).toBe('gcp-project');
    });

    it('returns openai config when OPENAI_API_KEY is set', () => {
      process.env.OPENAI_API_KEY = 'sk-openai-test';
      const config = resolveFromEnv();
      expect(config).toEqual({
        provider: 'openai',
        apiKey: 'sk-openai-test',
        model: DEFAULT_MODELS.openai,
        baseUrl: undefined,
      });
    });

    it('includes OPENAI_BASE_URL when set', () => {
      process.env.OPENAI_API_KEY = 'sk-test';
      process.env.OPENAI_BASE_URL = 'http://localhost:11434/v1';
      const config = resolveFromEnv();
      expect(config?.baseUrl).toBe('http://localhost:11434/v1');
    });

    it('respects CALIBER_MODEL override', () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
      process.env.CALIBER_MODEL = 'claude-opus-4-6';
      const config = resolveFromEnv();
      expect(config?.model).toBe('claude-opus-4-6');
    });

    it('prioritizes ANTHROPIC_API_KEY over OPENAI_API_KEY', () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
      process.env.OPENAI_API_KEY = 'sk-openai-test';
      const config = resolveFromEnv();
      expect(config?.provider).toBe('anthropic');
    });

    it('returns cursor config when CALIBER_USE_CURSOR_SEAT is set', () => {
      process.env.CALIBER_USE_CURSOR_SEAT = '1';
      const config = resolveFromEnv();
      expect(config).toEqual({
        provider: 'cursor',
        model: DEFAULT_MODELS.cursor,
      });
    });

    it('returns cursor config when CALIBER_USE_CURSOR_SEAT is "true"', () => {
      process.env.CALIBER_USE_CURSOR_SEAT = 'true';
      const config = resolveFromEnv();
      expect(config?.provider).toBe('cursor');
    });

    it('respects CALIBER_MODEL for cursor seat', () => {
      process.env.CALIBER_USE_CURSOR_SEAT = '1';
      process.env.CALIBER_MODEL = 'auto';
      const config = resolveFromEnv();
      expect(config).toEqual({
        provider: 'cursor',
        model: 'auto',
      });
    });

    it('returns claude-cli config when CALIBER_USE_CLAUDE_CLI is set', () => {
      process.env.CALIBER_USE_CLAUDE_CLI = '1';
      const config = resolveFromEnv();
      expect(config).toEqual({
        provider: 'claude-cli',
        model: DEFAULT_MODELS['claude-cli'],
      });
    });

    it('returns claude-cli config when CALIBER_USE_CLAUDE_CLI is "true"', () => {
      process.env.CALIBER_USE_CLAUDE_CLI = 'true';
      const config = resolveFromEnv();
      expect(config?.provider).toBe('claude-cli');
    });

    it('respects CALIBER_MODEL for claude-cli seat', () => {
      process.env.CALIBER_USE_CLAUDE_CLI = '1';
      process.env.CALIBER_MODEL = 'claude-sonnet-4-6';
      const config = resolveFromEnv();
      expect(config).toEqual({
        provider: 'claude-cli',
        model: 'claude-sonnet-4-6',
      });
    });

    it('prioritizes ANTHROPIC_API_KEY over VERTEX_PROJECT_ID', () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
      process.env.VERTEX_PROJECT_ID = 'my-project';
      const config = resolveFromEnv();
      expect(config?.provider).toBe('anthropic');
    });

    it('returns null when no env vars set', () => {
      expect(resolveFromEnv()).toBeNull();
    });

    it('includes vertex region and credentials from env', () => {
      process.env.VERTEX_PROJECT_ID = 'proj';
      process.env.VERTEX_REGION = 'us-central1';
      process.env.VERTEX_SA_CREDENTIALS = '{"type":"service_account"}';
      const config = resolveFromEnv();
      expect(config?.vertexRegion).toBe('us-central1');
      expect(config?.vertexCredentials).toBe('{"type":"service_account"}');
    });
  });

  describe('readConfigFile', () => {
    it('returns null when config file does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      expect(readConfigFile()).toBeNull();
    });

    it('parses valid config file', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          provider: 'anthropic',
          model: 'claude-sonnet-4-6',
          apiKey: 'sk-test',
        }) as any,
      );
      const config = readConfigFile();
      expect(config?.provider).toBe('anthropic');
      expect(config?.model).toBe('claude-sonnet-4-6');
    });

    it('returns null for invalid JSON', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      vi.mocked(fs.readFileSync).mockReturnValue('not json' as any);
      expect(readConfigFile()).toBeNull();
    });

    it('returns null for legacy config without provider field', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({ api_base: 'http://localhost', token: 'abc' }) as any,
      );
      expect(readConfigFile()).toBeNull();
    });

    it('returns null for unknown provider type', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({ provider: 'gemini', model: 'gemini-2' }) as any,
      );
      expect(readConfigFile()).toBeNull();
    });

    it('parses config file with cursor provider', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({ provider: 'cursor', model: 'default' }) as any,
      );
      const config = readConfigFile();
      expect(config?.provider).toBe('cursor');
      expect(config?.model).toBe('default');
    });

    it('parses config file with claude-cli provider', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({ provider: 'claude-cli', model: 'default' }) as any,
      );
      const config = readConfigFile();
      expect(config?.provider).toBe('claude-cli');
      expect(config?.model).toBe('default');
    });
  });

  describe('loadConfig', () => {
    it('returns env config when env vars are set', () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
      const config = loadConfig();
      expect(config?.provider).toBe('anthropic');
    });

    it('falls back to config file when no env vars', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({ provider: 'openai', model: 'gpt-5.4-mini', apiKey: 'sk-test' }) as any,
      );
      const config = loadConfig();
      expect(config?.provider).toBe('openai');
    });

    it('returns null when nothing is configured', () => {
      expect(loadConfig()).toBeNull();
    });

    it('config file takes priority over env vars', () => {
      process.env.OPENAI_API_KEY = 'sk-from-env';
      vi.mocked(fs.existsSync).mockReturnValue(true);

      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          provider: 'anthropic',
          model: 'claude-sonnet-4-6',
          apiKey: 'sk-from-file',
        }) as any,
      );
      const config = loadConfig();
      expect(config?.provider).toBe('anthropic');
      expect(config?.apiKey).toBe('sk-from-file');
    });

    it('falls back to env vars when no config file exists', () => {
      process.env.OPENAI_API_KEY = 'sk-from-env';
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const config = loadConfig();
      expect(config?.provider).toBe('openai');
      expect(config?.apiKey).toBe('sk-from-env');
    });
  });

  describe('writeConfigFile', () => {
    it('creates config directory if missing', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
      vi.mocked(fs.writeFileSync).mockReturnValue(undefined);

      writeConfigFile({ provider: 'anthropic', model: 'claude-sonnet-4-6', apiKey: 'sk-test' });

      expect(fs.mkdirSync).toHaveBeenCalledWith(CONFIG_DIR, { recursive: true });
    });

    it('trims API key whitespace', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.writeFileSync).mockReturnValue(undefined);

      writeConfigFile({ provider: 'anthropic', model: 'claude-sonnet-4-6', apiKey: '  sk-test  ' });

      const written = vi.mocked(fs.writeFileSync).mock.calls[0][1] as string;
      const parsed = JSON.parse(written);
      expect(parsed.apiKey).toBe('sk-test');
    });

    it('writes with restrictive permissions', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.writeFileSync).mockReturnValue(undefined);

      writeConfigFile({ provider: 'anthropic', model: 'test', apiKey: 'key' });

      const opts = vi.mocked(fs.writeFileSync).mock.calls[0][2] as { mode: number };
      expect(opts.mode).toBe(0o600);
    });
  });

  describe('DEFAULT_MODELS', () => {
    it('has defaults for all provider types', () => {
      expect(DEFAULT_MODELS.anthropic).toBeDefined();
      expect(DEFAULT_MODELS.vertex).toBeDefined();
      expect(DEFAULT_MODELS.openai).toBeDefined();
    });
  });

  describe('getFastModel', () => {
    it('returns CALIBER_FAST_MODEL when set', () => {
      process.env.CALIBER_FAST_MODEL = 'gpt-5.4-mini';
      expect(getFastModel()).toBe('gpt-5.4-mini');
    });

    it('falls back to ANTHROPIC_SMALL_FAST_MODEL', () => {
      process.env.ANTHROPIC_SMALL_FAST_MODEL = 'claude-haiku-4-5';
      expect(getFastModel()).toBe('claude-haiku-4-5');
    });

    it('prefers CALIBER_FAST_MODEL over ANTHROPIC_SMALL_FAST_MODEL', () => {
      process.env.CALIBER_FAST_MODEL = 'gpt-5.4-mini';
      process.env.ANTHROPIC_SMALL_FAST_MODEL = 'claude-haiku-4-5';
      expect(getFastModel()).toBe('gpt-5.4-mini');
    });

    it('returns undefined when neither is set and no provider configured', () => {
      expect(getFastModel()).toBeUndefined();
    });

    it('returns provider default for anthropic', () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
      expect(getFastModel()).toBe('claude-haiku-4-5-20251001');
    });

    it('returns provider default for vertex', () => {
      process.env.VERTEX_PROJECT_ID = 'my-project';
      expect(getFastModel()).toBe('claude-haiku-4-5-20251001');
    });

    it('returns provider default for openai', () => {
      process.env.OPENAI_API_KEY = 'sk-openai-test';
      expect(getFastModel()).toBe('gpt-5.4-mini');
    });

    it('returns cursor fast model default', () => {
      process.env.CALIBER_USE_CURSOR_SEAT = '1';
      expect(getFastModel()).toBe('gpt-5.3-codex-fast');
    });

    it('returns undefined for claude-cli provider', () => {
      process.env.CALIBER_USE_CLAUDE_CLI = '1';
      expect(getFastModel()).toBeUndefined();
    });

    it('ignores ANTHROPIC_SMALL_FAST_MODEL for cursor provider', () => {
      process.env.CALIBER_USE_CURSOR_SEAT = '1';
      process.env.ANTHROPIC_SMALL_FAST_MODEL = 'claude-haiku-4-5';
      expect(getFastModel()).toBe('gpt-5.3-codex-fast');
    });

    it('ignores ANTHROPIC_SMALL_FAST_MODEL for openai provider', () => {
      process.env.OPENAI_API_KEY = 'sk-test';
      process.env.ANTHROPIC_SMALL_FAST_MODEL = 'claude-haiku-4-5';
      expect(getFastModel()).toBe('gpt-5.4-mini');
    });

    it('config file fastModel overrides provider default', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          provider: 'anthropic',
          model: 'claude-sonnet-4-6',
          apiKey: 'sk-test',
          fastModel: 'custom-fast',
        }) as any,
      );
      expect(getFastModel()).toBe('custom-fast');
    });

    it('env var overrides config file fastModel and provider default', () => {
      process.env.CALIBER_FAST_MODEL = 'env-fast-model';
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
      vi.mocked(fs.existsSync).mockReturnValue(true);

      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          provider: 'anthropic',
          model: 'claude-sonnet-4-6',
          apiKey: 'sk-test',
          fastModel: 'config-fast',
        }) as any,
      );
      expect(getFastModel()).toBe('env-fast-model');
    });
  });

  describe('DEFAULT_FAST_MODELS', () => {
    it('has defaults for API providers only', () => {
      expect(DEFAULT_FAST_MODELS.anthropic).toBe('claude-haiku-4-5-20251001');
      expect(DEFAULT_FAST_MODELS.vertex).toBe('claude-haiku-4-5-20251001');
      expect(DEFAULT_FAST_MODELS.openai).toBe('gpt-5.4-mini');
      expect(DEFAULT_FAST_MODELS.cursor).toBe('gpt-5.3-codex-fast');
      expect(DEFAULT_FAST_MODELS['claude-cli']).toBeUndefined();
    });
  });

  describe('getMaxPromptTokens', () => {
    it('returns 120K for default Anthropic model (200K context * 0.6)', () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      vi.mocked(fs.existsSync).mockReturnValue(false);
      expect(getMaxPromptTokens()).toBe(120_000);
    });

    it('returns higher budget for GPT-4.1 (1M context)', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const budget = getMaxPromptTokens();
      expect(budget).toBe(300_000);
    });

    it('respects CALIBER_MODEL env var override', () => {
      process.env.CALIBER_MODEL = 'gpt-4o';
      process.env.ANTHROPIC_API_KEY = 'test-key';
      vi.mocked(fs.existsSync).mockReturnValue(false);
      // gpt-4o has 128K context → 128K * 0.6 = 76.8K
      expect(getMaxPromptTokens()).toBe(76_800);
    });

    it('falls back to default context window for unknown model', () => {
      process.env.CALIBER_MODEL = 'some-future-model';
      process.env.ANTHROPIC_API_KEY = 'test-key';
      vi.mocked(fs.existsSync).mockReturnValue(false);
      // Unknown model → 200K default → 120K
      expect(getMaxPromptTokens()).toBe(120_000);
    });

    it('never returns below MIN_PROMPT_TOKENS', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const budget = getMaxPromptTokens();
      expect(budget).toBeGreaterThanOrEqual(30_000);
    });

    it('caps at MAX_PROMPT_TOKENS_CAP', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const budget = getMaxPromptTokens();
      expect(budget).toBeLessThanOrEqual(300_000);
    });

    it('has context windows for all default models', () => {
      for (const model of Object.values(DEFAULT_MODELS)) {
        if (model === 'default') continue;
        expect(MODEL_CONTEXT_WINDOWS[model]).toBeDefined();
      }
    });
  });
});
