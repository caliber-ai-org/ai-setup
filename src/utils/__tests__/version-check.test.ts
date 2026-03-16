import { describe, it, expect, vi } from 'vitest';

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    default: {
      ...actual,
      readFileSync: vi.fn().mockReturnValue(JSON.stringify({ version: '1.0.0' })),
    },
  };
});
vi.mock('child_process');

import { getChannel, isNewer } from '../version-check.js';

describe('getChannel', () => {
  it('returns dev for dev prerelease versions', () => {
    expect(getChannel('1.20.0-dev.1773685636')).toBe('dev');
  });

  it('returns next for next prerelease versions', () => {
    expect(getChannel('1.19.6-next.1773685221')).toBe('next');
  });

  it('returns latest for stable versions', () => {
    expect(getChannel('1.19.7')).toBe('latest');
  });

  it('returns latest for versions with unknown prerelease tags', () => {
    expect(getChannel('1.0.0-beta.1')).toBe('latest');
  });
});

describe('isNewer', () => {
  it('returns true when registry major is higher', () => {
    expect(isNewer('2.0.0', '1.19.7')).toBe(true);
  });

  it('returns true when registry minor is higher', () => {
    expect(isNewer('1.20.0', '1.19.7')).toBe(true);
  });

  it('returns true when registry patch is higher', () => {
    expect(isNewer('1.19.8', '1.19.7')).toBe(true);
  });

  it('returns false when versions are equal', () => {
    expect(isNewer('1.19.7', '1.19.7')).toBe(false);
  });

  it('returns false when current is newer', () => {
    expect(isNewer('1.19.7', '1.20.0')).toBe(false);
  });

  it('returns false when stable is older than dev prerelease', () => {
    expect(isNewer('1.19.7', '1.20.0-dev.1773685636')).toBe(false);
  });

  it('returns true when dev prerelease has newer timestamp', () => {
    expect(isNewer('1.20.0-dev.2000000000', '1.20.0-dev.1773685636')).toBe(true);
  });

  it('returns false when dev prerelease has older timestamp', () => {
    expect(isNewer('1.20.0-dev.1000000000', '1.20.0-dev.1773685636')).toBe(false);
  });

  it('returns false when same prerelease version', () => {
    expect(isNewer('1.20.0-dev.1773685636', '1.20.0-dev.1773685636')).toBe(false);
  });

  it('returns true when stable replaces prerelease of same core version', () => {
    expect(isNewer('1.20.0', '1.20.0-dev.1773685636')).toBe(true);
  });

  it('returns false when prerelease vs stable of same core version', () => {
    expect(isNewer('1.20.0-dev.1773685636', '1.20.0')).toBe(false);
  });
});
