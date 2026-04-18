/**
 * src/fingerprint/__tests__/large-file-warn.test.ts
 *
 * Unit tests for printLargeFileWarnings().
 *
 * Tests verify:
 *  - Empty warnings → no output, no spinner interaction
 *  - Single warning → singular header wording
 *  - Multiple warnings → plural header wording
 *  - With ora spinner → output routed through spinner.warn()
 *  - Without spinner → written to process.stderr
 *  - Hint text always present
 *  - File path and size always included
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { printLargeFileWarnings } from '../large-file-warn.js';
import type { LargeFileWarning } from '../large-file-scan.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeWarning(filePath: string, sizeMB: string): LargeFileWarning {
  const sizeBytes = Math.round(parseFloat(sizeMB) * 1_048_576);
  return { filePath, sizeBytes, sizeMB };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('printLargeFileWarnings', () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
  });

  // ── Empty warnings ───────────────────────────────────────────────────────

  it('does nothing when warnings array is empty', () => {
    const spinner = { warn: vi.fn() };

    printLargeFileWarnings([], { spinner: spinner as never });

    expect(stderrSpy).not.toHaveBeenCalled();
    expect(spinner.warn).not.toHaveBeenCalled();
  });

  it('does nothing when warnings array is empty and no spinner', () => {
    printLargeFileWarnings([]);

    expect(stderrSpy).not.toHaveBeenCalled();
  });

  // ── Singular / plural header ──────────────────────────────────────────────

  it('uses singular wording for exactly one warning', () => {
    const warnings = [makeWarning('/project/data.csv', '5.00')];

    printLargeFileWarnings(warnings);

    const output = String(stderrSpy.mock.calls[0][0]);
    expect(output).toContain('1 large file');
    expect(output).not.toContain('1 large files');
  });

  it('uses plural wording for two or more warnings', () => {
    const warnings = [
      makeWarning('/project/data.csv', '5.00'),
      makeWarning('/project/model.pkl', '12.00'),
    ];

    printLargeFileWarnings(warnings);

    const output = String(stderrSpy.mock.calls[0][0]);
    expect(output).toContain('2 large files');
  });

  // ── File details ──────────────────────────────────────────────────────────

  it('includes file path and size for each warning', () => {
    const warnings = [
      makeWarning('/project/data.csv', '5.20'),
      makeWarning('/project/model.pkl', '12.75'),
    ];

    printLargeFileWarnings(warnings);

    const output = String(stderrSpy.mock.calls[0][0]);
    expect(output).toContain('/project/data.csv');
    expect(output).toContain('5.20 MB');
    expect(output).toContain('/project/model.pkl');
    expect(output).toContain('12.75 MB');
  });

  // ── Hint text ─────────────────────────────────────────────────────────────

  it('always includes .gitignore / .caliberignore hint', () => {
    const warnings = [makeWarning('/project/dump.sqlite', '50.00')];

    printLargeFileWarnings(warnings);

    const output = String(stderrSpy.mock.calls[0][0]);
    expect(output).toContain('.caliberignore');
    expect(output).toContain('.gitignore');
  });

  // ── Spinner routing ───────────────────────────────────────────────────────

  it('routes output through spinner.warn() when spinner is provided', () => {
    const spinner = { warn: vi.fn() };
    const warnings = [makeWarning('/project/data.csv', '5.00')];

    printLargeFileWarnings(warnings, { spinner: spinner as never });

    expect(spinner.warn).toHaveBeenCalledOnce();
    expect(stderrSpy).not.toHaveBeenCalled();

    const message = String(spinner.warn.mock.calls[0][0]);
    expect(message).toContain('large file');
    expect(message).toContain('/project/data.csv');
  });

  it('writes to process.stderr when no spinner is provided', () => {
    const warnings = [makeWarning('/project/data.csv', '5.00')];

    printLargeFileWarnings(warnings);

    expect(stderrSpy).toHaveBeenCalled();
    const output = String(stderrSpy.mock.calls[0][0]);
    expect(output).toContain('large file');
  });

  it('writes to process.stderr when spinner option is omitted entirely', () => {
    const warnings = [makeWarning('/project/dump.db', '8.00')];

    printLargeFileWarnings(warnings, {});

    expect(stderrSpy).toHaveBeenCalled();
  });

  // ── Context bloat message ─────────────────────────────────────────────────

  it('mentions AI context window in the warning header', () => {
    const warnings = [makeWarning('/project/data.csv', '5.00')];

    printLargeFileWarnings(warnings);

    const output = String(stderrSpy.mock.calls[0][0]);
    expect(output).toContain('context window');
  });
});
