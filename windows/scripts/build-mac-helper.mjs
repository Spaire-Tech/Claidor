// The Mac's browser helper's code (src/helper/macBrowser.ts, step 4 of
// docs/app-browser/README.md), bundled with its package.json, ready to go
// into Electron's app folder (Contents/Resources/app) of the helper the Mac
// app carries. The .app around it, its signing and its place in the Mac app
// are the Mac build's (step 4b).
//
//   node scripts/build-mac-helper.mjs [out]      (default: build/mac-helper)

import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const here = fileURLToPath(new URL('..', import.meta.url))
const out = path.resolve(process.argv[2] ?? path.join(here, 'build', 'mac-helper'))
mkdirSync(out, { recursive: true })
await build({ absWorkingDir: here, entryPoints: ['src/helper/macBrowser.ts'], outfile: path.join(out, 'main.js'), bundle: true, format: 'cjs', platform: 'node', target: 'node22', external: ['electron'], logLevel: 'warning' })
writeFileSync(path.join(out, 'package.json'), `${JSON.stringify({ name: 'simeon-browser', productName: 'Simeon Browser', main: 'main.js', private: true }, null, 2)}\n`)
console.log(`The Mac's browser helper is in ${out}`)
