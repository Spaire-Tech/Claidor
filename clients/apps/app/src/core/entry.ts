// One line of a chat as the host writes it (`Entry`, `TranscriptChange` in
// ios/SimeonCore/Sources/SimeonCore/Models.swift and Backend.swift;
// host/extensions/transcript), and the changes the host streams to it.

import {
  type JSONObject,
  type JSONValue,
  arr,
  bool,
  field,
  isObject,
  num,
  str,
  text,
} from './json'
import { type Party, partyFrom } from './models'

/** A call written before calls were one line: its lines were messages with a peer `voice-call:<call>:<seconds>`. */
export function earlierCall(
  party: Party,
): { callId: string; seconds: number } | undefined {
  const parts = party.id.split(':').filter((part) => part !== '')
  if (parts.length < 3 || parts[0] !== 'voice-call') return undefined
  const last = parts[parts.length - 1]!
  if (!/^[+-]?\d+$/.test(last)) return undefined
  return {
    callId: parts.slice(1, parts.length - 1).join(':'),
    seconds: Number(last),
  }
}

/** The kinds that can be a reply in a thread (the window's `D2e`). */
const threadKinds = new Set([
  'message',
  'send-message',
  'user-attachment',
  'notice',
])

export class Entry {
  readonly id: string
  readonly kind: string
  readonly raw: JSONObject

  private constructor(id: string, kind: string, raw: JSONObject) {
    this.id = id
    this.kind = kind
    this.raw = raw
  }

  /** An entry, when the line has an id and a kind. */
  static from(json: unknown): Entry | undefined {
    if (!isObject(json)) return undefined
    const id = text(json.id)
    const kind = text(json.kind)
    return id != null && kind != null ? new Entry(id, kind, json) : undefined
  }

  /** Every line that is one. */
  static list(json: unknown): Entry[] {
    return (arr(json) ?? [])
      .map((line) => Entry.from(line))
      .filter((entry): entry is Entry => entry != null)
  }

  get(key: string): JSONValue | undefined {
    return this.raw[key]
  }

  /** Milliseconds since the epoch. */
  get timestampMs(): number | undefined {
    return num(this.raw.timestampMs)
  }
  get role(): string | undefined {
    return text(this.raw.role)
  }
  get content(): string | undefined {
    return str(this.raw.content)
  }
  get isStreaming(): boolean {
    return bool(this.raw.isStreaming) ?? false
  }
  get message(): JSONValue | undefined {
    return this.raw.message
  }
  get author(): Party | undefined {
    return partyFrom(this.raw.author)
  }
  get toAgent(): Party | undefined {
    return partyFrom(this.raw.toAgent)
  }
  get fromAgent(): Party | undefined {
    return partyFrom(this.raw.fromAgent)
  }
  get event(): JSONValue | undefined {
    return this.raw.event
  }

  get reactions(): { emoji: string; by: string }[] {
    return (arr(this.raw.reactions) ?? []).flatMap((reaction) => {
      const emoji = text(field(reaction, 'emoji'))
      return emoji != null
        ? [{ emoji, by: str(field(reaction, 'by')) ?? '' }]
        : []
    })
  }

  /** The person's own reactions: the computer marks them "me" (`SAND_REACTION_SELF`); "user" is the demo's and older fixtures'. */
  get myReactions(): string[] {
    return this.reactions
      .filter((reaction) => Entry.isMine(reaction.by))
      .map((reaction) => reaction.emoji)
  }

  static isMine(by: string | undefined): boolean {
    return by === 'me' || by === 'user'
  }

  /** The same entry with the person's own `emoji` reaction added, or taken off when it is there, as the computer toggles it (`toggleReaction`). */
  togglingMyReaction(emoji: string): Entry {
    const list = [...(arr(this.raw.reactions) ?? [])]
    const mine = list.findIndex(
      (reaction) =>
        text(field(reaction, 'emoji')) === emoji &&
        Entry.isMine(str(field(reaction, 'by'))),
    )
    if (mine >= 0) list.splice(mine, 1)
    else list.push({ emoji, by: 'me' })
    const raw: JSONObject = { ...this.raw }
    if (list.length === 0) delete raw.reactions
    else raw.reactions = list
    return Entry.from(raw) ?? this
  }

  /** The same entry with `key` set, or taken away for undefined. */
  setting(key: string, value: JSONValue | undefined): Entry {
    const raw: JSONObject = { ...this.raw }
    if (value === undefined) delete raw[key]
    else raw[key] = value
    return Entry.from(raw) ?? this
  }

  /** A reply in a thread (`branched`, on a message, a card, a file or a notice): it is drawn in the thread, not in the chat (the window's `D2e`). */
  get isBranched(): boolean {
    return threadKinds.has(this.kind) && bool(this.raw.branched) === true
  }

  /** The line it answers, for the kinds that can answer one (the window's `u0e`). */
  get threadParent(): string | undefined {
    return threadKinds.has(this.kind) ? text(this.raw.replyTo) : undefined
  }

  /** The person's own message. */
  get isFromPerson(): boolean {
    return (
      (this.kind === 'message' &&
        this.role === 'user' &&
        this.fromAgent == null) ||
      this.kind === 'user-message' ||
      this.kind === 'human-message' ||
      this.kind === 'user-attachment'
    )
  }

  /** An agent's message to a teammate, or a teammate's answer: the window folds these into "N messages with …". */
  get teammate(): Party | undefined {
    return this.toAgent ?? this.fromAgent
  }

  /** The same line, as Swift's `==` compares two (every field). */
  static same(a: Entry | undefined, b: Entry | undefined): boolean {
    if (a === b) return true
    if (!a || !b) return false
    return a.id === b.id && JSON.stringify(a.raw) === JSON.stringify(b.raw)
  }
}

/** One change to a chat (`roster.emit` in host/extensions/transcript/roster-projection.ts). */
export type TranscriptChange =
  | { type: 'upsert'; agentId: string; entry: Entry }
  | { type: 'remove'; agentId: string; entryId: string }
  | { type: 'replace'; agentId: string; entries: Entry[] }

export function transcriptChangeFrom(
  payload: unknown,
): TranscriptChange | undefined {
  switch (str(field(payload, 'type'))) {
    case 'appended':
    case 'updated': {
      const agentId = text(field(payload, 'agentId'))
      const entry = Entry.from(field(payload, 'entry'))
      return agentId != null && entry
        ? { type: 'upsert', agentId, entry }
        : undefined
    }
    case 'removed': {
      const agentId = text(field(payload, 'agentId'))
      const entryId =
        text(field(payload, 'id')) ?? text(field(payload, 'entryId'))
      return agentId != null && entryId != null
        ? { type: 'remove', agentId, entryId }
        : undefined
    }
    case 'cleared': {
      const agentId = text(field(payload, 'agentId'))
      return agentId != null
        ? { type: 'replace', agentId, entries: [] }
        : undefined
    }
    case 'snapshot': {
      const agentId = text(field(payload, 'activeAgentId'))
      const entries = arr(field(payload, 'entries'))
      return agentId != null && entries
        ? { type: 'replace', agentId, entries: Entry.list(entries) }
        : undefined
    }
    default:
      return undefined
  }
}

/** The chat after this change: an entry is swapped in by its id, or added at the end (store.ts `#applyTranscriptEvent`). */
export function appliedChange(
  change: TranscriptChange,
  entries: readonly Entry[],
): Entry[] {
  switch (change.type) {
    case 'upsert': {
      const index = entries.findIndex((entry) => entry.id === change.entry.id)
      if (index < 0) return [...entries, change.entry]
      const next = [...entries]
      next[index] = change.entry
      return next
    }
    case 'remove':
      return entries.filter((entry) => entry.id !== change.entryId)
    case 'replace':
      return change.entries
  }
}
