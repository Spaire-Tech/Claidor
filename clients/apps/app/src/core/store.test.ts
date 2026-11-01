// The roster as the shared core's tests have it: `SavedChatsTests` (the
// server's copy and the computer's list), `SleepingComputerTests` (a resting
// computer is no failure), `GatewayTests.testHostEventsMapToTheScreens`, and
// the store's list after the host's events.

import { describe, expect, it } from 'vitest'
import { SimeonAPIError } from './api'
import { type AgentBackend, type BackendEvent, LiveBackend } from './backend'
import { GatewayError } from './gatewayConnection'
import type { JSONValue } from './json'
import { type Agent, makeAgent } from './models'
import { AppStore, accountFrom } from './store'
import { Routes, answer, ensure, makeGateway, ms } from './testing'

/** A computer that answers as told, and a server whose copy comes when told. */
class FakeBackend implements AgentBackend {
  agents: Agent[] = []
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
  async server(path: string): Promise<JSONValue> {
    this.serverPaths.push(path)
    await ms(this.serverDelayMs)
    const found = this.serverAnswers[path]
    if (found === undefined) throw new SimeonAPIError('No such path.', 404)
    return found
  }
  async command(): Promise<JSONValue> {
    return {}
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

const serverAgents = {
  agents: [
    { id: 'theo', name: 'Theo', lastActivityAt: 2 },
    { id: 'iris', name: 'Iris', lastActivityAt: 1 },
  ],
}

describe('the list at launch', () => {
  it('shows the server’s copy while the computer is away, and a resting computer is no failure', async () => {
    const backend = new FakeBackend()
    backend.listError = GatewayError.resting()
    backend.serverAnswers['chats/agents'] = serverAgents
    const store = new AppStore()
    store.readsServerCopy = true
    await store.attach(backend)
    await ms(5)
    expect(store.agents.map((a) => a.id)).toEqual(['theo', 'iris'])
    expect(store.showingSaved).toBe(true)
    expect(store.listFromServer).toBe(true)
    expect(store.rosterFailed).toBe(false)
    expect(store.problem).toBeUndefined()
  })

  it('lets the computer’s list win when it answers first', async () => {
    const backend = new FakeBackend()
    backend.agents = [makeAgent({ id: 'theo', name: 'Theo' })]
    backend.serverDelayMs = 30
    backend.serverAnswers['chats/agents'] = serverAgents
    const store = new AppStore()
    store.readsServerCopy = true
    await store.attach(backend)
    expect(store.agents.map((a) => a.id)).toEqual(['theo'])
    let flashed = false
    const unsubscribe = store.subscribe(() => {
      if (store.agents.some((a) => a.id === 'iris') || store.showingSaved)
        flashed = true
    })
    await ms(60)
    unsubscribe()
    expect(backend.serverPaths).toContain('chats/agents')
    expect(flashed).toBe(false)
    expect(store.agents.map((a) => a.id)).toEqual(['theo'])
  })

  it('replaces the server’s copy with the computer’s list when it comes', async () => {
    const backend = new FakeBackend()
    backend.agents = [makeAgent({ id: 'nora', name: 'Nora' })]
    backend.listDelayMs = 30
    backend.serverAnswers['chats/agents'] = serverAgents
    const store = new AppStore()
    store.readsServerCopy = true
    const shownAt: string[][] = []
    const attached = store.attach(backend, () =>
      shownAt.push(store.agents.map((a) => a.id)),
    )
    await ms(10)
    expect(store.agents.map((a) => a.id)).toEqual(['theo', 'iris'])
    await attached
    expect(store.agents.map((a) => a.id)).toEqual(['nora'])
    expect(store.showingSaved).toBe(false)
    expect(store.hasReachedBox).toBe(true)
    // Told once, as soon as a list was on screen.
    expect(shownAt).toEqual([['theo', 'iris']])
  })

  it('reads no server copy unless the app asks', async () => {
    const backend = new FakeBackend()
    backend.listError = GatewayError.resting()
    backend.serverAnswers['chats/agents'] = serverAgents
    const store = new AppStore()
    await store.attach(backend)
    await ms(5)
    expect(backend.serverPaths).toEqual([])
    expect(store.agents).toEqual([])
  })

  it('raises the access cover for a refused account, and says other failures', async () => {
    const refused = new FakeBackend()
    refused.listError = new SimeonAPIError('No active plan.', 403)
    const store = new AppStore()
    await store.attach(refused)
    expect(store.accessBlocked).toBe(true)
    expect(store.rosterFailed).toBe(true)
    expect(store.problem).toBeUndefined()

    const down = new FakeBackend()
    down.listError = new GatewayError('listAgents: busy', false, 500)
    await store.attach(down)
    expect(store.accessBlocked).toBe(false)
    expect(store.problem).toBe("Couldn't reach your agents: listAgents: busy")
  })
})

describe('the host’s events', () => {
  it('keep the list current, and the same row again redraws nothing', async () => {
    const backend = new FakeBackend()
    backend.agents = [
      makeAgent({ id: 'theo', name: 'Theo', lastActivityAt: 2 }),
      makeAgent({ id: 'iris', name: 'Iris', lastActivityAt: 1 }),
    ]
    const store = new AppStore()
    await store.attach(backend)
    let changes = 0
    store.subscribe(() => (changes += 1))
    backend.emit?.({
      kind: 'agentUpserted',
      agent: { ...backend.agents[0]!, stamp: { epoch: 'e', seq: 9 } },
    })
    expect(changes).toBe(0)
    backend.emit?.({
      kind: 'agentUpserted',
      agent: makeAgent({ id: 'iris', name: 'Iris', lastActivityAt: 5 }),
    })
    expect(store.agents.map((a) => a.id)).toEqual(['iris', 'theo'])
    expect(changes).toBe(1)
    backend.emit?.({
      kind: 'agents',
      agents: [makeAgent({ id: 'leo', name: 'Leo' })],
    })
    expect(store.agents.map((a) => a.id)).toEqual(['leo'])
    backend.emit?.({ kind: 'connection', live: true })
    expect(store.isLive).toBe(true)
    backend.emit?.({ kind: 'computerAsleep', asleep: true })
    expect(store.isAsleep).toBe(true)
  })

  it('from another computer are not heard after a new attach', async () => {
    const first = new FakeBackend()
    const store = new AppStore()
    await store.attach(first)
    const old = first.emit
    await store.attach(new FakeBackend())
    old?.({
      kind: 'agents',
      agents: [makeAgent({ id: 'ghost', name: 'Ghost' })],
    })
    expect(store.agents).toEqual([])
  })

  it('map to the screens’ terms', () => {
    const upserted = LiveBackend.map({
      channel: 'agent-upserted',
      payload: {
        agent: { id: 'theo', name: 'Theo', isComposingMessage: true },
      },
    })
    expect(upserted[0]?.kind).toBe('agentUpserted')
    expect(
      upserted[0]?.kind === 'agentUpserted' && upserted[0].agent.isComposing,
    ).toBe(true)
    const step = LiveBackend.map({
      channel: 'outline',
      payload: {
        type: 'appended',
        agentId: 'simeon',
        item: {
          kind: 'tool-call',
          id: 'm1',
          status: 'running',
          summary: 'Checking Linear',
        },
      },
    })
    expect(step).toEqual([
      {
        kind: 'step',
        agentId: 'simeon',
        id: 'm1',
        summary: 'Checking Linear',
        running: true,
      },
    ])
    expect(
      LiveBackend.map({ channel: 'teach-recording', payload: {} }),
    ).toEqual([])
    expect(
      LiveBackend.map({ channel: 'tray', payload: { type: 'cleared' } }),
    ).toEqual([{ kind: 'tray', tray: { type: 'cleared' } }])
    expect(
      LiveBackend.map({
        channel: 'agents',
        payload: { agents: [{ id: 'a', name: 'A' }, { name: 'no id' }] },
      }),
    ).toMatchObject([{ kind: 'agents', agents: [{ id: 'a' }] }])
  })
})

describe('the live backend', () => {
  it('reads the list from the computer, without waking it', async () => {
    const http = new Routes()
    http.on(ensure, () => answer(200, '{"gatewayUrl":"https://box"}'))
    http.on('/api/listAgents', (request) => {
      expect(request.method).toBe('POST')
      return answer(
        200,
        '{"agents":[{"id":"simeon","name":"Simeon","avatarColor":"blue","lastActivityAt":5}]}',
      )
    })
    const backend = new LiveBackend(makeGateway(http))
    const agents = await backend.listAgents()
    expect(agents.map((a) => a.name)).toEqual(['Simeon'])
    expect(agents[0]?.colour).toBe('blue')
  })
})

describe('the account', () => {
  it('reads the profile as the Mac does', () => {
    expect(
      accountFrom({ email: 'bass@simeonlabs.com', name: 'Bass Fall' }),
    ).toEqual({
      name: 'Bass Fall',
      email: 'bass@simeonlabs.com',
      pictureURL: undefined,
      id: undefined,
    })
    expect(
      accountFrom({ email: 'ada@x.com', preferredName: 'Ada', name: 'Ada L' })
        ?.name,
    ).toBe('Ada')
    expect(accountFrom({ email: 'ada@x.com' })?.name).toBe('ada')
    expect(
      accountFrom({ email: 'a@b.c', avatarUrl: 'http://insecure/p.png' })
        ?.pictureURL,
    ).toBeUndefined()
    expect(accountFrom({})).toBeUndefined()
  })
})
