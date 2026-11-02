// Search (⌘K) as the Mac window does it (SimeonCore's JumpTests.swift),
// checked against what the window shows for the same rows.

import { describe, expect, it } from 'vitest'
import { Entry } from './entry'
import {
  address,
  commands,
  empty,
  links,
  matchRuns,
  nextTab,
  normalize,
  ordered,
  results,
  rowId,
  rowKind,
  rowTitle,
  score,
  settled,
  shortcut,
  subtitle,
  tabs,
  tokens,
  web,
} from './jump'
import { makeAgent } from './models'
import { type RoutineHit, messageHitFrom, routineHitFrom } from './search'

const theo = makeAgent({
  id: 'theo',
  name: 'Theo',
  title: 'Bookkeeping',
  description: 'Keeps the books.',
})
const simeon = makeAgent({
  id: 'simeon',
  name: 'Simeon',
  title: 'Chief of Staff',
  description: 'Runs your day.',
})
const scout = makeAgent({
  id: 'scout',
  name: 'Scout',
  title: 'Customer research',
  description: 'Reads what customers say.',
  isHidden: true,
})
const squad = makeAgent({
  id: 'squad',
  name: 'Launch squad',
  isGroup: true,
  memberIds: ['simeon', 'theo', 'gone'],
})

describe('matching', () => {
  it('normalizes: accents and separators off', () => {
    const { normalized, sources } = normalize('Café-Bar  2')
    expect(normalized.join('')).toBe('cafe bar 2')
    expect(sources).toEqual([0, 1, 2, 3, -1, 5, 6, 7, -1, 10])
    expect(tokens('  Théme: DARK ')).toEqual(['theme', 'dark'])
    expect(tokens('!!')).toEqual([])
  })

  it('scores as the window does', () => {
    // "th" in "theo": 5 for the word start, 1 + 3 for the next letter, less 0.02 a letter.
    expect(score([...'theo'], [...'th'])).toBeCloseTo(9 - 0.08, 9)
    expect(score([...'theo'], [...'x'])).toBeUndefined()
    // Letters too far apart do not match (more than three times the word's length).
    expect(score([...'abcdefghij'], [...'aj'])).toBeUndefined()
    expect(score([...'abc'], [])).toBe(0)
  })

  it('bolds every place a word is found', () => {
    const runs = matchRuns('Theme: Dark', 'th')
    expect(runs.map((run) => run.text)).toEqual(['Th', 'eme: Dark'])
    expect(runs.map((run) => run.isMatch)).toEqual([true, false])
    expect(
      matchRuns('Monday runway check', 'runway').map((run) => run.text),
    ).toEqual(['Monday ', 'runway', ' check'])
    expect(matchRuns('Theo', '').map((run) => run.isMatch)).toEqual([false])
  })

  it('bolds the letters an accent was taken off', () => {
    expect(matchRuns('Café plans', 'cafe')).toEqual([
      { text: 'Café', isMatch: true },
      { text: ' plans', isMatch: false },
    ])
  })
})

describe('what each tab lists', () => {
  it('typed "th" lists Theo, then the themes shortest first', () => {
    const list = commands({
      orgChart: true,
      hiddenCount: 0,
      current: simeon,
      hasChannels: true,
      theme: 'light',
    })
    const rows = results({
      agents: [simeon, theo],
      hidden: [],
      commands: list,
      tab: 'all',
      query: 'th',
    })
    expect(rows.slice(0, 4).map(rowTitle)).toEqual([
      'Theo',
      'Theme: Dark',
      'Theme: Light',
      'Theme: System',
    ])
  })

  it('no query lists the agents, then the actions, on All', () => {
    const list = commands({
      orgChart: false,
      hiddenCount: 0,
      hasChannels: false,
      theme: 'system',
    })
    const rows = results({
      agents: [simeon, squad],
      hidden: [scout],
      commands: list,
      tab: 'all',
      query: '  ',
    })
    expect(rowId(rows[0]!)).toBe('agent:simeon')
    expect(rowKind(rows[1]!)).toBe('Group')
    expect(rows.length).toBe(2 + list.length)
    expect(rows.some((row) => rowId(row) === 'agent:scout')).toBe(false)
    expect(
      results({
        agents: [simeon, squad],
        hidden: [],
        commands: list,
        tab: 'groups',
        query: '',
      }).map(rowId),
    ).toEqual(['agent:squad'])
  })

  it('hidden agents come last, and only for a query', () => {
    const rows = results({
      agents: [simeon],
      hidden: [scout],
      commands: [],
      tab: 'all',
      query: 'sco',
    })
    expect(rows.map(rowId)).toEqual(['agent:scout'])
    expect(rows[0]!.kind === 'agent' && rows[0]!.hidden).toBe(true)
  })

  it('the computer’s matches the words missed follow, unless they are for older words', () => {
    const hit = messageHitFrom({
      agentId: 'theo',
      entryId: 't1',
      role: 'assistant',
      snippet: 'The runway is 14 months.',
      timestampMs: 1,
    })!
    const other = messageHitFrom({
      agentId: 'simeon',
      entryId: 'm1',
      role: 'user',
      snippet: 'Where are we on Thursday?',
      timestampMs: 1,
    })!
    const rows = results({
      agents: [],
      hidden: [],
      commands: [],
      messages: [hit, other],
      tab: 'all',
      query: 'runway',
    })
    expect(rows.map(rowId)).toEqual(['message:theo:t1', 'message:simeon:m1'])
    const stale = results({
      agents: [],
      hidden: [],
      commands: [],
      messages: [hit, other],
      messagesStale: true,
      tab: 'all',
      query: 'runway',
    })
    expect(stale.map(rowId)).toEqual(['message:theo:t1'])
  })

  it('puts the pins first', () => {
    expect(
      ordered([simeon, theo, squad], ['squad', 'missing']).map(
        (agent) => agent.id,
      ),
    ).toEqual(['squad', 'simeon', 'theo'])
  })
})

describe('the actions', () => {
  it('Update Simeon’s Computer comes last', () => {
    const offered = commands({
      orgChart: false,
      hiddenCount: 0,
      current: simeon,
      hasChannels: false,
      theme: 'system',
      computerUpdate: true,
    })
    expect(offered[offered.length - 1]?.id).toBe('update:computer')
    expect(offered[offered.length - 1]?.label).toBe("Update Simeon's Computer")
    expect(offered[offered.length - 1]?.detail).toBe('Updates')
    expect(
      commands({
        orgChart: false,
        hiddenCount: 0,
        current: simeon,
        hasChannels: false,
        theme: 'system',
      }).some((one) => one.id === 'update:computer'),
    ).toBe(false)
  })

  it('in the window’s order', () => {
    expect(
      commands({
        orgChart: true,
        hiddenCount: 1,
        current: squad,
        hasChannels: true,
        theme: 'dark',
      }).map((one) => one.id),
    ).toEqual([
      'view:org-chart',
      'open-hidden-chats',
      'info:members',
      'info:channels',
      'info:settings',
      'settings:general',
      'settings:usage',
      'overlay:plugins',
      'theme:system',
      'theme:light',
      'theme:dark',
    ])
    const bare = commands({
      orgChart: false,
      hiddenCount: 0,
      hasChannels: true,
      usage: false,
      theme: 'dark',
    })
    expect(bare.map((one) => one.id)).toEqual([
      'settings:general',
      'overlay:plugins',
      'theme:system',
      'theme:light',
      'theme:dark',
    ])
    expect(bare.filter((one) => one.isActive).map((one) => one.id)).toEqual([
      'theme:dark',
    ])
  })

  it('a shared room has no Members', () => {
    const room = { ...squad, isSharedRoom: true }
    expect(
      commands({
        orgChart: false,
        hiddenCount: 0,
        current: room,
        hasChannels: false,
        theme: 'system',
      }).some((one) => one.id === 'info:members'),
    ).toBe(false)
  })
})

describe('the rows’ words', () => {
  it('the second lines', () => {
    const byId = new Map([simeon, theo].map((agent) => [agent.id, agent]))
    expect(subtitle({ kind: 'agent', agent: squad, hidden: false }, byId)).toBe(
      'Simeon, Theo',
    )
    expect(subtitle({ kind: 'agent', agent: theo, hidden: false }, byId)).toBe(
      'Keeps the books.',
    )
    const routine: RoutineHit = routineHitFrom({
      agentId: 'theo',
      automation: {
        id: 'r1',
        name: 'Monday runway check',
        prompt: 'Check.',
        schedule: '0 9 * * 1',
        triggerDescription: 'Every Monday at 9:00 AM',
      },
    })!
    expect(subtitle({ kind: 'routine', hit: routine }, byId)).toBe(
      'Every Monday at 9:00 AM · Theo',
    )
  })

  it('the tabs', () => {
    expect(tabs(false)).toEqual(['all', 'agents', 'groups', 'actions'])
    expect(nextTab('all', -1, tabs(false))).toBe('actions')
    expect(nextTab('actions', 1, tabs(true))).toBe('all')
    expect(empty('links', false).label).toBe('No links in this chat yet')
    expect(empty('messages', true)).toEqual({
      label: 'Search unavailable',
      hint: 'Try again in a moment.',
      glass: true,
    })
    expect(shortcut(8)).toBe(9)
    expect(shortcut(9)).toBeUndefined()
  })

  it('settled', () => {
    const ready = { files: 'ready', routines: 'ready' } as const
    expect(
      settled({
        tab: 'all',
        globalSearch: true,
        filtered: true,
        messages: 'loading',
        ...ready,
      }),
    ).toBe('pending')
    expect(
      settled({
        tab: 'files',
        globalSearch: true,
        filtered: false,
        messages: 'failed',
        ...ready,
      }),
    ).toBe('settled')
    expect(
      settled({
        tab: 'routines',
        globalSearch: true,
        filtered: false,
        messages: 'ready',
        files: 'ready',
        routines: 'failed',
      }),
    ).toBe('unavailable')
    expect(
      settled({
        tab: 'all',
        globalSearch: false,
        filtered: true,
        messages: 'loading',
        files: 'loading',
        routines: 'loading',
      }),
    ).toBe('settled')
  })
})

describe('the open chat’s links', () => {
  it('each once, in their order', () => {
    const entries = Entry.list([
      {
        kind: 'message',
        id: 'a',
        content:
          'See [the doc](https://Docs.Example.com/a) and ![shot](https://img.example.com/x.png)',
      },
      { kind: 'message', id: 'b', content: ' https://example.com ' },
      {
        kind: 'send-message',
        id: 'c',
        message: { type: 'attachment', url: 'https://files.example.com/r.pdf' },
      },
      {
        kind: 'message',
        id: 'd',
        content: '[again](https://docs.example.com/a)',
      },
      { kind: 'message', id: 'e', content: 'not a link' },
    ])
    expect(links(entries)).toEqual([
      'https://docs.example.com/a',
      'https://example.com/',
      'https://files.example.com/r.pdf',
    ])
    expect(address('https://example.com/')).toBe('example.com')
    expect(address('https://docs.example.com/a?b=1')).toBe('docs.example.com/a')
    expect(web('ftp://example.com')).toBeUndefined()
    expect(web('https://exa mple.com')).toBeUndefined()
  })

  it('writes what an address may not hold percent-encoded, as swift-foundation’s URLComponents does', () => {
    // Each answer measured from SimeonCore's own Jump (Swift 6.2 on Linux, 2 November 2026).
    expect(web('https://example.com/café')).toBe(
      'https://example.com/caf%C3%A9',
    )
    expect(web('https://ex.com/a%zzb')).toBe('https://ex.com/a%25zzb')
    expect(web('https://ex.com/a#b#c')).toBe('https://ex.com/a#b%23c')
    expect(web('https://ex.com/a|b?x|y#z|w')).toBe(
      'https://ex.com/a%7Cb?x%7Cy#z%7Cw',
    )
    expect(web('https://café.com/x')).toBe('https://xn--caf-dma.com/x')
    expect(web('https://ex.com:abc/')).toBeUndefined()
    expect(address('https://café.com/x')).toBe('café.com/x')
    expect(address('https://ex.com/a#b#c')).toBe('ex.com/a')
  })

  it('writes a space after the host as %20, keeps the rest as written', () => {
    expect(web('HTTPS://Example.COM/A B?q=X#Y')).toBe(
      'https://example.com/A%20B?q=X#Y',
    )
    expect(web('https://user@Host.com:8080')).toBe(
      'https://user@host.com:8080/',
    )
    expect(
      links(
        Entry.list([
          {
            kind: 'send-message',
            id: 'f',
            message: { type: 'text', content: 'https://a.com/x' },
          },
        ]),
      ),
    ).toEqual(['https://a.com/x'])
  })
})
