// The server's side of the rebuild (SimeonCore's `ComputerWireTests`:
// `testEnvelopes`, `testRecreateAnswers`), and the relay that follows the
// server's record (MigrationWatch.swift's `MigrationRelay`).

import { describe, expect, it } from 'vitest'
import { MemoryVault, SimeonAPI } from './api'
import { LiveBackend } from './backend'
import { migrationEventFrom } from './computerRebuild'
import type { JSONValue } from './json'
import {
  ConnectEnvelopes,
  MigrationRelay,
  apiRebuildServer,
  connectStream,
  rebuildServerOf,
  recreateAnswerFrom,
} from './migrationWatch'
import {
  FakeBackend,
  Routes,
  answer,
  eventually,
  makeGateway,
  tokenFor,
} from './testing'

function end(body: string): Uint8Array {
  const bytes = new TextEncoder().encode(body)
  return new Uint8Array([0x02, 0, 0, 0, bytes.length, ...bytes])
}

function api(http = new Routes()): SimeonAPI {
  return new SimeonAPI({
    base: 'https://api.example.com',
    clientVersion: '1',
    vault: new MemoryVault({
      accessToken: tokenFor('u1'),
      refreshToken: 'r',
      expiresAtMs: 9e15,
    }),
    http,
    language: 'en',
  })
}

describe('the server’s side of the rebuild (`ComputerWireTests`)', () => {
  it('reads Connect’s envelopes, a byte at a time', () => {
    const reader = new ConnectEnvelopes()
    const bytes = [
      ...ConnectEnvelopes.envelope({
        phase: 2,
        operationId: 'op',
        offsetKey: '1',
      }),
      ...end('{}'),
    ]
    const frames = bytes.flatMap((byte) => reader.feed(new Uint8Array([byte])))
    expect(frames).toHaveLength(2)
    const first = frames[0]
    expect(first?.kind).toBe('message')
    if (first?.kind === 'message')
      expect(migrationEventFrom(first.json)).toEqual({
        operationId: 'op',
        phase: 'creating',
        detail: '',
      })
    expect(frames[1]).toEqual({ kind: 'end', error: undefined })
    // A stream that ends on an error says why.
    expect(
      new ConnectEnvelopes().feed(
        end('{"error":{"code":"unavailable","message":"Not now"}}'),
      ),
    ).toEqual([{ kind: 'end', error: 'Not now' }])
  })

  it('reads what a recreate answered', () => {
    expect(
      recreateAnswerFrom(
        { started: true, operationId: 'abc', reason: '' },
        true,
      ),
    ).toEqual({ kind: 'started', operationId: 'abc' })
    expect(
      recreateAnswerFrom({ started: true, operationId: '' }, false),
    ).toEqual({ kind: 'untrackable' })
    expect(
      recreateAnswerFrom({ started: false, reason: 'no box' }, false),
    ).toEqual({
      kind: 'rejected',
      reason: "Couldn't reset the computer (no box). It is unchanged.",
    })
    expect(recreateAnswerFrom({ started: false, reason: '' }, true)).toEqual({
      kind: 'rejected',
      reason: "Couldn't update the computer. It is unchanged.",
    })
  })

  it('sends the two recreates as the Mac does', async () => {
    const http = new Routes()
    const sent: JSONValue[] = []
    http.on('/RecreateSandBox', (request) => {
      sent.push(JSON.parse(String(request.body)))
      return answer(200, JSON.stringify({ started: true, operationId: 'op1' }))
    })
    http.on('/ForceRecreateSandBox', (request) => {
      sent.push(JSON.parse(String(request.body)))
      return answer(200, JSON.stringify({ started: false, reason: '' }))
    })
    const server = apiRebuildServer(api(http))
    expect(await server.updateComputer(true)).toEqual({
      kind: 'started',
      operationId: 'op1',
    })
    expect(await server.resetComputer()).toEqual({
      kind: 'rejected',
      reason: "Couldn't reset the computer. It is unchanged.",
    })
    expect(sent).toEqual([{ preserveData: true, force: true }, {}])
    expect(http.sent).toEqual([
      'https://api.example.com/simeon.v1.ComputerService/RecreateSandBox',
      'https://api.example.com/simeon.v1.ComputerService/ForceRecreateSandBox',
    ])
  })

  it('reads the server’s stream (`WatchSandBoxMigration`) with its envelope and the sign-in', async () => {
    const asked: { url: string; init: RequestInit }[] = []
    const fetcher = (async (url: string, init: RequestInit) => {
      asked.push({ url, init })
      const body = new Uint8Array([
        ...ConnectEnvelopes.envelope({
          phase: 1,
          operationId: 'op',
          offsetKey: '4',
        }),
        ...ConnectEnvelopes.envelope({
          phase: 6,
          operationId: 'op',
          offsetKey: '5',
        }),
        ...end('{}'),
      ])
      return new Response(body, { status: 200 })
    }) as unknown as typeof fetch
    const got: JSONValue[] = []
    for await (const message of connectStream(
      api(),
      'WatchSandBoxMigration',
      { fromOffsetKey: '3', includeFinished: true },
      new AbortController().signal,
      fetcher,
    ))
      got.push(message)
    expect(got.map((one) => (one as { offsetKey: string }).offsetKey)).toEqual([
      '4',
      '5',
    ])
    const request = asked[0]!
    expect(request.url).toBe(
      'https://api.example.com/simeon.v1.ComputerService/WatchSandBoxMigration',
    )
    const headers = request.init.headers as Record<string, string>
    expect(headers['content-type']).toBe('application/connect+json')
    expect(headers['connect-protocol-version']).toBe('1')
    expect(headers.authorization).toBe(`Bearer ${tokenFor('u1')}`)
    expect(headers['x-simeon-client-type']).toBe('sand')
    const reader = new ConnectEnvelopes()
    const frames = reader.feed(request.init.body as Uint8Array)
    expect(frames).toEqual([
      {
        kind: 'message',
        json: { fromOffsetKey: '3', includeFinished: true },
      },
    ])
    // Refused, or ended on an error: it throws, and the relay reads again.
    const refused = (async () =>
      new Response('', { status: 503 })) as unknown as typeof fetch
    await expect(
      (async () => {
        for await (const one of connectStream(
          api(),
          'WatchSandBoxMigration',
          {},
          new AbortController().signal,
          refused,
        ))
          void one
      })(),
    ).rejects.toThrow('503')
  })

  it('stopped while its token is read, the stream sends nothing', async () => {
    let release: (token: string) => void = () => {}
    const slow = {
      base: 'https://api.example.com',
      clientHeaders: {},
      accessToken: () => new Promise<string>((resolve) => (release = resolve)),
    } as unknown as SimeonAPI
    let asked = 0
    const fetcher = (async () => {
      asked += 1
      return new Response(new Uint8Array(end('{}')), { status: 200 })
    }) as unknown as typeof fetch
    const stop = new AbortController()
    const reading = (async () => {
      const got: JSONValue[] = []
      for await (const one of connectStream(
        slow,
        'WatchSandBoxMigration',
        {},
        stop.signal,
        fetcher,
      ))
        got.push(one)
      return got
    })()
    await Promise.resolve()
    stop.abort()
    release(tokenFor('u1'))
    expect(await reading).toEqual([])
    expect(asked).toBe(0)
  })

  it('only a computer reached through a sign-in has the server’s calls', () => {
    expect(rebuildServerOf(new FakeBackend())).toBeUndefined()
    expect(rebuildServerOf(new LiveBackend(makeGateway(new Routes())))).toBe(
      undefined,
    )
    expect(
      rebuildServerOf(new LiveBackend(makeGateway(new Routes()), api())),
    ).toBeDefined()
  })
})

/** A stream the test feeds and ends, one per read; each read's offset is kept. */
class Streams {
  offsets: string[] = []
  private current?: {
    push: (message: JSONValue) => void
    end: (error?: Error) => void
  }

  open = (from: string, signal: AbortSignal): AsyncIterable<JSONValue> => {
    this.offsets.push(from)
    const queue: JSONValue[] = []
    let ended: Error | null | undefined
    let wake: (() => void) | undefined
    this.current = {
      push: (message) => {
        queue.push(message)
        wake?.()
      },
      end: (error) => {
        ended = error ?? null
        wake?.()
      },
    }
    signal.addEventListener('abort', () => {
      ended = new Error('Stopped.')
      wake?.()
    })
    return {
      [Symbol.asyncIterator]: async function* () {
        for (;;) {
          if (queue.length > 0) {
            yield queue.shift()!
            continue
          }
          if (ended !== undefined) {
            if (ended) throw ended
            return
          }
          await new Promise<void>((resolve) => (wake = resolve))
        }
      },
    }
  }

  push(message: JSONValue): void {
    this.current?.push(message)
  }

  end(error?: Error): void {
    this.current?.end(error)
  }
}

/** Timers that fire only when the test says. */
class Timers {
  waits: number[] = []
  private resumes: (() => void)[] = []
  private watchdogs: { work: () => void; live: boolean }[] = []

  wait = (ms: number, signal: AbortSignal): Promise<void> =>
    new Promise((resolve, reject) => {
      this.waits.push(ms)
      this.resumes.push(resolve)
      signal.addEventListener('abort', () => reject(new Error('Stopped.')))
    })

  timer = (_ms: number, work: () => void): (() => void) => {
    const job = { work, live: true }
    this.watchdogs.push(job)
    return () => (job.live = false)
  }

  resume(): void {
    this.resumes.shift()?.()
  }

  /** The live watchdog fires. */
  stall(): boolean {
    const job = this.watchdogs.filter((one) => one.live).pop()
    if (!job) return false
    job.live = false
    job.work()
    return true
  }

  get armed(): boolean {
    return this.watchdogs.some((one) => one.live)
  }
}

describe('following the server’s record (`MigrationRelay`)', () => {
  it('reads again 3 s after a stream ends, from where it stopped, and keeps the last finished step', async () => {
    const streams = new Streams()
    const timers = new Timers()
    const relay = new MigrationRelay(streams.open, timers.wait, timers.timer)
    const heard: string[] = []
    relay.listen((event) => heard.push(event.phase))
    relay.start()
    await eventually(() => streams.offsets.length === 1)
    expect(streams.offsets).toEqual([''])
    streams.push({ phase: 2, operationId: 'op', offsetKey: '7' })
    await eventually(() => heard.length === 1)
    expect(relay.status?.phase).toBe('creating')
    // A step under way: the watchdog is armed.
    expect(timers.armed).toBe(true)
    streams.push({ phase: 6, operationId: 'op', offsetKey: '8' })
    await eventually(() => heard.length === 2)
    expect(timers.armed).toBe(false)
    streams.end()
    await eventually(() => timers.waits.length === 1)
    expect(timers.waits).toEqual([3_000])
    // Between two reads, the last finished step is what is read back.
    expect(relay.status?.phase).toBe('done')
    timers.resume()
    await eventually(() => streams.offsets.length === 2)
    expect(streams.offsets).toEqual(['', '8'])
    relay.stop()
  })

  it('a stream that fails before anything came starts over from the beginning', async () => {
    const streams = new Streams()
    const timers = new Timers()
    const relay = new MigrationRelay(streams.open, timers.wait, timers.timer)
    relay.start()
    await eventually(() => streams.offsets.length === 1)
    streams.push({ phase: 1, operationId: 'op', offsetKey: '3' })
    streams.end()
    await eventually(() => timers.waits.length === 1)
    timers.resume()
    await eventually(() => streams.offsets.length === 2)
    streams.end(new Error('refused'))
    await eventually(() => timers.waits.length === 2)
    timers.resume()
    await eventually(() => streams.offsets.length === 3)
    expect(streams.offsets).toEqual(['', '3', ''])
    relay.stop()
  })

  it('a silent stream while a step is under way is read again, twenty times at most', async () => {
    const streams = new Streams()
    const timers = new Timers()
    const relay = new MigrationRelay(streams.open, timers.wait, timers.timer)
    relay.start()
    await eventually(() => streams.offsets.length === 1)
    relay.recreateAccepted('op')
    expect(timers.armed).toBe(true)
    let reads = 1
    for (let i = 0; i < 20; i += 1) {
      expect(timers.stall()).toBe(true)
      await eventually(() => timers.waits.length === reads)
      timers.resume()
      reads += 1
      await eventually(() => streams.offsets.length === reads)
    }
    // The twenty-first silence gives up watching (the stream is still read every time it ends).
    expect(timers.stall()).toBe(true)
    expect(timers.armed).toBe(false)
    relay.stop()
  })
})
