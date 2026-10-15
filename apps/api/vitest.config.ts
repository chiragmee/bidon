import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Contract tests against Postgres do real round trips.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
