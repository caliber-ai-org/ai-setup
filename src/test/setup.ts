import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { afterAll, beforeAll, vi } from 'vitest';

// Because hooks write under os.homedir(), tests must never see the real home.
const isolatedHome = path.join(os.tmpdir(), `caliber-test-home-${randomUUID()}`);
process.env.HOME = isolatedHome;
// Because fully skipped files run neither hook, they leave no directory behind.
beforeAll(() => fs.mkdirSync(isolatedHome, { recursive: true }));
afterAll(() => fs.rmSync(isolatedHome, { recursive: true, force: true }));

vi.mock('../llm/index.js', () => ({
  loadConfig: vi.fn().mockReturnValue({ provider: 'anthropic', model: 'claude-sonnet-4-6', apiKey: 'test-key' }),
  getProvider: vi.fn().mockReturnValue({
    call: vi.fn().mockResolvedValue('{}'),
    stream: vi.fn(),
  }),
  llmCall: vi.fn().mockResolvedValue('{}'),
  llmJsonCall: vi.fn().mockResolvedValue({}),
}));
