import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import { themeCSS } from './scripts/theme-css.mjs'

// Simeon's web app, the Mac app translated (docs/web-app/README.md).
//
// It is served at app.simeonlabs.com/app-next until it has everything the
// Mac app has, then at /app in place of the old one. The website serves the
// built files from clients/apps/web/public/app-next, committed like the old
// app's; `pnpm test` fails when they are not the build of this source
// (scripts/check-built.mjs). The Windows app (windows/) ships these same
// committed files and serves them at app://simeon/app-next/.
export default defineConfig({
  base: process.env.SIMEON_APP_BASE ?? '/app-next/',
  plugins: [react()],
  // Each dark rule also follows the theme chosen in Settings (scripts/theme-css.mjs).
  css: { postcss: { plugins: [themeCSS()] } },
  build: {
    outDir:
      process.env.SIMEON_APP_OUT ??
      fileURLToPath(new URL('../web/public/app-next', import.meta.url)),
    emptyOutDir: true,
    sourcemap: false,
    // Two pages: the window, and the page that ends a connected app's sign-in come back through Simeon Labs' server (connected.html, step 6b).
    rollupOptions: {
      input: {
        index: fileURLToPath(new URL('./index.html', import.meta.url)),
        connected: fileURLToPath(new URL('./connected.html', import.meta.url)),
      },
      // The code both pages share is named as the window's own (`index-…`), whatever module Rollup would name it after, so the names check's rules for the window's script keep reading it (scripts/kept_names.json).
      output: {
        chunkFileNames: (chunk) =>
          chunk.moduleIds.some((id) => id.endsWith('/src/core/plainWords.ts'))
            ? 'assets/index-[hash].js'
            : 'assets/[name]-[hash].js',
      },
    },
    // The apps' logos (src/core/generatedBrands.ts) stay files, fetched when a message names one, not written into the script.
    assetsInlineLimit: (file) =>
      file.includes('/desktop/brand/') ? false : undefined,
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
