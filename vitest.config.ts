import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts'],
    setupFiles: ['./src/test/setup.ts'],
    // Default 5s is too tight for cold-start GitHub Windows runners — sync tests
    // with no I/O occasionally time out. Bumping to 15s eliminates the flake
    // without masking real hangs.
    testTimeout: 15000,
    hookTimeout: 15000,
    coverage: {
      provider: 'v8',
      exclude: ['src/test/**', 'src/bin.ts', 'src/cli.ts', 'src/commands/**', 'dist/**'],
      thresholds: {
        lines: 50,
        functions: 50,
        branches: 50,
        statements: 50,
      },
    },
  },
});
