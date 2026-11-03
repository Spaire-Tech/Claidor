// electron-updater as the model's engine (updates.ts), in Sparkle's place.
// Its NSIS updater reads the feed's `latest.yml` and downloads the installer
// it names, checked against the sha512 in it. The rest is the app's own:
//
// - Whether the installer is the company's (../../../scripts/lib/signature.mjs):
//   asked of Windows, judged on the certificate's whole subject, refused on
//   any doubt (electron-updater's own check counts a PowerShell that can't
//   run as passed). Asked as the download ends, and again just before the
//   installer runs.
// - Running it: only once the app has quit (the page's work and every part's
//   done), or at a launch before the window (updates.ts). electron-updater
//   never installs by itself (`autoInstallOnAppQuit` off).
//
// Nothing is downloaded unless the model asks (`autoDownload` off). The
// updater's own lines go to updates.log. It sends no lasting id of this PC:
// its staging header is the same for everyone (Sparkle sends none).

import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { NsisUpdater } from 'electron-updater'
import { checkSignature, checkSignatureNow } from '../../../scripts/lib/signature.mjs'
import { feedSettings, updaterCacheRoot } from './feed'
import { inPending, sha512Of } from './files'
import type { UpdateEngine, Waiting } from './updates'

/** What electron-updater sends as `x-user-staging-id` instead of an id of its own for this PC. */
export const sameForEveryone = '00000000-0000-0000-0000-000000000000'

export function makeEngine(options: {
  /** A stand-in feed for the checks; undefined for a release (its own `app-update.yml`). */
  feed?: string
  /** Where the stand-in feed's settings are written (the app's data folder). */
  feedFile: string
  /** The certificates' subjects an installer must be signed by: a release's; none for the checks' stand-in feed (Windows' check can't run off Windows). */
  signers?: readonly string[]
  /** The updater's cache folder's name (app-update.yml's `updaterCacheDirName`). */
  cacheName: string
  log(line: string): void
}): UpdateEngine {
  const updater = new NsisUpdater()
  const say = (kind: string) => (message?: unknown) => options.log(`updater ${kind}: ${String(message)}`)
  updater.logger = { info: say('info'), warn: say('warn'), error: say('error') }
  updater.autoDownload = false
  updater.autoInstallOnAppQuit = false
  updater.disableWebInstaller = true
  updater.requestHeaders = { 'x-user-staging-id': sameForEveryone }
  const signers = options.signers
  if (signers) {
    // electron-updater's own check, as its download ends, is ours: refused on any doubt.
    updater.verifyUpdateCodeSignature = (_names, file) => checkSignature(file, signers)
  }
  if (options.feed) {
    // An unpackaged app reads its settings from a file of its own, here the stand-in's.
    writeFileSync(options.feedFile, JSON.stringify(feedSettings(options.feed)))
    updater.forceDevUpdateConfig = true
    updater.updateConfigPath = options.feedFile
  }
  const cache = path.join(updaterCacheRoot(), options.cacheName)
  let latest: { version: string; sha512: string } | undefined

  return {
    async check() {
      const result = await updater.checkForUpdates()
      if (result == null) throw new Error('the updater is off')
      if (!result.isUpdateAvailable) return null
      const info = result.updateInfo
      const exe = info.files.find((file) => file.url.toLowerCase().endsWith('.exe'))
      const sha512 = exe?.sha512 ?? info.sha512
      if (typeof sha512 !== 'string') throw new Error('the feed names no sha512')
      latest = { version: info.version, sha512 }
      return latest
    },
    async download() {
      const found = latest
      if (!found) throw new Error('nothing found to download')
      const [file] = await updater.downloadUpdate()
      if (!file) throw new Error('nothing was downloaded')
      if (signers) {
        const refused = await checkSignature(file, signers)
        if (refused) throw new Error(refused)
      }
      return { file, sha512: found.sha512 }
    },
    vetNow(waiting: Waiting) {
      if (!inPending(waiting.file, waiting.version, cache)) return 'the installer is not where the updater keeps it'
      let sha512: string
      try {
        sha512 = sha512Of(waiting.file)
      } catch {
        return 'the installer is gone'
      }
      if (sha512 !== waiting.sha512) return 'the installer is not the one the feed named'
      return signers ? checkSignatureNow(waiting.file, signers) : null
    },
    run(file: string, relaunch: boolean) {
      // electron-updater's NSIS install: `--updated`, silent, and opened again after it when asked.
      try {
        const child = spawn(file, ['--updated', '/S', ...(relaunch ? ['--force-run'] : [])], {
          detached: true,
          stdio: 'ignore',
          shell: false,
        })
        child.on('error', (error) => options.log(`the installer could not start: ${error.message}`))
        child.unref()
        return true
      } catch {
        return false
      }
    },
  }
}
