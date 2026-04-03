import { resolveCaliber } from '../lib/resolve-caliber.js';

const ERROR_PATTERNS: Array<{ pattern: RegExp; message: string | (() => string) }> = [
  { pattern: /not logged in|not authenticated|login required|unauthorized/i, message: 'Not logged in. Run the login command for your provider to re-authenticate.' },
  { pattern: /rate limit|too many requests|429/i, message: 'Rate limit exceeded. Retrying...' },
  { pattern: /usage limit|out of usage|budget.*limit|limit.*reached/i, message: () => `Usage limit reached. Run \`${resolveCaliber()} config\` to switch models (e.g. auto or composer-1.5).` },
  { pattern: /model.*not found|invalid model|model.*unavailable/i, message: () => `The requested model is not available. Run \`${resolveCaliber()} config\` to select a different model.` },
];

export function parseSeatBasedError(stderr: string, exitCode: number | null): string | null {
  if (!stderr && exitCode === 0) return null;
  for (const { pattern, message } of ERROR_PATTERNS) {
    if (pattern.test(stderr)) return typeof message === 'function' ? message() : message;
  }
  return null;
}

export function isRateLimitError(stderr: string): boolean {
  return /rate limit|too many requests|429/i.test(stderr);
}

export function isAuthError(stderr: string): boolean {
  return /not logged in|not authenticated|login required|unauthorized/i.test(stderr);
}
