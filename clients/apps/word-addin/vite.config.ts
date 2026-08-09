import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Office loads the task pane in an iframe over HTTPS. `pnpm dev` serves
// plain HTTP on localhost, which Word on the web will refuse; sideloading
// on the desktop accepts it. See README.md — this is the one place the
// development story differs per host.
export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist', sourcemap: true },
  server: { port: 3100, strictPort: true },
})
