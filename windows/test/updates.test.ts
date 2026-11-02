// The updates' rules (src/main/updates), written from the Mac's `MacUpdates`
// (mac/Simeon/Updates.swift) and Settings › Updates (SettingsPages.swift
// 236-289): a stand-in engine in electron-updater's place, a fake clock.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  feedForChecks,
  feedSettings,
  readKeptFile,
  releasedBuild,
  writeKeptFile,
} from '../src/main/updates/feed'
import {
  type KeptUpdates,
  type UpdateEngine,
  Updates,
  type UpdatesState,
  day,
  firstKept,
  firstLookMs,
  readKept,
  readSwitches,
} from '../src/main/updates/updates'

const hour = 3_600_000

/** A stand-in for electron-updater: each check answers what `latest` says; every call recorded. */
class FakeEngine implements UpdateEngine {
  latest: string | null = null
  fails = false
  downloadFails = false
  installStarts = true
  checks = 0
  downloads = 0
  installs = 0
  /** A check held until `answer()`, to see what happens meanwhile. */
  holding = false
  private waiting: (() => void)[] = []

  async check(): Promise<string | null> {
    this.checks += 1
    if (this.holding) await new Promise<void>((done) => this.waiting.push(done))
    if (this.fails) throw new Error('offline')
    return this.latest
  }

  answer(): void {
    this.holding = false
    for (const done of this.waiting.splice(0)) done()
  }

  async download(): Promise<void> {
    this.downloads += 1
    if (this.downloadFails) throw new Error('refused')
  }

  installNow(): boolean {
    this.installs += 1
    return this.installStarts
  }
}

function made(options: { engine?: FakeEngine | null; kept?: Partial<KeptUpdates> } = {}) {
  const engine = options.engine === null ? undefined : (options.engine ?? new FakeEngine())
  const sent: UpdatesState[] = []
  const keeps: KeptUpdates[] = []
  const updates = new Updates({
    engine,
    kept: { ...firstKept, ...options.kept },
    keep: (value) => keeps.push(value),
    send: (state) => sent.push(state),
  })
  return { updates, engine: engine as FakeEngine, sent, keeps }
}

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

  it('in a build that doesn’t update itself, asks nothing and says so', async () => {
    const { updates, sent } = made({ engine: null, kept: { lastChecked: 5 } })
    // A check from an installed release before is not this build's.
    expect(updates.current.lastChecked).toBeNull()
    expect(updates.current.available).toBe(false)
    updates.start()
    updates.look()
    await updates.install()
    await vi.advanceTimersByTimeAsync(3 * day)
    expect(sent).toEqual([])
    expect(updates.current).toMatchObject({ available: false, checking: false, found: null })
  })

  it('a look finds a release and downloads nothing (lookQuietly)', async () => {
    const { updates, engine, sent, keeps } = made()
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
    // Checking, then what it found: the page redraws twice.
    expect(sent.map((s) => [s.checking, s.found])).toEqual([
      [true, null],
      [false, '0.2.0'],
    ])
  })

  it('nothing newer: up to date, and when it looked', async () => {
    const { updates } = made()
    updates.look()
    await settle()
    expect(updates.current).toMatchObject({ found: null, upToDate: true, lastChecked: Date.now() })
  })

  it('a feed that can’t be read only ends the check (`didFinishUpdateCycle` with an error)', async () => {
    const { updates, engine, keeps } = made({ kept: { lastChecked: 5 } })
    engine.fails = true
    updates.look()
    await settle()
    expect(updates.current).toMatchObject({ checking: false, found: null, upToDate: false, lastChecked: 5 })
    expect(keeps).toEqual([])
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

  it('the daily check comes a moment after launch the first time, and downloads what it finds', async () => {
    const { updates, engine } = made()
    engine.latest = '0.2.0'
    updates.start()
    await vi.advanceTimersByTimeAsync(firstLookMs - 1)
    expect(engine.checks).toBe(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(engine.checks).toBe(1)
    expect(engine.downloads).toBe(1)
    expect(updates.current).toMatchObject({ found: '0.2.0', downloaded: true })
  })

  it('then once a day, counted from the last answer', async () => {
    const { updates, engine } = made({ kept: { lastChecked: Date.now() - 2 * hour } })
    updates.start()
    await vi.advanceTimersByTimeAsync(22 * hour - 1_000)
    expect(engine.checks).toBe(0)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(engine.checks).toBe(1)
    // A look in between moves the next one a day after it.
    await vi.advanceTimersByTimeAsync(12 * hour)
    updates.look()
    await settle()
    expect(engine.checks).toBe(2)
    await vi.advanceTimersByTimeAsync(day - 1_000)
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

  it('Update Now downloads, then installs and opens Simeon again; installing until the app quits', async () => {
    const { updates, engine } = made()
    engine.latest = '0.2.0'
    updates.look()
    await settle()
    await updates.install()
    expect(engine.downloads).toBe(1)
    expect(engine.installs).toBe(1)
    expect(updates.current).toMatchObject({ installing: true, downloaded: true })
  })

  it('Update Now with the release on disk installs at once', async () => {
    const { updates, engine } = made()
    engine.latest = '0.2.0'
    updates.start()
    await vi.advanceTimersByTimeAsync(firstLookMs)
    expect(engine.downloads).toBe(1)
    await updates.install()
    expect(engine.downloads).toBe(1)
    expect(engine.installs).toBe(1)
  })

  it('Update Now that can’t download or start is there to press again', async () => {
    const { updates, engine } = made()
    engine.latest = '0.2.0'
    updates.look()
    await settle()
    engine.downloadFails = true
    await updates.install()
    expect(engine.installs).toBe(0)
    expect(updates.current.installing).toBe(false)
    engine.downloadFails = false
    engine.installStarts = false
    await updates.install()
    expect(engine.installs).toBe(1)
    expect(updates.current.installing).toBe(false)
  })

  it('Update Now while a look is under way installs; the look ends as it would', async () => {
    const { updates, engine } = made()
    engine.latest = '0.2.0'
    updates.look()
    await settle()
    engine.holding = true
    updates.look()
    expect(updates.current.checking).toBe(true)
    await updates.install()
    expect(engine.installs).toBe(1)
    engine.answer()
    await settle()
    expect(updates.current).toMatchObject({ checking: false, installing: true, found: '0.2.0', downloaded: true })
  })

  it('Update Now with nothing found does nothing; a look is refused while it installs', async () => {
    const { updates, engine } = made()
    await updates.install()
    expect(engine.downloads + engine.installs).toBe(0)
    engine.latest = '0.2.0'
    updates.look()
    await settle()
    await updates.install()
    updates.look()
    await settle()
    expect(engine.checks).toBe(1)
  })

  it('a newer release than the one downloaded is downloaded again', async () => {
    const { updates, engine } = made()
    engine.latest = '0.2.0'
    updates.start()
    await vi.advanceTimersByTimeAsync(firstLookMs)
    expect(updates.current.downloaded).toBe(true)
    engine.latest = '0.3.0'
    updates.look()
    await settle()
    expect(updates.current).toMatchObject({ found: '0.3.0', downloaded: false })
    // The same one again stays downloaded.
    await vi.advanceTimersByTimeAsync(day)
    expect(updates.current).toMatchObject({ found: '0.3.0', downloaded: true })
    engine.latest = '0.3.0'
    updates.look()
    await settle()
    expect(updates.current.downloaded).toBe(true)
  })

  it('keeps the switches at once, and says nothing when nothing changed', () => {
    const { updates, sent, keeps } = made()
    updates.setSwitches({ downloadsAutomatically: false })
    expect(keeps.at(-1)).toEqual({ ...firstKept, downloadsAutomatically: false })
    expect(sent.at(-1)?.downloadsAutomatically).toBe(false)
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

describe('what is kept and what the page sends', () => {
  it('reads the kept values, the first ones for anything else', () => {
    expect(readKept(undefined)).toEqual(firstKept)
    expect(readKept({ checksAutomatically: false, downloadsAutomatically: 'yes', lastChecked: 12 })).toEqual({
      checksAutomatically: false,
      downloadsAutomatically: true,
      lastChecked: 12,
    })
    expect(readKept({ lastChecked: -1 }).lastChecked).toBeNull()
    expect(readKept({ lastChecked: Number.NaN }).lastChecked).toBeNull()
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
      writeKeptFile(file, { checksAutomatically: false, downloadsAutomatically: true, lastChecked: 99 })
      expect(readKeptFile(file)).toEqual({ checksAutomatically: false, downloadsAutomatically: true, lastChecked: 99 })
      expect(JSON.parse(readFileSync(file, 'utf8')).lastChecked).toBe(99)
      writeFileSync(file, '{damaged')
      expect(readKeptFile(file)).toEqual(firstKept)
    } finally {
      rmSync(folder, { recursive: true, force: true })
    }
  })
})

describe('which builds update themselves, and from where', () => {
  it('a release installed on Windows only', () => {
    expect(releasedBuild({ packaged: true, build: '4210', platform: 'win32' })).toBe(true)
    expect(releasedBuild({ packaged: true, build: '0', platform: 'win32' })).toBe(false)
    expect(releasedBuild({ packaged: false, build: '4210', platform: 'win32' })).toBe(false)
    expect(releasedBuild({ packaged: true, build: '4210', platform: 'linux' })).toBe(false)
    expect(releasedBuild({ packaged: true, build: '12a', platform: 'win32' })).toBe(false)
  })

  it('a stand-in feed only on this computer', () => {
    expect(feedForChecks({})).toBeUndefined()
    expect(feedForChecks({ SIMEON_UPDATES_FEED: 'http://127.0.0.1:4310/desktop/download/windows/' })).toBe(
      'http://127.0.0.1:4310/desktop/download/windows',
    )
    expect(feedForChecks({ SIMEON_UPDATES_FEED: 'http://localhost:9' })).toBe('http://localhost:9')
    for (const no of [
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
