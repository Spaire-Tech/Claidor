// Search's state (mac/Simeon/SearchPanel.swift's `SearchState`) against a
// stand-in computer: it opens and closes with the window, reads its gates,
// asks for the words, lists what the window has screens for, and its keys
// and rows do what the Mac's do.

import { describe, expect, it } from 'vitest'
import type { JSONValue } from '../core/json'
import { rowId, rowTitle } from '../core/jump'
import { makeAgent } from '../core/models'
import { AppStore } from '../core/store'
import { FakeBackend, eventually } from '../core/testing'
import { type SearchKey, SearchState } from './searchState'
import { WindowModel } from './windowModel'

const key = (name: string, mods: Partial<SearchKey> = {}): SearchKey => ({
  key: name,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...mods,
})

async function opened(setUp?: (backend: FakeBackend) => void) {
  const backend = new FakeBackend()
  backend.agents = [
    makeAgent({ id: 'simeon', name: 'Simeon', title: 'Chief of Staff' }),
    makeAgent({ id: 'theo', name: 'Theo', title: 'Bookkeeping' }),
    makeAgent({ id: 'iris', name: 'Iris' }),
    makeAgent({
      id: 'squad',
      name: 'Launch squad',
      isGroup: true,
      memberIds: ['simeon', 'theo'],
    }),
    makeAgent({ id: 'scout', name: 'Scout', isHidden: true }),
  ]
  backend.commandAnswers.isAgentNetworkEnabled = () => true
  backend.commandAnswers.getAgentChannels = () => ({
    manifests: [{ platform: 'discord', availability: 'available' }],
    connections: [],
  })
  backend.commandAnswers.searchMedia = (): JSONValue => [
    { agentId: 'theo', entryId: 'f1', fileName: 'deck.pdf', kind: 'pdf' },
  ]
  backend.commandAnswers.searchAgents = (): JSONValue => [
    {
      agentId: 'theo',
      entryId: 'm40',
      role: 'assistant',
      snippet: 'The runway is 14 months.',
    },
  ]
  backend.commandAnswers.listAllAutomations = (): JSONValue => [
    { agentId: 'theo', automation: { id: 'r1', name: 'Runway report' } },
  ]
  setUp?.(backend)
  const store = new AppStore()
  await store.attach(backend)
  const model = new WindowModel('theo')
  const state = new SearchState(
    store,
    model,
    () => model.selected,
    () => Promise.resolve(),
  )
  const stop = state.follow()
  model.openSearch()
  await eventually(() => state.routinesStatus === 'ready')
  await eventually(() => state.files.status !== 'loading')
  return { backend, store, model, state, stop }
}

describe('search opens and closes with the window', () => {
  it('reads its gates and the computer’s answers as it opens; its answers go as it closes', async () => {
    const { backend, model, state } = await opened()
    expect(state.isOpen).toBe(true)
    expect(state.orgChart).toBe(true)
    expect(state.hasChannels).toBe(true)
    expect(
      backend.commands
        .map((one) => one.method)
        .filter((method) =>
          [
            'isGlobalSearchEnabled',
            'isAgentNetworkEnabled',
            'getAgentChannels',
            'listAllAutomations',
            'searchMedia',
          ].includes(method),
        ),
    ).toEqual([
      'isGlobalSearchEnabled',
      'isAgentNetworkEnabled',
      'getAgentChannels',
      'listAllAutomations',
      'searchMedia',
    ])
    expect(state.files.results.map((hit) => hit.fileName)).toEqual(['deck.pdf'])
    model.closeSearch()
    expect(state.isOpen).toBe(false)
    expect(state.files.results).toEqual([])
    expect(state.routines).toEqual([])
    // What the gates said is kept for the next opening.
    expect(state.orgChart).toBe(true)
  })

  it('lists the agents (pins first, not the hidden) and the actions the window has screens for', async () => {
    const { store, state } = await opened()
    store.pinnedIds = ['iris']
    const rows = state.listing().rows.map(rowTitle)
    expect(rows).toEqual([
      'Iris',
      'Simeon',
      'Theo',
      'Launch squad',
      'Org Chart',
      'Open Hidden Agents',
      'Channels',
      'Chat Settings',
    ])
    expect(state.listing().tabs.length).toBe(8)
  })

  it('with the computer’s search off: four tabs, and nothing of it asked', async () => {
    const { backend, state } = await opened((one) => {
      one.commandAnswers.isGlobalSearchEnabled = () => false
    })
    expect(state.listing().tabs).toEqual(['all', 'agents', 'groups', 'actions'])
    expect(
      backend.commands.some((one) =>
        ['searchMedia', 'listAllAutomations', 'searchAgents'].includes(
          one.method,
        ),
      ),
    ).toBe(false)
    state.type('runway')
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(backend.commands.some((one) => one.method === 'searchAgents')).toBe(
      false,
    )
  })
})

describe('typing', () => {
  it('asks for the words; the computer’s matches follow the window’s', async () => {
    const { state } = await opened()
    state.highlight = 3
    state.type('runway')
    expect(state.highlight).toBe(0)
    expect(state.messages.status).toBe('loading')
    await eventually(() => state.messages.status === 'ready')
    // The words found here first, then the computer's own matches they missed.
    expect(state.listing().rows.map(rowId)).toEqual([
      'routine:theo:r1',
      'message:theo:m40',
      'file:theo:f1',
    ])
    expect(state.listing().settled).toBe('settled')
  })

  it('a refusal says the search is unavailable, keeping what the words find here', async () => {
    const { backend, state } = await opened()
    backend.refusedCommands.add('searchAgents')
    state.type('theo')
    await eventually(() => state.messages.status === 'failed')
    const listing = state.listing()
    expect(listing.settled).toBe('unavailable')
    expect(listing.rows.map(rowTitle)).toContain('Theo')
  })

  it('a hidden agent comes only for words, last', async () => {
    const { state } = await opened()
    state.type('sco')
    const rows = state.listing().rows
    expect(rows.map(rowId)).toEqual(['agent:scout'])
  })
})

describe('the keys', () => {
  it('↑ and ↓ stop at the ends; Tab and ← → go round the tabs', async () => {
    const { state } = await opened()
    const count = state.listing().rows.length
    expect(state.key(key('ArrowUp'))).toBe(true)
    expect(state.highlight).toBe(0)
    for (let n = 0; n < count + 3; n += 1) state.key(key('ArrowDown'))
    expect(state.highlight).toBe(count - 1)
    state.key(key('Tab'))
    expect(state.tab).toBe('messages')
    expect(state.highlight).toBe(0)
    state.key(key('Tab', { shiftKey: true }))
    state.key(key('ArrowLeft'))
    expect(state.tab).toBe('actions')
    state.key(key('ArrowRight'))
    expect(state.tab).toBe('all')
    // With words typed, ← and → are the field's.
    state.type('th')
    expect(state.key(key('ArrowLeft'))).toBe(false)
    // A letter is the field's; ⌘F (Control-F here) waits under search.
    expect(state.key(key('a'))).toBe(false)
    expect(state.key(key('f', { ctrlKey: true }))).toBe(true)
  })

  it('Return opens the lit row and closes search; Control-2 the second', async () => {
    const { model, state } = await opened()
    const [, second, third] = state.listing().rows
    state.key(key('ArrowDown'))
    state.key(key('Enter'))
    expect(second?.kind === 'agent' && model.selected).toBe(
      second?.kind === 'agent' && second.agent.id,
    )
    expect(state.isOpen).toBe(false)
    model.openSearch()
    expect(state.key(key('3', { ctrlKey: true }))).toBe(true)
    expect(third?.kind === 'agent' && model.selected).toBe(
      third?.kind === 'agent' && third.agent.id,
    )
    model.openSearch()
    state.key(key('Escape'))
    expect(model.searchOpen).toBe(false)
  })

  it('⌘ held shows the shortcuts, until it is let go', async () => {
    const { state } = await opened()
    state.hold(true)
    expect(state.modifierHeld).toBe(true)
    state.hold(false)
    expect(state.modifierHeld).toBe(false)
  })
})

describe('a row chosen', () => {
  it('a message opens its chat at the line; a routine its agent’s Routines; an action its page', async () => {
    const { model, state } = await opened()
    state.type('runway')
    await eventually(() => state.messages.status === 'ready')
    const rows = state.listing().rows
    state.activate(rows.find((row) => row.kind === 'message')!)
    expect(model.pendingReveal).toMatchObject({
      agentId: 'theo',
      entryId: 'm40',
    })
    expect(model.searchOpen).toBe(false)
    model.openSearch()
    await eventually(() => state.routinesStatus === 'ready')
    state.type('runway')
    state.activate(state.listing().rows.find((row) => row.kind === 'routine')!)
    expect(model.paneOpen).toBe(true)
    expect(model.section).toBe('routines')
    expect(model.routineRequest).toBe('r1')
    model.openSearch()
    state.type('channels')
    state.activate(state.listing().rows[0]!)
    expect(model.section).toBe('channels')
    model.openSearch()
    state.type('hidden')
    state.activate(state.listing().rows[0]!)
    expect(model.hiddenAgents).toBe(true)
  })
})
