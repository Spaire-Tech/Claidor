// A routine as the host lists it, and the editor's rules for saving, as the
// core's tests have them: RoutineTriggerTests.swift's `RoutineEditorTests`
// (records and order, saving rules), FirstRunTests.swift's
// `RoutineEditorRulesTests` and `RoutineRunFlightTests` (Test run's wait),
// CoreTests.swift's `testSchedulesReadAndWriteTheMacsChoices`.

import { describe, expect, it } from 'vitest'
import type { JSONValue } from './json'
import {
  type Routine,
  RoutineRunFlight,
  type Schedule,
  createdRoutine,
  listedRoutines,
  newRoutineSpec,
  routineFrom,
  routineIsRunning,
  routineRowDetail,
  routineSpec,
  routineUnchanged,
  runSummary,
  scheduleCron,
  scheduleFromCron,
  scheduleSummary,
  updateRoutineSpec,
} from './routines'
import { newTriggerRow, triggerOf } from './routineTriggers'

const routine = (json: JSONValue): Routine => routineFrom(json)!

describe('a routine’s record (RoutineEditorTests)', () => {
  it('reads records and lists the active ones first', () => {
    const a = routine({
      id: 'a',
      name: 'A',
      prompt: 'p',
      isEnabled: false,
      triggerDescription: 'Every hour',
      trigger: { type: 'cron', schedule: '0 * * * *' },
    })
    const b = routine({
      id: 'b',
      name: 'B',
      prompt: 'p',
      isEnabled: true,
      triggerDescription: 'Every day at 8:00 AM',
      trigger: {
        type: 'group',
        listeners: [
          { type: 'slack', channel: '#x', match: { kind: 'mention' } },
          { type: 'cron', schedule: '0 8 * * *' },
        ],
      },
      runs: [{ id: 'r1', trigger: 'manual', startedAt: 5, status: 'running' }],
    })
    expect(listedRoutines([a, b]).map((one) => one.id)).toEqual(['b', 'a'])
    expect(routineRowDetail(a)).toBe('Paused')
    expect(routineRowDetail(b)).toBe('Every day at 8:00 AM')
    expect(b.schedule).toBe('0 8 * * *')
    expect(routineIsRunning(b)).toBe(true)
    expect(b.runs[0]?.trigger).toBe('manual')
  })

  it('needs an id; a schedule alone is its trigger; a run needs a time or a status', () => {
    expect(routineFrom({ name: 'No id' })).toBeUndefined()
    const old = routine({ id: 'o', schedule: '0 9 * * 1' })
    expect(old.name).toBe('Routine')
    expect(old.trigger).toEqual({ type: 'cron', schedule: '0 9 * * 1' })
    expect(old.summary).toBe('Every Monday at 9:00 AM')
    expect(old.isEnabled).toBe(true)
    const runs = routine({
      id: 'r',
      runs: [
        { trigger: 'schedule' },
        { at: 7, outcome: 'error', error: 'Gateway timeout 504' },
        { timestampMs: 9, status: 'ok', event: 'A PR opened' },
      ],
    }).runs
    expect(runs.map((run) => [run.id, run.status, run.at])).toEqual([
      ['7-error', 'error', 7],
      ['9-ok', 'ok', 9],
    ])
    expect(runSummary(runs[0]!)).toBe(
      'This run didn’t finish. It will try again at its next time.',
    )
    expect(runSummary(runs[1]!)).toBe('A PR opened')
  })

  it('applies the saving rules', () => {
    expect(
      newRoutineSpec(' ', 'x', { type: 'cron', schedule: '0 * * * *' }, true),
    ).toBeUndefined()
    expect(newRoutineSpec('n', 'x', undefined, true)).toBeUndefined()
    const spec = newRoutineSpec(
      ' n ',
      'x',
      { type: 'cron', schedule: '0 * * * *' },
      false,
    )
    expect(spec?.name).toBe('n')
    expect(spec?.isEnabled).toBe(false)
    const stored = routine({
      id: 'a',
      name: 'Old',
      prompt: 'Do it',
      isEnabled: true,
      trigger: { type: 'cron', schedule: '0 * * * *' },
    })
    const update = updateRoutineSpec(stored, '', 'New', undefined)
    expect(update.name).toBe('Old')
    expect(update.prompt).toBe('New')
    expect(update.trigger).toEqual({ type: 'cron', schedule: '0 * * * *' })
    // The record a create made: same name first, then the newest (`v$n`).
    const made = [
      routine({ id: 'x', name: 'Other', createdAt: 9 }),
      routine({ id: 'y', name: 'Mine', createdAt: 3 }),
      stored,
    ]
    expect(createdRoutine(made, new Set(['a']), 'Mine')?.id).toBe('y')
    expect(createdRoutine(made, new Set(['a']), 'None')?.id).toBe('x')
  })
})

describe('the editor’s save rules (RoutineEditorRulesTests)', () => {
  const stored = routine({
    id: 'r1',
    name: 'Monday check',
    prompt: 'Check the launch.',
    trigger: { type: 'cron', schedule: '0 9 * * 1' },
    isEnabled: true,
  })

  it('keeps the stored fields and sends the pending switch', () => {
    const spec = updateRoutineSpec(stored, '  ', 'New words', undefined, false)
    expect(spec.name).toBe('Monday check')
    expect(spec.prompt).toBe('New words')
    expect(spec.trigger).toEqual({ type: 'cron', schedule: '0 9 * * 1' })
    expect(spec.isEnabled).toBe(false)
  })

  it('skips an update that changes nothing', () => {
    const same = updateRoutineSpec(
      stored,
      'Monday check',
      'Check the launch.',
      triggerOf([{ kind: 'schedule', text: '0 9 * * 1' }]),
    )
    expect(routineUnchanged(stored, same)).toBe(true)
    const other = updateRoutineSpec(
      stored,
      'Monday check',
      'Check the launch.',
      triggerOf([{ kind: 'schedule', text: '0 10 * * 1' }]),
    )
    expect(routineUnchanged(stored, other)).toBe(false)
  })

  it('makes a new routine only with all three', () => {
    expect(
      newRoutineSpec('x', '', { type: 'cron', schedule: '0 9 * * *' }, true),
    ).toBeUndefined()
    expect(
      newRoutineSpec('x', 'y', triggerOf([newTriggerRow('slack')]), true),
    ).toBeUndefined()
    expect(
      newRoutineSpec('x', 'y', triggerOf([newTriggerRow('linear')]), true),
    ).toBeDefined()
  })
})

describe('Test run’s wait (RoutineRunFlightTests)', () => {
  const withRuns = (runs: JSONValue[]) =>
    routine({
      id: 'r1',
      name: 'Check',
      prompt: 'p',
      trigger: { type: 'cron', schedule: '0 9 * * 1' },
      runs,
    })

  it('waits for a new manual run, then cools down', () => {
    const before = withRuns([
      { id: 'old', trigger: 'manual', status: 'ok', startedAt: 1 },
    ])
    const flight = new RoutineRunFlight(before)
    expect(flight.phase).toEqual({ kind: 'awaiting', previous: 'old' })
    expect(flight.take(before)).toBe(true)
    expect(flight.phase).toEqual({ kind: 'awaiting', previous: 'old' })
    expect(
      flight.take(
        withRuns([
          { id: 'new', trigger: 'manual', status: 'running', startedAt: 2 },
        ]),
      ),
    ).toBe(true)
    expect(flight.phase).toEqual({ kind: 'running', id: 'new' })
    expect(
      flight.take(
        withRuns([
          { id: 'new', trigger: 'manual', status: 'ok', startedAt: 2 },
        ]),
      ),
    ).toBe(true)
    expect(flight.phase).toEqual({ kind: 'cooldown' })
  })

  it('cools down when no run came after the read, and ends when the routine is gone', () => {
    const flight = new RoutineRunFlight(withRuns([]))
    flight.afterRead()
    expect(flight.phase).toEqual({ kind: 'cooldown' })
    expect(new RoutineRunFlight(undefined).take(undefined)).toBe(false)
  })
})

describe('the older picker’s choices (testSchedulesReadAndWriteTheMacsChoices)', () => {
  it('reads and writes the Mac’s choices', () => {
    expect(scheduleFromCron('0 9 * * 1')).toEqual({
      kind: 'weekly',
      weekday: 1,
      hour: 9,
      minute: 0,
    })
    expect(scheduleSummary(scheduleFromCron('0 9 * * 1'))).toBe(
      'Every Monday at 9:00 AM',
    )
    expect(scheduleSummary(scheduleFromCron('30 8 * * 1-5'))).toBe(
      'Weekdays at 8:30 AM',
    )
    expect(scheduleSummary(scheduleFromCron('0 18 * * *'))).toBe(
      'Every day at 6:00 PM',
    )
    expect(scheduleSummary(scheduleFromCron('15 * * * *'))).toBe(
      'Every hour at :15',
    )
    expect(scheduleSummary(scheduleFromCron('0 9 1 * *'))).toBe(
      'Every month on the 1st at 9:00 AM',
    )
    expect(scheduleSummary(scheduleFromCron('*/30 * * * *'))).toBe(
      'Every 30 minutes',
    )
    expect(scheduleFromCron('0 */4 * * *')).toEqual({
      kind: 'everyHours',
      every: 4,
    })
    expect(scheduleFromCron('0 9 * 6 *')).toEqual({
      kind: 'custom',
      line: '0 9 * 6 *',
    })
    const schedules: Schedule[] = [
      { kind: 'daily', hour: 7, minute: 5 },
      { kind: 'weekdays', hour: 17, minute: 45 },
      { kind: 'weekly', weekday: 5, hour: 12, minute: 0 },
      { kind: 'monthly', day: 15, hour: 9, minute: 30 },
      { kind: 'hourly', minute: 0 },
      { kind: 'everyMinutes', every: 10 },
    ]
    for (const schedule of schedules)
      expect(scheduleFromCron(scheduleCron(schedule))).toEqual(schedule)
    const brief = routine({
      id: 'r1',
      name: 'Brief',
      prompt: 'Brief me',
      trigger: { type: 'cron', schedule: '0 8 * * 1-5' },
      isEnabled: false,
    })
    expect(brief.summary).toBe('Weekdays at 8:00 AM')
    expect(routineSpec(brief).trigger).toEqual({
      type: 'cron',
      schedule: '0 8 * * 1-5',
    })
  })
})
