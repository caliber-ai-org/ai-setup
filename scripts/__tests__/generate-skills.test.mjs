import { describe, it, expect } from 'vitest';
import {
  splitFrontmatter,
  stripPathsKey,
  renderForTarget,
} from '../generate-skills.mjs';

describe('splitFrontmatter', () => {
  it('returns [null, content] when no opening fence', () => {
    const c = '# Just a heading\n\nbody.';
    expect(splitFrontmatter(c)).toEqual([null, c]);
  });

  it('returns [null, content] when opening fence has no closing fence', () => {
    const c = '---\nname: foo\n\n# Heading without closing fence';
    const [fm, body] = splitFrontmatter(c);
    expect(fm).toBeNull();
    expect(body).toBe(c);
  });

  it('parses standard LF frontmatter with trailing newline before close fence', () => {
    const c = '---\nname: foo\ndescription: bar\n---\n# Heading\nbody';
    const [fm, body] = splitFrontmatter(c);
    expect(fm).toBe('name: foo\ndescription: bar');
    expect(body).toBe('# Heading\nbody');
  });

  it('B1: parses frontmatter when closing fence is at EOF (no trailing newline)', () => {
    // Some editors strip trailing newlines on save. The old parser used
    // indexOf('\n---\n', ...) which required \n after ---, so the entire file
    // was treated as having no frontmatter and the strip-paths step never ran.
    const c = '---\nname: foo\ndescription: bar\n---';
    const [fm, body] = splitFrontmatter(c);
    expect(fm).toBe('name: foo\ndescription: bar');
    expect(body).toBe('');
  });

  it('B2: normalizes CRLF line endings before parsing', () => {
    // A SKILL.md edited on Windows will have \r\n endings. The old parser saw
    // `---\r\n` which doesn't match `---\n`, so frontmatter was unparseable
    // and `paths:` shipped to .agents and .cursor (which reject it).
    const c = '---\r\nname: foo\r\npaths:\r\n  - src/**\r\n---\r\n# Heading\r\nbody\r\n';
    const [fm, body] = splitFrontmatter(c);
    expect(fm).toBe('name: foo\npaths:\n  - src/**');
    expect(body).toBe('# Heading\nbody\n');
  });

  it('handles bare CR line endings (legacy Mac)', () => {
    const c = '---\rname: foo\r---\rbody';
    const [fm, body] = splitFrontmatter(c);
    expect(fm).toBe('name: foo');
    expect(body).toBe('body');
  });
});

describe('stripPathsKey', () => {
  it('removes the paths: block with multi-line array', () => {
    const fm = 'name: foo\npaths:\n  - src/**\n  - test/**\ndescription: bar';
    expect(stripPathsKey(fm)).toBe('name: foo\ndescription: bar');
  });

  it('removes paths: as last key in frontmatter', () => {
    const fm = 'name: foo\ndescription: bar\npaths:\n  - src/**';
    expect(stripPathsKey(fm)).toBe('name: foo\ndescription: bar');
  });

  it('preserves other top-level keys with colons', () => {
    const fm = 'name: foo\ndescription: bar: with: colons\npaths:\n  - x';
    expect(stripPathsKey(fm)).toBe('name: foo\ndescription: bar: with: colons');
  });

  it('is a no-op when no paths key present', () => {
    const fm = 'name: foo\ndescription: bar';
    expect(stripPathsKey(fm)).toBe(fm);
  });

  it('handles paths block followed by blank line then top-level key', () => {
    const fm = 'name: foo\npaths:\n  - src/**\n\ndescription: bar';
    // Blank line within paths block continues to be skipped; then the
    // unindented `description:` resumes emission.
    expect(stripPathsKey(fm)).toBe('name: foo\ndescription: bar');
  });
});

describe('renderForTarget', () => {
  const sourceWithPaths = '---\nname: foo\ndescription: bar\npaths:\n  - src/**\n---\n# Body\n';

  it('claude target (stripPaths=false): preserves paths key', () => {
    const out = renderForTarget(sourceWithPaths, false);
    expect(out).toContain('paths:');
    expect(out).toContain('  - src/**');
    expect(out).toContain('# Body');
  });

  it('agents/cursor target (stripPaths=true): drops paths key', () => {
    const out = renderForTarget(sourceWithPaths, true);
    expect(out).not.toContain('paths:');
    expect(out).not.toContain('  - src/**');
    expect(out).toContain('name: foo');
    expect(out).toContain('description: bar');
    expect(out).toContain('# Body');
  });

  it('B2 end-to-end: CRLF input produces LF output for both target modes', () => {
    const crlf = '---\r\nname: foo\r\npaths:\r\n  - src/**\r\n---\r\n# Body\r\n';
    expect(renderForTarget(crlf, false)).not.toContain('\r');
    expect(renderForTarget(crlf, true)).not.toContain('\r');
    expect(renderForTarget(crlf, true)).not.toContain('paths:');
  });

  it('B1 end-to-end: missing trailing newline still strips paths for derived targets', () => {
    const noTrailingNl = '---\nname: foo\npaths:\n  - src/**\n---';
    const out = renderForTarget(noTrailingNl, true);
    expect(out).not.toContain('paths:');
    expect(out).toContain('name: foo');
  });

  it('passthrough when no frontmatter present', () => {
    const noFm = '# Heading\n\nbody only';
    expect(renderForTarget(noFm, true)).toBe(noFm);
    expect(renderForTarget(noFm, false)).toBe(noFm);
  });
});
