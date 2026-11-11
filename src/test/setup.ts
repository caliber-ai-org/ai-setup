import { afterAll, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';

const testHome = mkdtempSync(join(os.tmpdir(), 'caliber-test-home-'));

afterAll(() => rmSync(testHome, { recursive: true, force: true }));

vi.mock('os', async (importOriginal) => {
  const originalOs = await importOriginal<typeof import('os')>();
  const testOs = { ...originalOs, homedir: () => testHome };
  return { ...testOs, default: testOs };
});

vi.mock('../llm/index.js', () => ({
  loadConfig: vi
    .fn()
    .mockReturnValue({ provider: 'anthropic', model: 'claude-sonnet-4-6', apiKey: 'test-key' }),
  getProvider: vi.fn().mockReturnValue({
    call: vi.fn().mockResolvedValue('{}'),
    stream: vi.fn(),
  }),
  llmCall: vi.fn().mockResolvedValue('{}'),
  llmJsonCall: vi.fn().mockResolvedValue({}),
}));
