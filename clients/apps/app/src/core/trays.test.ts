// The computer's notices as the window keeps them (SimeonCore's
// `TraysTests`: `EKe`, `hVn`, `kzn`). The channel tag's test is the chat's
// (step 2).

import { describe, expect, it } from 'vitest'
import type { JSONValue } from './json'
import { TrayList, copyableRequestId, trayCountLabel, trayFrom } from './trays'

function tray(
  id: string,
  options: { agent?: string | null; title?: string; count?: number } = {},
): JSONValue {
  const json: Record<string, JSONValue> = {
    kind: 'error',
    id,
    title: options.title ?? 'Agent failed to respond',
    detail: 'The model stopped.',
    createdAt: 1,
  }
  const agent = options.agent === undefined ? 'a' : options.agent
  if (agent !== null) json.agentId = agent
  if (options.count !== undefined) json.count = options.count
  return json
}

describe('the computer’s notices (TraysTests)', () => {
  it('applies the events', () => {
    const list = new TrayList()
    // Before the first read, a change has nothing to apply to.
    list.take({ type: 'pushed', tray: tray('t0') })
    expect(list.trays).toEqual([])
    list.take({
      type: 'snapshot',
      trays: [tray('t1'), tray('t2', { agent: 'b' })],
    })
    expect(list.trays.map((one) => one.id)).toEqual(['t1', 't2'])
    // A repeat replaces the notice in its place; a new one goes last.
    list.take({
      type: 'pushed',
      tray: tray('t1', { title: 'Model provider is overloaded', count: 3 }),
    })
    list.take({ type: 'pushed', tray: tray('t3', { agent: null }) })
    expect(list.trays.map((one) => one.id)).toEqual(['t1', 't2', 't3'])
    expect(list.trays[0]!.title).toBe('Model provider is overloaded')
    expect(trayCountLabel(list.trays[0]!)).toBe('×3')
    expect(trayCountLabel(list.trays[1]!)).toBeUndefined()
    // Only the open agent's show; one with no agent never does.
    expect(list.shown('a').map((one) => one.id)).toEqual(['t1'])
    expect(list.shown(undefined)).toEqual([])
    list.take({ type: 'dismissed', id: 't1' })
    expect(list.trays.map((one) => one.id)).toEqual(['t2', 't3'])
    list.take({ type: 'cleared' })
    expect(list.trays).toEqual([])
  })

  it('applies what came during a read over its answer, and drops an earlier read’s', () => {
    const list = new TrayList()
    const first = list.beginRead()
    const second = list.beginRead()
    list.take({ type: 'pushed', tray: tray('late') })
    list.take({ type: 'dismissed', id: 'gone' })
    list.finishRead(first, [tray('old')])
    expect(list.trays).toEqual([])
    list.finishRead(second, [tray('gone'), tray('kept')])
    expect(list.trays.map((one) => one.id)).toEqual(['kept', 'late'])
    // A failed read keeps what was shown.
    const third = list.beginRead()
    list.finishRead(third, undefined)
    expect(list.trays.map((one) => one.id)).toEqual(['kept', 'late'])
  })

  it('reads its buttons, dropping the kinds the window drops', () => {
    const json: JSONValue = {
      ...(tray('t') as Record<string, JSONValue>),
      requestId: 'req_1',
      actions: [
        {
          kind: 'open-url',
          label: 'Open billing',
          url: 'https://simeonlabs.com',
        },
        { kind: 'switch-model', label: 'Use another model', modelId: 'm' },
        {
          kind: 'dashboard-action',
          label: 'Upgrade',
          action: 'upgrade',
          args: { tier: 'pro' },
          successMessage: 'Upgraded',
        },
      ],
    }
    const parsed = trayFrom(json)!
    expect(parsed.actions.map((one) => one.label)).toEqual([
      'Open billing',
      'Upgrade',
    ])
    expect(parsed.actions[1]).toEqual({
      kind: 'dashboard',
      label: 'Upgrade',
      action: 'upgrade',
      args: { tier: 'pro' },
      successMessage: 'Upgraded',
    })
    expect(copyableRequestId(parsed)).toBe('req_1')
    expect(
      copyableRequestId(
        trayFrom({
          ...(tray('u') as Record<string, JSONValue>),
          requestId: '',
        })!,
      ),
    ).toBeUndefined()
  })
})
