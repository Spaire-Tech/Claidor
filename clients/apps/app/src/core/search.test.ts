// Search as the Mac's (SimeonCore's CoreTests.swift, `SearchTests`: the
// words, the computer's answers read, a found line's row). The iPhone's own
// matching and links (`Search.match`, `Search.links`) are not the Mac's and
// are not ported (search.ts).

import { beforeAll, describe, expect, it } from 'vitest'
import type { ChatRow, Exchange } from './chat'
import { Entry } from './entry'
import { makeAgent } from './models'
import {
  ago,
  fileHitFrom,
  fileLine,
  messageHitFrom,
  messageLine,
  routineDate,
  routineHitFrom,
  rowIdFor,
  searchTabs,
  tabTitle,
} from './search'
import { loadWords } from './words'

beforeAll(() => loadWords('en'))

describe('the words', () => {
  it('as the Mac says them', () => {
    const now = new Date(1_000_000_000)
    const ms = (seconds: number) => (1_000_000 - seconds) * 1000
    expect(ago(ms(20), now)).toBe('now')
    expect(ago(ms(5 * 60), now)).toBe('5m ago')
    expect(ago(ms(3 * 3600), now)).toBe('3h ago')
    expect(ago(ms(2 * 86_400), now)).toBe('2d ago')
    expect(ago(ms(70 * 86_400), now)).toBe('2mo ago')
    expect(ago(ms(400 * 86_400), now)).toBe('1y ago')
    expect(ago(undefined, now)).toBeUndefined()
    // A time ahead of now is now.
    expect(ago(ms(-500), now)).toBe('now')
    const mine = messageHitFrom({
      agentId: 'theo',
      entryId: 'e1',
      role: 'user',
      snippet: 'the runway',
      timestampMs: ms(300),
    })!
    const theirs = messageHitFrom({
      agentId: 'theo',
      entryId: 'e2',
      role: 'assistant',
      snippet: 'the runway',
      timestampMs: ms(300),
    })!
    const theo = makeAgent({ id: 'theo', name: 'Theo' })
    const squad = makeAgent({ id: 'squad', name: 'Launch', isGroup: true })
    expect(messageLine(mine, theo, now)).toBe('You to Theo · 5m ago')
    expect(messageLine(theirs, theo, now)).toBe('Theo to you · 5m ago')
    expect(messageLine(mine, squad, now)).toBe('You in Launch · 5m ago')
    expect(messageLine(theirs, squad, now)).toBe('In Launch · 5m ago')
    expect(messageLine(theirs, undefined, now)).toBe('an agent to you · 5m ago')
    const picture = fileHitFrom({
      agentId: 'theo',
      entryId: 'e3',
      fileName: 'a.png',
      kind: 'image',
      width: 1280,
      height: 800,
      timestampMs: ms(300),
    })!
    expect(fileLine(picture, theo, now)).toBe('Theo · 1280×800 · 5m ago')
    expect(searchTabs.map(tabTitle)).toEqual([
      'All',
      'Messages',
      'Agents',
      'Groups',
      'Files',
      'Links',
      'Routines',
      'Actions',
    ])
  })
})

describe('the computer’s answers', () => {
  it('a hit needs its chat and its line', () => {
    expect(messageHitFrom({ agentId: 'theo' })).toBeUndefined()
    expect(messageHitFrom({ entryId: 'e' })).toBeUndefined()
    expect(messageHitFrom({ agentId: 'theo', entryId: 'e' })).toEqual({
      agentId: 'theo',
      entryId: 'e',
      fromPerson: false,
      snippet: '',
      timestampMs: undefined,
    })
    const file = fileHitFrom({ agentId: 'theo', entryId: 'e' })!
    expect(file.fileName).toBe('File')
    expect(file.kind).toBe('file')
    expect(file.width).toBeUndefined()
  })

  it('a routine: its name, its words, its date', () => {
    const hit = routineHitFrom({
      agentId: 'simeon',
      automation: {
        id: 'r1',
        name: 'Monday launch check',
        triggerDescription: 'Every Monday at 9:00 AM',
        createdAt: 5,
      },
    })!
    expect(hit.routine).toEqual({
      id: 'r1',
      name: 'Monday launch check',
      summary: 'Every Monday at 9:00 AM',
      lastRunAt: undefined,
    })
    expect(routineDate(hit)).toBe(5)
    expect(
      routineDate(
        routineHitFrom({
          agentId: 'a',
          automation: { id: 'r', lastRunAt: 9, createdAt: 5 },
        })!,
      ),
    ).toBe(9)
    expect(
      routineHitFrom({ agentId: 'a', automation: { id: 'r' } })!.routine.name,
    ).toBe('Routine')
    expect(
      routineHitFrom({ agentId: 'a', automation: { name: 'x' } }),
    ).toBeUndefined()
    expect(routineHitFrom({ automation: { id: 'r' } })).toBeUndefined()
  })
})

describe('a found line’s row', () => {
  it('its own, or the run of messages between agents that holds it', () => {
    const inside = Entry.from({ kind: 'message', id: 'x2' })!
    const rows: ChatRow[] = [
      { kind: 'notice', id: 'n1', text: 'Hi' },
      {
        kind: 'teammates',
        id: 'run1',
        exchange: {} as Exchange,
        entries: [Entry.from({ kind: 'message', id: 'x1' })!, inside],
      },
    ]
    expect(rowIdFor('n1', rows)).toBe('n1')
    expect(rowIdFor('x2', rows)).toBe('run1')
    expect(rowIdFor('zz', rows)).toBeUndefined()
  })
})
