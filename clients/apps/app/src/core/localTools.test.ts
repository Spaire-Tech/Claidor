// "Execution on Local Computer" and the Allow card's words and answers:
// SimeonMacCore's `LocalToolPermissionTests` (LocalToolTests.swift) and
// SimeonCore's `ApprovalTests.testTheLocalCard` and
// `testTheLocalAskInTheChat`, with the core's fixture read in place
// (ios/SimeonCore/Tests/SimeonCoreTests/Fixtures/approvals.json: the
// shipped window's own strings, policy and answer orders).

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Entry } from './entry'
import type { JSONValue } from './json'
import {
  type LocalAsk,
  type LocalAskResolution,
  LocalToolAsk,
  alwaysBlocked,
  answerLocalAsk,
  waitingAsk,
} from './localAsk'
import {
  type LocalToolPermission,
  cappedPermission,
  ceilingLine,
  defaultLocalToolPermission,
  isAboveCeiling,
  localToolChoices,
  normalizedPermission,
  permissionLabel,
  permissionRank,
  reconcilePermission,
  teamCeiling,
} from './localToolPermission'

const fixture = JSON.parse(
  readFileSync(
    new URL(
      '../../../../../ios/SimeonCore/Tests/SimeonCoreTests/Fixtures/approvals.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as { localTool: Record<string, Record<string, unknown>> }
const local = fixture.localTool

describe('the menu (LocalToolPermissionTests)', () => {
  it('lists the choices in the window’s words and order', () => {
    expect(localToolChoices.map(permissionLabel)).toEqual([
      'Always allow',
      'Ask every time',
      'Never allow',
    ])
    expect(defaultLocalToolPermission).toBe('ask')
    expect(normalizedPermission('always')).toBe('always')
    expect(normalizedPermission('Always')).toBe('ask')
    expect(normalizedPermission(undefined)).toBe('ask')
    expect(ceilingLine('ask')).toBe(
      'Your team\'s admin allows at most "Ask every time"',
    )
  })

  it('lowers to the ceiling and greys what is above it', () => {
    for (const choice of localToolChoices) {
      expect(cappedPermission(choice, undefined)).toBe(choice)
      expect(isAboveCeiling(choice, undefined)).toBe(false)
      for (const ceiling of localToolChoices) {
        expect(cappedPermission(choice, ceiling)).toBe(
          permissionRank(choice) <= permissionRank(ceiling) ? choice : ceiling,
        )
        expect(isAboveCeiling(choice, ceiling)).toBe(
          permissionRank(choice) > permissionRank(ceiling),
        )
      }
    }
    expect(cappedPermission('always', 'never')).toBe('never')
  })

  it('reads the team’s answer', () => {
    expect(teamCeiling({})).toBeUndefined()
    expect(teamCeiling(undefined)).toBeUndefined()
    const ceiling = (value: number) =>
      teamCeiling({ localToolControls: { permissionCeiling: value } })
    expect(ceiling(1)).toBe('never')
    expect(ceiling(2)).toBe('ask')
    expect(ceiling(3)).toBe('always')
    expect(ceiling(0)).toBeUndefined()
  })

  it('takes the computer’s word on connecting only over the default', () => {
    expect(reconcilePermission('always', 'ask')).toEqual({
      kind: 'adopt',
      value: 'always',
    })
    expect(reconcilePermission('never', 'ask')).toEqual({
      kind: 'adopt',
      value: 'never',
    })
    expect(reconcilePermission('ask', 'ask')).toEqual({
      kind: 'push',
      value: 'ask',
    })
    expect(reconcilePermission(undefined, 'ask')).toEqual({
      kind: 'push',
      value: 'ask',
    })
    expect(reconcilePermission('always', 'never')).toEqual({
      kind: 'push',
      value: 'never',
    })
    expect(reconcilePermission('never', 'always')).toEqual({
      kind: 'push',
      value: 'always',
    })
    expect(reconcilePermission('sometimes', 'ask')).toEqual({
      kind: 'push',
      value: 'ask',
    })
  })
})

describe('the local card (testTheLocalCard)', () => {
  it('has the window’s words', () => {
    const strings = local.strings as Record<string, string>
    expect(LocalToolAsk.title()).toBe(strings.title)
    expect(LocalToolAsk.description()).toBe(strings.description)
    expect(LocalToolAsk.denyOnce()).toBe(strings.dismissLabel)
    expect(LocalToolAsk.denyOnceTooltip()).toBe(strings.dismissTooltip)
    expect(LocalToolAsk.failure()).toBe(strings.failure)
    for (const [status, line] of Object.entries(
      local.outcome as Record<string, string>,
    ))
      expect(LocalToolAsk.outcome(status), status).toBe(line)
  })

  it('turns Always allow off while the team’s policy loads, and below “Always allow”', () => {
    const policy = local.policy as Record<
      string,
      { alwaysAllowDisabled: boolean; tooltip: string | null }
    >
    const cases: [string, boolean, LocalToolPermission | undefined][] = [
      ['loading', false, undefined],
      ['readyNull', true, undefined],
      ['readyAlways', true, 'always'],
      ['readyAsk', true, 'ask'],
      ['readyNever', true, 'never'],
    ]
    for (const [name, known, ceiling] of cases) {
      const said = alwaysBlocked(known, ceiling)
      expect(said ?? null, name).toBe(policy[name]?.tooltip)
      expect(said !== undefined, name).toBe(policy[name]?.alwaysAllowDisabled)
    }
  })

  it('answers in the window’s order, falling back to once when the setting did not take', async () => {
    const ask: LocalAsk = {
      entryId: 'entry-1',
      requestId: 'req-1',
      action: 'run-command',
      target: 'ls -la',
      status: 'pending',
    }
    const answers = local.answers as Record<string, [string, JSONValue][]>
    const cases: [string, LocalAskResolution, 'takes' | 'capped' | 'fails'][] =
      [
        ['allowOnce', 'allow-once', 'takes'],
        ['deny', 'deny', 'takes'],
        ['always', 'always', 'takes'],
        ['alwaysCapped', 'always', 'capped'],
        ['alwaysSetFails', 'always', 'fails'],
        ['never', 'never', 'takes'],
        ['neverRefused', 'never', 'fails'],
      ]
    for (const [name, resolution, setting] of cases) {
      const steps: [string, JSONValue][] = []
      await answerLocalAsk(ask, 'agent-1', resolution, {
        choose: async (value) => {
          steps.push(['setLocalToolPermission', { permission: value }])
          if (setting === 'fails') throw new Error('refused')
          return setting === 'capped' ? 'ask' : value
        },
        allowOnce: async (approval) => {
          steps.push([
            'recordLocalToolApproval',
            {
              approvalId: approval.id,
              action: approval.action,
              target: approval.target,
            },
          ])
        },
        resolve: async (fields) => {
          steps.push(['resolveLocalToolPermission', { ...fields }])
        },
      })
      expect(steps, name).toEqual(answers[name])
    }
  })
})

describe('the local ask in the chat (testTheLocalAskInTheChat)', () => {
  const entry = (status: string, id: string) =>
    Entry.from({
      id,
      kind: 'send-message',
      timestampMs: 1,
      message: {
        type: 'local-tool-permission',
        ask: {
          requestId: `q-${id}`,
          action: 'run-command',
          target: 'ls',
          status,
        },
      },
    }) as Entry

  it('is the first one still waiting', () => {
    const entries = [
      entry('allowed', '1'),
      entry('expired', '2'),
      entry('pending', '3'),
      entry('pending', '4'),
    ]
    expect(waitingAsk(entries)?.entryId).toBe('3')
    expect(waitingAsk(entries)?.requestId).toBe('q-3')
    expect(waitingAsk([entry('never', '5')])).toBeUndefined()
  })
})
