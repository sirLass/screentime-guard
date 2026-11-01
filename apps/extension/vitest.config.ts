import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // M1 DoD gates coverage on the storage layer and core helpers, not on UI
    // entrypoints (those come with M2–M5).
    coverage: {
      include: ['lib/**'],
      thresholds: {
        statements: 90,
        branches: 90,
        functions: 90,
        lines: 90,
      },
    },
  },
});
