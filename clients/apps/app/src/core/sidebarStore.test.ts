// The row menu's and the sections' commands, as the Mac's sidebar sends them
// (SimeonCore's `testTheListDoesWhatTheMacsMenuDoes`): pins and sections
// shared through the computer's settings, read, hide, duplicate, delete,
// rename; and the settings read again when another device changes them.

import { describe, expect, it } from 'vitest'
import type { JSONObject, JSONValue } from './json'
import { makeAgent } from './models'
import { AppStore } from './store'
import { FakeBackend, ms } from './testing'

/** A stand-in computer whose settings `setHostSettings` writes and `getHostSettings` reads. */
function computer() {
  const backend = new FakeBackend()
  backend.agents = ['theo', 'iris', 'scout', 'nova'].map((id) =>
    makeAgent({ id, name: id[0]!.toUpperCase() + id.slice(1) }),
  )
  const settings: JSONObject = {}
  backend.commandAnswers.getHostSettings = () => ({ ...settings })
  backend.commandAnswers.setHostSettings = (args) => {
    Object.assign(settings, args as JSONObject)
    return {}
  }
  backend.commandAnswers.duplicateAgent = (): JSONValue => ({
    agent: { id: 'theo-copy' },
  })
  return { backend, settings }
}

describe('the sidebar’s commands', () => {
  it('pins, moves a pin and unpins, written to the computer', async () => {
    const { backend, settings } = computer()
    const store = new AppStore()
    await store.attach(backend)
    expect(store.pinned).toEqual([])
    await store.setPinned('theo', true)
    await store.setPinned('iris', true)
    expect(store.pinned.map((agent) => agent.id)).toEqual(['theo', 'iris'])
    expect(settings.pinnedAgentIds).toEqual(['theo', 'iris'])
    await store.movePin('iris', 0)
    expect(store.pinnedIds).toEqual(['iris', 'theo'])
    await store.setPinned('theo', false)
    expect(store.pinnedIds).toEqual(['iris'])
    expect(settings.pinnedAgentIds).toEqual(['iris'])
    // Read without waking a computer that rests.
    expect(
      backend.commands.find((one) => one.method === 'getHostSettings')?.wakes,
    ).toBe(false)
  })

  it('marks read and unread, hides and shows, duplicates and renames', async () => {
    const { backend } = computer()
    const store = new AppStore()
    await store.attach(backend)
    await store.setUnread('scout', true)
    expect(store.agent('scout')?.hasUnread).toBe(true)
    expect(store.agent('scout')?.unreadCount).toBe(1)
    await store.setHidden('nova', true)
    expect(store.hiddenAgents.map((agent) => agent.id)).toEqual(['nova'])
    expect(await store.duplicate('theo')).toBe('theo-copy')
    await store.renameAgent('iris', 'Iris B')
    expect(store.agent('iris')?.name).toBe('Iris B')
    const sent = (method: string) =>
      backend.commands
        .filter((one) => one.method === method)
        .map((one) => one.args)
    expect(sent('setAgentUnread')[0]).toMatchObject({
      id: 'scout',
      isUnread: true,
    })
    expect(sent('setAgentHiddenFromSidebar')).toEqual([
      { id: 'nova', isHidden: true },
    ])
    expect(sent('updateAgent')).toEqual([
      { id: 'iris', profile: { name: 'Iris B', description: '' } },
    ])
  })

  it('deletes, and says so when the computer refuses', async () => {
    const { backend } = computer()
    const store = new AppStore()
    await store.attach(backend)
    await store.setPinned('scout', true)
    expect(await store.deleteAgents(['scout', 'nova'])).toBe(true)
    expect(store.agents.map((agent) => agent.id)).toEqual(['theo', 'iris'])
    expect(store.pinnedIds).toEqual([])
    backend.refusedCommands.add('deleteAgents')
    expect(await store.deleteAgents(['theo'])).toBe(false)
    expect(store.problem).toBe(
      'Deleting failed. Check your connection and try again.',
    )
    expect(store.agent('theo')).toBeDefined()
  })

  it('makes, moves and renames sections, written whole', async () => {
    const { backend, settings } = computer()
    const store = new AppStore()
    await store.attach(backend)
    // None made yet: an empty list, and a section can be made.
    expect(store.sidebarSections).toEqual([])
    const id = store.createSection(['theo', 'iris'])!
    expect(id.startsWith('section-')).toBe(true)
    expect(store.sidebarSections?.map((one) => one.name)).toEqual([
      'New section',
      'Unassigned',
    ])
    await ms(5)
    expect(settings.sidebarSections).toEqual([
      { id, name: 'New section', agentIds: ['theo', 'iris'] },
      { id: '__agents__', name: 'Unassigned', agentIds: [] },
    ])
  })

  it('reads the pins and sections again when another device changes them', async () => {
    const { backend, settings } = computer()
    const store = new AppStore()
    await store.attach(backend)
    settings.pinnedAgentIds = ['nova']
    settings.sidebarSections = [{ id: 'w', name: 'Work', agentIds: ['theo'] }]
    store.apply({ kind: 'settingsChanged', fields: ['pinnedAgentIds'] })
    await ms(5)
    expect(store.pinnedIds).toEqual(['nova'])
    expect(store.sidebarSections).toEqual([])
    store.apply({ kind: 'settingsChanged', fields: ['sidebarSections'] })
    await ms(5)
    expect(store.sidebarSections?.map((one) => one.id)).toEqual([
      'w',
      '__agents__',
    ])
  })

  it('puts the pins back when the computer refuses a pin', async () => {
    const { backend } = computer()
    const store = new AppStore()
    await store.attach(backend)
    backend.refusedCommands.add('setHostSettings')
    await store.setPinned('theo', true)
    expect(store.pinnedIds).toEqual([])
    expect(store.problem?.startsWith("Couldn't pin it")).toBe(true)
  })
})
