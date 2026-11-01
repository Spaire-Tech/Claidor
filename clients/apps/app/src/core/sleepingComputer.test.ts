// The shared core's `SleepingComputerTests` (the gateway's part; the screens'
// part comes with them in step 2): where the server lets the box sleep while
// the app is open, the app says so on its requests, does not dial a box the
// broker records as asleep, and reads do not wake it.

import { describe, expect, it } from 'vitest'
import { GatewayConnection, GatewayError } from './gateway'
import type { JSONValue } from './json'
import { arr } from './json'
import { MemorySavedGateway, encodeSavedGateway } from './savedGateway'
import { Routes, answer, ensure, makeGateway, ms, runState } from './testing'

const listAgents = '/api/listAgents'

function sleepyBox(letsSleep: boolean): string {
  return `{"gatewayUrl":"https://box.test","gatewayToken":"g","networkToken":"n","letsSleep":${letsSleep}}`
}

/** The address kept from the last launch, with the server's word on sleep then. */
function keptSleep(letsSleep: boolean): MemorySavedGateway {
  return new MemorySavedGateway(
    encodeSavedGateway(
      new GatewayConnection({
        baseURL: 'https://box.test',
        token: 'g',
        networkToken: 'n',
        letsSleep,
      }),
      'u1',
      new Date(),
    ),
  )
}

/** The record's answer: `state` (1 none, 2 asleep, 3 running) and the server's word on sleep. */
function record(state: number, letsSleep = true): string {
  return `{"state":${state},"letsSleep":${letsSleep}}`
}

const atOnce = async () => {
  await Promise.resolve()
}

async function rested(call: () => Promise<JSONValue>): Promise<boolean> {
  try {
    await call()
    return false
  } catch (error) {
    return GatewayError.isResting(error)
  }
}

describe('the computer used only for runs', () => {
  it("reads the server's word and says it on every request", () => {
    const sleeps = GatewayConnection.fromBox(JSON.parse(sleepyBox(true)))
    expect(sleeps.letsSleep).toBe(true)
    expect(sleeps.headers()['x-simeon-lets-sleep']).toBe('1')
    expect(
      sleeps.commandRequest('listAgents', {}).headers['x-simeon-lets-sleep'],
    ).toBe('1')
    expect(sleeps.eventsRequest().headers['x-simeon-lets-sleep']).toBe('1')
    const keeps = GatewayConnection.fromBox(JSON.parse(sleepyBox(false)))
    expect(keeps.letsSleep).toBe(false)
    expect(keeps.headers()['x-simeon-lets-sleep']).toBeUndefined()
    // An answer from a server built before says nothing: awake while open, as before.
    expect(
      GatewayConnection.fromBox({ gatewayUrl: 'https://box.test' }).letsSleep,
    ).toBe(false)
  })

  it('waits for an asleep box on the record, and does not dial it until it runs', async () => {
    const http = new Routes()
    http.on(ensure, () => answer(200, sleepyBox(true)))
    let reads = 0
    // Asleep for the first read and the next 15-second one, then running (woken for a message).
    http.on(runState, () => answer(200, `{"state":${reads++ < 2 ? 2 : 3}}`))
    const gateway = makeGateway(http, { pause: atOnce })
    await gateway.currentConnection()
    expect(http.count(ensure)).toBe(1)
    const told: boolean[] = []
    expect(await gateway.waitWhileAsleep((asleep) => told.push(asleep))).toBe(
      true,
    )
    expect(told).toEqual([true])
    expect(http.count(runState)).toBe(3)
    expect(http.count(ensure)).toBe(1)
  })

  it('ends the wait when something needs the box and wakes it', async () => {
    const http = new Routes()
    http.on(ensure, () => answer(200, sleepyBox(true)))
    http.on(runState, () => answer(200, '{"state":2}'))
    const gateway = makeGateway(http, { pause: () => ms(5) })
    await gateway.currentConnection()
    const told: boolean[] = []
    const waiting = gateway.waitWhileAsleep((asleep) => told.push(asleep))
    for (let i = 0; i < 200 && told.length === 0; i += 1) await ms(2)
    expect(told).toEqual([true])
    // A command: the box no longer answers at its address, the broker is asked, and wakes it.
    gateway.invalidate()
    await gateway.currentConnection()
    expect(await waiting).toBe(true)
    expect(http.count(ensure)).toBe(2)
  })

  it('ends the wait at once when told the server is waking it', async () => {
    const http = new Routes()
    http.on(ensure, () => answer(200, sleepyBox(true)))
    http.on(runState, () => answer(200, '{"state":2}'))
    const gateway = makeGateway(http, { pause: () => ms(20) })
    await gateway.currentConnection()
    const told: boolean[] = []
    const waiting = gateway.waitWhileAsleep((asleep) => told.push(asleep))
    for (let i = 0; i < 200 && told.length === 0; i += 1) await ms(2)
    expect(told).toEqual([true])
    gateway.waking()
    expect(await waiting).toBe(true)
    expect(http.count(runState)).toBe(1)
  })

  it('waits for nothing where the server keeps it awake or it runs', async () => {
    const http = new Routes()
    http.on(ensure, () => answer(200, sleepyBox(false)))
    http.on(runState, () => answer(200, '{"state":2}'))
    const gateway = makeGateway(http, { pause: atOnce })
    await gateway.currentConnection()
    const told: boolean[] = []
    expect(await gateway.waitWhileAsleep((asleep) => told.push(asleep))).toBe(
      false,
    )
    expect(http.count(runState)).toBe(0)

    const running = new Routes()
    running.on(ensure, () => answer(200, sleepyBox(true)))
    running.on(runState, () => answer(200, '{"state":3}'))
    const other = makeGateway(running, { pause: atOnce })
    await other.currentConnection()
    expect(await other.waitWhileAsleep((asleep) => told.push(asleep))).toBe(
      false,
    )
    expect(told).toEqual([false])
  })

  it('asks the record at a launch that may let it sleep, and reads let it rest until an action wakes it', async () => {
    const http = new Routes()
    http.on(ensure, () => answer(200, sleepyBox(true)))
    http.on(runState, () => answer(200, record(2)))
    http.on(listAgents, () => answer(200, '[]'))
    http.on('/api/sendPrompt', () => answer(200, '{}'))
    http.on('/health', () => answer(200, '{"ok":true}'))
    const gateway = makeGateway(http, { saved: keptSleep(true), pause: atOnce })
    expect(await gateway.restAtLaunch()).toBe('asleep')
    expect(
      await rested(() => gateway.command('listAgents', {}, { wakes: false })),
    ).toBe(true)
    expect(
      await rested(() =>
        gateway.command(
          'getAgentTranscriptTail',
          { id: 'theo' },
          { wakes: false },
        ),
      ),
    ).toBe(true)
    expect(http.count(ensure)).toBe(0)
    expect(http.count(listAgents)).toBe(0)
    expect(http.count(runState)).toBe(1)
    // An action (a message) wakes it, as before; then reads go to it.
    await gateway.command('sendPrompt', { id: 'theo' })
    expect(await gateway.restAtLaunch()).toBeNull()
    await gateway.command('listAgents', {}, { wakes: false })
    expect(http.count(listAgents)).toBe(1)
  })

  it("does not make a new account's computer at launch, only at its first task", async () => {
    const http = new Routes()
    http.on(ensure, () => answer(200, sleepyBox(true)))
    http.on(runState, () => answer(200, record(1)))
    http.on('/api/countAgents', () => answer(200, '{"count":0}'))
    const gateway = makeGateway(http, { pause: () => ms(5) })
    expect(await gateway.restAtLaunch()).toBe('absent')
    expect(
      await rested(() => gateway.command('listAgents', {}, { wakes: false })),
    ).toBe(true)
    // The events wait without dialling, which would make it.
    const told: boolean[] = []
    const waiting = gateway.waitWhileAsleep((asleep) => told.push(asleep), {
      ask: false,
    })
    for (let i = 0; i < 200 && told.length === 0; i += 1) await ms(2)
    expect(told).toEqual([true])
    expect(http.count(ensure)).toBe(0)
    // The first run's hand-off: its first task makes it.
    await gateway.command('countAgents')
    expect(await waiting).toBe(true)
    expect(http.count(ensure)).toBe(1)
    expect(await gateway.restAtLaunch()).toBeNull()
  })

  it('asks nothing at launch where the server kept it awake', async () => {
    const http = new Routes()
    http.on(ensure, () => answer(200, sleepyBox(false)))
    http.on(runState, () => answer(200, record(2, false)))
    http.on(listAgents, () => answer(200, '[]'))
    const gateway = makeGateway(http, {
      saved: keptSleep(false),
      pause: atOnce,
    })
    expect(await gateway.restAtLaunch()).toBeNull()
    await gateway.command('listAgents', {}, { wakes: false })
    expect(http.count(listAgents)).toBe(1)
    expect(http.count(runState)).toBe(0)
  })

  it('hears a switch turned off over the address kept', async () => {
    const http = new Routes()
    http.on(ensure, () => answer(200, sleepyBox(false)))
    // Asleep, and the server no longer lets an open app leave it so.
    http.on(runState, () => answer(200, record(2, false)))
    http.on(listAgents, () => answer(200, '[]'))
    const gateway = makeGateway(http, { saved: keptSleep(true), pause: atOnce })
    expect(await gateway.restAtLaunch()).toBeNull()
    await gateway.command('listAgents', {}, { wakes: false })
    expect(http.count(listAgents)).toBe(1)
    expect(await gateway.waitWhileAsleep(() => {})).toBe(false)
  })

  it('makes a read as a chat opens wait for the box without waking it', async () => {
    const http = new Routes()
    http.on(ensure, () => answer(200, sleepyBox(true)))
    http.on(runState, () => answer(200, record(2)))
    http.on('/api/getAgentWorkflows', () => answer(200, '[{"name":"Plan"}]'))
    http.on('/api/sendPrompt', () => answer(200, '{}'))
    http.on('/health', () => answer(200, '{"ok":true}'))
    const gateway = makeGateway(http, {
      saved: keptSleep(true),
      pause: () => ms(2),
    })
    const reading = gateway.commandWhenAwake('getAgentWorkflows', {
      id: 'theo',
    })
    await ms(60)
    expect(http.count('/api/getAgentWorkflows')).toBe(0)
    expect(http.count(ensure)).toBe(0)
    // A message wakes it: the read goes on.
    await gateway.command('sendPrompt', { id: 'theo' })
    expect(arr(await reading)).toHaveLength(1)

    // Its screen closed while the box rests: it ends, having read nothing.
    const quiet = new Routes()
    quiet.on(runState, () => answer(200, record(2)))
    const other = makeGateway(quiet, {
      saved: keptSleep(true),
      pause: () => ms(2),
    })
    const screen = new AbortController()
    const closed = other.commandWhenAwake(
      'getAgentWorkflows',
      {},
      screen.signal,
    )
    await ms(30)
    screen.abort()
    await expect(closed).rejects.toMatchObject({ name: 'AbortError' })
    expect(quiet.count('/api/getAgentWorkflows') + quiet.count(ensure)).toBe(0)
  })
})
