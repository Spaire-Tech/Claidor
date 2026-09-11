import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    // The engine test starts a real gateway, which takes tens of seconds.
    testTimeout: 240_000,
    hookTimeout: 240_000,
    // One job at a time is the whole idea; the tests hold ports, so they
    // must not race each other either.
    fileParallelism: false,
  },
});
