// The rebuild as the window runs it (SimeonCore's `RebuildDriverTests`, in
// ComputerStoreTests.swift), on a clock that moves only when the test says
// (`ManualClock`).

import { describe, expect, it } from 'vitest'
import { RebuildWords } from './computerRebuild'
import type { RecreateAnswer } from './migrationWatch'
import {
  type RebuildClock,
  RebuildDriver,
  type RebuildInputs,
} from './rebuildDriver'

class ManualClock implements RebuildClock {
  time = 1_000
  private jobs: { at: number; id: number; work: () => void }[] = []
  private nextId = 0

  now(): number {
    return this.time
  }

  schedule(ms: number, work: () => void): () => void {
    this.nextId += 1
    const id = this.nextId
    this.jobs.push({ at: this.time + ms, id, work })
    return () => {
      this.jobs = this.jobs.filter((job) => job.id !== id)
    }
  }

  advance(ms: number): void {
    const end = this.time + ms
    for (;;) {
      const due = this.jobs.filter((job) => job.at <= end)
      if (due.length === 0) break
      const next = due.reduce((a, b) => (b.at < a.at ? b : a))
      this.jobs = this.jobs.filter((job) => job.id !== next.id)
      this.time = next.at
      next.work()
    }
    this.time = end
  }
}

/** Lets the calls' answers come in (the core's 40 yields). */
async function settle(): Promise<void> {
  for (let i = 0; i < 40; i += 1) await Promise.resolve()
}

function make(
  update: RecreateAnswer = { kind: 'started', operationId: 'op1' },
  reset: RecreateAnswer = { kind: 'started', operationId: 'op2' },
): { driver: RebuildDriver; clock: ManualClock; inputs: RebuildInputs } {
  const clock = new ManualClock()
  const driver = new RebuildDriver(clock)
  const inputs: RebuildInputs = {
    boxId: 'a',
    isCurrentGroup: false,
    phase: 'running',
    anyRunning: false,
    transportConnected: true,
  }
  driver.connect(
    { update: async () => update, reset: async () => reset },
    inputs,
  )
  return { driver, clock, inputs: { ...inputs } }
}

describe('the rebuild as the window runs it (`RebuildDriverTests`)', () => {
  it('“Reconnecting” after two and a half seconds', () => {
    const { driver, clock, inputs } = make()
    inputs.transportConnected = false
    driver.transportChanged({ ...inputs })
    clock.advance(2_400)
    expect(driver.lock.kind).toBeUndefined()
    clock.advance(200)
    expect(driver.lock.kind).toBe('reconnecting')
    expect(driver.surface.surface).toBe('foreground')
    expect(RebuildWords.reconnecting(driver.lock.stage, false).title).toBe(
      'Reconnecting',
    )
    clock.advance(120_000)
    expect(driver.escalation).toBe('unreachable')
    driver.keepWaiting()
    // Retry only starts the two minutes again.
    expect(driver.escalation).toBeUndefined()
    inputs.transportConnected = true
    driver.transportChanged({ ...inputs })
    expect(RebuildWords.reconnecting(driver.lock.stage, true).title).toBe(
      'Checking connection',
    )
    clock.advance(1_000)
    // It lets go a second after the stream is back.
    expect(driver.lock.kind).toBeUndefined()
    expect(driver.lock.lastResolution).toBe('settled')
  })

  it('no “Reconnecting” for a group', () => {
    const { driver, clock, inputs } = make()
    inputs.boxId = undefined
    inputs.isCurrentGroup = true
    driver.selectionChanged({ ...inputs })
    inputs.transportConnected = false
    driver.transportChanged({ ...inputs })
    clock.advance(5_000)
    expect(driver.lock.kind).toBeUndefined()
  })

  it('an update runs to its end', async () => {
    const { driver, clock, inputs } = make()
    driver.update()
    expect(driver.pendingKind).toBe('update')
    expect(driver.lock.kind).toBe('update')
    expect(driver.lock.stage).toBe('preparing')
    // An update shows as the banner.
    expect(driver.surface.surface).toBe('background')
    expect(driver.isHardLocked).toBe(true)
    await settle()
    expect(driver.lock.hasRequestAcknowledgement).toBe(true)
    inputs.transportConnected = false
    driver.transportChanged({ ...inputs })
    expect(driver.lock.teardownObserved).toBe('transport')
    inputs.phase = 'starting'
    driver.statusChanged({ ...inputs })
    driver.migrationEvent({ operationId: 'op1', phase: 'creating', detail: '' })
    expect(driver.lock.operationId).toBe('op1')
    inputs.transportConnected = true
    driver.transportChanged({ ...inputs })
    driver.migrationEvent({ operationId: 'op1', phase: 'done', detail: '' })
    await settle()
    // The call ends with the operation.
    expect(driver.pendingKind).toBeUndefined()
    inputs.phase = 'running'
    driver.statusChanged({ ...inputs })
    expect(driver.lock.kind).toBe('update')
    clock.advance(999)
    expect(driver.lock.kind).toBe('update')
    clock.advance(1)
    expect(driver.lock.kind).toBeUndefined()
    expect(driver.lock.lastResolution).toBe('settled')
    expect(driver.failure).toBeUndefined()
  })

  it('a refused reset shows its failure', async () => {
    const { driver } = make(undefined, {
      kind: 'rejected',
      reason: "Couldn't reset the computer (no box). It is unchanged.",
    })
    driver.recoverComputer()
    expect(driver.lock.kind).toBe('recover')
    // A recovery shows as the dialog.
    expect(driver.surface.surface).toBe('foreground')
    await settle()
    expect(driver.lock.kind).toBeUndefined()
    expect(driver.failure?.request).toEqual({ kind: 'recover' })
    expect(driver.error).toBe(
      "Couldn't recover the computer (no box). It is unchanged.",
    )
    expect(driver.pendingKind).toBeUndefined()
    driver.dismissFailure()
    expect(driver.failure).toBeUndefined()
  })

  it('an update that can’t be followed blocks further rebuilds', async () => {
    const { driver } = make({ kind: 'untrackable' })
    driver.update()
    await settle()
    expect(driver.isBlocked).toBe(true)
    expect(
      RebuildWords.refusal({
        update: true,
        isBlocked: driver.isBlocked,
        pending: driver.pendingKind,
        canReset: driver.canReset,
        canUpdate: driver.canUpdate,
      }),
    ).toBe(
      'Further computer updates and resets are disabled for this session. Restart Simeon after the computer is available again.',
    )
  })

  it('a queued update waits for the agents', async () => {
    const { driver, inputs } = make()
    inputs.anyRunning = true
    driver.selectionChanged({ ...inputs })
    driver.queueUpdateWhenIdle()
    expect(driver.isUpdateQueued).toBe(true)
    expect(driver.pendingKind).toBeUndefined()
    inputs.anyRunning = false
    driver.selectionChanged({ ...inputs })
    expect(driver.pendingKind).toBe('update')
    await settle()
    // The update's answer clears the queue (`D` in `X`).
    expect(driver.isUpdateQueued).toBe(false)
  })

  it('a computer up to date cancels the queue', () => {
    const { driver, inputs } = make()
    inputs.anyRunning = true
    driver.selectionChanged({ ...inputs })
    driver.queueUpdateWhenIdle()
    inputs.imageUpdateAvailable = false
    driver.statusChanged({ ...inputs })
    expect(driver.isUpdateQueued).toBe(false)
  })

  it('Continue in Background, and back', () => {
    const { driver } = make()
    driver.resetComputer()
    expect(driver.surface.surface).toBe('foreground')
    driver.continueInBackground()
    expect(driver.surface.surface).toBe('background')
    driver.restoreForeground()
    expect(driver.surface.surface).toBe('foreground')
  })

  // Beyond the core's tests: what the web's screens lean on.

  it('a recovery runs to its end with the server’s steps, and a failed one is kept until dismissed', async () => {
    const { driver, clock, inputs } = make()
    driver.recoverComputer()
    await settle()
    expect(driver.lock.operationId).toBe('op2')
    expect(driver.lock.hasRequestAcknowledgement).toBe(true)
    driver.migrationEvent({ operationId: 'op2', phase: 'creating', detail: '' })
    driver.migrationEvent({ operationId: 'op2', phase: 'moving', detail: '' })
    expect(driver.migration.phasesFor('op2')).toEqual(['creating', 'moving'])
    driver.migrationEvent({ operationId: 'op2', phase: 'done', detail: '' })
    await settle()
    expect(driver.pendingKind).toBeUndefined()
    clock.advance(1_000)
    expect(driver.lock.kind).toBeUndefined()
    expect(driver.failure).toBeUndefined()
    void inputs

    const failing = make(undefined, { kind: 'started', operationId: 'op3' })
    failing.driver.recoverComputer()
    await settle()
    failing.driver.migrationEvent({
      operationId: 'op3',
      phase: 'failed',
      detail: '',
    })
    await settle()
    expect(failing.driver.lock.kind).toBeUndefined()
    expect(failing.driver.failure?.request).toEqual({ kind: 'recover' })
    expect(failing.driver.error).toBe(
      'The computer recovery failed. Try again.',
    )
    failing.driver.dismissFailure()
    expect(failing.driver.failure).toBeUndefined()
  })

  it('taking longer after two minutes, and Keep waiting starts them again', () => {
    const { driver, clock } = make()
    driver.resetComputer()
    clock.advance(119_999)
    expect(driver.escalation).toBeUndefined()
    clock.advance(1)
    expect(driver.escalation).toBe('taking-longer')
    driver.keepWaiting()
    expect(driver.escalation).toBeUndefined()
    clock.advance(120_000)
    expect(driver.escalation).toBe('taking-longer')
  })

  it('tells the window only when what it shows moved', () => {
    const { driver, inputs } = make()
    let told = 0
    driver.onChange = () => (told += 1)
    driver.statusChanged({ ...inputs })
    expect(told).toBe(0)
    driver.resetComputer()
    expect(told).toBeGreaterThan(0)
  })

  it('says a refused reset’s words of a recovery', () => {
    expect(
      RebuildDriver.saidOfRecover(
        "Couldn't reset the computer. It is unchanged.",
      ),
    ).toBe("Couldn't recover the computer. It is unchanged.")
    expect(
      RebuildDriver.saidOfRecover(
        "Couldn't reset the computer (quota). It is unchanged.",
      ),
    ).toBe("Couldn't recover the computer (quota). It is unchanged.")
    expect(RebuildDriver.saidOfRecover('Something else.')).toBe(
      'Something else.',
    )
  })
})
