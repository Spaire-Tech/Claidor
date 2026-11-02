// Step 4c's store commands against a stand-in computer (the core's
// StoreAgents.swift routines, Store.swift's `.automations`): an agent's
// list read, kept only when it changed; a routine made, changed, paused
// (shown at once, put back when refused), deleted and run; the host's
// pushes; nothing said when a command is refused; signed out or deleted,
// the lists go.

import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { makeAgent } from './models'
import { automationHost } from './routineTesting'
import { AppStore } from './store'
import { FakeBackend } from './testing'
import { type Table, setWords } from './words'

// The keyed sentences ("schedule.daysAt") read their English from the core's table.
beforeEach(() =>
  setWords(
    'en',
    {},
    {
      core: JSON.parse(
        readFileSync(new URL('../words/core/en.json', import.meta.url), 'utf8'),
      ) as Table,
    },
  ),
)
afterEach(() => setWords('en', {}))

async function attached() {
  const backend = new FakeBackend()
  backend.agents = [
    makeAgent({ id: 'theo', name: 'Theo' }),
    makeAgent({ id: 'iris', name: 'Iris' }),
  ]
  automationHost(backend, [
    {
      name: 'Monday launch check',
      prompt: 'Check the launch.',
      trigger: { type: 'cron', schedule: '0 9 * * 1' },
    },
  ])
  const store = new AppStore()
  await store.attach(backend)
  return { backend, store }
}

const sentOf = (backend: FakeBackend, method: string) =>
  backend.commands.filter((one) => one.method === method).map((one) => one.args)

describe('an agent’s routines in the store', () => {
  it('reads the list, and keeps it only when it changed', async () => {
    const { backend, store } = await attached()
    expect(store.routinesByAgent.theo).toBeUndefined()
    expect(await store.loadRoutines('theo')).toBe(true)
    expect(sentOf(backend, 'getAgentAutomations')).toEqual([{ id: 'theo' }])
    const list = store.routinesByAgent.theo
    expect(list?.map((one) => one.name)).toEqual(['Monday launch check'])
    expect(list?.[0]?.summary).toBe('Every Monday at 9:00 AM')
    await store.loadRoutines('theo')
    expect(store.routinesByAgent.theo).toBe(list)
  })

  it('a list that can’t be read leaves nothing, and says nothing', async () => {
    const { backend, store } = await attached()
    backend.refusedCommands.add('getAgentAutomations')
    expect(await store.loadRoutines('theo')).toBe(false)
    expect(store.routinesByAgent.theo).toBeUndefined()
    expect(store.problem).toBeUndefined()
  })

  it('makes a routine and gives back the record it made', async () => {
    const { backend, store } = await attached()
    await store.loadRoutines('theo')
    const spec = {
      name: 'Morning brief',
      prompt: 'Brief me.',
      trigger: { type: 'cron', schedule: '0 8 * * 1-5' },
      isEnabled: true,
    }
    const made = await store.createRoutine('theo', spec)
    expect(sentOf(backend, 'createAgentAutomation')).toEqual([
      { id: 'theo', spec },
    ])
    expect(made?.name).toBe('Morning brief')
    expect(store.routinesByAgent.theo?.map((one) => one.name)).toEqual([
      'Monday launch check',
      'Morning brief',
    ])
    backend.refusedCommands.add('createAgentAutomation')
    expect(await store.createRoutine('theo', spec)).toBeUndefined()
    expect(store.routinesByAgent.theo).toHaveLength(2)
    expect(store.problem).toBeUndefined()
  })

  it('changes a routine; a refusal is false', async () => {
    const { backend, store } = await attached()
    await store.loadRoutines('theo')
    const id = store.routinesByAgent.theo![0]!.id
    const spec = {
      name: 'Tuesday check',
      prompt: 'Check the launch.',
      trigger: { type: 'cron', schedule: '0 9 * * 2' },
      isEnabled: true,
    }
    expect(await store.updateRoutine('theo', id, spec)).toBe(true)
    expect(sentOf(backend, 'updateAgentAutomation')).toEqual([
      { id: 'theo', automationId: id, spec },
    ])
    expect(store.routinesByAgent.theo![0]!.name).toBe('Tuesday check')
    backend.refusedCommands.add('updateAgentAutomation')
    expect(await store.updateRoutine('theo', id, spec)).toBe(false)
  })

  it('pauses a routine at once, and puts it back when refused', async () => {
    const { backend, store } = await attached()
    await store.loadRoutines('theo')
    const id = store.routinesByAgent.theo![0]!.id
    let shown: boolean | undefined
    backend.beforeAnswer = (method) => {
      if (method === 'setAgentAutomationEnabled')
        shown = store.routinesByAgent.theo![0]!.isEnabled
    }
    expect(await store.enableRoutine('theo', id, false)).toBe(true)
    expect(shown).toBe(false)
    expect(sentOf(backend, 'setAgentAutomationEnabled')).toEqual([
      { id: 'theo', automationId: id, isEnabled: false },
    ])
    expect(store.routinesByAgent.theo![0]!.isEnabled).toBe(false)
    backend.refusedCommands.add('setAgentAutomationEnabled')
    expect(await store.enableRoutine('theo', id, true)).toBe(false)
    expect(shown).toBe(true)
    expect(store.routinesByAgent.theo![0]!.isEnabled).toBe(false)
    expect(store.problem).toBeUndefined()
  })

  it('deletes a routine with no question; a refusal says nothing', async () => {
    const { backend, store } = await attached()
    await store.loadRoutines('theo')
    const id = store.routinesByAgent.theo![0]!.id
    backend.refusedCommands.add('deleteAgentAutomation')
    await store.removeRoutine('theo', id)
    expect(store.routinesByAgent.theo).toHaveLength(1)
    expect(store.problem).toBeUndefined()
    backend.refusedCommands.delete('deleteAgentAutomation')
    await store.removeRoutine('theo', id)
    expect(sentOf(backend, 'deleteAgentAutomation')).toEqual([
      { id: 'theo', automationId: id },
      { id: 'theo', automationId: id },
    ])
    expect(store.routinesByAgent.theo).toEqual([])
  })

  it('runs a routine, then reads the list for its run; a refused run reads nothing', async () => {
    const { backend, store } = await attached()
    await store.loadRoutines('theo')
    const id = store.routinesByAgent.theo![0]!.id
    expect(await store.testRoutine('theo', id)).toBe(true)
    expect(backend.commands.map((one) => one.method).slice(-2)).toEqual([
      'runAgentAutomationNow',
      'getAgentAutomations',
    ])
    expect(store.routinesByAgent.theo![0]!.runs[0]?.trigger).toBe('manual')
    backend.refusedCommands.add('runAgentAutomationNow')
    const reads = sentOf(backend, 'getAgentAutomations').length
    expect(await store.testRoutine('theo', id)).toBe(false)
    expect(sentOf(backend, 'getAgentAutomations')).toHaveLength(reads)
  })

  it('takes the host’s pushes (`agents-automation`)', async () => {
    const { backend, store } = await attached()
    backend.push({
      kind: 'automations',
      agentId: 'iris',
      automations: [
        {
          id: 'r9',
          name: 'Inbox sweep',
          prompt: 'Sweep.',
          trigger: { type: 'cron', schedule: '*/30 * * * *' },
          triggerDescription: 'Every 30 minutes',
          isEnabled: false,
        },
      ],
    })
    const list = store.routinesByAgent.iris
    expect(list?.map((one) => [one.name, one.isEnabled])).toEqual([
      ['Inbox sweep', false],
    ])
    backend.push({
      kind: 'automations',
      agentId: 'iris',
      automations: [
        {
          id: 'r9',
          name: 'Inbox sweep',
          prompt: 'Sweep.',
          trigger: { schedule: '*/30 * * * *', type: 'cron' },
          triggerDescription: 'Every 30 minutes',
          isEnabled: false,
        },
      ],
    })
    expect(store.routinesByAgent.iris).toBe(list)
  })

  it('forgets the lists when signed out, and an agent’s when it is deleted', async () => {
    const { store } = await attached()
    await store.loadRoutines('theo')
    await store.loadRoutines('iris')
    expect(await store.deleteAgents(['iris'])).toBe(true)
    expect(store.routinesByAgent.iris).toBeUndefined()
    expect(store.routinesByAgent.theo).toHaveLength(1)
    store.detach()
    expect(store.routinesByAgent).toEqual({})
  })
})
