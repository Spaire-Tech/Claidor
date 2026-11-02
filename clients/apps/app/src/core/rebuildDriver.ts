// The rebuild as the window runs it (ios/SimeonCore/Sources/SimeonCore/RebuildDriver.swift;
// `H$n`, `B$n`, `R$n` in the window's main bundle): the person's update,
// reset and recovery, the "update when done" queue, a failure to show until
// dismissed, "Reconnecting" 2.5 s after the stream drops, and "taking
// longer" or "couldn't reach" after two minutes. The store tells it what
// changed (its 5c section); the screens read it (ComputerStates.tsx).

import {
  type ComputerPhase,
  type MigrationEvent,
  MigrationRecord,
  type RebuildEvent,
  type RebuildKind,
  RebuildLock,
  RebuildSurface,
  isTerminal,
  lockViewOf,
  reconnectDelay,
  sameLockView,
  sameOperation,
} from './computerRebuild'
import { t } from './l10n'
import type { RecreateAnswer } from './migrationWatch'

/** Waiting, for the driver: the app's real clock, or a test's. */
export interface RebuildClock {
  /** Now, in milliseconds. */
  now(): number
  /** `work` after `ms`; the returned function cancels it. */
  schedule(ms: number, work: () => void): () => void
}

export const systemRebuildClock: RebuildClock = {
  now: () => Date.now(),
  schedule(ms, work) {
    const timer = setTimeout(work, Math.max(0, ms))
    return () => clearTimeout(timer)
  },
}

/** What the window looks at (the selected agent, its computer, the roster, the stream). */
export interface RebuildInputs {
  /** The selected agent, when it is not a group (`boxId`). */
  boxId?: string
  isCurrentGroup: boolean
  phase: ComputerPhase
  imageUpdateAvailable?: boolean
  /** Some agent is at work (`isRunning`). */
  anyRunning: boolean
  transportConnected: boolean
}

export const noRebuildInputs: RebuildInputs = {
  isCurrentGroup: false,
  phase: 'off',
  anyRunning: false,
  transportConnected: false,
}

export type RebuildRequest =
  | { kind: 'update'; force: boolean }
  | { kind: 'reset' }
  | { kind: 'recover' }

/** A rebuild that did not finish, until dismissed or retried. */
export interface RebuildFailureShown {
  episodeId: number
  request: RebuildRequest
}

/** "Couldn't reach" for the stream, "taking longer" for the rest, after two minutes (`QWe`). */
export type Escalation = 'unreachable' | 'taking-longer'
export const escalationDelay = 120_000

/** The calls that rebuild the computer (`updateComputer`, `forceRecreateComputer`). */
export interface RebuildCalls {
  update(agentId: string, force: boolean): Promise<RecreateAnswer>
  reset(): Promise<RecreateAnswer>
}

/** A failure with its own words (`F$n`, or the operation reported failed). */
export class RebuildFailure extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RebuildFailure'
  }
}

/** The call never got through (the window's desktop error): "Check your connection". */
export class CallFailure extends Error {
  constructor() {
    super('The call did not get through.')
    this.name = 'CallFailure'
  }
}

/** The end of a request's operation, as the server reports it (`$$n`). */
class Waiter {
  operationId?: string
  done = false
  private resolve?: () => void
  private reject?: (error: Error) => void

  constructor(readonly failure: string) {}

  waitOn(resolve: () => void, reject: (error: Error) => void): void {
    this.resolve = resolve
    this.reject = reject
  }

  check(event: MigrationEvent | undefined): void {
    if (
      event === undefined ||
      this.operationId === undefined ||
      !sameOperation(event.operationId, this.operationId)
    )
      return
    if (event.phase === 'failed') this.finish(new RebuildFailure(this.failure))
    else if (event.phase === 'done') this.finish()
  }

  finish(error?: Error): void {
    if (this.done) return
    this.done = true
    const resolve = this.resolve
    const reject = this.reject
    this.resolve = undefined
    this.reject = undefined
    if (error) reject?.(error)
    else resolve?.()
  }
}

export class RebuildDriver {
  // What the screens read.
  lock: RebuildLock
  pendingKind?: RebuildKind
  isUpdateQueued = false
  isBlocked = false
  /** Only the Settings card showed it in the window, and Settings has none today. */
  error?: string
  failure?: RebuildFailureShown
  readonly surface = new RebuildSurface()
  escalation?: Escalation
  migration = new MigrationRecord()
  inputs: RebuildInputs = noRebuildInputs

  /** A rebuild began or ended (not the stream's coming and going): the store holds the agents' list still meanwhile. */
  onHardLockChanged?: (held: boolean) => void
  /** Something the screens read changed (the Mac's observation). */
  onChange?: () => void

  private calls?: RebuildCalls
  private generation = 0
  private requestCount = 0
  private inFlight = false
  private queueFired = false
  private episodes = 0
  private settleTimer?: () => void
  private reconnectTimer?: () => void
  private escalationTimer?: () => void
  private escalationKind?: RebuildKind
  private waiter?: Waiter
  private wasActive = false
  private lastTransport?: boolean
  private connectedOnce = false
  private connectedSinceConnect = false
  private resetOperationIdHeld?: string
  /** What the screens were last told, so they redraw only when it moves. */
  private published = ''

  constructor(private readonly clock: RebuildClock = systemRebuildClock) {
    this.lock = new RebuildLock('off')
    this.transportNow()
    this.published = this.snapshot()
  }

  get canUpdate(): boolean {
    return this.inputs.boxId !== undefined
  }
  get canReset(): boolean {
    return !this.inputs.isCurrentGroup
  }
  get canRecover(): boolean {
    return !this.inputs.isCurrentGroup
  }
  /** A rebuild under way (not just the stream away): sending waits, the agents' list holds still, the keys go only to the dialog. */
  get isHardLocked(): boolean {
    return this.lock.kind !== undefined && this.lock.kind !== 'reconnecting'
  }

  // MARK: What the store reports

  /** The window starts with an account (`connect`). */
  connect(calls: RebuildCalls, inputs: RebuildInputs): void {
    this.calls = calls
    this.inputs = inputs
    this.connectedOnce = true
    this.connectedSinceConnect = inputs.transportConnected
    this.transportNow()
    this.activityChanged()
    this.statusNow()
    this.notify()
  }

  /** The selection or the roster changed. */
  selectionChanged(next: RebuildInputs): void {
    this.inputs = next
    this.activityChanged()
    this.statusNow()
    this.checkQueue()
    this.notify()
  }

  /** A computer's status changed. */
  statusChanged(next: RebuildInputs): void {
    this.inputs = next
    this.statusNow()
    this.notify()
  }

  /** The stream went down or came back. */
  transportChanged(next: RebuildInputs): void {
    this.inputs = next
    this.transportNow()
    this.notify()
  }

  /** A step of the server's replacement of the computer (`box-migration`). */
  migrationEvent(event: MigrationEvent | undefined): void {
    const before = this.migration.copy()
    this.migration.ingest(event)
    if (this.migration.equals(before)) return
    this.waiter?.check(this.migration.last)
    const raw = this.migration.last
    if (raw !== undefined && this.isActive)
      this.dispatch({
        type: 'migration',
        phase: raw.phase,
        operationId: raw.operationId,
        at: this.clock.now(),
      })
    this.notify()
  }

  /** The status read back on connecting (`getBoxMigrationStatus`): nothing read keeps a finished one. */
  migrationReadBack(event: MigrationEvent | undefined): void {
    const last = this.migration.last
    if (event === undefined && last !== undefined && isTerminal(last.phase))
      return
    this.migrationEvent(event)
  }

  /** The account went (`reset`). */
  reset(): void {
    this.generation += 1
    this.waiter?.finish()
    this.waiter = undefined
    this.settleTimer?.()
    this.settleTimer = undefined
    this.reconnectTimer?.()
    this.reconnectTimer = undefined
    this.inFlight = false
    this.isBlocked = false
    this.pendingKind = undefined
    this.isUpdateQueued = false
    this.queueFired = false
    this.error = undefined
    this.failure = undefined
    this.resetOperationIdHeld = undefined
    this.lock = new RebuildLock('off')
    this.lastTransport = undefined
    this.connectedOnce = false
    this.connectedSinceConnect = false
    this.wasActive = false
    this.migration = new MigrationRecord()
    this.calls = undefined
    this.surface.reset(undefined)
    this.surface.lockChanged(lockViewOf(this.lock))
    this.escalationKindChanged()
    this.notify()
  }

  // MARK: What the person does

  /** "Update Simeon's Computer", "Update anyway" (`force`), or "Retry Update" (the failed one's `force`). */
  update(force?: boolean): void {
    let again = false
    const failed = this.failure?.request
    if (failed?.kind === 'update') again = failed.force
    this.start({ kind: 'update', force: force ?? again })
  }

  /** A refused reset's words (`RecreateAnswer.read`), said of a recover: "Couldn't recover the computer (no box). It is unchanged." */
  static saidOfRecover(reason: string): string {
    if (reason === t("Couldn't reset the computer. It is unchanged."))
      return t("Couldn't recover the computer. It is unchanged.")
    const marker = '\u0001'
    const parts =
      t`Couldn't reset the computer (${marker}). It is unchanged.`.split(marker)
    const [before, after] = parts
    if (
      parts.length !== 2 ||
      before === undefined ||
      after === undefined ||
      !(reason.length > before.length + after.length) ||
      !reason.startsWith(before) ||
      !reason.endsWith(after)
    )
      return reason
    const why = reason.slice(before.length, reason.length - after.length)
    return t`Couldn't recover the computer (${why}). It is unchanged.`
  }

  /** The sidebar's "Recover computer" and "Retry Reset" (`resetComputer`). */
  resetComputer(): void {
    this.start({ kind: 'reset' })
  }

  /** "Recover Simeon's Computer" (`recoverComputer`). */
  recoverComputer(): void {
    this.start({ kind: 'recover' })
  }

  /** "Update when done": the update starts once no agent is at work. */
  queueUpdateWhenIdle(): void {
    if (this.isBlocked || this.isUpdateQueued) return
    this.isUpdateQueued = true
    this.queueFired = false
    this.checkQueue()
    this.notify()
  }

  /** The "Queued" pill. */
  cancelQueuedUpdate(): void {
    if (!this.isUpdateQueued) return
    this.isUpdateQueued = false
    this.notify()
  }

  /** "Dismiss" on a failure. */
  dismissFailure(): void {
    if (this.failure === undefined) return
    this.failure = undefined
    this.checkQueue()
    this.notify()
  }

  continueInBackground(): void {
    this.surface.continueInBackground()
    this.notify()
  }

  restoreForeground(): void {
    this.surface.restoreForeground()
    this.notify()
  }

  /** "Keep waiting", and "Retry" under "Couldn't reach": the two minutes start again; nothing reconnects. */
  keepWaiting(): void {
    if (this.lock.kind === undefined) return
    this.armEscalation()
    this.notify()
  }

  // MARK: The store's machinery (`H$n`)

  /** Whether the lock may be held: an agent selected that is not a group, or a reset or recovery asked for (`I`). */
  private get isActive(): boolean {
    return (
      !this.inputs.isCurrentGroup &&
      (this.inputs.boxId !== undefined ||
        this.pendingKind === 'reset' ||
        this.pendingKind === 'recover')
    )
  }

  /** What the screens read, as words, to tell whether it moved. */
  private snapshot(): string {
    const lock = this.lock
    return JSON.stringify([
      lock.kind,
      lock.operationId,
      lock.stage,
      lock.lastResolution,
      this.surface.surface,
      this.pendingKind,
      this.isUpdateQueued,
      this.isBlocked,
      this.error,
      this.failure?.episodeId,
      this.failure?.request,
      this.escalation,
      this.migration.last,
      this.migration.operationId,
      this.migration.phases,
      this.inputs.boxId,
      this.inputs.isCurrentGroup,
    ])
  }

  /** The screens redraw when what they read moved. */
  private notify(): void {
    const now = this.snapshot()
    if (now === this.published) return
    this.published = now
    this.onChange?.()
  }

  /** One event, then whatever follows from it (`W`). */
  private dispatch(event: RebuildEvent): void {
    const before = this.lock
    const after = before.step(event)
    if (after.equals(before)) return
    const wasHard = this.isHardLocked
    this.lock = after
    if (this.isHardLocked !== wasHard)
      this.onHardLockChanged?.(this.isHardLocked)
    if (
      (before.kind === undefined || before.kind === 'reconnecting') &&
      after.kind !== undefined &&
      after.kind !== 'reconnecting'
    ) {
      this.failure = undefined
      if (this.pendingKind === undefined) this.isUpdateQueued = false
    }
    if (
      before.kind !== undefined &&
      before.kind !== 'reconnecting' &&
      after.kind === undefined &&
      after.lastResolution === 'failed' &&
      this.failure === undefined
    ) {
      this.episodes += 1
      this.failure = {
        episodeId: this.episodes,
        request:
          before.kind === 'update'
            ? { kind: 'update', force: false }
            : { kind: before.kind },
      }
    }
    // The surface hears the lock only when what it publishes changed (`q`).
    if (
      !sameLockView(lockViewOf(before), lockViewOf(after)) ||
      before.stage !== after.stage ||
      before.lastResolutionKind !== after.lastResolutionKind
    )
      this.surface.lockChanged(lockViewOf(this.lock))
    if (before.kind !== after.kind) this.escalationKindChanged()
    this.scheduleSettle()
    if (
      before.kind !== undefined &&
      after.kind === undefined &&
      after.lastResolution === 'settled' &&
      this.pendingKind !== undefined
    ) {
      this.requestCount += 1
      this.waiter?.finish()
      this.waiter = undefined
      this.inFlight = false
      this.setPending(undefined)
      this.activityChanged()
      this.dispatch({ type: 'pending', isPending: false, at: this.clock.now() })
    }
    if (
      before.kind !== undefined &&
      this.lock.kind === undefined &&
      this.isBlocked &&
      this.pendingKind === undefined
    ) {
      this.isBlocked = false
      this.inFlight = false
      this.error = undefined
    }
    if (before.kind !== undefined && this.lock.kind === undefined)
      this.checkQueue()
    this.notify()
  }

  private setPending(kind: RebuildKind | undefined): void {
    this.pendingKind = kind
    this.surface.pendingChanged(kind)
  }

  /** The lock's own time to let go (`V`). */
  private scheduleSettle(): void {
    this.settleTimer?.()
    this.settleTimer = undefined
    const at = this.lock.settleAt
    if (this.lock.kind === undefined || at === undefined) return
    this.settleTimer = this.clock.schedule(
      Math.max(0, at - this.clock.now()),
      () => {
        this.settleTimer = undefined
        this.dispatch({ type: 'tick', at: this.clock.now() })
        if (this.settleTimer === undefined) this.scheduleSettle()
      },
    )
  }

  /** The selected agent's computer (`te`). */
  private statusNow(): void {
    if (this.inputs.imageUpdateAvailable !== this.lock.imageUpdateAvailable)
      this.dispatch({
        type: 'imageUpdate',
        available: this.inputs.imageUpdateAvailable,
        at: this.clock.now(),
      })
    if (this.inputs.imageUpdateAvailable === false) this.cancelQueuedUpdate()
    this.dispatch({
      type: 'box',
      boxId: this.inputs.boxId,
      phase: this.inputs.phase,
      at: this.clock.now(),
    })
  }

  /** Whether the lock may be held changed (`ne`). */
  private activityChanged(): void {
    const active = this.isActive
    if (active === this.wasActive) return
    this.wasActive = active
    if (!active) {
      this.reconnectTimer?.()
      this.reconnectTimer = undefined
      this.dispatch({ type: 'deactivate', at: this.clock.now() })
      return
    }
    const pending = this.pendingKind
    if (pending === 'reset' || pending === 'recover') {
      this.dispatch({
        type: 'request',
        kind: pending,
        operationId: this.resetOperationIdHeld,
        at: this.clock.now(),
      })
    } else if (pending === 'update') {
      this.dispatch({
        type: 'request',
        kind: 'update',
        source: 'request',
        at: this.clock.now(),
      })
    }
    this.replayMigration()
  }

  /** The server's last step, told to the lock again. */
  private replayMigration(): void {
    const raw = this.migration.last
    if (raw === undefined) return
    this.dispatch({
      type: 'migration',
      phase: raw.phase,
      operationId: raw.operationId,
      at: this.clock.now(),
    })
  }

  /** The stream (`j`): "Reconnecting" once it has been down 2.5 s, if it was up since the window connected. */
  private transportNow(): void {
    const connected = this.inputs.transportConnected
    if (connected === this.lastTransport) return
    this.lastTransport = connected
    this.dispatch({
      type: 'connection',
      isConnected: connected,
      at: this.clock.now(),
    })
    this.reconnectTimer?.()
    this.reconnectTimer = undefined
    if (connected) {
      if (this.connectedOnce) this.connectedSinceConnect = true
      return
    }
    if (!this.connectedOnce || !this.connectedSinceConnect || !this.isActive)
      return
    this.reconnectTimer = this.clock.schedule(reconnectDelay, () => {
      this.reconnectTimer = undefined
      if (this.lock.kind === undefined && this.isActive)
        this.dispatch({
          type: 'request',
          kind: 'reconnecting',
          at: this.clock.now(),
        })
      this.notify()
    })
  }

  /** The queued update, once nobody is at work (`le`). */
  private checkQueue(): void {
    if (this.inputs.anyRunning) {
      this.queueFired = false
      return
    }
    if (
      !this.isUpdateQueued ||
      this.queueFired ||
      this.inFlight ||
      this.pendingKind !== undefined ||
      this.lock.kind !== undefined ||
      this.inputs.boxId === undefined
    )
      return
    this.queueFired = true
    this.start({ kind: 'update', force: false })
  }

  /** A request (`se`). */
  private start(request: RebuildRequest): void {
    if (this.inFlight) return
    if (request.kind === 'update' && this.inputs.boxId === undefined) return
    if (request.kind !== 'update' && this.inputs.isCurrentGroup) return
    this.failure = undefined
    const generation = this.generation
    this.requestCount += 1
    const count = this.requestCount
    this.inFlight = true
    this.setPending(request.kind)
    this.error = undefined
    if (request.kind !== 'update') this.resetOperationIdHeld = undefined
    this.dispatch({ type: 'pending', isPending: true, at: this.clock.now() })
    if (this.isActive) {
      if (request.kind === 'update') {
        this.dispatch({
          type: 'request',
          kind: 'update',
          source: 'request',
          at: this.clock.now(),
        })
      } else {
        this.dispatch({
          type: 'request',
          kind: request.kind,
          at: this.clock.now(),
        })
        this.replayMigration()
      }
    }
    this.activityChanged()
    this.notify()
    void this.carry(request, generation, count)
  }

  /** The request's call and its outcome, after this turn (the Swift `Task`). */
  private async carry(
    request: RebuildRequest,
    generation: number,
    count: number,
  ): Promise<void> {
    await Promise.resolve()
    const stale = () =>
      generation !== this.generation || count !== this.requestCount
    try {
      const untrackable = await this.run(request, stale)
      if (!stale()) {
        if (untrackable !== undefined) {
          this.isBlocked = true
          this.error = untrackable
        } else {
          this.inFlight = false
        }
      }
    } catch (error) {
      if (!stale()) {
        this.inFlight = false
        const held =
          this.lock.kind !== undefined && this.lock.kind !== 'reconnecting'
        if (held || this.lock.lastResolution === 'failed') {
          if (this.failure) {
            this.failure = { episodeId: this.failure.episodeId, request }
          } else {
            this.episodes += 1
            this.failure = { episodeId: this.episodes, request }
          }
          if (error instanceof RebuildFailure) {
            this.error = error.message
          } else if (error instanceof CallFailure) {
            switch (request.kind) {
              case 'update':
                this.error = t(
                  "Couldn't update the computer. Check your connection and try again.",
                )
                break
              case 'reset':
                this.error = t(
                  "Couldn't reset the computer. Check your connection and try again.",
                )
                break
              case 'recover':
                this.error = t(
                  "Couldn't recover the computer. Check your connection and try again.",
                )
                break
            }
          } else {
            this.error = t('Something went wrong with the computer. Try again.')
          }
        }
        if (held) this.dispatch({ type: 'error', at: this.clock.now() })
      }
    }
    if (stale()) {
      this.notify()
      return
    }
    this.setPending(undefined)
    this.activityChanged()
    this.dispatch({ type: 'pending', isPending: false, at: this.clock.now() })
    if (this.failure === undefined) this.checkQueue()
    this.notify()
  }

  /** The call and the wait for its operation to finish (`X`): undefined when finished, or the words for one that cannot be followed. */
  private async run(
    request: RebuildRequest,
    stale: () => boolean,
  ): Promise<string | undefined> {
    const calls = this.calls
    if (!calls) return undefined
    const failureWords =
      request.kind === 'update'
        ? t('The computer update failed. Try again.')
        : request.kind === 'reset'
          ? t('The computer reset failed. Try again.')
          : t('The computer recovery failed. Try again.')
    const waiting = new Waiter(failureWords)
    this.waiter = waiting
    try {
      let answer: RecreateAnswer
      if (request.kind === 'update') {
        const boxId = this.inputs.boxId
        if (boxId === undefined) return undefined
        try {
          answer = await calls.update(boxId, request.force)
        } catch {
          throw new CallFailure()
        }
        // A refused update reaches the window as a failed call (main throws `SandComputerRecreateRefusedError`).
        if (answer.kind === 'rejected') throw new CallFailure()
        if (stale()) return undefined
        this.cancelQueuedUpdate()
        if (answer.kind === 'untrackable')
          return t(
            "The computer update started, but Simeon can't track its progress. Restart Simeon after the computer is available again.",
          )
        this.dispatch({ type: 'acknowledged', at: this.clock.now() })
        await this.wait(waiting, answer.operationId)
        return undefined
      }
      try {
        answer = await calls.reset()
      } catch {
        throw new CallFailure()
      }
      if (answer.kind === 'rejected')
        throw new RebuildFailure(
          request.kind === 'recover'
            ? RebuildDriver.saidOfRecover(answer.reason)
            : answer.reason,
        )
      if (stale()) return undefined
      this.cancelQueuedUpdate()
      if (answer.kind !== 'started')
        return request.kind === 'recover'
          ? t(
              "The computer recovery started, but Simeon can't track its progress. Restart Simeon after the computer is available again.",
            )
          : t(
              "The computer reset started, but Simeon can't track its progress. Restart Simeon after the computer is available again.",
            )
      this.resetOperationIdHeld = answer.operationId
      if (this.isActive) {
        this.dispatch({
          type: 'request',
          kind: request.kind,
          operationId: answer.operationId,
          at: this.clock.now(),
        })
        this.dispatch({ type: 'acknowledged', at: this.clock.now() })
        this.replayMigration()
      }
      await this.wait(waiting, answer.operationId)
      return undefined
    } finally {
      if (this.waiter === waiting) this.waiter = undefined
      waiting.finish()
    }
  }

  private wait(waiting: Waiter, operationId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      waiting.operationId = operationId
      waiting.waitOn(resolve, reject)
      if (waiting.done) {
        waiting.done = false
        waiting.finish()
        return
      }
      waiting.check(this.migration.last)
    })
  }

  // MARK: Two minutes (`B$n`)

  private escalationKindChanged(): void {
    const kind = this.lock.kind
    if (kind === this.escalationKind) return
    this.escalationKind = kind
    this.armEscalation()
  }

  private armEscalation(): void {
    this.escalationTimer?.()
    this.escalationTimer = undefined
    this.escalation = undefined
    if (this.lock.kind === undefined) return
    this.escalationTimer = this.clock.schedule(escalationDelay, () => {
      const held = this.lock.kind
      if (held === undefined) return
      this.escalationTimer = undefined
      this.escalation =
        held === 'reconnecting' ? 'unreachable' : 'taking-longer'
      this.notify()
    })
  }
}
