/**
 * large-file-scan.ts
 *
 * Detects files that exceed a size threshold inside a project directory.
 * Designed to be called explicitly by commands before feeding project
 * context to an LLM — NOT injected as a side-effect inside unrelated
 * scanners (e.g. scanLocalState).
 *
 * Design (per reviewer feedback):
 *  - Size-only heuristic: no extension lists.  A 50 MB .json is just as
 *    problematic as a 50 MB .csv.
 *  - Fully recursive walk that mirrors the IGNORE_DIRS convention used
 *    in src/fingerprint/file-tree.ts.
 *  - Injected statSync / readdirSync so the function is testable with
 *    in-memory stubs — no tmp dirs, no disk I/O in tests.
 *  - Errors are categorised: permission issues are skipped silently;
 *    unexpected errors are re-thrown so bugs surface immediately.
 */

import fs from 'fs';
import path from 'path';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LargeFileWarning {
  /** Absolute path to the offending file. */
  filePath: string;
  /** Raw file size in bytes. */
  sizeBytes: number;
  /** Human-readable size, e.g. "12.34" (MiB, 2 decimal places). */
  sizeMB: string;
}

/** Minimal stat shape — subset of fs.Stats that we actually use. */
interface StatResult {
  isFile(): boolean;
  isDirectory(): boolean;
  size: number;
}

export interface ScanOptions {
  /**
   * Files larger than this many bytes emit a warning.
   * Defaults to 1 MiB (1_048_576 bytes).
   */
  thresholdBytes?: number;
  /**
   * Directory names to skip entirely.  Defaults to DEFAULT_IGNORE_DIRS,
   * which mirrors src/fingerprint/file-tree.ts so both scanners stay
   * consistent.
   */
  ignoreDirs?: ReadonlySet<string>;
  /**
   * Injected stat implementation — lets tests use in-memory stubs instead
   * of real disk access.  Defaults to fs.statSync.
   */
  statSync?: (p: string) => StatResult;
  /**
   * Injected readdir implementation — same reason as statSync.
   * Must return the direct child names (not full paths) of the given dir.
   * Defaults to fs.readdirSync.
   */
  readdirSync?: (p: string) => string[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** 1 MiB — matches the original proposal's intent. */
export const DEFAULT_THRESHOLD_BYTES = 1_048_576;

/**
 * Directories that are never walked, consistent with file-tree.ts.
 * Exported so callers can extend the set without duplicating it.
 */
export const DEFAULT_IGNORE_DIRS: ReadonlySet<string> = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', '.cache',
  '.turbo', 'coverage', '.caliber', '__pycache__', '.venv',
  'vendor', 'target',
]);

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Recursively walks `dir` and returns a warning for every file whose size
 * exceeds `options.thresholdBytes`.
 *
 * Returns an empty array — never throws — when a directory cannot be read
 * due to permissions.  Re-throws for genuinely unexpected I/O errors so
 * they surface in tests and logs.
 */
export function scanLargeFiles(
  dir: string,
  options: ScanOptions = {},
): LargeFileWarning[] {
  const {
    thresholdBytes = DEFAULT_THRESHOLD_BYTES,
    ignoreDirs = DEFAULT_IGNORE_DIRS,
    statSync: stat = fs.statSync,
    readdirSync: readdir = (p: string): string[] => fs.readdirSync(p) as string[],
  } = options;

  const warnings: LargeFileWarning[] = [];
  walkDir(dir, ignoreDirs, thresholdBytes, stat, readdir, warnings);
  return warnings;
}

// ─── Private helpers ──────────────────────────────────────────────────────────

function walkDir(
  current: string,
  ignoreDirs: ReadonlySet<string>,
  thresholdBytes: number,
  stat: NonNullable<ScanOptions['statSync']>,
  readdir: NonNullable<ScanOptions['readdirSync']>,
  out: LargeFileWarning[],
): void {
  let names: string[];

  try {
    names = readdir(current);
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    // Permission denied, missing dir, or trying to readdir a file —
    // all non-fatal in a real project; skip this subtree silently.
    if (code === 'EACCES' || code === 'ENOENT' || code === 'ENOTDIR') return;
    // Anything else (e.g. EIO) is unexpected — re-throw so it surfaces.
    throw err;
  }

  for (const name of names) {
    if (ignoreDirs.has(name)) continue;

    const fullPath = path.join(current, name);

    let entry: StatResult;
    try {
      entry = stat(fullPath);
    } catch {
      // Broken symlinks, files deleted mid-scan, etc. — skip silently.
      continue;
    }

    if (entry.isDirectory()) {
      walkDir(fullPath, ignoreDirs, thresholdBytes, stat, readdir, out);
    } else if (entry.isFile() && entry.size > thresholdBytes) {
      out.push({
        filePath: fullPath,
        sizeBytes: entry.size,
        sizeMB: (entry.size / 1_048_576).toFixed(2),
      });
    }
  }
}

