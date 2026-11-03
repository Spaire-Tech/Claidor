// The Windows app's updates (the Mac's `MacUpdates`, mac/Simeon/Updates.swift,
// with Sparkle's part played by electron-updater, engine.ts). What the page
// shows in Settings › Updates and beside Updates in Settings' list: a release
// found, a check under way, nothing newer, when it last looked, and the two
// switches. Kept free of Electron, so its rules are tested as they are.
//
// - A look (the page opening, Check Now) asks the feed and installs nothing,
//   as the Mac's `lookQuietly`.
// - The daily check, while Check for Updates Automatically is on, asks once a
//   day (Sparkle's schedule), and downloads what it finds while Download
//   Updates Automatically is on. A download counts only once the installer
//   is the company's (engine.ts); it is then kept as the release waiting.
// - A waiting release is installed as Simeon quits, silently; and, since
//   Windows' shutdown or sign-out ends Simeon with no quit, at the next
//   launch, before the window, silently with Simeon opened again.
// - Update Now downloads the release if it isn't yet, then asks the app to
//   quit as it always does (the page's own work first: a call hung up, the
//   chats kept); the installer runs only once all of that is done, and
//   opens Simeon again (on the Mac, Sparkle's own window does both).
// - Each time, the installer is checked again just before it runs.
// - A build that doesn't update itself has no engine: nothing is asked.

import type { DesktopEvents } from '../../../../clients/apps/app/src/desktop/contract'

export type UpdatesState = DesktopEvents['updatesChanged']

/** A release downloaded and found to be the company's, waiting to be installed. */
export interface Waiting {
  version: string
  /** Where electron-updater keeps it (its cache's `pending` folder). */
  file: string
  /** The installer's sha512 (base64), as the feed named it. */
  sha512: string
  /** An install at a launch was tried: if Simeon starts again on the old version, it is not tried again. */
  launchTried?: boolean
}

/** What the updater does for the model (electron-updater in the app, a stand-in in the tests). */
export interface UpdateEngine {
  /** Asks the feed: the newer release (its version and installer's sha512), or null when there is none. Rejects when the feed can't be read. */
  check(): Promise<{ version: string; sha512: string } | null>
  /** Downloads the release the last check found and checks it is the company's: where it is. Rejects otherwise. */
  download(): Promise<{ file: string; sha512: string }>
  /** Whether a waiting installer may run now (in the updater's own folder, the bytes the feed named, signed by the company), waiting for Windows' answer: null when it may, else why not. */
  vetNow(waiting: Waiting): string | null
  /** Starts the installer, silently; Simeon opened after it when `relaunch`. False when it couldn't start. */
  run(file: string, relaunch: boolean): boolean
}

/** What the app keeps between launches (`updates.json`; Sparkle's defaults on the Mac). */
export interface KeptUpdates {
  checksAutomatically: boolean
  downloadsAutomatically: boolean
  /** When a check last answered: the page's "Last checked". */
  lastChecked: number | null
  /** When the daily check last answered: the next is a day after (a look doesn't move it). */
  lastDaily: number | null
  waiting: Waiting | null
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
 * is downloaded and installed as Simeon quits or starts, as Windows apps do.
 */
export const firstKept: KeptUpdates = {
  checksAutomatically: true,
  downloadsAutomatically: true,
  lastChecked: null,
  lastDaily: null,
  waiting: null,
}

const versionShape = /^\d{1,9}\.\d{1,9}\.\d{1,9}(?:-[0-9A-Za-z.-]{1,40})?$/

function stamp(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

function readWaiting(value: unknown): Waiting | null {
  if (typeof value !== 'object' || value == null) return null
  const raw = value as Record<string, unknown>
  if (typeof raw.version !== 'string' || !versionShape.test(raw.version)) return null
  if (typeof raw.file !== 'string' || raw.file.length > 1_024) return null
  if (typeof raw.sha512 !== 'string' || !/^[A-Za-z0-9+/]{80,100}={0,2}$/.test(raw.sha512)) return null
  return {
    version: raw.version,
    file: raw.file,
    sha512: raw.sha512,
    ...(raw.launchTried === true ? { launchTried: true } : {}),
  }
}

/** The kept values read back: anything not of its kind is the first value. */
export function readKept(value: unknown): KeptUpdates {
  const raw = (typeof value === 'object' && value != null ? value : {}) as Record<string, unknown>
  const flag = (key: 'checksAutomatically' | 'downloadsAutomatically') =>
    typeof raw[key] === 'boolean' ? (raw[key] as boolean) : firstKept[key]
  return {
    checksAutomatically: flag('checksAutomatically'),
    downloadsAutomatically: flag('downloadsAutomatically'),
    lastChecked: stamp(raw.lastChecked),
    lastDaily: stamp(raw.lastDaily),
    waiting: readWaiting(raw.waiting),
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

/** Whether version `a` is newer than `b` (numbers, a pre-release before its release); false for anything that isn't a version. */
export function newer(a: string, b: string): boolean {
  const read = (value: string) => {
    if (!versionShape.test(value)) return undefined
    const [main, pre] = value.split('-', 2) as [string, string | undefined]
    return [...main.split('.').map(Number), pre === undefined ? 1 : 0] as number[]
  }
  const left = read(a)
  const right = read(b)
  if (!left || !right) return false
  for (let i = 0; i < left.length; i++)
    if ((left[i] ?? 0) !== (right[i] ?? 0)) return (left[i] ?? 0) > (right[i] ?? 0)
  return false
}

export class Updates {
  private kept: KeptUpdates
  private checking = false
  private found: string | null = null
  private installing = false
  private upToDate = false
  /** Update Now was pressed: the quit installs and opens Simeon again. */
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
      /** This app's version. */
      version: string
      kept: KeptUpdates
      keep(value: KeptUpdates): void
      send(state: UpdatesState): void
      /** Update Now: the app's own quit (the page's work first, then each part's), Simeon opened again after it (by the installer when it runs, `quitting`). */
      relaunch(): void
      /** A line for `updates.log`. */
      log(line: string): void
      now?: () => number
    },
  ) {
    this.kept = { ...options.kept }
  }

  private now(): number {
    return (this.options.now ?? Date.now)()
  }

  private get downloaded(): boolean {
    return this.found != null && this.kept.waiting?.version === this.found
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

  private keep(next: Partial<KeptUpdates>): void {
    this.kept = { ...this.kept, ...next }
    this.options.keep({ ...this.kept })
  }

  /**
   * At launch, before the window: a release that waits since a session that
   * ended with no quit (Windows shut down, the person signed out) is
   * installed now, silently, Simeon opened again after it. True when the
   * installer runs (the app then goes at once); a release already installed,
   * or not the company's, is forgotten.
   */
  installAtLaunch(): boolean {
    const engine = this.options.engine
    const waiting = this.kept.waiting
    if (!engine || !waiting) return false
    if (!newer(waiting.version, this.options.version)) {
      this.keep({ waiting: null })
      return false
    }
    if (waiting.launchTried) {
      this.options.log(`install of ${waiting.version} at launch did not finish: not tried again`)
      this.keep({ waiting: null })
      return false
    }
    const refused = engine.vetNow(waiting)
    if (refused) {
      this.options.log(`install of ${waiting.version} at launch refused: ${refused}`)
      this.keep({ waiting: null })
      return false
    }
    this.keep({ waiting: { ...waiting, launchTried: true } })
    if (!engine.run(waiting.file, true)) {
      this.options.log(`install of ${waiting.version} at launch could not start`)
      this.keep({ waiting: null })
      return false
    }
    this.options.log(`installing ${waiting.version} at launch, Simeon opened again after it`)
    return true
  }

  /** At launch: the daily check's schedule (Sparkle starts with the app, `MacUpdates.start`). */
  start(): void {
    this.stopped = false
    this.startedAt = this.now()
    this.schedule(firstLookMs)
  }

  /** As the app quits (before the installer may run). */
  stop(): void {
    this.stopped = true
    clearTimeout(this.timer)
  }

  /**
   * The app quits (the page and every part are done): the release waiting is
   * installed, silently; when the quit opens Simeon again (Update Now,
   * Relaunch), the installer does it, after the install. Checked again
   * first; not the company's, it isn't run. True when the installer opens
   * Simeon (the app then doesn't: two would race the install).
   */
  quitting(relaunching = false): boolean {
    const engine = this.options.engine
    const waiting = this.kept.waiting
    if (!engine || !waiting || !newer(waiting.version, this.options.version)) return false
    const refused = engine.vetNow(waiting)
    if (refused) {
      this.options.log(`install of ${waiting.version} as Simeon quits refused: ${refused}`)
      this.keep({ waiting: null })
      return false
    }
    if (engine.run(waiting.file, relaunching)) {
      this.options.log(`installing ${waiting.version} as Simeon quits${relaunching ? ', Simeon opened again after it' : ''}`)
      return relaunching
    }
    this.options.log(`install of ${waiting.version} as Simeon quits could not start`)
    return false
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
    this.keep(switches)
    this.options.log(
      `switches: checks ${this.kept.checksAutomatically ? 'on' : 'off'}, downloads ${this.kept.downloadsAutomatically ? 'on' : 'off'}`,
    )
    this.changed()
    // Checks turned on: the daily one may be due now.
    if (switches.checksAutomatically === true) this.schedule()
  }

  /** Update Now: downloaded if it isn't yet, then the app's own quit and relaunch, the installer run as it quits. */
  async install(): Promise<void> {
    const engine = this.options.engine
    if (!engine || this.found == null || this.installing) return
    this.installing = true
    this.changed()
    const ready = this.downloaded || (await this.download(engine))
    if (ready && !this.stopped) {
      this.options.log(`Update Now: quitting to install ${this.found}`)
      this.options.relaunch()
      return
    }
    // It couldn't: Update Now is there to press again.
    this.installing = false
    this.changed()
  }

  /** When the daily check is due: a day after it last answered; at first, a moment after launch; an hour after a failed one. */
  private dueAt(): number {
    const last = this.kept.lastDaily
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
    let release: { version: string; sha512: string } | null
    try {
      release = await engine.check()
    } catch (error) {
      // Nothing changes but the check ending (`didFinishUpdateCycle` with an error).
      this.options.log(`${daily ? 'daily check' : 'look'} failed: ${error instanceof Error ? error.message : String(error)}`)
      this.checking = false
      this.changed()
      return false
    }
    this.failedAt = undefined
    const now = this.now()
    // A release waiting that the feed no longer names (pulled, or a newer one out) is not installed.
    const stale = this.kept.waiting != null && this.kept.waiting.version !== release?.version
    this.keep({
      lastChecked: now,
      ...(daily ? { lastDaily: now } : {}),
      ...(stale ? { waiting: null } : {}),
    })
    if (release != null) {
      this.found = release.version
      this.upToDate = false
    } else {
      this.found = null
      this.upToDate = true
    }
    this.options.log(
      `${daily ? 'daily check' : 'look'}: ${release ? `found ${release.version}` : `nothing newer than ${this.options.version}`}`,
    )
    this.checking = false
    this.changed()
    if (
      daily &&
      release != null &&
      !this.downloaded &&
      this.kept.checksAutomatically &&
      this.kept.downloadsAutomatically
    )
      await this.download(engine)
    return true
  }

  /** One download at a time; true once the release found is on disk and the company's (then kept as waiting). */
  private download(engine: UpdateEngine): Promise<boolean> {
    if (this.downloaded) return Promise.resolve(true)
    if (!this.downloading) {
      const version = this.found
      this.downloading = engine
        .download()
        .then(({ file, sha512 }) => {
          // A newer release found meanwhile is another download.
          if (version == null || this.found !== version) return false
          this.keep({ waiting: { version, file, sha512 } })
          this.options.log(`downloaded ${version}, the company's: it waits to be installed`)
          this.changed()
          return true
        })
        .catch((error: unknown) => {
          this.options.log(`download of ${version} refused or failed: ${error instanceof Error ? error.message : String(error)}`)
          return false
        })
        .finally(() => {
          this.downloading = undefined
        })
    }
    return this.downloading
  }
}
