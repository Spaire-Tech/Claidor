// A routine's editor as the Mac's pane runs it
// (ios/SimeonCore/Sources/SimeonCore/RoutineEditing.swift, the Mac's
// `RoutineEditorModel` in mac/Simeon/RoutinesPage.swift; the window's `_2n`
// and `P2n`), without its drawing: RoutinesPage.tsx and
// RoutineTriggerCard.tsx draw it. Nothing is sent while typing: a field is
// saved when it lets go of the keys, a trigger when it is picked or its
// popover closes, and a new routine is made only once it has a name, an
// instruction and a trigger that is right. Then Test run's waits
// (`RoutineTestRuns`, the Mac's `RoutineRunBlocks`), and the Add menu's
// words.

import type { JSONObject, JSONValue } from './json'
import { t } from './l10n'
import {
  type Routine,
  RoutineRunFlight,
  newRoutineSpec,
  routineIsRunning,
  routineUnchanged,
  updateRoutineSpec,
} from './routines'
import {
  type ClockTime,
  type TriggerRow,
  newTriggerRow,
  sameJSON,
  scheduleLine,
  startShape,
  triggerLimit,
  triggerOf,
  triggerRows,
  triggerSources,
} from './routineTriggers'

/** What the editor and Test run need of the store (StoreAgents.swift's routines). */
export interface RoutineStore {
  routinesByAgent: Readonly<Record<string, Routine[] | undefined>>
  createRoutine(agentId: string, spec: JSONObject): Promise<Routine | undefined>
  updateRoutine(
    agentId: string,
    routineId: string,
    spec: JSONObject,
  ): Promise<boolean>
  enableRoutine(
    agentId: string,
    routineId: string,
    on: boolean,
  ): Promise<boolean>
  removeRoutine(agentId: string, routineId: string): Promise<void>
  testRoutine(agentId: string, routineId: string): Promise<boolean>
}

interface Queued {
  name?: string
  prompt?: string
  trigger?: JSONValue
}

/** A routine's editor (`RoutineEditing`), told to the screens when it changes. */
export class RoutineEditing {
  readonly agentId: string
  /** Undefined for a new routine until its create comes back; then the same editor goes on with the record (`onCreated`). */
  routineId?: string
  /** Opened from New Routine or Create Routine: the name field takes the keys. */
  readonly isNew: boolean

  /** The fields as typed. */
  name: string
  prompt: string
  /** The stored name, instruction and trigger as last seen (`W`, `G`, `te`): a field still showing them follows a change. */
  private seenName: string
  private seenPrompt: string
  private seenTrigger: JSONValue

  /** When to run, as edited (`draft.rows`), and the card's last rows that were right (`N`). */
  rows: TriggerRow[]
  private lastValid: TriggerRow[]
  /** The only row was removed: the Add menu opened by itself, and closing it leaves the card empty (`k`). */
  private removedLast = false

  /** A new routine's Active switch, on at first (`h`, `k`). */
  activeDraft = true
  /** The Active switch's call is on its way: the switch waits (`I.isPending`). */
  toggling = false
  /** The create is on its way (`A.isPending`); what was changed meanwhile (`Q`) and whether Delete was pressed (`ae`). */
  creating = false
  private queued?: Queued
  private deleteAfterCreate = false
  /** Test run's call is on its way (`J.isPending`). */
  testing = false
  /** "Couldn't save this routine.", until the next save is tried (`v`). */
  saveFailed = false

  /** The row whose popover is open, one at a time. */
  openRow?: number
  /** Bumped to open the Add menu by itself (the only row removed). */
  addMenuRequests = 0
  /** Bumped by Test run: Run history comes into view. */
  historyRequests = 0

  /** The calls under way, for `settled()`. */
  private work: Promise<void>[] = []
  private listeners = new Set<() => void>()
  private version = 0

  constructor(agentId: string, routine: Routine | undefined) {
    this.agentId = agentId
    this.routineId = routine?.id
    this.isNew = routine === undefined
    this.name = routine?.name ?? ''
    this.prompt = routine?.prompt ?? ''
    this.seenName = routine?.name ?? ''
    this.seenPrompt = routine?.prompt ?? ''
    this.seenTrigger = routine?.trigger ?? null
    const rows = triggerRows(routine?.trigger)
    this.rows = rows
    this.lastValid = rows
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getVersion = (): number => this.version

  private changed(): void {
    this.version += 1
    for (const listener of [...this.listeners]) listener()
  }

  stored(store: RoutineStore): Routine | undefined {
    const id = this.routineId
    if (id === undefined) return undefined
    return store.routinesByAgent[this.agentId]?.find(
      (routine) => routine.id === id,
    )
  }

  /** Waits for every call the editor started, and the ones those started (the tests). */
  async settled(): Promise<void> {
    while (this.work.length > 0) {
      const next = this.work.shift()!
      await next
    }
  }

  private run(body: () => Promise<void>): void {
    // Long done ones are let go: an editor left open saves many times.
    if (this.work.length > 32) this.work.splice(0, this.work.length - 32)
    this.work.push(body().finally(() => this.changed()))
  }

  // MARK: Typing

  setName(name: string): void {
    if (this.name === name) return
    this.name = name
    this.changed()
  }

  setPrompt(prompt: string): void {
    if (this.prompt === prompt) return
    this.prompt = prompt
    this.changed()
  }

  /** A row's popover opened (one at a time). */
  openRowAt(index: number | undefined): void {
    if (this.openRow === index) return
    this.openRow = index
    this.changed()
  }

  // MARK: The stored record changed

  /** A field still showing the stored words follows them; the rows follow the stored trigger while they equal the one before (`W`, `G`, `te`). */
  follow(routine: Routine | undefined): void {
    if (!routine) return
    let moved = false
    if (routine.name !== this.seenName) {
      if (this.name === this.seenName) {
        this.name = routine.name
        moved = true
      }
      this.seenName = routine.name
    }
    if (routine.prompt !== this.seenPrompt) {
      if (this.prompt === this.seenPrompt) {
        this.prompt = routine.prompt
        moved = true
      }
      this.seenPrompt = routine.prompt
    }
    const trigger = routine.trigger ?? null
    if (!sameJSON(trigger, this.seenTrigger)) {
      const current = triggerOf(this.rows)
      if (current && sameJSON(current, this.seenTrigger)) {
        this.rows = triggerRows(routine.trigger)
        moved = true
      }
      this.seenTrigger = trigger
    }
    if (moved) this.changed()
  }

  // MARK: Saving (`X`, `xe`, `fe`)

  /** What a save sends: for a stored routine an empty field keeps what is stored and the switch's pending value goes (`X`). */
  private spec(
    trigger: JSONValue,
    store: RoutineStore,
  ): JSONObject | undefined {
    const stored = this.stored(store)
    if (stored)
      return updateRoutineSpec(
        stored,
        this.name,
        this.prompt,
        trigger,
        stored.isEnabled,
      )
    return newRoutineSpec(this.name, this.prompt, trigger, this.activeDraft)
  }

  /** The current trigger: the rows when they are right, else the stored one (`be`). */
  private currentTrigger(store: RoutineStore): JSONValue | undefined {
    return triggerOf(this.rows) ?? this.stored(store)?.trigger
  }

  /** A new routine made once it is whole (`xe`); edits while it is made go after it as one update, if they change anything. */
  private create(trigger: JSONValue | undefined, store: RoutineStore): void {
    if (this.routineId !== undefined || this.creating || trigger == null) return
    const spec = this.spec(trigger, store)
    if (!spec) return
    this.creating = true
    this.changed()
    const agentId = this.agentId
    this.run(async () => {
      const made = await store.createRoutine(agentId, spec)
      this.creating = false
      if (!made) {
        this.queued = undefined
        this.deleteAfterCreate = false
        this.saveFailed = true
        return
      }
      if (this.deleteAfterCreate) {
        this.deleteAfterCreate = false
        this.queued = undefined
        await store.removeRoutine(agentId, made.id)
        return
      }
      if (made.isEnabled !== this.activeDraft)
        this.setEnabled(made.id, this.activeDraft, store)
      const pending = this.queued
      this.queued = undefined
      this.routineId = made.id
      this.seenName = made.name
      this.seenPrompt = made.prompt
      this.seenTrigger = made.trigger ?? null
      if (pending) {
        const next: JSONObject = {
          name: pending.name ?? made.name,
          prompt: pending.prompt ?? made.prompt,
          trigger: pending.trigger ?? made.trigger ?? null,
          isEnabled: this.activeDraft,
        }
        if (
          !routineUnchanged(made, next) &&
          !(await store.updateRoutine(agentId, made.id, next))
        )
          this.saveFailed = true
      }
    })
  }

  /** A stored routine changed (`fe`). */
  private update(trigger: JSONValue | undefined, store: RoutineStore): void {
    const routineId = this.routineId
    if (routineId === undefined || trigger == null) return
    const spec = this.spec(trigger, store)
    if (!spec) return
    const agentId = this.agentId
    this.run(async () => {
      if (!(await store.updateRoutine(agentId, routineId, spec)))
        this.saveFailed = true
    })
  }

  /** Name let go of the keys (`Ae`): empty or unchanged puts the stored name back; else it is saved. */
  nameDone(store: RoutineStore): void {
    this.saveFailed = false
    const value = this.name.trim()
    const stored = this.stored(store)
    if (stored) {
      if (value === '' || value === stored.name) {
        this.name = stored.name
        this.changed()
        return
      }
      this.update(this.currentTrigger(store) ?? stored.trigger, store)
      this.changed()
      return
    }
    if (this.creating) {
      if (value !== '') this.queued = { ...this.queued, name: value }
      this.changed()
      return
    }
    this.create(this.currentTrigger(store), store)
    this.changed()
  }

  /** Instruction let go of the keys (`ve`), as Name. */
  promptDone(store: RoutineStore): void {
    this.saveFailed = false
    const value = this.prompt.trim()
    const stored = this.stored(store)
    if (stored) {
      if (value === '' || value === stored.prompt) {
        this.prompt = stored.prompt
        this.changed()
        return
      }
      this.update(this.currentTrigger(store) ?? stored.trigger, store)
      this.changed()
      return
    }
    if (this.creating) {
      if (value !== '') this.queued = { ...this.queued, prompt: value }
      this.changed()
      return
    }
    this.create(this.currentTrigger(store), store)
    this.changed()
  }

  /** The rows committed (`ye`): saved when right and not what is stored. */
  private save(next: TriggerRow[], store: RoutineStore): void {
    this.saveFailed = false
    this.rows = next
    const trigger = triggerOf(next)
    if (!trigger) return
    const stored = this.stored(store)
    if (stored) {
      if (sameJSON(trigger, stored.trigger ?? null)) return
      this.update(trigger, store)
      return
    }
    if (this.creating) {
      this.queued = { ...this.queued, trigger }
      return
    }
    this.create(trigger, store)
  }

  // MARK: The card's rows (`P2n`: `J`, `O`, `L`, `V`, `W`, `B`)

  /** A commit: the rows, if right, become the last right ones; then saved (`J`). */
  commit(next: TriggerRow[], store: RoutineStore): void {
    if (triggerOf(next)) this.lastValid = next
    this.save(next, store)
    this.changed()
  }

  /** A popover or the Add menu closed with no pick (`O`, `de`): rows that are right are saved; else they go back (the stored trigger, or a new routine's last right rows). */
  commitOrRevert(store: RoutineStore): void {
    const stored = this.stored(store)
    if (triggerOf(this.rows)) {
      this.lastValid = this.rows
      this.save(this.rows, store)
    } else if (stored) {
      this.rows = triggerRows(stored.trigger)
    } else {
      this.rows = this.lastValid
    }
    this.changed()
  }

  /** A row typed into or chosen, saved now when `commits` (a pick, a field letting go of the keys). */
  set(
    index: number,
    row: TriggerRow,
    commits: boolean,
    store: RoutineStore,
  ): void {
    if (index < 0 || index >= this.rows.length) return
    const next = [...this.rows]
    next[index] = row
    if (commits) this.commit(next, store)
    else {
      this.rows = next
      this.changed()
    }
  }

  /** A row added from the Add menu (`L`): committed now when it is right alone. Its index. */
  private add(row: TriggerRow, store: RoutineStore): number {
    this.removedLast = false
    const next = [...this.rows, row]
    if (triggerOf([row])) this.commit(next, store)
    else this.rows = next
    return next.length - 1
  }

  /** A schedule from the Add menu (`D`): saved at once; its popover opens for Every week, Every month, Interval and Advanced. */
  addSchedule(line: string, opens: boolean, store: RoutineStore): void {
    if (this.rows.length >= triggerLimit) return
    const index = this.add({ kind: 'schedule', text: line }, store)
    this.openRow = opens ? index : undefined
    this.changed()
  }

  /** An event source from the Add menu (`F`): its row, and its popover open. */
  addSource(platform: string, store: RoutineStore): void {
    if (this.rows.length >= triggerLimit) return
    this.openRow = this.add(newTriggerRow(platform), store)
    this.changed()
  }

  /** × on a row (`V`): with others left it goes and the rest is saved; the only row empties the card (nothing is saved) and the Add menu opens. */
  remove(index: number, store: RoutineStore): void {
    this.openRow = undefined
    if (this.rows.length <= 1) {
      this.lastValid = []
      this.rows = []
      this.removedLast = true
      this.addMenuRequests += 1
      this.changed()
      return
    }
    if (index < 0 || index >= this.rows.length) return
    const next = [...this.rows]
    next.splice(index, 1)
    this.commit(next, store)
  }

  /** The Add menu closed (`W`): with no pick the rows are kept or go back, unless the only row was just removed. */
  addMenuClosed(picked: boolean, store: RoutineStore): void {
    if (picked || this.removedLast) return
    this.commitOrRevert(store)
  }

  /** The popover closed (`B`): ×, Escape or a click outside it. */
  closeRow(store: RoutineStore): void {
    if (this.openRow === undefined) return
    this.openRow = undefined
    this.commitOrRevert(store)
  }

  // MARK: The control bar

  /** The switch's value: a new routine's own, else the stored one (changed at once while its call is on its way). */
  isActive(store: RoutineStore): boolean {
    return this.stored(store)?.isEnabled ?? this.activeDraft
  }

  /** The Active switch (`Je`): a new routine keeps it for its create; a stored one is changed now, and goes back if refused. */
  toggleActive(on: boolean, store: RoutineStore): void {
    const routineId = this.routineId
    if (routineId === undefined) {
      this.activeDraft = on
      this.changed()
      return
    }
    this.setEnabled(routineId, on, store)
  }

  private setEnabled(id: string, on: boolean, store: RoutineStore): void {
    this.toggling = true
    this.changed()
    const agentId = this.agentId
    this.run(async () => {
      await store.enableRoutine(agentId, id, on)
      this.toggling = false
    })
  }

  /** Delete (`Ie`): no question; a routine being made is deleted when its create comes back. The pane goes back to the list at once. */
  delete(store: RoutineStore): void {
    const routineId = this.routineId
    if (routineId !== undefined) {
      const agentId = this.agentId
      this.run(() => store.removeRoutine(agentId, routineId))
    } else if (this.creating) {
      this.deleteAfterCreate = true
    }
  }

  /** Test run (`we`): the run asked for, the list read again, Run history brought into view. */
  testRun(store: RoutineStore, runs: RoutineTestRuns): void {
    const routineId = this.routineId
    if (routineId === undefined) return
    this.historyRequests += 1
    this.testing = true
    this.changed()
    const agentId = this.agentId
    this.run(async () => {
      await runs.run(agentId, routineId, store)
      this.testing = false
    })
  }

  /** "Running…" and not pressable: its call on its way, the wait after it (`rJt`), or its newest run still going (`Le`). */
  isRunning(store: RoutineStore, runs: RoutineTestRuns): boolean {
    const routineId = this.routineId
    if (routineId === undefined) return false
    const stored = this.stored(store)
    return (
      this.testing ||
      runs.isBlocked(this.agentId, routineId) ||
      (stored !== undefined && routineIsRunning(stored))
    )
  }
}

/**
 * Test run's waits, for every routine (the Mac's `RoutineRunBlocks`, the
 * window's `runNowBlockedFor`): set on the click, held while the run it
 * started is awaited and while it runs, lifted 3 seconds after it ends, or
 * at once when the routine goes or the run is refused. The store tells it
 * when an agent's list changes (`listChanged`), as the core observes the
 * list; `told` is called whenever a wait starts or ends.
 */
export class RoutineTestRuns {
  blocked = new Set<string>()
  private flights = new Map<string, RoutineRunFlight>()
  private expiries = new Map<string, ReturnType<typeof setTimeout>>()

  constructor(
    private readonly told: () => void = () => {},
    private readonly cooldownMs = RoutineRunFlight.cooldownSeconds * 1000,
  ) {}

  private static key(agentId: string, routineId: string): string {
    return `${agentId}\u001f${routineId}`
  }

  isBlocked(agentId: string, routineId: string): boolean {
    return this.blocked.has(RoutineTestRuns.key(agentId, routineId))
  }

  /** Test run (`runNow`): once at a time per routine. */
  async run(
    agentId: string,
    routineId: string,
    store: RoutineStore,
  ): Promise<void> {
    const key = RoutineTestRuns.key(agentId, routineId)
    if (this.flights.has(key)) return
    this.flights.set(
      key,
      new RoutineRunFlight(
        store.routinesByAgent[agentId]?.find(
          (routine) => routine.id === routineId,
        ),
      ),
    )
    this.blocked.add(key)
    this.told()
    if (!(await store.testRoutine(agentId, routineId))) {
      if (this.flights.get(key)?.phase.kind !== 'cooldown') this.end(key)
      return
    }
    this.listChanged(agentId, store)
    const flight = this.flights.get(key)
    if (flight) {
      flight.afterRead()
      this.place(key, flight)
    }
  }

  /** The agent's list changed: each of its waits moves on. */
  listChanged(agentId: string, store: RoutineStore): void {
    const prefix = `${agentId}\u001f`
    for (const [key, flight] of [...this.flights]) {
      if (!key.startsWith(prefix)) continue
      const routineId = key.slice(prefix.length)
      if (
        flight.take(
          store.routinesByAgent[agentId]?.find(
            (routine) => routine.id === routineId,
          ),
        )
      )
        this.place(key, flight)
      else this.end(key)
    }
  }

  private place(key: string, flight: RoutineRunFlight): void {
    this.flights.set(key, flight)
    if (flight.phase.kind !== 'cooldown' || this.expiries.has(key)) return
    this.expiries.set(
      key,
      setTimeout(() => this.end(key), this.cooldownMs),
    )
  }

  private end(key: string): void {
    this.flights.delete(key)
    const expiry = this.expiries.get(key)
    if (expiry !== undefined) clearTimeout(expiry)
    this.expiries.delete(key)
    if (this.blocked.delete(key)) this.told()
  }

  /** Signed out: every wait ends, quietly. */
  reset(): void {
    for (const expiry of this.expiries.values()) clearTimeout(expiry)
    this.expiries.clear()
    this.flights.clear()
    this.blocked.clear()
  }
}

// MARK: The Add menu's words

/** A trigger source's name, as the Add menu words it ("On a schedule", "Slack message"…). */
export function sourceLabel(platform: string): string {
  return platform === 'schedule'
    ? t('On a schedule')
    : (triggerSources().find((source) => source.platform === platform)?.label ??
        platform)
}

/** The Add menu's Cadence (`A2n`): each choice's words, and its line or the days its times run on; `opens` says whether its popover opens once it is added. */
export const cadences = (): {
  label: string
  line?: string
  days?: string
  opens: boolean
}[] => [
  { label: t('Every hour'), line: '0 * * * *', opens: false },
  { label: t('Every day'), days: '*', opens: false },
  { label: t('Weekdays'), days: '1-5', opens: false },
  {
    label: t('Every week'),
    line: scheduleLine(startShape('weekly', undefined)),
    opens: true,
  },
  {
    label: t('Every month'),
    line: scheduleLine(startShape('monthly', undefined)),
    opens: true,
  },
  {
    label: t('Interval'),
    line: scheduleLine(startShape('interval', undefined)),
    opens: true,
  },
  // Advanced… saves "0 8 * * *" and its popover shows Every day (the window's own quirk).
  {
    label: t('Advanced…'),
    line: scheduleLine(startShape('advanced', undefined)),
    opens: true,
  },
]

/** A Cadence time's line: "minute hour * * days" (`A2n`). */
export function timeLine(time: ClockTime, days: string): string {
  return `${time.minute} ${time.hour} * * ${days}`
}
