// The updates' rules (src/main/updates), written from the Mac's `MacUpdates`
// (mac/Simeon/Updates.swift) and Settings › Updates (SettingsPages.swift
// 236-289), and the review's: a stand-in engine in electron-updater's place,
// a fake clock.

import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  feedForChecks,
  feedSettings,
  readKeptFile,
  releasedBuild,
  signersOf,
  writeKeptFile,
} from '../src/main/updates/feed'
import { inPending, sha512Of } from '../src/main/updates/files'
import { UpdatesLog, scrubbed } from '../src/main/updates/log'
import {
  type KeptUpdates,
  type UpdateEngine,
  Updates,
  type UpdatesState,
  type Waiting,
  day,
  firstKept,
  firstLookMs,
  newer,
  readKept,
  readSwitches,
} from '../src/main/updates/updates'

const hour = 3_600_000
const sha = `${'A'.repeat(86)}==`
const signer = 'CN="Example Signer, Inc.", O="Example Signer, Inc.", L=Wilmington, S=Delaware, C=US'

/** A stand-in for electron-updater and Windows' signature check: each check answers what `latest` says; every call recorded. */
class FakeEngine implements UpdateEngine {
  latest: string | null = null
  fails = false
  downloadFails = false
  /** What the check before an installer runs says (null: it may run). */
  refuse: string | null = null
  runStarts = true
  checks = 0
  downloads = 0
  vets: Waiting[] = []
  runs: { file: string; relaunch: boolean }[] = []
  /** A check held until `answer()`, to see what happens meanwhile. */
  holding = false
  private waiting: (() => void)[] = []

  async check(): Promise<{ version: string; sha512: string } | null> {
    this.checks += 1
    if (this.holding) await new Promise<void>((done) => this.waiting.push(done))
    if (this.fails) throw new Error('offline')
    return this.latest ? { version: this.latest, sha512: sha } : null
  }

  answer(): void {
    this.holding = false
    for (const done of this.waiting.splice(0)) done()
  }

  async download(): Promise<{ file: string; sha512: string }> {
    this.downloads += 1
    if (this.downloadFails) throw new Error('not signed by the company')
    return { file: `/cache/pending/Simeon-Setup-${this.latest}.exe`, sha512: sha }
  }

  vetNow(waiting: Waiting): string | null {
    this.vets.push(waiting)
    return this.refuse
  }

  run(file: string, relaunch: boolean): boolean {
    this.runs.push({ file, relaunch })
    return this.runStarts
  }
}

function made(options: { engine?: FakeEngine | null; kept?: Partial<KeptUpdates>; version?: string } = {}) {
  const engine = options.engine === null ? undefined : (options.engine ?? new FakeEngine())
  const sent: UpdatesState[] = []
  const keeps: KeptUpdates[] = []
  const lines: string[] = []
  const app = { relaunches: 0 }
  const updates = new Updates({
    engine,
    version: options.version ?? '0.1.0',
    kept: { ...firstKept, ...options.kept },
    keep: (value) => keeps.push(value),
    send: (state) => sent.push(state),
    relaunch: () => {
      app.relaunches += 1
    },
    log: (line) => lines.push(line),
  })
  return { updates, engine: engine as FakeEngine, sent, keeps, lines, app }
}

const waiting020: Waiting = { version: '0.2.0', file: '/cache/pending/Simeon-Setup-0.2.0.exe', sha512: sha }

/** Lets the promises the model awaits settle (no time passes). */
const settle = () => vi.advanceTimersByTimeAsync(0)

describe('the updates', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-02T12:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('in a build that doesn’t update itself, asks nothing, installs nothing, and says so', async () => {
    const { updates, sent, app } = made({ engine: null, kept: { lastChecked: 5, waiting: waiting020 } })
    // A check from an installed release before is not this build's.
    expect(updates.current.lastChecked).toBeNull()
    expect(updates.installAtLaunch()).toBe(false)
    updates.start()
    updates.look()
    await updates.install()
    expect(updates.quitting(true)).toBe(false)
    await vi.advanceTimersByTimeAsync(3 * day)
    expect(sent).toEqual([])
    expect(app).toEqual({ relaunches: 0 })
    expect(updates.current).toMatchObject({ available: false, checking: false, found: null })
  })

  it('a look finds a release and downloads nothing (lookQuietly)', async () => {
    const { updates, engine, sent, keeps, lines } = made()
    engine.latest = '0.2.0'
    updates.look()
    expect(updates.current.checking).toBe(true)
    await settle()
    expect(updates.current).toMatchObject({
      checking: false,
      found: '0.2.0',
      upToDate: false,
      downloaded: false,
      lastChecked: Date.now(),
    })
    expect(engine.downloads).toBe(0)
    expect(keeps.at(-1)?.lastChecked).toBe(Date.now())
    // A look isn't the daily check: the next daily one isn't moved by it.
    expect(keeps.at(-1)?.lastDaily).toBeNull()
    expect(sent.map((s) => [s.checking, s.found])).toEqual([
      [true, null],
      [false, '0.2.0'],
    ])
    expect(lines).toContain('look: found 0.2.0')
  })

  it('nothing newer: up to date, and when it looked', async () => {
    const { updates, lines } = made()
    updates.look()
    await settle()
    expect(updates.current).toMatchObject({ found: null, upToDate: true, lastChecked: Date.now() })
    expect(lines).toContain('look: nothing newer than 0.1.0')
  })

  it('a feed that can’t be read only ends the check, and says why in the log', async () => {
    const { updates, engine, keeps, lines } = made({ kept: { lastChecked: 5 } })
    engine.fails = true
    updates.look()
    await settle()
    expect(updates.current).toMatchObject({ checking: false, found: null, upToDate: false, lastChecked: 5 })
    expect(keeps).toEqual([])
    expect(lines).toContain('look failed: offline')
  })

  it('looks once at a time', async () => {
    const { updates, engine } = made()
    engine.holding = true
    updates.look()
    updates.look()
    engine.answer()
    await settle()
    expect(engine.checks).toBe(1)
  })

  it('the daily check comes a moment after launch the first time, and keeps what it downloads as waiting', async () => {
    const { updates, engine, keeps } = made()
    engine.latest = '0.2.0'
    updates.start()
    await vi.advanceTimersByTimeAsync(firstLookMs - 1)
    expect(engine.checks).toBe(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(engine.checks).toBe(1)
    expect(engine.downloads).toBe(1)
    expect(updates.current).toMatchObject({ found: '0.2.0', downloaded: true })
    expect(keeps.at(-1)?.waiting).toEqual(waiting020)
    expect(keeps.at(-1)?.lastDaily).toBe(Date.now())
    // Nothing is run before the app quits.
    expect(engine.runs).toEqual([])
  })

  it('then once a day, counted from the last daily answer; a look in between doesn’t move it', async () => {
    const { updates, engine } = made({ kept: { lastDaily: Date.now() - 2 * hour } })
    updates.start()
    await vi.advanceTimersByTimeAsync(22 * hour - 1_000)
    expect(engine.checks).toBe(0)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(engine.checks).toBe(1)
    await vi.advanceTimersByTimeAsync(12 * hour)
    updates.look()
    await settle()
    expect(engine.checks).toBe(2)
    await vi.advanceTimersByTimeAsync(12 * hour - 1_000)
    expect(engine.checks).toBe(2)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(engine.checks).toBe(3)
  })

  it('downloads nothing while Download Updates Automatically is off', async () => {
    const { updates, engine } = made({ kept: { downloadsAutomatically: false } })
    engine.latest = '0.2.0'
    updates.start()
    await vi.advanceTimersByTimeAsync(firstLookMs)
    expect(engine.checks).toBe(1)
    expect(engine.downloads).toBe(0)
    expect(updates.current.found).toBe('0.2.0')
  })

  it('asks nothing by itself while Check for Updates Automatically is off; turned on, it looks when due', async () => {
    const { updates, engine } = made({ kept: { checksAutomatically: false } })
    updates.start()
    await vi.advanceTimersByTimeAsync(3 * day)
    expect(engine.checks).toBe(0)
    updates.setSwitches({ checksAutomatically: true })
    await settle()
    expect(engine.checks).toBe(1)
  })

  it('a failed daily check is tried again an hour later, not at once', async () => {
    const { updates, engine } = made()
    engine.fails = true
    updates.start()
    await vi.advanceTimersByTimeAsync(firstLookMs)
    expect(engine.checks).toBe(1)
    await vi.advanceTimersByTimeAsync(hour - 1_000)
    expect(engine.checks).toBe(1)
    engine.fails = false
    await vi.advanceTimersByTimeAsync(1_000)
    expect(engine.checks).toBe(2)
  })

  it('a download that isn’t the company’s is never kept', async () => {
    const { updates, engine, keeps, lines } = made()
    engine.latest = '0.2.0'
    engine.downloadFails = true
    updates.start()
    await vi.advanceTimersByTimeAsync(firstLookMs)
    expect(updates.current.downloaded).toBe(false)
    expect(keeps.every((k) => k.waiting == null)).toBe(true)
    expect(lines.some((l) => l.includes('refused or failed: not signed by the company'))).toBe(true)
  })

  it('Update Now downloads, then asks the app to quit and open again; the installer runs only as it quits, and opens Simeon itself', async () => {
    const { updates, engine, app } = made()
    engine.latest = '0.2.0'
    updates.look()
    await settle()
    await updates.install()
    expect(engine.downloads).toBe(1)
    expect(app.relaunches).toBe(1)
    expect(engine.runs).toEqual([])
    expect(updates.current).toMatchObject({ installing: true, downloaded: true })
    // The page and every part are done: the app's `quit`, which opens Simeon again. The installer takes that over.
    expect(updates.quitting(true)).toBe(true)
    expect(engine.vets).toEqual([waiting020])
    expect(engine.runs).toEqual([{ file: waiting020.file, relaunch: true }])
  })

  it('Relaunch (a new language) with a release waiting: the installer opens Simeon, after the install, never the old one beside it', () => {
    const { updates, engine, app } = made({ kept: { waiting: waiting020 } })
    expect(updates.quitting(true)).toBe(true)
    expect(engine.runs).toEqual([{ file: waiting020.file, relaunch: true }])
    expect(app.relaunches).toBe(0)
  })

  it('Update Now with the release waiting quits at once', async () => {
    const { updates, engine, app } = made()
    engine.latest = '0.2.0'
    updates.start()
    await vi.advanceTimersByTimeAsync(firstLookMs)
    expect(engine.downloads).toBe(1)
    await updates.install()
    expect(engine.downloads).toBe(1)
    expect(app.relaunches).toBe(1)
  })

  it('Update Now that can’t download is there to press again, and quits nothing', async () => {
    const { updates, engine, app } = made()
    engine.latest = '0.2.0'
    updates.look()
    await settle()
    engine.downloadFails = true
    await updates.install()
    expect(app.relaunches).toBe(0)
    expect(updates.current.installing).toBe(false)
  })

  it('quitting with a release waiting installs it silently, Simeon not opened again', async () => {
    const { updates, engine } = made({ kept: { waiting: waiting020 } })
    expect(updates.quitting()).toBe(false)
    expect(engine.runs).toEqual([{ file: waiting020.file, relaunch: false }])
  })

  it('quitting with nothing waiting, or a release already installed, runs nothing', () => {
    const nothing = made()
    nothing.updates.quitting()
    expect(nothing.engine.runs).toEqual([])
    const installed = made({ kept: { waiting: waiting020 }, version: '0.2.0' })
    installed.updates.quitting()
    expect(installed.engine.runs).toEqual([])
  })

  it('an installer that fails its check as Simeon quits isn’t run, is forgotten, and after Update Now the app opens Simeon again itself', async () => {
    const { updates, engine, keeps, lines } = made()
    engine.latest = '0.2.0'
    updates.look()
    await settle()
    await updates.install()
    engine.refuse = 'the installer is signed by someone else'
    expect(updates.quitting(true)).toBe(false)
    expect(engine.runs).toEqual([])
    expect(keeps.at(-1)?.waiting).toBeNull()
    expect(lines.at(-1)).toBe('install of 0.2.0 as Simeon quits refused: the installer is signed by someone else')
  })

  it('an installer that can’t start after Update Now: the app opens Simeon again itself', async () => {
    const { updates, engine } = made()
    engine.latest = '0.2.0'
    updates.look()
    await settle()
    await updates.install()
    engine.runStarts = false
    expect(updates.quitting(true)).toBe(false)
  })

  it('at launch, before the window: a release left waiting (Windows shut down) is installed, Simeon opened again', () => {
    const { updates, engine, keeps } = made({ kept: { waiting: waiting020 } })
    expect(updates.installAtLaunch()).toBe(true)
    expect(engine.vets).toEqual([waiting020])
    expect(engine.runs).toEqual([{ file: waiting020.file, relaunch: true }])
    // Tried once: if Simeon starts again on the old version, it isn't tried again.
    expect(keeps.at(-1)?.waiting).toEqual({ ...waiting020, launchTried: true })
  })

  it('at launch: a release already installed is forgotten; one tried before isn’t tried again; one refused isn’t run', () => {
    const installed = made({ kept: { waiting: waiting020 }, version: '0.2.0' })
    expect(installed.updates.installAtLaunch()).toBe(false)
    expect(installed.keeps.at(-1)?.waiting).toBeNull()
    const tried = made({ kept: { waiting: { ...waiting020, launchTried: true } } })
    expect(tried.updates.installAtLaunch()).toBe(false)
    expect(tried.engine.runs).toEqual([])
    expect(tried.keeps.at(-1)?.waiting).toBeNull()
    const refused = made({ kept: { waiting: waiting020 } })
    refused.engine.refuse = 'the installer is not the one the feed named'
    expect(refused.updates.installAtLaunch()).toBe(false)
    expect(refused.engine.runs).toEqual([])
    expect(refused.keeps.at(-1)?.waiting).toBeNull()
    expect(refused.lines).toContain('install of 0.2.0 at launch refused: the installer is not the one the feed named')
  })

  it('a release pulled from the feed after its download is not installed', async () => {
    const { updates, engine } = made()
    engine.latest = '0.2.0'
    updates.start()
    await vi.advanceTimersByTimeAsync(firstLookMs)
    expect(updates.current.downloaded).toBe(true)
    engine.latest = null
    updates.look()
    await settle()
    expect(updates.current).toMatchObject({ found: null, downloaded: false, upToDate: true })
    updates.quitting()
    expect(engine.runs).toEqual([])
  })

  it('a newer release than the one downloaded is downloaded again before it waits', async () => {
    const { updates, engine } = made()
    engine.latest = '0.2.0'
    updates.start()
    await vi.advanceTimersByTimeAsync(firstLookMs)
    engine.latest = '0.3.0'
    updates.look()
    await settle()
    expect(updates.current).toMatchObject({ found: '0.3.0', downloaded: false })
    updates.quitting()
    expect(engine.runs).toEqual([])
    await vi.advanceTimersByTimeAsync(day)
    expect(updates.current).toMatchObject({ found: '0.3.0', downloaded: true })
  })

  it('Update Now while a look is under way; the look ends as it would', async () => {
    const { updates, engine, app } = made()
    engine.latest = '0.2.0'
    updates.look()
    await settle()
    engine.holding = true
    updates.look()
    expect(updates.current.checking).toBe(true)
    await updates.install()
    expect(app.relaunches).toBe(1)
    engine.answer()
    await settle()
    expect(updates.current).toMatchObject({ checking: false, installing: true, found: '0.2.0', downloaded: true })
  })

  it('Update Now with nothing found does nothing; a look is refused while it installs', async () => {
    const { updates, engine, app } = made()
    await updates.install()
    expect(engine.downloads + app.relaunches).toBe(0)
    engine.latest = '0.2.0'
    updates.look()
    await settle()
    await updates.install()
    updates.look()
    await settle()
    expect(engine.checks).toBe(1)
  })

  it('keeps the switches at once, says so in the log, and nothing when nothing changed', () => {
    const { updates, sent, keeps, lines } = made()
    updates.setSwitches({ downloadsAutomatically: false })
    expect(keeps.at(-1)).toEqual({ ...firstKept, downloadsAutomatically: false })
    expect(sent.at(-1)?.downloadsAutomatically).toBe(false)
    expect(lines).toEqual(['switches: checks on, downloads off'])
    updates.setSwitches({ downloadsAutomatically: false, checksAutomatically: true })
    expect(keeps).toHaveLength(1)
  })

  it('stops with the app', async () => {
    const { updates, engine } = made()
    updates.start()
    updates.stop()
    await vi.advanceTimersByTimeAsync(2 * day)
    expect(engine.checks).toBe(0)
  })
})

describe('versions', () => {
  it('compares as numbers, a pre-release before its release; anything else is never newer', () => {
    expect(newer('0.2.0', '0.1.9')).toBe(true)
    expect(newer('0.1.10', '0.1.9')).toBe(true)
    expect(newer('0.2.0', '0.2.0-beta.1')).toBe(true)
    expect(newer('0.2.0-beta.1', '0.2.0')).toBe(false)
    expect(newer('0.2.0', '0.2.0')).toBe(false)
    expect(newer('0.1.0', '0.2.0')).toBe(false)
    expect(newer('0.2.0/..', '0.1.0')).toBe(false)
  })
})

describe('what is kept and what the page sends', () => {
  it('reads the kept values, the first ones for anything else', () => {
    expect(readKept(undefined)).toEqual(firstKept)
    expect(
      readKept({ checksAutomatically: false, downloadsAutomatically: 'yes', lastChecked: 12, lastDaily: 9, waiting: waiting020 }),
    ).toEqual({ checksAutomatically: false, downloadsAutomatically: true, lastChecked: 12, lastDaily: 9, waiting: waiting020 })
    expect(readKept({ lastChecked: -1 }).lastChecked).toBeNull()
    expect(readKept({ lastDaily: Number.NaN }).lastDaily).toBeNull()
    for (const bad of [
      { ...waiting020, version: '0.2.0/../..' },
      { ...waiting020, sha512: 'short' },
      { ...waiting020, file: 'x'.repeat(2_000) },
      { version: '0.2.0' },
      'waiting',
    ])
      expect(readKept({ waiting: bad }).waiting, JSON.stringify(bad).slice(0, 40)).toBeNull()
  })

  it('takes the two switches from the page, nothing else', () => {
    expect(readSwitches({ checksAutomatically: false })).toEqual({ checksAutomatically: false })
    expect(readSwitches({})).toEqual({})
    for (const no of [
      null,
      'on',
      [true],
      { checksAutomatically: 1 },
      { downloadsAutomatically: 'true' },
      { lastChecked: 1 },
      { checksAutomatically: true, other: true },
    ])
      expect(() => readSwitches(no), JSON.stringify(no)).toThrow()
  })

  it('keeps them in a file, whole, and reads them back', () => {
    const folder = mkdtempSync(path.join(os.tmpdir(), 'updates-'))
    try {
      const file = path.join(folder, 'updates.json')
      expect(readKeptFile(file)).toEqual(firstKept)
      const value = { ...firstKept, checksAutomatically: false, lastChecked: 99, waiting: waiting020 }
      writeKeptFile(file, value)
      expect(readKeptFile(file)).toEqual(value)
      expect(JSON.parse(readFileSync(file, 'utf8')).lastChecked).toBe(99)
      writeFileSync(file, '{damaged')
      expect(readKeptFile(file)).toEqual(firstKept)
    } finally {
      rmSync(folder, { recursive: true, force: true })
    }
  })
})

describe('which builds update themselves, and from where', () => {
  const release = { packaged: true, build: '4210', platform: 'win32', signers: [signer] }

  it('a signed release installed on Windows only (the Mac’s build without its key never updates itself)', () => {
    expect(releasedBuild(release)).toBe(true)
    expect(releasedBuild({ ...release, signers: [] })).toBe(false)
    expect(releasedBuild({ ...release, build: '0' })).toBe(false)
    expect(releasedBuild({ ...release, packaged: false })).toBe(false)
    expect(releasedBuild({ ...release, platform: 'linux' })).toBe(false)
    expect(releasedBuild({ ...release, build: '12a' })).toBe(false)
  })

  it('the signers a release names in its package.json, each a subject in full', () => {
    expect(signersOf({ simeonSigners: [signer] })).toEqual([signer])
    for (const no of [
      undefined,
      {},
      { simeonSigners: [] },
      { simeonSigners: 'CN="Example Signer, Inc."' },
      { simeonSigners: ['CN="Example Signer, Inc."'] },
      { simeonSigners: [signer, 'Example Signer, Inc.'] },
      { simeonSigners: [signer, signer, signer, signer, signer] },
    ])
      expect(signersOf(no), JSON.stringify(no)).toEqual([])
  })

  it('a stand-in feed only on this computer, never by a name a hosts file could send elsewhere', () => {
    expect(feedForChecks({})).toBeUndefined()
    expect(feedForChecks({ SIMEON_UPDATES_FEED: 'http://127.0.0.1:4310/desktop/download/windows/' })).toBe(
      'http://127.0.0.1:4310/desktop/download/windows',
    )
    expect(feedForChecks({ SIMEON_UPDATES_FEED: 'http://[::1]:9/f' })).toBe('http://[::1]:9/f')
    for (const no of [
      'http://localhost:9',
      'https://api.simeonlabs.com/desktop/download/windows',
      'http://127.0.0.1.evil.example/feed',
      'http://user:pw@127.0.0.1/feed',
      'http://127.0.0.1/feed?x=1',
      'file:///C:/feed',
      'nonsense',
    ])
      expect(feedForChecks({ SIMEON_UPDATES_FEED: no }), no).toBeUndefined()
  })

  it('the stand-in feed’s settings are the release’s shape, one range a request', () => {
    expect(feedSettings('http://127.0.0.1:1/f')).toEqual({
      provider: 'generic',
      url: 'http://127.0.0.1:1/f',
      useMultipleRangeRequest: false,
      updaterCacheDirName: 'simeon-updater',
    })
  })
})

describe('the installer waiting on disk', () => {
  it('is only the one in the updater’s own pending folder, by its own name', () => {
    const cache = path.resolve('/cache/simeon-windows-updater')
    expect(inPending(path.join(cache, 'pending', 'Simeon-Setup-0.2.0.exe'), '0.2.0', cache)).toBe(true)
    expect(inPending(path.join(cache, 'pending', 'Simeon-Setup-0.3.0.exe'), '0.2.0', cache)).toBe(false)
    expect(inPending(path.join(cache, 'pending', '..', 'Simeon-Setup-0.2.0.exe'), '0.2.0', cache)).toBe(false)
    expect(inPending('/elsewhere/Simeon-Setup-0.2.0.exe', '0.2.0', cache)).toBe(false)
    expect(inPending(path.join(cache, 'PENDING', 'simeon-setup-0.2.0.EXE'), '0.2.0', cache, 'win32')).toBe(true)
  })

  it('its bytes’ sha512, read a piece at a time, as the feed writes it', () => {
    const folder = mkdtempSync(path.join(os.tmpdir(), 'installer-'))
    try {
      const file = path.join(folder, 'Simeon-Setup-0.2.0.exe')
      writeFileSync(file, Buffer.alloc(3 * 1024 * 1024 + 5, 7))
      expect(sha512Of(file)).toBe(
        // Node's own, all at once.
        createHash('sha512').update(readFileSync(file)).digest('base64'),
      )
    } finally {
      rmSync(folder, { recursive: true, force: true })
    }
  })
})

describe('updates.log', () => {
  it('one line a step, the person’s own folder as ~', () => {
    expect(scrubbed('download of C:\\Users\\Jane Doe\\AppData\\Local\\x.exe\nfailed', 'C:\\Users\\Jane Doe')).toBe(
      'download of ~\\AppData\\Local\\x.exe failed',
    )
    expect(scrubbed('a'.repeat(5_000)).length).toBe(2_048)
  })

  it('stamped and appended; past 5 MB at a launch, its newest megabyte kept from a line’s start', () => {
    const folder = mkdtempSync(path.join(os.tmpdir(), 'updates-log-'))
    try {
      const log = new UpdatesLog(folder, () => new Date('2026-11-02T12:00:00.000Z'), '/home/jane')
      log.write('look: found 0.2.0 in /home/jane/.cache')
      log.write('daily check: nothing newer than 0.1.0')
      expect(readFileSync(log.file, 'utf8')).toBe(
        '2026-11-02T12:00:00.000Z look: found 0.2.0 in ~/.cache\n2026-11-02T12:00:00.000Z daily check: nothing newer than 0.1.0\n',
      )
      writeFileSync(log.file, `${'x'.repeat(99)}\n`.repeat(60_000))
      new UpdatesLog(folder)
      const kept = readFileSync(log.file, 'utf8')
      expect(kept.length).toBeLessThanOrEqual(1024 * 1024)
      expect(kept.startsWith('x'.repeat(99))).toBe(true)
    } finally {
      rmSync(folder, { recursive: true, force: true })
    }
  })
})
