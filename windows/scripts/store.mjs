// The Microsoft Store's package of the Windows app, ready for Partner Center
// (docs/web-app/PROGRESS.md: the Windows app goes out through the Store,
// which signs and updates it):
//
//   node scripts/store.mjs          (in windows/, on Windows; writes out/store/Simeon-Store-<version>.appx)
//   node scripts/store.mjs --test   (the same, signed for this PC only and installed on it, to try before the upload)
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
// --test: Windows installs only a signed package, so the test copy
// (out/store-test/Simeon-Store-<version>-test.appx, never the one uploaded)
// is signed with a certificate made on this PC for the Store's publisher,
// "Simeon Store test (this PC only)" in this person's certificates, which this
// PC is told to trust (Windows asks once, Yes), and then installed: Simeon in
// the Start menu, as the Store's will be. The signature is Windows Kits
// 10.0.26100's signtool (electron-builder toolset 1.1.0, downloaded and
// checksum-checked): the default one signs the program and cannot sign the
// package. Uninstall the developer's Simeon (the installer's) first, so the
// two don't share `simeon://`; uninstall the test copy before installing the
// Store's.

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CLEARED_STORE_ENV,
  encodeScript,
  identityFields,
  installScript,
  readStoreIdentity,
  storeBuilderConfig,
  testCertificateScript,
  trustScript,
  trustedScript,
} from './lib/store.mjs'

const require = createRequire(import.meta.url)
const windows = fileURLToPath(new URL('..', import.meta.url))
const root = path.resolve(windows, '..')
const test = process.argv.includes('--test')
const OUT = path.join(windows, 'out', test ? 'store-test' : 'store')

const say = (text) => console.log(`\n\x1b[1m${text}\x1b[0m`)
const fail = (text) => {
  console.error(`\n\x1b[31m${text}\x1b[0m`)
  process.exit(1)
}

/** Windows PowerShell (5.1, the one with Add-AppxPackage), the script encoded; its output, or its error in `fail`. */
function powershell(script, what) {
  try {
    return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encodeScript(script)], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
  } catch (error) {
    const said = [error?.stderr, error?.stdout].filter((text) => typeof text === 'string' && text.trim() !== '').join('\n')
    fail(`${what}: ${said.trim() || (error instanceof Error ? error.message : String(error))}`)
  }
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
// The Store signs the upload. The test copy uses its own certificate and the kits signtool, never a release certificate or a signtool named in the shell.
for (const name of CLEARED_STORE_ENV) delete process.env[name]

let thumbprint = null
if (test) {
  say('The test certificate (this PC only)')
  thumbprint = powershell(testCertificateScript(identity.publisher), 'The test certificate was not made').split(/\r?\n/).pop()?.trim() ?? ''
  if (!/^[0-9A-F]{40}$/i.test(thumbprint)) fail(`The test certificate was not made: PowerShell gave "${thumbprint}" for its thumbprint.`)
  console.log(`  ${thumbprint}, for ${identity.publisher}`)
  if (powershell(trustedScript(thumbprint), 'Could not read this PC’s trusted certificates') !== 'True') {
    say('Trusting it on this PC: Windows asks whether to allow PowerShell to make changes. Click Yes.')
    powershell(trustScript(thumbprint, path.join(os.tmpdir(), 'simeon-store-test.cer')), 'This PC was not told to trust the test certificate')
    if (powershell(trustedScript(thumbprint), 'Could not read this PC’s trusted certificates') !== 'True')
      fail('This PC does not trust the test certificate yet (was Windows’ question answered No?). Run this again and click Yes.')
  }
  console.log('  Trusted by this PC')
  // No timestamp server. electron-builder 26.18 reads this only to skip that;
  // the kits bundle is still downloaded.
  process.env.ELECTRON_BUILDER_OFFLINE = 'true'
}

const version = JSON.parse(readFileSync(path.join(windows, 'package.json'), 'utf8')).version
let build = '0'
try {
  build = execFileSync('git', ['-C', root, 'rev-list', '--count', 'HEAD'], { encoding: 'utf8' }).trim()
} catch {
  // Not a clone: the build number stays 0 (About shows it).
}

say(`Building Simeon ${version} for the Microsoft Store${test ? ', a test copy for this PC' : ''} (a few minutes)`)
rmSync(OUT, { recursive: true, force: true })
execFileSync(process.execPath, [path.join(windows, 'scripts/build.mjs')], { cwd: windows, stdio: 'inherit' })
const builder = require('electron-builder')
try {
  await builder.build({
    projectDir: windows,
    targets: builder.Platform.WINDOWS.createTarget(['appx'], builder.Arch.x64),
    publish: 'never',
    config: storeBuilderConfig({
      test,
      identity,
      thumbprint,
      output: test ? 'out/store-test' : 'out/store',
      build,
    }),
  })
} catch (error) {
  fail(`The Store's package was not built: ${error instanceof Error ? error.message : String(error)}`)
}

const made = path.join(OUT, `Simeon-Store-${version}${test ? '-test' : ''}.appx`)
if (!existsSync(made)) fail(`electron-builder made no ${path.basename(made)}.`)

if (test) {
  say('Installing the test copy')
  powershell(installScript(made), 'The test copy was not installed')
  say('Done')
  console.log(`  ${made}`)
  console.log('  Simeon is installed from it: open it from the Start menu.')
  console.log('  Try it as the Store’s: Settings has no Updates page, a simeon:// link opens it, its tiles and icon.')
  console.log('  Not for the upload: upload the one `node scripts/store.mjs` makes. Before installing the Store’s, uninstall this one.')
} else {
  say('Done')
  console.log(`  ${made}`)
  console.log('  Upload it in Partner Center: Apps and games › Simeon › the submission › Packages.')
}
