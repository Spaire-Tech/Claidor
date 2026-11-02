// Step 5b's store against a stand-in computer: the shared core's
// `ComputerControlTests` (Take control, Stop task, `typingFocus`),
// ComputerStoreTests.swift's `testHelpersOnlyWithTheAgentsScreen`, and
// StoreComputer.swift's rules: a status read under 15 s with its late
// answer kept, a start, Retry, the stream coming back, the window coming
// forward (at most once a minute, not while the computer is rebuilt), the
// host's pushes, the disk told to 5c, the screen's socket through the
// proxy, and a sign-out.

import { describe, expect, it, vi } from 'vitest'
import { LiveBackend } from './backend'
import { GatewayError } from './gatewayConnection'
import type { JSONValue } from './json'
import { makeAgent } from './models'
import { AppStore } from './store'
import {
  FakeBackend,
  Routes,
  answer,
  ensure,
  eventually,
  makeGateway,
  ms,
} from './testing'

/** A computer whose answers can be slowed, command by command. */
class SlowBackend extends FakeBackend {
  delays: Record<string, number> = {}
  override async command(
    method: string,
    args: JSONValue = {},
    options: { wakes?: boolean } = {},
  ): Promise<JSONValue> {
    const wait = this.delays[method]
    if (wait) await ms(wait)
    return super.command(method, args, options)
  }
}

const running = (agentId: string, more: Record<string, JSONValue> = {}) => ({
  agentId,
  state: 'running',
  vncUrl: 'http://127.0.0.1:6080/vnc.html',
  ...more,
})

async function attached(backend: FakeBackend = new SlowBackend()) {
  backend.agents = [makeAgent({ id: 'a1', name: 'Theo' })]
  const store = new AppStore()
  await store.attach(backend)
  return { store, backend }
}

const methods = (backend: FakeBackend, ...names: string[]) =>
  backend.commands
    .filter((command) => names.includes(command.method))
    .map((command) => command.method)

describe('the whole computer, its core (`ComputerControlTests`)', () => {
  function controlled() {
    const backend = new FakeBackend()
    backend.commandAnswers = {
      takeComputerControl: () => ({ handoff: true }),
      stopAgentTask: () => ({ stopped: true }),
      typingFocus: (args): JSONValue => {
        switch (field(args, 'id')) {
          case 'on-email':
            return { focus: 'email' }
          case 'on-button':
            return { focus: '' }
          case 'on-password':
            return { focus: 'password' }
          case 'on-color':
            return { focus: 'color' }
          case 'older-engine':
            throw new GatewayError('unknown gateway method: typingFocus', true)
          default:
            return {}
        }
      },
    }
    return backend
  }

  it('asks the host to take control and to stop the task', async () => {
    const { store, backend } = await attached(controlled())
    expect(await store.takeComputerControl('a1')).toBe(true)
    expect(await store.stopAgentTask('a1')).toBe(true)
    expect(methods(backend, 'takeComputerControl', 'stopAgentTask')).toEqual([
      'takeComputerControl',
      'stopAgentTask',
    ])
    expect(
      backend.commands.find((c) => c.method === 'takeComputerControl')?.args,
    ).toEqual({ id: 'a1' })
  })

  it('names the field a click focused, and none elsewhere', async () => {
    const { store, backend } = await attached(controlled())
    expect(await store.typingFocus('on-email')).toBe('email')
    expect(backend.commands.at(-1)).toMatchObject({
      method: 'typingFocus',
      args: { id: 'on-email' },
    })
    expect(await store.typingFocus('on-button')).toBe('none')
    expect(await store.typingFocus('on-password')).toBe('password')
    // A kind not known here is typed into as text.
    expect(await store.typingFocus('on-color')).toBe('text')
    // An engine without the question, or no answer: nothing said.
    expect(await store.typingFocus('older-engine')).toBeUndefined()
    expect(await store.typingFocus('no-focus-field')).toBeUndefined()
  })

  it('makes the computer ready for the clicks when control is taken', async () => {
    const { store, backend } = await attached(controlled())
    await store.prepareTypingFocus('a1')
    expect(backend.commands.at(-1)).toEqual({
      method: 'typingFocus',
      args: { id: 'a1', prepare: true },
      wakes: true,
    })
    await store.prepareTypingFocus('older-engine')
    expect(methods(backend, 'typingFocus')).toHaveLength(2)
  })

  it('asks nothing without a computer', async () => {
    const store = new AppStore()
    expect(await store.typingFocus('a1')).toBeUndefined()
    await store.prepareTypingFocus('a1')
    expect(await store.takeComputerControl('a1')).toBe(false)
    expect(await store.stopAgentTask('a1')).toBe(false)
    expect(await store.screenSocket('http://127.0.0.1:6080/vnc.html')).toBe(
      undefined,
    )
  })
})

function field(value: JSONValue, key: string): JSONValue | undefined {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? value[key]
    : undefined
}

describe('each agent’s computer in the store', () => {
  it('draws the helpers only with the agent’s own screen (`testHelpersOnlyWithTheAgentsScreen`)', async () => {
    const { store, backend } = await attached()
    backend.push({
      kind: 'subagents',
      parentId: 'a1',
      subagents: [
        {
          subagentId: 's',
          subagentType: 'computerUse',
          status: 'running',
          title: 'Browse',
        },
      ],
    })
    expect(store.computerHelpers('a1')).toEqual([])
    backend.push({
      kind: 'computer',
      status: { agentId: 'a1', state: 'hibernated', vncUrl: null },
    })
    expect(store.computerHelpers('a1')).toEqual([])
    backend.push({ kind: 'computer', status: running('a1') })
    expect(store.computerHelpers('a1').map((helper) => helper.title)).toEqual([
      'Browse',
    ])
  })

  it('reads a watched computer while the stream is up, its helpers once, and again when the stream comes back', async () => {
    const { store, backend } = await attached()
    backend.commandAnswers.getForeverBoxStatus = () => running('a1')
    backend.commandAnswers.getSubagents = () => ({ subagents: [] })
    store.watchComputer('a1')
    await ms(5)
    // The stream not up: nothing read yet, the helpers read.
    expect(methods(backend, 'getForeverBoxStatus')).toEqual([])
    expect(methods(backend, 'getSubagents')).toEqual(['getSubagents'])
    backend.push({ kind: 'connection', live: true })
    await eventually(() => store.computer.readState('a1') === 'known')
    expect(store.computer.phase('a1')).toBe('running')
    expect(methods(backend, 'getForeverBoxStatus')).toHaveLength(1)
    // Watched again (the pane's preview and the window): read at once.
    store.watchComputer('a1')
    await ms(5)
    expect(methods(backend, 'getForeverBoxStatus')).toHaveLength(2)
    store.unwatchComputer('a1')
    store.unwatchComputer('a1')
    expect(store.computer.isWatched('a1')).toBe(false)
  })

  it('says it can’t reach a computer whose read passed its 15 s, and keeps the late answer', async () => {
    const backend = new SlowBackend()
    const { store } = await attached(backend)
    store.computerDeadline = 0.02
    backend.delays.getForeverBoxStatus = 60
    backend.commandAnswers.getForeverBoxStatus = () =>
      running('a1', { state: 'hibernated', vncUrl: null })
    backend.push({ kind: 'connection', live: true })
    store.watchComputer('a1')
    await eventually(() => store.computer.readState('a1') === 'error')
    expect(store.computer.readState('a1')).toBe('error')
    await eventually(() => store.computer.readState('a1') === 'known')
    expect(store.computer.phase('a1')).toBe('sleeping')
  })

  it('starts the computer once at a time, takes its answer, and says a failure before any status', async () => {
    const backend = new SlowBackend()
    const { store } = await attached(backend)
    backend.delays.ensureForeverBox = 20
    backend.commandAnswers.ensureForeverBox = () => running('a1')
    store.openComputer('a1')
    store.openComputer('a1')
    expect(store.computer.phase('a1')).toBe('starting')
    expect(store.computer.demanded.has('a1')).toBe(true)
    await eventually(() => store.computer.phase('a1') === 'running')
    expect(methods(backend, 'ensureForeverBox')).toHaveLength(1)

    backend.refusedCommands.add('ensureForeverBox')
    store.openComputer('b2')
    await eventually(() => store.computer.readState('b2') === 'error')
    expect(store.computer.phase('b2')).toBe('off')
  })

  it('retries a read, and a start only where it was started here', async () => {
    const { store, backend } = await attached()
    store.retryComputer('a1')
    await ms(5)
    expect(methods(backend, 'getForeverBoxStatus', 'ensureForeverBox')).toEqual(
      ['getForeverBoxStatus'],
    )
    store.openComputer('a1')
    await ms(5)
    store.retryComputer('a1')
    await ms(5)
    expect(methods(backend, 'getForeverBoxStatus', 'ensureForeverBox')).toEqual(
      [
        'getForeverBoxStatus',
        'ensureForeverBox',
        'getForeverBoxStatus',
        'ensureForeverBox',
      ],
    )
  })

  it('starts again at once what was started here when the window comes forward, and reads again at most once a minute, not while the computer is rebuilt', async () => {
    const { store, backend } = await attached()
    const computerCalls = () =>
      methods(backend, 'getForeverBoxStatus', 'ensureForeverBox')
    // The stream not up: nothing.
    store.windowCameForward()
    expect(computerCalls()).toEqual([])
    backend.push({ kind: 'connection', live: true })
    store.watchComputer('a1')
    store.openComputer('a1')
    await ms(5)
    const before = backend.commands.length
    // The stream came back just now: only the start again.
    store.windowCameForward()
    await ms(5)
    expect(
      backend.commands.slice(before).map((command) => command.method),
    ).toEqual(['ensureForeverBox'])
    // A minute on: read again, with the agents.
    store.lastComputerCatchUp = Date.now() - 61_000
    const rebuilding = vi.spyOn(store, 'rebuildingNow').mockReturnValue(true)
    const held = backend.commands.length
    store.windowCameForward()
    await ms(5)
    expect(
      backend.commands.slice(held).map((command) => command.method),
    ).toEqual(['ensureForeverBox'])
    rebuilding.mockRestore()
    const roster = vi.spyOn(store, 'reloadRoster')
    const next = backend.commands.length
    store.windowCameForward()
    await ms(5)
    expect(roster).toHaveBeenCalledTimes(1)
    expect(
      backend.commands.slice(next).map((command) => command.method),
    ).toEqual(
      expect.arrayContaining(['getForeverBoxStatus', 'ensureForeverBox']),
    )
  })

  it('takes the host’s pushes: a status, the pointer, the helpers and the disk, telling 5c when the disk changes', async () => {
    const { store, backend } = await attached()
    const disk = vi.spyOn(
      store as unknown as { diskPressureChanged: () => void },
      'diskPressureChanged',
    )
    let changes = 0
    store.subscribe(() => (changes += 1))
    backend.push({
      kind: 'computer',
      status: running('a1', {
        handoff: { requestId: 'r1', instruction: 'Sign in to Gmail' },
        diskPressure: { level: 'soft' },
      }),
    })
    expect(store.computer.status('a1')?.handoff?.instruction).toBe(
      'Sign in to Gmail',
    )
    expect(store.diskPressure).toEqual({ level: 'soft' })
    expect(disk).toHaveBeenCalledTimes(1)
    // The same level again changes nothing.
    const seen = changes
    backend.push({ kind: 'diskPressure', pressure: { level: 'soft' } })
    expect(changes).toBe(seen)
    expect(disk).toHaveBeenCalledTimes(1)
    backend.push({ kind: 'diskPressure', pressure: null })
    expect(store.diskPressure).toBeUndefined()
    expect(disk).toHaveBeenCalledTimes(2)
    backend.push({
      kind: 'computerAction',
      action: { agentId: 'a1', type: 'click', x: 640, y: 400 },
    })
    expect(store.pointers.a1).toMatchObject({ x: 640, y: 400, type: 'click' })
    backend.push({ kind: 'computerAction', action: { agentId: 'a1' } })
    expect(store.pointers.a1?.x).toBe(640)
    expect(store.latestComputerStatus?.agentId).toBe('a1')
  })

  it('forgets every computer but who watches when signed out, and drops a start answered after', async () => {
    const backend = new SlowBackend()
    const { store } = await attached(backend)
    backend.delays.ensureForeverBox = 20
    backend.commandAnswers.ensureForeverBox = () => running('a1')
    store.watchComputer('a1')
    backend.push({ kind: 'computer', status: running('a1') })
    backend.push({
      kind: 'computerAction',
      action: { agentId: 'a1', type: 'move', x: 1, y: 2 },
    })
    store.openComputer('a1')
    store.detach()
    await ms(40)
    expect(store.computer.status('a1')).toBeUndefined()
    expect(store.computer.isWatched('a1')).toBe(true)
    expect(store.computer.demanded.size).toBe(0)
    expect(store.pointers).toEqual({})
  })
})

describe('the screen’s socket', () => {
  it('goes through Simeon Labs’ proxy, from the box’s own address', async () => {
    const routes = new Routes()
    routes.on(ensure, () =>
      answer(
        200,
        JSON.stringify({
          gatewayUrl: 'https://box.test',
          gatewayToken: 'g',
          networkToken: 'n-test',
          vncUrl: 'https://box.test/vnc/vnc.html?path=websockify%3Ftoken%3Dt1',
        }),
      ),
    )
    routes.on('/api/listAgents', () => answer(200, '[]'))
    const gateway = makeGateway(routes, {
      pause: (_seconds, signal) =>
        new Promise((resolve) =>
          signal?.addEventListener('abort', () => resolve()),
        ),
    })
    const store = new AppStore()
    await store.attach(new LiveBackend(gateway))
    expect(
      await store.screenSocket(
        'http://127.0.0.1:6080/vnc.html?path=websockify',
      ),
    ).toBe('wss://box.test/vnc/websockify?token=t1')
    expect(await store.screenSocket('http://127.0.0.1:7000/vnc.html')).toBe(
      undefined,
    )
    store.detach()
    // A computer that isn't live has none.
    await store.attach(new FakeBackend())
    expect(
      await store.screenSocket('http://127.0.0.1:6080/vnc.html'),
    ).toBeUndefined()
    store.detach()
  })
})
