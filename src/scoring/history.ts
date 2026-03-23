import fs from 'fs';
import path from 'path';
import { CALIBER_DIR } from '../constants.js';
import type { ScoreResult, TargetAgent } from './index.js';

const HISTORY_FILE = 'score-history.jsonl';
const MAX_ENTRIES = 500;
const TRIM_THRESHOLD = MAX_ENTRIES + 50;

export interface ScoreEntry {
  timestamp: string;
  score: number;
  grade: string;
  targetAgent: TargetAgent;
  trigger: 'init' | 'regenerate' | 'refresh' | 'score' | 'manual';
}

function historyFilePath(): string {
  return path.join(CALIBER_DIR, HISTORY_FILE);
}

export function recordScore(result: ScoreResult, trigger: ScoreEntry['trigger']): void {
  const entry: ScoreEntry = {
    timestamp: new Date().toISOString(),
    score: result.score,
    grade: result.grade,
    targetAgent: [...result.targetAgent],
    trigger,
  };

  try {
    fs.mkdirSync(CALIBER_DIR, { recursive: true });
    const filePath = historyFilePath();
    fs.appendFileSync(filePath, JSON.stringify(entry) + '\n');

    // Trim only when well past the limit to avoid read+rewrite on every call
    const stat = fs.statSync(filePath);
    if (stat.size > TRIM_THRESHOLD * 120) {
      const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean);
      if (lines.length > MAX_ENTRIES) {
        fs.writeFileSync(filePath, lines.slice(-MAX_ENTRIES).join('\n') + '\n');
      }
    }
  } catch { /* best effort — don't break the calling command */ }
}

export function readScoreHistory(): ScoreEntry[] {
  const filePath = historyFilePath();
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const entries: ScoreEntry[] = [];
    for (const line of content.split('\n')) {
      if (!line) continue;
      try {
        entries.push(JSON.parse(line) as ScoreEntry);
      } catch { /* skip corrupt lines */ }
    }
    return entries;
  } catch {
    return [];
  }
}

export interface ScoreTrend {
  direction: 'up' | 'down' | 'stable';
  delta: number;
  entries: number;
  firstScore: number;
  lastScore: number;
}

export function getScoreTrend(entries: ScoreEntry[]): ScoreTrend | null {
  if (entries.length < 2) return null;

  const first = entries[0];
  const last = entries[entries.length - 1];
  const delta = last.score - first.score;

  return {
    direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'stable',
    delta,
    entries: entries.length,
    firstScore: first.score,
    lastScore: last.score,
  };
}
