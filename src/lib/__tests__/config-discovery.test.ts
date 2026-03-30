import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { discoverConfigDirs, hasConfigFiles } from '../config-discovery.js';

describe('config-discovery', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'caliber-config-discovery-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('hasConfigFiles', () => {
    it('returns true when CLAUDE.md exists', () => {
      fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), '# Config');
      expect(hasConfigFiles(tmpDir)).toBe(true);
    });

    it('returns true when AGENTS.md exists', () => {
      fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), '# Agents');
      expect(hasConfigFiles(tmpDir)).toBe(true);
    });

    it('returns true when .cursorrules exists', () => {
      fs.writeFileSync(path.join(tmpDir, '.cursorrules'), 'rules');
      expect(hasConfigFiles(tmpDir)).toBe(true);
    });

    it('returns true when .cursor/rules/ dir exists', () => {
      fs.mkdirSync(path.join(tmpDir, '.cursor', 'rules'), { recursive: true });
      expect(hasConfigFiles(tmpDir)).toBe(true);
    });

    it('returns true when .github/copilot-instructions.md exists', () => {
      fs.mkdirSync(path.join(tmpDir, '.github'), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, '.github', 'copilot-instructions.md'), '# Copilot');
      expect(hasConfigFiles(tmpDir)).toBe(true);
    });

    it('returns true when .opencode/skills dir exists', () => {
      fs.mkdirSync(path.join(tmpDir, '.opencode', 'skills'), { recursive: true });
      expect(hasConfigFiles(tmpDir)).toBe(true);
    });

    it('returns false for empty directory', () => {
      expect(hasConfigFiles(tmpDir)).toBe(false);
    });

    it('returns false for directory with unrelated files', () => {
      fs.writeFileSync(path.join(tmpDir, 'package.json'), '{}');
      fs.writeFileSync(path.join(tmpDir, 'README.md'), '# Readme');
      expect(hasConfigFiles(tmpDir)).toBe(false);
    });
  });

  describe('discoverConfigDirs', () => {
    it('returns ["."] for a single-project repo with root configs', () => {
      fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), '# Config');
      expect(discoverConfigDirs(tmpDir)).toEqual(['.']);
    });

    it('returns empty array when no configs exist anywhere', () => {
      fs.writeFileSync(path.join(tmpDir, 'package.json'), '{}');
      expect(discoverConfigDirs(tmpDir)).toEqual([]);
    });

    it('discovers configs in subdirectories', () => {
      fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), '# Root');
      const frontend = path.join(tmpDir, 'packages', 'frontend');
      const backend = path.join(tmpDir, 'packages', 'backend');
      fs.mkdirSync(frontend, { recursive: true });
      fs.mkdirSync(backend, { recursive: true });
      fs.writeFileSync(path.join(frontend, 'CLAUDE.md'), '# Frontend');
      fs.writeFileSync(path.join(backend, 'CLAUDE.md'), '# Backend');

      const result = discoverConfigDirs(tmpDir);
      expect(result).toContain('.');
      expect(result).toContain('packages/frontend');
      expect(result).toContain('packages/backend');
      expect(result).toHaveLength(3);
    });

    it('ignores node_modules', () => {
      fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), '# Root');
      const nmDir = path.join(tmpDir, 'node_modules', 'some-pkg');
      fs.mkdirSync(nmDir, { recursive: true });
      fs.writeFileSync(path.join(nmDir, 'CLAUDE.md'), '# Should be ignored');

      expect(discoverConfigDirs(tmpDir)).toEqual(['.']);
    });

    it('ignores .git directories', () => {
      fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), '# Root');
      const gitDir = path.join(tmpDir, '.git', 'hooks');
      fs.mkdirSync(gitDir, { recursive: true });
      fs.writeFileSync(path.join(gitDir, 'CLAUDE.md'), '# Should be ignored');

      expect(discoverConfigDirs(tmpDir)).toEqual(['.']);
    });

    it('ignores dist and build directories', () => {
      fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), '# Root');
      for (const dir of ['dist', 'build']) {
        const d = path.join(tmpDir, dir);
        fs.mkdirSync(d, { recursive: true });
        fs.writeFileSync(path.join(d, 'CLAUDE.md'), '# Ignored');
      }

      expect(discoverConfigDirs(tmpDir)).toEqual(['.']);
    });

    it('respects max depth', () => {
      fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), '# Root');
      // Create a deeply nested dir beyond max depth (4)
      const deepDir = path.join(tmpDir, 'a', 'b', 'c', 'd', 'e');
      fs.mkdirSync(deepDir, { recursive: true });
      fs.writeFileSync(path.join(deepDir, 'CLAUDE.md'), '# Too deep');

      const result = discoverConfigDirs(tmpDir);
      expect(result).not.toContain('a/b/c/d/e');
    });

    it('returns sorted results', () => {
      fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), '# Root');
      const zebra = path.join(tmpDir, 'zebra');
      const alpha = path.join(tmpDir, 'alpha');
      fs.mkdirSync(zebra);
      fs.mkdirSync(alpha);
      fs.writeFileSync(path.join(zebra, 'CLAUDE.md'), '# Z');
      fs.writeFileSync(path.join(alpha, 'CLAUDE.md'), '# A');

      const result = discoverConfigDirs(tmpDir);
      expect(result).toEqual(['.', 'alpha', 'zebra']);
    });

    it('handles overlapping parent and child configs', () => {
      fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), '# Root');
      const parent = path.join(tmpDir, 'packages', 'frontend');
      const child = path.join(tmpDir, 'packages', 'frontend', 'apps', 'web');
      fs.mkdirSync(parent, { recursive: true });
      fs.mkdirSync(child, { recursive: true });
      fs.writeFileSync(path.join(parent, 'CLAUDE.md'), '# Frontend');
      fs.writeFileSync(path.join(child, 'CLAUDE.md'), '# Web');

      const result = discoverConfigDirs(tmpDir);
      expect(result).toContain('.');
      expect(result).toContain('packages/frontend');
      expect(result).toContain('packages/frontend/apps/web');
    });

    it('discovers cursor rules as config markers', () => {
      const pkg = path.join(tmpDir, 'packages', 'api');
      fs.mkdirSync(path.join(pkg, '.cursor', 'rules'), { recursive: true });

      const result = discoverConfigDirs(tmpDir);
      expect(result).toContain('packages/api');
    });
  });
});
