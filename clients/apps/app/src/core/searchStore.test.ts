// Step 4d's store commands against a stand-in computer: search's reads
// (SimeonCore's `SearchTests.testTheHostsAnswers`,
// `testAFoundLineFarBackIsLoaded`), a group's members
// (StoreAgents.swift's `setGroupMembers`) and the channel calls
// (NetworkTests.swift's `ChannelCallTests`).

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { JSONValue } from './json'
import { makeAgent } from './models'
import { rowIdFor } from './search'
import { AppStore } from './store'
import { FakeBackend } from './testing'

async function attached(setUp?: (backend: FakeBackend) => void) {
  const backend = new FakeBackend()
  backend.agents = [
    makeAgent({ id: 'simeon', name: 'Simeon' }),
    makeAgent({ id: 'theo', name: 'Theo' }),
    makeAgent({ id: 'iris', name: 'Iris' }),
    makeAgent({
      id: 'squad',
      name: 'Launch',
      isGroup: true,
      memberIds: ['simeon', 'theo', 'gone'],
    }),
  ]
  setUp?.(backend)
  const store = new AppStore()
  await store.attach(backend)
  return { backend, store }
}

const sentOf = (backend: FakeBackend, method: string) =>
  backend.commands.filter((one) => one.method === method).map((one) => one.args)

afterEach(() => {
  vi.useRealTimers()
})

describe('search’s reads', () => {
  it('the computer’s search is on unless it says it is off', async () => {
    const { backend, store } = await attached()
    expect(await store.globalSearchEnabled()).toBe(true)
    backend.commandAnswers.isGlobalSearchEnabled = () => false
    expect(await store.globalSearchEnabled()).toBe(false)
    backend.commandAnswers.isGlobalSearchEnabled = () => ({ enabled: false })
    expect(await store.globalSearchEnabled()).toBe(false)
    backend.refusedCommands.add('isGlobalSearchEnabled')
    expect(await store.globalSearchEnabled()).toBe(true)
  })

  it('messages and files for the words; a refusal is thrown', async () => {
    const { backend, store } = await attached((one) => {
      one.commandAnswers.searchAgents = (): JSONValue => [
        {
          agentId: 'simeon',
          entryId: 'm1',
          role: 'assistant',
          snippet: 'The launch is Thursday.',
          timestampMs: 5,
        },
        { snippet: 'no chat' },
      ]
      one.commandAnswers.searchMedia = () => [
        { agentId: 'theo', entryId: 'f1', fileName: 'deck.pdf', kind: 'pdf' },
      ]
    })
    const messages = await store.searchMessages('launch')
    expect(messages.map((hit) => hit.snippet)).toEqual([
      'The launch is Thursday.',
    ])
    const files = await store.searchFiles('')
    expect(files.map((hit) => hit.fileName)).toEqual(['deck.pdf'])
    expect(sentOf(backend, 'searchAgents')).toEqual([{ query: 'launch' }])
    expect(sentOf(backend, 'searchMedia')).toEqual([{ query: '' }])
    backend.refusedCommands.add('searchAgents')
    await expect(store.searchMessages('launch')).rejects.toThrow()
  })

  it('every agent’s routines; none when they can’t be read', async () => {
    const { backend, store } = await attached((one) => {
      one.commandAnswers.listAllAutomations = (): JSONValue => [
        {
          agentId: 'simeon',
          automation: { id: 'r1', name: 'Monday launch check' },
        },
        { agentId: 'simeon' },
      ]
    })
    const routines = await store.allRoutines()
    expect(routines.map((hit) => hit.routine.name)).toEqual([
      'Monday launch check',
    ])
    expect(routines[0]?.agentId).toBe('simeon')
    backend.refusedCommands.add('listAllAutomations')
    expect(await store.allRoutines()).toEqual([])
  })

  it('a found line far back is read in, page by page', async () => {
    const { backend, store } = await attached((one) => {
      one.lines = Array.from({ length: 1200 }, (_, n) => ({
        kind: 'message',
        id: `m${n}`,
        role: 'assistant',
        content: `Line ${n}`,
        timestampMs: n * 1000,
      }))
    })
    await store.open('theo')
    expect(store.transcripts.theo?.some((entry) => entry.id === 'm100')).toBe(
      false,
    )
    expect(await store.loadUntil('m100', 'theo')).toBe(true)
    expect(rowIdFor('m100', store.rows('theo'))).toBe('m100')
    // A line that isn't there: every page read, then no.
    expect(await store.loadUntil('nowhere', 'theo')).toBe(false)
    expect(backend.opened).toEqual(['theo'])
  })

  it('a page the chat is already reading is waited for, not counted', async () => {
    const { store } = await attached((one) => {
      one.lines = Array.from({ length: 1200 }, (_, n) => ({
        kind: 'message',
        id: `m${n}`,
        role: 'assistant',
        content: `Line ${n}`,
        timestampMs: n * 1000,
      }))
    })
    await store.open('theo')
    // The chat's own scroll near its top asks for the page before.
    const reading = store.loadOlder('theo')
    expect(await store.loadUntil('m100', 'theo')).toBe(true)
    await reading
  })

  it('waits for the chat’s first lines, and stops when signed out', async () => {
    const { store } = await attached()
    const waiting = store.loadUntil('u1', 'iris')
    await store.open('iris')
    expect(await waiting).toBe(true)
    const signedOut = store.loadUntil('u1', 'nobody')
    store.detach()
    expect(await signedOut).toBe(false)
  })
})

describe('a group’s members', () => {
  it('shown at once and sent', async () => {
    const { backend, store } = await attached()
    expect(store.members(store.agent('squad')!).map((one) => one.id)).toEqual([
      'simeon',
      'theo',
    ])
    await store.setGroupMembers('squad', ['simeon', 'theo', 'iris'])
    expect(store.agent('squad')?.memberIds).toEqual(['simeon', 'theo', 'iris'])
    expect(sentOf(backend, 'setGroupMembers')).toEqual([
      { id: 'squad', memberAgentIds: ['simeon', 'theo', 'iris'] },
    ])
  })

  it('a refusal puts the members back and is thrown, for the dialog to say', async () => {
    const { backend, store } = await attached()
    backend.refusedCommands.add('setGroupMembers')
    let shown: string[] | undefined
    backend.beforeAnswer = (method) => {
      if (method === 'setGroupMembers') shown = store.agent('squad')?.memberIds
    }
    await expect(store.setGroupMembers('squad', ['theo'])).rejects.toThrow()
    expect(shown).toEqual(['theo'])
    expect(store.agent('squad')?.memberIds).toEqual(['simeon', 'theo', 'gone'])
    expect(store.problem).toBeUndefined()
  })
})

describe('the channel calls', () => {
  const view = {
    manifests: [
      {
        platform: 'discord',
        displayName: 'Discord',
        blurb:
          'Message in Discord servers and DMs through a bot the user owns.',
        credentialLabel: 'bot token',
        availability: 'available',
      },
      {
        platform: 'slack',
        displayName: 'Slack',
        blurb:
          'Message in Slack channels and DMs through a Socket Mode app the user owns.',
        credentialLabel: 'app token and bot token',
        availability: 'available',
      },
    ],
    connections: [],
  }

  it('each answers the whole view', async () => {
    const { backend, store } = await attached((one) => {
      for (const method of [
        'getAgentChannels',
        'connectChannel',
        'refreshChannel',
        'disconnectChannel',
      ])
        one.commandAnswers[method] = () => view
    })
    expect((await store.channels('simeon'))?.manifests.length).toBe(2)
    await store.connectChannel('simeon', 'discord', 'abc')
    await store.refreshChannel('simeon', 'discord')
    const after = await store.disconnectChannel('simeon', 'discord')
    expect(after?.manifests.length).toBe(2)
    const calls = backend.commands.filter(
      (one) =>
        one.method.endsWith('Channel') || one.method === 'getAgentChannels',
    )
    expect(calls.map((one) => one.method)).toEqual([
      'getAgentChannels',
      'connectChannel',
      'refreshChannel',
      'disconnectChannel',
    ])
    expect(calls[1]?.args).toEqual({
      id: 'simeon',
      platform: 'discord',
      token: 'abc',
    })
    expect(calls[3]?.args).toEqual({ id: 'simeon', platform: 'discord' })
  })

  it('the page’s repeated reads let a resting computer rest; its opening and a change wake it', async () => {
    const { backend, store } = await attached((one) => {
      for (const method of ['getAgentChannels', 'connectChannel'])
        one.commandAnswers[method] = () => view
    })
    expect((await store.channels('simeon', false))?.manifests.length).toBe(2)
    await store.channels('simeon')
    await store.connectChannel('simeon', 'discord', 'abc')
    const calls = backend.commands.filter(
      (one) =>
        one.method === 'getAgentChannels' || one.method === 'connectChannel',
    )
    expect(calls.map((one) => [one.method, one.wakes])).toEqual([
      ['getAgentChannels', false],
      ['getAgentChannels', true],
      ['connectChannel', true],
    ])
  })

  it('a refusal, or no answer in 15 s, is nothing', async () => {
    const { backend, store } = await attached()
    backend.refusedCommands.add('connectChannel')
    expect(await store.connectChannel('simeon', 'slack', 'x')).toBeUndefined()
    expect(await store.channels('simeon')).toBeUndefined()
    vi.useFakeTimers()
    backend.commandAnswers.getAgentChannels = () =>
      new Promise(() => {}) as unknown as JSONValue
    const asked = store.channels('simeon')
    await vi.advanceTimersByTimeAsync(14_999)
    let settled = false
    void asked.then(() => (settled = true))
    await vi.advanceTimersByTimeAsync(0)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(await asked).toBeUndefined()
  })
})
