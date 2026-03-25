import { describe, it, expect } from 'vitest';
import { referenceArchitecturalWeight, sumReferenceWeights } from '../reference-weight.js';

describe('referenceArchitecturalWeight', () => {
  it('tier 1: dependency and schema manifests', () => {
    expect(referenceArchitecturalWeight('package.json')).toBe(3);
    expect(referenceArchitecturalWeight('./package.json')).toBe(3);
    expect(referenceArchitecturalWeight('apps/web/package.json')).toBe(3);
    expect(referenceArchitecturalWeight('schema.prisma')).toBe(3);
    expect(referenceArchitecturalWeight('prisma/schema.prisma')).toBe(3);
    expect(referenceArchitecturalWeight('docker-compose.yml')).toBe(3);
    expect(referenceArchitecturalWeight('openapi.yaml')).toBe(3);
    expect(referenceArchitecturalWeight('requirements.txt')).toBe(3);
    expect(referenceArchitecturalWeight('go.mod')).toBe(3);
    expect(referenceArchitecturalWeight('Cargo.toml')).toBe(3);
  });

  it('tier 2: entry files and framework configs', () => {
    expect(referenceArchitecturalWeight('main.py')).toBe(2);
    expect(referenceArchitecturalWeight('src/main.py')).toBe(2);
    expect(referenceArchitecturalWeight('App.tsx')).toBe(2);
    expect(referenceArchitecturalWeight('components/App.tsx')).toBe(2);
    expect(referenceArchitecturalWeight('next.config.js')).toBe(2);
    expect(referenceArchitecturalWeight('next.config.mjs')).toBe(2);
    expect(referenceArchitecturalWeight('vite.config.ts')).toBe(2);
  });

  it('tier 3: generic source paths', () => {
    expect(referenceArchitecturalWeight('src/utils/helpers.ts')).toBe(1);
    expect(referenceArchitecturalWeight('lib/foo/bar.ts')).toBe(1);
  });

  it('sumReferenceWeights sums per ref', () => {
    expect(sumReferenceWeights(['package.json', 'src/a.ts'])).toBe(4);
    expect(sumReferenceWeights([])).toBe(0);
  });
});
