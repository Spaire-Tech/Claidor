// The store's word on the agents for the Windows app's notifications and
// taskbar (Store.swift's `rosterNews`): the list read at a connect, each
// whole roster and each agent's update, as the computer says them, held
// rebuild or not; and View › Reload (MacSession.swift's `reload`).

import { describe, expect, it } from 'vitest'
import type { RosterNews } from './agentNotifications'
import { makeAgent } from './models'
import { AppStore } from './store'
import { FakeBackend } from './testing'

describe('the roster’s news (Store.swift’s `rosterNews`)', () => {
  it('tells the list read at a connect, each roster and each update, as the computer says them', async () => {
    const backend = new FakeBackend()
    backend.agents = [makeAgent({ id: 'iris', name: 'Iris' })]
    const store = new AppStore()
    const heard: RosterNews[] = []
    store.rosterNews = (news) => heard.push(news)
    await store.attach(backend)
    const theo = makeAgent({ id: 'theo', name: 'Theo', hasUnread: true })
    backend.push({ kind: 'agents', agents: [theo] })
    backend.push({ kind: 'agentUpserted', agent: theo })
    expect(heard.map((news) => news.kind)).toEqual(['seed', 'roster', 'update'])
    expect(heard[0]).toEqual({ kind: 'seed', agents: backend.agents })
    // The same row again changes nothing on screen, and is still told (the decider and the badge keep their own).
    expect(heard[2]).toEqual({ kind: 'update', agent: theo })
  })

  it('reads everything again on Reload, the account kept', async () => {
    const backend = new FakeBackend()
    backend.agents = [makeAgent({ id: 'iris', name: 'Iris' })]
    const store = new AppStore()
    const heard: string[] = []
    store.rosterNews = (news) => heard.push(news.kind)
    await store.attach(backend)
    store.account = { name: 'Sam', email: 'sam@example.com' }
    backend.agents = [
      makeAgent({ id: 'iris', name: 'Iris' }),
      makeAgent({ id: 'theo', name: 'Theo' }),
    ]
    await store.reloadFromComputer()
    expect(heard).toEqual(['seed', 'seed'])
    expect(store.agents.map((agent) => agent.id).sort()).toEqual([
      'iris',
      'theo',
    ])
    expect(store.account?.email).toBe('sam@example.com')
  })
})
