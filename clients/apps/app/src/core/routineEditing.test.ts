// The routine editor's rules as the Mac's pane keeps them (the core's
// RoutineEditingTests.swift: `RoutineEditing`, the Mac's
// `RoutineEditorModel`), against a stand-in host answering as the demo's
// does (Demo.swift's `routineCommand`): nothing is made until a new routine
// is whole, a row is saved when it is right, a row that is not goes back
// when its popover closes, and removing the only row empties the card and
// opens the Add menu. Then Test run's waits, and the Add menu's words.

import { describe, expect, it } from 'vitest'
import { field } from './json'
import { makeAgent } from './models'
import {
  RoutineEditing,
  RoutineTestRuns,
  cadences,
  sourceLabel,
  timeLine,
} from './routineEditing'
import { automationHost } from './routineTesting'
import { quarterHours } from './routineTriggers'
import { AppStore } from './store'
import { FakeBackend, ms } from './testing'

async function demo() {
  const backend = new FakeBackend()
  backend.agents = [makeAgent({ id: 'theo', name: 'Theo' })]
  automationHost(backend, [
    {
      name: 'Monday launch check',
      prompt: 'Check the launch.',
      trigger: { type: 'cron', schedule: '0 9 * * 1' },
    },
  ])
  const store = new AppStore()
  await store.attach(backend)
  const agent = 'theo'
  await store.loadRoutines(agent)
  return { store, agent, backend }
}

describe('a routine’s editor (RoutineEditingTests)', () => {
  it('makes a new routine once it is whole', async () => {
    const { store, agent } = await demo()
    const before = store.routinesByAgent[agent]?.length ?? 0
    const editor = new RoutineEditing(agent, undefined)
    expect(editor.isNew).toBe(true)
    expect(editor.rows).toEqual([])
    editor.setName('Launch check')
    editor.nameDone(store)
    editor.setPrompt('Read the launch channel')
    editor.promptDone(store)
    await editor.settled()
    expect(editor.routineId).toBeUndefined()
    expect(store.routinesByAgent[agent]?.length ?? 0).toBe(before)

    editor.addSchedule('0 8 * * 1-5', false, store)
    expect(editor.openRow).toBeUndefined()
    await editor.settled()
    expect(editor.routineId).toBeDefined()
    expect(store.routinesByAgent[agent]?.length ?? 0).toBe(before + 1)
    const made = editor.stored(store)
    expect(made?.name).toBe('Launch check')
    expect(made?.trigger).toEqual({ type: 'cron', schedule: '0 8 * * 1-5' })
    store.detach()
  })

  it('saves rows when they are right and puts them back when not', async () => {
    const { store, agent } = await demo()
    const editor = new RoutineEditing(agent, undefined)
    editor.setName('Watch')
    editor.setPrompt('Watch it')
    editor.addSchedule('0 9 * * *', false, store)
    await editor.settled()
    const id = editor.routineId
    expect(id).toBeDefined()

    // A Slack row has no channel yet: shown, its popover open, not saved; closing it puts the stored trigger back.
    editor.addSource('slack', store)
    expect(editor.openRow).toBe(1)
    expect(editor.rows).toHaveLength(2)
    editor.closeRow(store)
    expect(editor.openRow).toBeUndefined()
    expect(editor.rows).toEqual([{ kind: 'schedule', text: '0 9 * * *' }])

    // Typed (shown, not saved), then committed: the two are saved as a group.
    editor.addSource('slack', store)
    editor.set(
      1,
      {
        kind: 'slack',
        channel: '#launch',
        match: 'message',
        keyword: '',
        emoji: '',
        bySelf: false,
      },
      false,
      store,
    )
    await editor.settled()
    expect(editor.stored(store)?.trigger).toEqual({
      type: 'cron',
      schedule: '0 9 * * *',
    })
    editor.commit(editor.rows, store)
    await editor.settled()
    const saved = store.routinesByAgent[agent]?.find((one) => one.id === id)
    expect(field(saved?.trigger, 'type')).toBe('group')
    expect(field(saved?.trigger, 'listeners')).toHaveLength(2)

    // Removing one of two saves the other alone.
    editor.remove(0, store)
    await editor.settled()
    expect(editor.stored(store)?.trigger).toEqual({
      type: 'slack',
      channel: '#launch',
      match: { kind: 'message' },
    })

    // The only row: the card empties, nothing is saved, the Add menu opens; closing it with no pick leaves it empty.
    editor.remove(0, store)
    expect(editor.rows).toEqual([])
    expect(editor.addMenuRequests).toBe(1)
    editor.addMenuClosed(false, store)
    await editor.settled()
    expect(editor.rows).toEqual([])
    expect(field(editor.stored(store)?.trigger, 'type')).toBe('slack')
    store.detach()
  })

  it('keeps the stored words in its fields and follows them', async () => {
    const { store, agent } = await demo()
    const editor = new RoutineEditing(agent, undefined)
    editor.setName('First')
    editor.setPrompt('Do it')
    editor.addSchedule('0 * * * *', false, store)
    await editor.settled()
    const stored = editor.stored(store)!
    expect(stored).toBeDefined()

    // An empty name goes back to the stored one; a new one is saved.
    editor.setName('  ')
    editor.nameDone(store)
    expect(editor.name).toBe('First')
    editor.setName('Second')
    editor.nameDone(store)
    await editor.settled()
    expect(editor.stored(store)?.name).toBe('Second')

    // Another editor's change: a field still showing the stored words follows it.
    const other = new RoutineEditing(agent, editor.stored(store))
    other.follow({ ...stored, name: 'Third' })
    expect(other.name).toBe('Third')
    other.setName('Mine')
    other.follow({ ...stored, name: 'Fourth' })
    expect(other.name).toBe('Mine')
    store.detach()
  })

  it('makes a paused routine paused, and deletes one being made when it comes back', async () => {
    const { store, agent } = await demo()
    const before = store.routinesByAgent[agent]?.length ?? 0
    const paused = new RoutineEditing(agent, undefined)
    paused.toggleActive(false, store)
    expect(paused.isActive(store)).toBe(false)
    paused.setName('Paused')
    paused.setPrompt('Wait')
    paused.addSchedule('0 7 * * *', false, store)
    await paused.settled()
    expect(paused.stored(store)?.isEnabled).toBe(false)

    const gone = new RoutineEditing(agent, undefined)
    gone.setName('Gone')
    gone.setPrompt('Never')
    gone.addSchedule('0 6 * * *', false, store)
    expect(gone.creating).toBe(true)
    gone.delete(store)
    await gone.settled()
    expect(store.routinesByAgent[agent]?.length ?? 0).toBe(before + 1)
    expect(
      store.routinesByAgent[agent]?.find((one) => one.name === 'Gone'),
    ).toBeUndefined()
    store.detach()
  })

  it('makes Test run wait', async () => {
    const { store, agent } = await demo()
    const runs = store.routineRuns
    const editor = new RoutineEditing(agent, undefined)
    expect(editor.isRunning(store, runs)).toBe(false)
    editor.testRun(store, runs)
    expect(editor.historyRequests).toBe(0)
    editor.setName('Run')
    editor.setPrompt('Go')
    editor.addSchedule('0 8 * * 1', true, store)
    expect(editor.openRow).toBe(0)
    await editor.settled()
    editor.testRun(store, runs)
    expect(editor.isRunning(store, runs)).toBe(true)
    await editor.settled()
    expect(editor.historyRequests).toBe(1)
    expect(runs.isBlocked(agent, editor.routineId ?? '')).toBe(true)
    expect(editor.stored(store)?.runs[0]?.trigger).toBe('manual')
    store.detach()
    expect(runs.isBlocked(agent, editor.routineId ?? '')).toBe(false)
  })

  it('a refused create says it couldn’t save; a refused run ends the wait at once', async () => {
    const { store, agent, backend } = await demo()
    backend.refusedCommands.add('createAgentAutomation')
    const editor = new RoutineEditing(agent, undefined)
    editor.setName('Refused')
    editor.setPrompt('No')
    editor.addSchedule('0 8 * * *', false, store)
    await editor.settled()
    expect(editor.saveFailed).toBe(true)
    expect(editor.routineId).toBeUndefined()
    // The next save tried clears it.
    editor.nameDone(store)
    expect(editor.saveFailed).toBe(false)
    await editor.settled()

    const stored = store.routinesByAgent[agent]![0]!
    const running = new RoutineEditing(agent, stored)
    backend.refusedCommands.add('runAgentAutomationNow')
    running.testRun(store, store.routineRuns)
    expect(running.isRunning(store, store.routineRuns)).toBe(true)
    await running.settled()
    expect(running.isRunning(store, store.routineRuns)).toBe(false)
    store.detach()
  })
})

describe('Test run’s waits (RoutineTestRuns)', () => {
  it('lifts the wait its cooldown after the run ended', async () => {
    const { store, agent } = await demo()
    let told = 0
    const runs = new RoutineTestRuns(() => (told += 1), 20)
    const id = store.routinesByAgent[agent]![0]!.id
    await runs.run(agent, id, store)
    expect(runs.isBlocked(agent, id)).toBe(true)
    // Once at a time.
    await runs.run(agent, id, store)
    await ms(40)
    expect(runs.isBlocked(agent, id)).toBe(false)
    expect(told).toBe(2)
    store.detach()
  })

  it('ends at once when the routine goes', async () => {
    const { store, agent } = await demo()
    const runs = new RoutineTestRuns(() => {}, 10_000)
    const id = store.routinesByAgent[agent]![0]!.id
    store.routinesByAgent[agent] = store.routinesByAgent[agent]!.map((one) => ({
      ...one,
      runs: [{ id: 'live', trigger: 'manual', status: 'running', at: 1 }],
    }))
    const going = runs.run(agent, id, store)
    await going
    expect(runs.isBlocked(agent, id)).toBe(true)
    store.routinesByAgent[agent] = []
    runs.listChanged(agent, store)
    expect(runs.isBlocked(agent, id)).toBe(false)
    store.detach()
  })
})

describe('the Add menu’s words', () => {
  it('words the sources and the cadences as the Mac’s menu', () => {
    expect(sourceLabel('schedule')).toBe('On a schedule')
    expect(sourceLabel('microsoftTeams')).toBe('Teams message')
    expect(cadences().map((one) => one.label)).toEqual([
      'Every hour',
      'Every day',
      'Weekdays',
      'Every week',
      'Every month',
      'Interval',
      'Advanced…',
    ])
    expect(cadences().flatMap((one) => (one.line ? [one.line] : []))).toEqual([
      '0 * * * *',
      '0 8 * * 1',
      '0 8 1 * *',
      '@every 30m',
      '0 8 * * *',
    ])
    expect(timeLine({ hour: 9, minute: 15 }, '1-5')).toBe('15 9 * * 1-5')
    expect(quarterHours).toHaveLength(96)
  })
})
