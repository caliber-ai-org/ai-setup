import { describe, it, expect } from 'vitest';
import { configContentSuggestsPinnedModel } from '../model-pinning.js';

function pinned(s: string): boolean {
  return configContentSuggestsPinnedModel(s.toLowerCase());
}

describe('configContentSuggestsPinnedModel', () => {
  it('detects CALIBER_MODEL and CALIBER_FAST_MODEL', () => {
    expect(pinned('Set CALIBER_MODEL for this repo.')).toBe(true);
    expect(pinned('use caliber_fast_model for quick tasks')).toBe(true);
  });

  it('detects Claude Code /model command (not path segments)', () => {
    expect(pinned('Use `/model` in Claude Code.')).toBe(true);
    expect(pinned('Run /model then pick Sonnet.')).toBe(true);
  });

  it('does not treat src/model paths as /model command', () => {
    expect(pinned('Edit `src/model/user.ts` for the schema.')).toBe(false);
    expect(pinned('See models in api/model/handler.go')).toBe(false);
  });

  it('detects named Claude and GPT models', () => {
    expect(pinned('Prefer claude-sonnet-4-6 for codegen.')).toBe(true);
    expect(pinned('Using gpt-4.1 for reviews.')).toBe(true);
    expect(pinned('sonnet-4.6 via Cursor seat')).toBe(true);
  });

  it('detects Claude effort levels', () => {
    expect(pinned('Use high effort for refactors.')).toBe(true);
    expect(pinned('low effort is fine for typos')).toBe(true);
  });

  it('avoids generic model: and effort: prose', () => {
    expect(pinned('Our data model: MVC with services.')).toBe(false);
    expect(pinned('effort: collaborative sprint planning')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(pinned('')).toBe(false);
  });
});
