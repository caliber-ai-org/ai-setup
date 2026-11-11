import { it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isOpenCodeAvailable,
  isOpenCodeLoggedIn,
  parseOpenCodeAuthList,
  resetOpenCodeLoginCache,
} from '../opencode.js';
const execSync = vi.fn();
vi.mock('node:child_process', () => ({
  execSync: (...args: unknown[]) => execSync(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  resetOpenCodeLoginCache();
});
afterEach(() => vi.useRealTimers());

it('returns true when opencode is on PATH', () => {
  execSync.mockReturnValue(undefined);
  expect(isOpenCodeAvailable()).toBe(true);
  expect(execSync).toHaveBeenCalled();
  expect(execSync.mock.calls[0][0]).toMatch(/^(where|which).*opencode/);
  expect(execSync.mock.calls[0][1]).toEqual({ stdio: 'ignore', windowsHide: true });
});

it('returns false when opencode is not found', () => {
  execSync.mockImplementation(() => {
    throw new Error('not found');
  });
  expect(isOpenCodeAvailable()).toBe(false);
});

it('returns true when auth list returns non-empty output', () => {
  execSync.mockReturnValue(Buffer.from('user@example.com\n'));
  expect(isOpenCodeLoggedIn()).toBe(true);
  expect(execSync).toHaveBeenCalledWith('opencode auth list', {
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });
});

it('returns false when auth list returns empty output', () => {
  execSync.mockReturnValue(Buffer.from(''));
  expect(isOpenCodeLoggedIn()).toBe(false);
});

it('returns false when auth list command fails', () => {
  execSync.mockImplementation(() => {
    throw new Error('exit code 1');
  });
  expect(isOpenCodeLoggedIn()).toBe(false);
});

it('returns true for multi-line output indicating credentials', () => {
  execSync.mockReturnValue(Buffer.from('• iFlow api\n  \n  1 credentials\n'));
  expect(isOpenCodeLoggedIn()).toBe(true);
});

it('returns false for real CLI output with nothing authenticated', () => {
  execSync.mockReturnValue(
    Buffer.from(
      '┌  Credentials \u001b[90m~/.local/share/opencode/auth.json\n│\n└  0 credentials\n\n' +
        '┌  Environment\n│\n└  0 environment variables\n\n',
    ),
  );
  expect(isOpenCodeLoggedIn()).toBe(false);
});

it('returns true when only an environment variable supplies the credential', () => {
  execSync.mockReturnValue(
    Buffer.from(
      '┌  Credentials \u001b[90m~/.local/share/opencode/auth.json\n│\n└  0 credentials\n\n' +
        '┌  Environment\n│\n●  Google \u001b[90mGEMINI_API_KEY\n│\n└  1 environment variable\n\n',
    ),
  );
  expect(isOpenCodeLoggedIn()).toBe(true);
});

it('returns true when credentials are stored even with no environment variables', () => {
  execSync.mockReturnValue(
    Buffer.from(
      '┌  Credentials\n│\n●  Anthropic\n│\n└  2 credentials\n\n' +
        '┌  Environment\n│\n└  0 environment variables\n\n',
    ),
  );
  expect(isOpenCodeLoggedIn()).toBe(true);
});

it('caches the result across calls', () => {
  execSync.mockReturnValue(Buffer.from('user@example.com\n'));
  expect(isOpenCodeLoggedIn()).toBe(true);
  execSync.mockReset();
  expect(isOpenCodeLoggedIn()).toBe(true);
  expect(execSync).not.toHaveBeenCalled();
});

it('returns null when no counts are present so the caller can fail open', () => {
  expect(parseOpenCodeAuthList('some future format with no counts')).toBeNull();
  expect(parseOpenCodeAuthList('')).toBeNull();
});

it('reads counts through ANSI colour codes', () => {
  expect(parseOpenCodeAuthList('\u001b[90m0 credentials\u001b[0m')).toBe(false);
  expect(parseOpenCodeAuthList('\u001b[32m3 credentials\u001b[0m')).toBe(true);
});

it('handles singular and plural forms', () => {
  expect(parseOpenCodeAuthList('1 credential')).toBe(true);
  expect(parseOpenCodeAuthList('0 credential')).toBe(false);
  expect(parseOpenCodeAuthList('1 environment variable')).toBe(true);
  expect(parseOpenCodeAuthList('0 environment variables')).toBe(false);
});
