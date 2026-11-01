import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // M1 DoD: the domain/date/validation helpers ship with 90%+ coverage.
    coverage: {
      include: ['src/**'],
      exclude: ['src/index.ts'], // pure re-exports
      thresholds: {
        statements: 90,
        branches: 90,
        functions: 90,
        lines: 90,
      },
    },
  },
});
