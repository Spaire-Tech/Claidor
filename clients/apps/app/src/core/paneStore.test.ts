// Step 4's pane against a stand-in computer (StoreAgents.swift's
// `saveProfileField`, Store.swift's `setNotify`, Jump.swift's gates): a
// profile field shown at once and sent as the pane sends it, a refusal
// putting the roster back; Notifications; whether the org chart and the
// channels are offered, waiting for a resting computer or waking it.

import { describe, expect, it } from 'vitest'
import { makeAgent } from './models'
import { AppStore } from './store'
import { FakeBackend } from './testing'

async function attached() {
  const backend = new FakeBackend()
  backend.agents = [
    makeAgent({
      id: 'iris',
      name: 'Iris',
      title: 'Travel',
      description: 'Books trips.',
    }),
  ]
  const store = new AppStore()
  await store.attach(backend)
  return { backend, store }
}

const sentOf = (backend: FakeBackend, method: string) =>
  backend.commands.filter((one) => one.method === method).map((one) => one.args)

describe('the agent’s Profile', () => {
  it('sends the name and description always, the title only when it is the field changed', async () => {
    const { backend, store } = await attached()
    await store.saveProfileField('iris', 'Iris B', 'Books trips.')
    await store.saveProfileField('iris', 'Iris B', 'Books trips.', 'Trips')
    expect(sentOf(backend, 'updateAgent')).toEqual([
      { id: 'iris', profile: { name: 'Iris B', description: 'Books trips.' } },
      {
        id: 'iris',
        profile: {
          name: 'Iris B',
          description: 'Books trips.',
          title: 'Trips',
        },
      },
    ])
    expect(store.agent('iris')?.name).toBe('Iris B')
    expect(store.agent('iris')?.title).toBe('Trips')
  })

  it('a refused field puts the roster back, saying nothing', async () => {
    const { backend, store } = await attached()
    backend.refusedCommands.add('updateAgent')
    await store.saveProfileField('iris', 'Ada', 'Books trips.')
    expect(store.agent('iris')?.name).toBe('Iris')
    expect(store.problem).toBeUndefined()
  })

  it('renaming in the row sends the name with the description as it is', async () => {
    const { backend, store } = await attached()
    await store.renameAgent('iris', 'Nora')
    expect(sentOf(backend, 'updateAgent')).toEqual([
      { id: 'iris', profile: { name: 'Nora', description: 'Books trips.' } },
    ])
  })

  it('turns notifications off at once, and says so when the computer refuses', async () => {
    const { backend, store } = await attached()
    await store.setNotify('iris', false)
    expect(store.agent('iris')?.notifyOnUpdates).toBe(false)
    expect(sentOf(backend, 'setAgentNotifyOnUpdates')).toEqual([
      { id: 'iris', isEnabled: false },
    ])
    backend.refusedCommands.add('setAgentNotifyOnUpdates')
    await store.setNotify('iris', true)
    expect(store.problem).toBe(
      "Couldn't change notifications: The computer didn't answer.",
    )
  })
})

describe('the gates "/" and ⌘K share', () => {
  it('the org chart is offered while the agent network is on', async () => {
    const { backend, store } = await attached()
    expect(await store.agentNetworkEnabled()).toBe(false)
    backend.commandAnswers.isAgentNetworkEnabled = () => true
    expect(await store.agentNetworkEnabled()).toBe(true)
    backend.commandAnswers.isAgentNetworkEnabled = () => ({ enabled: true })
    expect(await store.agentNetworkEnabled(false)).toBe(true)
    // Read without waking a resting computer.
    expect(
      backend.commands
        .filter((one) => one.method === 'isAgentNetworkEnabled')
        .map((one) => one.wakes),
    ).toEqual([true, true, false])
  })

  it('channels are offered when a platform is available or one is connected', async () => {
    const { backend, store } = await attached()
    backend.commandAnswers.getAgentChannels = () => ({
      manifests: [{ platform: 'discord', availability: 'unavailable' }],
      connections: [],
    })
    expect(await store.channelsAvailable('iris')).toBe(false)
    backend.commandAnswers.getAgentChannels = () => ({
      manifests: [{ platform: 'slack', availability: 'available' }],
    })
    expect(await store.channelsAvailable('iris')).toBe(true)
    backend.commandAnswers.getAgentChannels = () => ({
      manifests: [],
      connections: [{ platform: 'discord' }],
    })
    expect(await store.channelsAvailable('iris')).toBe(true)
    backend.refusedCommands.add('getAgentChannels')
    expect(await store.channelsAvailable('iris')).toBe(false)
    expect(sentOf(backend, 'getAgentChannels').at(0)).toEqual({ id: 'iris' })
  })
})
