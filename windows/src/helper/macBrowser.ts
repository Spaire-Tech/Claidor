// The Mac's browser (step 4 of docs/app-browser/README.md, decision 1): the
// same browser as the Windows app's (src/main/browser/), run as a small
// helper the Mac app starts, with no window of its own and no Dock icon.
// The Mac app talks to it in JSON lines on its standard input and output
// (`HelperIn`, `HelperOut` below, docs/app-browser/protocol.md "The Mac's
// helper"):
//
// - The Mac app hands it the engine's address and keys while its hands'
//   line is open (MacLocalHands.swift), as the Windows page does, and says
//   when it closes, when the person signs out, and when its window shows.
// - It answers what the Computer tab asks (the agent's tabs, Take control,
//   the bar, the person's input) and sends the tab's pictures, as the
//   Windows app tells its page (`browserShown`, `browserFrame`).
// - It quits when told, or when its input closes (the Mac app gone).
//
// The sign-ins are its own, in the folder the Mac app gives it
// (`--data=`), shared by all the person's agents (decision 2). Nothing it
// is told or sends is logged but the steps' names and times (browser.log).

import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createInterface } from 'node:readline'
import { BrowserWindow, app, net } from 'electron'
import type { BrowserBarAct, BrowserInput } from '../../../clients/apps/app/src/desktop/contract'
import { Control } from '../main/browser/control'
import { BrowserLink } from '../main/browser/link'
import { Steps } from '../main/browser/steps'
import { Tabs } from '../main/browser/tabs'
import { BrowserViewer } from '../main/browser/view'
import { HandsLog } from '../main/hands/hands'
import { checkTarget } from '../main/hands/target'
import { fetchTransport } from '../main/hands/transport'

/** What the Mac app says, one JSON object a line. `id` asks for a `reply`. */
export type HelperIn =
  | { kind: 'engine'; target: unknown }
  | { kind: 'engineClosed' }
  | { kind: 'signedOut' }
  | { kind: 'visible'; visible: boolean }
  | { kind: 'watch'; id: number; agentId: string | null }
  | { kind: 'state'; id: number; agentId: string }
  | { kind: 'control'; id: number; agentId: string; person: boolean }
  | { kind: 'bar'; agentId: string; act: BrowserBarAct }
  | { kind: 'input'; agentId: string; input: BrowserInput }
  | { kind: 'browsing'; id: number }
  | { kind: 'quit' }

/** What it tells the Mac app. A frame's picture is a JPEG, in base64. */
export type HelperOut =
  | { kind: 'ready' }
  | { kind: 'reply'; id: number; value?: unknown; error?: string }
  | { kind: 'shown'; shown: unknown }
  | { kind: 'frame'; agentId: string; tabId: string; width: number; height: number; jpeg: string }
  | { kind: 'problem'; message: string }

function argument(name: string): string | undefined {
  const prefix = `--${name}=`
  return process.argv.find((one) => one.startsWith(prefix))?.slice(prefix.length)
}

const data = argument('data') ?? path.join(os.homedir(), 'Library', 'Application Support', 'Simeon', 'Browser')
const apiBase = argument('api') ?? 'https://api.simeonlabs.com'
mkdirSync(data, { recursive: true })
app.setPath('userData', data)
app.dock?.hide()
// Its tabs are windows; it lives on without them, until the Mac app says.
app.on('window-all-closed', () => {})

const say = (line: HelperOut) => {
  try {
    process.stdout.write(`${JSON.stringify(line)}\n`)
  } catch {
    // The Mac app gone: its input closing quits this too.
  }
}

/** A random name for this Mac's browser, kept in its folder (never anything of the hardware). */
function deviceId(): string {
  const file = path.join(data, 'browser-device')
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
    // Unkept: a new one next time; only the engine's log reads it.
  }
  return made
}

void app.whenReady().then(() => {
  const written = new HandsLog(path.join(data, 'browser.log'))
  const log = (line: string) => written.write(line)
  const tabs = new Tabs({ downloads: path.join(app.getPath('downloads'), 'Simeon'), log })
  const control = new Control()
  let viewer: BrowserViewer | undefined
  const steps = new Steps({
    tabs,
    uploads: path.join(data, 'browser-uploads'),
    control,
    place: 'this Mac',
    pointer: (group, x, y, type) => viewer?.pointed(group, x, y, type),
    activity: (group) => viewer?.changed(group),
  })
  void steps.forgetUploads()
  const link = new BrowserLink({
    transport: fetchTransport((input, init) => net.fetch(input, init)),
    hello: { platform: 'mac', label: os.hostname(), deviceId: deviceId(), browserSession: randomBytes(16).toString('hex') },
    run: (request, signal) => steps.run(request, signal),
    log,
    welcomed: () => viewer?.changed(),
  })
  // The Mac app's window is the page that watches: one hidden window stands for it (the viewer keys its watch on a page).
  const page = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true } })
  void page.loadURL('about:blank')
  let visible = true
  const shownAgain: (() => void)[] = []
  const shown = new BrowserViewer({
    tabs,
    steps,
    control,
    enabled: () => link.enabled,
    shown: (_to, payload) => say({ kind: 'shown', shown: payload }),
    frame: (_to, payload) =>
      say({ kind: 'frame', agentId: payload.agentId, tabId: payload.tabId, width: payload.width, height: payload.height, jpeg: Buffer.from(payload.jpeg).toString('base64') }),
    log,
    // No picture while the Mac's window is hidden or in the Dock; drawn again as it comes back.
    shows: () => visible,
    whenShown: (_page, again) => shownAgain.push(again),
  })
  viewer = shown

  let ending = false
  const end = async () => {
    if (ending) return
    ending = true
    link.end()
    shown.drop()
    tabs.closeAll()
    await steps.forgetUploads()
    app.quit()
  }
  const reply = (id: number, work: () => unknown) => {
    Promise.resolve()
      .then(work)
      .then(
        (value) => say({ kind: 'reply', id, value: value ?? null }),
        (error: unknown) => say({ kind: 'reply', id, error: error instanceof Error ? error.message : 'It could not be done.' }),
      )
  }
  const agentOf = (value: unknown): string => {
    if (typeof value !== 'string' || value.length === 0 || value.length > 256) throw new Error('An agent was expected.')
    return value
  }

  const hear = (line: string) => {
    let said: HelperIn
    try {
      said = JSON.parse(line) as HelperIn
    } catch {
      return
    }
    if (typeof said !== 'object' || said === null) return
    switch (said.kind) {
      case 'engine':
        try {
          link.follow(checkTarget(said.target, apiBase))
        } catch (error) {
          say({ kind: 'problem', message: error instanceof Error ? error.message : 'The engine’s address was refused.' })
        }
        return
      case 'engineClosed':
        link.end()
        return
      case 'signedOut':
        // The next account on this Mac starts with no sign-ins.
        link.end()
        shown.drop()
        tabs.closeAll()
        void tabs.session.clearStorageData().catch(() => {})
        return
      case 'visible':
        visible = said.visible === true
        if (visible) for (const again of shownAgain) again()
        return
      case 'watch':
        return reply(said.id, () => shown.watch(page.webContents, said.agentId === null ? null : agentOf(said.agentId)))
      case 'state':
        return reply(said.id, () => shown.state(agentOf(said.agentId)))
      case 'control':
        return reply(said.id, () => shown.control(page.webContents, agentOf(said.agentId), said.person === true))
      case 'bar':
        try {
          if (typeof said.act === 'object' && said.act !== null) shown.bar(agentOf(said.agentId), said.act)
        } catch {
          // A malformed act is dropped.
        }
        return
      case 'input':
        try {
          if (typeof said.input === 'object' && said.input !== null) shown.input(agentOf(said.agentId), said.input)
        } catch {
          // A malformed input is dropped, never thrown at every pointer move.
        }
        return
      case 'browsing':
        return reply(said.id, () => tabs.groups())
      case 'quit':
        void end()
    }
  }
  const lines = createInterface({ input: process.stdin })
  lines.on('line', hear)
  // The Mac app gone (or crashed): this goes too, its tabs closed, its sign-ins kept.
  lines.on('close', () => void end())
  say({ kind: 'ready' })
})
