// How the app talks HTTP (ios/SimeonCore/Sources/SimeonCore/HTTP.swift): fetch
// in the app, a script in the tests.

import { type JSONValue, parseJSON } from './json'
import { note } from './recentActivity'

export interface HTTPRequest {
  url: string
  method: string
  headers: Record<string, string>
  body?: string | Uint8Array
  /**
   * Seconds. For `send`, how long the whole call may take (URLSession's
   * `timeoutInterval`); for `stream`, how long the stream may stay silent.
   */
  timeoutSeconds?: number
  /** Send the website's cookie (the web sign-in only). */
  credentials?: 'include'
}

/** One answer, read whole. */
export interface HTTPAnswer {
  status: number
  headers: Record<string, string>
  text: string
}

/** One answer whose body arrives as it is written (the event stream). */
export interface HTTPStream {
  status: number
  headers: Record<string, string>
  body: AsyncIterable<Uint8Array>
}

export interface HTTPClient {
  send(request: HTTPRequest, signal?: AbortSignal): Promise<HTTPAnswer>
  stream(request: HTTPRequest, signal?: AbortSignal): Promise<HTTPStream>
}

/**
 * The call got no answer: `unreachable` surely never reached the other end
 * (no connection, no such host), `timedOut` may have been done, `cancelled`
 * was ended here.
 */
export class NetworkError extends Error {
  constructor(
    message: string,
    readonly kind: 'unreachable' | 'timedOut' | 'cancelled',
  ) {
    super(message)
    this.name = 'NetworkError'
  }
}

export function isOk(answer: { status: number }): boolean {
  return answer.status >= 200 && answer.status < 300
}

export function answerJSON(answer: HTTPAnswer): JSONValue | undefined {
  return parseJSON(answer.text)
}

/** One header, whatever case it came in. */
export function headerOf(
  headers: Record<string, string>,
  name: string,
): string | undefined {
  const wanted = name.toLowerCase()
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === wanted) return value
  }
  return undefined
}

/** A request with a JSON body (`URLRequest.post`). */
export function postJSON(
  url: string,
  json: JSONValue,
  headers: Record<string, string> = {},
): HTTPRequest {
  return {
    url,
    method: 'POST',
    body: JSON.stringify(json),
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      ...headers,
    },
  }
}

function headersOf(response: Response): Record<string, string> {
  const out: Record<string, string> = {}
  response.headers.forEach((value, key) => {
    out[key] = value
  })
  return out
}

function failure(error: unknown, signal?: AbortSignal): NetworkError {
  if (signal?.aborted) return new NetworkError('Cancelled.', 'cancelled')
  if (error instanceof DOMException && error.name === 'TimeoutError') {
    return new NetworkError('The request timed out.', 'timedOut')
  }
  if (error instanceof NetworkError) return error
  return new NetworkError(
    error instanceof Error ? error.message : String(error),
    'unreachable',
  )
}

/**
 * Render's edge firewall, in front of Simeon Labs' server
 * (`EdgeFirewall` in ios/SimeonCore/Sources/SimeonCore/HTTP.swift): it reads
 * the start of each request's body and refuses words that look like an
 * attack (shell commands, code) with its own HTML page, a 403 titled
 * "Blocked", before the request reaches the server. Measured from the
 * founder's Mac on 12 November 2026: a long message with commands in it was
 * refused, and it said "Failed to send" again on every resend; the same
 * message in base64 passed. The server reads a body sent in base64 as it was
 * written (`EncodedBodyMiddleware` in server/simeon/middlewares.py), so a body
 * the edge refused is sent once more that way. Every other answer is kept as
 * it came.
 */
export const edgeFirewall = {
  /** The body's encoding, for the server: "base64". */
  encodingHeader: 'x-simeon-body',
  /** The body's own type, which the server puts back. */
  typeHeader: 'x-simeon-content-type',
  /** The largest body sent again: the server reads 16 MB of base64 at most, which is 12 MB before. */
  largestResent: 12 << 20,
}

/** The edge's refusal: a 403 with an HTML page, by its type or its first words. The server and the computers behind it answer JSON. */
export function edgeRefused(answer: {
  status: number
  headers: Record<string, string>
  text?: string
}): boolean {
  if (answer.status !== 403) return false
  const type = (headerOf(answer.headers, 'content-type') ?? '').toLowerCase()
  const start = (answer.text ?? '').slice(0, 64).trimStart().toLowerCase()
  return (
    type.includes('text/html') ||
    start.startsWith('<!doctype html') ||
    start.startsWith('<html')
  )
}

/** Bytes as base64, a piece at a time (a long message passes `String.fromCharCode`'s limit). */
function base64Of(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

/** `request` with its body in base64 and its own type named; undefined when it has no body, one too large, or is encoded already. */
export function edgeEncoded(request: HTTPRequest): HTTPRequest | undefined {
  if (
    request.body == null ||
    headerOf(request.headers, edgeFirewall.encodingHeader) != null
  )
    return undefined
  const bytes =
    typeof request.body === 'string'
      ? new TextEncoder().encode(request.body)
      : request.body
  if (bytes.length === 0 || bytes.length > edgeFirewall.largestResent)
    return undefined
  const headers: Record<string, string> = {}
  for (const [name, value] of Object.entries(request.headers)) {
    if (name.toLowerCase() !== 'content-type') headers[name] = value
  }
  headers[edgeFirewall.typeHeader] =
    headerOf(request.headers, 'content-type') ?? 'application/json'
  headers[edgeFirewall.encodingHeader] = 'base64'
  headers['content-type'] = 'text/plain'
  return { ...request, headers, body: base64Of(bytes) }
}

/**
 * `request` sent by `send`, and once more in base64 when the edge refused its
 * body: the edge stopped it, so it was never done. In a browser the edge's
 * page may come without the headers that let the window read it across
 * origins; then fetch only says it could not reach the server (`unreachable`),
 * so a body that failed that way is sent once more too, as the gateway already
 * resends a call that surely never arrived (`neverArrived`).
 */
export async function sendPastEdge(
  request: HTTPRequest,
  send: (request: HTTPRequest) => Promise<HTTPAnswer>,
): Promise<HTTPAnswer> {
  let answer: HTTPAnswer | undefined
  let unreachable: NetworkError | undefined
  try {
    answer = await send(request)
  } catch (error) {
    if (!(error instanceof NetworkError) || error.kind !== 'unreachable')
      throw error
    unreachable = error
  }
  if (answer && !edgeRefused(answer)) return answer
  const again = edgeEncoded(request)
  if (!again) {
    if (answer) return answer
    throw unreachable
  }
  let path = request.url
  try {
    path = new URL(request.url).pathname
  } catch {
    // A relative address is its own path.
  }
  const why = answer ? 'edge refused' : 'unreachable'
  try {
    const second = await send(again)
    note(
      `${why} ${request.method} ${path}: sent again in base64, answered ${second.status}`,
    )
    return second
  } catch (error) {
    note(`${why} ${request.method} ${path}: sent again in base64, failed again`)
    throw error
  }
}

/** fetch, in the browser and in Electron's window. */
export class FetchClient implements HTTPClient {
  constructor(
    private readonly doFetch: typeof fetch = (input, init) =>
      fetch(input, init),
  ) {}

  /** `request` sent, and once more in base64 when the edge in front of Simeon Labs' server refuses its body (`sendPastEdge`). */
  send(request: HTTPRequest, signal?: AbortSignal): Promise<HTTPAnswer> {
    return sendPastEdge(request, (next) => this.sendOnce(next, signal))
  }

  private async sendOnce(
    request: HTTPRequest,
    signal?: AbortSignal,
  ): Promise<HTTPAnswer> {
    const signals = [
      signal,
      AbortSignal.timeout((request.timeoutSeconds ?? 60) * 1000),
    ]
    const combined = AbortSignal.any(
      signals.filter((s): s is AbortSignal => s != null),
    )
    try {
      const response = await this.doFetch(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body as BodyInit | undefined,
        credentials: request.credentials ?? 'omit',
        signal: combined,
      })
      return {
        status: response.status,
        headers: headersOf(response),
        text: await response.text(),
      }
    } catch (error) {
      throw failure(combined.aborted ? combined.reason : error, signal)
    }
  }

  async stream(
    request: HTTPRequest,
    signal?: AbortSignal,
  ): Promise<HTTPStream> {
    const ended = new AbortController()
    const stop = () => ended.abort()
    signal?.addEventListener('abort', stop, { once: true })
    const silence = (request.timeoutSeconds ?? 35) * 1000
    let timer: ReturnType<typeof setTimeout> | undefined
    const watch = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(
        () => ended.abort(new DOMException('Silent too long.', 'TimeoutError')),
        silence,
      )
    }
    watch()
    let response: Response
    try {
      response = await this.doFetch(request.url, {
        method: request.method,
        headers: request.headers,
        credentials: request.credentials ?? 'omit',
        signal: ended.signal,
      })
    } catch (error) {
      if (timer) clearTimeout(timer)
      throw failure(ended.signal.reason ?? error, signal)
    }
    const reader = response.body?.getReader()
    async function* chunks(): AsyncGenerator<Uint8Array> {
      try {
        while (reader) {
          watch()
          const { done, value } = await reader.read()
          if (done) return
          if (value) yield value
        }
      } catch (error) {
        throw failure(ended.signal.reason ?? error, signal)
      } finally {
        if (timer) clearTimeout(timer)
        signal?.removeEventListener('abort', stop)
        reader?.cancel().catch(() => {})
      }
    }
    return {
      status: response.status,
      headers: headersOf(response),
      body: chunks(),
    }
  }
}
