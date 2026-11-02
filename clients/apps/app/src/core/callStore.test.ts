// Step 5d's store against a stand-in computer and server (Store.swift's
// call: `canCall`, `startCall`, `mute`, `hangUp`, `dismissCall`, `take`):
// the call as the screens read it, its bars kept apart, a sign-out ending
// it (CallFlowTests.swift's `CallSignOutTests`), and the agent's voice from
// its picker (`testThePickerAndTheCallShowAndSpeakTheSameVoice`).

import { describe, expect, it } from 'vitest'
import { SimeonAPIError } from './api'
import { CallBanner } from './call'
import { field } from './json'
import { makeAgent } from './models'
import { StandInVoice } from './standInVoice'
import { AppStore } from './store'
import { FakeBackend, eventually, ms } from './testing'

async function attached(options: { voices?: boolean } = {}) {
  const backend = new FakeBackend()
  backend.agents = [
    makeAgent({ id: 'theo', name: 'Theo', title: 'Bookkeeping' }),
    makeAgent({
      id: 'team',
      name: 'Team',
      isGroup: true,
      memberIds: ['theo'],
    }),
  ]
  backend.serverAnswers['proxy/v1/voice/calls'] = {
    token: 'demo-token',
    conversation_id: 'conv_demo',
  }
  backend.serverAnswers['proxy/v1/voice/calls/conv_demo/end'] = {
    summary: 'Bass asked about the books.',
    transcript: [{ speaker: 'user', text: 'Hi Theo' }],
  }
  if (options.voices)
    backend.serverAnswers['proxy/v1/voice/voices'] = [
      { id: 'ljX1ZrXuDIIRVcmiVSyR', name: 'Michael', gender: 'male' },
      { id: 's3TPKV1kjDlVtZbl4Ksh', name: 'Adam', gender: 'male' },
    ]
  const records: unknown[] = []
  backend.commandAnswers.voiceCall = (args) => {
    if (field(args, 'kind') === 'ended') records.push(field(args, 'record'))
    return { ok: true }
  }
  const store = new AppStore()
  const voice = new StandInVoice({ asksMicrophone: false })
  store.callVoice = () => voice
  store.callTones = () => undefined
  store.callLog = () => {}
  store.account = { name: 'Bass', email: 'bass@example.com' }
  await store.attach(backend)
  return { backend, store, voice, records }
}

describe("the store's call", () => {
  it('calls while signed in, and shows the call as it goes', async () => {
    const { store, voice } = await attached()
    expect(new AppStore().canCall).toBe(false)
    expect(store.canCall).toBe(true)
    store.startCall(store.agent('theo')!)
    expect(store.call?.phase).toBe('ringing')
    expect(CallBanner.status(store.call!)).toBe('Calling…')
    await eventually(() => store.call?.phase === 'live')
    expect(store.call?.agentName).toBe('Theo')
    expect(voice.started?.prompt).toContain("one of Bass's Simeon agents")
    store.mute(true)
    expect(store.call?.isMuted).toBe(true)
    await ms(10)
    expect(voice.muted).toBe(true)
    store.hangUp()
    expect(store.call?.phase).toBe('ended')
    // An ended call leaves after 1.2 s.
    await ms(1_400)
    expect(store.call).toBeUndefined()
  })

  it('keeps the waveform apart: its bars change nothing the screens redraw for', async () => {
    const { store, voice } = await attached()
    store.startCall(store.agent('theo')!)
    await eventually(() => store.call?.phase === 'live')
    await ms(200)
    let changes = 0
    const stop = store.subscribe(() => (changes += 1))
    await ms(400)
    expect(changes).toBe(0)
    expect(store.callLevels).toHaveLength(24)
    expect(store.call?.levels).toEqual([1])
    voice.emit({ kind: 'agentSpeaking', on: true })
    expect(changes).toBe(1)
    stop()
    store.hangUp()
  })

  it("says the server's refusals and is put away by Close", async () => {
    const { backend, store } = await attached()
    const server = backend.server.bind(backend)
    backend.server = async (path, method, body) => {
      if (path === 'proxy/v1/voice/calls')
        throw new SimeonAPIError('Voice calls are not configured.', 503)
      return server(path, method, body)
    }
    store.startCall(store.agent('theo')!)
    await eventually(() => store.call?.failed === true)
    expect(CallBanner.status(store.call!)).toBe("Calls aren't switched on yet")
    // A failed call waits to be closed, on the Mac.
    await ms(100)
    expect(store.call?.failed).toBe(true)
    store.dismissCall()
    expect(store.call).toBeUndefined()
  })

  it('ends a call on at sign-out, and nothing of it comes back (CallSignOutTests)', async () => {
    const { store, voice, records } = await attached()
    store.startCall(store.agent('theo')!)
    await eventually(() => store.call?.phase === 'live')
    store.detach()
    expect(store.call).toBeUndefined()
    await ms(50)
    // Its voice let go and its record sent.
    expect(voice.ended).toBe(true)
    expect(records).toHaveLength(1)
    await ms(200)
    expect(store.call).toBeUndefined()
  })

  it('speaks with the voice its picker shows', async () => {
    const { store, voice } = await attached({ voices: true })
    const theo = await store.ensureVoice('theo')
    expect(theo).toBeDefined()
    store.startCall(store.agent('theo')!)
    await eventually(() => voice.started != null)
    expect(voice.started?.voiceId).toBe(theo)
    store.hangUp()
  })
})
