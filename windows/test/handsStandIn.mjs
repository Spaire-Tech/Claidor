// A stand-in for the person's computer's side of the agent's hands (the
// engine's host/extensions/local-exec/local-exec-bridge.ts, as the gateway
// serves it): `GET /box/local-exec/requests` keeps a server-sent events
// stream open, welcomes the PC and sends the requests a test pushes;
// `POST /box/local-exec/responses` takes the PC's batches. Only on
// 127.0.0.1; the tokens are fakes. Used by test/hands.test.ts on its own
// server, and by a check through standIn.mjs's `routes`.

import { createServer } from 'node:http'

export const requestsPath = '/box/local-exec/requests'
export const responsesPath = '/box/local-exec/responses'

export function handsGateway({ providerId = 'p1' } = {}) {
  const state = {
    /** Each stream opened: whether it came with the gateway's bearer. */
    streams: [],
    /** Every batch posted, as it came. */
    batches: [],
    /** Every frame posted, in order. */
    frames: [],
  }
  const open = new Set()
  const waiters = new Set()
  const settle = () => {
    for (const waiter of [...waiters]) waiter()
  }

  return {
    state,
    get openStreams() {
      return open.size
    },
    /** Holds a stream open (`routes`' `stream`): the welcome first, then what is pushed. */
    stream(response, headers = {}, authorized = true) {
      state.streams.push({ authorized })
      if (!authorized) {
        response.writeHead(401, { 'content-type': 'application/json', ...headers })
        response.end('{"error":"unauthorized"}')
        return
      }
      response.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-store',
        ...headers,
      })
      response.write(`retry: 1000\n\ndata: ${JSON.stringify({ kind: 'welcome', providerId })}\n\n`)
      open.add(response)
      response.on('close', () => {
        open.delete(response)
        settle()
      })
      settle()
    },
    /** A batch posted by the PC. */
    take(batch, authorized = true) {
      state.batches.push({ ...batch, authorized })
      for (const frame of batch?.frames ?? []) state.frames.push(frame)
      settle()
    },
    /** Sends a request to every open stream. */
    push(frame) {
      for (const response of open) response.write(`data: ${JSON.stringify(frame)}\n\n`)
    },
    /** Ends every open stream, as the computer closing it. */
    closeStreams() {
      for (const response of [...open]) response.end()
    },
    /** Waits until `ready()` says something (resolves with it), or fails after `ms`: looked at as the PC posts, and every 50 ms (a file, a process). */
    waitFor(ready, ms = 15_000, what = 'the hands') {
      return new Promise((resolve, reject) => {
        const check = () => {
          const value = ready()
          if (value) {
            clearTimeout(timer)
            clearInterval(poll)
            waiters.delete(check)
            resolve(value)
          }
        }
        const timer = setTimeout(() => {
          clearInterval(poll)
          waiters.delete(check)
          reject(new Error(`Waited ${ms} ms for ${what}.`))
        }, ms)
        const poll = setInterval(check, 50)
        waiters.add(check)
        check()
      })
    },
    /** The frames answering one request. */
    framesFor(requestId) {
      return state.frames.filter((frame) => frame.requestId === requestId)
    },
  }
}

/** The gateway's two paths as routes for standIn.mjs (the page's computer is at `${base}/box`; its token, a fake, comes as the bearer). */
export function handsRoutes(gateway) {
  return (record, args) => {
    if (record.path === requestsPath && record.method === 'GET')
      return { stream: (response, headers) => gateway.stream(response, headers, record.bearer) }
    if (record.path === responsesPath && record.method === 'POST') {
      gateway.take(args, record.bearer)
      return { json: {} }
    }
    return undefined
  }
}

/** The gateway on a server of its own (the unit tests). */
export async function startHandsGateway(options = {}) {
  const gateway = handsGateway(options)
  const token = options.token ?? 'fake-gateway'
  const server = createServer(async (request, response) => {
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    const authorized = request.headers.authorization === `Bearer ${token}`
    if (url.pathname === requestsPath && request.method === 'GET') return gateway.stream(response, {}, authorized)
    if (url.pathname === responsesPath && request.method === 'POST') {
      let batch = {}
      try {
        batch = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      } catch {
        batch = {}
      }
      gateway.take(batch, authorized)
      response.writeHead(200, { 'content-type': 'application/json' })
      return response.end('{}')
    }
    response.writeHead(404)
    response.end()
  })
  await new Promise((done) => server.listen(0, '127.0.0.1', done))
  const base = `http://127.0.0.1:${server.address().port}`
  return {
    gateway,
    base,
    target: { baseURL: `${base}/box`, headers: { authorization: `Bearer ${token}` } },
    close: () =>
      new Promise((done) => {
        gateway.closeStreams()
        server.closeAllConnections?.()
        server.close(done)
      }),
  }
}
