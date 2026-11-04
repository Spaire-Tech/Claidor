// The agents' engine as the browser checks need it (`npm run browser-smoke`,
// `npm run mac-helper-smoke`): the local-browser line's two paths on a port
// of this computer, a welcome, steps sent as the engine sends them, and the
// answers kept. Nothing real is reached.

import http from 'node:http'

export function engine() {
  const waiting = new Map()
  const frames = []
  let stream
  let providerId
  let next = 1
  let helloSeen
  const hello = new Promise((done) => (helloSeen = done))
  const server = http.createServer((req, res) => {
    if (req.headers.authorization !== 'Bearer smoke-token') return res.writeHead(401).end()
    if (req.method === 'GET' && req.url === '/local-browser/requests') {
      providerId = `smoke-${next++}`
      stream = res
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.write(`data: ${JSON.stringify({ kind: 'welcome', providerId, protocol: 1, enabled: true })}\n\n`)
      // A keep-alive, as the engine's gateway sends one every 15 s (`openSseStream`).
      const beat = setInterval(() => res.write(': keep-alive\n\n'), 5_000)
      res.on('close', () => clearInterval(beat))
      return
    }
    if (req.method === 'POST' && req.url === '/local-browser/responses') {
      const chunks = []
      req.on('data', (chunk) => chunks.push(chunk))
      req.on('end', () => {
        const batch = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        for (const frame of batch.frames ?? []) {
          frames.push({ ...frame, providerId: batch.providerId })
          if (frame.kind === 'hello') helloSeen({ ...frame, providerId: batch.providerId })
          if (frame.kind === 'response') waiting.get(frame.requestId)?.(frame)
        }
        res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}')
      })
      return
    }
    res.writeHead(404).end()
  })
  let count = 0
  const send = (frame) => stream?.write(`data: ${JSON.stringify(frame)}\n\n`)
  return new Promise((done) =>
    server.listen(0, '127.0.0.1', () =>
      done({
        base: `http://127.0.0.1:${server.address().port}`,
        hello,
        frames,
        send,
        /** One browser step, as the engine sends it; its answer. */
        step(op, args = {}, { viewId = 'agent-a', screenshot = false, deadlineMs = 60_000, waitMs = 70_000 } = {}) {
          const requestId = `r${++count}`
          const answer = new Promise((resolve) => {
            waiting.set(requestId, resolve)
            setTimeout(() => resolve({ timedOut: true }), waitMs)
          })
          send({ kind: 'request', requestId, protocol: 1, op, viewId, args, screenshot, deadlineMs })
          return { requestId, answer }
        },
        close: () => {
          server.closeAllConnections()
          server.close()
        },
      }),
    ),
  )
}

