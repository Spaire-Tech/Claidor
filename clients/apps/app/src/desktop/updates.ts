// What the Windows app's updater knows, in the page (the Mac's `MacUpdates`,
// mac/Simeon/Updates.swift, read by Settings › Updates and the dot beside
// Updates in Settings' list): read from the app's main process
// (windows/src/main/parts/updates.ts) as the page first asks, then followed
// as it changes. The updater itself, its feed and its switches live in the
// main process; nothing here is the account's, so signing out keeps it.

import { t } from '../l10n'
import type { Desktop, DesktopEvents } from './desktop'
import { desktop } from './desktop'

export type UpdatesState = DesktopEvents['updatesChanged']

export class DesktopUpdates {
  /** Undefined until the app answers. */
  state: UpdatesState | undefined
  private readonly listeners = new Set<() => void>()
  private version = 0
  private heard = false

  constructor(private readonly host: Desktop) {
    host.on('updatesChanged', (state) => {
      this.heard = true
      this.take(state)
    })
    host
      .call('readUpdates')
      .then((state) => {
        // A change heard while the answer was on its way is newer.
        if (!this.heard) this.take(state)
      })
      .catch(() => {})
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getVersion = (): number => this.version

  private take(state: UpdatesState): void {
    this.state = state
    this.version += 1
    for (const listener of [...this.listeners]) listener()
  }

  /** A release found and not installed yet: the dot beside Updates. */
  get found(): string | null {
    return this.state?.found ?? null
  }

  /** Asks the feed with no window (`lookQuietly`): as the page opens, Check Now. Nothing while one is under way. */
  look(): void {
    const state = this.state
    if (state && (!state.available || state.checking || state.installing))
      return
    void this.host.call('lookForUpdates').catch(() => {})
  }

  /** Update Now. */
  install(): void {
    void this.host.call('installUpdate').catch(() => {})
  }

  /** Check for Updates Automatically: shown at once, kept by the app. */
  setChecksAutomatically(on: boolean): void {
    this.setSwitch('checksAutomatically', on)
  }

  /** Download Updates Automatically: shown at once, kept by the app. */
  setDownloadsAutomatically(on: boolean): void {
    this.setSwitch('downloadsAutomatically', on)
  }

  private setSwitch(
    key: 'checksAutomatically' | 'downloadsAutomatically',
    on: boolean,
  ): void {
    if (this.state) this.take({ ...this.state, [key]: on })
    void this.host.call('setUpdateSwitches', { [key]: on }).catch(() => {})
  }
}

let made: { host: Desktop; updates: DesktopUpdates } | undefined

/** The page's one view of the updater, in the Windows app; undefined on the web (a page is always the latest). */
export function desktopUpdates(): DesktopUpdates | undefined {
  const host = desktop()
  if (!host) return undefined
  if (made?.host !== host) made = { host, updates: new DesktopUpdates(host) }
  return made.updates
}

/** Forgets it (the tests give a new app each time). */
export function resetDesktopUpdatesForTests(): void {
  made = undefined
}

const second = 1_000
const minute = 60 * second
const hour = 60 * minute
const day = 24 * hour
const week = 7 * day

/** Whole calendar months from `from` to `to` (`to` the later). */
function monthsBetween(from: Date, to: Date): number {
  let months =
    (to.getFullYear() - from.getFullYear()) * 12 +
    (to.getMonth() - from.getMonth())
  const fromRest =
    ((from.getDate() * 24 + from.getHours()) * 60 + from.getMinutes()) * 60 +
    from.getSeconds()
  const toRest =
    ((to.getDate() * 24 + to.getHours()) * 60 + to.getMinutes()) * 60 +
    to.getSeconds()
  if (toRest < fromRest) months -= 1
  return Math.max(months, 0)
}

/**
 * When something was, as Foundation's `RelativeDateTimeFormatter` says it
 * (full units, in numbers): the largest whole unit, from years down to
 * seconds; "2 minutes ago", "il y a 2 minutes". A moment ago is "0 seconds
 * ago" (Foundation says "in 0 seconds" for a date just past).
 */
export function relativeWords(
  date: number,
  now: number,
  locale: string,
): string {
  const past = date <= now
  const [earlier, later] = past ? [date, now] : [now, date]
  const elapsed = later - earlier
  const months = monthsBetween(new Date(earlier), new Date(later))
  let value: number
  let unit: Intl.RelativeTimeFormatUnit
  if (months >= 12) [value, unit] = [Math.floor(months / 12), 'year']
  else if (months >= 1) [value, unit] = [months, 'month']
  else if (elapsed >= week) [value, unit] = [Math.floor(elapsed / week), 'week']
  else if (elapsed >= day) [value, unit] = [Math.floor(elapsed / day), 'day']
  else if (elapsed >= hour) [value, unit] = [Math.floor(elapsed / hour), 'hour']
  else if (elapsed >= minute)
    [value, unit] = [Math.floor(elapsed / minute), 'minute']
  else [value, unit] = [Math.floor(elapsed / second), 'second']
  return new Intl.RelativeTimeFormat(locale, {
    numeric: 'always',
    style: 'long',
  }).format(past ? -value : value, unit)
}

/** Under the version (`checkedLine`): "Simeon is up to date." once a check found nothing, and when it last looked; nothing when neither is known. */
export function checkedLine(
  state: UpdatesState | undefined,
  now: number,
  locale: string,
): string | undefined {
  if (!state) return undefined
  const parts: string[] = []
  if (state.upToDate) parts.push(t('Simeon is up to date.'))
  if (state.lastChecked != null) {
    const words = relativeWords(state.lastChecked, now, locale)
    parts.push(t`Last checked ${words}.`)
  }
  return parts.length === 0 ? undefined : parts.join(' ')
}
