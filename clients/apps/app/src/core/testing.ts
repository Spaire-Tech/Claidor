// Fakes for the tests, as the shared core's tests have them
// (ios/SimeonCore/Tests/SimeonCoreTests: `ScriptedHTTP`, `Unanswered`,
// `GatewayConnectTests.Routes`, `Clock`).

import { MemoryVault, SimeonAPI, SimeonAPIError } from './api'
import type {
  AgentBackend,
  AttachmentRef,
  BackendEvent,
  SendOptions,
  TranscriptPage,
} from './backend'
import { Entry } from './entry'
import { Gateway, GatewayConnection } from './gateway'
import { GatewayError } from './gatewayConnection'
import type { HTTPAnswer, HTTPClient, HTTPRequest, HTTPStream } from './http'
import { NetworkError } from './http'
import type { JSONValue } from './json'
import type { Agent } from './models'
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

/**
 * A computer that answers as told, and a server whose copy comes when told
 * (the core's tests' `ScriptedBackend` and `QuietBackend`): one chat's lines,
 * paged by their place (`seq`), sends that fail on demand, and the events a
 * test pushes.
 */
export class FakeBackend implements AgentBackend {
  agents: Agent[] = []
  lines: JSONValue[] = [
    {
      kind: 'message',
      id: 'u1',
      role: 'user',
      content: 'Hi Theo',
      timestampMs: 1_000,
    },
  ]
  /** What was sent, with what went with it. */
  sent: {
    text: string
    options: SendOptions
    nonce?: string
    agentId: string
  }[] = []
  failSends = false
  /** The fetch of the chat fails (`transcriptPage`). */
  failLoads = false
  /** The fetch of the chat says the computer rests. */
  resting = false
  /** The chats opened on the host (`openAgentTail`), read without opening (`tail`), and marked read. */
  opened: string[] = []
  tailed: string[] = []
  read: string[] = []
  /** Each command, with its arguments, and whether it may wake a computer that rests. */
  commands: { method: string; args: JSONValue; wakes: boolean }[] = []
  /** The computer's answer to a command, by its name (`{}` otherwise). */
  commandAnswers: Record<string, (args: JSONValue) => JSONValue> = {}
  /** Each call to the server, with its method and body. */
  serverCalls: { path: string; method?: string; body?: JSONValue }[] = []
  /** The server refuses every call when set. */
  serverFails = false
  wakings = 0
  /** The list fails with this, when set. */
  listError?: unknown
  listDelayMs = 0
  serverAnswers: Record<string, JSONValue> = {}
  serverDelayMs = 0
  serverPaths: string[] = []
  emit?: (event: BackendEvent) => void

  async listAgents(): Promise<Agent[]> {
    await ms(this.listDelayMs)
    if (this.listError) throw this.listError
    return this.agents
  }
  async server(
    path: string,
    method?: string,
    body?: JSONValue,
  ): Promise<JSONValue> {
    this.serverPaths.push(path)
    this.serverCalls.push({ path, method, body })
    await ms(this.serverDelayMs)
    if (this.serverFails) throw new SimeonAPIError('Refused.', 500)
    const found = this.serverAnswers[path]
    if (found === undefined) throw new SimeonAPIError('No such path.', 404)
    return found
  }
  /** The commands the computer refuses. */
  refusedCommands = new Set<string>()
  async command(
    method: string,
    args: JSONValue = {},
    options: { wakes?: boolean } = {},
  ): Promise<JSONValue> {
    this.commands.push({ method, args, wakes: options.wakes ?? true })
    this.beforeAnswer?.(method)
    if (this.refusedCommands.has(method))
      throw new GatewayError("The computer didn't answer.", true)
    return this.commandAnswers[method]?.(args) ?? {}
  }
  /** A read that waits for a resting computer: recorded as one that lets it rest. */
  async commandWhenAwake(
    method: string,
    args: JSONValue = {},
  ): Promise<JSONValue> {
    return this.command(method, args, { wakes: false })
  }
  /** Told of each command before it is answered (what the chat showed then). */
  beforeAnswer?: (method: string) => void
  async transcriptPage(
    agentId: string,
    before?: number,
  ): Promise<TranscriptPage> {
    if (before == null) this.opened.push(agentId)
    await ms(0)
    if (this.resting) throw GatewayError.resting()
    if (this.failLoads) throw new GatewayError('offline', false)
    const end = before ?? this.lines.length
    const size = before == null ? 500 : 100
    const start = Math.max(0, end - size)
    return {
      entries: Entry.list(this.lines.slice(start, end)),
      olderBefore: start > 0 ? start : undefined,
    }
  }
  async tail(agentId: string, limit: number): Promise<Entry[]> {
    this.tailed.push(agentId)
    return Entry.list(this.lines).slice(-limit)
  }
  async send(
    agentId: string,
    text: string,
    _attachments: AttachmentRef[],
    options: SendOptions,
    nonce?: string,
  ): Promise<void> {
    await ms(0)
    if (this.failSends) throw new GatewayError('offline', false)
    this.sent.push({ agentId, text, options, nonce })
  }
  async markRead(agentId: string): Promise<void> {
    this.read.push(agentId)
  }
  computerWaking(): void {
    this.wakings += 1
  }
  /** An event from the host, as the stream would bring it. */
  push(event: BackendEvent): void {
    this.emit?.(event)
  }
  async computerRest() {
    return null
  }
  events(
    onEvent: (event: BackendEvent) => void,
    signal: AbortSignal,
  ): Promise<void> {
    this.emit = onEvent
    return new Promise((resolve) =>
      signal.addEventListener('abort', () => resolve()),
    )
  }
}
