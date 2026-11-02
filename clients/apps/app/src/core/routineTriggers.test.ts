// Routines' schedules and events against the shipped window's own functions
// (the core's RoutineTriggerTests.swift): the expected values were made by
// running the bundle's `pmt`, `dgn`, `sTe`, `fae`, `mne`, `rTe`, `h2n`,
// `pgn`, `Vgn`, `Wgn`, `tQ` and the rows' words in Node, on these inputs
// (fixtures/routine-triggers.json, copied from the core's test). Then the
// words of the editor's choices (RoutineEditorTests), the menus' toggles
// (RoutineRunFlightTests), and a routine's line in another language
// (LanguageTests).

import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { JSONValue } from './json'
import { routineFrom } from './routines'
import {
  type TriggerRow,
  addLabel,
  advancedShape,
  describeSchedule,
  gitButton,
  monthDaysLabel,
  monthsLabel,
  nextHour,
  runRelative,
  runStatus,
  runWhen,
  scheduleIsValid,
  scheduleLine,
  scheduleRow,
  scheduleShape,
  startShape,
  toggledGitEvents,
  toggledList,
  triggerMember,
  triggerOf,
  triggerRows,
  triggerWords,
  weekdaysLabel,
} from './routineTriggers'
import { type Table, setWords } from './words'

const table = (name: string, language: string) =>
  JSON.parse(
    readFileSync(
      new URL(`../words/${name}/${language}.json`, import.meta.url),
      'utf8',
    ),
  ) as Table

const fixtures = JSON.parse(
  readFileSync(
    new URL('./fixtures/routine-triggers.json', import.meta.url),
    'utf8',
  ),
) as {
  schedules: {
    s: string
    valid: boolean
    words: string
    shape: JSONValue
    line: string | null
    weekly: string
    advanced: string
    interval: string
    lead: string
    rest: string
  }[]
  times: { zone: string; ms: number; words: string }[]
  rows: { member: JSONValue; back: JSONValue; lead: string; rest: string }[]
  edits: { row: Record<string, JSONValue>; member: JSONValue }[]
  group: JSONValue
}

// The keyed sentences ("schedule.onWeekdays") read their English from the core's table.
beforeEach(() => setWords('en', {}, { core: table('core', 'en') }))
afterEach(() => setWords('en', {}))

describe('schedules as the window reads, writes and words them', () => {
  it('has the 45 schedules', () => {
    expect(fixtures.schedules).toHaveLength(45)
  })

  for (const item of fixtures.schedules) {
    it(JSON.stringify(item.s), () => {
      const s = item.s
      expect(scheduleIsValid(s)).toBe(item.valid)
      expect(describeSchedule(s)).toBe(item.words)
      const shape = scheduleShape(s)
      expect(shape ?? null).toEqual(item.shape)
      if (shape) expect(scheduleLine(shape)).toBe(item.line)
      expect(scheduleLine(startShape('weekly', shape))).toBe(item.weekly)
      expect(scheduleLine(advancedShape(shape))).toBe(item.advanced)
      expect(scheduleLine(startShape('interval', shape))).toBe(item.interval)
      const row = scheduleRow(s)
      expect(row.lead).toBe(item.lead)
      expect(row.rest).toBe(item.rest)
    })
  }
})

describe('when a run was', () => {
  const now = 1_791_558_000_000
  it('has the 39 times', () => {
    expect(fixtures.times).toHaveLength(39)
  })
  for (const item of fixtures.times) {
    it(`${item.zone} ${item.ms}`, () => {
      expect(runRelative(item.ms, now, item.zone)).toBe(item.words)
    })
  }
  it('capitalises its first letter', () => {
    expect(runWhen(now - 30_000, now)).toBe('Just now')
  })
})

describe('events read, saved and worded', () => {
  it('reads each saved member, saves it back and words it', () => {
    expect(fixtures.rows).toHaveLength(14)
    for (const item of fixtures.rows) {
      const row = triggerRows(item.member)[0]
      expect(row, JSON.stringify(item.member)).toBeDefined()
      expect(triggerMember(row!)).toEqual(item.back)
      expect(triggerWords(row!).lead).toBe(item.lead)
      expect(triggerWords(row!).rest).toBe(item.rest)
    }
    expect(
      triggerOf([
        ...triggerRows(fixtures.rows[0]!.member),
        ...triggerRows(fixtures.rows[1]!.member),
      ]),
    ).toEqual(fixtures.group)
    expect(triggerOf([])).toBeUndefined()
  })

  it('refuses what the window refuses', () => {
    const row = (j: Record<string, JSONValue>): TriggerRow => {
      const s = (key: string) => (typeof j[key] === 'string' ? j[key] : '')
      const b = (key: string) => j[key] === true
      switch (j.platform) {
        case 'slack':
          return {
            kind: 'slack',
            channel: s('channel'),
            match: s('match'),
            keyword: s('keyword'),
            emoji: s('emoji'),
            bySelf: b('bySelf'),
          }
        case 'github':
          return {
            kind: 'github',
            repo: s('repo'),
            events: (j.events as string[]) ?? [],
            userAllowlist: s('userAllowlist'),
            ciBranch: s('ciBranch'),
          }
        case 'microsoftTeams':
          return {
            kind: 'teams',
            tenantId: s('tenantId'),
            teamIds: s('teamIds'),
            channelIds: s('channelIds'),
            messageContains: s('messageContains'),
            isRegex: b('messageContainsIsRegex'),
            linkedOnly: b('blockUnauthenticatedTeamsUsers'),
          }
        default:
          return { kind: 'schedule', text: s('schedule') }
      }
    }
    expect(fixtures.edits).toHaveLength(10)
    for (const item of fixtures.edits)
      expect(triggerMember(row(item.row)) ?? null).toEqual(item.member)
  })
})

describe('the routine editor’s words and choices (RoutineEditorTests)', () => {
  it('words the labels as the window does', () => {
    expect(monthsLabel(null)).toBe('Any month')
    expect(monthsLabel([3, 1, 3])).toBe('Jan, Mar')
    expect(weekdaysLabel([2, 1])).toBe('Mon, Tue')
    expect(monthDaysLabel([15, 1])).toBe('1st, 15th')
    expect(gitButton([])).toBe('Pick events')
    expect(gitButton(['pr-opened', 'ci-failed'])).toBe('Opened +1')
    expect(addLabel(0)).toBe('Add trigger')
    expect(runStatus('ok')).toBe('Succeeded')
  })

  it('keeps the menus’ toggles in their order (RoutineRunFlightTests)', () => {
    expect(toggledGitEvents(['ci-failed'], 'pr-opened')).toEqual([
      'pr-opened',
      'ci-failed',
    ])
    expect(toggledGitEvents(['pr-opened'], 'pr-opened')).toEqual([])
    expect(toggledList([3, 1], 2)).toEqual([1, 2, 3])
    expect(nextHour(22, [22, 23, 0])).toBe(1)
  })
})

describe('a routine’s line in another language (LanguageTests)', () => {
  it('is the host’s words in English, the editor’s own sentence in French', () => {
    const json: JSONValue = {
      id: 'r1',
      name: 'Weekly',
      trigger: { type: 'cron', schedule: '0 9 * * 1' },
      triggerDescription: 'the host’s English',
    }
    expect(routineFrom(json)?.summary).toBe('the host’s English')
    setWords('fr', { core: table('core', 'fr') }, { core: table('core', 'en') })
    const row = triggerWords({ kind: 'schedule', text: '0 9 * * 1' })
    expect(routineFrom(json)?.summary).toBe(`${row.lead} ${row.rest}`)
    expect(routineFrom(json)?.summary).toBe('Chaque lundi à 09:00')
  })

  it('says a day and a time the French way', () => {
    setWords('fr', { core: table('core', 'fr') }, { core: table('core', 'en') })
    expect(describeSchedule('0 9 1 * *')).toBe('Le 1er de chaque mois à 09:00')
    expect(monthDaysLabel([1, 15])).toBe('1er, 15')
  })
})
