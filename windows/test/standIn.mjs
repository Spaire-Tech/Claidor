// A stand-in for Simeon Labs' server and the person's computer, for checks
// of the Windows app on this computer (scripts/smoke.mjs and each part's
// checks): a real HTTP server on 127.0.0.1, answering the routes the app
// calls at start with fixed data, and the server's CORS rule for the app's
// page (server/simeon/app.py: `app://simeon` gets every header and the
// exposed ones, no cookie; any other origin only Authorization and
// Content-Type). No real service is reached; every token here is a fake.

import { createServer } from 'node:http'

const b64 = (value) =>
  Buffer.from(JSON.stringify(value)).toString('base64url')

/** A fake access token the app reads as valid for years (core/tokens.ts reads its `exp`). */
export const fakeAccessToken = `simeon_da_${b64({ alg: 'none' })}.${b64({ sub: 'u1', exp: 9e9 })}.sig`
export const fakeRefreshToken = 'fake-refresh'

/** The pair as the page keeps it (`simeon.web.tokens`, core/api.ts). */
export const fakeKeptTokens = JSON.stringify({
  accessToken: fakeAccessToken,
  refreshToken: fakeRefreshToken,
  expiresAtMs: 9e12,
})

export const appPageOrigin = 'app://simeon'
const exposed = 'x-sand-mint-dedupe, x-automation-failure-hint, retry-after'

/** The agents and their lines the stand-in computer holds. */
export function computer(now = Date.now()) {
  const min = 60_000
  const agents = [
    { id: 'sam', name: 'Simeon', title: 'Chief of Staff', description: '', avatarShape: 'clay-simeon', lastActivityAt: now - 2 * min, createdAt: 1 },
    { id: 'iris', name: 'Iris', title: 'Travel', description: 'Books trips.', avatarShape: 'clay-06', lastActivityAt: now - min, createdAt: 2 },
    { id: 'theo', name: 'Theo', title: 'Ops', description: '', avatarShape: 'clay-12', lastActivityAt: now - 3 * min, createdAt: 3 },
  ]
  const lines = {
    iris: [
      { kind: 'message', id: 'u1', role: 'user', content: 'Find me a flight to Lisbon on Friday.', timestampMs: now - 30 * min },
      { kind: 'message', id: 'a1', role: 'assistant', content: 'On it.', timestampMs: now - 29 * min },
    ],
    sam: [],
    theo: [],
  }
  return { agents, lines, sent: [], queued: [] }
}

function corsHeaders(origin) {
  if (!origin) return {}
  if (origin === appPageOrigin)
    return {
      'access-control-allow-origin': origin,
      'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'access-control-expose-headers': exposed,
      vary: 'Origin',
    }
  return { 'access-control-allow-origin': '*' }
}

/**
 * Starts the stand-in. `routes` may answer a path first (each part's own
 * calls): `(request, body) => ({ status, json } | { status, text, type } | undefined)`,
 * or a promise of it (an answer that takes its time).
 */
export async function startStandIn({ routes } = {}) {
  const state = { requests: [], box: computer() }
  const server = createServer(async (request, response) => {
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const raw = Buffer.concat(chunks).toString('utf8')
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    const origin = request.headers.origin
    const record = {
      method: request.method,
      path: url.pathname,
      origin: origin ?? null,
      bearer: (request.headers.authorization ?? '').startsWith('Bearer '),
      client: request.headers['x-simeon-client-version'] ?? null,
    }
    state.requests.push(record)
    const cors = corsHeaders(origin)
    const send = (status, body, type = 'application/json') => {
      response.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', ...cors })
      response.end(body)
    }
    const json = (value, status = 200) => send(status, JSON.stringify(value))

    if (request.method === 'OPTIONS') {
      const asked = String(request.headers['access-control-request-headers'] ?? '')
        .split(',')
        .map((h) => h.trim().toLowerCase())
        .filter(Boolean)
      if (origin === appPageOrigin) {
        response.writeHead(200, { ...cors, 'access-control-allow-headers': asked.join(', '), 'access-control-max-age': '600' })
      } else {
        const plain = asked.every((h) => h === 'authorization' || h === 'content-type')
        response.writeHead(plain ? 200 : 400, { ...cors, 'access-control-allow-headers': 'Authorization, Content-Type' })
      }
      return response.end()
    }

    let args = {}
    try {
      args = raw ? JSON.parse(raw) : {}
    } catch {
      args = {}
    }
    const own = await routes?.(record, args, state)
    if (own) {
      if ('json' in own) return json(own.json, own.status ?? 200)
      return send(own.status ?? 200, own.text ?? '', own.type ?? 'text/plain')
    }

    const p = url.pathname
    const box = state.box
    const base = `http://127.0.0.1:${server.address().port}`
    if (p === '/desktop/api/user/profile')
      return json({ code: 0, data: { email: 'person@example.com', name: 'Sam Person' } })
    if (p.startsWith('/desktop/api/chats/')) return json({}, 404)
    if (p.endsWith('/GetSandBoxRunState')) return json({ state: 3, letsSleep: false })
    if (p.endsWith('/EnsureSandBox')) return json({ gatewayUrl: `${base}/box`, gatewayToken: 'fake-gateway' })
    if (p === '/box/health') return json({ ok: true })
    if (p === '/box/events') {
      const body = box.queued.splice(0).map((e) => `data: ${JSON.stringify(e)}\n\n`).join('') + ': ping\n\n'
      return send(200, body, 'text/event-stream')
    }
    if (p.startsWith('/box/api/')) {
      const method = p.slice('/box/api/'.length)
      box.sent.push({ method, args })
      switch (method) {
        case 'listAgents':
          return json(box.agents)
        case 'openAgentTail':
        case 'getAgentTranscriptTail':
          return json({ entries: box.lines[args.id] ?? [] })
        case 'countAgents':
          return json({ count: box.agents.length })
        default:
          return json({})
      }
    }
    return json({}, 404)
  })
  await new Promise((done) => server.listen(0, '127.0.0.1', done))
  const address = server.address()
  return {
    base: `http://127.0.0.1:${address.port}`,
    state,
    close: () => new Promise((done) => server.close(done)),
  }
}
