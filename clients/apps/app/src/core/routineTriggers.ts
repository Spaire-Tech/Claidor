// When a routine runs, as the shipped window reads, writes and words it
// (ios/SimeonCore/Sources/SimeonCore/RoutineTriggers.swift): its schedules
// (`pmt`, `sTe`, `fae`, `dgn`, `h2n`) and its events (Slack, Git, Teams,
// Linear, Sentry, PagerDuty: `Hgn`, `Vgn`, `Ggn`, `tQ`, the rows' words).
// Each function is the core's, which is a port of the window's own, checked
// against it in Node (`RoutineTriggerTests`, routineTriggers.test.ts).
//
// The lists of words are functions, not constants: the words are loaded
// after this file, and a constant would keep the English.

import {
  type JSONObject,
  type JSONValue,
  arr,
  bool,
  field,
  isObject,
  str,
} from './json'
import { t, tk } from './l10n'
import { isEnglish } from './language'
import { displayLocale } from './listTime'
import { wordsLanguage } from './words'

/** Whether the app is in English (`AppLanguage.isEnglish(AppLanguage.current)`). */
const inEnglish = () => isEnglish(wordsLanguage())

const two = (n: number) => String(n).padStart(2, '0')

const ascending = (values: Iterable<number>) =>
  [...values].sort((a, b) => a - b)

/** JSON compared as Swift's `JSON` compares it: the same values, an object's fields in any order. */
export function sameJSON(
  a: JSONValue | undefined,
  b: JSONValue | undefined,
): boolean {
  if (a === b) return true
  if (a == null || b == null) return (a ?? null) === (b ?? null)
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length)
      return false
    return a.every((item, index) => sameJSON(item, b[index]))
  }
  if (isObject(a) && isObject(b)) {
    const keys = Object.keys(a)
    if (keys.length !== Object.keys(b).length) return false
    return keys.every((key) => key in b && sameJSON(a[key], b[key]))
  }
  return false
}

// MARK: Reading a schedule (`h5e`, `tAe`, `pmt`)

/** Spaces run together and trimmed (`h5e`). */
export function normalized(text: string): string {
  return text.trim().split(/\s+/).filter(Boolean).join(' ')
}

const aliases: Record<string, string> = {
  '@hourly': '0 * * * *',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@weekly': '0 0 * * 0',
  '@monthly': '0 0 1 * *',
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
}

const everyPattern = /^@every\s+(\d+)\s*(s|m|h|d)$/i

/** "@every 30m": its amount and unit letter (`eAe`). */
function every(text: string): { amount: number; unit: string } | undefined {
  const match = everyPattern.exec(text)
  if (!match) return undefined
  const n = Number(match[1])
  if (!Number.isSafeInteger(n) || n <= 0) return undefined
  return { amount: n, unit: match[2]!.toLowerCase() }
}

/** A cron line read into its sets (`tgn`). */
export interface Cron {
  minute: Set<number>
  hour: Set<number>
  dayOfMonth: Set<number>
  month: Set<number>
  dayOfWeek: Set<number>
  isDayOfMonthRestricted: boolean
  isDayOfWeekRestricted: boolean
  timeZone?: string
}

/** `Number(text)` that must be a whole number (JavaScript reads "" as 0). */
export function jsInteger(text: string): number | undefined {
  const trimmed = text.trim()
  if (trimmed === '') return 0
  const value = Number(trimmed)
  if (
    !Number.isFinite(value) ||
    Math.round(value) !== value ||
    Math.abs(value) >= 1e15
  )
    return undefined
  return value
}

function cronField(
  text: string,
  low: number,
  high: number,
): Set<number> | undefined {
  const out = new Set<number>()
  for (const part of text.split(',')) {
    const pieces = part.split('/')
    if (pieces.length > 2) return undefined
    const base = pieces[0]!
    let step = 1
    if (pieces.length === 2) {
      const value = jsInteger(pieces[1]!)
      if (value === undefined || value <= 0) return undefined
      step = value
    }
    let from: number
    let to: number
    if (base === '*' || base === '') {
      from = low
      to = high
    } else if (base.includes('-')) {
      const ends = base.split('-')
      const a = jsInteger(ends[0]!)
      const b = jsInteger(ends.length > 1 ? ends[1]! : '')
      if (a === undefined || b === undefined) return undefined
      from = a
      to = b
    } else {
      const a = jsInteger(base)
      if (a === undefined) return undefined
      from = a
      to = pieces.length === 2 ? high : a
    }
    if (from < low || to > high || from > to) return undefined
    for (let value = from; value <= to; value += step) out.add(value)
  }
  return out.size === 0 ? undefined : out
}

/** Whether a zone's name is one the clock knows (`TimeZone(identifier:)`). */
function knownZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone })
    return true
  } catch {
    return false
  }
}

/** A cron line, an alias, with or without "CRON_TZ=zone " (`tAe`); undefined when it is not one. */
export function cron(text: string): Cron | undefined {
  let line = normalized(text)
  let zone: string | undefined
  const named = /^(?:CRON_TZ|TZ)=(\S+)\s+/.exec(line)
  if (named) {
    zone = named[1]
    line = line.slice(named[0].length)
  }
  line = aliases[line.toLowerCase()] ?? line
  const parts = line.split(' ')
  if (parts.length !== 5) return undefined
  const minute = cronField(parts[0]!, 0, 59)
  const hour = cronField(parts[1]!, 0, 23)
  const dayOfMonth = cronField(parts[2]!, 1, 31)
  const month = cronField(parts[3]!, 1, 12)
  const dayOfWeek = cronField(parts[4]!, 0, 7)
  if (!minute || !hour || !dayOfMonth || !month || !dayOfWeek) return undefined
  if (zone !== undefined && !knownZone(zone)) return undefined
  return {
    minute,
    hour,
    dayOfMonth,
    month,
    dayOfWeek: new Set([...dayOfWeek].map((day) => (day === 7 ? 0 : day))),
    isDayOfMonthRestricted: parts[2] !== '*',
    isDayOfWeekRestricted: parts[4] !== '*',
    timeZone: zone,
  }
}

/** A schedule the host can run (`pmt`): "@every 30m", a cron line or an alias, with a valid zone if it names one. */
export function scheduleIsValid(text: string): boolean {
  const line = normalized(text)
  return every(line) !== undefined || cron(line) !== undefined
}

// MARK: Words (`dgn`)

export const weekdays = () => [
  t('Sunday'),
  t('Monday'),
  t('Tuesday'),
  t('Wednesday'),
  t('Thursday'),
  t('Friday'),
  t('Saturday'),
]

const shortWeekdays = () => [
  t('Sun'),
  t('Mon'),
  t('Tue'),
  t('Wed'),
  t('Thu'),
  t('Fri'),
  t('Sat'),
]

export const months = () => [
  t('January'),
  t('February'),
  t('March'),
  t('April'),
  t('May'),
  t('June'),
  t('July'),
  t('August'),
  t('September'),
  t('October'),
  t('November'),
  t('December'),
]

const shortMonths = () => [
  t('Jan'),
  t('Feb'),
  t('Mar'),
  t('Apr'),
  t('May'),
  t('Jun'),
  t('Jul'),
  t('Aug'),
  t('Sep'),
  t('Oct'),
  t('Nov'),
  t('Dec'),
]

/** "9:05 AM" (`Mu`); another language's own way ("09:05"). */
export function clock(hour: number, minute: number): string {
  if (!inEnglish()) return localClock(hour, minute)
  return `${hour % 12 === 0 ? 12 : hour % 12}:${two(minute)} ${hour < 12 ? 'AM' : 'PM'}`
}

/**
 * A time of day as the app's language writes it in the person's region
 * (Apple's template "jmm"): the language's short time, which keeps its
 * own hour ("09:00" in French, "9:00" in Spanish), as Apple's does; the
 * browser's "numeric" hour would drop the French 0.
 */
export function localClock(hour: number, minute: number): string {
  return new Intl.DateTimeFormat(displayLocale(), {
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(1970, 0, 1, hour, minute)))
}

/** "1st", "22nd" (`Sme`); a day of the month as another language writes it ("1er", "22"). */
export function ordinal(n: number): string {
  if (!inEnglish()) return tk('day.ordinal', n)
  let suffix = 'th'
  if (n % 100 < 11 || n % 100 > 13) {
    if (n % 10 === 1) suffix = 'st'
    else if (n % 10 === 2) suffix = 'nd'
    else if (n % 10 === 3) suffix = 'rd'
  }
  return `${n}${suffix}`
}

/** "a and b", "a, b, and c" (`Fge`). */
export function andList(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  if (items.length === 2) return t`${items[0]!} and ${items[1]!}`
  return t`${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]!}`
}

/** "a or b", "a, b, or c" (`L1`). */
export function orList(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  if (items.length === 2) return t`${items[0]!} or ${items[1]!}`
  return t`${items.slice(0, -1).join(', ')}, or ${items[items.length - 1]!}`
}

/** The step of an evenly spaced list, from its first two (`$ge`). */
function step(sorted: readonly number[]): number | undefined {
  if (sorted.length < 2) return undefined
  const delta = sorted[1]! - sorted[0]!
  if (delta <= 0) return undefined
  let last = sorted[1]!
  for (const value of sorted.slice(2)) {
    if (value - last !== delta) return undefined
    last = value
  }
  return delta
}

function days(line: Cron): { lead: string; on?: string } | undefined {
  const allMonths = line.month.size === 12
  const domLimited = line.isDayOfMonthRestricted && line.dayOfMonth.size < 31
  const dowLimited = line.isDayOfWeekRestricted && line.dayOfWeek.size < 7
  if (domLimited && dowLimited) return undefined
  if (dowLimited) {
    if (!allMonths) return undefined
    const sorted = ascending(line.dayOfWeek)
    if (sorted.join() === '1,2,3,4,5')
      return { lead: t('Weekdays'), on: tk('schedule.onWeekdays') }
    if (sorted.join() === '0,6')
      return { lead: t('Weekends'), on: tk('schedule.onWeekends') }
    const first = sorted[0]
    const last = sorted[sorted.length - 1]
    if (first === undefined || last === undefined) return undefined
    if (sorted.length > 3) {
      if (step(sorted) !== 1) return undefined
      const span = `${shortWeekdays()[first]}–${shortWeekdays()[last]}`
      return { lead: span, on: `, ${span}` }
    }
    const names = andList(sorted.map((day) => weekdays()[day]!))
    return { lead: t`Every ${names}`, on: tk('schedule.onDays', names) }
  }
  if (domLimited) {
    const sorted = ascending(line.dayOfMonth)
    if (allMonths) {
      if (sorted.length > 3) return undefined
      const names = andList(sorted.map(ordinal))
      return {
        lead: t`On the ${names} of every month`,
        on: tk('schedule.onMonthDays', names),
      }
    }
    if (line.month.size === 1 && sorted.length === 1) {
      const month = [...line.month][0]!
      const date = tk('schedule.monthDay', months()[month - 1]!, sorted[0]!)
      return { lead: t`Every ${date}`, on: tk('schedule.onDate', date) }
    }
    return undefined
  }
  return allMonths ? { lead: t('Every day') } : undefined
}

const minuteMark = (minute: number) => `:${two(minute)}`

type Times =
  | { kind: 'interval'; base: string; window?: string }
  | { kind: 'times'; list: string[] }

function times(line: Cron): Times | undefined {
  const minutes = ascending(line.minute)
  const hours = ascending(line.hour)
  const firstMinute = minutes[0]
  const lastMinute = minutes[minutes.length - 1]
  const firstHour = hours[0]
  const lastHour = hours[hours.length - 1]
  if (
    firstMinute === undefined ||
    lastMinute === undefined ||
    firstHour === undefined ||
    lastHour === undefined
  )
    return undefined
  const everyHour = hours.length === 24
  if (minutes.length === 1) {
    const mark = minuteMark(firstMinute)
    if (everyHour)
      return {
        kind: 'interval',
        base: firstMinute === 0 ? t('Every hour') : t`Every hour at ${mark}`,
      }
    if (hours.length === 1)
      return { kind: 'times', list: [clock(firstHour, firstMinute)] }
    const gap = step(hours)
    if (gap !== undefined) {
      const base = gap === 1 ? t('Every hour') : t`Every ${gap} hours`
      if (firstHour === 0 && lastHour + gap > 23) {
        if (firstMinute === 0) return { kind: 'interval', base }
        return {
          kind: 'interval',
          base:
            gap === 1
              ? t`Every hour at ${mark}`
              : t`Every ${gap} hours at ${mark}`,
        }
      }
      if (gap === 1 || hours.length > 3)
        return {
          kind: 'interval',
          base,
          window: `${clock(firstHour, firstMinute)} – ${clock(lastHour, firstMinute)}`,
        }
    }
    return hours.length <= 3
      ? { kind: 'times', list: hours.map((hour) => clock(hour, firstMinute)) }
      : undefined
  }
  let base: string
  const gap = step(minutes)
  if (minutes[0] === 0 && gap !== undefined && lastMinute + gap > 59) {
    base = gap === 1 ? t('Every minute') : t`Every ${gap} minutes`
  } else {
    if (minutes.length > 3) return undefined
    if (!everyHour && hours.length === 1)
      return {
        kind: 'times',
        list: minutes.map((minute) => clock(firstHour, minute)),
      }
    base = t`Every hour at ${andList(minutes.map(minuteMark))}`
  }
  if (everyHour) return { kind: 'interval', base }
  if (hours.length === 1 || step(hours) === 1)
    return {
      kind: 'interval',
      base,
      window: `${clock(firstHour, firstMinute)} – ${clock(lastHour, lastMinute)}`,
    }
  return undefined
}

/** A schedule in words (`dgn`): "Every day at 8:00 AM", "Every 15 minutes on weekdays, 9:00 AM – 5:45 PM"; the line as it is when it can't be said. */
export function describeSchedule(text: string): string {
  const line = normalized(text)
  const interval = every(line)
  if (interval) {
    const n = interval.amount
    switch (interval.unit) {
      case 's':
        return n === 1 ? t('Every second') : t`Every ${n} seconds`
      case 'm':
        return n === 1 ? t('Every minute') : t`Every ${n} minutes`
      case 'h':
        return n === 1 ? t('Every hour') : t`Every ${n} hours`
      default:
        return n === 1 ? t('Every day') : t`Every ${n} days`
    }
  }
  const read = cron(line)
  if (!read) return line
  const on = days(read)
  const at = times(read)
  if (!on || !at) return line
  const words =
    at.kind === 'times'
      ? tk('schedule.daysAt', on.lead, andList(at.list))
      : at.base + (on.on ?? '') + (at.window ? `, ${at.window}` : '')
  return read.timeZone !== undefined ? `${words} (${read.timeZone})` : words
}

// MARK: The picker's shapes (`sTe`, `Sgn`, `fae`)

export interface ClockTime {
  hour: number
  minute: number
}

/** The days of an Advanced schedule, as the window's objects write them. */
export type Days =
  | { kind: 'every-day' }
  | { kind: 'days-of-week'; daysOfWeek: number[] }
  | { kind: 'days-of-month'; daysOfMonth: number[] }

/** The times of an Advanced schedule: at times, or every so many "minutes" or "hours" between two hours. */
export type TimeOfDay =
  | { kind: 'at-times'; minute: number; hours: number[] }
  | {
      kind: 'interval'
      unit: string
      amount: number
      fromHour: number
      toHour: number
    }

/** What the Frequency picker shows for a schedule; `mode` is its value ("hourly", "daily"…). */
export type Shape =
  | { mode: 'hourly'; minute: number }
  | { mode: 'daily'; time: ClockTime }
  | { mode: 'weekdays'; time: ClockTime }
  | { mode: 'weekly'; dayOfWeek: number; time: ClockTime }
  | { mode: 'monthly'; dayOfMonth: number; time: ClockTime }
  /** `unit` "minutes", "hours" or "days". */
  | { mode: 'interval'; amount: number; unit: string }
  | { mode: 'advanced'; months: number[] | null; days: Days; time: TimeOfDay }

/** The Frequency picker's choices, in its order (`Ign`). */
export const frequencies = (): { value: string; label: string }[] => [
  { value: 'hourly', label: t('Every hour') },
  { value: 'daily', label: t('Every day') },
  { value: 'weekdays', label: t('Weekdays') },
  { value: 'weekly', label: t('Every week') },
  { value: 'monthly', label: t('Every month') },
  { value: 'interval', label: t('Interval') },
  { value: 'advanced', label: t('Advanced') },
  { value: 'custom', label: t('Custom') },
]

const intervalUnits: Record<string, string> = {
  m: 'minutes',
  h: 'hours',
  d: 'days',
}

/** The shape the picker shows for a schedule (`sTe`); undefined for one it can only show as Custom. */
export function scheduleShape(text: string): Shape | undefined {
  const line = normalized(text)
  const match = everyPattern.exec(line)
  if (match) {
    const parsed = Number(match[1])
    const n = Number.isSafeInteger(parsed) ? parsed : 0
    const unit = intervalUnits[match[2]!.toLowerCase()]
    if (n <= 0 || unit === undefined) return undefined
    return { mode: 'interval', amount: n, unit }
  }
  const read = cron(line)
  if (!read || read.timeZone !== undefined) return undefined
  return structured(read)
}

function evenStep(sorted: readonly number[]): number | undefined {
  if (sorted.length < 2) return undefined
  const delta = sorted[1]! - sorted[0]!
  if (delta <= 0) return undefined
  for (let index = 2; index < sorted.length; index += 1)
    if (sorted[index]! - sorted[index - 1]! !== delta) return undefined
  return delta
}

function timeOfDay(
  minutes: readonly number[],
  hours: readonly number[],
): TimeOfDay | undefined {
  const firstMinute = minutes[0]
  const firstHour = hours[0]
  const lastHour = hours[hours.length - 1]
  if (
    firstMinute === undefined ||
    firstHour === undefined ||
    lastHour === undefined
  )
    return undefined
  if (minutes.length === 1) {
    const gap = evenStep(hours)
    if (firstMinute === 0 && gap !== undefined && gap >= 2 && hours.length > 2)
      return firstHour === 0 && lastHour + gap > 23
        ? {
            kind: 'interval',
            unit: 'hours',
            amount: gap,
            fromHour: 0,
            toHour: 23,
          }
        : {
            kind: 'interval',
            unit: 'hours',
            amount: gap,
            fromHour: firstHour,
            toHour: lastHour,
          }
    return { kind: 'at-times', minute: firstMinute, hours: [...hours] }
  }
  const lastMinute = minutes[minutes.length - 1]!
  const gap = minutes.length === 60 ? 1 : evenStep(minutes)
  if (firstMinute !== 0 || gap === undefined || lastMinute + gap <= 59)
    return undefined
  if (hours.length === 24)
    return {
      kind: 'interval',
      unit: 'minutes',
      amount: gap,
      fromHour: 0,
      toHour: 23,
    }
  if (hours.length > 1 && evenStep(hours) !== 1) return undefined
  return {
    kind: 'interval',
    unit: 'minutes',
    amount: gap,
    fromHour: firstHour,
    toHour: lastHour,
  }
}

function structured(line: Cron): Shape | undefined {
  const minutes = ascending(line.minute)
  const hours = ascending(line.hour)
  const allMonths = line.month.size === 12
  const domLimited = line.isDayOfMonthRestricted && line.dayOfMonth.size < 31
  const dowLimited = line.isDayOfWeekRestricted && line.dayOfWeek.size < 7
  if (domLimited && dowLimited) return undefined
  const limited = !allMonths || domLimited || dowLimited
  let time: TimeOfDay
  if (minutes.length === 1 && hours.length === 24) {
    const minute = minutes[0]!
    if (!limited) return { mode: 'hourly', minute }
    if (minute !== 0) return undefined
    time = {
      kind: 'interval',
      unit: 'hours',
      amount: 1,
      fromHour: 0,
      toHour: 23,
    }
  } else {
    const found = timeOfDay(minutes, hours)
    if (!found) return undefined
    time = found
  }
  const on: Days = dowLimited
    ? { kind: 'days-of-week', daysOfWeek: ascending(line.dayOfWeek) }
    : domLimited
      ? { kind: 'days-of-month', daysOfMonth: ascending(line.dayOfMonth) }
      : { kind: 'every-day' }
  if (allMonths && time.kind === 'at-times' && time.hours.length === 1) {
    const at = { hour: time.hours[0]!, minute: time.minute }
    switch (on.kind) {
      case 'every-day':
        return { mode: 'daily', time: at }
      case 'days-of-week':
        if (on.daysOfWeek.join() === '1,2,3,4,5')
          return { mode: 'weekdays', time: at }
        if (on.daysOfWeek.length === 1)
          return { mode: 'weekly', dayOfWeek: on.daysOfWeek[0]!, time: at }
        break
      case 'days-of-month':
        if (on.daysOfMonth.length === 1)
          return { mode: 'monthly', dayOfMonth: on.daysOfMonth[0]!, time: at }
        break
    }
  }
  return {
    mode: 'advanced',
    months: allMonths ? null : ascending(line.month),
    days: on,
    time,
  }
}

const joined = (values: readonly number[]) => ascending(new Set(values)).join()

/** The schedule a shape is written as (`fae`). */
export function scheduleLine(shape: Shape): string {
  switch (shape.mode) {
    case 'hourly':
      return `${shape.minute} * * * *`
    case 'daily':
      return `${shape.time.minute} ${shape.time.hour} * * *`
    case 'weekdays':
      return `${shape.time.minute} ${shape.time.hour} * * 1-5`
    case 'weekly':
      return `${shape.time.minute} ${shape.time.hour} * * ${shape.dayOfWeek}`
    case 'monthly':
      return `${shape.time.minute} ${shape.time.hour} ${shape.dayOfMonth} * *`
    case 'interval':
      return `@every ${shape.amount}${{ minutes: 'm', hours: 'h', days: 'd' }[shape.unit] ?? 'm'}`
    case 'advanced': {
      let minute: string
      let hour: string
      const time = shape.time
      if (time.kind === 'at-times') {
        minute = String(time.minute)
        hour = new Set(time.hours).size >= 24 ? '*' : joined(time.hours)
      } else {
        const whole = time.fromHour <= 0 && time.toHour >= 23
        const window = whole ? '*' : `${time.fromHour}-${time.toHour}`
        if (time.unit === 'minutes') {
          minute = time.amount === 1 ? '*' : `*/${time.amount}`
          hour = window
        } else if (time.amount === 1) {
          minute = '0'
          hour = window
        } else {
          minute = '0'
          hour = whole ? `*/${time.amount}` : `${window}/${time.amount}`
        }
      }
      let dom = '*'
      let dow = '*'
      if (shape.days.kind === 'days-of-week')
        dow =
          new Set(shape.days.daysOfWeek).size >= 7
            ? '*'
            : joined(shape.days.daysOfWeek)
      else if (shape.days.kind === 'days-of-month')
        dom =
          new Set(shape.days.daysOfMonth).size >= 31
            ? '*'
            : joined(shape.days.daysOfMonth)
      const month =
        shape.months === null
          ? '*'
          : new Set(shape.months).size >= 12
            ? '*'
            : joined(shape.months)
      return `${minute} ${hour} ${dom} ${month} ${dow}`
    }
  }
}

/** The time a shape starts a new one at (`ymt`): its own, else 8:00 AM. */
function startTime(shape: Shape | undefined): ClockTime {
  const eight = { hour: 8, minute: 0 }
  switch (shape?.mode) {
    case 'daily':
    case 'weekdays':
    case 'weekly':
    case 'monthly':
      return shape.time
    case 'hourly':
      return { hour: 8, minute: shape.minute }
    case 'advanced':
      if (shape.time.kind === 'at-times' && shape.time.hours.length > 0)
        return { hour: shape.time.hours[0]!, minute: shape.time.minute }
      return eight
    default:
      return eight
  }
}

/** Advanced, from the shape before it (`rTe`). */
export function advancedShape(shape: Shape | undefined): Shape {
  const start = startTime(shape)
  const at: TimeOfDay = {
    kind: 'at-times',
    minute: start.minute,
    hours: [start.hour],
  }
  const everyDay: Days = { kind: 'every-day' }
  if (!shape)
    return { mode: 'advanced', months: null, days: everyDay, time: at }
  switch (shape.mode) {
    case 'advanced':
      return shape
    case 'weekdays':
      return {
        mode: 'advanced',
        months: null,
        days: { kind: 'days-of-week', daysOfWeek: [1, 2, 3, 4, 5] },
        time: at,
      }
    case 'weekly':
      return {
        mode: 'advanced',
        months: null,
        days: { kind: 'days-of-week', daysOfWeek: [shape.dayOfWeek] },
        time: at,
      }
    case 'monthly':
      return {
        mode: 'advanced',
        months: null,
        days: { kind: 'days-of-month', daysOfMonth: [shape.dayOfMonth] },
        time: at,
      }
    case 'hourly':
      return shape.minute === 0
        ? {
            mode: 'advanced',
            months: null,
            days: everyDay,
            time: {
              kind: 'interval',
              unit: 'hours',
              amount: 1,
              fromHour: 0,
              toHour: 23,
            },
          }
        : { mode: 'advanced', months: null, days: everyDay, time: at }
    case 'interval':
      return shape.unit !== 'days'
        ? {
            mode: 'advanced',
            months: null,
            days: everyDay,
            time: {
              kind: 'interval',
              unit: shape.unit,
              amount: shape.amount,
              fromHour: 0,
              toHour: 23,
            },
          }
        : { mode: 'advanced', months: null, days: everyDay, time: at }
    case 'daily':
      return { mode: 'advanced', months: null, days: everyDay, time: at }
  }
}

/** The shape a Frequency choice starts with, from the one before it (`mne`). */
export function startShape(mode: string, shape: Shape | undefined): Shape {
  const time = startTime(shape)
  switch (mode) {
    case 'hourly':
      return {
        mode: 'hourly',
        minute: shape?.mode === 'hourly' ? shape.minute : 0,
      }
    case 'daily':
      return { mode: 'daily', time }
    case 'weekdays':
      return { mode: 'weekdays', time }
    case 'weekly':
      return {
        mode: 'weekly',
        dayOfWeek: shape?.mode === 'weekly' ? shape.dayOfWeek : 1,
        time,
      }
    case 'monthly':
      return {
        mode: 'monthly',
        dayOfMonth: shape?.mode === 'monthly' ? shape.dayOfMonth : 1,
        time,
      }
    case 'interval':
      return shape?.mode === 'interval'
        ? shape
        : { mode: 'interval', amount: 30, unit: 'minutes' }
    default:
      return advancedShape(shape)
  }
}

/** A row's sentence with its first word apart, the word the row shows in the text's colour. */
export interface RowWords {
  lead: string
  rest: string
}

/** A row's sentence with its first word apart. */
export function splitWords(words: string): RowWords {
  const space = words.indexOf(' ')
  if (space < 0) return { lead: words, rest: '' }
  return { lead: words.slice(0, space), rest: words.slice(space + 1) }
}

/** A schedule's row in the editor (`h2n`): "Every" "day at 8:00 AM", "On" "weekdays at 8:00 AM", "Cron" "…". */
export function scheduleRow(text: string): RowWords {
  if (text.trim() === '') return { lead: 'Cron', rest: '…' }
  const shape = scheduleShape(text)
  switch (shape?.mode) {
    case 'hourly':
      return splitWords(
        shape.minute === 0
          ? t('Every hour')
          : t`Every hour at ${minuteMark(shape.minute)}`,
      )
    case 'daily':
      return splitWords(
        t`Every day at ${clock(shape.time.hour, shape.time.minute)}`,
      )
    case 'weekdays':
      return splitWords(
        t`On weekdays at ${clock(shape.time.hour, shape.time.minute)}`,
      )
    case 'weekly':
      return splitWords(
        t`Every ${weekdays()[shape.dayOfWeek]!} at ${clock(shape.time.hour, shape.time.minute)}`,
      )
    case 'monthly':
      return splitWords(
        t`Monthly on the ${ordinal(shape.dayOfMonth)} at ${clock(shape.time.hour, shape.time.minute)}`,
      )
    default: {
      const words = describeSchedule(text)
      if (!words.includes(' ') || words === text.trim())
        return { lead: 'Cron', rest: words }
      return splitWords(words)
    }
  }
}

/** The add menu's 96 times, 15 minutes apart ("12:00 AM" … "11:45 PM"), each its hour and minute (`A2n`). */
export const quarterHours: readonly ClockTime[] = Array.from(
  { length: 96 },
  (_, index) => ({
    hour: Math.floor((index * 15) / 60),
    minute: (index * 15) % 60,
  }),
)

/** The minute choices ":00" … ":55", and the current one (`Bgn`). */
export function minuteChoices(current: number): number[] {
  return ascending(
    new Set([...Array.from({ length: 12 }, (_, i) => i * 5), current]),
  )
}

/** The time choices 15 minutes apart, and the current one (`Lgn`), as minutes of the day. */
export function timeChoices(current: number): number[] {
  return ascending(
    new Set([...Array.from({ length: 96 }, (_, i) => i * 15), current]),
  )
}

const intervalBases: Record<string, number[]> = {
  minutes: [1, 2, 5, 10, 15, 20, 30, 45],
  hours: [1, 2, 3, 4, 6, 8, 12],
  days: [1, 2, 3, 7, 14, 30],
}

/** The interval amounts for each unit, and the current one (`Hge`). */
export function intervalChoices(unit: string, current: number): number[] {
  return ascending(new Set([...(intervalBases[unit] ?? []), current]))
}

/** The amount a unit falls back to when the amount doesn't fit it (`vmt`). */
export const intervalFallback: Record<string, number> = {
  minutes: 30,
  hours: 1,
  days: 1,
}

// MARK: When a run was (`pgn`)

interface ZoneParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
}

function zoneParts(ms: number, timeZone?: string): ZoneParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(new Date(ms))
  const part = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0)
  return {
    year: part('year'),
    month: part('month'),
    day: part('day'),
    hour: part('hour') % 24,
    minute: part('minute'),
  }
}

/** A day as a count of days since 1 January 1970. */
const dayNumber = (p: ZoneParts) =>
  Math.round(Date.UTC(p.year, p.month - 1, p.day) / 86_400_000)

/**
 * A run's time as the window's history words it, in `timeZone` (the
 * device's when none): "Just now", "4 min ago", "Today at 9:05 AM",
 * "Yesterday at…", "Last Monday at…", "Oct 3 at…", "Oct 3, 2025 at…" (the
 * first letter capitalised, `M2n`).
 */
export function runWhen(ms: number, now: number, timeZone?: string): string {
  const words = runRelative(ms, now, timeZone)
  return words.slice(0, 1).toUpperCase() + words.slice(1)
}

export function runRelative(
  ms: number,
  now: number,
  timeZone?: string,
): string {
  const minute = 60_000
  const hour = 3_600_000
  const delta = ms - now
  if (delta > 0 && delta < hour) return t`in ${Math.ceil(delta / minute)} min`
  if (delta <= 0 && -delta < minute) return t('just now')
  if (delta <= 0 && -delta < hour)
    return t`${Math.floor(-delta / minute)} min ago`
  const parts = zoneParts(ms, timeZone)
  const today = zoneParts(now, timeZone)
  const at = clock(parts.hour, parts.minute)
  const day = dayNumber(parts)
  const apart = day - dayNumber(today)
  // 1 January 1970 was a Thursday; Sunday is 0.
  const weekday = weekdays()[(((day + 4) % 7) + 7) % 7]!
  if (apart === 0) return t`today at ${at}`
  if (apart === 1) return t`tomorrow at ${at}`
  if (apart === -1) return t`yesterday at ${at}`
  if (apart > 1 && apart < 7) return tk('schedule.dayAt', weekday, at)
  if (apart < -1 && apart > -7) return t`last ${weekday} at ${at}`
  const date = tk(
    'schedule.monthDay',
    shortMonths()[parts.month - 1]!,
    parts.day,
  )
  return parts.year === today.year
    ? tk('schedule.dayAt', date, at)
    : t`${date}, ${String(parts.year)} at ${at}`
}

// MARK: The rows (`TriggerRow`)

/**
 * One of a routine's triggers as the editor holds it while it is changed
 * (the window's rows): a schedule, or an event on Slack, Git, Teams,
 * Linear, Sentry or PagerDuty. Text fields stay as typed; `triggerMember`
 * reads them into what is saved, undefined while one is not right.
 */
export type TriggerRow =
  | { kind: 'schedule'; text: string }
  /** `match` "message", "keyword", "mention" or "reaction". */
  | {
      kind: 'slack'
      channel: string
      match: string
      keyword: string
      emoji: string
      bySelf: boolean
    }
  | {
      kind: 'github'
      repo: string
      events: string[]
      userAllowlist: string
      ciBranch: string
    }
  | {
      kind: 'teams'
      tenantId: string
      teamIds: string
      channelIds: string
      messageContains: string
      isRegex: boolean
      linkedOnly: boolean
    }
  /** `event` "issueCreated", "statusChanged" or "endOfCycle". */
  | {
      kind: 'linear'
      event: string
      statusIds: string
      cycleIds: string
      projectIds: string
      teamIds: string
    }
  | { kind: 'sentry'; event: string; projectIds: string }
  | { kind: 'pagerduty'; event: string; serviceIds: string }

/** The most a routine has (`NUe`). */
export const triggerLimit = 8

/** The add menu's sources after "On a schedule", in its order, with their words. */
export const triggerSources = (): { platform: string; label: string }[] => [
  { platform: 'slack', label: t('Slack message') },
  { platform: 'github', label: t('Git event') },
  { platform: 'microsoftTeams', label: t('Teams message') },
  { platform: 'linear', label: t('Linear issue') },
  { platform: 'sentry', label: t('Sentry alert') },
  { platform: 'pagerduty', label: t('PagerDuty incident') },
]

/** A new row for a source, as the window starts one (`Hgn`). */
export function newTriggerRow(platform: string): TriggerRow {
  switch (platform) {
    case 'slack':
      return {
        kind: 'slack',
        channel: '',
        match: 'message',
        keyword: '',
        emoji: '',
        bySelf: false,
      }
    case 'github':
      return {
        kind: 'github',
        repo: '',
        events: ['pr-opened'],
        userAllowlist: '',
        ciBranch: '',
      }
    case 'microsoftTeams':
      return {
        kind: 'teams',
        tenantId: '',
        teamIds: '',
        channelIds: '',
        messageContains: '',
        isRegex: false,
        linkedOnly: false,
      }
    case 'linear':
      return {
        kind: 'linear',
        event: 'issueCreated',
        statusIds: '',
        cycleIds: '',
        projectIds: '',
        teamIds: '',
      }
    case 'sentry':
      return { kind: 'sentry', event: 'issueCreated', projectIds: '' }
    default:
      return { kind: 'pagerduty', event: 'incidentTriggered', serviceIds: '' }
  }
}

// MARK: Saved and read (`Vgn`, `Ggn`, `tQ`, `K0n`)

const strings = (value: JSONValue | undefined): string[] =>
  (arr(value) ?? []).flatMap((item) => {
    const one = str(item)
    return one === undefined ? [] : [one]
  })

/** The rows of a saved trigger (one member, or a group's). */
export function triggerRows(trigger: JSONValue | undefined): TriggerRow[] {
  if (trigger == null) return []
  const members =
    str(field(trigger, 'type')) === 'group'
      ? (arr(field(trigger, 'listeners')) ?? [])
      : [trigger]
  return members.flatMap((member) => {
    const row = triggerRow(member)
    return row ? [row] : []
  })
}

function triggerRow(member: JSONValue): TriggerRow | undefined {
  const list = (key: string) => strings(field(member, key)).join(', ')
  switch (str(field(member, 'type'))) {
    case 'cron':
      return { kind: 'schedule', text: str(field(member, 'schedule')) ?? '' }
    case 'slack': {
      const match = field(member, 'match')
      const kind = str(field(match, 'kind')) ?? 'message'
      return {
        kind: 'slack',
        channel: str(field(member, 'channel')) ?? '',
        match: kind,
        keyword: kind === 'keyword' ? (str(field(match, 'keyword')) ?? '') : '',
        emoji:
          kind === 'reaction' ? strings(field(match, 'emoji')).join(', ') : '',
        bySelf: kind === 'reaction' && bool(field(match, 'bySelf')) === true,
      }
    }
    case 'github':
      return {
        kind: 'github',
        repo: str(field(member, 'repo')) ?? '',
        events: strings(field(member, 'events')),
        userAllowlist: list('userAllowlist'),
        ciBranch: str(field(member, 'ciBranch')) ?? '',
      }
    case 'microsoftTeams': {
      const teams = strings(field(member, 'teamIds'))
      const ids = (
        teams.length === 0 ? [str(field(member, 'teamId')) ?? ''] : teams
      ).filter((id) => id !== '')
      return {
        kind: 'teams',
        tenantId: str(field(member, 'tenantId')) ?? '',
        teamIds: ids.join(', '),
        channelIds: list('channelIds'),
        messageContains: str(field(member, 'messageContains')) ?? '',
        isRegex: bool(field(member, 'messageContainsIsRegex')) ?? false,
        linkedOnly:
          bool(field(member, 'blockUnauthenticatedTeamsUsers')) ?? false,
      }
    }
    case 'linear': {
      const event = field(member, 'event')
      const kind = str(field(event, 'case')) ?? 'issueCreated'
      const ids = (key: string) => strings(field(event, key)).join(', ')
      return {
        kind: 'linear',
        event: kind,
        statusIds: kind === 'statusChanged' ? ids('statusIds') : '',
        cycleIds: kind === 'endOfCycle' ? ids('cycleIds') : '',
        projectIds: list('projectIds'),
        teamIds: list('teamIds'),
      }
    }
    case 'sentry':
      return {
        kind: 'sentry',
        event: str(field(field(member, 'event'), 'case')) ?? 'issueCreated',
        projectIds: list('projectIds'),
      }
    case 'pagerduty':
      return {
        kind: 'pagerduty',
        event:
          str(field(field(member, 'event'), 'case')) ?? 'incidentTriggered',
        serviceIds: list('serviceIds'),
      }
    default:
      return undefined
  }
}

const separators = /[\s,]+/

/** Ids split on spaces and commas, each once (`Pl`). */
export function triggerIds(text: string): string[] {
  const out: string[] = []
  for (const piece of text.split(separators))
    if (piece !== '' && !out.includes(piece)) out.push(piece)
  return out
}

/** Reaction emoji as Slack names them, eight at most (`Smt`). */
export function emojiNames(text: string): string[] {
  const out: string[] = []
  for (const piece of text.split(separators)) {
    let name = piece.trim().replace(/^:+/, '').replace(/:+$/, '')
    name = (name.split('::')[0] ?? name).trim().toLowerCase()
    if (name === '' || !/^[a-z0-9_+-]+$/.test(name) || out.includes(name))
      continue
    out.push(name)
    if (out.length >= 8) break
  }
  return out
}

const isCI = (event: string) => event === 'ci-passed' || event === 'ci-failed'

const notABranch = new RegExp(String.raw`[\s~^:?*\[\\]|^[-/]|/$|\.\.|@\{`)

/** A branch name Git allows (`V0n`). */
function isBranch(text: string): boolean {
  return text !== '' && !notABranch.test(text)
}

/** What this row saves as, undefined while it is not right (`Wgn`). */
export function triggerMember(row: TriggerRow): JSONObject | undefined {
  switch (row.kind) {
    case 'schedule': {
      const line = row.text.trim()
      return line === '' || !scheduleIsValid(line)
        ? undefined
        : { type: 'cron', schedule: line }
    }
    case 'slack': {
      const place = row.channel.trim()
      if (place === '') return undefined
      if (row.match === 'keyword') {
        const word = row.keyword.trim()
        return word === ''
          ? undefined
          : {
              type: 'slack',
              channel: place,
              match: { kind: 'keyword', keyword: word },
            }
      }
      if (row.match === 'reaction') {
        const kind: JSONObject = { kind: 'reaction' }
        const names = emojiNames(row.emoji)
        if (names.length > 0) kind.emoji = names
        if (row.bySelf) kind.bySelf = true
        return { type: 'slack', channel: place, match: kind }
      }
      return { type: 'slack', channel: place, match: { kind: row.match } }
    }
    case 'teams': {
      const tenant = row.tenantId.trim()
      const teamIds = triggerIds(row.teamIds)
      if (tenant === '' || teamIds.length === 0) return undefined
      return {
        type: 'microsoftTeams',
        tenantId: tenant,
        teamId: '',
        teamIds,
        channelIds: triggerIds(row.channelIds),
        messageContains: row.messageContains.trim(),
        messageContainsIsRegex: row.isRegex,
        blockUnauthenticatedTeamsUsers: row.linkedOnly,
      }
    }
    case 'linear': {
      const kind: JSONObject = { case: row.event }
      if (row.event === 'statusChanged')
        kind.statusIds = triggerIds(row.statusIds)
      if (row.event === 'endOfCycle') kind.cycleIds = triggerIds(row.cycleIds)
      return {
        type: 'linear',
        event: kind,
        projectIds: triggerIds(row.projectIds),
        teamIds: triggerIds(row.teamIds),
      }
    }
    case 'sentry':
      return {
        type: 'sentry',
        event: { case: row.event },
        projectIds: triggerIds(row.projectIds),
      }
    case 'pagerduty':
      return {
        type: 'pagerduty',
        event: { case: row.event },
        serviceIds: triggerIds(row.serviceIds),
      }
    case 'github': {
      const repo = row.repo.trim()
      if (!/^[^\s/]+\/[^\s/]+$/.test(repo) || row.events.length === 0)
        return undefined
      const ci = row.events.some(isCI)
      const branch = row.ciBranch.trim()
      if (ci && !isBranch(branch)) return undefined
      const people: string[] = []
      for (const piece of row.userAllowlist.split(separators)) {
        const login = piece.trim().replace(/^@+/, '')
        if (
          login !== '' &&
          !people.some((one) => one.toLowerCase() === login.toLowerCase())
        )
          people.push(login)
      }
      const out: JSONObject = {
        type: 'github',
        repo,
        events: [...row.events],
      }
      if (people.length > 0) out.userAllowlist = people
      if (ci) out.ciBranch = branch
      return out
    }
  }
}

/** The routine's trigger from its rows: one, or a group of them; undefined while any is not right, or there are none (`tQ`). */
export function triggerOf(rows: readonly TriggerRow[]): JSONObject | undefined {
  if (rows.length === 0) return undefined
  const members: JSONObject[] = []
  for (const row of rows) {
    const member = triggerMember(row)
    if (!member) return undefined
    members.push(member)
  }
  return members.length === 1
    ? members[0]
    : { type: 'group', listeners: members }
}

// MARK: Words (`g2n`…`S2n`)

const gitWords = (): Record<string, string> => ({
  'pr-opened': t('a PR opens'),
  'pr-pushed': t('a PR is updated'),
  'pr-merged': t('a PR merges'),
  'review-requested': t('a review is requested'),
  'review-approved': t('a review approves a PR'),
  'review-changes-requested': t('a review requests changes'),
  'review-commented': t('a review comments on a PR'),
  'pr-comment': t('a PR comment lands'),
  'inline-review-comment': t('an inline review comment lands'),
  'review-thread-resolved': t('a review thread is resolved'),
  'review-thread-unresolved': t('a review thread is reopened'),
  'issue-assigned': t('an issue is assigned'),
  'ci-passed': t('CI passes'),
  'ci-failed': t('CI fails'),
})

/** The Git events in the window's order, under their headings (`xmt`). */
export const gitSections = (): {
  title: string
  events: { kind: string; label: string }[]
}[] => [
  {
    title: t('Pull request'),
    events: [
      { kind: 'pr-opened', label: tk('pr.opened') },
      { kind: 'pr-pushed', label: tk('pr.updated') },
      { kind: 'pr-merged', label: tk('pr.merged') },
    ],
  },
  {
    title: t('Review'),
    events: [
      { kind: 'review-requested', label: tk('review.requested') },
      { kind: 'review-approved', label: tk('review.approved') },
      { kind: 'review-changes-requested', label: t('Changes requested') },
      { kind: 'review-commented', label: tk('review.commented') },
      { kind: 'review-thread-resolved', label: t('Thread resolved') },
      { kind: 'review-thread-unresolved', label: t('Thread reopened') },
    ],
  },
  {
    title: t('Comment'),
    events: [
      { kind: 'pr-comment', label: t('PR comment') },
      { kind: 'inline-review-comment', label: t('Inline review comment') },
    ],
  },
  {
    title: t('Checks'),
    events: [
      { kind: 'ci-passed', label: t('CI passed') },
      { kind: 'ci-failed', label: t('CI failed') },
    ],
  },
  {
    title: t('Issue'),
    events: [{ kind: 'issue-assigned', label: tk('issue.assigned') }],
  },
]

/** Every Git event in the order the window keeps them (`D0n`). */
export const gitOrder = [
  'pr-opened',
  'pr-pushed',
  'pr-merged',
  'review-requested',
  'review-approved',
  'review-changes-requested',
  'review-commented',
  'pr-comment',
  'inline-review-comment',
  'review-thread-resolved',
  'review-thread-unresolved',
  'issue-assigned',
  'ci-passed',
  'ci-failed',
]

/** A Git event ticked or unticked in the menu, the list kept in the window's order (`Kgn`); the last one can be unticked. */
export function toggledGitEvents(
  events: readonly string[],
  kind: string,
): string[] {
  return events.includes(kind)
    ? events.filter((event) => event !== kind)
    : gitOrder.filter((event) => events.includes(event) || event === kind)
}

/** The row's sentence in the editor, its first word apart. */
export function triggerWords(row: TriggerRow): RowWords {
  const more = '…'
  const slackPlace = (channel: string) => {
    const c = channel.trim()
    return c === '*' ? t('anywhere on Slack') : t`in ${c === '' ? more : c}`
  }
  const quoted = (words: string) => t`"${words}"`
  // Each sentence is whole in every language; the row shows its first word in the text's colour.
  switch (row.kind) {
    case 'schedule':
      return scheduleRow(row.text)
    case 'slack': {
      const place = slackPlace(row.channel)
      switch (row.match) {
        case 'keyword': {
          const word = row.keyword.trim()
          return splitWords(
            t`New messages containing ${word === '' ? more : quoted(word)} ${place}`,
          )
        }
        case 'mention':
          return splitWords(t`When @mentioned ${place}`)
        case 'reaction': {
          const names = emojiNames(row.emoji).map((name) => `:${name}:`)
          if (names.length === 0)
            return splitWords(
              row.bySelf
                ? t`Reaction added by me ${place}`
                : t`Reaction added ${place}`,
            )
          const list = orList(names)
          return splitWords(
            row.bySelf
              ? t`Reaction ${list} added by me ${place}`
              : t`Reaction ${list} added ${place}`,
          )
        }
        default:
          return splitWords(t`New messages ${place}`)
      }
    }
    case 'github': {
      const repo = row.repo.trim()
      const branch = row.ciBranch.trim()
      const words = gitWords()
      const phrases = row.events.map((event) =>
        isCI(event) && branch !== ''
          ? tk('git.onBranch', words[event] ?? event, branch)
          : (words[event] ?? event),
      )
      return splitWords(
        t`When ${phrases.length === 0 ? more : orList(phrases)} in ${repo === '' ? more : repo}`,
      )
    }
    case 'teams': {
      const teams = orList(triggerIds(row.teamIds))
      const channels = orList(triggerIds(row.channelIds))
      const contains = row.messageContains.trim()
      const inTeams = teams === '' ? more : teams
      let sentence =
        contains === ''
          ? t`New messages in ${inTeams}`
          : t`New messages containing ${quoted(contains)} in ${inTeams}`
      if (channels !== '') sentence += t` (in ${channels})`
      if (row.tenantId.trim() === '') sentence += t` (tenant ${more})`
      return splitWords(sentence)
    }
    case 'linear': {
      const teams = orList(triggerIds(row.teamIds))
      const forTeams = teams === '' ? '' : t` for ${teams}`
      const projects = orList(triggerIds(row.projectIds))
      const inProjects = projects === '' ? t('all projects') : projects
      switch (row.event) {
        case 'statusChanged': {
          const statuses = orList(triggerIds(row.statusIds))
          const status = statuses === '' ? t('any status') : statuses
          return splitWords(
            t`Issue status → ${status} in ${inProjects}` + forTeams,
          )
        }
        case 'endOfCycle':
          return splitWords(
            t`At end of cycle for ${teams === '' ? t('all teams') : teams}`,
          )
        default:
          return splitWords(t`Issue created in ${inProjects}` + forTeams)
      }
    }
    case 'sentry': {
      const projects = orList(triggerIds(row.projectIds))
      const inProjects = projects === '' ? t('all projects') : projects
      switch (row.event) {
        case 'issueCreated':
          return splitWords(t`Issue created in ${inProjects}`)
        case 'issueResolved':
          return splitWords(t`Issue resolved in ${inProjects}`)
        case 'issueAssigned':
          return splitWords(t`Issue assigned in ${inProjects}`)
        case 'issueArchived':
          return splitWords(t`Issue archived in ${inProjects}`)
        case 'issueUnresolved':
          return splitWords(t`Issue unresolved in ${inProjects}`)
        case 'issueAny':
          return splitWords(t`Issue any event in ${inProjects}`)
        default:
          return splitWords(t`Issue ${row.event} in ${inProjects}`)
      }
    }
    case 'pagerduty': {
      const services = orList(triggerIds(row.serviceIds))
      const onServices = services === '' ? t('all services') : services
      switch (row.event) {
        case 'incidentTriggered':
          return splitWords(t`Incident triggered on ${onServices}`)
        case 'incidentAcknowledged':
          return splitWords(t`Incident acknowledged on ${onServices}`)
        case 'incidentResolved':
          return splitWords(t`Incident resolved on ${onServices}`)
        case 'incidentEscalated':
          return splitWords(t`Incident escalated on ${onServices}`)
        case 'incidentAny':
          return splitWords(t`Incident any event on ${onServices}`)
        default:
          return splitWords(t`Incident ${row.event} on ${onServices}`)
      }
    }
  }
}

/** The source a row came from ("schedule", "slack"…). */
export function triggerPlatform(row: TriggerRow): string {
  switch (row.kind) {
    case 'schedule':
      return 'schedule'
    case 'teams':
      return 'microsoftTeams'
    default:
      return row.kind
  }
}

// MARK: The editor's choices and their words (`RoutineWords`), in the shipped window's order

/** Slack's event menu (`Ygn`), and what its button reads (`Zgn`). */
export const slackEvents = () => [
  { value: 'message', label: t('New message in channel') },
  { value: 'reaction', label: t('Reaction added to message') },
  { value: 'mention', label: t('Agent is mentioned') },
]

export const slackButton = (): Record<string, string> => ({
  message: t('New messages'),
  reaction: t('Reaction added'),
  mention: t('Agent is mentioned'),
})

export const reactors = () => [
  { value: false, label: t('Anyone') },
  { value: true, label: t('Only me') },
]

export const linearEvents = () => [
  { value: 'issueCreated', label: t('Issue created') },
  { value: 'statusChanged', label: t('Issue status changed') },
  { value: 'endOfCycle', label: t('End of cycle') },
]

export const sentryEvents = () => [
  { value: 'issueCreated', label: tk('issue.created') },
  { value: 'issueResolved', label: tk('issue.resolved') },
  { value: 'issueAssigned', label: tk('issue.assigned') },
  { value: 'issueArchived', label: tk('issue.archived') },
  { value: 'issueUnresolved', label: tk('issue.unresolved') },
  { value: 'issueAny', label: t('Any issue event') },
]

export const pagerdutyEvents = () => [
  { value: 'incidentTriggered', label: tk('incident.triggered') },
  { value: 'incidentAcknowledged', label: tk('incident.acknowledged') },
  { value: 'incidentResolved', label: tk('incident.resolved') },
  { value: 'incidentEscalated', label: tk('incident.escalated') },
  { value: 'incidentAny', label: t('Any incident event') },
]

export const teamsMatch = () => [
  { value: false, label: t('Text') },
  { value: true, label: t('Regex') },
]

export const teamsAudience = () => [
  { value: false, label: t('Anyone') },
  { value: true, label: t('Only linked users') },
]

/** The Advanced grid's Days (`_gn`) and Time mode (`Ogn`). */
export const dayKinds = () => [
  { value: 'every-day', label: t('Every day') },
  { value: 'days-of-week', label: t('Days of the week') },
  { value: 'days-of-month', label: t('Days of the month') },
]

export const timeKinds = () => [
  { value: 'at-times', label: t('At times') },
  { value: 'interval', label: tk('timeMode.every') },
]

/** Days of the week as the Every week picker lists them: Monday first, Sunday last (`wmt`). */
export const weekOrder = [1, 2, 3, 4, 5, 6, 0]
export const units = ['minutes', 'hours', 'days']
/** The Advanced grid's Every takes minutes or hours only (`Jgn`). */
export const windowUnits = ['minutes', 'hours']

/** A unit as the person reads it: `units` are the values saved. */
export function unitLabel(unit: string): string {
  switch (unit) {
    case 'minutes':
      return tk('unit.minutes')
    case 'hours':
      return tk('unit.hours')
    case 'days':
      return tk('unit.days')
    default:
      return unit
  }
}

/** "Any month", or the months picked, short and in order ("Jan, Mar") (`Ngn`). */
export function monthsLabel(picked: readonly number[] | null): string {
  if (!picked || picked.length === 0) return t('Any month')
  return ascending(new Set(picked))
    .map((month) =>
      month >= 1 && month <= 12 ? shortMonths()[month - 1]! : String(month),
    )
    .join(', ')
}

/** A month or a day ticked or unticked, the list kept in order (`Tmt`). */
export function toggledList(list: readonly number[], value: number): number[] {
  return list.includes(value)
    ? list.filter((one) => one !== value)
    : ascending([...list, value])
}

/** The next hour an Advanced "Add time" adds: the first free one after the first time, going round (`Fgn`). */
export function nextHour(
  after: number,
  taken: readonly number[],
): number | undefined {
  for (let offset = 1; offset <= 24; offset += 1) {
    const hour = (after + offset) % 24
    if (!taken.includes(hour)) return hour
  }
  return undefined
}

/** "Mon, Tue" (`Egn`). */
export function weekdaysLabel(list: readonly number[]): string {
  return ascending(new Set(list))
    .map((day) => (day >= 0 && day <= 6 ? shortWeekdays()[day]! : String(day)))
    .join(', ')
}

/** "1st, 15th" (`Cgn`). */
export function monthDaysLabel(list: readonly number[]): string {
  return ascending(new Set(list)).map(ordinal).join(', ')
}

/** The Git events button: the first chosen one's label and "+N", or "Pick events" (`a2n`). */
export function gitButton(events: readonly string[]): string {
  const first = events[0]
  if (first === undefined) return t('Pick events')
  const label =
    gitSections()
      .flatMap((section) => section.events)
      .find((event) => event.kind === first)?.label ?? first
  return events.length > 1 ? `${label} +${events.length - 1}` : label
}

/** The add menu's words: "Add trigger" with none yet, "Add another" after. */
export function addLabel(rows: number): string {
  return rows === 0 ? t('Add trigger') : t('Add another')
}

/** A run's status for its icon's label (`J2n`). */
export function runStatus(status: string): string {
  switch (status) {
    case 'running':
      return t('Running')
    case 'ok':
      return tk('run.succeeded')
    default:
      return tk('run.failed')
  }
}
