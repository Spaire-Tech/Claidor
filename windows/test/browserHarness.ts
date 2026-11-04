// The browser in the app on its own, for `npm run browser-smoke`
// (scripts/browser-smoke.mjs): the tabs, the steps and the line to the
// engine as parts/browser.ts makes them, against the stand-in engine the
// smoke runs, with a sign-in store of its own (in memory) and folders of its
// own. Nothing else of the app starts.

import { app, net } from 'electron'
import { ruleEveryPage } from '../src/main/navigation'
import { BrowserLink } from '../src/main/browser/link'
import { Steps } from '../src/main/browser/steps'
import { Tabs } from '../src/main/browser/tabs'
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
  const steps = new Steps({ tabs, uploads })
  const link = new BrowserLink({
    transport: fetchTransport((input, init) => net.fetch(input, init)),
    hello: { label: 'Smoke PC', deviceId: 'smoke-device', browserSession: 'smoke-session-0001' },
    run: (request, signal) => steps.run(request, signal),
    log: (line) => console.log(line),
  })
  link.follow({ baseURL: engine, headers: { authorization: 'Bearer smoke-token' } })
  console.log('[harness] ready')
})
