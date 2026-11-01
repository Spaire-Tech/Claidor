import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Simeon's web app, the Mac app translated (docs/web-app/README.md).
//
// It is served at app.simeonlabs.com/app-next until it has everything the
// Mac app has, then at /app in place of the old one. The website serves the
// built files from clients/apps/web/public/app-next, committed like the old
// app's; `pnpm test` fails when they are not the build of this source
// (scripts/check-built.mjs). The Windows app will load the same files from
// disk, with SIMEON_APP_BASE=./ .
export default defineConfig({
  base: process.env.SIMEON_APP_BASE ?? '/app-next/',
  plugins: [react()],
  build: {
    outDir:
      process.env.SIMEON_APP_OUT ??
      fileURLToPath(new URL('../web/public/app-next', import.meta.url)),
    emptyOutDir: true,
    sourcemap: false,
  },
  server: {
    port: 5174,
    strictPort: true,
    // The agents' faces are read from the shared core's own copy (src/core/faces.ts).
    fs: { allow: [fileURLToPath(new URL('../../..', import.meta.url))] },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
