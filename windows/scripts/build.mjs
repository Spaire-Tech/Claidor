// Builds the main process and the preload into dist/ (one file each, as
// Electron loads them). The page itself is the website's committed build,
// read where it is in a developer's copy and copied into the app by
// electron-builder (electron-builder.yml, `extraResources`).

import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(new URL('..', import.meta.url))

const common = {
  absWorkingDir: here,
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node22',
  sourcemap: false,
  logLevel: 'warning',
  // Electron is the app itself; the updater ships as a dependency (package.json).
  external: ['electron', 'electron-updater'],
}

await build({
  ...common,
  entryPoints: ['src/main/main.ts'],
  outfile: 'dist/main.cjs',
})

// The preload runs sandboxed: nothing of Node but what Electron gives it.
await build({
  ...common,
  entryPoints: ['src/preload/preload.ts'],
  outfile: 'dist/preload.cjs',
  external: ['electron'],
})
