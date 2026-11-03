// The page's view of the Windows app's updater (src/desktop/updates.ts), from
// the Mac's `MacUpdates` and `SettingsUpdatesPage.checkedLine`
// (mac/Simeon/Updates.swift, SettingsPages.swift 236-289), with a stand-in
// app (FakeDesktop) and the Mac's French table read in place.

import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { setWords } from '../core/words'
import { FakeDesktop } from './testing'
import {
  type UpdatesState,
  checkedLine,
  desktopUpdates,
  relativeWords,
  resetDesktopUpdatesForTests,
} from './updates'

const state: UpdatesState = {
  available: true,
  checking: false,
  found: null,
  downloaded: false,
  installing: false,
  upToDate: false,
  lastChecked: null,
  checksAutomatically: true,
  downloadsAutomatically: true,
}

const settle = () => new Promise((done) => setTimeout(done, 0))

describe('the updater in the page', () => {
  let remove: (() => void) | undefined
  afterEach(() => {
    remove?.()
    remove = undefined
    resetDesktopUpdatesForTests()
  })

  it('is nothing on the web', () => {
    expect(desktopUpdates()).toBeUndefined()
  })

  it('reads the app’s state once, then follows it', async () => {
    const fake = new FakeDesktop().answer('readUpdates', () => ({
      ...state,
      found: '0.2.0',
    }))
    remove = fake.install()
    const updates = desktopUpdates()
    expect(desktopUpdates()).toBe(updates)
    await settle()
    expect(updates?.found).toBe('0.2.0')
    let redrawn = 0
    updates?.subscribe(() => {
      redrawn += 1
    })
    fake.emit('updatesChanged', { ...state, checking: true })
    expect(updates?.state?.checking).toBe(true)
    expect(updates?.found).toBeNull()
    expect(redrawn).toBe(1)
    expect(fake.calls.filter((c) => c.name === 'readUpdates')).toHaveLength(1)
  })

  it('a change heard while the first answer is on its way is the newer', async () => {
    let answer: (value: UpdatesState) => void = () => {}
    // The app answers late (the contract's calls are always promises in the page).
    const late = () => new Promise<UpdatesState>((done) => (answer = done))
    const fake = new FakeDesktop().answer(
      'readUpdates',
      late as unknown as () => UpdatesState,
    )
    remove = fake.install()
    const updates = desktopUpdates()
    await settle()
    fake.emit('updatesChanged', { ...state, found: '0.3.0' })
    answer({ ...state, found: '0.2.0' })
    await settle()
    expect(updates?.found).toBe('0.3.0')
  })

  it('looks quietly, never while a check or an install is under way, nor in a build that doesn’t update itself', async () => {
    const fake = new FakeDesktop()
      .answer('readUpdates', () => state)
      .answer('lookForUpdates', () => undefined)
    remove = fake.install()
    const updates = desktopUpdates()
    await settle()
    updates?.look()
    fake.emit('updatesChanged', { ...state, checking: true })
    updates?.look()
    fake.emit('updatesChanged', { ...state, installing: true })
    updates?.look()
    fake.emit('updatesChanged', { ...state, available: false })
    updates?.look()
    expect(fake.calls.filter((c) => c.name === 'lookForUpdates')).toHaveLength(
      1,
    )
  })

  it('Update Now and the switches go to the app; a switch shows at once', async () => {
    const fake = new FakeDesktop()
      .answer('readUpdates', () => state)
      .answer('installUpdate', () => undefined)
      .answer('setUpdateSwitches', () => undefined)
    remove = fake.install()
    const updates = desktopUpdates()
    await settle()
    updates?.setDownloadsAutomatically(false)
    expect(updates?.state?.downloadsAutomatically).toBe(false)
    updates?.setChecksAutomatically(false)
    updates?.install()
    expect(fake.calls.slice(1)).toEqual([
      { name: 'setUpdateSwitches', args: [{ downloadsAutomatically: false }] },
      { name: 'setUpdateSwitches', args: [{ checksAutomatically: false }] },
      { name: 'installUpdate', args: [] },
    ])
  })
})

describe('when it last looked (RelativeDateTimeFormatter)', () => {
  const now = new Date(2026, 10, 2, 12, 0, 0).getTime()
  const ago = (ms: number) => relativeWords(now - ms, now, 'en-US')
  const second = 1_000
  const minute = 60 * second
  const hour = 60 * minute
  const day = 24 * hour

  it('says the largest whole unit', () => {
    expect(ago(0)).toBe('0 seconds ago')
    expect(ago(400)).toBe('0 seconds ago')
    expect(ago(30 * second)).toBe('30 seconds ago')
    expect(ago(61 * second)).toBe('1 minute ago')
    expect(ago(59 * minute + 59 * second)).toBe('59 minutes ago')
    expect(ago(2 * hour + 5 * minute)).toBe('2 hours ago')
    expect(ago(3 * day)).toBe('3 days ago')
    expect(ago(10 * day)).toBe('1 week ago')
    expect(ago(40 * day)).toBe('1 month ago')
    expect(ago(400 * day)).toBe('1 year ago')
    expect(relativeWords(now + 2 * minute, now, 'en-US')).toBe('in 2 minutes')
  })

  it('in the app’s language', () => {
    expect(relativeWords(now - 2 * minute, now, 'fr-FR')).toBe(
      'il y a 2 minutes',
    )
  })
})

describe('the line under the version (checkedLine)', () => {
  const now = Date.UTC(2026, 10, 2, 12)
  afterEach(() => setWords('en', {}))

  it('says nothing until something is known', () => {
    expect(checkedLine(undefined, now, 'en-US')).toBeUndefined()
    expect(checkedLine(state, now, 'en-US')).toBeUndefined()
  })

  it('up to date, then when it looked', () => {
    expect(
      checkedLine(
        { ...state, upToDate: true, lastChecked: now - 3 * 60_000 },
        now,
        'en-US',
      ),
    ).toBe('Simeon is up to date. Last checked 3 minutes ago.')
    expect(
      checkedLine({ ...state, lastChecked: now - 3_600_000 }, now, 'en-US'),
    ).toBe('Last checked 1 hour ago.')
  })

  it('says just now under a minute (testACheckAMomentAgoIsJustNow)', () => {
    // 3 November 2026: a check a moment ago read "0 seconds ago", and stayed so.
    expect(
      checkedLine({ ...state, upToDate: true, lastChecked: now }, now, 'en-US'),
    ).toBe('Simeon is up to date. Last checked just now.')
    expect(
      checkedLine({ ...state, lastChecked: now - 59_000 }, now, 'en-US'),
    ).toBe('Last checked just now.')
    // A moment ahead (the page's clock drawn before the check ended): just now, never "in 0 seconds".
    expect(
      checkedLine({ ...state, lastChecked: now + 200 }, now, 'en-US'),
    ).toBe('Last checked just now.')
    expect(
      checkedLine({ ...state, lastChecked: now - 60_000 }, now, 'en-US'),
    ).toBe('Last checked 1 minute ago.')
  })

  it('in French, from the Mac’s own table', () => {
    const mac = JSON.parse(
      readFileSync(new URL('../words/mac/fr.json', import.meta.url), 'utf8'),
    ) as Record<string, string>
    setWords('fr', { mac })
    expect(
      checkedLine(
        { ...state, upToDate: true, lastChecked: now - 2 * 60_000 },
        now,
        'fr-FR',
      ),
    ).toBe('Simeon est à jour. Dernière vérification il y a 2 minutes.')
    // "just now" is the core's word (RoutineTriggers' `relative`), in its table.
    const core = JSON.parse(
      readFileSync(new URL('../words/core/fr.json', import.meta.url), 'utf8'),
    ) as Record<string, string>
    setWords('fr', { mac, core })
    expect(
      checkedLine({ ...state, lastChecked: now - 5_000 }, now, 'fr-FR'),
    ).toBe('Dernière vérification à l’instant.')
  })
})
