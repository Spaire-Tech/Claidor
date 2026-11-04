// The browser in the app (docs/app-browser/protocol.md), the parts that need
// no Electron: the engine's frames read and the app's written, the keys, the
// addresses a tab may open and the user agent, and the line to the engine
// against a stand-in engine on this computer (its welcome, the hello, pings,
// a step and its answer, a cancel, a deadline, a stream that drops and is
// dialled again, the end); who has control of an agent's browser (step 2b).
// The tabs, the steps and the view run in Electron for real:
// `npm run browser-smoke`.

import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { Control } from '../src/main/browser/control'
import { BrowserLink } from '../src/main/browser/link'
import { readKey } from '../src/main/browser/keys'
import { type Answer, type BrowserRequest, readFrame, response } from '../src/main/browser/protocol'
import { chromeAgent, openable, zoneIdentifier } from '../src/main/browser/rules'
import { fetchTransport } from '../src/main/hands/transport'

describe('the frames', () => {
  it('reads a welcome, a request, a cancel; refuses another protocol, an unknown op, a missing tab', () => {
    expect(readFrame({ kind: 'welcome', providerId: 'p1', protocol: 1, enabled: true })).toEqual({ kind: 'welcome', providerId: 'p1', enabled: true })
    expect(readFrame({ kind: 'welcome', providerId: 'p1', protocol: 1 })).toEqual({ kind: 'welcome', providerId: 'p1', enabled: false })
    expect(readFrame({ kind: 'cancel', requestId: 'r1' })).toEqual({ kind: 'cancel', requestId: 'r1' })
    const request = readFrame({ kind: 'request', requestId: 'r2', protocol: 1, op: 'click', viewId: 'agent', args: { ref: 'e3' }, screenshot: true, deadlineMs: 5_000 })
    expect(request).toEqual({ kind: 'request', request: { requestId: 'r2', op: 'click', viewId: 'agent', args: { ref: 'e3' }, screenshot: true, deadlineMs: 5_000 } })
    expect(readFrame({ kind: 'request', requestId: 'r3', protocol: 2, op: 'click', viewId: 'a' })).toMatchObject({ kind: 'refused', requestId: 'r3' })
    expect(readFrame({ kind: 'request', requestId: 'r4', protocol: 1, op: 'format_disk', viewId: 'a' })).toMatchObject({ kind: 'refused', error: expect.stringContaining('format_disk') })
    expect(readFrame({ kind: 'request', requestId: 'r5', protocol: 1, op: 'click' })).toMatchObject({ kind: 'refused', error: 'The browser step named no tab.' })
    expect(readFrame({ kind: 'request', protocol: 1, op: 'click', viewId: 'a' })).toBeUndefined()
    expect(readFrame('nonsense')).toBeUndefined()
  })

  it('keeps a deadline between one and ninety seconds', () => {
    const read = (deadlineMs: unknown) => {
      const frame = readFrame({ kind: 'request', requestId: 'r', protocol: 1, op: 'snapshot', viewId: 'a', deadlineMs: deadlineMs as number })
      return frame?.kind === 'request' ? frame.request.deadlineMs : undefined
    }
    expect(read(500_000)).toBe(90_000)
    expect(read(10)).toBe(1_000)
    expect(read(undefined)).toBe(90_000)
  })

  it('writes an answer, its picture only when there is one', () => {
    expect(response('r1', { ok: false, error: 'No.' })).toEqual({ kind: 'response', requestId: 'r1', ok: false, error: 'No.' })
    expect(response('r2', { ok: true, summary: 'Done.', url: 'https://a.test/', title: 'A', screenshotB64: 'iVBOR' })).toEqual({
      kind: 'response',
      requestId: 'r2',
      ok: true,
      summary: 'Done.',
      url: 'https://a.test/',
      title: 'A',
      screenshot: true,
      screenshotB64: 'iVBOR',
    })
  })
})

describe('who has control', () => {
  it("lets the agent's steps go on at once while the person doesn't have its browser", async () => {
    const control = new Control()
    expect(await control.free('a', 1_000, new AbortController().signal)).toBe(true)
  })

  it('holds them while the person has it, and lets them go when it is given back', async () => {
    const control = new Control()
    const told: string[] = []
    control.onChange((group) => told.push(group))
    control.take('a')
    control.take('a')
    expect(control.isHeld('a')).toBe(true)
    expect(control.isHeld('b')).toBe(false)
    const waiting = control.free('a', 5_000, new AbortController().signal)
    expect(await control.free('b', 5_000, new AbortController().signal)).toBe(true)
    expect(control.giveBack('a')).toBe(true)
    expect(await waiting).toBe(true)
    expect(control.giveBack('a')).toBe(false)
    expect(told).toEqual(['a', 'a'])
  })

  it('lets a step go when its time is out or it is stopped, saying it was not given back', async () => {
    const control = new Control()
    control.take('a')
    expect(await control.free('a', 20, new AbortController().signal)).toBe(false)
    const stop = new AbortController()
    const stopped = control.free('a', 5_000, stop.signal)
    stop.abort()
    expect(await stopped).toBe(false)
    const already = new AbortController()
    already.abort()
    expect(await control.free('a', 5_000, already.signal)).toBe(false)
    expect(control.heldGroups()).toEqual(['a'])
  })
})

describe('the keys', () => {
  it('reads names, characters and shortcuts', () => {
    expect(readKey('Enter')).toEqual({ key: 'Enter', code: 'Enter', keyCode: 13, text: '\r', modifiers: 0 })
    expect(readKey('ArrowDown')).toMatchObject({ key: 'ArrowDown', keyCode: 40, modifiers: 0 })
    expect(readKey('a')).toEqual({ key: 'a', code: 'KeyA', keyCode: 65, text: 'a', modifiers: 0 })
    expect(readKey('Shift+a')).toMatchObject({ code: 'KeyA', text: 'A', modifiers: 8 })
    expect(readKey('Control+A')).toEqual({ key: 'A', code: 'KeyA', keyCode: 65, modifiers: 2 })
    expect(readKey('Control++')).toMatchObject({ key: '+', modifiers: 2 })
    expect(readKey('é')).toEqual({ key: 'é', code: '', keyCode: 0, text: 'é', modifiers: 0 })
    expect(readKey(' ')).toMatchObject({ code: 'Space', text: ' ' })
    expect(readKey('F5')).toMatchObject({ key: 'F5', keyCode: 116 })
    expect(readKey('Hyper+a')).toBeUndefined()
    expect(readKey('Whatever')).toBeUndefined()
    expect(readKey('')).toBeUndefined()
  })
})

describe('the rules', () => {
  it('opens the web and an empty page, nothing of this PC', () => {
    expect(openable('https://example.com/a?b')).toBe(true)
    expect(openable('http://localhost:8080/')).toBe(true)
    expect(openable('about:blank')).toBe(true)
    for (const refused of ['file:///C:/Windows/win.ini', 'app://simeon/app-next/', 'javascript:alert(1)', 'chrome://settings', 'devtools://devtools', 'simeon://open', 'data:text/html,hi', 'about:config', 'not a url'])
      expect(openable(refused), refused).toBe(false)
  })

  it("marks a download as from the internet, as Chrome does, never with a name or password in it", () => {
    expect(zoneIdentifier('https://nate:secret@files.example.com/report.pdf?x=1')).toBe('[ZoneTransfer]\r\nZoneId=3\r\nHostUrl=https://files.example.com/report.pdf?x=1\r\n')
    expect(zoneIdentifier('blob:https://a.test/123')).toBe('[ZoneTransfer]\r\nZoneId=3\r\n')
  })

  it('shows sites the Chrome it is, not Electron or the app', () => {
    const agent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) simeon-windows/0.1.0 Chrome/152.0.7977.169 Electron/44.10.1 Safari/537.36'
    expect(chromeAgent(agent)).toBe('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.7977.169 Safari/537.36')
  })
})

/** The engine's side, on this computer: its stream of frames, and the batches it was sent. */
async function standInEngine() {
  const batches: { providerId?: string; frames: Record<string, unknown>[] }[] = []
  const streams: http.ServerResponse[] = []
  let next = 1
  let answerStatus = 200
  const server = http.createServer((req, res) => {
    if (req.headers.authorization !== 'Bearer gateway-token') {
      res.writeHead(401).end()
      return
    }
    if (req.method === 'GET' && req.url === '/local-browser/requests') {
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.write('retry: 1000\n\n')
      res.write(`data: ${JSON.stringify({ kind: 'welcome', providerId: `p${next++}`, protocol: 1, enabled: true })}\n\n`)
      streams.push(res)
      return
    }
    if (req.method === 'POST' && req.url === '/local-browser/responses') {
      let body = ''
      req.on('data', (chunk) => (body += chunk))
      req.on('end', () => {
        batches.push(JSON.parse(body))
        res.writeHead(answerStatus, { 'content-type': 'application/json' }).end('{"ok":true}')
      })
      return
    }
    res.writeHead(404).end()
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  return {
    base,
    batches,
    streams,
    send(frame: Record<string, unknown>) {
      streams.at(-1)?.write(`data: ${JSON.stringify(frame)}\n\n`)
    },
    frames: (): Record<string, unknown>[] => batches.flatMap((one) => one.frames.map((frame) => ({ ...frame, providerId: one.providerId }))),
    set answerStatus(status: number) {
      answerStatus = status
    },
    close: () =>
      new Promise<void>((done) => {
        for (const stream of streams) stream.destroy()
        server.closeAllConnections()
        server.close(() => done())
      }),
  }
}

async function until<T>(read: () => T | undefined, ms = 3_000): Promise<T> {
  const started = Date.now()
  for (;;) {
    const value = read()
    if (value !== undefined && value !== false) return value
    if (Date.now() - started > ms) throw new Error('waited too long')
    await new Promise((done) => setTimeout(done, 10))
  }
}

describe('the line to the engine', () => {
  const cleanups: (() => Promise<void> | void)[] = []
  afterEach(async () => {
    for (const cleanup of cleanups.splice(0)) await cleanup()
  })

  async function linked(run: (request: BrowserRequest, signal: AbortSignal) => Promise<Answer>) {
    const engine = await standInEngine()
    const lines: string[] = []
    const link = new BrowserLink({
      transport: fetchTransport((input, init) => fetch(input, init)),
      hello: { label: 'Test PC', deviceId: 'device-1', browserSession: 'session-aaaa1111' },
      run,
      log: (line) => lines.push(line),
      timing: { pingMs: 50, stallMs: 2_000, backoffMs: [20, 40], postGapMs: 5 },
    })
    cleanups.push(async () => {
      link.end()
      await engine.close()
    })
    link.follow({ baseURL: engine.base, headers: { authorization: 'Bearer gateway-token' } })
    return { engine, link, lines }
  }

  it('says hello after the welcome, with the stream named, then pings', async () => {
    const { engine, link } = await linked(async () => ({ ok: true, summary: 'Done.' }))
    const helloFrame = await until(() => engine.frames().find((frame) => frame.kind === 'hello'))
    expect(helloFrame).toEqual({
      kind: 'hello',
      protocol: 1,
      browser: true,
      platform: 'windows',
      label: 'Test PC',
      deviceId: 'device-1',
      browserSession: 'session-aaaa1111',
      providerId: 'p1',
    })
    await until(() => engine.frames().some((frame) => frame.kind === 'ping'))
    expect(link.connected).toBe(true)
    expect(link.enabled).toBe(true)
  })

  it('runs a step and answers it once; a refused one is answered with its sentence', async () => {
    const seen: BrowserRequest[] = []
    const { engine } = await linked(async (request) => {
      seen.push(request)
      return { ok: true, summary: 'Read the page.', url: 'https://a.test/', title: 'A', data: '- button "Go" [ref=e1]' }
    })
    await until(() => engine.frames().find((frame) => frame.kind === 'hello'))
    engine.send({ kind: 'request', requestId: 'r1', protocol: 1, op: 'snapshot', viewId: 'agent-1', args: {}, screenshot: true, deadlineMs: 5_000 })
    const answer = await until(() => engine.frames().find((frame) => frame.kind === 'response' && frame.requestId === 'r1'))
    expect(answer).toMatchObject({ ok: true, summary: 'Read the page.', data: '- button "Go" [ref=e1]', providerId: 'p1' })
    expect(seen.map((one) => one.op)).toEqual(['snapshot'])
    engine.send({ kind: 'request', requestId: 'r1', protocol: 1, op: 'snapshot', viewId: 'agent-1', args: {} })
    engine.send({ kind: 'request', requestId: 'r2', protocol: 9, op: 'snapshot', viewId: 'agent-1' })
    const refused = await until(() => engine.frames().find((frame) => frame.kind === 'response' && frame.requestId === 'r2'))
    expect(refused).toMatchObject({ ok: false, error: expect.stringContaining('another version') })
    await new Promise((done) => setTimeout(done, 100))
    expect(engine.frames().filter((frame) => frame.kind === 'response' && frame.requestId === 'r1')).toHaveLength(1)
  })

  it('stops a cancelled step and sends nothing for it; a step past its deadline is answered so', async () => {
    let stopped = false
    const { engine } = await linked(
      (request, signal) =>
        new Promise((done) => {
          signal.addEventListener('abort', () => {
            stopped = true
            done({ ok: true, summary: 'too late' })
          })
          if (request.op === 'snapshot') setTimeout(() => done({ ok: true, summary: 'late' }), 5_000)
        }),
    )
    await until(() => engine.frames().find((frame) => frame.kind === 'hello'))
    engine.send({ kind: 'request', requestId: 'c1', protocol: 1, op: 'click', viewId: 'a', args: {}, deadlineMs: 60_000 })
    await new Promise((done) => setTimeout(done, 50))
    engine.send({ kind: 'cancel', requestId: 'c1' })
    await until(() => stopped)
    engine.send({ kind: 'request', requestId: 'd1', protocol: 1, op: 'snapshot', viewId: 'a', args: {}, deadlineMs: 1_000 })
    const late = await until(() => engine.frames().find((frame) => frame.kind === 'response' && frame.requestId === 'd1'), 4_000)
    expect(late).toMatchObject({ ok: false, error: 'The browser took too long to respond (1 seconds).' })
    expect(engine.frames().some((frame) => frame.requestId === 'c1')).toBe(false)
  })

  it('dials again when the stream drops, under a new name; a step of the old stream is stopped', async () => {
    let stops = 0
    const { engine } = await linked(
      (_request, signal) =>
        new Promise((done) => {
          signal.addEventListener('abort', () => {
            stops += 1
            done({ ok: true, summary: 'gone' })
          })
        }),
    )
    await until(() => engine.frames().find((frame) => frame.kind === 'hello'))
    engine.send({ kind: 'request', requestId: 'x1', protocol: 1, op: 'click', viewId: 'a', args: {}, deadlineMs: 60_000 })
    await new Promise((done) => setTimeout(done, 50))
    engine.streams.at(-1)?.destroy()
    await until(() => engine.frames().find((frame) => frame.kind === 'hello' && frame.providerId === 'p2'))
    expect(stops).toBe(1)
    expect(engine.frames().some((frame) => frame.requestId === 'x1')).toBe(false)
  })

  it('ends, and dials no more', async () => {
    const { engine, link } = await linked(async () => ({ ok: true, summary: 'Done.' }))
    await until(() => engine.frames().find((frame) => frame.kind === 'hello'))
    link.end()
    await new Promise((done) => setTimeout(done, 200))
    expect(engine.streams.length).toBe(1)
    expect(link.connected).toBe(false)
  })
})
