import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * Office loads the pane over HTTPS from a live origin — never a file path,
 * and on desktop never plain HTTP. `pnpm dev` still serves HTTP for the
 * browser, which is where most of the panel gets built; sideloading uses a
 * deployed build, and `office-addin-dev-certs` covers the in-between.
 */
export default defineConfig({
  plugins: [react()],
  server: { port: 3100 },
  build: { outDir: 'dist', sourcemap: true },
})
