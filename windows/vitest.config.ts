import { defineConfig } from 'vitest/config'

// The main process's own logic, run in Node; Electron itself is checked by
// `npm run smoke` (scripts/smoke.mjs).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
})
