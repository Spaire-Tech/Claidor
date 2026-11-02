// The rebuild lock against the shipped window's own code (SimeonCore's
// `ComputerRebuildTests`): the core's own fixture, read where it is
// (ios/SimeonCore/Tests/SimeonCoreTests/Fixtures/rebuild-lock.json), was
// made by running the main bundle's `Kae`/`Qyn`/`e6n`/`yft` on random
// events, `J1t` on every kind, stage and server phase, `FPt` on random
// server events and `R$n` on random lock changes, and its confirmations'
// words (`K1t`, `FAe`, `Gbn`, `zAe`, `RAe`).

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  type ComputerPhase,
  type MigrationPhase,
  MigrationRecord,
  type RebuildEvent,
  type RebuildKind,
  RebuildLock,
  type RebuildResolution,
  type RebuildSource,
  type RebuildStage,
  RebuildSurface,
  RebuildWords,
  migrationEventFrom,
  nameList,
  projectSteps,
  resetLabels,
  updateAvailability,
} from './computerRebuild'

/* eslint-disable @typescript-eslint/no-explicit-any */
const fixtures: any = JSON.parse(
  readFileSync(
    new URL(
      '../../../../../ios/SimeonCore/Tests/SimeonCoreTests/Fixtures/rebuild-lock.json',
      import.meta.url,
    ),
    'utf8',
  ),
)

const some = <T>(value: T | null | undefined): T | undefined =>
  value === null ? undefined : value

function event(e: any): RebuildEvent {
  const at = e.at as number
  switch (e.type) {
    case 'request':
      return {
        type: 'request',
        kind: e.kind as RebuildKind,
        operationId: some(e.operationId),
        source: some(e.source) as RebuildSource | undefined,
        at,
      }
    case 'pending':
      return { type: 'pending', isPending: e.isPending, at }
    case 'acknowledged':
      return { type: 'acknowledged', at }
    case 'image-update':
      return { type: 'imageUpdate', available: some(e.available), at }
    case 'box':
      return {
        type: 'box',
        boxId: some(e.boxId),
        phase: e.phase as ComputerPhase,
        at,
      }
    case 'migration':
      return {
        type: 'migration',
        phase: e.phase as MigrationPhase,
        operationId: some(e.operationId),
        at,
      }
    case 'connection':
      return { type: 'connection', isConnected: e.isConnected, at }
    case 'error':
      return { type: 'error', at }
    case 'deactivate':
      return { type: 'deactivate', at }
    default:
      return { type: 'tick', at }
  }
}

/** The lock's fields in the fixture's order, undefined written as null. */
function fields(s: RebuildLock): unknown[] {
  const n = (value: unknown) => (value === undefined ? null : value)
  return [
    n(s.kind),
    n(s.operationId),
    n(s.updateSource),
    n(s.lockBoxId),
    s.isPending,
    s.hasRequestAcknowledgement,
    n(s.imageUpdateAvailable),
    s.expectsImageUpgrade,
    s.boxPhase,
    n(s.observedBoxId),
    n(s.lastHealthyBoxId),
    s.hasLeftHealthy,
    s.teardownObserved,
    s.reconnectedSinceLeft,
    n(s.readySince),
    s.isConnected,
    n(s.connectedSince),
    n(s.resetOperationId),
    s.hasTerminalMigration,
    n(s.lastResolution),
    n(s.lastResolutionKind),
  ]
}

describe('the rebuild (`ComputerRebuildTests`)', () => {
  it('the lock follows the window', () => {
    const keys = fixtures.keys as string[]
    let steps = 0
    fixtures.sequences.forEach((sequence: any, n: number) => {
      let lock = new RebuildLock(
        sequence.phase as ComputerPhase,
        some(sequence.image),
      )
      sequence.steps.forEach((row: any[], i: number) => {
        lock = lock.step(event(row[0]))
        const want = row[1] as unknown[]
        const got = fields(lock)
        keys.forEach((key, k) => {
          if (got[k] !== want[k])
            expect.fail(
              `sequence ${n} step ${i} (${JSON.stringify(row[0])}): ${key} is ${String(got[k])}, the window has ${String(want[k])}`,
            )
        })
        expect(lock.stage ?? null, `sequence ${n} step ${i}: stage`).toBe(
          row[2],
        )
        expect(lock.settleAt ?? null, `sequence ${n} step ${i}: settle`).toBe(
          row[3],
        )
        steps += 1
      })
    })
    expect(steps).toBeGreaterThan(2000)
  })

  it('the steps and how far', () => {
    for (const row of fixtures.projections as any[]) {
      const projected = projectSteps(
        row[0] as RebuildKind,
        row[1] as RebuildStage,
        some(row[2]) as MigrationPhase | undefined,
        row[3] as MigrationPhase[],
        some(row[4]),
      )
      expect(projected.activeIndex, JSON.stringify(row)).toBe(row[5])
      expect(projected.progress, JSON.stringify(row)).toBeCloseTo(row[6], 9)
    }
    const reset = projectSteps('reset', 'tearingDown', undefined, [], undefined)
    expect(reset.steps.map((step) => step.label)).toEqual(resetLabels())
    expect(reset.steps.map((step) => step.state)).toEqual([
      'done',
      'active',
      'pending',
      'pending',
      'pending',
      'pending',
    ])
  })

  it('the server’s steps', () => {
    for (const steps of fixtures.records as any[]) {
      const record = new MigrationRecord()
      for (const step of steps) {
        const e = step.event
        record.ingest(
          e === null
            ? undefined
            : {
                operationId: some(e.operationId),
                phase: e.phase,
                detail: e.detail ?? '',
              },
        )
        const where = JSON.stringify(step)
        expect(record.phase ?? null, where).toBe(step.phase ?? null)
        expect(record.operationId ?? null, where).toBe(step.operationId ?? null)
        expect(record.phases, where).toEqual(step.phases)
        expect(record.last?.phase ?? null, where).toBe(step.raw?.phase ?? null)
      }
    }
  })

  it('the dialog or the banner', () => {
    for (const steps of fixtures.surfaces as any[]) {
      const surface = new RebuildSurface()
      for (const step of steps) {
        const input = step.input
        switch (input.action) {
          case 'lock':
            surface.lockChanged({
              kind: some(input.kind) as RebuildKind | undefined,
              operationId: some(input.operationId),
              boxId: some(input.boxId),
              lastResolution: some(input.lastResolution) as
                | RebuildResolution
                | undefined,
            })
            break
          case 'pending':
            surface.pendingChanged(
              some(input.pendingKind) as RebuildKind | undefined,
            )
            break
          case 'background':
            surface.continueInBackground()
            break
          default:
            surface.restoreForeground()
        }
        expect(surface.surface ?? null, JSON.stringify(steps)).toBe(
          step.surface,
        )
      }
    }
  })

  it('the words', () => {
    const copy = fixtures.copy
    const idle = RebuildWords.updateIdle()
    expect(idle.title).toBe(copy.idle.title)
    expect(idle.description).toBe(copy.idle.description)
    expect(idle.confirm).toBe(copy.idle.confirmLabel)
    expect(idle.cancel).toBe(copy.idle.cancelLabel)
    for (const [key, names] of [
      ['one', ['Nora']],
      ['oneBlank', ['  ']],
      ['two', ['Nora', 'Ben']],
    ] as [string, string[]][]) {
      const busy = RebuildWords.updateBusy(names)
      expect(busy.title).toBe(copy[key].title)
      expect(busy.description).toBe(copy[key].description)
      expect(busy.confirm).toBe(copy[key].confirmLabel)
      expect(busy.secondary).toBe(copy[key].secondary.label)
    }
    for (const row of copy.lists) expect(nameList(row.names)).toBe(row.text)
    for (const row of copy.guards)
      expect(
        RebuildWords.refusal({
          update: row.action === 'update',
          isBlocked: row.isBlocked,
          pending: some(row.pendingKind) as RebuildKind | undefined,
          canReset: row.canReset,
          canUpdate: row.canUpdate,
        }) ?? null,
      ).toBe(row.text)
    for (const row of copy.availability)
      expect(
        updateAvailability({
          canUpdateBaseline: row.canUpdateBaseline,
          canUpdateBox: row.canUpdateBox,
          isBoxUpToDate: row.isBoxUpToDate,
          isUpdateQueued: row.isUpdateQueued,
        }),
      ).toBe(row.out)
  })

  it('reads the server’s message, its phase a number or a name', () => {
    expect(
      migrationEventFrom({ phase: 2, operationId: 'op', offsetKey: '1' }),
    ).toEqual({ operationId: 'op', phase: 'creating', detail: '' })
    expect(
      migrationEventFrom({ phase: 'cleaning-up', detail: 'Tidying' }),
    ).toEqual({
      operationId: undefined,
      phase: 'cleaning-up',
      detail: 'Tidying',
    })
    expect(migrationEventFrom({ phase: 9 })).toBeUndefined()
    expect(migrationEventFrom({ phase: 'later' })).toBeUndefined()
    expect(migrationEventFrom({ operationId: '', phase: 7 })?.operationId).toBe(
      undefined,
    )
  })
})
