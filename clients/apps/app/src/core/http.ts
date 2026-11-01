// How the app talks HTTP (ios/SimeonCore/Sources/SimeonCore/HTTP.swift): fetch
// in the app, a script in the tests.

import { type JSONValue, parseJSON } from './json'

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

/** fetch, in the browser and in Electron's window. */
export class FetchClient implements HTTPClient {
  constructor(
    private readonly doFetch: typeof fetch = (input, init) =>
      fetch(input, init),
  ) {}

  async send(request: HTTPRequest, signal?: AbortSignal): Promise<HTTPAnswer> {
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
