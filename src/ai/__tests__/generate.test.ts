import { describe, it, expect } from 'vitest';
import { buildGeneratePrompt, sampleFileTree } from '../generate.js';
import type { Fingerprint } from '../../fingerprint/index.js';

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

describe('buildGeneratePrompt', () => {
  it('says "Generate initial" when no existing configs', () => {
    const prompt = buildGeneratePrompt(makeFingerprint(), ['claude']);
    expect(prompt).toContain('Generate an initial coding agent configuration');
    expect(prompt).toContain('target: claude');
  });

  it('says "Audit and improve" when existing configs present', () => {
    const fp = makeFingerprint({
      existingConfigs: { claudeMd: '# My Project' },
    });
    const prompt = buildGeneratePrompt(fp, ['claude', 'cursor']);
    expect(prompt).toContain('Audit and improve the existing');
    expect(prompt).toContain('target: claude,cursor');
  });

  it('includes git remote, languages, frameworks', () => {
    const fp = makeFingerprint({
      gitRemoteUrl: 'https://github.com/test/repo',
      languages: ['TypeScript', 'Python'],
      frameworks: ['Next.js', 'FastAPI'],
    });
    const prompt = buildGeneratePrompt(fp, ['claude']);
    expect(prompt).toContain('Git remote: https://github.com/test/repo');
    expect(prompt).toContain('Languages: TypeScript, Python');
    expect(prompt).toContain('Frameworks: Next.js, FastAPI');
  });

  it('includes package name and description', () => {
    const fp = makeFingerprint({
      packageName: 'my-app',
      description: 'A cool app',
    });
    const prompt = buildGeneratePrompt(fp, ['claude']);
    expect(prompt).toContain('Package name: my-app');
    expect(prompt).toContain('Project description: A cool app');
  });

  it('caps file tree at 500 entries for large repos', () => {
    const fileTree = Array.from({ length: 600 }, (_, i) => `src/file-${i}.ts`);
    const fp = makeFingerprint({ fileTree });
    const prompt = buildGeneratePrompt(fp, ['claude']);
    expect(prompt).toContain('500/600');
    // Not all files fit
    const _included = fileTree.filter((f) => prompt.includes(f));
    expect(_included.length).toBe(500);
  });

  it('truncates CLAUDE.md content to 8000 chars', () => {
    const longContent = 'x'.repeat(10000);
    const fp = makeFingerprint({
      existingConfigs: { claudeMd: longContent },
    });
    const prompt = buildGeneratePrompt(fp, ['claude']);
    expect(prompt).toContain('truncated at 8000 chars');
    expect(prompt).not.toContain('x'.repeat(10000));
  });

  it('truncates README.md content to 8000 chars', () => {
    const longContent = 'r'.repeat(10000);
    const fp = makeFingerprint({
      existingConfigs: { readmeMd: longContent },
    });
    const prompt = buildGeneratePrompt(fp, ['claude']);
    expect(prompt).toContain('truncated at 8000 chars');
  });

  it('limits skills to 10 and each to 3000 chars', () => {
    const skills = Array.from({ length: 15 }, (_, i) => ({
      filename: `skill-${i}.md`,
      content: `s${i}-${'y'.repeat(4000)}`,
    }));
    const fp = makeFingerprint({
      existingConfigs: { claudeSkills: skills },
    });
    const prompt = buildGeneratePrompt(fp, ['claude']);
    expect(prompt).toContain('skill-0.md');
    expect(prompt).toContain('skill-9.md');
    expect(prompt).not.toContain('skill-10.md');
    expect(prompt).toContain('5 more skills omitted');
    expect(prompt).toContain('truncated at 3000 chars');
  });

  it('limits cursor rules to 10', () => {
    const rules = Array.from({ length: 12 }, (_, i) => ({
      filename: `rule-${i}.mdc`,
      content: `Rule ${i} content`,
    }));
    const fp = makeFingerprint({
      existingConfigs: { cursorRules: rules },
    });
    const prompt = buildGeneratePrompt(fp, ['cursor']);
    expect(prompt).toContain('rule-9.mdc');
    expect(prompt).not.toContain('rule-10.mdc');
    expect(prompt).toContain('2 more rules omitted');
  });

  it('includes project files with content', () => {
    const files = [
      { path: 'src/index.ts', content: 'export const app = "hello";', size: 27, priority: 40 },
      { path: 'package.json', content: '{"name": "test"}', size: 16, priority: 35 },
    ];
    const fp = makeFingerprint({
      codeAnalysis: {
        files,
        truncated: false,
        totalProjectTokens: 100,
        compressedTokens: 80,
        includedTokens: 100,
        filesAnalyzed: 2,
        filesIncluded: 2,
        duplicateGroups: 0,
      },
    });
    const prompt = buildGeneratePrompt(fp, ['claude']);
    expect(prompt).toContain('[src/index.ts]');
    expect(prompt).toContain('export const app');
    expect(prompt).toContain('[package.json]');
    expect(prompt).toContain('"name": "test"');
  });

  it('shows trimming info when truncated', () => {
    const _high = makeFingerprint({
      codeAnalysis: {
        files: [{ path: 'src/a.ts', content: 'const a = 1;', size: 12, priority: 15 }],
        truncated: true,
        totalProjectTokens: 200000,
        compressedTokens: 160000,
        includedTokens: 150000,
        filesAnalyzed: 500,
        filesIncluded: 300,
        duplicateGroups: 10,
      },
    });
    const prompt = buildGeneratePrompt(_high, ['claude']);
    expect(prompt).toContain('trimmed to');
    expect(prompt).toContain('150,000');
    expect(prompt).toContain('200,000');
    expect(prompt).toContain('75%');
  });

  it('includes user instructions', () => {
    const prompt = buildGeneratePrompt(makeFingerprint(), ['claude'], 'Focus on testing');
    expect(prompt).toContain('User instructions: Focus on testing');
  });

  it('caps total prompt size by trimming low-priority code analysis files', () => {
    const largeFiles = Array.from({ length: 200 }, (_, i) => ({
      path: `src/module-${i}.ts`,
      content: 'x'.repeat(5000),
      size: 5000,
      priority: 200 - i,
    }));
    const fp = makeFingerprint({
      codeAnalysis: {
        files: largeFiles,
        truncated: false,
        totalProjectTokens: 250000,
        compressedTokens: 200000,
        includedTokens: 250000,
        filesAnalyzed: 200,
        filesIncluded: 200,
        duplicateGroups: 0,
      },
    });
    const prompt = buildGeneratePrompt(fp, ['claude']);
    const tokenEstimate = Math.ceil(prompt.length / 4);
    expect(tokenEstimate).toBeLessThanOrEqual(120_000);
    expect(prompt).toContain('module-0.ts');
    expect(prompt).toContain('trimmed to');
  });

  it('keeps all code analysis files when under token budget', () => {
    const smallFiles = Array.from({ length: 5 }, (_, i) => ({
      path: `src/small-${i}.ts`,
      content: 'const x = 1;',
      size: 12,
      priority: 20,
    }));
    const fp = makeFingerprint({
      codeAnalysis: {
        files: smallFiles,
        truncated: false,
        totalProjectTokens: 100,
        compressedTokens: 80,
        includedTokens: 100,
        filesAnalyzed: 5,
        filesIncluded: 5,
        duplicateGroups: 0,
      },
    });
    const prompt = buildGeneratePrompt(fp, ['claude']);
    for (let i = 0; i < 5; i++) {
      expect(prompt).toContain(`small-${i}.ts`);
    }
  });

  it('keeps high-priority files and drops low-priority ones when over budget', () => {
    const contentSize = 4000;
    const highPriorityFiles = [
      { path: 'package.json', content: 'c'.repeat(contentSize), size: contentSize, priority: 100 },
      { path: 'src/index.ts', content: 'c'.repeat(contentSize), size: contentSize, priority: 90 },
      { path: 'src/app.ts', content: 'c'.repeat(contentSize), size: contentSize, priority: 80 },
    ];
    // Many low-priority test files that will blow the budget
    const lowPriorityFiles = Array.from({ length: 150 }, (_, i) => ({
      path: `src/__tests__/test-${i}.test.ts`,
      content: 'y'.repeat(contentSize),
      size: contentSize,
      priority: 5,
    }));
    // Feed them in WRONG order (low-priority first) to verify sort works
    const allFiles = [...lowPriorityFiles, ...highPriorityFiles];

    const fp = makeFingerprint({
      codeAnalysis: {
        files: allFiles,
        truncated: false,
        totalProjectTokens: 200000,
        compressedTokens: 160000,
        includedTokens: 150000,
        filesAnalyzed: 153,
        filesIncluded: 153,
        duplicateGroups: 0,
      },
    });
    const prompt = buildGeneratePrompt(fp, ['claude']);
    const tokenEstimate = Math.ceil(prompt.length / 4);
    expect(tokenEstimate).toBeLessThanOrEqual(120_000);

    // High-priority files must be included
    expect(prompt).toContain('[package.json]');
    expect(prompt).toContain('[src/index.ts]');
    expect(prompt).toContain('[src/app.ts]');

    // Not all low-priority test files can fit
    const testFileCount = Array.from({ length: 150 }, (_, i) => `test-${i}.test.ts`).filter(
      (name) => prompt.includes(name),
    ).length;
    expect(testFileCount).toBeLessThan(150);
    expect(testFileCount).toBeGreaterThan(0);
  });

  it('simulates a 14K-file repo with claude-cli constraints', () => {
    const fileTree = Array.from(
      { length: 14000 },
      (_, i) => `src/dir${Math.floor(i / 100)}/file-${i}.c`,
    );

    const codeFiles = Array.from({ length: 500 }, (_, i) => ({
      path: `src/dir${Math.floor(i / 10)}/file-${i}.c`,
      content: `void func_${i}() { /* implementation */ }\n`.repeat(20),
      size: 600,
      priority: Math.max(5, 40 - Math.floor(i / 20)),
    }));

    const fp = makeFingerprint({
      languages: ['C', 'Python', 'Rust', 'TypeScript'],
      frameworks: ['Zephyr RTOS', 'nRF Connect'],
      fileTree,
      existingConfigs: {
        claudeMd: '# Large Project\n' + 'x'.repeat(10000),
        readmeMd: '# README\n' + 'y'.repeat(10000),
      },
      codeAnalysis: {
        files: codeFiles,
        truncated: true,
        totalProjectTokens: 500000,
        compressedTokens: 300000,
        includedTokens: 250000,
        filesAnalyzed: 14000,
        filesIncluded: 500,
        duplicateGroups: 50,
      },
    });

    const prompt = buildGeneratePrompt(fp, ['claude']);
    const tokenEstimate = Math.ceil(prompt.length / 4);

    expect(tokenEstimate).toBeLessThanOrEqual(120_000);
    expect(prompt).toContain('500/14000');
    expect(prompt).toContain('truncated at 8000 chars');
    expect(prompt).toContain('file-0.c');
    expect(prompt).toContain('trimmed to');
  });

  it('handles 50K-file monorepo without exceeding prompt limits', () => {
    // Worst case: massive monorepo with 50K file tree, heavy code analysis,
    // large existing configs, many skills, and many dependencies
    const fileTree = Array.from(
      { length: 50000 },
      (_, i) => `packages/pkg-${Math.floor(i / 500)}/src/module-${i}.ts`,
    );

    // code-analysis.ts caps at TOKEN_BUDGET=80K (320K chars) but simulate
    // a payload that was already capped by analyzeCode
    const codeFiles = Array.from({ length: 1000 }, (_, i) => ({
      path: `packages/pkg-${Math.floor(i / 50)}/src/module-${i}.ts`,
      content: `export class Service${i} {\n  async handle() { return ${i}; }\n}\n`.repeat(10),
      size: 500,
      priority: Math.max(5, 40 - Math.floor(i / 50)),
    }));

    const skills = Array.from({ length: 15 }, (_, i) => ({
      filename: `skill-${i}.md`,
      content: `Skill content ${i}\n${'detail '.repeat(400)}`,
    }));

    const cursorRules = Array.from({ length: 12 }, (_, i) => ({
      filename: `rule-${i}.mdc`,
      content: `Rule ${i}\n${'rule detail '.repeat(200)}`,
    }));

    const fp = makeFingerprint({
      languages: ['TypeScript', 'Python', 'Go', 'Rust', 'Java', 'C++'],
      frameworks: ['Next.js', 'FastAPI', 'gRPC', 'React', 'Prisma'],
      tools: ['Docker', 'Kubernetes', 'Terraform', 'GitHub Actions', 'PostgreSQL'],
      fileTree,
      existingConfigs: {
        claudeMd: '# Monorepo\n' + 'x'.repeat(15000),
        agentsMd: '# Agents\n' + 'y'.repeat(12000),
        readmeMd: '# README\n' + 'z'.repeat(20000),
        claudeSkills: skills,
        cursorRules,
        cursorrules: '.cursorrules content\n' + 'w'.repeat(10000),
      },
      codeAnalysis: {
        files: codeFiles,
        truncated: true,
        totalProjectTokens: 2000000,
        compressedTokens: 1200000,
        includedTokens: 800000,
        filesAnalyzed: 50000,
        filesIncluded: 1000,
        duplicateGroups: 200,
      },
    });

    const prompt = buildGeneratePrompt(fp, ['claude', 'cursor', 'codex']);
    const tokenEstimate = Math.ceil(prompt.length / 4);

    // Hard cap: must never exceed 120K tokens
    expect(tokenEstimate).toBeLessThanOrEqual(120_000);

    // File tree capped at 500 out of 50K
    expect(prompt).toContain('500/50000');

    // All existing configs get truncated
    expect(prompt).toContain('truncated at 8000 chars');

    // Skills capped at 10
    expect(prompt).toContain('5 more skills omitted');

    // Cursor rules capped at 10
    expect(prompt).toContain('2 more rules omitted');

    // High-priority code files survive
    expect(prompt).toContain('module-0.ts');

    // Low-priority files are dropped
    expect(prompt).not.toContain('module-999.ts');

    // Trimming indicator shown
    expect(prompt).toContain('trimmed to');
  });
});

describe('sampleFileTree', () => {
  it('returns all entries when under limit', () => {
    const tree = ['src/', 'src/index.ts', 'package.json'];
    expect(sampleFileTree(tree, [], 500)).toEqual(tree);
  });

  it('distributes across monorepo packages with interleaved activity', () => {
    // Simulate getFileTree output: dirs sorted by activity, files sorted by mtime.
    // In a real monorepo with active development in all 5 packages, files from
    // different packages interleave by recency (e.g. commit touches files in multiple pkgs).
    const dirs = ['pkg-a/', 'pkg-b/', 'pkg-c/', 'pkg-d/', 'pkg-e/'];
    const pkgs = ['pkg-a', 'pkg-b', 'pkg-c', 'pkg-d', 'pkg-e'];
    const files: string[] = [];
    // Interleave: file-0 from each pkg, then file-1 from each, etc. (simulates equal activity)
    for (let i = 0; i < 200; i++) {
      for (const pkg of pkgs) {
        files.push(`${pkg}/src/file-${i}.ts`);
      }
    }
    const tree = [...dirs, ...files];

    const sampled = sampleFileTree(tree, [], 100);

    // Every package directory must appear
    for (const dir of dirs) {
      expect(sampled).toContain(dir);
    }

    // Files from ALL packages should be represented
    const packagesWithFiles = new Set(
      sampled.filter((e) => !e.endsWith('/')).map((e) => e.split('/')[0]),
    );
    expect(packagesWithFiles.size).toBe(5);
  });

  it('prioritizes active packages over dormant ones', () => {
    // pkg-active has all recently modified files (listed first by mtime)
    // pkg-dormant has old files (listed last)
    const dirs = ['pkg-active/', 'pkg-dormant/'];
    const activeFiles = Array.from({ length: 200 }, (_, i) => `pkg-active/src/file-${i}.ts`);
    const dormantFiles = Array.from({ length: 200 }, (_, i) => `pkg-dormant/src/file-${i}.ts`);
    const tree = [...dirs, ...activeFiles, ...dormantFiles];

    const sampled = sampleFileTree(tree, [], 50);

    const activeCount = sampled.filter(
      (e) => e.startsWith('pkg-active/') && !e.endsWith('/'),
    ).length;
    const dormantCount = sampled.filter(
      (e) => e.startsWith('pkg-dormant/') && !e.endsWith('/'),
    ).length;

    // Active package should have more files since they come first (most recent by mtime)
    expect(activeCount).toBeGreaterThan(dormantCount);
  });

  it('includes code analysis priority paths', () => {
    const dirs = ['src/', 'tests/'];
    const files = Array.from({ length: 600 }, (_, i) => `src/module-${i}.ts`);
    const tree = [...dirs, ...files];

    // These important files should be included even if they'd normally be pushed out
    const caPaths = ['src/module-500.ts', 'src/module-550.ts', 'src/module-599.ts'];

    const sampled = sampleFileTree(tree, caPaths, 100);

    for (const p of caPaths) {
      expect(sampled).toContain(p);
    }
  });

  it('always includes root-level files', () => {
    const dirs = ['src/', 'lib/'];
    const rootFiles = ['package.json', 'tsconfig.json', 'Makefile', 'Dockerfile', 'README.md'];
    const nested = Array.from({ length: 600 }, (_, i) => `src/file-${i}.ts`);
    const tree = [...dirs, ...rootFiles, ...nested];

    const sampled = sampleFileTree(tree, [], 100);

    for (const f of rootFiles) {
      expect(sampled).toContain(f);
    }
  });

  it('respects the limit', () => {
    const tree = Array.from(
      { length: 5000 },
      (_, i) => `src/dir${Math.floor(i / 100)}/file-${i}.ts`,
    );
    const sampled = sampleFileTree(tree, [], 500);
    expect(sampled.length).toBeLessThanOrEqual(500);
  });
});
