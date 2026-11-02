// Two agents' messages to each other, each pair on its own page
// (CoreTests.swift's `ExchangePageTests`).

import { describe, expect, it } from 'vitest'
import { Entry } from './entry'
import { exchangeRows, menuOrder } from './exchanges'
import type { JSONObject } from './json'
import type { Party } from './models'

function said(
  id: string,
  seconds: number,
  words: string,
  options: { to?: Party; from?: Party } = {},
): Entry {
  const raw: JSONObject = {
    kind: 'message',
    id,
    content: words,
    timestampMs: 1_760_000_000_000 + seconds * 1000,
  }
  if (options.to) {
    raw.role = 'assistant'
    raw.toAgent = { id: options.to.id, name: options.to.name }
  }
  if (options.from) {
    raw.role = 'user'
    raw.fromAgent = { id: options.from.id, name: options.from.name }
  }
  return Entry.from(raw)!
}

describe('an exchange page (ExchangePageTests)', () => {
  it('gives each pair its own page', () => {
    const scout = { id: 'scout', name: 'Scout' }
    const sid = { id: 'sid', name: 'Sid' }
    const iris = { id: 'iris', name: 'Iris' }
    const call = { id: 'voice-call:abc:30', name: 'Call' }
    const entries = [
      said('a', 0, 'Test from Scout. No reply needed.', { to: sid }),
      said('b', 1, 'Test from Scout. No reply needed.', { to: iris }),
      said('c', 60, 'Please reply with a one-line hello.', { to: sid }),
      said('d', 90, 'Hello from Sid.', { from: sid }),
      said('e', 95, "a call's line", { to: call }),
      said('f', 20 * 60, 'Thanks.', { to: sid }),
    ]
    const shape = exchangeRows(entries, scout, 'sid').map((row) =>
      row.kind === 'stamp'
        ? `stamp:${row.id}`
        : `${row.id}:${row.sender.name}:${row.first ? 'first' : '-'}:${row.last ? 'last' : '-'}`,
    )
    expect(shape).toEqual([
      'stamp:stamp-a',
      'a:Scout:first:-',
      'c:Scout:-:last',
      'd:Sid:first:last',
      'stamp:stamp-f',
      'f:Scout:first:last',
    ])
    // Iris's page holds only what went to Iris.
    expect(exchangeRows(entries, scout, 'iris')).toHaveLength(2)
    expect(exchangeRows(entries, scout, 'nobody')).toEqual([])
    expect(
      menuOrder([sid, iris, { id: 'd', name: 'deploy' }]).map(
        (peer) => peer.name,
      ),
    ).toEqual(['deploy', 'Iris', 'Sid'])
  })
})
