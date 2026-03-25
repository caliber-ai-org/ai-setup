import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'caliber-notif-test-'));

vi.mock('../../constants.js', async () => {
  const actual = await vi.importActual<typeof import('../../constants.js')>('../../constants.js');
  return {
    ...actual,
    getLearningDir: () => tmpBase,
  };
});

import { writeFinalizeSummary, checkPendingNotifications } from '../notifications.js';
import type { FinalizeSummary } from '../notifications.js';

const NOTIFICATION_FILE = path.join(tmpBase, 'last-finalize-summary.json');

describe('writeFinalizeSummary', () => {
  beforeEach(() => {
    if (fs.existsSync(NOTIFICATION_FILE)) fs.unlinkSync(NOTIFICATION_FILE);
  });

  afterEach(() => {
    if (fs.existsSync(NOTIFICATION_FILE)) fs.unlinkSync(NOTIFICATION_FILE);
  });

  it('writes valid JSON file', () => {
    const summary: FinalizeSummary = {
      timestamp: '2026-01-01T00:00:00Z',
      newItemCount: 2,
      newItems: ['- **[Pattern]** use strict mode', '- **[Fix]** check types'],
      wasteTokens: 500,
    };
    writeFinalizeSummary(summary);

    expect(fs.existsSync(NOTIFICATION_FILE)).toBe(true);
    const written = JSON.parse(fs.readFileSync(NOTIFICATION_FILE, 'utf-8'));
    expect(written.newItemCount).toBe(2);
    expect(written.newItems).toHaveLength(2);
  });

  it('creates directory if missing', () => {
    expect(() => writeFinalizeSummary({
      timestamp: '2026-01-01T00:00:00Z',
      newItemCount: 0,
      newItems: [],
      wasteTokens: 0,
    })).not.toThrow();
  });
});

describe('checkPendingNotifications', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    if (fs.existsSync(NOTIFICATION_FILE)) fs.unlinkSync(NOTIFICATION_FILE);
  });

  afterEach(() => {
    logSpy.mockRestore();
    if (fs.existsSync(NOTIFICATION_FILE)) fs.unlinkSync(NOTIFICATION_FILE);
  });

  it('does nothing when no file exists', () => {
    checkPendingNotifications();
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('displays summary and deletes file', () => {
    const summary: FinalizeSummary = {
      timestamp: '2026-01-01T00:00:00Z',
      newItemCount: 2,
      newItems: ['- **[Pattern]** use strict mode', '- **[Fix]** check types'],
      wasteTokens: 500,
    };
    fs.writeFileSync(NOTIFICATION_FILE, JSON.stringify(summary));

    checkPendingNotifications();

    expect(logSpy).toHaveBeenCalled();
    const allOutput = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(allOutput).toContain('learned 2 new patterns');
    expect(fs.existsSync(NOTIFICATION_FILE)).toBe(false);
  });

  it('handles corrupt JSON without crashing', () => {
    fs.writeFileSync(NOTIFICATION_FILE, '{invalid json!!!');

    expect(() => checkPendingNotifications()).not.toThrow();
    expect(fs.existsSync(NOTIFICATION_FILE)).toBe(false);
  });

  it('skips display when newItemCount is 0', () => {
    fs.writeFileSync(NOTIFICATION_FILE, JSON.stringify({
      timestamp: '2026-01-01T00:00:00Z',
      newItemCount: 0,
      newItems: [],
      wasteTokens: 0,
    }));

    checkPendingNotifications();
    expect(logSpy).not.toHaveBeenCalled();
    expect(fs.existsSync(NOTIFICATION_FILE)).toBe(false);
  });
});
