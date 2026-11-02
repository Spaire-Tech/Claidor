// Simeon's computer rebuilt (ios/SimeonCore/Sources/SimeonCore/ComputerRebuild.swift),
// as the shipped window follows it: an update, a reset or a recovery the
// person asked for (or the computer started by itself), the stream dropping
// and coming back ("Reconnecting"), and the steps between (`H$n`, `Kae`,
// `yft`, `e6n`, `J1t`, `R$n`, `B$n` in the window's main bundle;
// `box-migration-watcher.ts` in the Electron app). Only state and words
// here; the store feeds it (rebuildDriver.ts) and the screens draw it
// (ComputerStates.tsx). Checked against the window's own code on the core's
// fixture (rebuild-lock.json).

import type { ComputerPhase } from './cloudComputer'
import { type JSONValue, field, int, str, text } from './json'
import { t } from './l10n'

/** Where an agent's computer is (CloudComputer.swift's `ComputerPhase`, `qoe`): 5b's. */
export type { ComputerPhase }

// MARK: The server's steps

/** A step of the server's replacement of the computer (`SandBoxMigrationPhase`). */
export type MigrationPhase =
  | 'backing-up'
  | 'creating'
  | 'moving'
  | 'cleaning-up'
  | 'wiping'
  | 'done'
  | 'failed'

/** The server's number for each (`server/simeon/sand/box_service.py`, 1 to 7). */
const phaseByNumber: readonly MigrationPhase[] = [
  'backing-up',
  'creating',
  'moving',
  'cleaning-up',
  'wiping',
  'done',
  'failed',
]

export function migrationPhaseOf(number: number): MigrationPhase | undefined {
  return Number.isInteger(number) && number >= 1 && number <= 7
    ? phaseByNumber[number - 1]
    : undefined
}

function phaseNamed(name: string): MigrationPhase | undefined {
  return (phaseByNumber as readonly string[]).includes(name)
    ? (name as MigrationPhase)
    : undefined
}

export function isTerminal(phase: MigrationPhase): boolean {
  return phase === 'done' || phase === 'failed'
}

/** One step the server reported, for an operation (`box-migration`). */
export interface MigrationEvent {
  operationId?: string
  phase: MigrationPhase
  detail: string
}

/** One of the server's stream messages (`{operationId, phase, detail, offsetKey}`), its phase a number or a name. */
export function migrationEventFrom(
  json: JSONValue | undefined,
): MigrationEvent | undefined {
  const raw = field(json, 'phase')
  const number = int(raw)
  const name = str(raw)
  const phase =
    (number !== undefined ? migrationPhaseOf(number) : undefined) ??
    (name !== undefined ? phaseNamed(name) : undefined)
  if (phase === undefined) return undefined
  return {
    operationId: text(field(json, 'operationId')),
    phase,
    detail: str(field(json, 'detail')) ?? '',
  }
}

/** The same operation: both named, and the same (`Om`). */
export function sameOperation(a?: string, b?: string): boolean {
  return a !== undefined && b !== undefined && a === b
}

function sameEvent(a?: MigrationEvent, b?: MigrationEvent): boolean {
  if (a === undefined || b === undefined) return a === b
  return (
    a.phase === b.phase &&
    a.detail === b.detail &&
    a.operationId === b.operationId
  )
}

/**
 * The steps the window has seen for the current operation (`FPt`): the
 * last event, and the operation's steps in order, terminal ones left out.
 */
export class MigrationRecord {
  /** The last event (`getRawEvent`). */
  last?: MigrationEvent
  /** The operation the steps belong to. */
  operationId?: string
  phases: MigrationPhase[] = []

  /** The phase shown: the last one while it is not terminal (`jPt`). */
  get phase(): MigrationPhase | undefined {
    return this.last?.phase
  }

  copy(): MigrationRecord {
    const next = new MigrationRecord()
    next.last = this.last
    next.operationId = this.operationId
    next.phases = [...this.phases]
    return next
  }

  equals(other: MigrationRecord): boolean {
    return (
      sameEvent(this.last, other.last) &&
      this.operationId === other.operationId &&
      this.phases.length === other.phases.length &&
      this.phases.every((phase, i) => phase === other.phases[i])
    )
  }

  /** An event, or none (the status read back empty). The same event twice changes nothing. */
  ingest(event: MigrationEvent | undefined): void {
    const last = this.last
    if (last === undefined && event === undefined) return
    if (
      last !== undefined &&
      event !== undefined &&
      last.phase === event.phase &&
      last.detail === event.detail &&
      sameOperation(last.operationId, event.operationId)
    )
      return
    if (event !== undefined) {
      const keepsOperation =
        this.operationId === undefined &&
        event.operationId === undefined &&
        last !== undefined &&
        !isTerminal(last.phase)
      if (
        !keepsOperation &&
        !sameOperation(this.operationId, event.operationId)
      ) {
        this.operationId = event.operationId
        this.phases = []
      }
      if (
        !isTerminal(event.phase) &&
        this.phases[this.phases.length - 1] !== event.phase
      )
        this.phases.push(event.phase)
    }
    this.last = event
  }

  /** The phase, when it belongs to this operation and is not terminal (`DPt`). */
  phaseFor(operation: string | undefined): MigrationPhase | undefined {
    const phase = this.last?.phase
    if (
      !sameOperation(this.operationId, operation) ||
      phase === undefined ||
      isTerminal(phase)
    )
      return undefined
    return phase
  }

  /** The steps, when they belong to this operation (`RPt`). */
  phasesFor(operation: string | undefined): MigrationPhase[] {
    return sameOperation(this.operationId, operation) ? this.phases : []
  }
}

// MARK: The lock

export type RebuildKind = 'update' | 'reset' | 'recover' | 'reconnecting'
export type RebuildSource = 'request' | 'auto' | 'migration'
export type RebuildTeardown = 'none' | 'box' | 'transport'
export type RebuildResolution = 'settled' | 'failed' | 'cancelled'
/** The lock's coarse phase (`e6n`). */
export type RebuildStage =
  | 'preparing'
  | 'tearingDown'
  | 'downloading'
  | 'starting'
  | 'finishing'

/** What the lock hears (`Kae`'s actions), each at its time in milliseconds. */
export type RebuildEvent =
  | {
      type: 'request'
      kind: RebuildKind
      operationId?: string
      source?: RebuildSource
      at: number
    }
  | { type: 'pending'; isPending: boolean; at: number }
  | { type: 'acknowledged'; at: number }
  | { type: 'imageUpdate'; available?: boolean; at: number }
  | { type: 'box'; boxId?: string; phase: ComputerPhase; at: number }
  | {
      type: 'migration'
      phase: MigrationPhase
      operationId?: string
      at: number
    }
  | { type: 'connection'; isConnected: boolean; at: number }
  | { type: 'error'; at: number }
  | { type: 'deactivate'; at: number }
  | { type: 'tick'; at: number }

/** After the stream is back, this long before the lock lets go (`tve`). */
export const settleDelay = 1000
/** After an update's computer is ready again with no reconnect seen (`Kyn`). */
export const updateSettleDelay = 2500
/** The stream down this long before "Reconnecting" (`Yyn`). */
export const reconnectDelay = 2500

function isReady(phase: ComputerPhase): boolean {
  return phase === 'running' || phase === 'local'
}

export function isRebuild(kind: RebuildKind | undefined): boolean {
  return kind === 'reset' || kind === 'recover'
}

/**
 * The lock (`Kae`): while it is held, the computer is being rebuilt or the
 * window waits for it to come back. Its fields as the bundle's, so each
 * rule reads as the original does. Each event gives a new lock (the Swift
 * struct's copies); the same lock back means nothing changed.
 */
export class RebuildLock {
  kind?: RebuildKind
  operationId?: string
  updateSource?: RebuildSource
  lockBoxId?: string
  isPending = false
  hasRequestAcknowledgement = false
  imageUpdateAvailable?: boolean
  expectsImageUpgrade = false
  boxPhase: ComputerPhase
  observedBoxId?: string
  lastHealthyBoxId?: string
  hasLeftHealthy = false
  teardownObserved: RebuildTeardown = 'none'
  reconnectedSinceLeft = false
  readySince?: number
  isConnected = true
  connectedSince?: number
  resetOperationId?: string
  hasTerminalMigration = false
  lastResolution?: RebuildResolution
  lastResolutionKind?: RebuildKind

  /** Unlocked, on this phase (`xHe`). */
  constructor(phase: ComputerPhase, imageUpdateAvailable?: boolean) {
    this.boxPhase = phase
    this.imageUpdateAvailable = imageUpdateAvailable
  }

  get isLocked(): boolean {
    return this.kind !== undefined
  }

  copy(): RebuildLock {
    return Object.assign(new RebuildLock(this.boxPhase), this)
  }

  equals(other: RebuildLock): boolean {
    return (
      this.kind === other.kind &&
      this.operationId === other.operationId &&
      this.updateSource === other.updateSource &&
      this.lockBoxId === other.lockBoxId &&
      this.isPending === other.isPending &&
      this.hasRequestAcknowledgement === other.hasRequestAcknowledgement &&
      this.imageUpdateAvailable === other.imageUpdateAvailable &&
      this.expectsImageUpgrade === other.expectsImageUpgrade &&
      this.boxPhase === other.boxPhase &&
      this.observedBoxId === other.observedBoxId &&
      this.lastHealthyBoxId === other.lastHealthyBoxId &&
      this.hasLeftHealthy === other.hasLeftHealthy &&
      this.teardownObserved === other.teardownObserved &&
      this.reconnectedSinceLeft === other.reconnectedSinceLeft &&
      this.readySince === other.readySince &&
      this.isConnected === other.isConnected &&
      this.connectedSince === other.connectedSince &&
      this.resetOperationId === other.resetOperationId &&
      this.hasTerminalMigration === other.hasTerminalMigration &&
      this.lastResolution === other.lastResolution &&
      this.lastResolutionKind === other.lastResolutionKind
    )
  }

  /** The box seen is the box locked (`ype`). */
  get onLockedBox(): boolean {
    return (
      this.lockBoxId === undefined ||
      this.observedBoxId === undefined ||
      this.observedBoxId === this.lockBoxId
    )
  }

  /** The lock's own fields cleared (`Kte`). */
  private clearLock(): void {
    this.kind = undefined
    this.operationId = undefined
    this.updateSource = undefined
    this.lockBoxId = undefined
    this.hasLeftHealthy = false
    this.teardownObserved = 'none'
    this.reconnectedSinceLeft = false
    this.readySince = undefined
    this.resetOperationId = undefined
    this.hasTerminalMigration = false
    this.hasRequestAcknowledgement = false
    this.expectsImageUpgrade = false
  }

  /** The lock let go: cleared, and why. */
  private ended(resolution: RebuildResolution): RebuildLock {
    const next = this.copy()
    next.clearLock()
    next.lastResolution = resolution
    next.lastResolutionKind = this.kind
    return next
  }

  /** One event (`Kae`). */
  reduced(event: RebuildEvent): RebuildLock {
    switch (event.type) {
      case 'request': {
        const requested = event.kind
        const isReconnect = requested === 'reconnecting'
        const operation = isRebuild(requested) ? event.operationId : undefined
        const updateFrom = requested === 'update' ? event.source : undefined
        const leaves = isReconnect || isRebuild(requested)
        const continuing =
          requested === 'update' && this.kind === undefined && this.isPending
        const held = this.kind
        if (held !== undefined) {
          const next = this.copy()
          if (
            (requested === 'reset' && held !== 'reset') ||
            (requested === 'recover' && held !== 'recover' && held !== 'reset')
          ) {
            next.kind = requested
            next.operationId = operation
            next.updateSource = updateFrom
            next.lockBoxId = this.observedBoxId
            next.resetOperationId = operation
            next.hasLeftHealthy = true
            next.reconnectedSinceLeft = false
            next.readySince = undefined
            next.hasTerminalMigration = false
            next.hasRequestAcknowledgement = false
            next.expectsImageUpgrade = false
            return next
          }
          if (isRebuild(requested)) {
            if (
              (requested === 'recover' && held === 'reset') ||
              sameOperation(this.resetOperationId, event.operationId)
            )
              return this
            next.operationId = event.operationId
            next.updateSource = undefined
            next.lockBoxId = this.observedBoxId
            next.resetOperationId = event.operationId
            next.readySince = undefined
            next.hasTerminalMigration = false
            next.hasRequestAcknowledgement = false
            next.expectsImageUpgrade = false
            return next
          }
          if (held === 'reconnecting' && !isReconnect) {
            next.kind = requested
            next.updateSource = updateFrom
            next.lockBoxId = this.observedBoxId
            next.expectsImageUpgrade =
              requested === 'update' && this.imageUpdateAvailable === true
            return next
          }
          if (
            held === 'update' &&
            requested === 'update' &&
            this.updateSource === 'auto' &&
            event.source !== 'auto'
          ) {
            next.updateSource = event.source
            return next
          }
          return this
        }
        const next = this.copy()
        let ready: number | undefined
        if (continuing) ready = this.readySince
        else if (!leaves && isReady(this.boxPhase)) ready = event.at
        next.kind = requested
        next.operationId = operation
        next.updateSource = updateFrom
        next.lockBoxId = this.observedBoxId
        next.hasLeftHealthy = leaves || (continuing && this.hasLeftHealthy)
        next.connectedSince = this.isConnected
          ? (this.connectedSince ?? event.at)
          : undefined
        next.reconnectedSinceLeft = continuing && this.reconnectedSinceLeft
        next.resetOperationId = operation
        next.hasTerminalMigration = false
        next.hasRequestAcknowledgement =
          continuing && this.hasRequestAcknowledgement
        next.expectsImageUpgrade =
          requested === 'update' &&
          (this.expectsImageUpgrade || this.imageUpdateAvailable === true)
        next.readySince = ready
        next.lastResolution = undefined
        next.lastResolutionKind = undefined
        return next
      }

      case 'pending': {
        const next = this.copy()
        if (!event.isPending && this.kind === undefined) next.clearLock()
        next.isPending = event.isPending
        return next
      }

      case 'acknowledged': {
        if (!(this.kind === 'update' || isRebuild(this.kind))) return this
        const next = this.copy()
        next.hasRequestAcknowledgement = true
        return next
      }

      case 'imageUpdate': {
        const next = this.copy()
        next.imageUpdateAvailable = event.available
        return next
      }

      case 'box': {
        const { boxId, phase, at } = event
        if (boxId === this.observedBoxId && phase === this.boxPhase) return this
        const switched =
          this.kind === 'update' &&
          this.updateSource === 'auto' &&
          this.observedBoxId !== undefined &&
          boxId !== undefined &&
          boxId !== this.observedBoxId
        const seen = (
          switched ? this.reduced({ type: 'deactivate', at }) : this
        ).copy()
        seen.observedBoxId = boxId
        seen.lastHealthyBoxId = isReady(phase) ? boxId : seen.lastHealthyBoxId
        const autoUpdate =
          this.kind === undefined &&
          !this.isPending &&
          phase === 'pulling' &&
          this.lastHealthyBoxId !== undefined &&
          this.lastHealthyBoxId === boxId
        const locked = (
          autoUpdate
            ? seen.reduced({
                type: 'request',
                kind: 'update',
                source: 'auto',
                at,
              })
            : seen
        ).copy()
        if (locked.kind === undefined) {
          locked.boxPhase = phase
          return locked
        }
        if (locked.lockBoxId === undefined && boxId !== undefined)
          locked.lockBoxId = boxId
        locked.boxPhase = phase
        if (locked.onLockedBox) {
          if (isReady(phase)) {
            locked.readySince = locked.readySince ?? at
          } else {
            locked.hasLeftHealthy = true
            locked.teardownObserved = 'box'
            locked.readySince = undefined
          }
        } else {
          locked.readySince = undefined
        }
        return locked
      }

      case 'migration': {
        const { phase, operationId: migrationOperation, at } = event
        if (phase === 'failed') {
          if (
            this.kind === undefined ||
            (this.kind === 'update' && this.isPending) ||
            (isRebuild(this.kind) &&
              !sameOperation(this.resetOperationId, migrationOperation))
          )
            return this
          return this.ended('failed')
        }
        if (phase === 'done') {
          const fromMigration =
            this.kind === 'update' && this.updateSource === 'migration'
          if (!isRebuild(this.kind) && !fromMigration) return this
          const own = isRebuild(this.kind)
            ? this.resetOperationId
            : this.operationId
          if (
            !sameOperation(own, migrationOperation) ||
            this.hasTerminalMigration
          )
            return this
          const next = this.copy()
          next.hasTerminalMigration = true
          next.hasLeftHealthy = true
          next.readySince =
            this.isConnected && isReady(this.boxPhase) && this.onLockedBox
              ? at
              : undefined
          return next
        }
        const next =
          phase === 'wiping'
            ? this.reduced({
                type: 'request',
                kind: 'reset',
                operationId: migrationOperation,
                at,
              })
            : this.reduced({
                type: 'request',
                kind: 'update',
                source: 'migration',
                at,
              })
        if (
          migrationOperation === undefined ||
          next.kind === undefined ||
          sameOperation(next.operationId, migrationOperation)
        )
          return next
        const named = next.copy()
        named.operationId = migrationOperation
        return named
      }

      case 'connection': {
        const { isConnected: connected, at } = event
        const next = this.copy()
        if (
          this.kind === undefined &&
          !(this.isPending && this.expectsImageUpgrade)
        ) {
          next.isConnected = connected
          next.connectedSince = connected
            ? (this.connectedSince ?? at)
            : undefined
          return next
        }
        if (connected) {
          next.isConnected = true
          next.connectedSince = this.connectedSince ?? at
          next.reconnectedSinceLeft =
            this.hasLeftHealthy || this.reconnectedSinceLeft
          next.readySince =
            this.hasLeftHealthy && isReady(this.boxPhase) && this.onLockedBox
              ? (this.readySince ?? at)
              : this.readySince
        } else {
          next.isConnected = false
          next.connectedSince = undefined
          next.hasLeftHealthy = true
          next.teardownObserved =
            this.teardownObserved === 'none'
              ? 'transport'
              : this.teardownObserved
          next.readySince = undefined
        }
        return next
      }

      case 'error':
        return this.kind === undefined ? this : this.ended('failed')

      case 'deactivate': {
        if (this.kind === undefined) return this
        if (this.kind === 'update' && this.isPending) {
          const next = this.copy()
          next.kind = undefined
          next.operationId = undefined
          next.updateSource = undefined
          next.lockBoxId = undefined
          next.resetOperationId = undefined
          next.hasTerminalMigration = false
          next.lastResolution = 'cancelled'
          next.lastResolutionKind = this.kind
          return next
        }
        return this.ended(this.hasTerminalMigration ? 'settled' : 'cancelled')
      }

      case 'tick':
        return this
    }
  }

  /** When the lock lets go by itself, or undefined while it waits on something (`yft`). */
  get settleAt(): number | undefined {
    const kind = this.kind
    if (kind === undefined || !this.isConnected) return undefined
    if (kind === 'reconnecting')
      return this.isPending || this.connectedSince === undefined
        ? undefined
        : this.connectedSince + settleDelay
    if (!this.hasLeftHealthy) return undefined
    const rebuilding = isRebuild(kind) && !this.hasTerminalMigration
    const cameBack =
      rebuilding &&
      this.teardownObserved === 'box' &&
      this.reconnectedSinceLeft &&
      this.hasRequestAcknowledgement
    if (
      (rebuilding && !cameBack) ||
      (this.isPending &&
        !cameBack &&
        (!this.reconnectedSinceLeft ||
          !this.expectsImageUpgrade ||
          this.imageUpdateAvailable !== false))
    )
      return undefined
    const readySince = this.readySince
    if (
      !this.onLockedBox ||
      !isReady(this.boxPhase) ||
      readySince === undefined
    ) {
      const finished =
        isRebuild(kind) || this.updateSource === 'migration'
          ? this.hasTerminalMigration
          : this.hasRequestAcknowledgement &&
            !this.isPending &&
            this.reconnectedSinceLeft
      return finished && this.connectedSince !== undefined
        ? this.connectedSince + settleDelay
        : undefined
    }
    return (
      readySince +
      (!cameBack && (isRebuild(kind) || this.reconnectedSinceLeft)
        ? settleDelay
        : updateSettleDelay)
    )
  }

  /** Let go if its time has come (`Xyn`). */
  settled(now: number): RebuildLock {
    const at = this.settleAt
    if (at === undefined || now < at) return this
    return this.ended('settled')
  }

  /** An event, then the settling check at its time (`Qyn`). */
  step(event: RebuildEvent): RebuildLock {
    return this.reduced(event).settled(event.at)
  }

  /** The coarse phase (`e6n`). */
  get stage(): RebuildStage | undefined {
    if (this.kind === undefined) return undefined
    if (this.kind !== 'reconnecting' && this.teardownObserved === 'none')
      return 'preparing'
    switch (this.boxPhase) {
      case 'pulling':
        return 'downloading'
      case 'starting':
        return 'starting'
      case 'running':
      case 'local':
        return 'finishing'
      default:
        return 'tearingDown'
    }
  }
}

// MARK: The steps

export type StepState = 'done' | 'active' | 'pending'

export interface RebuildStep {
  label: string
  state: StepState
}

/** The steps of a rebuild and how far it is (`J1t`): `progress` is 0 to 1. */
export interface RebuildSteps {
  steps: RebuildStep[]
  activeIndex: number
  progress: number
}

export function updateLabels(): string[] {
  return [
    t('Getting ready'),
    t('Backing up your data'),
    t("Recreating Simeon's computer"),
    t("Starting Simeon's computer"),
    t('Cleaning up'),
    t('Reconnecting'),
  ]
}

export function resetLabels(): string[] {
  return [
    t('Getting ready'),
    t('Wiping your data'),
    t("Creating Simeon's computer"),
    t("Starting Simeon's computer"),
    t('Cleaning up'),
    t('Reconnecting'),
  ]
}

export function recoverLabels(): string[] {
  return [
    t('Getting ready'),
    t("Recreating Simeon's computer"),
    t("Starting Simeon's computer"),
    t('Reconnecting'),
  ]
}

/** The step a stage or a server phase stands for, by kind (`e8n`, `t8n`, `n8n`); `afterOthers` is a cleaning-up seen after another phase. */
function stepIndex(
  kind: RebuildKind,
  stage: RebuildStage | undefined,
  phase: MigrationPhase | undefined,
  afterOthers = true,
): number | undefined {
  if (phase !== undefined && !isTerminal(phase)) {
    switch (kind) {
      case 'reset':
        switch (phase) {
          case 'wiping':
            return 1
          case 'creating':
            return 2
          case 'moving':
            return 3
          case 'cleaning-up':
            return afterOthers ? 4 : 1
          default:
            return 0
        }
      case 'recover':
        switch (phase) {
          case 'moving':
            return 2
          case 'cleaning-up':
            return afterOthers ? 3 : 1
          default:
            return 1
        }
      default:
        switch (phase) {
          case 'backing-up':
            return 1
          case 'moving':
            return 3
          case 'cleaning-up':
            return afterOthers ? 4 : 2
          default:
            return 2
        }
    }
  }
  if (stage === undefined) return undefined
  if (stage === 'preparing') return 0
  const rebuilds = kind === 'reset' || kind === 'recover'
  switch (stage) {
    case 'tearingDown':
      return rebuilds ? 1 : 2
    case 'downloading':
    case 'starting':
      return kind === 'reset'
        ? 3
        : kind === 'recover'
          ? 2
          : stage === 'downloading'
            ? 2
            : 3
    case 'finishing':
      return kind === 'recover' ? 3 : 5
  }
}

/** The furthest step the server's phases reach (`r8n`), counting the current one when it is not terminal. */
function furthest(
  kind: RebuildKind,
  stage: RebuildStage | undefined,
  status: MigrationPhase | undefined,
  phases: readonly MigrationPhase[],
): number | undefined {
  const list = [...phases]
  if (
    status !== undefined &&
    !isTerminal(status) &&
    list[list.length - 1] !== status
  )
    list.push(status)
  let seenOther = false
  let best: number | undefined
  for (const phase of list) {
    const at = stepIndex(
      kind,
      stage,
      phase,
      phase === 'cleaning-up' && seenOther,
    )
    if (at !== undefined) best = best === undefined ? at : Math.max(best, at)
    if (phase !== 'cleaning-up') seenOther = true
  }
  return best
}

/** The image's download counts inside the step it belongs to, for an update only (`s8n`). */
function pullShare(
  kind: RebuildKind,
  stage: RebuildStage | undefined,
  percent: number | undefined,
): number {
  if (
    kind !== 'update' ||
    stage !== 'downloading' ||
    percent === undefined ||
    !(percent > 0)
  )
    return 0
  return Math.min(percent, 100) / 100
}

export function projectSteps(
  kind: RebuildKind,
  stage: RebuildStage | undefined,
  status: MigrationPhase | undefined,
  phases: readonly MigrationPhase[],
  pullPercent: number | undefined,
): RebuildSteps {
  const labels =
    kind === 'reset'
      ? resetLabels()
      : kind === 'recover'
        ? recoverLabels()
        : updateLabels()
  const fromStage = stepIndex(kind, stage, undefined) ?? 0
  const fromServer = furthest(kind, stage, status, phases)
  let active: number
  if (fromServer !== undefined) {
    active =
      status !== undefined && !isTerminal(status)
        ? fromServer
        : Math.max(fromServer, fromStage)
  } else {
    active = fromStage
  }
  const share = active === fromStage ? pullShare(kind, stage, pullPercent) : 0
  const steps = labels.map(
    (label, i): RebuildStep => ({
      label,
      state: i < active ? 'done' : i === active ? 'active' : 'pending',
    }),
  )
  return {
    steps,
    activeIndex: active,
    progress: (active + share) / labels.length,
  }
}

// MARK: The dialog or the banner

export type RebuildPlace = 'foreground' | 'background'

/** What the lock shows the surface (`lockSnapshots`). */
export interface LockView {
  kind?: RebuildKind
  operationId?: string
  boxId?: string
  lastResolution?: RebuildResolution
}

export function lockViewOf(lock: RebuildLock): LockView {
  return {
    kind: lock.kind,
    operationId: lock.operationId,
    boxId: lock.lockBoxId,
    lastResolution: lock.lastResolution,
  }
}

export function sameLockView(a: LockView, b: LockView): boolean {
  return (
    a.kind === b.kind &&
    a.operationId === b.operationId &&
    a.boxId === b.boxId &&
    a.lastResolution === b.lastResolution
  )
}

/**
 * The dialog or the banner (`R$n`): an update goes to the background
 * banner, a reset or a recovery to the dialog, until the person moves it
 * ("Continue in Background", or a click on the banner); "Reconnecting" is
 * always the banner.
 */
export class RebuildSurface {
  private chosen?: RebuildPlace
  private chosenOperation?: string
  private chosenKind?: RebuildKind
  private chosenBox?: string
  private lastPending?: RebuildKind
  private wasLocked: boolean
  private lastKind?: RebuildKind
  lock: LockView

  constructor(lock: LockView = {}, pending?: RebuildKind) {
    this.lock = lock
    this.lastPending = pending
    this.wasLocked = lock.kind !== undefined
    this.lastKind = lock.kind
  }

  /** Where the lock shows now, or undefined when there is none (`h`). */
  get surface(): RebuildPlace | undefined {
    const kind = this.lock.kind
    if (kind === undefined) return undefined
    return kind === 'reconnecting'
      ? 'foreground'
      : (this.chosen ?? (kind === 'update' ? 'background' : 'foreground'))
  }

  private forget(): void {
    this.chosen = undefined
    this.chosenOperation = undefined
    this.chosenKind = undefined
    this.chosenBox = undefined
  }

  private choose(place: RebuildPlace): void {
    this.chosen = place
    this.chosenOperation = this.lock.operationId
    this.chosenKind = this.lock.kind
    this.chosenBox = this.lock.boxId
  }

  private isChosen(
    kind: RebuildKind | undefined,
    operation: string | undefined,
    box: string | undefined,
  ): boolean {
    if (this.chosenOperation !== undefined && operation !== undefined)
      return sameOperation(this.chosenOperation, operation)
    if (
      this.chosenBox !== undefined &&
      box !== undefined &&
      this.chosenBox !== box
    )
      return false
    return kind === this.chosenKind
  }

  lockChanged(next: LockView): void {
    this.lock = next
    const nextLocked = next.kind !== undefined
    const began = !this.wasLocked && nextLocked
    const leftReconnect =
      this.wasLocked &&
      this.lastKind === 'reconnecting' &&
      nextLocked &&
      next.kind !== 'reconnecting'
    if (
      this.chosen !== undefined &&
      this.chosenOperation === undefined &&
      next.operationId !== undefined &&
      next.kind === this.chosenKind &&
      this.wasLocked &&
      nextLocked
    )
      this.chosenOperation = next.operationId
    if (
      this.chosen !== undefined &&
      this.chosenBox === undefined &&
      next.boxId !== undefined &&
      next.kind === this.chosenKind &&
      this.wasLocked &&
      nextLocked
    )
      this.chosenBox = next.boxId
    if (
      this.chosen !== undefined &&
      this.chosenOperation !== undefined &&
      next.operationId !== undefined &&
      next.kind !== 'reconnecting' &&
      this.wasLocked &&
      nextLocked &&
      sameOperation(this.chosenOperation, next.operationId)
    )
      this.chosenKind = next.kind
    if (
      this.chosen !== undefined &&
      next.kind !== 'reconnecting' &&
      (began || leftReconnect) &&
      !this.isChosen(next.kind, next.operationId, next.boxId)
    )
      this.forget()
    if (this.wasLocked && !nextLocked && next.lastResolution !== 'cancelled')
      this.forget()
    this.wasLocked = nextLocked
    this.lastKind = next.kind
  }

  pendingChanged(pending: RebuildKind | undefined): void {
    if (pending !== undefined && this.lastPending === undefined) this.forget()
    this.lastPending = pending
  }

  /** "Continue in Background". */
  continueInBackground(): void {
    if (this.surface !== 'foreground' || this.lock.kind === 'reconnecting')
      return
    this.choose('background')
  }

  /** A click on the banner. */
  restoreForeground(): void {
    if (this.lock.kind === undefined || this.lock.kind === 'reconnecting') {
      this.forget()
      return
    }
    this.choose('foreground')
  }

  reset(pending: RebuildKind | undefined): void {
    this.forget()
    this.lastPending = pending
  }
}

// MARK: The words

/** What the palette and the pill can do (`RAe`). */
export type UpdateAvailability =
  | 'unavailable'
  | 'queued'
  | 'up-to-date'
  | 'ready'
  | 'busy-override'

export function updateAvailability(options: {
  canUpdateBaseline: boolean
  canUpdateBox: boolean
  isBoxUpToDate: boolean
  isUpdateQueued: boolean
}): UpdateAvailability {
  if (!options.canUpdateBaseline) return 'unavailable'
  if (options.isUpdateQueued) return 'queued'
  if (options.isBoxUpToDate) return 'up-to-date'
  return options.canUpdateBox ? 'ready' : 'busy-override'
}

/** A confirmation: its title, what it says, its buttons. */
export interface Confirmation {
  title: string
  description: string
  confirm: string
  cancel: string
  /** A middle button ("Update anyway"), red. */
  secondary?: string
  warning?: string
  destructive: boolean
}

/** "A and B", "A, B, and 3 other agents", "A and 1 other agent", "N agents" (`Gbn`). */
export function nameList(names: readonly string[]): string {
  const kept = names.map((name) => name.trim()).filter((name) => name !== '')
  const first = kept[0]
  if (first === undefined) return t`${names.length} agents`
  const second = kept.length > 1 ? kept[1] : undefined
  const others = names.length - (second === undefined ? 1 : 2)
  if (second === undefined)
    return others === 1
      ? t`${first} and 1 other agent`
      : t`${first} and ${others} other agents`
  if (others === 0) return t`${first} and ${second}`
  return others === 1
    ? t`${first}, ${second}, and 1 other agent`
    : t`${first}, ${second}, and ${others} other agents`
}

function busyDescription(names: readonly string[]): string {
  if (names.length > 1)
    return t`${nameList(names)} are working on Simeon's computer right now. Updating recreates the computer and interrupts their current turns. Files and logins are kept.`
  const name = (names[0] ?? '').trim()
  if (name === '')
    return t(
      'An agent is working right now. Waiting lets its current turn finish. Updating now recreates the computer and interrupts it. Files and logins are kept either way.',
    )
  return t`${name} is working right now. Waiting lets its current turn finish. Updating now recreates the computer and interrupts it. Files and logins are kept either way.`
}

/** The words of the rebuild, as the window has them (`_1t`, `K1t`, `FAe`, `Wbn`, `zAe`, `j8n`, `k8n`, `D8n`). */
export const RebuildWords = {
  title(kind: RebuildKind): string {
    switch (kind) {
      case 'update':
        return t("Updating Simeon's Computer")
      case 'reset':
        return t("Resetting Simeon's Computer")
      default:
        return t("Recovering Simeon's Computer")
    }
  },

  continueInBackground: () => t('Continue in Background'),
  bannerLabel: () => t("View Simeon's Computer progress"),

  /** The banner while the stream is away (`g8n`, `y8n`): its title and line under it. */
  reconnecting(
    stage: RebuildStage | undefined,
    connected: boolean,
  ): { title: string; subtitle?: string } {
    if (stage === 'downloading' || stage === 'starting')
      return {
        title: t("Simeon's computer restarting"),
        subtitle: t("Starting Simeon's computer"),
      }
    return connected
      ? { title: t('Checking connection'), subtitle: t('Reconnecting') }
      : { title: t('Reconnecting') }
  },

  /** Nobody working (`K1t`). */
  updateIdle(): Confirmation {
    return {
      title: t("Update Simeon's Computer?"),
      description: t(
        'This updates the shared computer all your agents run on to the latest version. Their files and logins are kept.',
      ),
      confirm: t("Update Simeon's Computer"),
      cancel: t('Not now'),
      destructive: false,
    }
  },

  /** One agent or more working (`FAe`). */
  updateBusy(names: readonly string[]): Confirmation {
    const several = names.length > 1
    return {
      title: several
        ? t('Update while agents are working?')
        : t('An agent is working'),
      description: busyDescription(names),
      confirm: several
        ? t('Update when agents are done')
        : t('Update when done'),
      cancel: t('Cancel'),
      secondary: t('Update anyway'),
      destructive: false,
    }
  },

  /** Why a confirmed action is refused, kept in the dialog in red (`zAe`). */
  refusal(options: {
    update: boolean
    isBlocked: boolean
    pending: RebuildKind | undefined
    canReset: boolean
    canUpdate: boolean
  }): string | undefined {
    if (options.isBlocked)
      return t(
        'Further computer updates and resets are disabled for this session. Restart Simeon after the computer is available again.',
      )
    if (options.pending !== undefined)
      return t('The computer is already being rebuilt.')
    if (!options.update && !options.canReset)
      return t('Open an agent to reset the shared computer.')
    if (options.update && !options.canUpdate)
      return t('Open an agent to update the shared computer.')
    return undefined
  },

  // The lifecycle dialogs (`j8n`)

  unreachableTitle: () => t("Couldn't Reach Simeon's Computer"),
  unreachableBody: () =>
    t(
      "Your agents, files, and logins are safe. If it doesn't reconnect on its own, recover Simeon's computer to keep the data.",
    ),
  recoverButton: () => t("Recover Simeon's Computer"),
  recoverTitle: () => t("Recover Simeon's Computer?"),
  recoverBody: () =>
    t(
      "This recreates Simeon's computer and reconnects. Your agents, files, and logins are kept.",
    ),
  longerTitle: () => t('Taking longer than expected'),
  keepWaiting: () => t('Keep waiting'),

  longerBody(kind: RebuildKind): string {
    switch (kind) {
      case 'reset':
        return t(
          "The reset is still running — rebuilding Simeon's computer can take a few minutes. You can keep waiting, or continue in the background.",
        )
      case 'update':
        return t(
          'The update is still running — a large image download can take a few minutes. You can keep waiting, or continue in the background.',
        )
      default:
        return t(
          "The recovery is still running — recreating Simeon's computer can take a few minutes. You can keep waiting, or continue in the background.",
        )
    }
  },

  failedTitle(kind: RebuildKind): string {
    switch (kind) {
      case 'update':
        return t('Update failed')
      case 'reset':
        return t('Reset failed')
      default:
        return t('Recover failed')
    }
  },

  failedBody(kind: RebuildKind): string {
    switch (kind) {
      case 'update':
        return t(
          "The update couldn't finish, so Simeon's computer is still on its previous image. Your agents, files, and logins are safe.",
        )
      case 'reset':
        return t(
          "The reset couldn't finish. Simeon's computer may be in a partial state — retry to run the reset again.",
        )
      default:
        return t(
          "The recovery couldn't finish, so Simeon's computer may still be unreachable. Your agents, files, and logins are safe.",
        )
    }
  },

  retry(kind: RebuildKind): string {
    switch (kind) {
      case 'update':
        return t('Retry Update')
      case 'reset':
        return t('Retry Reset')
      default:
        return t('Retry Recovery')
    }
  },

  // Low disk (`D8n`; Simeon keeps the automatic Disk Saver on)

  diskTitle(hard: boolean): string {
    return hard
      ? t('Computer is critically low on disk space')
      : t('Computer is low on disk space')
  },
  diskBody: () =>
    t(
      'Disk Saver is auditing usage and will propose safe cleanup. Nothing is deleted without confirmation.',
    ),
  diskButton: () => t('Go to Disk Saver'),
  diskOpening: () => t('Opening Disk Saver…'),
  /** The agent the button opens or makes (`z8n`): its name and description are the agent's own, kept in English like every agent's name. */
  diskSaverName: 'Disk Saver',
  diskSaverDescription:
    "Audits disk usage on Simeon's computer and proposes safe cleanup for approval.",
}
