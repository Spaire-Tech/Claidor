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
//
// Step 2b: the Computer tab's view of an agent's tabs and Take control
// (../browser/view.ts), for the app's own window only.

import { randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { BrowserWindow, type WebContents, app, net } from 'electron'
import type { BrowserBarAct, BrowserInput } from '../../../../clients/apps/app/src/desktop/contract'
import { emit, handle, text } from '../bridge'
import type { AppContext } from '../context'
import { Control } from '../browser/control'
import { BrowserLink } from '../browser/link'
import { Steps } from '../browser/steps'
import { Tabs } from '../browser/tabs'
import { BrowserViewer } from '../browser/view'
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
  const control = new Control()
  context.browsing(() => tabs.groups())
  // The viewer is made just below; the steps tell it where the agent points and when it works.
  let viewer: BrowserViewer | undefined
  const steps = new Steps({
    tabs,
    uploads: path.join(context.dataFolder, 'browser-uploads'),
    control,
    pointer: (group, x, y, type) => viewer?.pointed(group, x, y, type),
    activity: (group) => viewer?.changed(group),
  })
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
    welcomed: () => viewer?.changed(),
  })
  viewer = new BrowserViewer({
    tabs,
    steps,
    control,
    enabled: () => link.enabled,
    shown: (to, payload) => emit(to, 'browserShown', payload),
    frame: (to, payload) => emit(to, 'browserFrame', payload),
    log,
    // No picture is made while the window is in the tray or minimised (its page can't tell: it isn't throttled, for calls).
    shows: (page) => {
      const window = BrowserWindow.fromWebContents(page)
      return !!window && window.isVisible() && !window.isMinimized()
    },
    whenShown: (page, again) => {
      const window = BrowserWindow.fromWebContents(page)
      window?.on('show', again)
      window?.on('restore', again)
    },
  })
  const shown = viewer

  // Only the app's own window sees and drives the agents' tabs (not the call's window).
  const fromWindow = (from: WebContents) => {
    if (context.mainWindow()?.webContents !== from) throw new Error('Only the app’s window may do this.')
  }
  const agentOf = (value: unknown) => text(value, 256)
  handle('browserWatch', (from, agentId) => {
    fromWindow(from)
    return shown.watch(from, agentId === null ? null : agentOf(agentId))
  })
  handle('browserState', (from, agentId) => {
    fromWindow(from)
    return shown.state(agentOf(agentId))
  })
  handle('browserControl', (from, agentId, person) => {
    fromWindow(from)
    return shown.control(from, agentOf(agentId), person === true)
  })
  handle('browserBar', (from, agentId, act) => {
    fromWindow(from)
    if (typeof act !== 'object' || act === null) throw new Error('An act was expected.')
    shown.bar(agentOf(agentId), act as BrowserBarAct)
  })
  handle('browserInput', (from, agentId, input) => {
    fromWindow(from)
    if (typeof input !== 'object' || input === null) throw new Error('An input was expected.')
    try {
      shown.input(agentOf(agentId), input as BrowserInput)
    } catch {
      // A malformed input from the page is dropped, never thrown at every pointer move.
    }
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
      shown.drop()
      tabs.closeAll()
      void tabs.session.clearStorageData().catch(() => {})
    },
  })

  context.beforeQuit(async () => {
    link.end()
    shown.drop()
    tabs.closeAll()
    await steps.forgetUploads()
  })
}
