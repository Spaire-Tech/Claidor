// The shared core's `GatewayTests` (CoreTests.swift) and `GatewayConnectTests`,
// the same inputs and the same answers. Left for step 2: the host's commands'
// own argument names and events as the screens read them (`LiveBackend`).

import { describe, expect, it } from 'vitest'
import { MemoryVault, SimeonAPI } from './api'
import {
  EventStreamParser,
  Gateway,
  GatewayConnection,
  GatewayError,
} from './gateway'
import { NetworkError } from './http'
import { type JSONValue, arr, field } from './json'
import { plainError, plainProblem, unavailable } from './plainWords'
import { MemorySavedGateway, decodeSavedGateway } from './savedGateway'
import {
  Clock,
  Routes,
  ScriptedHTTP,
  answer,
  box,
  ensure,
  eventually,
  kept,
  makeGateway,
} from './testing'

const signedIn = () =>
  new MemoryVault({ accessToken: 't', refreshToken: 'r', expiresAtMs: 9e15 })

describe('the gateway', () => {
  it('parses the event stream in blocks and skips the rest', () => {
    const parser = new EventStreamParser()
    const text =
      ': hello\n\ndata: {"channel":"agents","payload":[]}\n\nevent: x\ndata: {"channel":"transcript",\ndata: "payload":{"type":"removed","agentId":"a","id":"e1"}}\r\n\r\ndata: not json\n\n'
    const events = []
    // Byte by byte, as a network would split it at its worst.
    for (const byte of new TextEncoder().encode(text)) {
      events.push(...parser.feedBytes(new Uint8Array([byte])))
    }
    expect(events.map((e) => e.channel)).toEqual(['agents', 'transcript'])
    expect(events[1]?.payload).toEqual({
      type: 'removed',
      agentId: 'a',
      id: 'e1',
    })
  })

  it('keeps letters split across chunks whole', () => {
    const parser = new EventStreamParser()
    const bytes = new TextEncoder().encode(
      'data: {"channel":"é","payload":"ü"}\n\n',
    )
    const events = [
      ...parser.feedBytes(bytes.slice(0, 20)),
      ...parser.feedBytes(bytes.slice(20)),
    ]
    expect(events).toEqual([{ channel: 'é', payload: 'ü' }])
  })

  it("reads the connection from the broker's answer", () => {
    const connection = GatewayConnection.fromBox({
      gatewayUrl: 'https://api.simeonlabs.com/sand-box/b1/p/1340/',
      gatewayToken: 'g',
      networkToken: 'n',
      vncUrl: 'https://v',
    })
    expect(connection.baseURL).toBe(
      'https://api.simeonlabs.com/sand-box/b1/p/1340',
    )
    const request = connection.commandRequest('listAgents', {})
    expect(request.url).toBe(
      'https://api.simeonlabs.com/sand-box/b1/p/1340/api/listAgents',
    )
    expect(request.headers.authorization).toBe('Bearer g')
    expect(request.headers['x-anyrun-network-token']).toBe('n')
    expect(connection.eventsRequest().headers.accept).toBe('text/event-stream')
    expect(() => GatewayConnection.fromBox({})).toThrow()
  })

  it('asks the broker once and sends again to a box that moved', async () => {
    const http = new ScriptedHTTP([
      // The launch's one question, with nothing kept: the record, which says the server keeps it awake.
      (request) => {
        expect(new URL(request.url).pathname).toBe(
          '/simeon.v1.ComputerService/GetSandBoxRunState',
        )
        return answer(200, '{"state":3,"letsSleep":false}')
      },
      (request) => {
        expect(new URL(request.url).pathname).toBe(
          '/simeon.v1.ComputerService/EnsureSandBox',
        )
        return answer(200, '{"gatewayUrl":"https://box-1","gatewayToken":"g1"}')
      },
      () => answer(502),
      () => answer(200, '{"gatewayUrl":"https://box-2","gatewayToken":"g2"}'),
      (request) => {
        expect(request.url).toBe('https://box-2/api/listAgents')
        return answer(
          200,
          '[{"id":"simeon","name":"Simeon","avatarColor":"blue","lastActivityAt":5}]',
        )
      },
    ])
    const api = new SimeonAPI({
      base: 'https://api.example.com',
      clientVersion: '1',
      vault: signedIn(),
      http,
    })
    const agents = await new Gateway({ api, http }).command(
      'listAgents',
      {},
      { wakes: false },
    )
    expect(arr(agents)?.map((agent) => field(agent, 'name'))).toEqual([
      'Simeon',
    ])
    expect(http.sent).toHaveLength(5)
  })

  it("does not send a host's refusal again", async () => {
    const http = new ScriptedHTTP([
      () => answer(200, '{"gatewayUrl":"https://box-1"}'),
      () =>
        answer(400, '{"error":"Malformed getAgentTranscriptWindow request"}'),
    ])
    const api = new SimeonAPI({
      base: 'https://x',
      clientVersion: '1',
      vault: signedIn(),
      http,
    })
    // The computer's sentence alone; the command apart, as the Electron app's coordinator keeps it (3 November 2026).
    const refusal = await new Gateway({ api, http })
      .command('getAgentTranscriptWindow', {})
      .catch((error: unknown) => error)
    expect(refusal).toBeInstanceOf(GatewayError)
    expect((refusal as GatewayError).message).toBe(
      'Malformed getAgentTranscriptWindow request',
    )
    expect((refusal as GatewayError).method).toBe('getAgentTranscriptWindow')
    expect((refusal as GatewayError).refused).toBe(true)
    expect(http.sent).toHaveLength(2)
  })

  it('says the computer’s sentence and not the command (testARefusalSaysTheComputersSentenceAndNotTheCommand)', async () => {
    const refusal = async (method: string, status: number, body: string) => {
      const http = new ScriptedHTTP([
        () => answer(200, '{"gatewayUrl":"https://box-1"}'),
        () => answer(status, body),
      ])
      const api = new SimeonAPI({
        base: 'https://x',
        clientVersion: '1',
        vault: signedIn(),
        http,
      })
      return (await new Gateway({ api, http })
        .command(method, {})
        .catch((error: unknown) => error)) as GatewayError
    }
    const said = await refusal('createAgent', 409, '{"error":"Not now"}')
    expect(said.message).toBe('Not now')
    expect(said.method).toBe('createAgent')
    expect(said.status).toBe(409)
    expect(plainProblem(`Couldn't create Arlo: ${said.message}`)).toBe(
      "Couldn't create Arlo: Not now",
    )
    expect(
      plainProblem(
        said.message,
        'Couldn’t change the avatar. Try again in a little while.',
      ),
    ).toBe('Not now')

    const bare = await refusal('setAgentAvatarBytes', 400, 'upstream said no')
    expect(bare.message).toBe(
      'gateway setAgentAvatarBytes failed: upstream said no',
    )
    expect(bare.method).toBe('setAgentAvatarBytes')
    expect(plainError(bare.message)).toBe(unavailable())
    expect(plainProblem(`Couldn't create Arlo: ${bare.message}`)).toBe(
      "Couldn't create Arlo. Try again in a little while.",
    )
  })

  it("reaches an agent's screen through the proxy", () => {
    const connection = GatewayConnection.fromBox({
      gatewayUrl: 'https://api.simeonlabs.com/sand-box/b1/p/8790',
      networkToken: 'NT',
      vncUrl:
        'https://api.simeonlabs.com/sand-box/b1/p/6080/vnc.html?network_token=NT&resume_lower_s=900&resume_upper_s=18000&path=websockify%3Fnetwork_token%3DNT%26resume_lower_s%3D900%26resume_upper_s%3D18000',
      forkVncBaseUrl: 'https://api.simeonlabs.com/sand-box/b1/p/6081/',
    })
    expect(
      connection.screenSocket(
        'http://127.0.0.1:6081/vnc.html?autoconnect=1&path=websockify%3Ftoken%3D3',
      ),
    ).toBe(
      'wss://api.simeonlabs.com/sand-box/b1/p/6081/websockify?token=3&network_token=NT&resume_lower_s=900&resume_upper_s=18000',
    )
    expect(connection.screenSocket('http://127.0.0.1:6080/vnc.html')).toBe(
      'wss://api.simeonlabs.com/sand-box/b1/p/6080/websockify?network_token=NT&resume_lower_s=900&resume_upper_s=18000',
    )
  })

  it('hears the event stream, and dials again with /health first after it drops', async () => {
    const http = new Routes()
    http.on(ensure, () => answer(200, box('b1')))
    http.on('/health', () => answer(200, '{"ok":true}'))
    const encode = (text: string) => new TextEncoder().encode(text)
    // The first stream says one thing and ends; the second says one thing and stays open.
    http.streams.push(async (request) => {
      expect(request.url).toBe('https://b1/events')
      expect(request.headers.accept).toBe('text/event-stream')
      expect(request.timeoutSeconds).toBe(35)
      return {
        status: 200,
        headers: {},
        body: (async function* () {
          yield encode('data: {"channel":"agents","payload":[1]}\n\n')
        })(),
      }
    })
    http.streams.push(async (_request, signal) => ({
      status: 200,
      headers: {},
      body: (async function* () {
        yield encode('data: {"channel":"agents","payload":[2]}\n\n')
        await new Promise((_, reject) =>
          signal?.addEventListener('abort', () =>
            reject(new NetworkError('Cancelled.', 'cancelled')),
          ),
        )
      })(),
    }))
    const gateway = makeGateway(http, { pause: async () => {} })
    const heard: JSONValue[] = []
    const states: boolean[] = []
    const ended = new AbortController()
    const running = gateway.events({
      onEvent: (event) => heard.push(event.payload),
      onState: (connected) => states.push(connected),
      signal: ended.signal,
    })
    await eventually(() => heard.length === 2)
    expect(heard).toEqual([[1], [2]])
    expect(http.count(ensure)).toBe(1)
    expect(http.count('/health')).toBe(1)
    ended.abort()
    await running
    expect(states).toEqual([true, false, true])
  })

  it('sends again only what surely never arrived', () => {
    expect(GatewayError.neverArrived(new GatewayError('x', false, 502))).toBe(
      true,
    )
    expect(GatewayError.neverArrived(new GatewayError('x', false, 500))).toBe(
      false,
    )
    expect(
      GatewayError.neverArrived(new NetworkError('x', 'unreachable')),
    ).toBe(true)
    expect(GatewayError.neverArrived(new NetworkError('x', 'timedOut'))).toBe(
      false,
    )
  })
})

describe('reaching the computer as the Electron app reaches it', () => {
  it('dials the event stream again after 1, 2, 4, 8, then 10 seconds', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(Gateway.reconnectDelay)).toEqual([
      1, 2, 4, 8, 10, 10, 10,
    ])
    expect(Gateway.stallSeconds).toBe(35)
    expect(
      new GatewayConnection({ baseURL: 'https://b' }).eventsRequest()
        .timeoutSeconds,
    ).toBe(35)
  })

  it('keeps an address for its account and for seven days', () => {
    const now = new Date()
    expect(decodeSavedGateway(kept('b', 'u1'), 'u1', now)?.baseURL).toBe(
      'https://b',
    )
    expect(decodeSavedGateway(kept('b', 'u1'), 'u1', now)?.token).toBe('g-b')
    expect(decodeSavedGateway(kept('b', 'u1'), 'u2', now)).toBeUndefined()
    const old = new Date(now.getTime() - 8 * 86_400_000)
    expect(decodeSavedGateway(kept('b', 'u1', old), 'u1', now)).toBeUndefined()
    expect(decodeSavedGateway('{}', 'u1', now)).toBeUndefined()
    expect(decodeSavedGateway(null, 'u1', now)).toBeUndefined()
  })

  it('uses the kept address at launch while the broker is asked', async () => {
    const http = new Routes()
    http.on(ensure, () => answer(200, box('fresh')))
    http.on('/api/listAgents', () => answer(200, '[]'))
    http.on('/health', () => answer(200, '{"ok":true}'))
    const saved = new MemorySavedGateway(kept('kept', 'u1'))
    const gateway = makeGateway(http, { saved })

    await gateway.command('listAgents')
    expect(http.sent).toContain('https://kept/api/listAgents')
    await eventually(
      () =>
        decodeSavedGateway(saved.read(), 'u1', new Date())?.baseURL ===
        'https://fresh',
    )
    expect(decodeSavedGateway(saved.read(), 'u1', new Date())?.baseURL).toBe(
      'https://fresh',
    )
    expect(http.count(ensure)).toBe(1)

    // From then on the broker's answer: asked about with /health, not the broker again.
    const connection = await gateway.currentConnection()
    expect(connection.baseURL).toBe('https://fresh')
    expect(http.count(ensure)).toBe(1)
  })

  it("does not use another account's kept address", async () => {
    const http = new Routes()
    http.on(ensure, () => answer(200, box('mine')))
    const gateway = makeGateway(http, {
      account: 'u2',
      saved: new MemorySavedGateway(kept('theirs', 'u1')),
    })
    expect((await gateway.currentConnection()).baseURL).toBe('https://mine')
    expect(http.sent.some((url) => url.includes('theirs'))).toBe(false)
  })

  it('does not try a kept address that failed again', async () => {
    const http = new Routes()
    // The box went to sleep since: the proxy has nothing to forward to.
    http.on('https://kept/api/listAgents', () => answer(502))
    http.on(ensure, () => answer(200, box('woken')))
    http.on('https://woken/api/listAgents', () =>
      answer(200, '[{"id":"simeon","name":"Simeon"}]'),
    )
    const gateway = makeGateway(http, {
      saved: new MemorySavedGateway(kept('kept', 'u1')),
    })
    const agents = await gateway.command('listAgents')
    expect(arr(agents)).toHaveLength(1)
    expect(http.sent.filter((url) => url.endsWith('/api/listAgents'))).toEqual([
      'https://kept/api/listAgents',
      'https://woken/api/listAgents',
    ])
    expect(http.count(ensure)).toBe(1)
  })

  it('waits for the broker when a kept address does not answer /health', async () => {
    const http = new Routes()
    let asked = 0
    // The box is waking: the first answer is the broker's "still starting", the next one the box.
    http.on(ensure, () => {
      asked += 1
      return asked === 1
        ? answer(
            503,
            `{"code":"unavailable","message":"Simeon's cloud computer is still starting."}`,
          )
        : answer(200, box('woken'))
    })
    http.on('https://kept/health', () => answer(502))
    const gateway = makeGateway(http, {
      saved: new MemorySavedGateway(kept('kept', 'u1')),
    })
    expect((await gateway.currentConnection()).baseURL).toBe('https://kept')
    await eventually(() => !gateway.isAskingBroker)
    expect(http.count(ensure)).toBe(1)
    expect((await gateway.currentConnection()).baseURL).toBe('https://woken')
    expect(http.count(ensure)).toBe(2)
  })

  it('checks a known address with /health before asking the broker again', async () => {
    const http = new Routes()
    const clock = new Clock()
    let healthy = true
    http.on(ensure, () => answer(200, box('b1')))
    http.on('/health', (request) => {
      expect(request.headers.authorization).toBe('Bearer g-b1')
      expect(request.headers['x-anyrun-network-token']).toBe('n-b1')
      expect(request.timeoutSeconds).toBe(1.5)
      return healthy ? answer(200, '{"ok":true,"isBusy":false}') : answer(502)
    })
    const gateway = makeGateway(http, { clock })
    await gateway.currentConnection()
    expect(http.count(ensure)).toBe(1)

    // Answers /health: kept, and trusted for 5 s.
    await gateway.currentConnection()
    await gateway.currentConnection()
    expect(http.count('/health')).toBe(1)
    expect(http.count(ensure)).toBe(1)
    clock.advance(5.1)
    await gateway.currentConnection()
    expect(http.count('/health')).toBe(2)

    // While the event stream is up, no /health at all; once it drops, /health again.
    clock.advance(10)
    gateway.streamConnected()
    await gateway.currentConnection()
    expect(http.count('/health')).toBe(2)
    gateway.streamDropped()
    await gateway.currentConnection()
    expect(http.count('/health')).toBe(3)
    expect(http.count(ensure)).toBe(1)

    // No answer from /health: the broker is asked.
    healthy = false
    clock.advance(10)
    await gateway.currentConnection()
    expect(http.count(ensure)).toBe(2)
  })

  it('does not ask a full box server again before its retry-after', async () => {
    const http = new Routes()
    const clock = new Clock()
    http.on(ensure, () =>
      answer(
        429,
        `{"code":"resource_exhausted","message":"Simeon's cloud computers are all in use."}`,
        {
          'X-Automation-Failure-Hint': 'SAND_BOX_BLOCKED',
          'Retry-After': '30',
        },
      ),
    )
    const gateway = makeGateway(http, { clock })
    for (let i = 0; i < 3; i += 1) {
      await expect(gateway.currentConnection()).rejects.toThrow(
        "Simeon's cloud computers are all in use.",
      )
    }
    expect(http.count(ensure)).toBe(1)
    clock.advance(31)
    await gateway.currentConnection().catch(() => undefined)
    expect(http.count(ensure)).toBe(2)
    // Without a retry-after, a minute.
    const other = new Routes()
    other.on(ensure, () =>
      answer(429, '', { 'x-automation-failure-hint': 'SAND_BOX_BLOCKED' }),
    )
    const held = makeGateway(other, { clock })
    await held.currentConnection().catch(() => undefined)
    clock.advance(59)
    await held.currentConnection().catch(() => undefined)
    expect(other.count(ensure)).toBe(1)
    clock.advance(2)
    await held.currentConnection().catch(() => undefined)
    expect(other.count(ensure)).toBe(2)
  })

  it('forgets the kept address of a refused account', async () => {
    const http = new Routes()
    http.on(ensure, () =>
      answer(403, '{"code":"permission_denied","message":"No active plan."}'),
    )
    http.on('/api/listAgents', () => answer(502))
    const saved = new MemorySavedGateway(kept('kept', 'u1'))
    const gateway = makeGateway(http, { saved })
    await gateway.command('listAgents').catch(() => undefined)
    await eventually(() => saved.read() == null)
    expect(saved.read()).toBeNull()
  })

  it('asks the broker, not the kept address, once invalidated', async () => {
    const http = new Routes()
    http.on(ensure, () => answer(200, box('fresh')))
    const gateway = makeGateway(http, {
      saved: new MemorySavedGateway(kept('kept', 'u1')),
    })
    gateway.invalidate()
    expect((await gateway.currentConnection()).baseURL).toBe('https://fresh')
  })
})
