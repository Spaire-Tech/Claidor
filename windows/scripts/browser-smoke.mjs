// The browser in the app run for real (docs/app-browser/README.md, steps 2a and 2b):
// Electron on this computer (Windows, or Linux under a virtual display), the
// tabs and the steps (test/browserHarness.ts), driven as the agents' engine
// drives them, by a stand-in engine here, on pages a test site here serves;
// and the Computer tab's view of them (step 2b): the pictures, Take control,
// the person's pointer and keys, the bar. No real site and no real service
// is reached.
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
    '/signin': () =>
      page(
        'Sign in',
        `<form onsubmit="return false">
         <label for="email">Email address</label><input id="email" type="email" onkeydown="window.keys=(window.keys||0)+1;window.trusted=(window.trusted||0)+(event.isTrusted?1:0)">
         <input id="pw" type="password" placeholder="Password">
         <input id="remember" type="checkbox"><label for="remember">Remember me</label>
         <select id="country"><option value="fr">France</option><option value="ch">Switzerland</option></select>
         <input id="dob" type="date">
         <input id="code" autocomplete="one-time-code" aria-label="Verification code" onkeydown="if(event.key==='Enter')document.title='submitted '+this.value.length">
         </form>`,
      ),
    '/signup': () =>
      page(
        'Sign up',
        `<input id="old" type="password" autocomplete="current-password" aria-label="Current password">
         <input id="new" type="password" autocomplete="new-password" aria-label="New password">
         <input id="again" type="password" aria-label="Confirm password">`,
      ),
    // Step 3c: a checkout whose card form is in a frame of another site (localhost here), as a payment provider's is.
    '/shop': () =>
      page(
        'Checkout',
        `<h1>Checkout</h1><p>Total $42.00</p>
         <label>Name on card <input id="ccname" autocomplete="cc-name"></label>
         <iframe id="pay" src="http://localhost:${port}/card-frame" style="display:block;width:400px;height:140px;border:0;margin-top:20px"></iframe>
         <script>window.card={};addEventListener('message',e=>{const d=e.data||{};if(d.card)window.card[d.card.name]=d.card})</script>`,
      ).replace('</title>', '</title><link rel="icon" href="/favicon.png">'),
    '/card-frame': () =>
      page(
        'Card',
        `<style>input{position:absolute;height:30px;margin:0}</style>
         <input name="cardnumber" autocomplete="cc-number" placeholder="1234 1234 1234 1234" style="left:10px;top:10px;width:200px">
         <input name="exp-date" placeholder="MM / YY" style="left:10px;top:50px;width:100px">
         <input name="cvc" placeholder="CVC" style="left:120px;top:50px;width:90px">
         <input name="postal" placeholder="ZIP" style="left:10px;top:90px;width:90px">
         <script>for(const el of document.querySelectorAll('input'))el.addEventListener('input',e=>parent.postMessage({card:{name:el.name,value:el.value,trusted:e.isTrusted}},'*'))</script>`,
      ),
    '/shop-selects': () =>
      page(
        'Checkout',
        `<input id="num" autocomplete="cc-number">
         <select name="exp_month"><option value="">Month</option>${Array.from({ length: 12 }, (_, i) => `<option value="${String(i + 1).padStart(2, '0')}">${i + 1}</option>`).join('')}</select>
         <select name="exp_year"><option value="">Year</option><option>2030</option><option>2031</option></select>
         <input id="cvc" name="cvc">`,
      ),
    '/link-pay': () =>
      page(
        'Checkout',
        `<div class="AiAgentPaymentSteering"><input type="hidden" name="link_pay_token"></div>
         <script>document.querySelector('input[name=link_pay_token]').addEventListener('change',e=>{document.title='token '+e.target.value.length})</script>`,
      ),
    // Step 3c-2: a stand-in for Simeon's pay page, its card form in a frame of another site as Duffel's is.
    '/desktop/flights/pay': () =>
      page(
        'Pay',
        `<p id="line">Paying</p>
         <iframe id="duffel" src="http://localhost:${port}/duffel-frame" style="display:block;width:400px;height:160px;border:0"></iframe>
         <script>
           window.card = {}
           let phase = 'loading'
           addEventListener('message', (e) => { const d = e.data || {}; if (d.card) window.card[d.card.name] = d.card })
           document.getElementById('duffel').addEventListener('load', () => { phase = 'form' })
           window.simeonPay = {
             status: () => ({ phase, session: phase === 'ready' ? { id: '3ds_test' } : null }),
             createCard: async () => ({ ok: true, card: { id: 'tcd_test', last_4_digits: (window.card.cardNumber?.value || '').slice(-4) } }),
             verify: (offer, card) => { phase = offer === 'off_test' && card === 'tcd_test' ? 'challenge' : 'failed'; return true },
             say: (words) => { document.getElementById('line').textContent = words },
           }
         </script>`,
      ),
    '/duffel-frame': () =>
      page(
        'Card',
        `<style>input{position:absolute;height:28px;margin:0}</style>
         <label for="holder" style="position:absolute;left:10px;top:0">Name on card</label><input id="holder" style="left:120px;top:0;width:200px">
         <input name="cardNumber" style="left:10px;top:40px;width:200px">
         <input name="expiryDate" placeholder="MM/YY" style="left:10px;top:80px;width:90px">
         <input name="cvc" style="left:120px;top:80px;width:80px">
         <script>for(const el of document.querySelectorAll('input'))el.addEventListener('input',e=>parent.postMessage({card:{name:el.name||el.id,value:el.value,trusted:e.isTrusted}},'*'))</script>`,
      ),
    '/view': () =>
      page(
        'View',
        `<button id="press" style="position:absolute;left:100px;top:100px;width:200px;height:60px" onclick="document.title='person '+event.isTrusted">Press</button>
         <input id="field" style="position:absolute;left:100px;top:300px;width:300px;height:30px" oninput="document.title='typed '+this.value">
         <button id="agent" style="position:absolute;left:500px;top:100px;width:120px;height:40px" onclick="document.title='agent clicked'">Agent</button>`,
      ),
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
    if (url.pathname === '/favicon.png') {
      res.writeHead(200, { 'content-type': 'image/png' })
      res.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'))
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
  check(typeof answer.screenshotB64 === 'string' && Buffer.from(answer.screenshotB64, 'base64').subarray(1, 4).toString() === 'PNG', 'its picture is a PNG of the page, drawn while nothing shows the tab', typeof answer.screenshotB64 === 'string' ? `${answer.screenshotB64.length} characters` : JSON.stringify(answer))

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

  // MARK: Step 3b, the cards' fills typed into the agent's tab
  const site = '127.0.0.1'
  await run('navigate', { url: `${pages.base}/signin` }, { viewId: 'agent-f' })
  const signinOutline = (await run('snapshot', {}, { viewId: 'agent-f' })).data ?? ''
  const emailRef = refOf(signinOutline, /textbox "Email address"/)
  const fields = [
    { id: 'email', type: 'email', target: { ref: emailRef } },
    { id: 'password', type: 'password', target: { label: 'Password' } },
    { id: 'remember', type: 'checkbox', target: { label: 'Remember me' } },
    { id: 'country', type: 'select', target: { selector: '#country' } },
    { id: 'dob', type: 'date', target: { selector: '#dob' } },
  ]
  answer = await run('form', { action: 'check', domain: site, fields }, { viewId: 'agent-f' })
  check(answer.ok && JSON.parse(answer.data).missing.length === 0, "a form's fields are found by a snapshot's ref, the words that label them and a selector", answer.data ?? answer.error)
  answer = await run('form', { action: 'check', domain: site, fields: [...fields, { id: 'nope', type: 'text', target: { label: 'Not on this page' } }] }, { viewId: 'agent-f' })
  check(answer.ok && JSON.stringify(JSON.parse(answer.data).missing) === '["nope"]', 'a field that is not there is named', answer.data)
  const secret = 'c0rrect-Horse-42'
  answer = await run(
    'form',
    { action: 'fill', domain: site, fields: [...fields, { id: 'nickname', type: 'text', target: { label: 'Nickname' } }], values: { email: 'nate@example.com', password: secret, remember: 'true', country: 'Switzerland', dob: '1990-05-04', nickname: '' }, missingAs: 'notFound' },
    { viewId: 'agent-f' },
  )
  const filled = answer.ok ? JSON.parse(answer.data) : {}
  check(
    answer.ok && JSON.stringify(filled.outcomes) === JSON.stringify({ email: 'filled', password: 'filled', remember: 'filled', country: 'filled', dob: 'filled', nickname: 'notFilled' }) && filled.page === site && filled.submitted === false,
    'the fill says which fields went in, a field left empty not touched',
    answer.data ?? answer.error,
  )
  check(!JSON.stringify(answer).includes(secret) && !JSON.stringify(answer).includes('nate@example.com'), "the answer never holds what was typed")
  const typed = await evaluate("JSON.stringify([document.getElementById('email').value, document.getElementById('pw').value, document.getElementById('remember').checked, document.getElementById('country').value, document.getElementById('dob').value, window.keys, window.trusted])", 'agent-f')
  const [, , , , , keys, trusted] = JSON.parse(typeof typed === 'string' ? typed : '[]')
  check(typed?.startsWith(JSON.stringify(['nate@example.com', secret, true, 'ch', '1990-05-04']).slice(0, -1)) && keys >= 12 && trusted === keys, 'every value is in its field, the email typed key by key, each key trusted as a person’s', typed)
  answer = await run('form', { action: 'fill', domain: site, fields: [{ id: 'gone', type: 'text', target: { selector: '#not-here' } }], values: { gone: 'x' }, missingAs: 'notFound' }, { viewId: 'agent-f' })
  check(answer.ok && JSON.parse(answer.data).outcomes.gone === 'notFound', "a sign-in's later step is not a failure (1Password's notFound)", answer.data)
  answer = await run('form', { action: 'fill', domain: site, fields: [{ id: 'code', type: 'otp', target: { label: 'Verification code' } }], values: { code: '123456' }, submitAfterFill: true }, { viewId: 'agent-f' })
  check(answer.ok && JSON.parse(answer.data).submitted === true, 'a one-time code is typed and Enter pressed after it', answer.data)
  check((await evaluate('document.title', 'agent-f')) === 'submitted 6', 'the page took the Enter, with the code in its field')
  answer = await run('form', { action: 'locate', domain: site, fields }, { viewId: 'agent-f' })
  check(answer.ok && JSON.parse(answer.data).found.length === 5, "1Password's look: which fields are on this step", answer.data)
  answer = await run('form', { action: 'fill', domain: 'other.test', fields, values: { email: 'x' } }, { viewId: 'agent-f' })
  check(!answer.ok && answer.error === 'No tab on other.test is open in the browser on this PC. Open the page first (OpenPage, or the browser helper), then ask again.', 'a site the agent has no tab on is said so, nothing typed anywhere', answer.error)
  await run('navigate', { url: `${pages.base}/signup` }, { viewId: 'agent-f' })
  answer = await run('form', { action: 'newPassword', domain: site, value: secret }, { viewId: 'agent-f' })
  check(answer.ok && JSON.parse(answer.data).filled === 2 && JSON.parse(answer.data).failed === 0, 'a new password goes into the password and its confirmation', answer.data)
  const passwords = await evaluate("JSON.stringify([document.getElementById('old').value, document.getElementById('new').value === document.getElementById('again').value, document.getElementById('new').value.length])", 'agent-f')
  check(passwords === JSON.stringify(['', true, secret.length]), 'never into the field for the current password', passwords)
  const logged = output.join('')
  check(!logged.includes(secret) && !logged.includes('nate@example.com'), 'nothing typed is in the app’s log')

  // MARK: Step 3c, frames of other sites and the checkout
  // The fields' marks as the engine sends them (checkout-fill.ts has the full lists).
  const cardFields = [
    { kind: 'card number', selector: 'input[autocomplete="cc-number"], input[name="cardnumber"]' },
    { kind: 'expiry', selector: 'input[name="exp-date"], input[placeholder*="MM / YY" i]' },
    { kind: 'expiry month', selector: 'select[name*="exp_month" i]' },
    { kind: 'expiry year', selector: 'select[name*="exp_year" i]' },
    { kind: 'security code', selector: 'input[name="cvc"]' },
    { kind: 'name on card', selector: 'input[autocomplete="cc-name"]', frameOnly: 'input[name="name"]' },
    { kind: 'billing ZIP', selector: 'input[autocomplete*="billing postal-code"]', frameOnly: 'input[name="postal"]' },
  ]
  const cardNumber = '4242424242424242'
  const cardValues = { 'card number': [cardNumber], expiry: ['04/31'], 'expiry month': ['04', '4'], 'expiry year': ['2031', '31'], 'security code': ['737'], 'name on card': ['Nate Doe'], 'billing ZIP': ['94107'] }
  const card = async (viewId) => {
    const read = await evaluate('JSON.stringify(window.card || {})', viewId)
    try {
      return JSON.parse(read)
    } catch {
      return {}
    }
  }
  const pause = (ms) => new Promise((done) => setTimeout(done, ms))
  await run('navigate', { url: `${pages.base}/shop` }, { viewId: 'agent-g' })
  await pause(300)
  // The agent's click on the picture reaches the frame (it went to the page before, measured), and its keys follow.
  const frameBox = JSON.parse((await evaluate('JSON.stringify(document.getElementById("pay").getBoundingClientRect())', 'agent-g')) || '{}')
  answer = await run('mouse_click_xy', { x: Math.round(frameBox.left + 165), y: Math.round(frameBox.top + 65), element: 'CVC' }, { viewId: 'agent-g' })
  await run('press_key', { key: '9' }, { viewId: 'agent-g' })
  await pause(200)
  let inFrame = await card('agent-g')
  check(answer.ok && inFrame.cvc?.value === '9' && inFrame.cvc?.trusted === true, "the agent's click lands in a frame of another site, and the key after it", JSON.stringify(inFrame))
  // The in-chat form finds a field in that frame (step 3b, extended).
  answer = await run('form', { action: 'fill', domain: site, fields: [{ id: 'zip', type: 'text', target: { selector: 'input[name="postal"]' } }], values: { zip: '10001' } }, { viewId: 'agent-g' })
  inFrame = await card('agent-g')
  check(answer.ok && JSON.parse(answer.data).outcomes.zip === 'filled' && inFrame.postal?.value === '10001', "a card's field in a frame of another site is found and typed into", answer.data ?? answer.error)
  // The checkout card's reads.
  answer = await run('checkout', { action: 'read', pageHint: `${pages.base}/shop` }, { viewId: 'agent-g' })
  check(answer.ok && JSON.parse(answer.data).page === site && JSON.parse(answer.data).text.includes('Total $42.00'), "the checkout's text, for the card's total", answer.data ?? answer.error)
  answer = await run('checkout', { action: 'picture', pageHint: site }, { viewId: 'agent-g' })
  const shot = answer.ok ? JSON.parse(answer.data) : {}
  check(answer.ok && Buffer.from(shot.jpegB64 ?? '', 'base64').subarray(0, 2).toString('hex') === 'ffd8' && shot.iconUrl === `${pages.base}/favicon.png`, "the checkout's picture, a JPEG, and the shop's icon", JSON.stringify({ ...shot, jpegB64: shot.jpegB64?.length }))
  answer = await run('checkout', { action: 'read', pageHint: 'other.test' }, { viewId: 'agent-g' })
  check(!answer.ok && answer.error === 'No tab on other.test is open in the browser on this PC.', 'no tab on the site: no text, said so', answer.error)
  // Link's card: into the frame's fields and the page's own, key by key.
  answer = await run('checkout', { action: 'fill', pageHint: site, fields: cardFields, values: cardValues, expiryLong: '04/2031' }, { viewId: 'agent-g' })
  const paid = answer.ok ? JSON.parse(answer.data) : {}
  inFrame = await card('agent-g')
  const name = await evaluate('document.getElementById("ccname").value', 'agent-g')
  check(
    answer.ok && paid.found === true && paid.page === site && JSON.stringify([...(paid.filled ?? [])].sort()) === JSON.stringify(['billing ZIP', 'card number', 'expiry', 'name on card', 'security code']),
    'the card goes in: number, expiry, code and ZIP in the frame of another site, the name on the page',
    answer.data ?? answer.error,
  )
  check(
    inFrame.cardnumber?.value === cardNumber && inFrame['exp-date']?.value === '04/31' && inFrame.cvc?.value === '737' && inFrame.postal?.value === '94107' && name === 'Nate Doe' && ['cardnumber', 'exp-date', 'cvc', 'postal'].every((one) => inFrame[one]?.trusted === true),
    'each field holds what was asked (what was there replaced), typed as a person types',
    JSON.stringify({ ...inFrame, name }),
  )
  check(!JSON.stringify(answer).includes(cardNumber) && !JSON.stringify(answer).includes('737'), 'the answer never holds the card')
  await run('navigate', { url: `${pages.base}/shop-selects` }, { viewId: 'agent-g' })
  answer = await run('checkout', { action: 'fill', pageHint: `${pages.base}/shop-selects`, fields: cardFields, values: cardValues, expiryLong: '04/2031' }, { viewId: 'agent-g' })
  const chosen = await evaluate('JSON.stringify([document.getElementById("num").value, document.querySelector("[name=exp_month]").value, document.querySelector("[name=exp_year]").value, document.getElementById("cvc").value])', 'agent-g')
  check(answer.ok && chosen === JSON.stringify([cardNumber, '04', '2031', '737']) && JSON.parse(answer.data).filled.includes('expiry month'), "a month and a year chosen from the checkout's lists", `${answer.data ?? answer.error} ${chosen}`)
  await run('navigate', { url: `${pages.base}/other` }, { viewId: 'agent-g' })
  answer = await run('checkout', { action: 'fill', pageHint: site, fields: cardFields, values: cardValues }, { viewId: 'agent-g' })
  check(answer.ok && JSON.parse(answer.data).found === false && JSON.parse(answer.data).hinted === true, 'no card fields: nothing typed, said so', answer.data ?? answer.error)
  // Link's pay token, into Link's block.
  await run('navigate', { url: `${pages.base}/link-pay` }, { viewId: 'agent-g' })
  answer = await run('checkout', { action: 'token', pageHint: site, token: 'lpt_test_token_0123' }, { viewId: 'agent-g' })
  check(answer.ok && JSON.parse(answer.data).found === true && (await evaluate('document.title', 'agent-g')) === 'token 19', "Link's pay token is put into its block, the page told", answer.data ?? answer.error)
  // A flight (step 3c-2): Simeon's pay page opened, Link's card typed into Duffel's frame only, the bank check in front.
  const duffelFields = [
    { kind: 'name on card', selector: 'input[name="cardholderName"]', pattern: 'name on( the)? card|card ?holder', chosen: false },
    { kind: 'card number', selector: 'input[name="cardNumber"]', pattern: 'card number', chosen: false },
    { kind: 'expiry', selector: 'input[name="expiryDate"]', pattern: 'expir', chosen: false },
    { kind: 'security code', selector: 'input[name="cvc"]', pattern: 'cvc', chosen: false },
  ]
  answer = await run('flight', { action: 'open', url: `${pages.base}/elsewhere` }, { viewId: 'agent-h' })
  check(!answer.ok && answer.error === "Only Simeon's pay page opens here.", 'only the pay page opens', answer.error)
  answer = await run('flight', { action: 'open', url: `${pages.base}/desktop/flights/pay#key=test` }, { viewId: 'agent-h' })
  await pause(500)
  answer = await run('flight', { action: 'status', frames: ['^http://localhost:'] }, { viewId: 'agent-h' })
  check(answer.ok && JSON.parse(answer.data).status?.phase === 'form' && JSON.parse(answer.data).cardFrames === 1, "the pay page's own state is read, its card frame counted", answer.data ?? answer.error)
  answer = await run('flight', { action: 'fill', frames: ['^http://localhost:'], fields: duffelFields, values: { 'name on card': ['Nate Doe'], 'card number': [cardNumber], expiry: ['04/31'], 'security code': ['737'] } }, { viewId: 'agent-h' })
  const inDuffel = await card('agent-h')
  check(
    answer.ok && JSON.stringify(JSON.parse(answer.data).filled) === JSON.stringify(['name on card', 'card number', 'expiry', 'security code']) && inDuffel.holder?.value === 'Nate Doe' && inDuffel.cardNumber?.value === cardNumber && inDuffel.cvc?.trusted === true && !JSON.stringify(answer).includes(cardNumber),
    "the card goes into Duffel's frame (the name found by its label), never back in the answer",
    `${answer.data ?? answer.error} ${JSON.stringify(inDuffel)}`,
  )
  answer = await run('flight', { action: 'call', fn: 'createCard' }, { viewId: 'agent-h' })
  check(answer.ok && JSON.parse(answer.data).value?.card?.last_4_digits === '4242', "the page's own calls are made (Duffel's card id)", answer.data ?? answer.error)
  await run('flight', { action: 'call', fn: 'verify', args: ['off_test', 'tcd_test'] }, { viewId: 'agent-h' })
  await run('navigate', { url: `${pages.base}/other`, newTab: true }, { viewId: 'agent-h' })
  answer = await run('flight', { action: 'front' }, { viewId: 'agent-h' })
  const tabsNow = JSON.parse((await run('review_state', {}, { viewId: 'agent-h' })).data ?? '{}')
  const inFront = (tabsNow.pages ?? []).find((one) => one.id === tabsNow.viewPageId)?.url ?? ''
  check(answer.ok && inFront.includes('/desktop/flights/pay'), "the bank's check brings the pay page to the front", inFront)
  await run('flight', { action: 'call', fn: 'say', args: ['Booked'] }, { viewId: 'agent-h' })
  check((await evaluate('document.getElementById("line").textContent', 'agent-h')) === 'Booked', 'words on the pay page')
  const loggedNow = output.join('')
  check(!loggedNow.includes(cardNumber) && !loggedNow.includes('lpt_test_token_0123'), 'no card and no token in the app’s log')

  // MARK: Step 2b, the Computer tab's view and Take control
  const viewLine = output.join('').split('\n').find((line) => line.startsWith('[harness] view '))
  const viewBase = viewLine?.slice('[harness] view '.length).trim()
  const view = async (what, body = {}) => {
    const answer = await fetch(`${viewBase}/${what}`, { method: 'POST', body: JSON.stringify(body) })
    return answer.json()
  }
  const told = () => view('told')
  const soon = (ms) => new Promise((done) => setTimeout(done, ms))
  /** Waits up to 5 s for what the view told to pass `test`. */
  const until = async (test) => {
    for (let n = 0; n < 50; n += 1) {
      const now = await told()
      if (test(now)) return now
      await soon(100)
    }
    return told()
  }
  const pending = (promise, ms) => Promise.race([promise.then(() => 'answered'), soon(ms).then(() => 'waiting')])
  const shownTitle = (now) => now.last?.tabs?.find((tab) => tab.id === now.last.current)?.title
  const shownUrl = (now) => now.last?.tabs?.find((tab) => tab.id === now.last.current)?.url

  await run('navigate', { url: `${pages.base}/other` }, { viewId: 'agent-v' })
  let shown = await view('watch', { agentId: 'agent-v' })
  check(shown?.agentId === 'agent-v' && shown.enabled === true && shown.tabs.length === 1 && shown.current === shown.tabs[0].id && shown.person === false, 'watching an agent tells its tabs, the one it acts on, and the switch', JSON.stringify(shown))
  await run('navigate', { url: `${pages.base}/view` }, { viewId: 'agent-v' })
  let now = await until((one) => one.frames > 0 && shownTitle(one) === 'View')
  check(now.frames > 0 && now.frame?.width === 1280 && now.frame?.height === 800 && now.frame.head.join() === '255,216,255', "the agent's tab comes as pictures, JPEGs of the page's 1280 × 800, while nothing shows it", JSON.stringify(now.frame))
  check(shownUrl(now) === `${pages.base}/view` && now.last.canGoBack === true && now.last.canGoForward === false, 'the view is told the page, and that it can go back', JSON.stringify(now.last))
  const framesBefore = now.frames
  const viewOutline = (await run('snapshot', {}, { viewId: 'agent-v' })).data ?? ''
  answer = await run('click', { ref: refOf(viewOutline, /button "Agent"/), element: 'Agent' }, { viewId: 'agent-v' })
  now = await until((one) => one.last?.pointer?.type === 'click' && shownTitle(one) === 'agent clicked')
  check(answer.ok && now.last.pointer?.type === 'click' && Math.abs(now.last.pointer.x - 560) <= 2 && Math.abs(now.last.pointer.y - 120) <= 2, "the agent's click is where its pointer is shown", JSON.stringify(now.last?.pointer))
  check(now.frames > framesBefore, 'a change on the page is a new picture', `${framesBefore} → ${now.frames}`)
  now = await until((one) => one.last?.working === false)
  check(now.last.working === false, 'the agent is shown working only while a step runs', JSON.stringify(now.last))

  // Take control: the agent's steps wait; the person's pointer and keys reach the page, trusted.
  shown = await view('control', { agentId: 'agent-v', person: true })
  check(shown?.person === true, 'Take control gives the person the agent’s browser', JSON.stringify(shown))
  const waitingClick = stand.step('click', { ref: refOf(viewOutline, /button "Agent"/), element: 'Agent' }, { viewId: 'agent-v' }).answer
  check((await pending(waitingClick, 1_200)) === 'waiting', "the agent's next step waits while the person has control")
  now = await until((one) => one.last?.working === true)
  check(now.last.working === true, 'the waiting step shows the agent as working')
  const review = await Promise.race([run('review_state', {}, { viewId: 'agent-v' }), soon(3_000).then(() => undefined)])
  check(review?.ok === true, 'Auto-review still reads the tabs while the person has control', JSON.stringify(review))
  const mouse = (type, x, y, extra = {}) => view('input', { agentId: 'agent-v', input: { kind: 'mouse', type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: type === 'mouseMoved' ? 0 : 1, modifiers: 0, ...extra } })
  await mouse('mouseMoved', 200, 130)
  await mouse('mousePressed', 200, 130)
  await mouse('mouseReleased', 200, 130)
  now = await until((one) => shownTitle(one) === 'person true')
  check(shownTitle(now) === 'person true', "the person's click lands on the page, trusted", shownTitle(now))
  await mouse('mousePressed', 250, 315)
  await mouse('mouseReleased', 250, 315)
  for (const [key, code, keyCode] of [['h', 'KeyH', 72], ['i', 'KeyI', 73]]) {
    await view('input', { agentId: 'agent-v', input: { kind: 'key', type: 'keyDown', key, code, keyCode, text: key, modifiers: 0 } })
    await view('input', { agentId: 'agent-v', input: { kind: 'key', type: 'keyUp', key, code, keyCode, modifiers: 0 } })
  }
  await view('input', { agentId: 'agent-v', input: { kind: 'text', text: ' é' } })
  now = await until((one) => shownTitle(one) === 'typed hi é')
  check(shownTitle(now) === 'typed hi é', "the person's keys and composed words type into the page", shownTitle(now))
  await view('input', { agentId: 'agent-v', input: { kind: 'wheel', x: 640, y: 400, deltaX: 0, deltaY: 'lots', modifiers: 0 } })
  check((await told()).last !== undefined, 'a malformed input is dropped, nothing breaks')
  await view('bar', { agentId: 'agent-v', act: { act: 'back' } })
  now = await until((one) => shownUrl(one) === `${pages.base}/other` && one.last.canGoForward === true)
  check(shownUrl(now) === `${pages.base}/other`, 'Back goes back', shownUrl(now))
  await view('bar', { agentId: 'agent-v', act: { act: 'forward' } })
  now = await until((one) => shownUrl(one) === `${pages.base}/view` && shownTitle(one) === 'View')
  check(shownUrl(now) === `${pages.base}/view`, 'Forward goes forward', shownUrl(now))
  check((await pending(waitingClick, 10)) === 'waiting', 'the agent still waits')

  // Give back: the step that waited is told the page may have changed; the agent looks again.
  shown = await view('control', { agentId: 'agent-v', person: false })
  answer = await waitingClick
  check(shown?.person === false && !answer.ok && /^The person used this page since your last snapshot, so e\d+ may point elsewhere now; take a fresh browser_snapshot\.$/.test(answer.error ?? ''), 'given back, a ref from before is refused: the person used the page', JSON.stringify(answer))
  answer = await run('snapshot', {}, { viewId: 'agent-v' })
  check(answer.ok && /The person used the browser \(Take control\) and gave it back/.test(answer.summary), 'the agent is told the person had the browser', answer.summary)
  await mouse('mousePressed', 560, 120)
  await mouse('mouseReleased', 560, 120)
  await soon(400)
  check(shownTitle(await told()) === 'View', "the person's input reaches the page only while they have control", shownTitle(await told()))
  await view('bar', { agentId: 'agent-v', act: { act: 'back' } })
  await soon(400)
  check(shownUrl(await told()) === `${pages.base}/view`, 'the bar is the person’s only while they have control')

  // Held past a step's time: the step says so before its deadline; the page loading again gives everything back.
  await view('control', { agentId: 'agent-v', person: true })
  const heldStarted = Date.now()
  answer = await run('snapshot', {}, { viewId: 'agent-v', deadlineMs: 7_000 })
  check(!answer.ok && /^The person has taken control of the browser here/.test(answer.error ?? '') && Date.now() - heldStarted < 6_500, 'a step that waits out its time is told the person has the browser, before its deadline', `${JSON.stringify(answer)} after ${Date.now() - heldStarted} ms`)
  await view('reload-page')
  answer = await Promise.race([run('snapshot', {}, { viewId: 'agent-v' }), soon(4_000).then(() => ({ timedOut: true }))])
  shown = await view('watch', { agentId: 'agent-v' })
  check(answer.ok && shown?.person === false, 'the app’s page loading again gives the browser back', JSON.stringify({ ok: answer.ok, person: shown?.person }))
  // Step 3c: the person's click reaches a frame of another site (a card form, a bank's check), their keys after it.
  await run('navigate', { url: `${pages.base}/shop` }, { viewId: 'agent-v' })
  await soon(300)
  const payBox = JSON.parse((await evaluate('JSON.stringify(document.getElementById("pay").getBoundingClientRect())', 'agent-v')) || '{}')
  await view('control', { agentId: 'agent-v', person: true })
  await mouse('mousePressed', Math.round(payBox.left + 110), Math.round(payBox.top + 25))
  await mouse('mouseReleased', Math.round(payBox.left + 110), Math.round(payBox.top + 25))
  for (const [key, code, keyCode] of [['4', 'Digit4', 52], ['2', 'Digit2', 50]]) {
    await view('input', { agentId: 'agent-v', input: { kind: 'key', type: 'keyDown', key, code, keyCode, text: key, modifiers: 0 } })
    await view('input', { agentId: 'agent-v', input: { kind: 'key', type: 'keyUp', key, code, keyCode, modifiers: 0 } })
  }
  await soon(300)
  await view('control', { agentId: 'agent-v', person: false })
  const personTyped = JSON.parse((await evaluate('JSON.stringify(window.card || {})', 'agent-v')) || '{}')
  check(personTyped.cardnumber?.value === '42' && personTyped.cardnumber?.trusted === true, "the person's click lands in a frame of another site, their keys after it", JSON.stringify(personTyped))
  await view('watch', { agentId: null })
  const framesUnwatched = (await told()).frames
  await run('navigate', { url: `${pages.base}/other` }, { viewId: 'agent-v' })
  await soon(500)
  check((await told()).frames === framesUnwatched, 'unwatched, no pictures are made', `${framesUnwatched} → ${(await told()).frames}`)

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
