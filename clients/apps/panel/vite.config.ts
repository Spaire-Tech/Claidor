import { resolve } from 'node:path'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * Two entry points, not one.
 *
 * `index.html` is the panel. `signin.html` is the dialog Office opens as a
 * real top-level window — the only place the session cookie is sent, and
 * therefore the only place a token can be minted. It ships with the panel
 * because `messageParent` is same-origin only.
 *
 * Office loads the pane over HTTPS from a live origin — never a file path,
 * and on desktop never plain HTTP. `pnpm dev` still serves HTTP for the
 * browser, which is where most of the panel gets built.
 */
export default defineConfig({
  plugins: [react()],
  server: { port: 3100 },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      input: {
        panel: resolve(__dirname, 'index.html'),
        signin: resolve(__dirname, 'signin.html'),
      },
    },
  },
})
