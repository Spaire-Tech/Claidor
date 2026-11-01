// Fakes for the tests, as the shared core's tests have them
// (ios/SimeonCore/Tests/SimeonCoreTests: `ScriptedHTTP`, `Unanswered`,
// `GatewayConnectTests.Routes`, `Clock`).

import { MemoryVault, SimeonAPI } from './api'
import { Gateway, GatewayConnection } from './gateway'
import type { HTTPAnswer, HTTPClient, HTTPRequest, HTTPStream } from './http'
import { NetworkError } from './http'
import { type SavedGatewayStore, encodeSavedGateway } from './savedGateway'
import { base64URL } from './tokens'

export function answer(
  status: number,
  body = '',
  headers: Record<string, string> = {},
): HTTPAnswer {
  return { status, headers, text: body }
}

function noStream(): Promise<HTTPStream> {
  return Promise.reject(new NetworkError('No stream here.', 'unreachable'))
}

/** A scripted server: each request gets the next answer, and is kept for the test to read. */
export class ScriptedHTTP implements HTTPClient {
  readonly sent: HTTPRequest[] = []
  constructor(
    private readonly answers: ((request: HTTPRequest) => HTTPAnswer)[],
  ) {}

  async send(request: HTTPRequest): Promise<HTTPAnswer> {
    this.sent.push(request)
    const next = this.answers.shift()
    return next ? next(request) : answer(500)
  }

  stream = noStream
}

/** A server whose first answer never comes (the request times out); the next requests get the scripted answers. */
export class Unanswered implements HTTPClient {
  private first = true
  private readonly timedOut: HTTPRequest[] = []
  private readonly rest: ScriptedHTTP

  constructor(then: ((request: HTTPRequest) => HTTPAnswer)[]) {
    this.rest = new ScriptedHTTP(then)
  }

  async send(request: HTTPRequest): Promise<HTTPAnswer> {
    if (this.first) {
      this.first = false
      this.timedOut.push(request)
      throw new NetworkError('The request timed out.', 'timedOut')
    }
    return this.rest.send(request)
  }

  get sent(): HTTPRequest[] {
    return [...this.timedOut, ...this.rest.sent]
  }

  stream = noStream
}

/** A server that answers by the address's ending, in any order, and keeps every request. */
export class Routes implements HTTPClient {
  private handlers: [string, (request: HTTPRequest) => HTTPAnswer][] = []
  readonly requests: HTTPRequest[] = []
  /** The event stream's answer, when the test gives one. */
  streams: ((
    request: HTTPRequest,
    signal?: AbortSignal,
  ) => Promise<HTTPStream>)[] = []

  on(suffix: string, handler: (request: HTTPRequest) => HTTPAnswer): void {
    this.handlers.unshift([suffix, handler])
  }

  async send(request: HTTPRequest): Promise<HTTPAnswer> {
    this.requests.push(request)
    const handler = this.handlers.find(([suffix]) =>
      request.url.endsWith(suffix),
    )
    return handler ? handler[1](request) : answer(500)
  }

  async stream(
    request: HTTPRequest,
    signal?: AbortSignal,
  ): Promise<HTTPStream> {
    this.requests.push(request)
    const next = this.streams.shift()
    if (!next) throw new NetworkError('No stream here.', 'unreachable')
    return next(request, signal)
  }

  get sent(): string[] {
    return this.requests.map((request) => request.url)
  }

  count(suffix: string): number {
    return this.sent.filter((url) => url.endsWith(suffix)).length
  }
}

/** Seconds that move only when the test says. */
export class Clock {
  seconds = 1_000
  now = () => this.seconds
  advance(by: number) {
    this.seconds += by
  }
}

export const ensure = '/simeon.v1.ComputerService/EnsureSandBox'
export const runState = '/simeon.v1.ComputerService/GetSandBoxRunState'

/** An access token as the server wraps it (`envelope_access_token`), for account `sub`. */
export function tokenFor(sub: string): string {
  const payload = base64URL(
    new TextEncoder().encode(JSON.stringify({ sub, exp: 9e9 })),
  )
  return `simeon_da_eyJhbGciOiJIUzI1NiJ9.${payload}.sig`
}

export function box(host: string): string {
  return JSON.stringify({
    gatewayUrl: `https://${host}`,
    gatewayToken: `g-${host}`,
    networkToken: `n-${host}`,
  })
}

export function kept(
  host: string,
  account: string,
  savedAt: Date = new Date(),
): string {
  return encodeSavedGateway(
    new GatewayConnection({
      baseURL: `https://${host}`,
      token: `g-${host}`,
      networkToken: `n-${host}`,
    }),
    account,
    savedAt,
  )
}

export function makeGateway(
  http: HTTPClient,
  options: {
    account?: string
    saved?: SavedGatewayStore
    clock?: Clock
    pause?: (seconds: number, signal?: AbortSignal) => Promise<void>
  } = {},
): Gateway {
  const vault = new MemoryVault({
    accessToken: tokenFor(options.account ?? 'u1'),
    refreshToken: 'r',
    expiresAtMs: 9e15,
  })
  const api = new SimeonAPI({
    base: 'https://api.example.com',
    clientVersion: '1',
    vault,
    http,
    language: 'en',
  })
  return new Gateway({
    api,
    http,
    saved: options.saved,
    clock: (options.clock ?? new Clock()).now,
    pause: options.pause,
  })
}

/** Waits (a little) for something that happens in the background. */
export async function eventually(condition: () => boolean): Promise<void> {
  for (let i = 0; i < 200 && !condition(); i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

export const ms = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
