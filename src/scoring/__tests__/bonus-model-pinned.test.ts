import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { checkBonus } from '../checks/bonus.js';

describe('checkBonus model_pinned', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'caliber-bonus-model-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function modelCheck() {
    const checks = checkBonus(dir);
    return checks.find((c) => c.id === 'model_pinned');
  }

  it('passes when CLAUDE.md mentions CALIBER_MODEL', () => {
    writeFileSync(join(dir, 'CLAUDE.md'), 'Use `CALIBER_MODEL` in CI.');
    expect(modelCheck()?.passed).toBe(true);
    expect(modelCheck()?.earnedPoints).toBeGreaterThan(0);
    expect(modelCheck()?.fix).toBeUndefined();
  });

  it('passes when AGENTS.md pins a model (codex-only setups)', () => {
    writeFileSync(join(dir, 'AGENTS.md'), 'Default: claude-sonnet-4-6');
    expect(modelCheck()?.passed).toBe(true);
  });

  it('fails when primary configs omit pinning', () => {
    writeFileSync(join(dir, 'CLAUDE.md'), '# Project\n\nGeneric docs only.');
    const c = modelCheck();
    expect(c?.passed).toBe(false);
    expect(c?.fix).toBeUndefined();
    expect(c?.suggestion).toBeDefined();
  });

  it('passes when .cursor/rules/*.mdc mentions /model', () => {
    const rules = join(dir, '.cursor', 'rules');
    mkdirSync(rules, { recursive: true });
    writeFileSync(join(rules, 'x.mdc'), 'Run /model to pick Sonnet.');
    expect(modelCheck()?.passed).toBe(true);
  });
});
