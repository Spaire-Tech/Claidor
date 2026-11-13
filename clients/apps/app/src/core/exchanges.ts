// Two agents' messages to each other, as the page over the chat lays them
// out (Exchanges.swift in ios/SimeonCore; the founder, 9 October 2026, with a
// screenshot as the reference: "when an agent message many at the same
// time, its not all in one chat. its each by each").

import { stampGap } from './chat'
import { sameDay } from './chatRuns'
import { type Entry, earlierCall } from './entry'
import { field, num, str, text } from './json'
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
  return rowsOf(
    said.map((entry) => ({
      id: entry.id,
      sender:
        entry.toAgent != null
          ? agent
          : (entry.fromAgent ?? { id: peerId, name: '' }),
      text: entry.content ?? '',
      date: entry.timestampMs,
    })),
  )
}

/**
 * One line of a cloud agent's conversation, as `getCloudAgentConversation`
 * answers (`CloudAgentLine`, 13 November 2026; the founder: the agent "talks
 * to the cloud agent the same way it talks to another agent"): what the
 * agent asked it (`prompt`), what it said along the way (`update`) and each
 * turn's answer.
 */
export interface CloudAgentLine {
  id: string
  role: 'prompt' | 'update' | 'answer'
  text: string
  /** When it was said, in milliseconds; none when the server gave no time. */
  date?: number
}

const lineRoles: readonly string[] = ['prompt', 'update', 'answer']

/** The lines in `getCloudAgentConversation`'s answer (`{bcId, messages}`); none when the computer answered with nothing. Empty lines and roles the app doesn't know are left out. */
export function cloudAgentLines(answer: unknown): CloudAgentLine[] | undefined {
  const messages = field(answer, 'messages')
  if (!Array.isArray(messages)) return undefined
  const lines: CloudAgentLine[] = []
  for (const message of messages) {
    const id = text(field(message, 'id'))
    const role = str(field(message, 'role')) ?? ''
    const words = (str(field(message, 'text')) ?? '').trim()
    if (!id || !lineRoles.includes(role) || words === '') continue
    const at = num(field(message, 'atMs')) ?? 0
    const line: CloudAgentLine = {
      id,
      role: role as CloudAgentLine['role'],
      text: words,
    }
    if (at > 0) line.date = at
    lines.push(line)
  }
  return lines
}

/**
 * A cloud agent's conversation on the same page (`cloudAgentRows`): what
 * `agent` asked it on the agent's side, what it said along the way and its
 * answers on the cloud agent's, oldest first, stamped as the chat would be.
 * A line the server gave no time takes none.
 */
export function cloudAgentRows(
  lines: readonly CloudAgentLine[],
  agent: Party,
  cloudAgent: Party,
): ExchangeRow[] {
  return rowsOf(
    lines.map((line) => ({
      id: line.id,
      sender: line.role === 'prompt' ? agent : cloudAgent,
      text: line.text,
      date: line.date,
    })),
  )
}

/** One thing said on an exchange page: who said it, and when if known. */
interface Said {
  id: string
  sender: Party
  text: string
  date: number | undefined
}

function rowsOf(said: readonly Said[]): ExchangeRow[] {
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
  for (const line of said) {
    const sender = line.sender
    let stamped = false
    const date = line.date
    if (
      date != null &&
      (lastShown == null ||
        Math.abs(date - lastShown) >= stampGap ||
        !sameDay(date, lastShown))
    ) {
      rows.push({ kind: 'stamp', id: `stamp-${line.id}`, date })
      lastShown = date
      stamped = true
    } else if (date != null) {
      lastShown = date
    }
    const first = stamped || previousSender !== sender.id
    if (first) endRun()
    rows.push({
      kind: 'message',
      id: line.id,
      sender,
      text: line.text,
      first,
      last: false,
    })
    previousSender = sender.id
  }
  endRun()
  return rows
}
