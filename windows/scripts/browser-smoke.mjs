// The browser in the app run for real (docs/app-browser/README.md, step 2a):
// Electron on this computer (Windows, or Linux under a virtual display), the
// tabs and the steps (test/browserHarness.ts), driven as the agents' engine
// drives them, by a stand-in engine here, on pages a test site here serves.
// No real site and no real service is reached.
//
//   npm run browser-smoke                (Linux: xvfb-run -a npm run browser-smoke)
//
// It prints what it saw and exits 1 on a failure.

import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import http from 'node:http'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const require = createRequire(import.meta.url)
const binary = require('electron')
const here = fileURLToPath(new URL('..', import.meta.url))

const failures = []
const check = (ok, what, detail) => {
  if (!ok) failures.push(what)
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${!ok && detail !== undefined ? `\n     ${String(detail).slice(0, 600)}` : ''}`)
}

// MARK: The test site

function site() {
  let port = 0
  const page = (title, body) => `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body>${body}</body></html>`
  const pages = {
    '/form': () =>
      page(
        'Form',
        `<h1>Sign up</h1>
        <form action="/done" method="get">
          <label for="email">Email</label><input id="email" name="email">
          <label>Password <input type="password" name="pw" value="secret"></label>
          <input type="checkbox" id="agree"><label for="agree">Agree</label>
          <select id="size"><option value="s">Small</option><option value="m">Medium</option><option value="l">Large</option></select>
          <button id="buy" type="button" onclick="document.title='clicked '+event.isTrusted">Buy</button>
          <button type="submit">Send</button>
          <div style="display:none"><button>Hidden thing</button></div>
          <a href="/other">Other page</a>
          <div style="position:relative;width:120px;height:40px"><button id="under" style="width:120px;height:40px">Under</button><div style="position:absolute;inset:0;background:rgba(0,0,0,.3)"></div></div>
          <iframe src="/inner" style="width:300px;height:80px"></iframe>
          <iframe src="http://localhost:${port}/inner" style="width:300px;height:80px"></iframe>
        </form>`,
      ),
    '/inner': () => page('Inner', `<button onclick="try{parent.document.title='inner '+event.isTrusted}catch(e){document.title='inner'}">Inner button</button>`),
    '/other': () => page('Other', '<p>Another page</p>'),
    '/popup': () => page('Popup', `<a href="/child" target="_blank">Open child</a> <button onclick="window.open('/child','win')">Open window</button>`),
    '/child': () => page('Child', `<script>document.title='Child '+(!!window.opener)</script><button onclick="window.close()">Close me</button>`),
    '/dialogs': () =>
      page('Dialogs', `<button onclick="document.title='confirm '+confirm('Delete everything?')">Confirm</button> <button onclick="alert('Saved');document.title='alerted'">Alert</button>`),
    '/download': () => page('Download', `<a href="/file.txt">Get the file</a>`),
    '/upload': () =>
      page(
        'Upload',
        `<input type="file" id="f" onchange="document.title='got '+[...this.files].map(f=>f.name+':'+f.size).join(',')">
         <button id="pick" onclick="document.getElementById('f2').click()">Choose file</button>
         <input type="file" id="f2" style="display:none" onchange="document.title='picked '+this.files[0].name+':'+this.files[0].size">`,
      ),
    '/tall': () => page('Tall', '<div style="height:5000px;background:linear-gradient(#fff,#09f)">tall</div>'),
    '/drag': () =>
      page(
        'Drag',
        `<div id="from" style="position:absolute;left:100px;top:100px;width:60px;height:60px;background:#f80">From</div>
         <div id="to" style="position:absolute;left:400px;top:300px;width:80px;height:80px;background:#08f">To</div>
         <script>let down;document.addEventListener('mousedown',e=>{down=[e.clientX,e.clientY,e.isTrusted]});document.addEventListener('mouseup',e=>{document.title='drag '+down.join(',')+' '+[e.clientX,e.clientY].join(',')})</script>`,
      ),
    '/agent': () => page('Agent', `<script>document.title=navigator.userAgent</script>`),
    '/geo': () => page('Geo', `<script>navigator.geolocation.getCurrentPosition(()=>document.title='geo allowed',e=>document.title='geo refused '+e.code)</script>`),
    '/read-cookie': () => page('Cookie', `<script>document.title='cookie '+document.cookie</script>`),
    '/file-link': () => page('File link', `<a href="file:///etc/hostname">A file of this computer</a>`),
  }
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://site')
    if (url.pathname === '/slow') return // never answers
    if (url.pathname === '/done') {
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end(page(`Done ${url.searchParams.get('email') ?? ''}`, '<p>Thanks</p>'))
      return
    }
    if (url.pathname === '/file.txt') {
      res.writeHead(200, { 'content-type': 'text/plain', 'content-disposition': 'attachment; filename="report.txt"' })
      res.end('the report')
      return
    }
    if (url.pathname === '/set-cookie') {
      res.writeHead(200, { 'content-type': 'text/html', 'set-cookie': 'signedin=yes; Path=/' })
      res.end(page('Set', '<p>signed in</p>'))
      return
    }
    const make = pages[url.pathname]
    if (!make) {
      res.writeHead(404).end()
      return
    }
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(make())
  })
  return new Promise((done) =>
    server.listen(0, '127.0.0.1', () => {
      port = server.address().port
      done({ base: `http://127.0.0.1:${port}`, close: () => { server.closeAllConnections(); server.close() } })
    }),
  )
}

// MARK: The stand-in engine

function engine() {
  const waiting = new Map()
  const frames = []
  let stream
  let providerId
  let next = 1
  let helloSeen
  const hello = new Promise((done) => (helloSeen = done))
  const server = http.createServer((req, res) => {
    if (req.headers.authorization !== 'Bearer smoke-token') return res.writeHead(401).end()
    if (req.method === 'GET' && req.url === '/local-browser/requests') {
      providerId = `smoke-${next++}`
      stream = res
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.write(`data: ${JSON.stringify({ kind: 'welcome', providerId, protocol: 1, enabled: true })}\n\n`)
      // A keep-alive, as the engine's gateway sends one every 15 s (`openSseStream`).
      const beat = setInterval(() => res.write(': keep-alive\n\n'), 5_000)
      res.on('close', () => clearInterval(beat))
      return
    }
    if (req.method === 'POST' && req.url === '/local-browser/responses') {
      const chunks = []
      req.on('data', (chunk) => chunks.push(chunk))
      req.on('end', () => {
        const batch = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        for (const frame of batch.frames ?? []) {
          frames.push({ ...frame, providerId: batch.providerId })
          if (frame.kind === 'hello') helloSeen({ ...frame, providerId: batch.providerId })
          if (frame.kind === 'response') waiting.get(frame.requestId)?.(frame)
        }
        res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}')
      })
      return
    }
    res.writeHead(404).end()
  })
  let count = 0
  const send = (frame) => stream?.write(`data: ${JSON.stringify(frame)}\n\n`)
  return new Promise((done) =>
    server.listen(0, '127.0.0.1', () =>
      done({
        base: `http://127.0.0.1:${server.address().port}`,
        hello,
        frames,
        send,
        /** One browser step, as the engine sends it; its answer. */
        step(op, args = {}, { viewId = 'agent-a', screenshot = false, deadlineMs = 60_000, waitMs = 70_000 } = {}) {
          const requestId = `r${++count}`
          const answer = new Promise((resolve) => {
            waiting.set(requestId, resolve)
            setTimeout(() => resolve({ timedOut: true }), waitMs)
          })
          send({ kind: 'request', requestId, protocol: 1, op, viewId, args, screenshot, deadlineMs })
          return { requestId, answer }
        },
        close: () => {
          server.closeAllConnections()
          server.close()
        },
      }),
    ),
  )
}

// MARK: The run

const work = mkdtempSync(path.join(os.tmpdir(), 'simeon-browser-smoke-'))
const downloads = path.join(work, 'downloads')
const uploads = path.join(work, 'uploads')
const harness = path.join(work, 'harness.cjs')
await build({
  absWorkingDir: here,
  entryPoints: ['test/browserHarness.ts'],
  outfile: harness,
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node22',
  external: ['electron'],
  logLevel: 'warning',
})

const pages = await site()
const stand = await engine()
const args = [harness]
if (process.platform === 'linux') args.push('--no-sandbox')
const child = spawn(binary, args, {
  env: { ...process.env, NODE_OPTIONS: '', SMOKE_ENGINE_URL: stand.base, SMOKE_DOWNLOADS: downloads, SMOKE_UPLOADS: uploads },
  stdio: ['ignore', 'pipe', 'pipe'],
})
const output = []
child.stdout.on('data', (chunk) => output.push(String(chunk)))
child.stderr.on('data', (chunk) => output.push(String(chunk)))

const run = async (op, args, options) => stand.step(op, args, options).answer
const evaluate = async (expression, viewId = 'agent-a') => {
  const answer = await run('cdp', { method: 'Runtime.evaluate', params: { expression, returnByValue: true } }, { viewId })
  try {
    return JSON.parse(answer.data).result.value
  } catch {
    return answer
  }
}
const refOf = (outline, pattern) => {
  const line = outline.split('\n').find((one) => pattern.test(one))
  return /\[ref=(e\d+)\]/.exec(line ?? '')?.[1]
}

try {
  const helloFrame = await Promise.race([stand.hello, new Promise((done) => setTimeout(() => done(undefined), 30_000))])
  check(helloFrame?.protocol === 1 && helloFrame?.browser === true && helloFrame?.platform === 'windows', 'the app says hello: protocol 1, a browser, Windows', JSON.stringify(helloFrame))
  check(helloFrame?.browserSession === 'smoke-session-0001' && helloFrame?.providerId === 'smoke-1', 'the hello names its browser session and the stream it came on', JSON.stringify(helloFrame))

  // Opening a page, its picture.
  let answer = await run('navigate', { url: `${pages.base}/form` }, { screenshot: true })
  check(answer.ok && answer.summary === `Opened ${pages.base}/form.` && answer.title === 'Form' && answer.url === `${pages.base}/form`, 'navigate opens the page and says where it is', JSON.stringify({ ...answer, screenshotB64: undefined }))
  check(typeof answer.screenshotB64 === 'string' && Buffer.from(answer.screenshotB64, 'base64').subarray(1, 4).toString() === 'PNG', 'its picture is a PNG of the page, drawn while nothing shows the tab')

  // The outline.
  answer = await run('snapshot')
  const outline = answer.data ?? ''
  check(/^Read the page \(\d+ controls with refs\)\.$/.test(answer.summary), 'the snapshot says how many controls it found', answer.summary)
  check(/- heading "Sign up" \[level=1\]/.test(outline), 'the outline has the heading and its level', outline)
  check(/- textbox "Email" \[ref=e\d+\]/.test(outline), 'a field is named by its label, with a ref')
  check(/- textbox "Password" \[value hidden\] \[ref=e\d+\]/.test(outline) && !outline.includes('secret'), "a password's value is never shown")
  check(/- checkbox "Agree" \[ref=e\d+\]/.test(outline) && /- combobox "Small" \[value="Small"\] \[ref=e\d+\]|- combobox [^\n]*\[value="Small"\] \[ref=e\d+\]/.test(outline), 'a checkbox and a list, with its value')
  check(/- button "Buy" \[ref=e\d+\]/.test(outline) && /- link "Other page" \[ref=e\d+\]/.test(outline), 'buttons and links have refs')
  check(!outline.includes('Hidden thing'), 'what is hidden is left out')
  check(/- frame "127\.0\.0\.1:\d+"\n\s+- button "Inner button" \[ref=e\d+\]/.test(outline), 'a same-site frame is read inside the outline')
  check(/- frame "localhost:\d+" \(its page can't be read here/.test(outline), 'a frame of another site is named, and said to be unreadable here')

  // Clicking, trusted.
  const buy = refOf(outline, /button "Buy"/)
  answer = await run('click', { ref: buy, element: 'Buy button' })
  check(answer.ok && answer.title === 'clicked true' && answer.summary === 'Clicked Buy button.', 'a click lands on the button, trusted as a person’s', JSON.stringify(answer))
  const inner = refOf(outline, /button "Inner button"/)
  answer = await run('click', { ref: inner, element: 'Inner button' })
  check(answer.ok && answer.title === 'inner true', 'a click inside a same-site frame lands, trusted', JSON.stringify(answer))
  const under = refOf(outline, /button "Under"/)
  answer = await run('click', { ref: under, element: 'Under' })
  check(!answer.ok && /^e\d+ is behind /.test(answer.error ?? ''), 'a covered button is not clicked: the agent is told what is in front', JSON.stringify(answer))
  answer = await run('mouse_click_xy', { x: 5000, y: 5, element: 'nowhere' })
  check(!answer.ok && /outside the page/.test(answer.error ?? ''), 'a click outside the page is refused')

  // Typing, filling, choosing.
  const email = refOf(outline, /textbox "Email"/)
  answer = await run('type', { ref: email, text: 'nate@example.com', element: 'Email' })
  check(answer.ok && answer.summary === 'Typed 16 characters into Email.', 'typing says how much, never what', answer.summary)
  check((await evaluate("document.getElementById('email').value")) === 'nate@example.com', 'the text is in the field')
  answer = await run('type', { ref: email, text: 'zoé@example.com', clear: true, element: 'Email' })
  check((await evaluate("document.getElementById('email').value")) === 'zoé@example.com', 'typing with clear replaces what was there, accents and all')
  const agree = refOf(outline, /checkbox "Agree"/)
  await run('fill', { ref: agree, value: 'true' })
  check((await evaluate("document.getElementById('agree').checked")) === true, 'fill ticks a checkbox')
  const size = refOf(outline, /combobox/)
  answer = await run('select_option', { ref: size, values: ['Large'] })
  check(answer.ok && answer.summary === 'Chose "Large" in e' + size.slice(1) + '.' && (await evaluate("document.getElementById('size').value")) === 'l', 'a list is chosen in by its label', JSON.stringify(answer))
  answer = await run('select_option', { ref: size, values: ['Huge'] })
  check(!answer.ok && /The list has no "Huge"\. It has: "Small", "Medium", "Large"\./.test(answer.error ?? ''), 'a choice the list lacks is refused, the choices named', answer.error)
  answer = await run('fill', { ref: size, value: 'x' })
  check(!answer.ok && /use browser_select_option/.test(answer.error ?? ''), 'fill on a list says which tool to use')

  // Keys, and a form sent.
  answer = await run('type', { ref: email, text: 'sent@example.com', clear: true, submit: true, element: 'Email' })
  check(answer.ok && answer.title === 'Done sent@example.com' && /\/done\?email=sent%40example\.com/.test(answer.url ?? ''), 'typing with submit sends the form, the next page waited for', JSON.stringify(answer))
  answer = await run('press_key', { key: 'Hyper+Q' })
  check(!answer.ok && /isn't a key/.test(answer.error ?? ''), 'a key the browser doesn’t know is refused')

  // A stale ref.
  answer = await run('click', { ref: buy, element: 'Buy button' })
  check(!answer.ok && answer.error === `${buy} isn't on the page any more; take a fresh browser_snapshot.`, 'a ref from before the page changed is refused', answer.error)

  // Scrolling, a long page, its picture.
  await run('navigate', { url: `${pages.base}/tall` })
  answer = await run('scroll', { direction: 'down', amount: 700 })
  check(answer.ok && answer.summary === 'Scrolled down 700 pixels.', 'scroll says how far', answer.summary)
  check((await evaluate('window.scrollY')) >= 600, 'the page scrolled')
  answer = await run('screenshot', { fullPage: true }, { screenshot: true })
  check(answer.ok && /The page is \d+×5\d{3} pixels; the picture shows 2000 of them/.test(answer.summary) && typeof answer.screenshotB64 === 'string', 'a whole-page picture keeps 2000 pixels and says so', answer.summary)

  // Dragging.
  await run('navigate', { url: `${pages.base}/drag` })
  const dragOutline = (await run('snapshot')).data ?? ''
  void dragOutline
  answer = await run('mouse_click_xy', { x: 10, y: 10, element: 'background' })
  await evaluate("document.getElementById('from').setAttribute('role','button')")
  const fromRef = refOf((await run('snapshot')).data ?? '', /button "From"/)
  answer = await run('drag', { sourceRef: fromRef, targetX: 440, targetY: 340, element: 'From' })
  check(answer.ok && answer.title === 'drag 130,130,true 440,340', 'a drag presses on the element and lets go at the target, trusted', JSON.stringify(answer))
  answer = await run('get_bounding_box', { ref: fromRef })
  check(answer.ok && JSON.parse(answer.data ?? '{}').width === 60, 'the box of a ref is its size on the page', answer.data)
  answer = await run('highlight', { ref: fromRef }, { screenshot: true })
  check(answer.ok && /^Highlighted button "From"\.$/.test(answer.summary) && typeof answer.screenshotB64 === 'string', 'a highlight is drawn and photographed', answer.summary)

  // Popups.
  await run('navigate', { url: `${pages.base}/popup` })
  const popupOutline = (await run('snapshot')).data ?? ''
  answer = await run('click', { ref: refOf(popupOutline, /button "Open window"/), element: 'Open window' })
  check(answer.ok && /The page opened a new tab \(t\d+\); the next steps act on it/.test(answer.summary), 'a popup becomes the agent’s tab, and the agent is told', answer.summary)
  check(answer.title === 'Child true', 'the popup keeps its opener (a sign-in window can report back)', answer.title)
  answer = await run('tabs', { action: 'list' })
  const listed = JSON.parse(answer.data ?? '[]')
  check(listed.length === 2 && listed[1].current === true, 'the agent’s tabs are listed, the popup current', answer.data)
  const childOutline = (await run('snapshot')).data ?? ''
  answer = await run('click', { ref: refOf(childOutline, /button "Close me"/), element: 'Close me' })
  check(answer.ok && answer.title === 'Popup' && /closed; the next steps act on t\d+ again/.test(answer.summary), 'a popup that closes itself hands the agent back to its opener', JSON.stringify(answer))

  // Dialogs.
  await run('navigate', { url: `${pages.base}/dialogs` })
  const dialogOutline = (await run('snapshot')).data ?? ''
  answer = await run('click', { ref: refOf(dialogOutline, /button "Confirm"/), element: 'Confirm' })
  check(answer.ok && answer.title === 'confirm false' && /asked "Delete everything\?" \(a confirm\); it was dismissed/.test(answer.summary), 'a confirm is dismissed, the safe answer, and the agent told', JSON.stringify(answer))
  answer = await run('click', { ref: refOf(dialogOutline, /button "Alert"/), element: 'Alert' })
  check(answer.ok && answer.title === 'alerted' && /showed a message: "Saved" \(OK was pressed\)/.test(answer.summary), 'an alert is taken and the agent told', JSON.stringify(answer))

  // A download.
  await run('navigate', { url: `${pages.base}/download` })
  const downloadOutline = (await run('snapshot')).data ?? ''
  answer = await run('click', { ref: refOf(downloadOutline, /link "Get the file"/), element: 'Get the file' })
  if (!/downloaded/.test(answer.summary ?? '')) {
    // A slower download is said with the next answer.
    await new Promise((done) => setTimeout(done, 800))
    answer = await run('snapshot')
  }
  const saved = existsSync(downloads) ? readdirSync(downloads) : []
  check(/downloaded report\.txt \(10 bytes\) to this PC's Downloads\\Simeon folder/.test(answer.summary) && saved.includes('report.txt') && readFileSync(path.join(downloads, 'report.txt'), 'utf8') === 'the report', 'a download lands in Downloads\\Simeon and the agent is told', JSON.stringify({ summary: answer.summary, saved }))

  // Uploads: a file field, and a button that opens the file window.
  await run('navigate', { url: `${pages.base}/upload` })
  const uploadOutline = (await run('snapshot')).data ?? ''
  const file = { name: 'resume.pdf', path: '/workspace/uploads/resume.pdf', dataB64: Buffer.from('%PDF-resume').toString('base64') }
  answer = await run('upload_file', { ref: refOf(uploadOutline, /- button \[ref=/), element: 'File field', files: [file] })
  check(answer.ok && answer.title === 'got resume.pdf:11' && answer.summary === 'Attached resume.pdf to File field.', 'files are given to a file field, as named, at their size', JSON.stringify(answer))
  answer = await run('upload_file', { ref: refOf(uploadOutline, /button "Choose file"/), element: 'Choose file', files: [file] })
  check(answer.ok && answer.title === 'picked resume.pdf:11', 'a button that opens the file window gets the files, the window never shown', JSON.stringify(answer))

  // What the agent may not do.
  for (const method of ['Input.dispatchMouseEvent', 'Page.navigate', 'DOM.setFileInputFiles', 'Network.loadNetworkResource', 'Network.getAllCookies', 'Storage.clearDataForOrigin', 'Browser.close', 'Target.createTarget'])
    check(!(await run('cdp', { method, params: {} })).ok, `the DevTools command ${method} is refused`)
  check((await evaluate('1 + 1')) === 2, 'an allowed DevTools command runs')
  answer = await run('navigate', { url: 'file:///etc/hostname' })
  check(!answer.ok && answer.error === 'Only http and https addresses open in the browser.', 'a file of this PC is never opened', answer.error)
  await run('navigate', { url: `${pages.base}/file-link` })
  const fileLinkOutline = (await run('snapshot')).data ?? ''
  answer = await run('click', { ref: refOf(fileLinkOutline, /link "A file of this computer"/), element: 'file link' })
  check(answer.ok && answer.url === `${pages.base}/file-link`, 'a page’s link to a file of this PC goes nowhere', answer.url)
  answer = await run('navigate', { url: 'app://simeon/app-next/' })
  check(!answer.ok, "the app's own page is out of the browser's reach")

  // Looking like Chrome, refusing what a site asks.
  answer = await run('navigate', { url: `${pages.base}/agent` })
  check(answer.ok && /Chrome\/\d/.test(answer.title) && !/Electron|simeon/i.test(answer.title), 'sites see Chrome, not Electron or the app', answer.title)
  await run('navigate', { url: `${pages.base}/geo` })
  await new Promise((done) => setTimeout(done, 500))
  answer = await run('snapshot')
  check(answer.title === 'geo refused 1', 'a site asking for the location is refused', answer.title)

  // Sign-ins shared by all agents; each agent its own tabs.
  await run('navigate', { url: `${pages.base}/set-cookie` }, { viewId: 'agent-a' })
  answer = await run('navigate', { url: `${pages.base}/read-cookie` }, { viewId: 'agent-b' })
  check(answer.ok && answer.title === 'cookie signedin=yes', "one agent's sign-in is the other's (decision 2)", answer.title)
  answer = await run('tabs', { action: 'list' }, { viewId: 'agent-b' })
  check(JSON.parse(answer.data ?? '[]').length === 1, 'each agent has its own tabs', answer.data)
  answer = await run('review_state', {}, { viewId: 'agent-b' })
  const state = JSON.parse(answer.data ?? '{}')
  check(state.pages?.length === 1 && state.pages[0].url === `${pages.base}/read-cookie` && state.viewPageId === state.pages[0].id, "Auto-review reads the agent's tabs and the one it acts on", answer.data)

  // Two agents at once; a cancel; a deadline.
  const started = Date.now()
  const [one, two] = await Promise.all([
    run('navigate', { url: `${pages.base}/other` }, { viewId: 'agent-a' }),
    run('navigate', { url: `${pages.base}/other` }, { viewId: 'agent-b' }),
  ])
  check(one.ok && two.ok, 'two agents browse side by side', `${Date.now() - started} ms`)
  const slow = stand.step('navigate', { url: `${pages.base}/slow` }, { viewId: 'agent-c', waitMs: 3_000 })
  await new Promise((done) => setTimeout(done, 300))
  stand.send({ kind: 'cancel', requestId: slow.requestId })
  const cancelled = await slow.answer
  check(cancelled.timedOut === true, 'a cancelled step is answered with nothing', JSON.stringify(cancelled))
  const late = await run('navigate', { url: `${pages.base}/slow` }, { viewId: 'agent-d', deadlineMs: 2_000, waitMs: 10_000 })
  check(!late.ok && late.error === 'The browser took too long to respond (2 seconds).', 'a step past its deadline is answered so', JSON.stringify(late))
  answer = await run('snapshot', {}, { viewId: 'agent-c' })
  check(answer.ok, 'the agent whose step was cancelled browses on')

  // Under the app's own rule for its pages (main.ts), the tabs are their own: no link, popup or page went to the person's browser.
  const outside = output.join('').split('\n').filter((line) => line.includes('[harness] opened outside'))
  check(outside.length === 0, "nothing an agent's tab did opened in the person's own browser", outside.join(' | '))
} finally {
  child.kill()
  stand.close()
  pages.close()
  rmSync(work, { recursive: true, force: true })
}

if (failures.length > 0) {
  console.log(`\n${failures.length} failed. The app said:\n${output.join('').split('\n').filter((line) => !/dbus|Fontconfig|gpu|viz|GPU/i.test(line)).slice(-30).join('\n')}`)
  process.exit(1)
}
console.log('\nAll checks passed.')
process.exit(0)
