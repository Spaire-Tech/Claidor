// Step 5c's store against a stand-in computer and server: the rebuild
// followed as the Mac follows it (SimeonCore's `FollowingTheRebuildTests`,
// `testUpdateOfferFollowsTheWindow` in ComputerStoreTests.swift,
// `testAComputerAsleepOnPurposeIsNotReconnecting` in
// SleepingComputerTests.swift), and the store's commands: the recovery and
// the update through the server's calls and its stream, Disk Saver, the
// list held still through a rebuild.

import { describe, expect, it } from 'vitest'
import { checkingAccess } from './access'
import type { JSONValue } from './json'
import { field, str } from './json'
import type { RebuildServer, RecreateAnswer } from './migrationWatch'
import { makeAgent } from './models'
import { AppStore } from './store'
import { FakeBackend, eventually, ms } from './testing'

/** The computer's disk news (`box-disk-pressure`): 5b keeps it and tells 5c (`diskPressureChanged`). */
function diskNews(store: AppStore, level: string | undefined): void {
  store.apply({
    kind: 'diskPressure',
    pressure: level === undefined ? null : { level },
  })
}

/** An agent's computer as the host pushes it (`forever-box`), kept by 5b's book. */
function status(store: AppStore, fields: Record<string, JSONValue>): void {
  store.apply({ kind: 'computer', status: { agentId: 'theo', ...fields } })
}

/** The server's side, as the test tells it: the two recreates' answers, and the record's stream, fed by the test. */
class FakeServer implements RebuildServer {
  updates: boolean[] = []
  resets = 0
  updateAnswer: RecreateAnswer = { kind: 'started', operationId: 'op1' }
  resetAnswer: RecreateAnswer = { kind: 'started', operationId: 'op2' }
  offsets: string[] = []
  private feed?: (message: JSONValue | 'end') => void

  async updateComputer(force: boolean): Promise<RecreateAnswer> {
    this.updates.push(force)
    return this.updateAnswer
  }

  async resetComputer(): Promise<RecreateAnswer> {
    this.resets += 1
    return this.resetAnswer
  }

  watchMigration(from: string, signal: AbortSignal): AsyncIterable<JSONValue> {
    this.offsets.push(from)
    const queue: (JSONValue | 'end')[] = []
    let wake: (() => void) | undefined
    this.feed = (message) => {
      queue.push(message)
      wake?.()
    }
    signal.addEventListener('abort', () => {
      queue.push('end')
      wake?.()
    })
    return {
      [Symbol.asyncIterator]: async function* () {
        for (;;) {
          const next = queue.shift()
          if (next === 'end') return
          if (next !== undefined) {
            yield next
            continue
          }
          await new Promise<void>((resolve) => (wake = resolve))
        }
      },
    }
  }

  /** A step of the server's record, on the stream that is open. */
  step(phase: number, operationId: string, offsetKey: string): void {
    this.feed?.({ phase, operationId, offsetKey, detail: '' })
  }
}

/** The stand-in computer, which counts each time it is asked for again (`invalidate`: the new one has new tokens). */
class Computer extends FakeBackend {
  invalidations = 0
  invalidate(): void {
    this.invalidations += 1
  }
}

function roster(): Computer {
  const backend = new Computer()
  backend.agents = [
    makeAgent({ id: 'theo', name: 'Theo' }),
    makeAgent({ id: 'squad', name: 'Launch squad', isGroup: true }),
  ]
  return backend
}

describe('the rebuild followed (`FollowingTheRebuildTests`)', () => {
  it('only the app that starts Disk Saver makes one', async () => {
    for (const starts of [true, false]) {
      const backend = roster()
      backend.commandAnswers.createAgent = () => ({ agent: { id: 'saver' } })
      const store = new AppStore()
      store.startsDiskSaver = starts
      await store.attach(backend)
      diskNews(store, 'soft')
      expect(store.diskLevel).toBe('soft')
      await ms(20)
      const made = backend.commands.filter((c) => c.method === 'createAgent')
      expect(made.length, `starts: ${starts}`).toBe(starts ? 1 : 0)
      if (starts) {
        const args = made[0]!.args
        expect(field(args, 'name')).toBe('Disk Saver')
        expect(field(args, 'purpose')).toBe('disk-saver')
        expect(field(args, 'origin')).toBe('user')
        expect(field(args, 'isKickstartRequested')).toBe(true)
        expect(str(field(args, 'clientNonce'))).toMatch(/^ios-/)
      } else {
        // "Go to Disk Saver" still makes one when asked.
        expect(await store.launchDiskSaver()).toBe('saver')
        expect(backend.commands.some((c) => c.method === 'createAgent')).toBe(
          true,
        )
      }
      store.detach()
    }
  })

  it('an idle Disk Saver is asked to audit, once each time the disk runs low', async () => {
    const backend = roster()
    backend.agents.push(
      makeAgent({ id: 'saver', name: 'Disk Saver', purpose: 'disk-saver' }),
    )
    const store = new AppStore()
    store.startsDiskSaver = true
    await store.attach(backend)
    diskNews(store, 'soft')
    diskNews(store, 'hard')
    await ms(10)
    const audits = () =>
      backend.commands.filter((c) => c.method === 'requestDiskSaverAudit')
    expect(audits().map((c) => c.args)).toEqual([{ id: 'saver' }])
    expect(await store.launchDiskSaver()).toBe('saver')
    diskNews(store, undefined)
    diskNews(store, 'soft')
    await ms(10)
    expect(audits()).toHaveLength(2)
    expect(backend.commands.some((c) => c.method === 'createAgent')).toBe(false)
  })

  it('sending waits through a rebuild where it is followed', async () => {
    for (const follows of [true, false]) {
      const store = new AppStore()
      store.followsRebuild = follows
      await store.attach(roster())
      store.setWindowSelection('theo')
      expect(store.isSendingPaused).toBe(false)
      // The server replacing the computer: the lock is held for the selected agent (`box-migration`).
      store.apply({
        kind: 'migration',
        event: { operationId: 'op', phase: 'creating', detail: '' },
      })
      expect(store.rebuild.isHardLocked).toBe(true)
      expect(store.rebuildingNow()).toBe(true)
      expect(store.isSendingPaused, `follows: ${follows}`).toBe(follows)
      store.detach()
      expect(store.rebuild.lock.kind).toBeUndefined()
    }
  })

  it('sending waits while this account has no Simeon', async () => {
    const store = new AppStore()
    await store.attach(roster())
    expect(store.isSendingPaused).toBe(false)
    store.access = { state: 'paymentRequired', reason: 'paywallIndividual' }
    expect(store.isSendingPaused).toBe(true)
    store.access = checkingAccess
    expect(store.isSendingPaused).toBe(false)
  })
})

describe('Update Simeon’s Computer is offered as the window offers it (`testUpdateOfferFollowsTheWindow`)', () => {
  it('for an open agent until its computer is known up to date, and not while queued', async () => {
    const store = new AppStore()
    await store.attach(roster())
    expect(store.computerUpdateOffer, 'no agent open').toBeUndefined()
    store.setWindowSelection('theo')
    expect(store.computerUpdateOffer, 'unknown: offered').toBe('ready')
    expect(store.computerUpdateAvailable).toBe(false)
    status(store, { state: 'running', imageUpdateAvailable: false })
    expect(store.computerUpdateOffer, 'known up to date').toBeUndefined()
    status(store, { state: 'running', imageUpdateAvailable: true })
    expect(store.computerUpdateOffer).toBe('ready')
    expect(store.computerUpdateAvailable).toBe(true)
    store.setWindowSelection('squad')
    expect(store.computerUpdateOffer, 'not for a group').toBeUndefined()
    store.setWindowSelection('theo')
    store.rebuild.queueUpdateWhenIdle()
    expect(store.computerUpdateOffer, 'queued or under way').toBeUndefined()
    store.detach()
  })

  it('with an agent at work: “Update anyway” or “when done”, and its name', async () => {
    const backend = roster()
    backend.agents[0] = makeAgent({ id: 'theo', name: 'Theo', isRunning: true })
    const store = new AppStore()
    await store.attach(backend)
    store.setWindowSelection('theo')
    expect(store.computerUpdateOffer).toBe('busy-override')
    expect(store.workingAgentNames).toEqual(['Theo'])
  })
})

describe('the rebuild follows the selected computer’s status (5b’s book, `computerChanged`)', () => {
  it('its phase; a computer that starts pulling by itself is an update', async () => {
    const store = new AppStore()
    await store.attach(roster())
    store.apply({ kind: 'connection', live: true })
    store.setWindowSelection('theo')
    status(store, {
      state: 'running',
      vncUrl: 'http://127.0.0.1:6080/vnc.html',
    })
    expect(store.rebuild.lock.boxPhase).toBe('running')
    expect(store.rebuild.lock.kind).toBeUndefined()
    status(store, { state: 'running', pull: { percent: 40 } })
    expect(store.rebuild.lock.boxPhase).toBe('pulling')
    expect(store.rebuild.lock.kind).toBe('update')
    expect(store.rebuild.lock.updateSource).toBe('auto')
    expect(store.rebuildSteps('update').progress).toBeCloseTo((2 + 0.4) / 6, 9)
    store.detach()
  })
})

describe('a computer asleep on purpose is not “Reconnecting” (`SleepingComputerTests`)', () => {
  it('the stream asleep counts as there', () => {
    const store = new AppStore()
    store.apply({ kind: 'connection', live: true })
    store.apply({ kind: 'connection', live: false })
    expect(store.isDown).toBe(true)
    expect(store.rebuild.inputs.transportConnected).toBe(false)
    store.apply({ kind: 'computerAsleep', asleep: true })
    expect(store.isAsleep).toBe(true)
    // Messages still go to the server.
    expect(store.isDown).toBe(true)
    expect(store.rebuild.inputs.transportConnected).toBe(true)
    store.apply({ kind: 'connection', live: true })
    expect(store.isAsleep).toBe(false)
    expect(store.rebuild.inputs.transportConnected).toBe(true)
  })
})

describe('the store’s rebuild commands, against a stand-in server', () => {
  async function started(): Promise<{
    store: AppStore
    backend: Computer
    server: FakeServer
    invalidated: () => number
  }> {
    const backend = roster()
    const server = new FakeServer()
    const store = new AppStore()
    store.rebuildServerFor = () => server
    await store.attach(backend)
    store.apply({ kind: 'connection', live: true })
    store.setWindowSelection('theo')
    return {
      store,
      backend,
      server,
      invalidated: () => backend.invalidations,
    }
  }

  it('a recovery: the server asked, its record followed to the end, the lock let go a second later', async () => {
    const { store, server, invalidated } = await started()
    await eventually(() => server.offsets.length === 1)
    expect(server.offsets).toEqual([''])
    store.rebuild.recoverComputer()
    expect(store.rebuild.lock.kind).toBe('recover')
    expect(store.rebuild.surface.surface).toBe('foreground')
    await eventually(() => store.rebuild.lock.operationId === 'op2')
    expect(server.resets).toBe(1)
    // The computer is asked for again: the new one has new tokens.
    expect(invalidated()).toBe(1)
    server.step(2, 'op2', '1')
    await eventually(() => store.rebuild.migration.phase === 'creating')
    expect(store.rebuildSteps('recover').activeIndex).toBe(1)
    server.step(3, 'op2', '2')
    await eventually(() => store.rebuildSteps('recover').activeIndex === 2)
    server.step(6, 'op2', '3')
    await eventually(() => store.rebuild.pendingKind === undefined)
    expect(store.rebuild.lock.kind).toBe('recover')
    await eventually(() => store.rebuild.lock.kind === undefined)
    expect(store.rebuild.lock.lastResolution).toBe('settled')
    expect(store.rebuild.failure).toBeUndefined()
    store.detach()
  })

  it('an update: forced or not, as asked; refused, it shows its failure', async () => {
    const { store, server } = await started()
    store.rebuild.update(true)
    expect(store.rebuild.surface.surface).toBe('background')
    await eventually(() => server.updates.length === 1)
    expect(server.updates).toEqual([true])
    store.detach()

    const second = await started()
    second.server.updateAnswer = { kind: 'rejected', reason: 'no' }
    second.store.rebuild.update()
    await eventually(() => second.store.rebuild.failure !== undefined)
    expect(second.store.rebuild.failure?.request).toEqual({
      kind: 'update',
      force: false,
    })
    expect(second.store.rebuild.error).toBe(
      "Couldn't update the computer. Check your connection and try again.",
    )
    second.store.detach()
  })

  it('the server’s last step is read back when the stream returns', async () => {
    const { store, server } = await started()
    await eventually(() => server.offsets.length === 1)
    server.step(1, 'op9', '1')
    await eventually(() => store.rebuild.migration.phase === 'backing-up')
    // The server moving the computer by itself: the lock is held (an update from the move).
    expect(store.rebuild.lock.kind).toBe('update')
    expect(store.rebuild.lock.updateSource).toBe('migration')
    store.apply({ kind: 'connection', live: false })
    store.apply({ kind: 'connection', live: true })
    expect(store.rebuild.migration.operationId).toBe('op9')
    store.detach()
  })

  it('the language told again each time the stream comes back (a computer rebuilt meanwhile starts with none)', async () => {
    const { store, backend } = await started()
    const told = () =>
      backend.commands.filter(
        (c) =>
          c.method === 'setHostSettings' &&
          field(c.args, 'userLanguage') !== undefined,
      )
    await eventually(() => told().length === 1)
    expect(told()[0]).toEqual({
      method: 'setHostSettings',
      args: { userLanguage: 'en' },
      wakes: false,
    })
    store.apply({ kind: 'connection', live: false })
    store.apply({ kind: 'connection', live: true })
    await eventually(() => told().length === 2)
    await eventually(() =>
      backend.serverCalls.some((c) => c.path === 'user/profile'),
    )
    expect(
      backend.serverCalls.filter((c) => c.path === 'user/profile')[0],
    ).toEqual({
      path: 'user/profile',
      method: 'POST',
      body: { language: 'en' },
    })
    store.detach()
  })

  it('the list holds still through a rebuild, and is read again after', async () => {
    const { store, backend } = await started()
    const list = backend.listAgents.bind(backend)
    let lists = 0
    backend.listAgents = () => {
      lists += 1
      return list()
    }
    store.apply({
      kind: 'migration',
      event: { operationId: 'op', phase: 'wiping', detail: '' },
    })
    expect(store.rebuild.isHardLocked).toBe(true)
    // A roster push meanwhile is held: the list shown doesn't change (Store.swift's `rosterHeld`).
    expect(store.holdsRoster()).toBe(true)
    const shown = store.agents
    store.apply({ kind: 'agents', agents: [] })
    store.apply({
      kind: 'agentUpserted',
      agent: { ...shown[0]!, name: 'Renamed meanwhile' },
    })
    expect(store.agents).toBe(shown)
    await ms(10)
    expect(lists).toBe(0)
    store.apply({
      kind: 'migration',
      event: { operationId: 'op', phase: 'failed', detail: '' },
    })
    expect(store.rebuild.isHardLocked).toBe(false)
    expect(store.rebuild.failure?.request).toEqual({ kind: 'reset' })
    expect(store.holdsRoster()).toBe(false)
    // The freeze over: the list read again, once.
    await eventually(() => lists === 1)
    await ms(10)
    expect(lists).toBe(1)
    store.detach()
  })
})
