// SimeonCore's ActivityLineTests (CoreTests.swift), translated.

import { beforeAll, describe, expect, it } from 'vitest'
import { ActivityHold, ActivityLine, activityLine } from './activity'
import { agentFrom, makeAgent } from './models'
import { loadWords } from './words'

beforeAll(() => loadWords('en'))

const of = ActivityLine.of

describe('the working line', () => {
  it("says the Mac's words", () => {
    expect(of('thinking', undefined, undefined).text).toBe('Thinking')
    expect(of('tool', 'Shell', undefined).text).toBe('Running commands')
    expect(of('tool', 'Shell', 'notes.md').text).toBe('Drafting the file')
    expect(of('tool', 'ExternalShell', undefined).text).toBe('On your computer')
    expect(of('tool', 'WebSearch', 'flights').text).toBe('Searching the web')
    expect(of('tool', 'WebFetch', undefined).text).toBe('Reading the web')
    expect(of('tool', 'GenerateImage', undefined).text).toBe(
      'Generating a photo',
    )
    expect(of('tool', 'SendToAgent', undefined, 'iris', 'Iris').text).toBe(
      'Messaging Iris',
    )
    expect(of('tool', 'SendToAgent', undefined, 'iris', 'Iris').icon).toEqual({
      kind: 'agent',
      id: 'iris',
    })
    expect(of('tool', 'SendToAgent', undefined).text).toBe(
      'Messaging another assistant',
    )
    expect(of('tool', 'CallMcpTool', 'linear').text).toBe(
      'Connecting to Linear',
    )
    expect(of('tool', 'CallMcpTool', undefined).text).toBe(
      'Connecting to a third party app',
    )
    expect(of('tool', 'browser_click', undefined).text).toBe('Browsing the web')
    expect(of('tool', 'CheckSubagent', undefined).text).toBe(
      'Waiting on another agent',
    )
    expect(of('tool', 'Mystery', undefined).text).toBe('Working')
    expect(of(undefined, undefined, undefined).text).toBe('Working')
    const theo = makeAgent({ id: 't', name: 'Theo', isRunning: true })
    // Running before it says what (`gJn`).
    expect(activityLine(theo)?.text).toBe('Theo is working')
  })

  it('holds each activity for a moment', () => {
    const search = of('tool', 'WebSearch', undefined)
    const read = of('tool', 'Read', undefined)
    const shell = of('tool', 'Shell', undefined)
    const hold = new ActivityHold(search, 10)
    hold.want(read, 10.3)
    // Searching keeps its 0.8 s.
    expect(hold.shown).toBe(search)
    expect(hold.due).toBeCloseTo(10.8, 4)
    hold.want(read, 10.8)
    expect(hold.shown).toBe(read)
    expect(hold.due).toBeUndefined()
    hold.want(shell, 12)
    // After its 0.8 s a new one takes over at once.
    expect(hold.shown).toBe(shell)
    expect(hold.elapsed(71)).toBeUndefined()
    expect(hold.elapsed(72.5)).toBe('1m')
    expect(hold.nextMinute(72.5)).toBeCloseTo(132, 4)
    expect(hold.elapsed(12 + 3_900)).toBe('1h 5m')
    // The label comes in again only when the verb or the picture changes.
    expect(of('tool', 'Shell', undefined).key).toBe(
      of('tool', 'BoxShell', undefined).key,
    )
  })

  it("is the agent's line", () => {
    const agent = makeAgent({
      id: 'theo',
      name: 'Theo',
      isRunningTurn: true,
      activityKind: 'tool',
      activityTool: 'Shell',
    })
    expect(activityLine(agent)?.text).toBe('Running commands')
    expect(activityLine({ ...agent, isComposing: true })?.text).toBe('Typing…')
    // Waiting on you is not working.
    expect(
      activityLine({ ...agent, awaitingUserResponse: true }),
    ).toBeUndefined()
    const parsed = agentFrom({
      id: 'scout',
      name: 'Scout',
      isRunning: true,
      currentActivity: { kind: 'tool', tool: 'SendToAgent', target: 'iris' },
    })!
    expect(
      activityLine(parsed, (id) => (id === 'iris' ? 'Iris' : undefined))?.text,
    ).toBe('Messaging Iris')
  })

  it('says the time it has been at it', () => {
    expect(ActivityLine.elapsed(59)).toBeUndefined()
    expect(ActivityLine.elapsed(61)).toBe('1m')
    expect(ActivityLine.elapsed(3 * 60 + 20)).toBe('3m')
    expect(ActivityLine.elapsed(3600)).toBe('1h')
    expect(ActivityLine.elapsed(3900)).toBe('1h 5m')
    expect([...of('tool', 'Task', 'x'.repeat(90)).text].length <= 60).toBe(true)
  })
})
