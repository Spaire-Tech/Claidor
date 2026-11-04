// The browser in the app, its line to the agents' engine (docs/app-browser/
// protocol.md): one stream of the engine's requests at a time, on the same
// address and keys the agent's hands use (`handsStream`, parts/hands.ts).
// The welcome names the stream; the hello says this PC has a browser; a
// ping goes every 10 s; 35 s without a byte ends the stream, which is dialled
// again, 1, 2, 4, 8, then every 10 s, for as long as the hands have an
// address. Each request runs once, inside its deadline; a cancel stops it
// and nothing is sent for it.

import type { Target } from '../hands/target'
import type { Transport } from '../hands/transport'
import { EventParser, type JSONValue } from '../hands/wire'
import {
  type Answer,
  type BrowserRequest,
  type HelloFields,
  batch,
  hello,
  ping,
  readFrame,
  requestsPath,
  response,
  responsesPath,
} from './protocol'

export interface LinkOptions {
  transport: Transport
  hello: HelloFields
  /** Runs one step; the signal says it was cancelled or ran out of time. */
  run(request: BrowserRequest, signal: AbortSignal): Promise<Answer>
  log(line: string): void
  /** Shorter waits for the tests. */
  timing?: { pingMs?: number; stallMs?: number; backoffMs?: readonly number[]; postGapMs?: number }
}

const backoff = [1_000, 2_000, 4_000, 8_000, 10_000] as const

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((done) => {
    if (signal.aborted) return done()
    const finish = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', finish)
      done()
    }
    const timer = setTimeout(finish, ms)
    signal.addEventListener('abort', finish, { once: true })
  })
}

function sameTarget(a: Target, b: Target): boolean {
  if (a.baseURL !== b.baseURL) return false
  const keys = new Set([...Object.keys(a.headers), ...Object.keys(b.headers)])
  for (const key of keys) if (a.headers[key] !== b.headers[key]) return false
  return true
}

export class BrowserLink {
  private target: Target | undefined
  private loop: AbortController | undefined
  private stream: AbortController | undefined
  private providerId: string | undefined
  private readonly running = new Map<string, AbortController>()
  /** The stream's requests already taken: one delivered twice runs once. */
  private readonly taken = new Set<string>()
  private readonly pingMs: number
  private readonly stallMs: number
  private readonly backoffMs: readonly number[]
  private readonly postGapMs: number
  /** The engine's switch, from the last welcome. */
  enabled = false

  constructor(private readonly options: LinkOptions) {
    this.pingMs = options.timing?.pingMs ?? 10_000
    this.stallMs = options.timing?.stallMs ?? 35_000
    this.backoffMs = options.timing?.backoffMs ?? backoff
    this.postGapMs = options.timing?.postGapMs ?? 200
  }

  /** Whether a stream is open and named now. */
  get connected(): boolean {
    return this.providerId !== undefined
  }

  /** The hands have this address: the stream follows it (a moved one is dialled anew). */
  follow(target: Target): void {
    const moved = this.target !== undefined && !sameTarget(this.target, target)
    this.target = target
    if (moved) this.stream?.abort()
    if (this.loop) return
    const loop = new AbortController()
    this.loop = loop
    void this.dial(loop.signal).finally(() => {
      if (this.loop === loop) this.loop = undefined
    })
  }

  /** The hands lost their address (the page went, signed out, quitting): the stream ends, and what runs stops. */
  end(): void {
    this.target = undefined
    this.loop?.abort()
    this.loop = undefined
    this.stream?.abort()
    this.stopRunning()
  }

  private stopRunning(): void {
    for (const controller of this.running.values()) controller.abort()
    this.running.clear()
  }

  private async dial(signal: AbortSignal): Promise<void> {
    let attempt = 0
    while (!signal.aborted && this.target) {
      const connected = await this.openStream(this.target, signal)
      if (signal.aborted || !this.target) return
      if (connected) attempt = 0
      await sleep(this.backoffMs[Math.min(attempt, this.backoffMs.length - 1)] ?? 10_000, signal)
      attempt += 1
    }
  }

  /** One stream; whether it opened. */
  private async openStream(target: Target, loop: AbortSignal): Promise<boolean> {
    const stream = new AbortController()
    this.stream = stream
    const both = AbortSignal.any([loop, stream.signal])
    let lastByte = Date.now()
    let opened = false
    const watch = (async () => {
      while (!both.aborted) {
        await sleep(Math.min(this.pingMs, this.stallMs), both)
        if (both.aborted) return
        if (Date.now() - lastByte > this.stallMs) {
          this.options.log('[browser] the engine went quiet; dialling again')
          stream.abort()
          return
        }
        if (this.providerId !== undefined) void this.post([ping], 10_000)
      }
    })()
    try {
      const { status, body } = await this.options.transport.stream(target.baseURL + requestsPath, target.headers, both)
      if (status < 200 || status >= 300) {
        this.options.log(`[browser] the engine's stream answered ${status}`)
        return false
      }
      opened = true
      const parser = new EventParser()
      for await (const chunk of body) {
        lastByte = Date.now()
        for (const event of parser.feed(chunk)) {
          if (event.kind === 'frame') this.take(event.json)
        }
      }
      return opened
    } catch {
      return opened
    } finally {
      stream.abort()
      if (this.stream === stream) this.stream = undefined
      this.providerId = undefined
      this.taken.clear()
      // The engine forgets this stream's requests when it closes: what still runs for them stops.
      this.stopRunning()
      await watch
    }
  }

  private take(json: JSONValue): void {
    const frame = readFrame(json)
    if (!frame) return
    switch (frame.kind) {
      case 'welcome':
        this.providerId = frame.providerId
        this.enabled = frame.enabled
        void this.post([hello(this.options.hello)], 10_000)
        return
      case 'cancel':
        this.running.get(frame.requestId)?.abort()
        this.running.delete(frame.requestId)
        return
      case 'refused':
        void this.answer(frame.requestId, { ok: false, error: frame.error })
        return
      case 'request':
        void this.runOne(frame.request)
    }
  }

  private async runOne(request: BrowserRequest): Promise<void> {
    if (this.taken.has(request.requestId)) return
    this.taken.add(request.requestId)
    if (this.taken.size > 1_000) this.taken.delete(this.taken.values().next().value as string)
    const controller = new AbortController()
    this.running.set(request.requestId, controller)
    const providerId = this.providerId
    const started = Date.now()
    let timer: ReturnType<typeof setTimeout> | undefined
    const deadline = new Promise<Answer>((done) => {
      timer = setTimeout(() => {
        controller.abort()
        done({ ok: false, error: `The browser took too long to respond (${Math.round(request.deadlineMs / 1_000)} seconds).` })
      }, request.deadlineMs)
    })
    let answer: Answer
    try {
      answer = await Promise.race([
        this.options.run(request, controller.signal).catch((error: unknown): Answer => ({
          ok: false,
          error: error instanceof Error && error.message ? error.message : 'The browser step failed.',
        })),
        deadline,
      ])
    } finally {
      clearTimeout(timer)
    }
    const cancelled = this.running.get(request.requestId) !== controller
    this.running.delete(request.requestId)
    this.options.log(`[browser] ${request.op} ${answer.ok ? 'done' : 'failed'} in ${Date.now() - started} ms${cancelled ? ' (cancelled)' : ''}`)
    // Cancelled, or its stream gone: nobody waits for this answer.
    if (cancelled || providerId === undefined || this.providerId !== providerId) return
    await this.answer(request.requestId, answer)
  }

  private answer(requestId: string, answer: Answer): Promise<boolean> {
    return this.post([response(requestId, answer)], 30_000)
  }

  /** Three tries, 200 ms apart; false when none was taken. */
  private async post(frames: JSONValue[], timeoutMs: number): Promise<boolean> {
    const target = this.target
    const providerId = this.providerId
    if (!target || providerId === undefined) return false
    const body = JSON.stringify(batch(providerId, frames))
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { status } = await this.options.transport.post(target.baseURL + responsesPath, target.headers, body, timeoutMs)
      if (status >= 200 && status < 300) return true
      if (status >= 400 && status < 500 && status !== 408 && status !== 429) break
      if (attempt < 2) await new Promise((done) => setTimeout(done, this.postGapMs))
    }
    this.options.log(`[browser] ${frames.length} frame(s) not taken by the engine`)
    return false
  }
}
