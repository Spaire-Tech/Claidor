// The Mac's browser helper run for real (docs/app-browser/README.md, step 4):
// src/helper/macBrowser.ts in Electron on this computer (Linux under a
// virtual display), this script standing in for the Mac app on its standard
// input and output, against the stand-in engine and a test page here. No
// real site and no real service is reached.
//
//   npm run mac-helper-smoke            (Linux: xvfb-run -a npm run mac-helper-smoke)
//
// It prints what it saw and exits 1 on a failure.

import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import http from 'node:http'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { engine } from './stand-in-engine.mjs'

const require = createRequire(import.meta.url)
const binary = require('electron')
const here = fileURLToPath(new URL('..', import.meta.url))

const failures = []
const check = (ok, what, detail) => {
  if (!ok) failures.push(what)
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${!ok && detail !== undefined ? `\n     ${String(detail).slice(0, 600)}` : ''}`)
}
const soon = (ms) => new Promise((done) => setTimeout(done, ms))

// A page with a button the person presses.
const site = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html' })
  res.end(`<!doctype html><html><head><meta charset="utf-8"><title>View</title></head><body>
    <button id="press" style="position:absolute;left:100px;top:100px;width:200px;height:60px" onclick="document.title='person '+event.isTrusted">Press</button></body></html>`)
})
await new Promise((done) => site.listen(0, '127.0.0.1', done))
const page = `http://127.0.0.1:${site.address().port}/view`

const work = mkdtempSync(path.join(os.tmpdir(), 'simeon-mac-helper-'))
const helper = path.join(work, 'main.js')
await build({ absWorkingDir: here, entryPoints: ['src/helper/macBrowser.ts'], outfile: helper, bundle: true, format: 'cjs', platform: 'node', target: 'node22', external: ['electron'], logLevel: 'warning' })

const stand = await engine()
const args = [helper, `--data=${path.join(work, 'data')}`, `--api=${stand.base}`]
if (process.platform === 'linux') args.push('--no-sandbox')
const child = spawn(binary, args, { env: { ...process.env, NODE_OPTIONS: '' }, stdio: ['pipe', 'pipe', 'pipe'] })
const heard = []
const waiters = []
const replies = new Map()
let frames = 0
let lastFrame
createInterface({ input: child.stdout }).on('line', (line) => {
  let said
  try {
    said = JSON.parse(line)
  } catch {
    return
  }
  if (said.kind === 'frame') {
    frames += 1
    lastFrame = said
    return
  }
  heard.push(said)
  if (said.kind === 'reply') replies.get(said.id)?.(said)
  for (const waiter of [...waiters]) waiter()
})
const errors = []
child.stderr.on('data', (chunk) => errors.push(String(chunk)))
const exited = new Promise((done) => child.on('exit', (code) => done(code)))

const tell = (line) => child.stdin.write(`${JSON.stringify(line)}\n`)
let asked = 0
const ask = (line) =>
  new Promise((done) => {
    const id = ++asked
    replies.set(id, done)
    tell({ ...line, id })
    setTimeout(() => done({ timedOut: true }), 10_000)
  })
const until = async (test, ms = 10_000) => {
  const started = Date.now()
  while (Date.now() - started < ms) {
    const found = heard.find(test)
    if (found) return found
    await soon(50)
  }
  return undefined
}
const lastShown = () => [...heard].reverse().find((one) => one.kind === 'shown')?.shown
const run = (op, args, options) => stand.step(op, args, options).answer

try {
  check(!!(await until((one) => one.kind === 'ready', 30_000)), 'the helper starts and says it is ready', errors.join('').slice(-400))

  // The engine's address and keys, checked as the Windows app checks the page's.
  tell({ kind: 'engine', target: { baseURL: 'http://example.com:1', headers: { authorization: 'Bearer x' } } })
  check(!!(await until((one) => one.kind === 'problem')), 'an address that is not the engine is refused')
  tell({ kind: 'engine', target: { baseURL: stand.base, headers: { authorization: 'Bearer smoke-token' } } })
  const helloFrame = await Promise.race([stand.hello, soon(20_000).then(() => undefined)])
  check(helloFrame?.platform === 'mac' && helloFrame?.browser === true, 'it dials the engine and says hello from a Mac', JSON.stringify(helloFrame))

  // A step, and its sentences say this Mac.
  let answer = await run('navigate', { url: page }, { viewId: 'agent-m' })
  check(answer.ok && answer.title === 'View', 'the engine opens a page in it', JSON.stringify(answer))
  answer = await run('form', { action: 'check', domain: 'other.test', fields: [{ id: 'a', type: 'text', target: { label: 'A' } }] }, { viewId: 'agent-m' })
  check(!answer.ok && /in the browser on this Mac\./.test(answer.error ?? ''), 'its sentences say this Mac', answer.error)

  // The Computer tab's view: the state, the pictures, none while the window is hidden.
  const watched = await ask({ kind: 'watch', agentId: 'agent-m' })
  check(watched.value?.agentId === 'agent-m' && watched.value?.tabs?.length === 1 && watched.value?.enabled === true, 'watching an agent tells its tabs', JSON.stringify(watched))
  await soon(1_500)
  check(frames > 0 && Buffer.from(lastFrame?.jpeg ?? '', 'base64').subarray(0, 2).toString('hex') === 'ffd8', 'its pictures come, JPEGs', `${frames} frames`)
  tell({ kind: 'visible', visible: false })
  await soon(300)
  const hidden = frames
  await run('navigate', { url: `${page}?again` }, { viewId: 'agent-m' })
  await soon(800)
  check(frames === hidden, 'none while the Mac’s window is hidden', `${hidden} → ${frames}`)
  tell({ kind: 'visible', visible: true })
  await soon(1_200)
  check(frames > hidden, 'drawn again as it comes back', `${hidden} → ${frames}`)

  // Take control: the agent waits, the person's click lands, given back the agent is told.
  const held = await ask({ kind: 'control', agentId: 'agent-m', person: true })
  check(held.value?.person === true, 'the person takes control', JSON.stringify(held))
  const waiting = stand.step('snapshot', {}, { viewId: 'agent-m' }).answer
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased'])
    tell({ kind: 'input', agentId: 'agent-m', input: { kind: 'mouse', type, x: 200, y: 130, button: type === 'mouseMoved' ? 'none' : 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: type === 'mouseMoved' ? 0 : 1, modifiers: 0 } })
  const pressed = await until((one) => one.kind === 'shown' && one.shown.tabs?.some((tab) => tab.title === 'person true'))
  check(!!pressed, "the person's click lands, trusted", JSON.stringify(lastShown()?.tabs))
  await ask({ kind: 'control', agentId: 'agent-m', person: false })
  answer = await waiting
  check(answer.ok && /The person used the browser \(Take control\) and gave it back/.test(answer.summary ?? ''), 'given back, the agent goes on and is told', JSON.stringify(answer))

  // The quit's question: who has tabs here.
  const browsing = await ask({ kind: 'browsing' })
  check(JSON.stringify(browsing.value) === '["agent-m"]', 'it says which agents have tabs here', JSON.stringify(browsing))

  // Quitting: told, it closes its tabs and goes.
  tell({ kind: 'quit' })
  const code = await Promise.race([exited, soon(10_000).then(() => 'still running')])
  check(code === 0, 'told to quit, it quits', code)
} finally {
  child.kill()
  stand.close()
  site.close()
  rmSync(work, { recursive: true, force: true, maxRetries: 3 })
}

if (failures.length > 0) {
  console.log(`\n${failures.length} failed. The helper said:\n${errors.join('').split('\n').filter((line) => !/dbus|Fontconfig|gpu|viz|GPU/i.test(line)).slice(-20).join('\n')}`)
  process.exit(1)
}
console.log('\nAll checks passed.')
process.exit(0)
