import fs from 'fs';
import path from 'path';
import { CALIBER_DIR } from '../constants.js';

const DISMISSED_FILE = path.join(CALIBER_DIR, 'dismissed-checks.json');

function dismissedFilePath(dir?: string): string {
  return dir ? path.join(dir, CALIBER_DIR, 'dismissed-checks.json') : DISMISSED_FILE;
}

export interface DismissedCheck {
  id: string;
  reason: string;
  dismissedAt: string;
}

export function readDismissedChecks(dir?: string): DismissedCheck[] {
  try {
    const filePath = dismissedFilePath(dir);
    if (!fs.existsSync(filePath)) return [];
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return [];
  }
}

export function writeDismissedChecks(checks: DismissedCheck[]): void {
  if (!fs.existsSync(CALIBER_DIR)) {
    fs.mkdirSync(CALIBER_DIR, { recursive: true });
  }
  fs.writeFileSync(DISMISSED_FILE, JSON.stringify(checks, null, 2) + '\n');
}

export function getDismissedIds(dir?: string): Set<string> {
  return new Set(readDismissedChecks(dir).map(c => c.id));
}
