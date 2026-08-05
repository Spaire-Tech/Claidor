import { describe, expect, it } from 'vitest'

import type { Step } from './AutomationSequenceBuilder'
import {
  deriveGoalEvent,
  deriveSendWindow,
  deserializeSteps,
  serializeSteps,
} from './flowDoc'

describe('serializeSteps → backend node shape', () => {
  it('wait carries a real duration (not the 0 the engine used to fall back to)', () => {
    const [node] = serializeSteps([{ id: 'w1', type: 'wait', dur: '1 day' }])
    expect(node.type).toBe('wait')
    expect(node.value).toEqual({ mode: 'duration', amount: 1, unit: 'day' })
  })

  it('parses every wait preset to a non-zero amount + unit', () => {
    const presets: Record<string, { amount: number; unit: string }> = {
      '1 hour': { amount: 1, unit: 'hour' },
      '6 hours': { amount: 6, unit: 'hour' },
      '2 days': { amount: 2, unit: 'day' },
      '1 week': { amount: 1, unit: 'week' },
      '2 weeks': { amount: 2, unit: 'week' },
    }
    for (const [dur, expected] of Object.entries(presets)) {
      const [node] = serializeSteps([{ id: 'w', type: 'wait', dur }])
      expect(node.value).toMatchObject(expected)
      expect(Number(node.value!.amount)).toBeGreaterThan(0)
    }
  })

  it('branch emits {field} the engine understands + keeps yes/no arms', () => {
    const [node] = serializeSteps([
      {
        id: 'b1',
        type: 'branch',
        cond: 'Clicked the last email',
        yes: [{ id: 'e1', type: 'email', name: 'Yes email' }],
        no: [],
      },
    ])
    expect(node.value).toEqual({ field: 'clicked-prev' })
    expect(node.yes).toHaveLength(1)
    expect(node.no).toHaveLength(0)
  })

  it('branch "has tag" lifts the tag out of the label', () => {
    const [node] = serializeSteps([
      { id: 'b', type: 'branch', cond: 'Has tag “committed”', yes: [], no: [] },
    ])
    expect(node.value).toEqual({ field: 'has-tag', tag: 'committed' })
  })

  it('actions emit {action, tag}; notify maps to the notify action', () => {
    const nodes = serializeSteps([
      { id: 'a1', type: 'action', what: 'Add tag “engaged”' },
      { id: 'a2', type: 'action', what: 'Remove tag “at-risk”' },
      { id: 'a3', type: 'action', what: 'Notify my team on Slack' },
    ])
    expect(nodes[0].value).toEqual({ action: 'add-tag', tag: 'engaged' })
    expect(nodes[1].value).toEqual({ action: 'remove-tag', tag: 'at-risk' })
    expect(nodes[2].value).toEqual({ action: 'notify' })
  })

  it('email nodes stay flat (the send path reads these keys directly)', () => {
    const [node] = serializeSteps([
      {
        id: 'e1',
        type: 'email',
        name: 'Welcome',
        subject: 'Hi',
        content_html: '<p>hi</p>',
        content_json: { version: 3 } as Record<string, unknown>,
      },
    ])
    expect(node.value).toBeUndefined()
    expect(node).toMatchObject({
      type: 'email',
      subject: 'Hi',
      content_html: '<p>hi</p>',
      content_json: { version: 3 },
    })
  })
})

describe('round-trip serialize → deserialize preserves the builder shape', () => {
  const steps: Step[] = [
    { id: 'e1', type: 'email', name: 'Welcome', subject: 'Welcome', content_html: '<p>x</p>', content_json: null },
    { id: 'w1', type: 'wait', dur: '2 days' },
    {
      id: 'b1',
      type: 'branch',
      cond: 'Opened the last email',
      yes: [{ id: 'a1', type: 'action', what: 'Add tag “engaged”' }],
      no: [{ id: 'g1', type: 'goal', what: 'Completes the course' }],
    },
  ]

  it('survives a full round-trip', () => {
    const back = deserializeSteps(serializeSteps(steps))
    expect(back).toEqual(steps)
  })
})

describe('deserializeSteps back-compat with the legacy flat shape', () => {
  it('reads pre-serializer flat nodes (dur / cond / what)', () => {
    const legacy = [
      { id: 'w', type: 'wait', dur: '3 days' },
      {
        id: 'b',
        type: 'branch',
        cond: 'Clicked the last email',
        yes: [{ id: 'a', type: 'action', what: 'Remove tag “at-risk”' }],
        no: [],
      },
    ]
    const back = deserializeSteps(legacy)
    expect(back[0]).toEqual({ id: 'w', type: 'wait', dur: '3 days' })
    expect(back[1]).toMatchObject({ type: 'branch', cond: 'Clicked the last email' })
    if (back[1].type === 'branch') {
      expect(back[1].yes[0]).toEqual({
        id: 'a',
        type: 'action',
        what: 'Remove tag “at-risk”',
      })
    }
  })

  it('tolerates empty / non-array input', () => {
    expect(deserializeSteps(undefined)).toEqual([])
    expect(deserializeSteps(null)).toEqual([])
    expect(deserializeSteps('nope')).toEqual([])
  })
})

describe('deriveGoalEvent', () => {
  it('lifts the goal event from a goal node, even inside a branch arm', () => {
    const steps: Step[] = [
      { id: 'e1', type: 'email', name: 'x' },
      {
        id: 'b1',
        type: 'branch',
        cond: 'Opened the last email',
        yes: [{ id: 'g1', type: 'goal', what: 'Completes the course' }],
        no: [],
      },
    ]
    expect(deriveGoalEvent(steps)).toEqual({ type: 'course_completed' })
  })

  it('is undefined when there is no goal node', () => {
    expect(deriveGoalEvent([{ id: 'e1', type: 'email', name: 'x' }])).toBeUndefined()
  })
})

describe('deriveSendWindow maps the builder toggles to the engine shape', () => {
  it('"any time" disables the window', () => {
    expect(deriveSendWindow({ window: 'any', tz: true, cap: true })).toMatchObject({
      enabled: false,
      respect_timezone: true,
      frequency_cap: 3,
    })
  })

  it('"Mon–Fri 9–5" enables a weekday window', () => {
    expect(deriveSendWindow({ window: 'wk', tz: false, cap: false })).toEqual({
      enabled: true,
      days: [0, 1, 2, 3, 4],
      start_hour: 9,
      end_hour: 17,
      respect_timezone: false,
      frequency_cap: 0,
    })
  })

  it('"every day 9–5" enables all 7 days', () => {
    expect(deriveSendWindow({ window: 'day', tz: true, cap: true })).toMatchObject({
      enabled: true,
      days: [0, 1, 2, 3, 4, 5, 6],
    })
  })
})
