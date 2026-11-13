// Two agents' messages to each other, each pair on its own page
// (CoreTests.swift's `ExchangePageTests`).

import { describe, expect, it } from 'vitest'
import { chatRows, exchangeOf } from './chat'
import { Entry } from './entry'
import {
  cloudAgentLines,
  cloudAgentRows,
  exchangeRows,
  menuOrder,
} from './exchanges'
import type { JSONObject } from './json'
import { type Party, shownName } from './models'

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

// The cloud agent's conversation (ChatExtrasTests.swift's
// `testItsReportIsAMessageFromItAndItsConversationIsAPage`).
describe("a cloud agent's conversation (CloudAgentTests)", () => {
  it('reads its report as a message from it, which is not one of the agents', () => {
    const report = Entry.from({
      kind: 'message',
      id: 'm1',
      role: 'user',
      content: 'Opened pull request #7.',
      fromAgent: { id: 'bc-42', name: 'Fix the login', kind: 'cloud-agent' },
    })!
    const cloud = { id: 'bc-42', name: 'Fix the login', cloudAgent: true }
    expect(report.fromAgent).toEqual(cloud)
    expect(shownName(report.fromAgent!)).toBe('Fix the login')
    expect(exchangeOf([report])).toEqual({
      kind: 'single',
      inbound: true,
      peer: cloud,
    })
    const row = chatRows([report]).at(-1)!
    expect(row.kind).toBe('teammates')
    // One the computer gave no name is "Cloud agent"; a teammate's kind changes nothing.
    const unnamed = Entry.from({
      kind: 'message',
      id: 'm2',
      role: 'user',
      content: 'Done.',
      fromAgent: { id: 'bc-43', name: '', kind: 'cloud-agent' },
    })!
    expect(shownName(unnamed.fromAgent!)).toBe('Cloud agent')
    const teammate = Entry.from({
      kind: 'message',
      id: 'm3',
      role: 'assistant',
      content: 'hi',
      toAgent: { id: 'iris', name: 'Iris', kind: 'agent' },
    })!
    expect(teammate.toAgent).toEqual({ id: 'iris', name: 'Iris' })
    expect(shownName({ id: 'iris', name: '' })).toBe('')
  })

  it("reads the computer's answer and lays it out as a page", () => {
    const answer = {
      bcId: 'bc-42',
      messages: [
        {
          id: 'job-1-user',
          role: 'prompt',
          text: 'Fix the login.',
          atMs: 1_700_000_000_000,
        },
        {
          id: 'update-job-1-0',
          role: 'update',
          text: ' Reading the sign-in code. ',
          atMs: 1_700_000_060_000,
        },
        { id: 'update-job-1-1', role: 'update', text: '   ' },
        { id: 'x', role: 'odd', text: 'no' },
        { role: 'answer', text: 'no id' },
        {
          id: 'job-1-0',
          role: 'answer',
          text: 'Opened pull request #7.',
          atMs: 1_700_000_120_000,
        },
        { id: 'job-2-user', role: 'prompt', text: 'Add a test too.' },
      ],
    }
    const lines = cloudAgentLines(answer)!
    expect(lines).toEqual([
      {
        id: 'job-1-user',
        role: 'prompt',
        text: 'Fix the login.',
        date: 1_700_000_000_000,
      },
      {
        id: 'update-job-1-0',
        role: 'update',
        text: 'Reading the sign-in code.',
        date: 1_700_000_060_000,
      },
      {
        id: 'job-1-0',
        role: 'answer',
        text: 'Opened pull request #7.',
        date: 1_700_000_120_000,
      },
      { id: 'job-2-user', role: 'prompt', text: 'Add a test too.' },
    ])
    expect(cloudAgentLines(null)).toBeUndefined()
    expect(cloudAgentLines({ bcId: 'bc-42' })).toBeUndefined()
    expect(cloudAgentLines({ messages: [] })).toEqual([])

    // The agent's side for what it asked, the cloud agent's for the rest; one stamp, runs joined.
    const leo = { id: 'leo', name: 'Leo' }
    const cloud: Party = {
      id: 'bc-42',
      name: 'Fix the login',
      cloudAgent: true,
    }
    expect(cloudAgentRows(lines, leo, cloud)).toEqual([
      { kind: 'stamp', id: 'stamp-job-1-user', date: 1_700_000_000_000 },
      {
        kind: 'message',
        id: 'job-1-user',
        sender: leo,
        text: 'Fix the login.',
        first: true,
        last: true,
      },
      {
        kind: 'message',
        id: 'update-job-1-0',
        sender: cloud,
        text: 'Reading the sign-in code.',
        first: true,
        last: false,
      },
      {
        kind: 'message',
        id: 'job-1-0',
        sender: cloud,
        text: 'Opened pull request #7.',
        first: false,
        last: true,
      },
      {
        kind: 'message',
        id: 'job-2-user',
        sender: leo,
        text: 'Add a test too.',
        first: true,
        last: true,
      },
    ])
    expect(cloudAgentRows([], leo, cloud)).toEqual([])
  })
})
