import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  mkdirSync,
  rmSync,
  existsSync,
  statSync,
} from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { writeClaudeConfig } from '../writers/claude/index.js';
import { getFilesToWrite } from '../writers/index.js';
import { computeLocalScore } from '../scoring/index.js';
import { readExistingConfigs, CALIBER_MANAGED_PREFIX } from '../fingerprint/existing-config.js';
import { buildGeneratePrompt } from '../ai/generate.js';
import type { Fingerprint } from '../fingerprint/index.js';

function makeFingerprint(overrides: Partial<Fingerprint> = {}): Fingerprint {
  return {
    languages: [],
    frameworks: [],
    tools: [],
    fileTree: [],
    existingConfigs: {},
    ...overrides,
  };
}

// ── Rules: Init → Disk ────────────────────────────────────────────────

describe('Claude rules: init to disk', () => {
  let dir: string;
  let origCwd: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'caliber-claude-int-'));
    origCwd = process.cwd();
    process.chdir(dir);
  });

  afterEach(() => {
    process.chdir(origCwd);
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes claude rules to .claude/rules/ with correct content', () => {
    const ruleContent = '---\npaths:\n  - src/api/**\n---\n\n# API Conventions\n\n- Use REST\n';
    const written = writeClaudeConfig({
      claudeMd: '# Project',
      rules: [{ filename: 'api-conventions.md', content: ruleContent }],
    });

    expect(written).toContain(join('.claude', 'rules', 'api-conventions.md'));
    const onDisk = readFileSync(join(dir, '.claude', 'rules', 'api-conventions.md'), 'utf-8');
    expect(onDisk).toBe(ruleContent);
  });

  it('writes skill frontmatter with paths when provided', () => {
    writeClaudeConfig({
      claudeMd: '# Project',
      skills: [
        {
          name: 'api-routes',
          description: 'API route patterns',
          content: '# API Routes\n\nCreate routes in src/routes/',
          paths: ['src/api/**', 'src/routes/**'],
        },
      ],
    });

    const skillContent = readFileSync(
      join(dir, '.claude', 'skills', 'api-routes', 'SKILL.md'),
      'utf-8',
    );
    expect(skillContent).toContain('paths:');
    expect(skillContent).toContain('  - src/api/**');
    expect(skillContent).toContain('  - src/routes/**');
  });

  it('omits paths from skill frontmatter when not provided', () => {
    writeClaudeConfig({
      claudeMd: '# Project',
      skills: [
        {
          name: 'general',
          description: 'General workflow',
          content: '# General\n\nFollow conventions.',
        },
      ],
    });

    const skillContent = readFileSync(
      join(dir, '.claude', 'skills', 'general', 'SKILL.md'),
      'utf-8',
    );
    expect(skillContent).not.toContain('paths:');
  });
});

// ── Rules: getFilesToWrite ─────────────────────────────────────────────

describe('Claude rules: manifest tracking', () => {
  it('includes claude rules in getFilesToWrite', () => {
    const files = getFilesToWrite({
      targetAgent: ['claude'],
      claude: {
        claudeMd: '# Project',
        rules: [{ filename: 'api.md', content: '# API' }],
        skills: [],
      },
    });

    expect(files).toContain('.claude/rules/api.md');
  });

  it('includes CLAUDE.md alongside rules', () => {
    const files = getFilesToWrite({
      targetAgent: ['claude'],
      claude: {
        claudeMd: '# Project',
        rules: [{ filename: 'testing.md', content: '# Testing' }],
      },
    });

    expect(files).toContain('CLAUDE.md');
    expect(files).toContain('.claude/rules/testing.md');
  });
});

// ── Rules: Scoring ─────────────────────────────────────────────────────

describe('Claude rules: scoring', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'caliber-score-rules-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('scores points when claude rules exist', () => {
    mkdirSync(join(dir, '.claude', 'rules'), { recursive: true });
    writeFileSync(
      join(dir, '.claude', 'rules', 'api.md'),
      '---\npaths:\n  - src/api/**\n---\n\n# API\n',
    );

    const result = computeLocalScore(dir, ['claude']);
    const check = result.checks.find((c) => c.id === 'claude_rules_exist');
    expect(check).toBeDefined();
    expect(check!.earnedPoints).toBe(3);
    expect(check!.passed).toBe(true);
  });

  it('excludes caliber-managed rules from scoring', () => {
    mkdirSync(join(dir, '.claude', 'rules'), { recursive: true });
    writeFileSync(
      join(dir, '.claude', 'rules', `${CALIBER_MANAGED_PREFIX}onboarding.md`),
      '# Managed',
    );

    const result = computeLocalScore(dir, ['claude']);
    const check = result.checks.find((c) => c.id === 'claude_rules_exist');
    expect(check).toBeDefined();
    expect(check!.earnedPoints).toBe(0);
  });

  it('excludes claude_rules_exist for non-claude targets', () => {
    const result = computeLocalScore(dir, ['cursor']);
    const ids = result.checks.map((c) => c.id);
    expect(ids).not.toContain('claude_rules_exist');
  });
});

// ── Existing Config Detection ──────────────────────────────────────────

describe('Existing config detection', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'caliber-config-detect-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('reads claude rules from .claude/rules/', () => {
    mkdirSync(join(dir, '.claude', 'rules'), { recursive: true });
    const content = '---\npaths:\n  - src/api/**\n---\n\n# API Conventions\n';
    writeFileSync(join(dir, '.claude', 'rules', 'api.md'), content);

    const configs = readExistingConfigs(dir);
    expect(configs.claudeRules).toBeDefined();
    expect(configs.claudeRules).toHaveLength(1);
    expect(configs.claudeRules![0].filename).toBe('api.md');
    expect(configs.claudeRules![0].content).toBe(content);
  });

  it('detects includable documentation files', () => {
    writeFileSync(join(dir, 'ARCHITECTURE.md'), '# Architecture');
    writeFileSync(join(dir, 'CONTRIBUTING.md'), '# Contributing');

    const configs = readExistingConfigs(dir);
    expect(configs.includableDocs).toBeDefined();
    expect(configs.includableDocs).toContain('ARCHITECTURE.md');
    expect(configs.includableDocs).toContain('CONTRIBUTING.md');
  });

  it('does not include non-existent docs in includableDocs', () => {
    const configs = readExistingConfigs(dir);
    expect(configs.includableDocs).toBeUndefined();
  });
});

// ── Init Prompt: Rules + Includable Docs ───────────────────────────────

describe('Init prompt includes new context', () => {
  it('includes existing claude rules in generation prompt', () => {
    const fp = makeFingerprint({
      existingConfigs: {
        claudeMd: '# Project',
        claudeRules: [{ filename: 'api.md', content: '# API Conventions' }],
      },
    });

    const prompt = buildGeneratePrompt(fp, ['claude']);
    expect(prompt).toContain('[.claude/rules/api.md]');
    expect(prompt).toContain('# API Conventions');
  });

  it('includes includable docs in generation prompt', () => {
    const fp = makeFingerprint({
      existingConfigs: {
        claudeMd: '# Project',
        includableDocs: ['ARCHITECTURE.md', 'CONTRIBUTING.md'],
      },
    });

    const prompt = buildGeneratePrompt(fp, ['claude']);
    expect(prompt).toContain('Existing Documentation Files');
    expect(prompt).toContain('ARCHITECTURE.md');
    expect(prompt).toContain('CONTRIBUTING.md');
  });

  it('treats claudeRules as existing config for audit mode', () => {
    const fp = makeFingerprint({
      existingConfigs: {
        claudeRules: [{ filename: 'api.md', content: '# API' }],
      },
    });

    const prompt = buildGeneratePrompt(fp, ['claude']);
    expect(prompt).toContain('Audit and improve');
  });
});

// ── Hook Script Content Validation ─────────────────────────────────────

describe('Hook script correctness', () => {
  let dir: string;
  let origCwd: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'caliber-hooks-int-'));
    origCwd = process.cwd();
    process.chdir(dir);
  });

  afterEach(() => {
    process.chdir(origCwd);
    rmSync(dir, { recursive: true, force: true });
  });

  it('SessionStart hook references correct state file path', async () => {
    const { installSessionStartHook } = await import('../lib/hooks.js');
    installSessionStartHook();

    const scriptPath = join(dir, '.claude', 'hooks', 'caliber-session-freshness.sh');
    expect(existsSync(scriptPath)).toBe(true);

    const script = readFileSync(scriptPath, 'utf-8');
    expect(script).toContain('.caliber/.caliber-state.json');
    expect(script).not.toContain('".caliber/state.json"');
  });

  it('SessionStart hook outputs systemMessage (not notification)', async () => {
    const { installSessionStartHook } = await import('../lib/hooks.js');
    installSessionStartHook();

    const script = readFileSync(
      join(dir, '.claude', 'hooks', 'caliber-session-freshness.sh'),
      'utf-8',
    );
    expect(script).toContain('"systemMessage"');
    expect(script).not.toMatch(/"notification"\s*:/);
  });

  it('Stop hook outputs decision:block', async () => {
    const { installStopHook } = await import('../lib/hooks.js');
    installStopHook();

    const script = readFileSync(join(dir, '.claude', 'hooks', 'caliber-check-sync.sh'), 'utf-8');
    expect(script).toContain('"decision":"block"');
  });

  it.skipIf(process.platform === 'win32')('SessionStart hook is executable', async () => {
    const { installSessionStartHook } = await import('../lib/hooks.js');
    installSessionStartHook();

    const scriptPath = join(dir, '.claude', 'hooks', 'caliber-session-freshness.sh');
    const stat = statSync(scriptPath);
    expect(stat.mode & 0o111).toBeGreaterThan(0);
  });

  it('createScriptHook install is idempotent', async () => {
    const { installSessionStartHook } = await import('../lib/hooks.js');

    const first = installSessionStartHook();
    expect(first.installed).toBe(true);

    const second = installSessionStartHook();
    expect(second.installed).toBe(false);
    expect(second.alreadyInstalled).toBe(true);

    const settings = JSON.parse(readFileSync(join(dir, '.claude', 'settings.json'), 'utf-8'));
    expect(settings.hooks.SessionStart).toHaveLength(1);
  });

  it('createScriptHook remove cleans up script and settings', async () => {
    const { installSessionStartHook, removeSessionStartHook } = await import('../lib/hooks.js');

    installSessionStartHook();
    const scriptPath = join(dir, '.claude', 'hooks', 'caliber-session-freshness.sh');
    expect(existsSync(scriptPath)).toBe(true);

    const result = removeSessionStartHook();
    expect(result.removed).toBe(true);
    expect(existsSync(scriptPath)).toBe(false);

    const settings = JSON.parse(readFileSync(join(dir, '.claude', 'settings.json'), 'utf-8'));
    expect(settings.hooks?.SessionStart).toBeUndefined();
  });
});

// ── CALIBER_MANAGED_PREFIX consistency ─────────────────────────────────

describe('CALIBER_MANAGED_PREFIX usage', () => {
  it('prefix is caliber-', () => {
    expect(CALIBER_MANAGED_PREFIX).toBe('caliber-');
  });
});
