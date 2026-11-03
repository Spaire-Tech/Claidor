// A connector's sign-in that comes back only to this PC's loopback
// (ios/SimeonCore's LoopbackSignIn.swift and its `LoopbackCatcher`): Canva,
// Square, Vercel and Dropbox refuse Simeon Labs' hosted return address, so
// the cloud computer asks them for `http://localhost:8787/callback`, and the
// app listens there while the sign-in is open. This sign-in's callback is
// answered once, sent on to the app's own address (`simeon://connected`,
// which brings the app forward and ends the sign-in's wait); everything
// else gets 404. Only this PC's own loopback (127.0.0.1 and ::1) is
// listened on: nothing on the network reaches it, and Windows' firewall
// doesn't ask about it. Both addresses must be had (browsers try ::1 first
// for `localhost`): one held by another program means the address is busy,
// as the core's one listener on the loopback; ::1 is left out only on a PC
// with no IPv6 at all (review of 2 November 2026).

import net from 'node:net'

export const loopbackPort = 8787
export const loopbackPath = '/callback'
/** Where the sign-in's last page is sent on: the app's own address. */
export const loopbackFinish = 'simeon://connected'
/** A request's head is read up to this much (the callback is a GET with no body). */
export const headLimit = 16_384

/** What the maker sent back: the code, or its refusal, with the sign-in's state (`LoopbackSignIn.Answer`). */
export interface LoopbackAnswer {
  state: string
  code?: string
  error?: string
  errorDescription?: string
}

/** One `name=value` of a query, as `URLComponents.queryItems` reads it: `%` decoded, a "+" left a "+". */
function items(query: string): { name: string; value?: string }[] {
  const decoded = (part: string) => {
    try {
      return decodeURIComponent(part)
    } catch {
      return part
    }
  }
  return (query === '' ? [] : query.split('&')).map((piece) => {
    const at = piece.indexOf('=')
    return at < 0
      ? { name: decoded(piece) }
      : { name: decoded(piece.slice(0, at)), value: decoded(piece.slice(at + 1)) }
  })
}

/** The callback in a request's head (`GET /callback?code=…&state=… HTTP/1.1`); none for anything else, the favicon too (`answer(requestHead:)`). */
export function answerFrom(requestHead: string): LoopbackAnswer | undefined {
  const line = requestHead.split(/\r?\n/)[0] ?? ''
  const parts = line.split(' ').filter((part) => part !== '')
  if (parts.length < 2 || parts[0] !== 'GET') return undefined
  const target = parts[1] ?? ''
  if (!target.startsWith('/')) return undefined
  const question = target.indexOf('?')
  const path = question < 0 ? target : target.slice(0, question)
  if (path !== loopbackPath) return undefined
  const query = items(question < 0 ? '' : target.slice(question + 1))
  const value = (name: string) => {
    const found = query.find((item) => item.name === name)?.value
    return found != null && found !== '' ? found : undefined
  }
  const state = value('state')
  if (state == null) return undefined
  const answer: LoopbackAnswer = { state }
  const code = value('code')
  const error = value('error')
  // The sentence comes form-encoded ("An+unexpected+error", Miro's); the code is left as sent.
  const errorDescription = value('error_description')?.replaceAll('+', ' ')
  if (code != null) answer.code = code
  if (error != null) answer.error = error
  if (errorDescription != null) answer.errorDescription = errorDescription
  return answer
}

/** The answer to the sign-in's page: on to `location`, the app's own address (`redirect(to:)`). */
export function redirect(location: string): Buffer {
  return Buffer.from(
    `HTTP/1.1 302 Found\r\nLocation: ${location}\r\nCache-Control: no-store\r\nContent-Length: 0\r\nConnection: close\r\n\r\n`,
  )
}

/** The answer to anything that is not this sign-in's callback. */
export const notFound = Buffer.from(
  'HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n',
)

/** Where the listener listens: this PC's own loopback, IPv4 first (`localhost` is both). */
export const loopbackHosts = ['127.0.0.1', '::1'] as const

/** One address listened on, or why not (Node's error code). */
export type Bind = (port: number, host: string) => Promise<{ server: net.Server } | { error: string }>

/** The errors that mean this PC has no such address (no IPv6), not that another program holds it. */
export const noSuchAddress = new Set(['EADDRNOTAVAIL', 'EAFNOSUPPORT'])

/**
 * The loopback listener for one sign-in: it answers this sign-in's
 * callback once (on to `finish`), refuses everything else, and stops when
 * the sign-in does.
 */
export class LoopbackCatcher {
  private caught = false
  private stopped = false

  private constructor(
    readonly state: string,
    private readonly finish: string,
    private readonly servers: net.Server[],
    private readonly onAnswer: (answer: LoopbackAnswer) => void,
  ) {
    for (const server of servers) server.on('connection', (socket) => this.serve(socket))
  }

  /**
   * Listening for the sign-in whose state is `state`; none when the address
   * stays taken. Tried five times over about a second: the listener of a
   * sign-in this one replaced may still be letting go of it.
   */
  static async start(
    state: string,
    onAnswer: (answer: LoopbackAnswer) => void,
    options: { port?: number; finish?: string; hosts?: readonly string[]; bind?: Bind; retryMs?: number } = {},
  ): Promise<LoopbackCatcher | undefined> {
    const port = options.port ?? loopbackPort
    const hosts = options.hosts ?? loopbackHosts
    const bind = options.bind ?? listen
    tries: for (let attempt = 0; attempt < 5; attempt += 1) {
      if (attempt > 0) await new Promise((done) => setTimeout(done, options.retryMs ?? 250))
      const servers: net.Server[] = []
      // IPv4's loopback must be had; IPv6's too, unless this PC has none.
      for (const [index, host] of hosts.entries()) {
        const bound = await bind(port, host)
        if ('server' in bound) {
          servers.push(bound.server)
          continue
        }
        if (index > 0 && noSuchAddress.has(bound.error)) continue
        // Held by another program (or refused): busy this time; what was had is let go.
        for (const server of servers) server.close()
        continue tries
      }
      return new LoopbackCatcher(state, options.finish ?? loopbackFinish, servers, onAnswer)
    }
    return undefined
  }

  /** Stops listening (the sign-in ended, or another took its place). */
  stop(): void {
    if (this.stopped) return
    this.stopped = true
    for (const server of this.servers) server.close()
  }

  get listening(): boolean {
    return !this.stopped
  }

  /** The request's head, read until its first line is whole, then answered and closed. */
  private serve(socket: net.Socket): void {
    let head = Buffer.alloc(0)
    let answered = false
    socket.setTimeout(10_000, () => socket.destroy())
    socket.on('error', () => socket.destroy())
    const reply = (bytes: Buffer) => {
      answered = true
      socket.end(bytes)
    }
    const done = () => {
      if (answered) return
      const text = head.toString('utf8')
      const answer = answerFrom(text)
      if (!answer || answer.state !== this.state || this.caught || this.stopped) {
        reply(notFound)
        return
      }
      this.caught = true
      reply(redirect(this.finish))
      this.onAnswer(answer)
    }
    socket.on('data', (data: Buffer) => {
      if (answered) return
      head = Buffer.concat([head, data])
      if (head.includes(0x0a) || head.length >= headLimit) done()
    })
    socket.on('end', done)
  }
}

const listen: Bind = (port, host) =>
  new Promise((done) => {
    const server = net.createServer()
    const failed = (error: NodeJS.ErrnoException) => {
      server.close()
      done({ error: error.code ?? 'EUNKNOWN' })
    }
    server.once('error', failed)
    server.listen({ port, host, exclusive: true }, () => {
      server.off('error', failed)
      server.on('error', () => {})
      done({ server })
    })
  })
