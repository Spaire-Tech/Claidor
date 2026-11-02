// The computer's one dialog at a time (ComputerStates.swift's
// `ComputerDialog.current`), and Update Simeon's Computer among the
// window's actions ("/" and ⌘K).

import { describe, expect, it } from 'vitest'
import {
  type RebuildClock,
  RebuildDriver,
  type RebuildInputs,
} from '../core/rebuildDriver'
import { currentDialog } from './ComputerStates'
import { WindowModel, windowActionIds } from './windowModel'

/** Time that moves only when the test says. */
class Clock implements RebuildClock {
  time = 1_000
  private jobs: { at: number; work: () => void }[] = []
  now = () => this.time
  schedule(ms: number, work: () => void): () => void {
    const job = { at: this.time + ms, work }
    this.jobs.push(job)
    return () => {
      this.jobs = this.jobs.filter((one) => one !== job)
    }
  }
  advance(ms: number): void {
    this.time += ms
    for (const job of this.jobs.filter((one) => one.at <= this.time)) {
      this.jobs = this.jobs.filter((one) => one !== job)
      job.work()
    }
  }
}

const settle = async () => {
  for (let i = 0; i < 40; i += 1) await Promise.resolve()
}

function make(): {
  driver: RebuildDriver
  clock: Clock
  inputs: RebuildInputs
} {
  const clock = new Clock()
  const driver = new RebuildDriver(clock)
  const inputs: RebuildInputs = {
    boxId: 'theo',
    isCurrentGroup: false,
    phase: 'running',
    anyRunning: false,
    transportConnected: true,
  }
  driver.connect(
    {
      update: async () => ({ kind: 'started', operationId: 'op1' }),
      reset: async () => ({ kind: 'started', operationId: 'op2' }),
    },
    inputs,
  )
  return { driver, clock, inputs }
}

describe('the computer’s one dialog (`ComputerDialog.current`)', () => {
  it('the question asked, when nothing else shows', () => {
    const { driver } = make()
    expect(currentDialog(driver, undefined)).toBeUndefined()
    expect(currentDialog(driver, { kind: 'update' })).toEqual({
      kind: 'update',
    })
    expect(
      currentDialog(driver, { kind: 'recover', fromSidebar: true }),
    ).toEqual({ kind: 'recoverConfirm', fromSidebar: true })
  })

  it('a rebuild in front, nothing while it is in the background, “taking longer” after two minutes', () => {
    const { driver, clock } = make()
    driver.resetComputer()
    expect(currentDialog(driver, { kind: 'update' })).toEqual({
      kind: 'rebuild',
      rebuild: 'reset',
      longer: false,
    })
    clock.advance(120_000)
    expect(currentDialog(driver, undefined)).toEqual({
      kind: 'rebuild',
      rebuild: 'reset',
      longer: true,
    })
    driver.continueInBackground()
    // In the background its pill shows; nothing else may start meanwhile.
    expect(currentDialog(driver, { kind: 'update' })).toBeUndefined()
  })

  it('the stream away: the question still, then “Couldn’t Reach” after two minutes, and its recovery', () => {
    const { driver, clock, inputs } = make()
    driver.transportChanged({ ...inputs, transportConnected: false })
    clock.advance(2_500)
    expect(driver.lock.kind).toBe('reconnecting')
    expect(currentDialog(driver, { kind: 'update' })).toEqual({
      kind: 'update',
    })
    clock.advance(120_000)
    expect(currentDialog(driver, undefined)).toEqual({ kind: 'unreachable' })
    expect(
      currentDialog(driver, { kind: 'recover', fromSidebar: false }),
    ).toEqual({ kind: 'recoverConfirm', fromSidebar: false })
    // The sidebar's question waits under it.
    expect(
      currentDialog(driver, { kind: 'recover', fromSidebar: true }),
    ).toEqual({ kind: 'unreachable' })
  })

  it('a failed rebuild until dismissed', async () => {
    const { driver } = make()
    driver.recoverComputer()
    await settle()
    driver.migrationEvent({ operationId: 'op2', phase: 'failed', detail: '' })
    await settle()
    expect(currentDialog(driver, { kind: 'update' })).toEqual({
      kind: 'failed',
      rebuild: 'recover',
      episode: 1,
    })
    driver.dismissFailure()
    expect(currentDialog(driver, undefined)).toBeUndefined()
  })
})

describe('Update Simeon’s Computer among the window’s actions', () => {
  it('⌘K’s and "/"’s ids ask its question', () => {
    for (const id of ['update:computer', 'computer-update']) {
      const model = new WindowModel('theo')
      expect(windowActionIds.has(id)).toBe(true)
      expect(model.runAction(id)).toBe(true)
      expect(model.computerAsk).toEqual({ kind: 'update' })
    }
  })
})
