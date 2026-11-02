// The store's word on the agents for the Windows app's notifications and
// taskbar (Store.swift's `rosterNews`): the list read at a connect, each
// whole roster and each agent's update, as the computer says them, held
// rebuild or not; and View › Reload (MacSession.swift's `reload`).

import { describe, expect, it } from 'vitest'
import type { RosterNews } from './agentNotifications'
import { makeAgent } from './models'
import { StandInVoice } from './standInVoice'
import { AppStore } from './store'
import { FakeBackend, eventually } from './testing'

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

describe('View › Reload keeps what the Mac’s keeps (Store.swift’s `detach(endingCall:)`)', () => {
  async function onACall() {
    const backend = new FakeBackend()
    backend.agents = [makeAgent({ id: 'theo', name: 'Theo' })]
    backend.serverAnswers['proxy/v1/voice/calls'] = {
      token: 'demo-token',
      conversation_id: 'conv_demo',
    }
    const store = new AppStore()
    const voice = new StandInVoice({ asksMicrophone: false })
    store.callVoice = () => voice
    store.callTones = () => undefined
    store.callLog = () => {}
    await store.attach(backend)
    store.startCall(store.agent('theo')!)
    await eventually(() => store.call?.phase === 'live')
    store.setDraft('Book the 9:40 and', 'theo')
    return { backend, store, voice }
  }

  it('keeps a call that is on and what was typed', async () => {
    const { store, voice } = await onACall()
    await store.reloadFromComputer()
    expect(store.call?.phase).toBe('live')
    expect(voice.ended).toBe(false)
    expect(store.drafts.theo).toBe('Book the 9:40 and')
    // The call still answers: it is this computer's.
    store.mute(true)
    expect(store.call?.isMuted).toBe(true)
  })

  it('ends both on signing out, and for another computer', async () => {
    const { store, voice } = await onACall()
    store.detach()
    expect(store.call).toBeUndefined()
    expect(voice.ended).toBe(true)
    expect(store.drafts).toEqual({})
    const next = await onACall()
    await next.store.attach(new FakeBackend())
    expect(next.store.call).toBeUndefined()
    expect(next.voice.ended).toBe(true)
    expect(next.store.drafts).toEqual({})
  })
})
