#!/usr/bin/env node
// A release of the Windows app (2 November 2026; the Mac's is
// mac/scripts/release.sh), on Windows, or on Linux with Wine:
//
//   node scripts/release.mjs            # build it: windows/out/release/<version>/
//   node scripts/release.mjs --publish  # build it, then put it on the website
//
// 1. The version (package.json's `version`) and the build number (the commit
//    count), written into the app (`simeonBuild`): only a build with one
//    updates itself (src/main/updates/feed.ts).
// 2. The installer (NSIS, x64, for the person only), with the website's
//    committed web build inside (clients/apps/web/public/app-next), and the
//    Mac's icon. Signed when a Windows certificate is given through the
//    environment (WIN_CSC_LINK, the .pfx file or its base64, and
//    WIN_CSC_KEY_PASSWORD; electron-builder's own settings, nothing in the
//    repository; a Mac's CSC_LINK is never used), for the certificate's
//    whole subject written in lib/release.mjs (`signers`), which the
//    installed app then asks of every update. Only a signed release updates
//    itself (src/main/updates/feed.ts). On Windows the installer's signature
//    is then checked as the installed app will check it (lib/signature.mjs:
//    valid, and that very subject); elsewhere (Linux with Wine) it can't be
//    checked, so a release is published from Windows only.
// 3. The record (release.json, with each file's sha256 and size) and the
//    feed (latest.yml, electron-updater's) in the version's folder; beside
//    the folders, the feed naming the version's folder and the record again
//    (latest.json).
// With --publish, 4: the version's folder to the release bucket
// (releases/win32-x64/<version>/), checked to answer, then latest.yml and
// latest.json beside the folders, not cached. The website's Download for
// Windows (api.simeonlabs.com/desktop/download/windows) serves the new
// installer within five minutes, and installed apps find it on their next
// daily check (server/simeon/desktop/releases.py). A release is published
// only signed and checked: Windows warns before an unsigned installer, an
// unsigned build never updates itself, and a signed app refuses an update
// signed otherwise. From a full clone only (the build number is the commit
// count).
//
// For --publish, the aws command line signed in to an account that may write
// to the release bucket.
//
// Settings (environment), each with its default:
//   SIMEON_RELEASES_S3   s3://simeonlabs-files-public/releases
//   SIMEON_RELEASES_URL  https://simeonlabs-files-public.s3.amazonaws.com/releases

import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  company,
  feedSha512,
  feedText,
  installerName,
  isVersion,
  platform,
  releaseRecord,
  signers,
  signersReady,
  signingConfigured,
  uploads,
} from './lib/release.mjs'
import { checkSignatureNow } from './lib/signature.mjs'

const require = createRequire(import.meta.url)
const windows = fileURLToPath(new URL('..', import.meta.url))
const root = path.resolve(windows, '..')
const webBuild = path.join(root, 'clients/apps/web/public/app-next')

const S3 = (process.env.SIMEON_RELEASES_S3 || 's3://simeonlabs-files-public/releases').replace(/\/+$/, '')
const URL_BASE = (process.env.SIMEON_RELEASES_URL || 'https://simeonlabs-files-public.s3.amazonaws.com/releases').replace(/\/+$/, '')

let publish = false
let replace = false
for (const arg of process.argv.slice(2)) {
  if (arg === '--publish') publish = true
  else if (arg === '--replace') replace = true
  else {
    console.error(`Unknown option: ${arg} (use --publish, and --replace to publish a version again)`)
    process.exit(2)
  }
}

const say = (text) => console.log(`\n\x1b[1m${text}\x1b[0m`)
const fail = (text) => {
  console.error(`\n\x1b[31m${text}\x1b[0m`)
  process.exit(1)
}
const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim()
// No shell: a path with a space (C:\Users\Jane Doe\…) stays one argument; Windows finds aws.exe and git.exe on PATH.
const works = (command, args) => spawnSync(command, args, { stdio: 'ignore', shell: false }).status === 0
const sha = (algorithm, file, encoding) => createHash(algorithm).update(readFileSync(file)).digest(encoding)

// --- what this computer needs ------------------------------------------------

say('Checking this computer')
if (process.platform !== 'win32' && !works('wine', ['--version']))
  fail('A release is made on Windows, or on Linux with Wine (electron-builder sets the app’s icon and details through it).')
if (!existsSync(path.join(webBuild, 'index.html')))
  fail('The web app’s committed build is missing (clients/apps/web/public/app-next): build it in clients/apps/app (pnpm build) and commit it.')
const changed = git('status', '--porcelain', '--', 'windows', 'clients/apps/web/public/app-next')
if (changed) {
  console.log(changed)
  fail('The app’s files have changes that are not committed. A release is made from committed code: commit or undo them, then run this again.')
}
// A Mac's certificate settings never sign the Windows app (electron-builder falls back to them).
for (const name of ['CSC_LINK', 'CSC_KEY_PASSWORD', 'CSC_NAME']) delete process.env[name]
const signed = signingConfigured(process.env)
if (signed && !signersReady(signers))
  fail(`A certificate is given, but lib/release.mjs names no signer in full. Write the certificate's whole subject there (signers: CN, O, L, S, C, as Windows shows it), commit it, then run this again.`)
console.log(signed ? `Signing for: ${signers.join(' | ')}` : 'No Windows certificate given (WIN_CSC_LINK): the installer will not be signed, and it will not update itself.')
if (publish) {
  if (!signed)
    fail('A release is published signed only: give the certificate (WIN_CSC_LINK and WIN_CSC_KEY_PASSWORD), then run this again.')
  if (process.platform !== 'win32')
    fail(`A release is published from Windows only: its installer's signature is checked there as the installed app will check it (Get-AuthenticodeSignature is Windows' own).`)
  if (!works('aws', ['--version']))
    fail('--publish needs the aws command line (https://aws.amazon.com/cli/), then aws configure (or set AWS_PROFILE).')
  if (!works('aws', ['sts', 'get-caller-identity']))
    fail('The aws command line is not signed in: aws configure (or set AWS_PROFILE), then run this again.')
}

const pkg = JSON.parse(readFileSync(path.join(windows, 'package.json'), 'utf8'))
const VERSION = pkg.version
if (!isVersion(VERSION)) fail(`package.json's version (${VERSION}) is not a version the updater can compare (1.2.3).`)
if (git('rev-parse', '--is-shallow-repository') === 'true')
  fail('This checkout is a shallow clone: its commit count is not the build number. Fetch the whole history (git fetch --unshallow), then run this again.')
const BUILD = git('rev-list', '--count', 'HEAD')
const COMMIT = git('rev-parse', 'HEAD')
console.log(`Simeon ${VERSION} (build ${BUILD}), commit ${COMMIT.slice(0, 9)}`)

if (publish && !replace && works('aws', ['s3', 'ls', `${S3}/${platform}/${VERSION}/`]))
  fail(`Version ${VERSION} is already published. Raise the version in windows/package.json (and commit it), or pass --replace to publish it again.`)

const OUT = path.join(windows, 'out')
const RELEASE = path.join(OUT, 'release')
const FOLDER = path.join(RELEASE, VERSION)
rmSync(OUT, { recursive: true, force: true })

// --- 1 and 2. the app and its installer -------------------------------------

say(`Building Simeon ${VERSION} for Windows (a few minutes)`)
execFileSync(process.execPath, [path.join(windows, 'scripts/build.mjs')], { cwd: windows, stdio: 'inherit' })
const builder = require('electron-builder')
try {
  await builder.build({
    projectDir: windows,
    targets: builder.Platform.WINDOWS.createTarget(['nsis'], builder.Arch.x64),
    publish: 'never',
    // Over electron-builder.yml: the build number, and, signed, the signers the installed app asks of every update.
    config: {
      extraMetadata: { simeonBuild: BUILD, ...(signed ? { simeonSigners: signers } : {}) },
      ...(signed ? { win: { signtoolOptions: { publisherName: signers } } } : {}),
    },
  })
} catch (error) {
  fail(`The installer was not built: ${error instanceof Error ? error.message : String(error)}`)
}

const installer = path.join(OUT, installerName(VERSION))
const blockmap = `${installer}.blockmap`
for (const file of [installer, blockmap, path.join(OUT, 'latest.yml')])
  if (!existsSync(file)) fail(`electron-builder made no ${path.basename(file)}.`)

// The app inside says what it should: its version and build number, and its feed.
const asar = require('@electron/asar')
const inside = JSON.parse(asar.extractFile(path.join(OUT, 'win-unpacked/resources/app.asar'), 'package.json').toString('utf8'))
if (inside.version !== VERSION) fail(`The app says version ${inside.version}, not ${VERSION}.`)
if (inside.simeonBuild !== BUILD) fail(`The app says build ${inside.simeonBuild}, not ${BUILD}: it would not update itself.`)
if (JSON.stringify(inside.simeonSigners ?? null) !== JSON.stringify(signed ? signers : null))
  fail(signed ? 'The app does not name its signers: it would not update itself.' : 'An unsigned app names signers.')
const updateSettings = readFileSync(path.join(OUT, 'win-unpacked/resources/app-update.yml'), 'utf8')
if (!updateSettings.includes('url: https://api.simeonlabs.com/desktop/download/windows'))
  fail('The app’s app-update.yml does not name the server’s feed.')
// Where the installed app looks for what it downloaded (src/main/updates/feed.ts, `releaseCacheName`).
if (!updateSettings.includes('updaterCacheDirName: simeon-updater'))
  fail('The app’s app-update.yml names another cache folder than the app looks in.')
if (signed !== /^publisherName:/m.test(updateSettings))
  fail(signed ? 'The app’s app-update.yml asks no signer of updates.' : 'An unsigned app asks updates to be signed.')
if (signed && process.platform === 'win32') {
  // As the installed app will judge it: valid, and the very subject it asks (lib/signature.mjs).
  for (const file of [installer, path.join(OUT, 'win-unpacked/Simeon.exe')]) {
    const refused = checkSignatureNow(file, signers)
    if (refused) fail(`${path.basename(file)} would be refused by the installed app: ${refused}.`)
  }
  console.log(`The installer's signature is valid, by ${company}'s certificate as the app asks.`)
} else if (signed) {
  console.log('Signed, but its signature can’t be checked here (Windows’ own check): try it on Windows before it goes anywhere.')
}

// --- 3. the record and the feed ---------------------------------------------

say('Writing the feed and the record')
mkdirSync(FOLDER, { recursive: true })
copyFileSync(installer, path.join(FOLDER, installerName(VERSION)))
copyFileSync(blockmap, path.join(FOLDER, `${installerName(VERSION)}.blockmap`))
const sha512 = sha('sha512', installer, 'base64')
if (feedSha512(readFileSync(path.join(OUT, 'latest.yml'), 'utf8')) !== sha512)
  fail('electron-builder’s latest.yml names another installer than the one built.')
const size = statSync(installer).size
const releaseDate = new Date().toISOString()
writeFileSync(path.join(FOLDER, 'latest.yml'), feedText({ version: VERSION, sha512, size, releaseDate }))
writeFileSync(path.join(RELEASE, 'latest.yml'), feedText({ version: VERSION, sha512, size, releaseDate, folder: VERSION }))
const FOLDER_URL = `${URL_BASE}/${platform}/${VERSION}`
const record = releaseRecord({
  version: VERSION,
  build: BUILD,
  commit: COMMIT,
  pubDate: releaseDate,
  folderUrl: FOLDER_URL,
  signed,
  exe: { sha256: sha('sha256', installer, 'hex'), size },
  blockmap: { sha256: sha('sha256', blockmap, 'hex'), size: statSync(blockmap).size },
})
writeFileSync(path.join(FOLDER, 'release.json'), `${JSON.stringify(record, null, 2)}\n`)
writeFileSync(path.join(RELEASE, 'latest.json'), `${JSON.stringify(record, null, 2)}\n`)

console.log(`\nRelease ${VERSION} (build ${BUILD}) is ready in windows/out/release/${VERSION}/:`)
for (const name of [installerName(VERSION), `${installerName(VERSION)}.blockmap`, 'release.json', 'latest.yml'])
  console.log(`  ${(statSync(path.join(FOLDER, name)).size / 1048576).toFixed(1).padStart(6)} MB  ${name}`)
console.log('Beside it: latest.yml and latest.json, which point at it.')

if (!publish) {
  console.log('\nTry the installer on a Windows PC (another account on it too): run it, sign in, quit, open it again.')
  console.log('Then put it on the website: node scripts/release.mjs --publish')
  process.exit(0)
}

// --- 4. on the website -------------------------------------------------------

const plan = uploads({ version: VERSION, s3: S3 })
const copy = ({ file, to, type, noCache }) => {
  const args = ['s3', 'cp', path.resolve(FOLDER, file), to, '--content-type', type]
  if (noCache) args.push('--cache-control', 'no-cache')
  execFileSync('aws', args, { stdio: 'inherit', shell: false })
}

say(`Uploading to ${S3}/${platform}/${VERSION}/`)
for (const upload of plan.folder) copy(upload)

for (const name of plan.checked) {
  const answer = await fetch(`${FOLDER_URL}/${name}`, { method: 'HEAD' }).catch(() => undefined)
  if (answer?.status !== 200)
    fail(`${FOLDER_URL}/${name} answers ${answer?.status ?? 'nothing'}, not 200: the files are uploaded but not public. Nothing points at them yet.`)
}

// Last, the two files that point at the new folder: the feed, then the index the Download button reads.
for (const upload of plan.pointers) copy(upload)

console.log(`\nPublished Simeon ${VERSION} for Windows.`)
console.log('  Download:  https://api.simeonlabs.com/desktop/download/windows (serves it within five minutes)')
console.log('  Check:     curl -s https://api.simeonlabs.com/desktop/download/windows/latest')
console.log('  Updates:   installed apps find it on their next daily check, or Check for Updates…')
