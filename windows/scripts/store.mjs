// The Microsoft Store's package of the Windows app, ready for Partner Center
// (docs/web-app/PROGRESS.md: the Windows app goes out through the Store,
// which signs and updates it):
//
//   node scripts/store.mjs          (in windows/, on Windows; writes out/store/Simeon-Store-<version>.appx)
//
// 1. Its identity comes from store.json: the three values on Partner
//    Center's Product identity page (Apps and games › Simeon › Product
//    management › Product identity). Fill them in once; they never change.
// 2. The app is built as the installer's is, and packaged with Windows' own
//    tools (makeappx, makepri), so only on Windows. Its pictures are
//    resources/appx/ (scripts/make-icon.mjs), its settings electron-builder.yml's
//    `appx`. Nothing is signed here: the Store signs what it publishes.
// 3. Upload the .appx in Partner Center (the submission's Packages). For each
//    new submission raise `version` in package.json first: the Store takes
//    only a higher one.
//
// To try the package on this PC before uploading, Windows asks for it to be
// signed; install the installer's build instead (npm run package), which is
// the same app.

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { identityFields, readStoreIdentity } from './lib/store.mjs'

const require = createRequire(import.meta.url)
const windows = fileURLToPath(new URL('..', import.meta.url))
const root = path.resolve(windows, '..')
const OUT = path.join(windows, 'out', 'store')

const say = (text) => console.log(`\n\x1b[1m${text}\x1b[0m`)
const fail = (text) => {
  console.error(`\n\x1b[31m${text}\x1b[0m`)
  process.exit(1)
}

say('Reading the Store identity (store.json)')
const read = readStoreIdentity(readFileSync(path.join(windows, 'store.json'), 'utf8'))
if (!read.identity) {
  const lines = [
    ...read.missing.map((name) => `  ${name}: empty. Copy Partner Center's ${identityFields[name] ?? name}.`),
    ...read.wrong.map((name) => `  ${name}: not what Partner Center writes there. Copy ${identityFields[name] ?? name} again.`),
  ]
  fail(
    `windows/store.json needs Partner Center's Product identity (Apps and games › Simeon › Product management › Product identity):\n${lines.join('\n')}`,
  )
}
const identity = read.identity
console.log(`  ${identity.identityName}, ${identity.publisher}, ${identity.publisherDisplayName}`)

say('Checking this computer')
if (process.platform !== 'win32')
  fail('The Store’s package is made on Windows: it needs Windows’ own packaging tools (makeappx). Run this on the Windows PC.')
if (!existsSync(path.join(root, 'clients/apps/web/public/app-next/index.html')))
  fail('The web app’s committed build is missing (clients/apps/web/public/app-next): build it in clients/apps/app (pnpm build) and commit it.')
// The Store signs the package: no certificate of this PC's is used.
for (const name of ['CSC_LINK', 'CSC_KEY_PASSWORD', 'CSC_NAME', 'WIN_CSC_LINK', 'WIN_CSC_KEY_PASSWORD']) delete process.env[name]

const version = JSON.parse(readFileSync(path.join(windows, 'package.json'), 'utf8')).version
let build = '0'
try {
  build = execFileSync('git', ['-C', root, 'rev-list', '--count', 'HEAD'], { encoding: 'utf8' }).trim()
} catch {
  // Not a clone: the build number stays 0 (About shows it).
}

say(`Building Simeon ${version} for the Microsoft Store (a few minutes)`)
rmSync(OUT, { recursive: true, force: true })
execFileSync(process.execPath, [path.join(windows, 'scripts/build.mjs')], { cwd: windows, stdio: 'inherit' })
const builder = require('electron-builder')
try {
  await builder.build({
    projectDir: windows,
    targets: builder.Platform.WINDOWS.createTarget(['appx'], builder.Arch.x64),
    publish: 'never',
    config: {
      directories: { output: 'out/store' },
      appx: identity,
      // The build number for About; no signers, so the app's own updater stays off (and `process.windowsStore` keeps it off).
      // The manifest's Description is package.json's, which is written for us: the package says only its name.
      extraMetadata: { simeonBuild: build, description: 'Simeon' },
    },
  })
} catch (error) {
  fail(`The Store's package was not built: ${error instanceof Error ? error.message : String(error)}`)
}

const made = path.join(OUT, `Simeon-Store-${version}.appx`)
if (!existsSync(made)) fail(`electron-builder made no ${path.basename(made)}.`)
say('Done')
console.log(`  ${made}`)
console.log('  Upload it in Partner Center: Apps and games › Simeon › the submission › Packages.')
