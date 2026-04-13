import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

vi.mock('fs');
vi.mock('../../constants.js', () => ({
  CALIBER_DIR: '.caliber',
  MANIFEST_FILE: '.caliber/manifest.json',
  BACKUPS_DIR: '.caliber/backups',
}));

import { stageFiles, getStagedProposedDir, cleanupStaging } from '../staging.js';

describe('staging', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(false);
  });

  describe('stageFiles', () => {
    it('creates proposed files and counts new vs modified', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false).mockReturnValueOnce(false); // cleanup check

      const files = [
        { path: 'CLAUDE.md', content: '# Hello' },
        { path: '.cursor/skills/testing/SKILL.md', content: '---\nname: testing\n---' },
      ];

      const result = stageFiles(files, '/project');

      expect(fs.mkdirSync).toHaveBeenCalled();
      expect(fs.writeFileSync).toHaveBeenCalledTimes(2);
      expect(result.newFiles).toBe(2);
      expect(result.modifiedFiles).toBe(0);
    });

    it('copies existing files to current dir and counts as modified', () => {
      // First call: cleanup existsSync for staged dir = false
      // Then for each file: existsSync is called twice (normalize check + staging check)
      vi.mocked(fs.existsSync)
        .mockReturnValueOnce(false) // cleanup: staged dir doesn't exist
        .mockReturnValueOnce(true) // normalize: CLAUDE.md exists in project
        .mockReturnValueOnce(true); // staging: CLAUDE.md exists in project

      // Existing file has different content so it counts as modified
      vi.mocked(fs.readFileSync).mockReturnValueOnce('# Old content');

      const files = [{ path: 'CLAUDE.md', content: '# Updated' }];

      const result = stageFiles(files, '/project');

      expect(fs.copyFileSync).toHaveBeenCalledWith(
        path.join('/project', 'CLAUDE.md'),
        expect.stringContaining('current'),
      );
      expect(result.newFiles).toBe(0);
      expect(result.modifiedFiles).toBe(1);
    });
  });

  describe('getStagedProposedDir', () => {
    it('returns the proposed directory path', () => {
      const dir = getStagedProposedDir();
      expect(dir).toContain('staged');
      expect(dir).toContain('proposed');
    });
  });

  describe('cleanupStaging', () => {
    it('removes staged directory if it exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      cleanupStaging();
      expect(fs.rmSync).toHaveBeenCalledWith(expect.stringContaining('staged'), {
        recursive: true,
        force: true,
      });
    });

    it('does nothing if staged directory does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      cleanupStaging();
      expect(fs.rmSync).not.toHaveBeenCalled();
    });
  });
});
