import { describe, it, expect } from 'vitest';
import { quoteForWindows, bashPath } from '../windows.js';

describe('quoteForWindows', () => {
  it('returns "" for empty input', () => {
    expect(quoteForWindows('')).toBe('""');
  });

  it('returns input unchanged when no whitespace or quotes', () => {
    expect(quoteForWindows('simple')).toBe('simple');
    expect(quoteForWindows('C:/Users/foo')).toBe('C:/Users/foo');
  });

  it('wraps in double quotes when whitespace is present', () => {
    expect(quoteForWindows('a b')).toBe('"a b"');
    expect(quoteForWindows('C:\\Program Files\\caliber.cmd')).toBe(
      '"C:\\Program Files\\caliber.cmd"',
    );
  });

  it('escapes embedded double quotes', () => {
    expect(quoteForWindows('say "hi"')).toBe('"say \\"hi\\""');
  });
});

describe('bashPath', () => {
  it('returns POSIX paths unchanged', () => {
    expect(bashPath('/usr/local/bin/caliber')).toBe('/usr/local/bin/caliber');
    expect(bashPath('/opt/homebrew/bin/caliber')).toBe('/opt/homebrew/bin/caliber');
    expect(bashPath('caliber')).toBe('caliber');
  });

  it('converts Windows backslashes to forward slashes', () => {
    expect(bashPath('C:\\Users\\First\\caliber.cmd')).toBe('C:/Users/First/caliber.cmd');
    expect(bashPath('C:\\Program Files\\caliber\\caliber.cmd')).toBe(
      'C:/Program Files/caliber/caliber.cmd',
    );
  });

  it('preserves drive letter prefix (Git Bash accepts C:/path/...)', () => {
    expect(bashPath('C:\\path\\to\\thing')).toBe('C:/path/to/thing');
  });

  it('is idempotent on already forward-slash paths', () => {
    expect(bashPath('C:/Users/foo')).toBe('C:/Users/foo');
  });

  it('handles mixed slash paths by normalizing all to forward', () => {
    expect(bashPath('C:/Users\\foo/bar\\baz')).toBe('C:/Users/foo/bar/baz');
  });

  it('returns empty string unchanged', () => {
    expect(bashPath('')).toBe('');
  });
});
