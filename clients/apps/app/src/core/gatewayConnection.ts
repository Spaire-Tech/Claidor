// Where the person's cloud computer answers, and how its refusals read
// (`GatewayConnection` and `GatewayError` in
// ios/SimeonCore/Sources/SimeonCore/Gateway.swift).

import { SimeonAPIError } from './api'
import { type HTTPRequest, NetworkError, postJSON } from './http'
import { type JSONValue, bool, field, text } from './json'
import { t } from './l10n'

function trimmed(value: string): string {
  return value.replace(/\/+$/, '')
}

/** `EnsureSandBox`'s answer (`server/simeon/sand/box_broker.py`), as `connectionFromBox` reads it. */
export class GatewayConnection {
  static readonly apiPrefix = '/api'
  static readonly eventsPath = '/events'
  static readonly networkTokenHeader = 'x-anyrun-network-token'
  /** Said on every request when the server lets the box sleep while the app is open (`letsSleep`). */
  static readonly letsSleepHeader = 'x-simeon-lets-sleep'
  /** A stream silent this long is dead (`SSE_STALL_TIMEOUT_MS`); the host pings every 15 s. */
  static readonly stallSeconds = 35

  readonly baseURL: string
  readonly token?: string
  readonly networkToken?: string
  /** The cloud computer's screen through the proxy, when it has one. */
  readonly screenURL?: string
  /** Where each agent's own screen answers through the proxy (`forkVncBaseUrl`, the box's port 6081). */
  readonly forkScreenBase?: string
  /**
   * The server lets the box sleep while the app is open (26 October 2026,
   * the computer used only for runs): the app says so on its requests, so
   * being open does not keep the box awake. A kept address does not say
   * it: the broker's next answer does.
   */
  readonly letsSleep: boolean

  constructor(fields: {
    baseURL: string
    token?: string
    networkToken?: string
    screenURL?: string
    forkScreenBase?: string
    letsSleep?: boolean
  }) {
    this.baseURL = fields.baseURL
    this.token = fields.token
    this.networkToken = fields.networkToken
    this.screenURL = fields.screenURL
    this.forkScreenBase = fields.forkScreenBase
    this.letsSleep = fields.letsSleep ?? false
  }

  static fromBox(box: JSONValue | undefined): GatewayConnection {
    const base = text(field(box, 'gatewayUrl'))
    if (!base) {
      throw new SimeonAPIError(
        t(
          "Simeon's cloud computer has no gateway address yet. Try again in a moment.",
        ),
        0,
      )
    }
    const fork = text(field(box, 'forkVncBaseUrl'))
    return new GatewayConnection({
      baseURL: trimmed(base),
      token: text(field(box, 'gatewayToken')),
      networkToken: text(field(box, 'networkToken')),
      screenURL: text(field(box, 'vncUrl')),
      forkScreenBase: fork ? trimmed(fork) : undefined,
      letsSleep: bool(field(box, 'letsSleep')) === true,
    })
  }

  /**
   * The WebSocket of an agent's screen, from the address the box gives (noVNC's
   * page on loopback port 6080 or 6081, with the display's `token` inside its
   * `path`), through the proxy: only the stream, which the app's own noVNC
   * opens.
   */
  screenSocket(vncUrl: string): string | undefined {
    let page: URL
    try {
      page = new URL(vncUrl)
    } catch {
      return undefined
    }
    const wake = 'resume_lower_s=900&resume_upper_s=18000'
    const host = page.hostname
    if (host === '127.0.0.1' || host === 'localhost') {
      if (this.networkToken == null) return undefined
      if (page.port === '6081' && this.forkScreenBase != null) {
        const inner = page.searchParams.get('path') ?? ''
        const query = inner.split('?')[1]
        const token =
          query != null ? new URLSearchParams(query).get('token') : null
        const tokenParam = token != null ? `token=${token}&` : ''
        return GatewayConnection.socket(
          `${this.forkScreenBase}/websockify?${tokenParam}network_token=${this.networkToken}&${wake}`,
        )
      }
      if (page.port === '6080' && this.screenURL != null)
        return this.screenSocket(this.screenURL)
      return undefined
    }
    // A page already through the proxy: its folder, then its `path`.
    const path = page.searchParams.get('path')
    if (path == null) return undefined
    const folder = page.pathname.replace(/\/[^/]*$/, '')
    return GatewayConnection.socket(
      `${page.protocol}//${page.host}${trimmed(folder)}/${path}`,
    )
  }

  static socket(http: string): string {
    if (http.startsWith('https://')) return 'wss://' + http.slice(8)
    if (http.startsWith('http://')) return 'ws://' + http.slice(7)
    return http
  }

  headers(extra: Record<string, string> = {}): Record<string, string> {
    const headers = { ...extra }
    if (this.networkToken != null)
      headers[GatewayConnection.networkTokenHeader] = this.networkToken
    if (this.token != null) headers.authorization = `Bearer ${this.token}`
    if (this.letsSleep) headers[GatewayConnection.letsSleepHeader] = '1'
    return headers
  }

  commandRequest(method: string, args: JSONValue): HTTPRequest {
    const request = postJSON(
      `${this.baseURL}${GatewayConnection.apiPrefix}/${method}`,
      args,
      this.headers(),
    )
    request.timeoutSeconds = 60
    return request
  }

  /**
   * The event stream. The host pings every 15 s (`SSE_HEARTBEAT_MS`); a
   * stream silent for 35 s is dead (a laptop that slept), so it errors and
   * the loop dials again.
   */
  eventsRequest(): HTTPRequest {
    return {
      url: this.baseURL + GatewayConnection.eventsPath,
      method: 'GET',
      headers: this.headers({ accept: 'text/event-stream' }),
      timeoutSeconds: GatewayConnection.stallSeconds,
    }
  }
}

export class GatewayError extends Error {
  /** The box rests where the server lets it sleep, and this read did not wake it. */
  resting = false

  constructor(
    message: string,
    /** The host answered and refused (a 4xx): retrying the same call will not help. */
    readonly refused: boolean,
    /** The HTTP status, when the box answered at all. */
    readonly status?: number,
  ) {
    super(message)
    this.name = 'GatewayError'
  }

  /** A read that did not wake the resting box: the app shows what it kept instead, and says nothing went wrong. */
  static resting(): GatewayError {
    const error = new GatewayError("Simeon's computer is asleep.", false)
    error.resting = true
    return error
  }

  static isResting(error: unknown): boolean {
    return error instanceof GatewayError && error.resting
  }

  /**
   * Whether the call surely never reached the host: no connection, or the
   * box's front door answering for a box that moved (502, 503, 504). Only
   * then is it sent again; a call that timed out may have been done.
   */
  static neverArrived(error: unknown): boolean {
    if (error instanceof GatewayError)
      return [502, 503, 504].includes(error.status ?? 0)
    return error instanceof NetworkError && error.kind === 'unreachable'
  }
}
