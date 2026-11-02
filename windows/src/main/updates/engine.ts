// electron-updater as the model's engine (updates.ts), in Sparkle's place.
// Its NSIS updater reads the feed's `latest.yml`, downloads the installer it
// names (checked against the sha512 in it, and, in a signed release, against
// the publisher the release was signed as: electron-builder writes that name
// into the app's `app-update.yml`), and runs it silently.
//
// Nothing is downloaded or installed unless the model asks (`autoDownload`
// off): a look only reads the feed. A downloaded release installs as the app
// quits (`autoInstallOnAppQuit`); Update Now installs it at once and opens
// Simeon again.

import { writeFileSync } from 'node:fs'
import { NsisUpdater } from 'electron-updater'
import { feedSettings } from './feed'
import type { UpdateEngine } from './updates'

export function makeEngine(options: {
  /** A stand-in feed for the checks; undefined for a release (its own `app-update.yml`). */
  feed?: string
  /** Where the stand-in feed's settings are written (the app's data folder). */
  feedFile: string
}): UpdateEngine {
  const updater = new NsisUpdater()
  updater.logger = null
  updater.autoDownload = false
  updater.autoInstallOnAppQuit = true
  updater.disableWebInstaller = true
  if (options.feed) {
    // An unpackaged app reads its settings from a file of its own, here the stand-in's.
    writeFileSync(options.feedFile, JSON.stringify(feedSettings(options.feed)))
    updater.forceDevUpdateConfig = true
    updater.updateConfigPath = options.feedFile
  }
  return {
    async check() {
      const result = await updater.checkForUpdates()
      if (result == null) throw new Error('The updater is off.')
      return result.isUpdateAvailable ? result.updateInfo.version : null
    },
    async download() {
      await updater.downloadUpdate()
    },
    installNow() {
      // electron-updater says a failure to start the installer as an `error`, at once.
      let failed = false
      const failure = () => {
        failed = true
      }
      updater.once('error', failure)
      try {
        updater.quitAndInstall(true, true)
      } finally {
        updater.removeListener('error', failure)
      }
      return !failed
    },
  }
}
