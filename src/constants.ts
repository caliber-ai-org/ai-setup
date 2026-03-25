import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

export const AUTH_DIR = path.join(os.homedir(), '.caliber');
export const CALIBER_DIR = '.caliber';
export const MANIFEST_FILE = path.join(CALIBER_DIR, 'manifest.json');
export const BACKUPS_DIR = path.join(CALIBER_DIR, 'backups');

let _learningDirCache: string | null = null;

export function getLearningDir(): string {
  if (_learningDirCache) return _learningDirCache;
  try {
    const gitCommonDir = execSync('git rev-parse --git-common-dir', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    const mainRoot = path.dirname(path.resolve(gitCommonDir));
    _learningDirCache = path.join(mainRoot, CALIBER_DIR, 'learning');
  } catch {
    _learningDirCache = path.join(CALIBER_DIR, 'learning');
  }
  return _learningDirCache;
}
export const LEARNING_SESSION_FILE = 'current-session.jsonl';
export const LEARNING_STATE_FILE = 'state.json';
export const LEARNING_MAX_EVENTS = 500;
export const LEARNING_ROI_FILE = 'roi-stats.json';
export const PERSONAL_LEARNINGS_FILE = path.join(AUTH_DIR, 'personal-learnings.md');
export const LEARNING_FINALIZE_LOG = 'finalize.log';
export const LEARNING_LAST_ERROR_FILE = 'last-error.json';
export const MIN_SESSIONS_FOR_COMPARISON = 3;
