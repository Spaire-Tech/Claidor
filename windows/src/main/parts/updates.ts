// Step 7e, updates: the updater and its feed, Check for Updates (Updates.swift).
// Its calls are answered here (`handle`, ../bridge.ts) and named in
// clients/apps/app/src/desktop/contract.ts, in its own section.
//
// The model is ../updates/updates.ts (the Mac's `MacUpdates`), electron-updater
// its engine (../updates/engine.ts), only in a signed release or against a
// stand-in feed (../updates/feed.ts). The switches, the last checks and the
// release waiting are kept in `updates.json` in the app's data folder; what
// the updater did goes to `updates.log` beside it (../updates/log.ts).
//
// - At launch, before the window: a release left waiting by a session that
//   ended with no quit (Windows shut down) is installed, and Simeon opened
//   again; the app goes at once.
// - As the app quits (`quit`, once the page and every part are done): a
//   release waiting is installed; after Update Now, Simeon opened again.
//
// Check for Updates… is the page's (`checkForUpdates`, sent by the tray,
// 7c's): Settings › Updates comes up and looks. Whether this build has an
// updater at all is `releasedBuild` (../updates/feed.ts): a packaged build
// without a release's build number and signers has none, so the tray's item
// follows that, not only `app.isPackaged`.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { emit, handle } from '../bridge'
import type { AppContext } from '../context'
import { makeEngine } from '../updates/engine'
import {
  checksCacheName,
  feedForChecks,
  readKeptFile,
  releaseCacheName,
  releasedBuild,
  signersOf,
  writeKeptFile,
} from '../updates/feed'
import { UpdatesLog } from '../updates/log'
import { Updates, readSwitches } from '../updates/updates'

/** The app's own package.json (where a release writes its build number and signers). */
function appPackage(): unknown {
  try {
    return JSON.parse(readFileSync(path.join(app.getAppPath(), 'package.json'), 'utf8'))
  } catch {
    return undefined
  }
}

export function register(context: AppContext): void {
  const keptFile = path.join(context.dataFolder, 'updates.json')
  const signers = signersOf(appPackage())
  const released = releasedBuild({
    packaged: app.isPackaged,
    build: context.app.build,
    platform: context.app.platform,
    signers,
  })
  // A release reads only its own feed, with the signers it was signed as; a stand-in feed is for the checks.
  const feed = released ? undefined : feedForChecks(context.app.env)
  const log = new UpdatesLog(context.dataFolder)
  const engine =
    released || feed !== undefined
      ? makeEngine({
          feed,
          feedFile: path.join(context.dataFolder, 'updates-feed.yml'),
          signers: released ? signers : undefined,
          cacheName: released ? releaseCacheName : checksCacheName,
          log: (line) => log.write(line),
        })
      : undefined
  const updates = new Updates({
    engine,
    version: context.app.version,
    kept: readKeptFile(keptFile),
    keep: (value) => writeKeptFile(keptFile, value),
    send: (state) => emit(context.mainWindow()?.webContents, 'updatesChanged', state),
    quit: () => context.quit(),
    relaunch: () => app.relaunch(),
    log: (line) => log.write(line),
  })

  // Before the window: a release waiting since Windows shut Simeon down.
  if (updates.installAtLaunch()) {
    app.exit(0)
    return
  }

  handle('readUpdates', () => updates.current)
  handle('lookForUpdates', () => updates.look())
  handle('installUpdate', () => {
    void updates.install()
  })
  handle('setUpdateSwitches', (_from, switches) => updates.setSwitches(readSwitches(switches)))

  // The installer only once everything else is done; never on a failed quit.
  app.on('quit', (_event, exitCode) => {
    if (exitCode === 0) updates.quitting()
  })
  updates.start()
  context.beforeQuit(() => updates.stop())
}
