// The browser in the app, seen in the app itself (docs/app-browser/README.md,
// step 2b): the Windows app run for real (Electron, on this computer: Windows,
// or Linux under a virtual display) against the stand-in server and computer
// (test/standIn.mjs), whose gateway also serves the agent's hands and the
// browser's line as the engine does. The page's own hands loop opens the
// line; the stand-in engine opens a page in Theo's tab; the Computer tab
// shows it, then the full view, Take control with the real mouse and keys,
// Give back; then the take-over card (step 3): Take over opens Theo's tab in
// Take control and I'm done gives it back and answers the agent. No real
// site and no real service is reached.
//
//   npm run browser-view-smoke           (Linux: xvfb-run -a npm run browser-view-smoke)
//   SHOTS=<folder> npm run browser-view-smoke   (keeps screenshots)
//
// It prints what it saw and exits 1 on a failure.

import { mkdtempSync, rmSync } from 'node:fs'
import http from 'node:http'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { fakeKeptTokens, startStandIn } from '../test/standIn.mjs'

const require = createRequire(import.meta.url)
const { _electron: electron } = require('playwright-core')
const here = fileURLToPath(new URL('..', import.meta.url))
const binary = require('electron')

const failures = []
const check = (ok, what, detail) => {
  if (!ok) failures.push(what)
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${!ok && detail !== undefined ? `\n     ${String(detail).slice(0, 600)}` : ''}`)
}
const soon = (ms) => new Promise((done) => setTimeout(done, ms))

// MARK: The test site: a red block at the top left, a button, a field.

function site() {
  const view = `<!doctype html><html><head><meta charset="utf-8"><title>View</title></head><body style="margin:0">
    <div style="position:absolute;left:0;top:0;width:200px;height:60px;background:#ff0000"></div>
    <button id="press" style="position:absolute;left:100px;top:100px;width:200px;height:60px" onclick="document.title='person '+event.isTrusted">Press</button>
    <input id="field" style="position:absolute;left:100px;top:300px;width:300px;height:30px" oninput="document.title='typed '+this.value">
    <button id="agent" style="position:absolute;left:500px;top:100px;width:120px;height:40px" onclick="document.title='agent clicked'">Agent</button>
  </body></html>`
  const server = http.createServer((req, res) => {
    if ((req.url ?? '').startsWith('/view')) {
      res.writeHead(200, { 'content-type': 'text/html' })
      return res.end(view)
    }
    res.writeHead(404).end()
  })
  return new Promise((done) =>
    server.listen(0, '127.0.0.1', () => done({ base: `http://127.0.0.1:${server.address().port}`, close: () => { server.closeAllConnections(); server.close() } })),
  )
}

// MARK: The stand-in engine, on the stand-in computer's gateway

function engine() {
  const beats = new Set()
  const hold = (response, headers, first) => {
    response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', ...headers })
    response.write(`data: ${JSON.stringify(first)}\n\n`)
    // A keep-alive, as the engine's gateway sends one every 15 s.
    const beat = setInterval(() => response.write(': keep-alive\n\n'), 5_000)
    beats.add(beat)
    response.on('close', () => clearInterval(beat))
  }
  let browserStream
  let helloSeen
  const hello = new Promise((done) => (helloSeen = done))
  const waiting = new Map()
  let count = 0
  // The take-over the engine would start (request_box_help): its status on the computer, and the answers to it.
  const takeOver = { pending: false, answers: [] }
  const handoff = { requestId: 'h1', instruction: 'Sign in to the shop, then press I’m done.' }
  const routes = (record, args) => {
    if (record.path === '/box/api/getForeverBoxStatus' && args.id === 'theo' && takeOver.pending)
      return { json: { agentId: 'theo', state: 'running', handoff } }
    if (record.path === '/box/api/handBackForeverBox') {
      takeOver.answers.push(args)
      takeOver.pending = false
      return { json: {} }
    }
    if (record.path === '/box/local-exec/requests' && record.method === 'GET')
      return { stream: (response, headers) => hold(response, headers, { kind: 'welcome', providerId: 'hands-1' }) }
    if (record.path === '/box/local-exec/responses' && record.method === 'POST') return { json: {} }
    if (record.path === '/box/local-browser/requests' && record.method === 'GET')
      return {
        stream: (response, headers) => {
          browserStream = response
          hold(response, headers, { kind: 'welcome', providerId: 'browser-1', protocol: 1, enabled: true })
        },
      }
    if (record.path === '/box/local-browser/responses' && record.method === 'POST') {
      for (const frame of args.frames ?? []) {
        if (frame.kind === 'hello') helloSeen(frame)
        if (frame.kind === 'response') waiting.get(frame.requestId)?.(frame)
      }
      return { json: {} }
    }
    return undefined
  }
  return {
    routes,
    hello,
    takeOver,
    handoff,
    /** One browser step for Theo, as the engine sends it; its answer. */
    step(op, args = {}, { deadlineMs = 60_000, waitMs = 70_000 } = {}) {
      const requestId = `r${++count}`
      const answer = new Promise((resolve) => {
        waiting.set(requestId, resolve)
        setTimeout(() => resolve({ timedOut: true }), waitMs)
      })
      browserStream?.write(`data: ${JSON.stringify({ kind: 'request', requestId, protocol: 1, op, viewId: 'theo', args, screenshot: false, deadlineMs })}\n\n`)
      return answer
    },
    close() {
      for (const beat of beats) clearInterval(beat)
    },
  }
}

async function launch(standIn, dataFolder) {
  const args = [here, `--api=${standIn.base}`]
  if (process.platform === 'linux') args.push('--no-sandbox')
  const app = await electron.launch({ executablePath: binary, args, env: { ...process.env, SIMEON_USER_DATA: dataFolder } })
  const page = await app.firstWindow()
  const errors = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.waitForLoadState('domcontentloaded')
  return { app, page, errors }
}

const pages = await site()
const stand = engine()
const standIn = await startStandIn({ routes: stand.routes })
// The take-over's card in Theo's chat, as the engine writes it (`boxRequestId`).
// An in-chat form in Theo's chat and in Iris's: its lock line says where the values are typed (step 3b).
const formLine = (id) => ({ kind: 'send-message', id, message: { type: 'user-form', form: { title: 'Sign in to the shop', domain: '127.0.0.1', fields: [{ id: 'email', label: 'Email', type: 'email' }] } }, timestampMs: Date.now() - 60_000 })
standIn.state.box.lines.theo.push(formLine('form-theo'))
standIn.state.box.lines.iris.push(formLine('form-iris'))
standIn.state.box.lines.theo.push({ kind: 'send-message', id: 'take-over', message: { type: 'text', content: stand.handoff.instruction }, boxRequestId: stand.handoff.requestId, timestampMs: Date.now() })
const dataFolder = mkdtempSync(path.join(os.tmpdir(), 'simeon-browser-view-'))
const shots = process.env.SHOTS
let running
try {
  // The first launch keeps the pair and opens the pane next time.
  {
    const { app, page } = await launch(standIn, dataFolder)
    await page.evaluate((tokens) => {
      window.simeonDesktop.keep('simeon.web.tokens', tokens)
      localStorage.setItem('simeon.pane.open', 'true')
    }, fakeKeptTokens)
    await page.waitForTimeout(300)
    await app.close()
  }
  const { app, page, errors } = await launch(standIn, dataFolder)
  running = app
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1400, 900))
  await page.waitForSelector('.sidebar', { timeout: 15_000 }).catch(() => {})

  // The page's own hands loop opens the browser's line on the computer's gateway.
  const hello = await Promise.race([stand.hello, soon(30_000).then(() => undefined)])
  check(hello?.browser === true && hello.protocol === 1, 'the app’s page opens the browser’s line with its hands, and says it has a browser', JSON.stringify(hello))

  let answer = await stand.step('navigate', { url: `${pages.base}/view` })
  check(answer.ok === true && answer.title === 'View', 'the engine opens a page in Theo’s tab', JSON.stringify(answer))

  // The Computer tab.
  await page.locator('.sidebar').getByText('Theo', { exact: true }).first().click()
  await page.getByRole('tab', { name: 'Computer' }).click()
  await page.waitForSelector('.computer-preview .browser-canvas', { timeout: 10_000 }).catch(() => {})
  const where = await page.locator('.computer-where').textContent().catch(() => null)
  check(where === 'On this PC', 'the Computer tab says the work is on this PC', where)
  const caption = await page.locator('.computer-preview .computer-caption').textContent().catch(() => null)
  check(caption?.includes('Not Secure') && caption.includes('127.0.0.1'), 'under it, the site, said not secure over http', caption)
  await page.waitForFunction(() => document.querySelector('.computer-preview .frame-screen')?.style.opacity === '1', null, { timeout: 10_000 }).catch(() => {})
  const pixel = (selector, x, y) =>
    page.evaluate(
      ([selector, x, y]) => {
        const canvas = document.querySelector(selector)
        if (!canvas) return null
        return [...canvas.getContext('2d').getImageData(x, y, 1, 1).data].slice(0, 3)
      },
      [selector, x, y],
    )
  const red = await pixel('.computer-preview .browser-canvas', 50, 30)
  check(red && red[0] > 200 && red[1] < 60 && red[2] < 60, 'the frame shows Theo’s tab, drawn from its pictures', JSON.stringify(red))
  answer = await stand.step('mouse_click_xy', { x: 560, y: 120, element: 'Agent' })
  await page.waitForSelector('.computer-preview .agent-face-pointer', { timeout: 5_000 }).catch(() => {})
  check(answer.ok === true && (await page.locator('.computer-preview .agent-face-pointer').count()) === 1, 'Theo’s face shows where it clicked', JSON.stringify(answer))
  if (shots) await page.screenshot({ path: path.join(shots, 'browser-pane.png') })

  // No picture is made while the window is in the tray; a new one comes when it is back.
  await page.evaluate(() => {
    window.__frames = 0
    window.simeonDesktop.on('browserFrame', () => (window.__frames += 1))
  })
  const mainWindow = (visible) =>
    app.evaluate(({ BrowserWindow }, visible) => {
      const window = BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().startsWith('app://'))
      if (visible) window?.show()
      else window?.hide()
    }, visible)
  await mainWindow(false)
  answer = await stand.step('navigate', { url: `${pages.base}/view?again` })
  await page.waitForTimeout(800)
  const hiddenFrames = await page.evaluate(() => window.__frames)
  await mainWindow(true)
  await page.waitForFunction(() => window.__frames > 0, null, { timeout: 5_000 }).catch(() => {})
  const shownFrames = await page.evaluate(() => window.__frames)
  check(answer.ok === true && hiddenFrames === 0 && shownFrames > 0, 'no pictures while the window is hidden; one as it comes back', `${hiddenFrames} hidden, ${shownFrames} shown`)

  // The in-chat form's lock line: typed into the page on this PC, where Theo's page is.
  await page.waitForSelector('.ask-lock', { timeout: 5_000 }).catch(() => {})
  await page.waitForFunction(() => document.querySelector('.ask-lock span')?.textContent?.includes('this PC'), null, { timeout: 5_000 }).catch(() => {})
  const theoLock = await page.locator('.ask-lock span').first().textContent().catch(() => null)
  check(theoLock === 'Typed into the page on this PC, never shown to your agent.', "Theo's in-chat form says its values are typed into the page on this PC", theoLock)

  // The full view, and Take control.
  await page.locator('.computer-preview .frame-open').click()
  await page.waitForSelector('.browser-view', { timeout: 5_000 }).catch(() => {})
  check((await page.locator('.browser-view').count()) === 1, 'Open shows Theo’s browser over the window')
  check(await page.locator('.browser-view [aria-label="Back"]').isDisabled(), 'Back is the person’s only once they take control')
  await page.waitForTimeout(400)
  if (shots) await page.screenshot({ path: path.join(shots, 'browser-full.png') })
  await page.locator('.browser-view .browser-control').click()
  await page.waitForSelector('.browser-control.held', { timeout: 5_000 }).catch(() => {})
  const control = await page.locator('.browser-view .browser-control').textContent()
  const paused = await page.locator('.browser-paused').textContent().catch(() => null)
  check(control === 'Give back' && paused === "Theo is paused while you're in control.", 'Take control: Give back, and Theo paused', `${control} | ${paused}`)
  const waiting = stand.step('snapshot')
  check((await Promise.race([waiting.then(() => 'answered'), soon(1_200).then(() => 'waiting')])) === 'waiting', 'Theo’s next step waits while the person has control')
  const box = await page.locator('.browser-view .browser-canvas').boundingBox()
  const at = (x, y) => [box.x + (x / 1280) * box.width, box.y + (y / 800) * box.height]
  await page.mouse.click(...at(200, 130))
  await page.mouse.click(...at(250, 315))
  await page.keyboard.type('hi')
  await page.waitForTimeout(500)
  if (shots) await page.screenshot({ path: path.join(shots, 'browser-control.png') })
  await page.locator('.browser-view .browser-control').click()
  answer = await waiting
  check(answer.ok === true && answer.title === 'typed hi', 'the person’s clicks and keys reached the page; given back, Theo’s step goes on', JSON.stringify({ ok: answer.ok, title: answer.title, error: answer.error }))
  check(/The person used the browser \(Take control\) and gave it back/.test(answer.summary ?? ''), 'and Theo is told the person had it', answer.summary)

  // Closing the view while holding the browser gives it back.
  await page.locator('.browser-view .browser-control').click()
  await page.waitForSelector('.browser-control.held', { timeout: 5_000 }).catch(() => {})
  await page.locator('.browser-view .computer-exit').click()
  answer = await Promise.race([stand.step('snapshot'), soon(4_000).then(() => ({ timedOut: true }))])
  check(answer.ok === true && (await page.locator('.browser-view').count()) === 0, 'Exit gives the browser back', JSON.stringify({ ok: answer.ok, timedOut: answer.timedOut }))
  // The take-over (step 3): the agent asks; the card's Take over opens its tab on this PC in Take control; I'm done gives it back and answers.
  stand.takeOver.pending = true
  standIn.state.box.queued.push({ channel: 'forever-box', payload: { agentId: 'theo', state: 'running', handoff: stand.handoff } })
  await page.waitForSelector('.computer-preview .computer-attention', { timeout: 15_000 }).catch(() => {})
  check((await page.locator('.computer-preview .computer-attention').count()) === 1, 'the take-over waits in the Computer tab, over Theo’s tab')
  await page.locator('.handoff-card .handoff-pill.blue').click()
  await page.waitForSelector('.browser-view .handoff-banner', { timeout: 5_000 }).catch(() => {})
  await page.waitForSelector('.browser-control.held', { timeout: 5_000 }).catch(() => {})
  const banner = await page.locator('.browser-view .handoff-banner-words').textContent().catch(() => null)
  check(banner === stand.handoff.instruction && (await page.locator('.browser-control.held').count()) === 1, 'Take over opens Theo’s tab on this PC in Take control, with the request over it', banner)
  if (shots) await page.screenshot({ path: path.join(shots, 'browser-take-over.png') })
  const heldStep = stand.step('snapshot')
  check((await Promise.race([heldStep.then(() => 'answered'), soon(1_000).then(() => 'waiting')])) === 'waiting', 'Theo waits while the person does the step')
  await page.locator('.browser-view .handoff-banner-button.primary').click()
  answer = await Promise.race([heldStep, soon(4_000).then(() => ({ timedOut: true }))])
  await page.waitForTimeout(300)
  check(
    answer.ok === true && (await page.locator('.browser-view').count()) === 0 && stand.takeOver.answers.at(-1)?.trigger === 'button' && stand.takeOver.answers.at(-1)?.id === 'theo',
    'I’m done gives the tab back, closes the view and answers Theo',
    JSON.stringify({ ok: answer.ok, answers: stand.takeOver.answers }),
  )
  // Iris has no tab here: her form's values are typed on Simeon's computer, as before.
  await page.locator('.sidebar').getByText('Iris', { exact: true }).first().click()
  await page.waitForTimeout(800)
  const irisLock = await page.locator('.ask-lock span').first().textContent().catch(() => null)
  check(irisLock === "Typed into the page on Simeon's computer, never shown to your agent.", "Iris's in-chat form still says Simeon's computer", irisLock)
  check(errors.length === 0, `no page errors (${errors.join(' | ')})`)
} catch (error) {
  check(false, 'the run went to its end', error instanceof Error ? error.stack : String(error))
} finally {
  await running?.close().catch(() => {})
  stand.close()
  await standIn.close()
  pages.close()
  rmSync(dataFolder, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}

console.log(failures.length === 0 ? '\nAll checks passed.' : `\n${failures.length} failed.`)
process.exit(failures.length === 0 ? 0 : 1)
