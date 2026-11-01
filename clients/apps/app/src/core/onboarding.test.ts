// The first run (SimeonCore's `FirstRunTests`, `OnboardingTests` and the
// sleeping computer's): the words, the start-up gate, and the hand-off that
// makes Simeon once, only after the name is saved and read again, in the
// person's language.

import { describe, expect, it } from 'vitest'
import { simeonFaceId } from './faces'
import { GatewayError } from './gatewayConnection'
import { type JSONObject, type JSONValue, field } from './json'
import { makeAgent } from './models'
import {
  chiefOfStaff,
  handOffLine,
  nameTitle,
  normalizedName,
  suggestedName,
} from './onboarding'
import { AppStore } from './store'
import { FakeBackend, ms } from './testing'

describe('the first run’s words', () => {
  it('suggests a chosen name, then Google’s, never the mail', () => {
    expect(nameTitle()).toBe('What should we call you?')
    expect(
      suggestedName({ preferredName: ' Bass ', suggestedName: 'Bastian' }),
    ).toBe('Bass')
    expect(suggestedName({ preferredName: '', suggestedName: 'Bastian' })).toBe(
      'Bastian',
    )
    expect(suggestedName({ email: 'bxss.fall@example.com' })).toBeUndefined()
    expect(normalizedName('  Bass   Fall ')).toBe('Bass Fall')
    expect(normalizedName('x'.repeat(80))).toHaveLength(60)
  })

  it('makes Simeon in his own face', () => {
    expect(field(chiefOfStaff('n'), 'avatarShape')).toBe(simeonFaceId)
  })

  it('says how the hand-off goes', () => {
    expect(handOffLine(false, 42)).toBe('Setting up your Simeon… 42%')
    expect(handOffLine(false, undefined, true)).toBe('Waking your computer…')
    expect(handOffLine(true, 42)).toBe('Getting your team ready…')
    expect(handOffLine(false)).toBe('Setting up your Simeon…')
  })
})

/** A new account's computer: no agents; it keeps its settings, makes the agents it is asked for, and keeps the order of what it is told. */
function newComputer() {
  const backend = new FakeBackend()
  const settings: JSONObject = {}
  const trail: string[] = []
  backend.beforeAnswer = (method) => trail.push(method)
  backend.commandAnswers.getHostSettings = () => ({ ...settings })
  backend.commandAnswers.setHostSettings = (args) => {
    Object.assign(settings, args as JSONObject)
    return {}
  }
  backend.commandAnswers.createAgent = (args): JSONValue => {
    backend.agents = [
      ...backend.agents,
      makeAgent({ id: 'simeon', name: 'Simeon', title: 'Chief of Staff' }),
    ]
    made.push(args)
    return { agent: { id: 'simeon' } }
  }
  const made: JSONValue[] = []
  backend.serverAnswers['user/name'] = {}
  backend.serverAnswers['user/profile'] = { suggestedName: 'Bastian' }
  return { backend, settings, trail, made }
}

describe('the first run', () => {
  it('is for a new account only, and the host is told of one that has agents', async () => {
    const fresh = new AppStore()
    await fresh.attach(newComputer().backend)
    expect(await fresh.firstRun()).toBe('needed')

    const known = newComputer()
    known.backend.agents = [makeAgent({ id: 'theo', name: 'Theo' })]
    const store = new AppStore()
    await store.attach(known.backend)
    expect(await store.firstRun()).toBe('seen')
    expect(known.settings.hasSeenOnboarding).toBe(true)
  })

  it('makes no computer for a new account at launch, and reads a sleeping one’s copy first', async () => {
    const { backend } = newComputer()
    backend.rest = 'absent'
    const store = new AppStore()
    await store.attach(backend)
    expect(await store.firstRun()).toBe('needed')
    expect(backend.commands.some((one) => one.wakes)).toBe(false)

    // Asleep: its list rests (not a failure), and the server's copy has the agents.
    const asleep = newComputer().backend
    asleep.rest = 'asleep'
    asleep.listError = GatewayError.resting()
    asleep.serverAnswers['chats/agents'] = {
      agents: [{ id: 'theo', name: 'Theo' }],
    }
    const other = new AppStore()
    other.readsServerCopy = true
    await other.attach(asleep)
    expect(await other.firstRun()).toBe('seen')
    expect(other.agents.map((agent) => agent.id)).toEqual(['theo'])
    expect(asleep.commands.some((one) => one.wakes)).toBe(false)
  })

  it('makes Simeon once the name is saved and read again, in the person’s language', async () => {
    const { backend, settings, trail, made } = newComputer()
    const store = new AppStore()
    await store.attach(backend)
    expect(await store.namePrompt()).toBe('Bastian')
    let ready = 0
    let waited = 0
    const handOff = store.handOff(
      'web',
      () => (ready += 1),
      async (seconds) => {
        waited += seconds
      },
    )
    await ms(20)
    expect(trail).toContain('countAgents')
    expect(trail).not.toContain('createAgent')
    await store.finishNameStep('  Bass ')
    const id = await handOff
    expect(id).toBe('simeon')
    expect(ready).toBe(1)
    expect(waited).toBeGreaterThan(1.4)
    expect(
      backend.serverCalls.find((call) => call.path === 'user/name')?.body,
    ).toEqual({ name: 'Bass' })
    // The language told, the name read again, and only then Simeon made, then his introduction.
    const told = trail.indexOf('setHostSettings')
    const read = trail.indexOf('refreshUserName')
    const making = trail.indexOf('createAgent')
    expect(told).toBeGreaterThanOrEqual(0)
    expect(told).toBeLessThan(read)
    expect(read).toBeLessThan(making)
    expect(trail.indexOf('kickstartAgent')).toBeGreaterThan(making)
    expect(settings.hasSeenOnboarding).toBe(true)
    expect(String(field(made[0]!, 'clientNonce'))).toMatch(/^web-onboarding-/)
    expect(store.agent('simeon')?.name).toBe('Simeon')
    expect(await store.firstRun()).toBe('seen')

    // A second try, or another tab, on an account already onboarded: nothing more is made.
    const other = new AppStore()
    await other.attach(backend)
    await other.finishNameStep('Bass')
    expect(
      await other.handOff(
        'web',
        () => {},
        async () => {},
      ),
    ).toBeUndefined()
    expect(made).toHaveLength(1)
  })

  it('makes no Simeon when the account is left while the name screen shows', async () => {
    const { backend, trail } = newComputer()
    const store = new AppStore()
    await store.attach(backend)
    const handOff = store.handOff(
      'web',
      () => {},
      async () => {},
    )
    await ms(20)
    store.detach()
    await expect(handOff).rejects.toThrow()
    expect(trail).not.toContain('createAgent')
  })

  it('tries again after a failure without making a second Simeon', async () => {
    const { backend, made } = newComputer()
    const store = new AppStore()
    await store.attach(backend)
    await store.finishNameStep('Bass')
    backend.refusedCommands.add('kickstartAgent')
    await expect(
      store.handOff(
        'web',
        () => {},
        async () => {},
      ),
    ).rejects.toThrow()
    backend.refusedCommands.delete('kickstartAgent')
    expect(
      await store.handOff(
        'web',
        () => {},
        async () => {},
      ),
    ).toBe('simeon')
    expect(made).toHaveLength(1)
  })
})
