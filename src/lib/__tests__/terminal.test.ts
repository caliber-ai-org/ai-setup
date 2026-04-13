import { describe, it, expect, vi, afterEach } from 'vitest';
import { restoreTerminal } from '../terminal.js';

describe('restoreTerminal', () => {
  const originalStdin = process.stdin;

  afterEach(() => {
    Object.defineProperty(process, 'stdin', {
      value: originalStdin,
      writable: true,
      configurable: true,
    });
  });

  function mockStdin(props: { isTTY: boolean; isRaw: boolean; setRawMode?: unknown }) {
    Object.defineProperty(process, 'stdin', {
      value: { setRawMode: vi.fn(), ...props },
      writable: true,
      configurable: true,
    });
  }

  it('resets raw mode when isTTY and isRaw are true', () => {
    mockStdin({ isTTY: true, isRaw: true });
    restoreTerminal();
    expect(process.stdin.setRawMode).toHaveBeenCalledWith(false);
  });

  it('skips reset when stdin is not a TTY', () => {
    mockStdin({ isTTY: false, isRaw: true });
    restoreTerminal();
    expect(process.stdin.setRawMode).not.toHaveBeenCalled();
  });

  it('skips reset when stdin is not in raw mode', () => {
    mockStdin({ isTTY: true, isRaw: false });
    restoreTerminal();
    expect(process.stdin.setRawMode).not.toHaveBeenCalled();
  });

  it('swallows errors gracefully', () => {
    mockStdin({
      isTTY: true,
      isRaw: true,
      setRawMode: () => {
        throw new Error('stream destroyed');
      },
    });
    expect(() => restoreTerminal()).not.toThrow();
  });
});
