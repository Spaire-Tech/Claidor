// Step 2a of docs/app-browser/README.md, the browser in the app: the
// agents' websites open here, in tabs of the app's own, while the app is
// open, instead of on Simeon's computer (when the server's switch is on for
// the person: SIMEON_APP_BROWSER_USERS). The tabs are ../browser/tabs.ts,
// the steps ../browser/steps.ts, the line to the engine ../browser/link.ts.
//
// The browser dials the engine while the hands' stream is open
// (parts/hands.ts, `followHandsLine`), on the same address and keys, and
// stops when it closes. Signing out closes every tab and forgets the sites'
// sign-ins (the next account on this PC starts with none); quitting closes
// the tabs and keeps them.

import { randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { app, net } from 'electron'
import type { AppContext } from '../context'
import { BrowserLink } from '../browser/link'
import { Steps } from '../browser/steps'
import { Tabs } from '../browser/tabs'
import { HandsLog } from '../hands/hands'
import { fetchTransport } from '../hands/transport'
import { followHandsLine } from './hands'

/** A random name for this PC's browser, kept in the data folder (never anything of the hardware). */
function deviceId(dataFolder: string): string {
  const file = path.join(dataFolder, 'browser-device')
  try {
    const kept = readFileSync(file, 'utf8').trim()
    if (/^[0-9a-f]{32}$/.test(kept)) return kept
  } catch {
    // Made below.
  }
  const made = randomBytes(16).toString('hex')
  try {
    writeFileSync(file, made, { mode: 0o600 })
  } catch {
    // Unkept, a new one next time: only the engine's log reads it.
  }
  return made
}

export function register(context: AppContext): void {
  // Steps, counts and times, never an address, a page's words or a key (`browser.log` in the data folder).
  const written = new HandsLog(path.join(context.dataFolder, 'browser.log'))
  const log = (line: string) => written.write(line)
  const tabs = new Tabs({ downloads: path.join(app.getPath('downloads'), 'Simeon'), log })
  const steps = new Steps({ tabs, uploads: path.join(context.dataFolder, 'browser-uploads') })
  void steps.forgetUploads()
  const link = new BrowserLink({
    transport: fetchTransport((input, init) => net.fetch(input, init)),
    hello: {
      label: os.hostname(),
      deviceId: deviceId(context.dataFolder),
      // A new one each time the app starts: the engine knows the tabs of an app that quit are gone.
      browserSession: randomBytes(16).toString('hex'),
    },
    run: (request, signal) => steps.run(request, signal),
    log,
  })

  let open = 0
  followHandsLine({
    opened(target) {
      open += 1
      link.follow(target)
    },
    closed() {
      open = Math.max(0, open - 1)
      if (open === 0) link.end()
    },
    signedOut() {
      open = 0
      link.end()
      tabs.closeAll()
      void tabs.session.clearStorageData().catch(() => {})
    },
  })

  context.beforeQuit(async () => {
    link.end()
    tabs.closeAll()
    await steps.forgetUploads()
  })
}
