// The browser in the app on its own, for `npm run browser-smoke`
// (scripts/browser-smoke.mjs): the tabs, the steps and the line to the
// engine as parts/browser.ts makes them, against the stand-in engine the
// smoke runs, with a sign-in store of its own (in memory) and folders of its
// own. Nothing else of the app starts.
//
// Step 2b's view (src/main/browser/view.ts) watches for a page of its own
// here, an empty window, and what it would tell the app's page is kept and
// read on a port of this computer (`[harness] view <address>`): the state,
// how many pictures came and the last one's first bytes; the smoke watches,
// takes control, sends the person's input and the bar's buttons there.

import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { BrowserWindow, app, net } from 'electron'
import type { BrowserFrame, BrowserShown } from '../../clients/apps/app/src/desktop/contract'
import { ruleEveryPage } from '../src/main/navigation'
import { Control } from '../src/main/browser/control'
import { BrowserLink } from '../src/main/browser/link'
import { Steps } from '../src/main/browser/steps'
import { Tabs } from '../src/main/browser/tabs'
import { BrowserViewer } from '../src/main/browser/view'
import { fetchTransport } from '../src/main/hands/transport'

const engine = process.env.SMOKE_ENGINE_URL ?? ''
const downloads = process.env.SMOKE_DOWNLOADS ?? ''
const uploads = process.env.SMOKE_UPLOADS ?? ''

app.on('window-all-closed', () => {
  // The tabs are windows; the harness lives on without them.
})

// The app's own rule for every page (main.ts), so the tabs are checked under it: nothing of theirs may reach the default browser.
ruleEveryPage({
  appStart: 'app://simeon/app-next/',
  opensOutside: () => true,
  openOutside: (url) => console.log(`[harness] opened outside: ${url}`),
})

void app.whenReady().then(() => {
  const tabs = new Tabs({ downloads, log: (line) => console.log(line), partition: 'simeon-browser-smoke' })
  const control = new Control()
  let viewer: BrowserViewer | undefined
  const steps = new Steps({
    tabs,
    uploads,
    control,
    pointer: (group, x, y, type) => viewer?.pointed(group, x, y, type),
    activity: (group) => viewer?.changed(group),
  })
  const link = new BrowserLink({
    transport: fetchTransport((input, init) => net.fetch(input, init)),
    hello: { label: 'Smoke PC', deviceId: 'smoke-device', browserSession: 'smoke-session-0001' },
    run: (request, signal) => steps.run(request, signal),
    log: (line) => console.log(line),
    welcomed: () => viewer?.changed(),
  })
  link.follow({ baseURL: engine, headers: { authorization: 'Bearer smoke-token' } })

  // What the view tells the app's page, kept for the smoke.
  const told: { shown: BrowserShown[]; frames: number; last?: { tabId: string; width: number; height: number; head: number[]; bytes: number } } = { shown: [], frames: 0 }
  const page = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true } })
  void page.loadURL('about:blank')
  const shown = new BrowserViewer({
    tabs,
    steps,
    control,
    enabled: () => link.enabled,
    shown: (_to, payload) => told.shown.push(payload),
    frame: (_to, payload: BrowserFrame) => {
      told.frames += 1
      told.last = { tabId: payload.tabId, width: payload.width, height: payload.height, head: [...payload.jpeg.subarray(0, 3)], bytes: payload.jpeg.byteLength }
    },
    log: (line) => console.log(line),
  })
  viewer = shown
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      void (async () => {
        const body = chunks.length > 0 ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}
        let answer: unknown = null
        switch (req.url) {
          case '/watch':
            answer = shown.watch(page.webContents, body.agentId ?? null)
            break
          case '/control':
            answer = await shown.control(page.webContents, body.agentId, body.person === true)
            break
          case '/bar':
            shown.bar(body.agentId, body.act)
            break
          case '/input':
            try {
              shown.input(body.agentId, body.input)
            } catch {
              // Dropped, as parts/browser.ts drops it.
            }
            break
          case '/told':
            answer = { last: told.shown.at(-1), count: told.shown.length, frames: told.frames, frame: told.last }
            break
          case '/reload-page':
            // The app's page loading again: everything is given back.
            await page.loadURL('about:blank#again').catch(() => undefined)
            await page.webContents.loadURL('data:text/html,again').catch(() => undefined)
            break
        }
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(answer))
      })().catch((error: unknown) => res.writeHead(500).end(String(error)))
    })
  })
  server.listen(0, '127.0.0.1', () => {
    console.log(`[harness] view http://127.0.0.1:${(server.address() as AddressInfo).port}`)
    console.log('[harness] ready')
  })
})
