// Two agents' messages to each other, as the page over the chat lays them
// out (Exchanges.swift in ios/SimeonCore; the founder, 9 October 2026, with a
// screenshot as the reference: "when an agent message many at the same
// time, its not all in one chat. its each by each").

import { stampGap } from './chat'
import { sameDay } from './chatRuns'
import { type Entry, earlierCall } from './entry'
import type { Party } from './models'

/**
 * One line of the page (`ExchangeRow`): a time stamp, or a message with who
 * sent it, and whether it starts or ends that sender's run (the name goes
 * over the first, the picture beside the last).
 */
export type ExchangeRow =
  | { kind: 'stamp'; id: string; date: number }
  | {
      kind: 'message'
      id: string
      sender: Party
      text: string
      first: boolean
      last: boolean
    }

const byName = new Intl.Collator(undefined, { sensitivity: 'accent' })

/** An exchange line's agents in the order its menu lists them: by name (`menuOrder`). */
export function menuOrder(peers: readonly Party[]): Party[] {
  return [...peers].sort((a, b) => byName.compare(a.name, b.name))
}

/**
 * Everything `agent` and the peer said to each other in the agent's chat,
 * oldest first (`exchangeRows`): what the agent sent the peer (`toAgent`)
 * and what the peer sent back (`fromAgent`), whichever line of the chat
 * folded it. A call's lines (written before calls were one line) are not
 * messages between them. A stamp goes where the chat would put one: the
 * first message, then after a quarter of an hour or on a new day.
 */
export function exchangeRows(
  entries: readonly Entry[],
  agent: Party,
  peerId: string,
): ExchangeRow[] {
  const said = entries.filter((entry) => {
    const teammate = entry.teammate
    return (
      entry.kind === 'message' &&
      teammate?.id === peerId &&
      earlierCall(teammate) == null
    )
  })
  const rows: ExchangeRow[] = []
  let lastShown: number | undefined
  let previousSender: string | undefined
  // The run before ends where this one starts.
  const endRun = () => {
    for (let index = rows.length - 1; index >= 0; index -= 1) {
      const row = rows[index]!
      if (row.kind !== 'message') continue
      rows[index] = { ...row, last: true }
      return
    }
  }
  for (const entry of said) {
    const sender =
      entry.toAgent != null
        ? agent
        : (entry.fromAgent ?? { id: peerId, name: '' })
    let stamped = false
    const date = entry.timestampMs
    if (
      date != null &&
      (lastShown == null ||
        Math.abs(date - lastShown) >= stampGap ||
        !sameDay(date, lastShown))
    ) {
      rows.push({ kind: 'stamp', id: `stamp-${entry.id}`, date })
      lastShown = date
      stamped = true
    } else if (date != null) {
      lastShown = date
    }
    const first = stamped || previousSender !== sender.id
    if (first) endRun()
    rows.push({
      kind: 'message',
      id: entry.id,
      sender,
      text: entry.content ?? '',
      first,
      last: false,
    })
    previousSender = sender.id
  }
  endRun()
  return rows
}
