// The Windows app's updates (the Mac's `MacUpdates`, mac/Simeon/Updates.swift,
// with Sparkle's part played by electron-updater, engine.ts). What the page
// shows in Settings › Updates and beside Updates in Settings' list: a release
// found, a check under way, nothing newer, when it last looked, and the two
// switches. Kept free of Electron, so its rules are tested as they are.
//
// - A look (the page opening, Check Now) asks the feed and installs nothing,
//   as the Mac's `lookQuietly`.
// - The daily check, while Check for Updates Automatically is on, asks once a
//   day counted from the last answer (Sparkle's schedule), and downloads what
//   it finds while Download Updates Automatically is on; a downloaded release
//   installs as the app quits (electron-updater's own rule).
// - Update Now downloads the release if it isn't yet, then installs it and
//   opens Simeon again (on the Mac, Sparkle's own window does both).
// - A build that doesn't update itself has no engine: nothing is asked.

import type { DesktopEvents } from '../../../../clients/apps/app/src/desktop/contract'

export type UpdatesState = DesktopEvents['updatesChanged']

/** What the updater does for the model (electron-updater in the app, a stand-in in the tests). */
export interface UpdateEngine {
  /** Asks the feed: the newer version, or null when there is none. Rejects when the feed can't be read. */
  check(): Promise<string | null>
  /** Downloads the release the last check found. */
  download(): Promise<void>
  /** Installs the downloaded release and opens Simeon again; false when it couldn't start. */
  installNow(): boolean
}

/** What the app keeps between launches (`updates.json`, Sparkle's defaults on the Mac). */
export interface KeptUpdates {
  checksAutomatically: boolean
  downloadsAutomatically: boolean
  lastChecked: number | null
}

export const day = 86_400_000
const hour = 3_600_000
const minute = 60_000
/** The first daily check waits this long after launch, so the window comes first. */
export const firstLookMs = 10_000

/**
 * The switches as a person finds them at first: both on. The Mac starts with
 * Sparkle's (checks on, downloads off) because Sparkle shows a window of its
 * own when the daily check finds a release; Windows has none, so the release
 * is downloaded and installed as Simeon quits, as Windows apps do.
 */
export const firstKept: KeptUpdates = {
  checksAutomatically: true,
  downloadsAutomatically: true,
  lastChecked: null,
}

/** The kept values read back: anything not of its kind is the first value. */
export function readKept(value: unknown): KeptUpdates {
  const raw = (typeof value === 'object' && value != null ? value : {}) as Record<string, unknown>
  const flag = (key: 'checksAutomatically' | 'downloadsAutomatically') =>
    typeof raw[key] === 'boolean' ? (raw[key] as boolean) : firstKept[key]
  const last = raw.lastChecked
  return {
    checksAutomatically: flag('checksAutomatically'),
    downloadsAutomatically: flag('downloadsAutomatically'),
    lastChecked: typeof last === 'number' && Number.isFinite(last) && last > 0 ? last : null,
  }
}

/** The switches the page sends (`setUpdateSwitches`), checked: an object of at most the two booleans; anything else is refused. */
export function readSwitches(value: unknown): Partial<Pick<KeptUpdates, 'checksAutomatically' | 'downloadsAutomatically'>> {
  if (typeof value !== 'object' || value == null || Array.isArray(value))
    throw new Error('The switches are an object.')
  const raw = value as Record<string, unknown>
  const switches: Partial<Pick<KeptUpdates, 'checksAutomatically' | 'downloadsAutomatically'>> = {}
  for (const key of Object.keys(raw)) {
    if (key !== 'checksAutomatically' && key !== 'downloadsAutomatically')
      throw new Error('Only the two switches are kept.')
    if (typeof raw[key] !== 'boolean') throw new Error('A switch is on or off.')
    switches[key] = raw[key] as boolean
  }
  return switches
}

export class Updates {
  private kept: KeptUpdates
  private checking = false
  private found: string | null = null
  private downloaded = false
  private installing = false
  private upToDate = false
  private downloading?: Promise<boolean>
  private timer?: ReturnType<typeof setTimeout>
  private startedAt = 0
  /** When the last daily check failed (offline): the next waits an hour. */
  private failedAt?: number
  private stopped = false

  constructor(
    private readonly options: {
      /** Undefined in a build that doesn't update itself. */
      engine: UpdateEngine | undefined
      kept: KeptUpdates
      keep(value: KeptUpdates): void
      send(state: UpdatesState): void
      now?: () => number
    },
  ) {
    this.kept = { ...options.kept }
  }

  private now(): number {
    return (this.options.now ?? Date.now)()
  }

  get current(): UpdatesState {
    const available = this.options.engine !== undefined
    return {
      available,
      checking: this.checking,
      found: this.found,
      downloaded: this.downloaded,
      installing: this.installing,
      upToDate: this.upToDate,
      // A build that doesn't update itself never looked (the Mac's has no Sparkle to say when).
      lastChecked: available ? this.kept.lastChecked : null,
      checksAutomatically: this.kept.checksAutomatically,
      downloadsAutomatically: this.kept.downloadsAutomatically,
    }
  }

  private changed(): void {
    this.options.send(this.current)
  }

  /** At launch: the daily check's schedule (Sparkle starts with the app, `MacUpdates.start`). */
  start(): void {
    this.stopped = false
    this.startedAt = this.now()
    this.schedule(firstLookMs)
  }

  /** As the app quits. */
  stop(): void {
    this.stopped = true
    clearTimeout(this.timer)
  }

  /** The page opening, Check Now (`lookQuietly`): asks the feed, downloads nothing. */
  look(): void {
    void this.check(false)
  }

  /** The two switches (`automaticallyChecks`, `automaticallyDownloads`), kept at once. */
  setSwitches(switches: Partial<Pick<KeptUpdates, 'checksAutomatically' | 'downloadsAutomatically'>>): void {
    const next = { ...this.kept, ...switches }
    if (
      next.checksAutomatically === this.kept.checksAutomatically &&
      next.downloadsAutomatically === this.kept.downloadsAutomatically
    )
      return
    this.kept = next
    this.options.keep({ ...this.kept })
    this.changed()
    // Checks turned on: the daily one may be due now.
    if (switches.checksAutomatically === true) this.schedule()
  }

  /** Update Now: downloaded if it isn't yet, then installed, Simeon opened again. */
  async install(): Promise<void> {
    const engine = this.options.engine
    if (!engine || this.found == null || this.installing) return
    this.installing = true
    this.changed()
    const ready = this.downloaded || (await this.download(engine))
    if (ready && !this.stopped && engine.installNow()) return
    // It couldn't: Update Now is there to press again.
    this.installing = false
    this.changed()
  }

  /** When the daily check is due: a day after the last answer; at first, a moment after launch; an hour after a failed one. */
  private dueAt(): number {
    const last = this.kept.lastChecked
    let due = last == null ? this.startedAt + firstLookMs : last + day
    // A clock set back past the last check: due now.
    if (last != null && last > this.now()) due = this.now()
    if (this.failedAt != null) due = Math.max(due, this.failedAt + hour)
    return due
  }

  /** The next look at the daily check: when it is due, and at least every hour (a sleeping PC's timers drift). */
  private schedule(wait?: number): void {
    clearTimeout(this.timer)
    if (!this.options.engine || this.stopped) return
    const until = wait ?? Math.min(Math.max(this.dueAt() - this.now(), 0), hour)
    this.timer = setTimeout(() => void this.daily(), until)
  }

  private async daily(): Promise<void> {
    if (this.stopped) return
    if (!this.kept.checksAutomatically) return this.schedule(hour)
    if (this.now() < this.dueAt()) return this.schedule()
    // A look or an install under way: again in a minute.
    if (this.checking || this.installing) return this.schedule(minute)
    const answered = await this.check(true)
    if (!answered) this.failedAt = this.now()
    this.schedule()
  }

  /** Asks the feed; the daily check downloads what it finds while downloads are on. True when the feed answered. */
  private async check(daily: boolean): Promise<boolean> {
    const engine = this.options.engine
    if (!engine || this.checking || this.installing || this.stopped) return false
    this.checking = true
    this.changed()
    let version: string | null
    try {
      version = await engine.check()
    } catch {
      // Nothing changes but the check ending (`didFinishUpdateCycle` with an error).
      this.checking = false
      this.changed()
      return false
    }
    this.failedAt = undefined
    this.kept = { ...this.kept, lastChecked: this.now() }
    this.options.keep({ ...this.kept })
    if (version != null) {
      if (version !== this.found) this.downloaded = false
      this.found = version
      this.upToDate = false
    } else {
      this.found = null
      this.downloaded = false
      this.upToDate = true
    }
    this.checking = false
    this.changed()
    if (
      daily &&
      version != null &&
      !this.downloaded &&
      this.kept.checksAutomatically &&
      this.kept.downloadsAutomatically
    )
      await this.download(engine)
    return true
  }

  /** One download at a time; true once the release found is on disk. */
  private download(engine: UpdateEngine): Promise<boolean> {
    if (this.downloaded) return Promise.resolve(true)
    if (!this.downloading) {
      const version = this.found
      this.downloading = engine
        .download()
        .then(() => {
          // A newer release found meanwhile is another download.
          if (this.found !== version) return false
          this.downloaded = true
          this.changed()
          return true
        })
        .catch(() => false)
        .finally(() => {
          this.downloading = undefined
        })
    }
    return this.downloading
  }
}
