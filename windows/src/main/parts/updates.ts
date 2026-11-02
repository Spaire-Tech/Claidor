// Step 7e, updates: the updater and its feed, Check for Updates (Updates.swift).
// Its calls are answered here (`handle`, ../bridge.ts) and named in
// clients/apps/app/src/desktop/contract.ts, in its own section.
//
// The model is ../updates/updates.ts (the Mac's `MacUpdates`), electron-updater
// its engine (../updates/engine.ts), only in a release or against a stand-in
// feed (../updates/feed.ts). The switches and the last check are kept in
// `updates.json` in the app's data folder. Check for Updates… is the page's
// (`checkForUpdates`, sent by the tray, 7c's): Settings › Updates comes up
// and looks. Whether this build has an updater at all is `releasedBuild`
// (../updates/feed.ts): a packaged build without a release's build number
// has none, so the tray's item follows that, not only `app.isPackaged`.

import path from 'node:path'
import { app } from 'electron'
import { emit, handle } from '../bridge'
import type { AppContext } from '../context'
import { makeEngine } from '../updates/engine'
import { feedForChecks, readKeptFile, releasedBuild, writeKeptFile } from '../updates/feed'
import { Updates, readSwitches } from '../updates/updates'

export function register(context: AppContext): void {
  const keptFile = path.join(context.dataFolder, 'updates.json')
  const released = releasedBuild({
    packaged: app.isPackaged,
    build: context.app.build,
    platform: context.app.platform,
  })
  // A release reads only its own feed, with the publisher it was signed as; a stand-in feed is for the checks.
  const feed = released ? undefined : feedForChecks(context.app.env)
  const engine =
    feed !== undefined || released
      ? makeEngine({ feed, feedFile: path.join(context.dataFolder, 'updates-feed.yml') })
      : undefined
  const updates = new Updates({
    engine,
    kept: readKeptFile(keptFile),
    keep: (value) => writeKeptFile(keptFile, value),
    send: (state) => emit(context.mainWindow()?.webContents, 'updatesChanged', state),
  })

  handle('readUpdates', () => updates.current)
  handle('lookForUpdates', () => updates.look())
  handle('installUpdate', () => {
    void updates.install()
  })
  handle('setUpdateSwitches', (_from, switches) => updates.setSwitches(readSwitches(switches)))

  updates.start()
  context.beforeQuit(() => updates.stop())
}
