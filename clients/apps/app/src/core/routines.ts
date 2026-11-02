// An agent's routines as the host lists them
// (ios/SimeonCore/Sources/SimeonCore/Routines.swift): a routine and its runs
// (`AutomationRecord`, `AutomationRun`, host/automations/automation.ts), the
// editor's rules for saving (`RoutineDraft`), Test run's wait
// (`RoutineRunFlight`) and the older schedule picker's choices
// (`Schedule`), which still words a routine with no words of the host's.

import {
  type JSONObject,
  type JSONValue,
  arr,
  bool,
  field,
  num,
  str,
  text,
} from './json'
import { t } from './l10n'
import { isEnglish } from './language'
import { plainError } from './plainWords'
import {
  localClock,
  sameJSON,
  ordinal as scheduleOrdinal,
  triggerRows,
  triggerWords,
} from './routineTriggers'
import { wordsLanguage } from './words'

/** One run of a routine, for its history (`AutomationRun`). */
export interface RoutineRun {
  id: string
  /** "schedule", "manual" or "event". */
  trigger: string
  /** When it began, in milliseconds since the epoch. */
  at?: number
  finishedAt?: number
  /** "running", "ok" or "error". */
  status: string
  /** The error, at most 300 characters. */
  detail?: string
  /** What woke it, for an event. */
  event?: string
}

/** A run from the host's record; undefined with neither a time nor a status. */
export function routineRunFrom(json: JSONValue): RoutineRun | undefined {
  const at =
    num(field(json, 'startedAt')) ??
    num(field(json, 'at')) ??
    num(field(json, 'timestampMs')) ??
    num(field(json, 'finishedAt'))
  const status = str(field(json, 'status')) ?? str(field(json, 'outcome')) ?? ''
  if (at === undefined && status === '') return undefined
  return {
    id: text(field(json, 'id')) ?? `${at ?? 0}-${status}`,
    trigger: str(field(json, 'trigger')) ?? '',
    at,
    finishedAt: num(field(json, 'finishedAt')),
    status,
    detail: text(field(json, 'detail')) ?? text(field(json, 'error')),
    event: text(field(json, 'event')),
  }
}

/** The history row's tooltip (`detail ?? event`): a failure in plain words (PlainWords). */
export function runSummary(run: RoutineRun): string {
  if (run.detail !== undefined)
    return plainError(
      run.detail,
      t('This run didn’t finish. It will try again at its next time.'),
    )
  return run.event ?? ''
}

/** One of an agent's routines, as the host lists them (`AutomationRecord`). */
export interface Routine {
  id: string
  name: string
  prompt: string
  /** The first cron line of its trigger, when it runs on a schedule. */
  schedule: string
  /** The host's own words for when it runs (`triggerDescription`: "Every Monday at 9:00 AM"). */
  summary: string
  /** What wakes it, as stored: one member, or `{type:"group", listeners}`. */
  trigger?: JSONValue
  isEnabled: boolean
  /** Milliseconds since the epoch. */
  createdAt?: number
  lastRunAt?: number
  nextRunAt?: number
  /** Its last runs, newest first (the host keeps 20). */
  runs: RoutineRun[]
}

/** A routine from the host's record; undefined without an id. */
export function routineFrom(json: JSONValue): Routine | undefined {
  const id = text(field(json, 'id'))
  if (id === undefined) return undefined
  const stored = field(json, 'trigger')
  const line = text(field(json, 'schedule'))
  const trigger: JSONValue | undefined =
    stored != null
      ? stored
      : line !== undefined
        ? { type: 'cron', schedule: line }
        : undefined
  const firstCron = triggerRows(trigger).find((row) => row.kind === 'schedule')
  const schedule =
    str(field(json, 'schedule')) ??
    (firstCron?.kind === 'schedule' ? firstCron.text : undefined) ??
    ''
  return {
    id,
    name: str(field(json, 'name')) ?? 'Routine',
    prompt: str(field(json, 'prompt')) ?? '',
    schedule,
    summary:
      routineWhen(trigger, text(field(json, 'triggerDescription'))) ??
      scheduleSummary(scheduleFromCron(schedule)),
    trigger,
    isEnabled: bool(field(json, 'isEnabled')) ?? true,
    createdAt: num(field(json, 'createdAt')),
    lastRunAt: num(field(json, 'lastRunAt')),
    nextRunAt: num(field(json, 'nextRunAt')),
    runs: (arr(field(json, 'runs')) ?? []).flatMap((run) => {
      const one = routineRunFrom(run)
      return one ? [one] : []
    }),
  }
}

/** The routines of a host's answer: a list, or `{automations}`; undefined when it is neither. */
export function routinesFrom(
  answer: JSONValue | undefined,
): Routine[] | undefined {
  const rows = arr(answer) ?? arr(field(answer, 'automations'))
  if (!rows) return undefined
  return rows.flatMap((row) => {
    const routine = routineFrom(row)
    return routine ? [routine] : []
  })
}

/** Two lists the same, routine by routine (Swift's `==` on `[Routine]`). */
export function sameRoutines(
  a: readonly Routine[] | undefined,
  b: readonly Routine[] | undefined,
): boolean {
  if (a === b) return true
  if (!a || !b || a.length !== b.length) return false
  return a.every((one, index) => {
    const other = b[index]!
    const { trigger, runs, ...rest } = one
    const { trigger: otherTrigger, runs: otherRuns, ...otherRest } = other
    return (
      JSON.stringify(rest) === JSON.stringify(otherRest) &&
      JSON.stringify(runs) === JSON.stringify(otherRuns) &&
      sameJSON(trigger, otherTrigger)
    )
  })
}

/**
 * When it runs, as its row shows it: the host's own words in English
 * ("Every Monday at 9:00 AM"); in another language the editor's sentence
 * of each trigger (`triggerWords`), since the host writes English (22
 * October 2026). Undefined when there is neither.
 */
export function routineWhen(
  trigger: JSONValue | undefined,
  host: string | undefined,
): string | undefined {
  const rows = triggerRows(trigger)
  if (isEnglish(wordsLanguage()) || rows.length === 0) return host
  return rows
    .map((row) => {
      const words = triggerWords(row)
      return words.rest === '' ? words.lead : `${words.lead} ${words.rest}`
    })
    .join(' · ')
}

/** What `createAgentAutomation` and `updateAgentAutomation` take (`AutomationSpec`). */
export function routineSpec(routine: Routine): JSONObject {
  return {
    name: routine.name,
    prompt: routine.prompt,
    trigger: routine.trigger ?? { type: 'cron', schedule: routine.schedule },
    isEnabled: routine.isEnabled,
  }
}

/** The list's order: active ones first, then paused, each in the host's order (`V2n`). */
export function listedRoutines(routines: readonly Routine[]): Routine[] {
  return [
    ...routines.filter((routine) => routine.isEnabled),
    ...routines.filter((routine) => !routine.isEnabled),
  ]
}

/** Whether its newest run is still going. */
export function routineIsRunning(routine: Routine): boolean {
  return routine.runs[0]?.status === 'running'
}

/** A row's second line: the host's words, or "Paused" (`G2n`). */
export function routineRowDetail(routine: Routine): string {
  return routine.isEnabled ? routine.summary : t('Paused')
}

// MARK: The editor's rules for saving (`RoutineDraft`)

/*
 The routine editor's rules for saving, as the shipped window has them
 (`_2n`): nothing is saved until a new routine has a name, an instruction
 and a trigger; an existing one keeps its stored values for any field left
 empty.
*/

/** A new routine's spec, or undefined while it is not whole yet. */
export function newRoutineSpec(
  name: string,
  prompt: string,
  trigger: JSONValue | undefined,
  isEnabled: boolean,
): JSONObject | undefined {
  const n = name.trim()
  const p = prompt.trim()
  if (n === '' || p === '' || trigger == null) return undefined
  return { name: n, prompt: p, trigger, isEnabled }
}

/**
 * A stored routine's spec after an edit: an empty name or instruction, or
 * a trigger not yet right, keeps what is stored; with `isEnabled`, the
 * Active switch's value while its change is on its way (the window sends
 * the pending one).
 */
export function updateRoutineSpec(
  stored: Routine,
  name: string,
  prompt: string,
  trigger: JSONValue | undefined,
  isEnabled: boolean = stored.isEnabled,
): JSONObject {
  const n = name.trim()
  const p = prompt.trim()
  return {
    name: n === '' ? stored.name : n,
    prompt: p === '' ? stored.prompt : p,
    trigger: trigger ?? stored.trigger ?? null,
    isEnabled,
  }
}

/** Whether an update would change nothing the routine has (`Ate`): its name, instruction and trigger as stored. */
export function routineUnchanged(stored: Routine, spec: JSONValue): boolean {
  return (
    str(field(spec, 'name')) === stored.name &&
    str(field(spec, 'prompt')) === stored.prompt &&
    sameJSON(field(spec, 'trigger') ?? null, stored.trigger ?? null)
  )
}

/** The record a create made: the newest one whose id was not there before, one of the same name first (`v$n`). */
export function createdRoutine(
  after: readonly Routine[],
  before: ReadonlySet<string>,
  name: string,
): Routine | undefined {
  const fresh = after.filter((routine) => !before.has(routine.id))
  const named = fresh.filter((routine) => routine.name === name)
  let best: Routine | undefined
  for (const routine of named.length === 0 ? fresh : named)
    if (best === undefined || (routine.createdAt ?? 0) > (best.createdAt ?? 0))
      best = routine
  return best
}

export const routineSaveError = () => t("Couldn't save this routine.")
export const routinesEmpty = () =>
  t('Routines are recurring tasks this agent runs on a schedule.')

// MARK: Test run's wait (`RoutineRunFlight`)

export type RunFlightPhase =
  /** Waiting for a manual run other than the one there before the click. */
  | { kind: 'awaiting'; previous?: string }
  | { kind: 'running'; id: string }
  /** The 3 seconds after the run ended; then the wait is over. */
  | { kind: 'cooldown' }

/**
 * The Test run's wait (`b$n`'s flights): from the click until the manual
 * run it started has ended, then 3 seconds more
 * (`automation-manual-run-rearm`), so Test run reads "Running…" and cannot
 * be pressed again meanwhile.
 */
export class RoutineRunFlight {
  /** Seconds the wait holds after the run ended (`k$n`). */
  static readonly cooldownSeconds = 3

  phase: RunFlightPhase

  /** Clicked: the routine's newest manual run before it, if any. */
  constructor(before: Routine | undefined) {
    this.phase = {
      kind: 'awaiting',
      previous: before?.runs.find((run) => run.trigger === 'manual')?.id,
    }
  }

  /** A list came (`y`): false when the routine is not in it, and the wait ends at once. */
  take(routine: Routine | undefined): boolean {
    if (!routine) return false
    const manual = routine.runs.find((run) => run.trigger === 'manual')
    const phase = this.phase
    switch (phase.kind) {
      case 'awaiting':
        if (!manual || manual.id === phase.previous) return true
        this.phase =
          manual.status === 'running'
            ? { kind: 'running', id: manual.id }
            : { kind: 'cooldown' }
        break
      case 'running': {
        const run = routine.runs.find((one) => one.id === phase.id)
        if (run && run.status !== 'running') this.phase = { kind: 'cooldown' }
        break
      }
      case 'cooldown':
        break
    }
    return true
  }

  /** The run was asked for and the list read again: no new run in it yet means the wait is cooling down (`runNow`'s `h`). */
  afterRead(): void {
    if (this.phase.kind === 'awaiting') this.phase = { kind: 'cooldown' }
  }
}

// MARK: The older schedule picker (`Schedule`)

/**
 * When a routine runs, the choices of the Mac's schedule picker: every
 * hour, every day at a time, weekdays, a day of the week, a day of the
 * month, an interval, or a cron line of the person's own.
 */
export type Schedule =
  | { kind: 'hourly'; minute: number }
  | { kind: 'daily'; hour: number; minute: number }
  | { kind: 'weekdays'; hour: number; minute: number }
  /** `weekday` 0 is Sunday, as cron counts. */
  | { kind: 'weekly'; weekday: number; hour: number; minute: number }
  | { kind: 'monthly'; day: number; hour: number; minute: number }
  | { kind: 'everyMinutes'; every: number }
  | { kind: 'everyHours'; every: number }
  | { kind: 'custom'; line: string }

/** Swift's `Int(text)`: an optional sign and digits, nothing else. */
function swiftInt(value: string): number | undefined {
  if (!/^[+-]?\d+$/.test(value)) return undefined
  const n = Number(value)
  return Number.isSafeInteger(n) ? n : undefined
}

export function scheduleFromCron(line: string): Schedule {
  const f = line.split(/\s+/).filter(Boolean)
  const custom: Schedule = { kind: 'custom', line }
  if (f.length !== 5) return custom
  const [m, h, dom, mon, dow] = f as [string, string, string, string, string]
  const minute = swiftInt(m)
  const hour = swiftInt(h)
  if (mon !== '*') return custom
  if (m.startsWith('*/') && h === '*' && dom === '*' && dow === '*') {
    const n = swiftInt(m.slice(2))
    if (n !== undefined) return { kind: 'everyMinutes', every: n }
  }
  if (
    minute !== undefined &&
    h.startsWith('*/') &&
    dom === '*' &&
    dow === '*'
  ) {
    const n = swiftInt(h.slice(2))
    if (n !== undefined && minute === 0) return { kind: 'everyHours', every: n }
  }
  if (minute !== undefined && h === '*' && dom === '*' && dow === '*')
    return { kind: 'hourly', minute }
  if (minute === undefined || hour === undefined) return custom
  if (dom === '*' && dow === '*') return { kind: 'daily', hour, minute }
  if (dom === '*' && dow === '1-5') return { kind: 'weekdays', hour, minute }
  const weekday = swiftInt(dow)
  if (dom === '*' && weekday !== undefined && weekday >= 0 && weekday <= 7)
    return { kind: 'weekly', weekday: weekday % 7, hour, minute }
  const day = swiftInt(dom)
  if (dow === '*' && day !== undefined && day >= 1 && day <= 31)
    return { kind: 'monthly', day, hour, minute }
  return custom
}

export function scheduleCron(schedule: Schedule): string {
  switch (schedule.kind) {
    case 'hourly':
      return `${schedule.minute} * * * *`
    case 'daily':
      return `${schedule.minute} ${schedule.hour} * * *`
    case 'weekdays':
      return `${schedule.minute} ${schedule.hour} * * 1-5`
    case 'weekly':
      return `${schedule.minute} ${schedule.hour} * * ${schedule.weekday}`
    case 'monthly':
      return `${schedule.minute} ${schedule.hour} ${schedule.day} * *`
    case 'everyMinutes':
      return `*/${Math.max(1, schedule.every)} * * * *`
    case 'everyHours':
      return `0 */${Math.max(1, schedule.every)} * * *`
    case 'custom':
      return schedule.line
  }
}

const weekdayNames = () => [
  t('Sunday'),
  t('Monday'),
  t('Tuesday'),
  t('Wednesday'),
  t('Thursday'),
  t('Friday'),
  t('Saturday'),
]

function pickerClock(hour: number, minute: number): string {
  if (!isEnglish(wordsLanguage())) return localClock(hour, minute)
  const h12 = hour % 12 === 0 ? 12 : hour % 12
  return `${h12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`
}

function pickerOrdinal(n: number): string {
  if (!isEnglish(wordsLanguage())) return scheduleOrdinal(n)
  const suffix =
    n % 100 >= 11 && n % 100 <= 13
      ? 'th'
      : (['th', 'st', 'nd', 'rd', 'th', 'th', 'th', 'th', 'th', 'th'][n % 10] ??
        'th')
  return `${n}${suffix}`
}

/** "Every Monday at 9:00 AM", "Every hour at :15", "Weekdays at 8:30 AM". */
export function scheduleSummary(schedule: Schedule): string {
  switch (schedule.kind) {
    case 'hourly': {
      const mark = `:${String(schedule.minute).padStart(2, '0')}`
      return schedule.minute === 0 ? t('Every hour') : t`Every hour at ${mark}`
    }
    case 'daily':
      return t`Every day at ${pickerClock(schedule.hour, schedule.minute)}`
    case 'weekdays':
      return t`Weekdays at ${pickerClock(schedule.hour, schedule.minute)}`
    case 'weekly':
      return t`Every ${weekdayNames()[schedule.weekday % 7]!} at ${pickerClock(schedule.hour, schedule.minute)}`
    case 'monthly':
      return t`Every month on the ${pickerOrdinal(schedule.day)} at ${pickerClock(schedule.hour, schedule.minute)}`
    case 'everyMinutes':
      return schedule.every === 1
        ? t('Every minute')
        : t`Every ${schedule.every} minutes`
    case 'everyHours':
      return schedule.every === 1
        ? t('Every hour')
        : t`Every ${schedule.every} hours`
    case 'custom':
      return schedule.line === ''
        ? t('No schedule')
        : t`Custom (${schedule.line})`
  }
}
