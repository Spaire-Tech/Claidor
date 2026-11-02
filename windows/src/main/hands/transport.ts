// How the hands talk to the person's computer: a stream read as it comes,
// and posts that wait at most so long. In the app, Electron's own network
// (`net.fetch`: Chromium's, with Windows' proxy settings and certificates,
// as the page's); in the tests, Node's.

export interface Transport {
  /** Opens the requests stream; its status, and its bytes as they come until it ends or `signal` aborts. */
  stream(
    url: string,
    headers: Record<string, string>,
    signal: AbortSignal,
  ): Promise<{ status: number; body: AsyncIterable<Uint8Array> }>
  /** Posts JSON; its status (0: not reached, with the failure's kind, never its words, which may name the address). */
  post(
    url: string,
    headers: Record<string, string>,
    body: string,
    timeoutMs: number,
  ): Promise<{ status: number; failure?: string }>
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>

async function* chunks(body: ReadableStream<Uint8Array> | null): AsyncIterable<Uint8Array> {
  if (!body) return
  const reader = body.getReader()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return
      if (value) yield value
    }
  } finally {
    reader.releaseLock()
  }
}

/** A transport over a WHATWG `fetch`. */
export function fetchTransport(fetcher: Fetch): Transport {
  return {
    async stream(url, headers, signal) {
      const response = await fetcher(url, {
        method: 'GET',
        headers: { ...headers, accept: 'text/event-stream', 'accept-encoding': 'identity' },
        signal,
        cache: 'no-store',
      })
      return { status: response.status, body: chunks(response.body) }
    },
    async post(url, headers, body, timeoutMs) {
      try {
        const response = await fetcher(url, {
          method: 'POST',
          headers: { ...headers, 'content-type': 'application/json' },
          body,
          signal: AbortSignal.timeout(timeoutMs),
          cache: 'no-store',
        })
        // Read to the end, so the connection is free for the next.
        await response.arrayBuffer().catch(() => undefined)
        return { status: response.status }
      } catch (error) {
        return { status: 0, failure: error instanceof Error ? error.name : 'Error' }
      }
    },
  }
}
