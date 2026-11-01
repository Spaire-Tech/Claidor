// A chat line's place among its neighbours, as the Mac window reads it
// (`RunFlags` and `Chat.runFlags` in
// ios/SimeonCore/Sources/SimeonCore/ChatRuns.swift, the window's `npt` and
// `REn`): whether someone else spoke before it, which sets it 12 lower, and
// whether the bubble before or after it is the same sender's, which turns its
// corner on that side to 6. The fixture `Fixtures/chat-runs.json` in the
// core's tests was made by running the window's own functions.

import { loneLink } from './chat'
import type { Entry } from './entry'
import { arr, bool, field, str } from './json'

export interface RunFlags {
  /** Someone else spoke before it (`isGroupStart`). */
  startsGroup: boolean
  /** The bubble before it is the same sender's (`isContinuedFromPrev`). */
  continuesPrevious: boolean
  /** The bubble after it is the same sender's (`isContinuedToNext`). */
  continuesNext: boolean
  /** Its thread's "1 reply" hangs under it (`isFollowedByThreadChip`). */
  aboveThreadChip: boolean
}

export const noRun: RunFlags = {
  startsGroup: false,
  continuesPrevious: false,
  continuesNext: false,
  aboveThreadChip: false,
}

type ItemKind =
  | 'entry'
  | 'timestamp'
  | 'unread-divider'
  | 'attachment-group'
  | 'agent-comm-group'
  | 'routine-event-group'

export interface DisplayItem {
  kind: ItemKind
  entries: Entry[]
  /** The hidden step just before it (`precedingBreakEntry`). */
  breakEntry?: Entry
}

const firstOf = (item: DisplayItem) =>
  item.kind === 'timestamp' || item.kind === 'unread-divider'
    ? undefined
    : item.entries[0]
const lastOf = (item: DisplayItem) =>
  item.kind === 'timestamp' || item.kind === 'unread-divider'
    ? undefined
    : item.entries[item.entries.length - 1]

/** Each item's flags, by the id of its first line. */
export function runFlags(
  entries: readonly Entry[],
  unreadAfter?: number,
  threads: ReadonlySet<string> = new Set(),
): Record<string, RunFlags> {
  const items = displayItems(entries, unreadAfter)
  const flags: Record<string, RunFlags> = {}
  items.forEach((item, index) => {
    if (item.kind !== 'entry' && item.kind !== 'attachment-group') return
    const self = firstOf(item)
    if (!self) return
    const previous =
      item.breakEntry ?? (index > 0 ? lastOf(items[index - 1]!) : undefined)
    const after = items[index + 1]
    const next = after ? (after.breakEntry ?? firstOf(after)) : undefined
    flags[self.id] = run(
      self,
      previous,
      next,
      threads.has(self.id),
      previous ? threads.has(previous.id) : false,
    )
  })
  return flags
}

/** The window's `REn` with no working line under the chat. */
function run(
  entry: Entry,
  previous: Entry | undefined,
  next: Entry | undefined,
  hasThread: boolean,
  previousHasThread: boolean,
): RunFlags {
  if (side(entry) === 'other') return { ...noRun }
  const key = senderKey(entry)
  const bubble = isBubble(entry)
  return {
    startsGroup: previous ? senderKey(previous) !== key : false,
    continuesPrevious:
      bubble &&
      !previousHasThread &&
      previous != null &&
      senderKey(previous) === key &&
      isBubble(previous),
    continuesNext:
      bubble && next != null && senderKey(next) === key && isBubble(next),
    aboveThreadChip: bubble && hasThread && entry.reactions.length === 0,
  }
}

/** The window's `npt`, then `YIn`, `KIn` and `WIn`. */
export function displayItems(
  entries: readonly Entry[],
  unreadAfter?: number,
): DisplayItem[] {
  const items: DisplayItem[] = []
  let lastTime: number | undefined
  const seen = new Set<string>()
  let pendingBreak: Entry | undefined
  let shown = false
  let dividerPlaced = false
  for (const entry of entries) {
    if (isStartingAnswer(entry)) continue
    if (entry.kind === 'tool-call' || isOpenLocalAsk(entry)) {
      if (shown) pendingBreak = entry
      continue
    }
    if (isLineToPerson(entry)) continue
    const nonce = str(entry.get('clientNonce'))
    const key = entry.kind === 'message' && nonce ? `nonce:${nonce}` : entry.id
    if (seen.has(key)) continue
    seen.add(key)
    const time = shownTime(entry)
    if (
      !dividerPlaced &&
      unreadAfter != null &&
      side(entry) !== 'user' &&
      time != null &&
      time > unreadAfter
    ) {
      items.push({ kind: 'unread-divider', entries: [] })
      dividerPlaced = true
    }
    if (time != null) {
      if (stampDue(time, lastTime))
        items.splice(stampPlace(items, entry), 0, {
          kind: 'timestamp',
          entries: [],
        })
      lastTime = time
    }
    items.push({ kind: 'entry', entries: [entry], breakEntry: pendingBreak })
    pendingBreak = undefined
    shown = true
  }
  return routineGroups(exchangeGroups(attachmentGroups(items)))
}

/** `aee`: a line's time, when it has a real one. */
function shownTime(entry: Entry): number | undefined {
  const time = entry.timestampMs
  return time != null && Number.isFinite(time) && time > 0 ? time : undefined
}

/** Whether two times are on the same day where the person is. */
export function sameDay(a: number, b: number): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString()
}

/** `zIn`: the first line, a quarter of an hour on, or another day. */
function stampDue(time: number, last: number | undefined): boolean {
  if (last == null) return true
  return Math.abs(time - last) >= 900_000 || !sameDay(time, last)
}

/** `$In`: before the untimed lines of the same side just before it. */
function stampPlace(items: DisplayItem[], before: Entry): number {
  const wanted = side(before)
  let place = items.length
  while (place > 0) {
    const item = items[place - 1]!
    const line = item.entries[0]
    if (
      item.kind !== 'entry' ||
      !line ||
      side(line) !== wanted ||
      shownTime(line) != null
    )
      return place
    place -= 1
  }
  return place
}

const messageType = (entry: Entry) => str(field(entry.message, 'type'))

/** `BIn`: an agent's answer that has started and has no words yet. */
function isStartingAnswer(entry: Entry): boolean {
  return (
    entry.kind === 'send-message' &&
    bool(entry.get('streaming')) === true &&
    messageType(entry) === 'text' &&
    (str(field(entry.message, 'content')) ?? '') === ''
  )
}

/** `NNe` and `RMt`: an ask to use this computer still waiting, or expired. */
function isOpenLocalAsk(entry: Entry): boolean {
  if (
    entry.kind !== 'send-message' ||
    messageType(entry) !== 'local-tool-permission'
  )
    return false
  const status = str(field(field(entry.message, 'ask'), 'status'))
  return status === 'pending' || status === 'expired'
}

/** `Rde`: a line to someone who is not an agent (a call's line to the person). */
export function isLineToPerson(entry: Entry): boolean {
  const to = entry.get('toAgent')
  if (entry.kind !== 'message' || to == null) return false
  return str(field(to, 'kind')) !== 'agent'
}

/** `fm`: a line between this agent and another. */
function isTeammateLine(entry: Entry): boolean {
  return (
    entry.kind === 'message' &&
    (entry.fromAgent != null || entry.toAgent != null)
  )
}

/** `Doe`: drawn as a bubble. */
function isBubble(entry: Entry): boolean {
  if (loneLinkCard(entry)) return false
  switch (entry.kind) {
    case 'message':
      if (isTeammateLine(entry) || isLoneEmojiLine(entry)) return false
      return !isPicturesOnly(entry.content ?? '')
    case 'send-message':
      return messageType(entry) === 'text'
    default:
      return false
  }
}

/** `xEn`: a finished text the window draws as a link card. */
function loneLinkCard(entry: Entry): boolean {
  if (entry.kind === 'send-message') {
    const message = entry.message
    if (
      messageType(entry) !== 'text' ||
      bool(entry.get('streaming')) === true ||
      (arr(field(message, 'images')) ?? []).length > 0
    )
      return false
    return loneLink(str(field(message, 'content')) ?? '') != null
  }
  if (
    entry.kind !== 'message' ||
    entry.role !== 'user' ||
    entry.get('fromUser') != null ||
    entry.get('channel') != null ||
    isTeammateLine(entry)
  )
    return false
  return loneLink(entry.content ?? '', str(entry.get('richText'))) != null
}

/** `jht`: the person's message that is one emoji, with no pictures. */
function isLoneEmojiLine(entry: Entry): boolean {
  if (
    entry.kind !== 'message' ||
    entry.role !== 'user' ||
    isTeammateLine(entry) ||
    (arr(entry.get('images')) ?? []).length > 0
  )
    return false
  return isOneEmoji(entry.content ?? '')
}

const graphemes = (words: string): string[] =>
  [
    ...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(
      words,
    ),
  ].map((part) => part.segment)

/** `CEn`: words that are one emoji (`^\p{RGI_Emoji}$`, trimmed), drawn large with no bubble. */
export function isOneEmoji(words: string): boolean {
  const trimmed = words.trim()
  const characters = graphemes(trimmed)
  if (characters.length !== 1) return false
  const scalars = [...trimmed]
  if (scalars.some((scalar) => /\p{Emoji_Presentation}/u.test(scalar)))
    return true
  // A text-default emoji made a picture by its selector (❤️), a keycap (1️⃣) or a flag.
  return (
    scalars.length > 1 &&
    /\p{Emoji}/u.test(scalars[0]!) &&
    scalars.some((scalar) => {
      const code = scalar.codePointAt(0)!
      return (
        code === 0xfe0f ||
        code === 0x20e3 ||
        (code >= 0x1f1e6 && code <= 0x1f1ff)
      )
    })
  )
}

/** Only emoji, three at most (`Bubble.isLoneEmoji`): drawn large with no bubble, as Messages does. */
export function isLoneEmoji(words: string, images = 0): boolean {
  if (images > 0) return false
  const trimmed = words.trim()
  const characters = graphemes(trimmed)
  if (characters.length === 0 || characters.length > 3) return false
  return characters.every((character) => {
    const scalars = [...character]
    return (
      scalars.some((scalar) => /\p{Emoji_Presentation}/u.test(scalar)) ||
      (scalars.length > 1 && /\p{Emoji}/u.test(scalars[0]!))
    )
  })
}

/** `qht`: words that are only Markdown pictures. */
function isPicturesOnly(words: string): boolean {
  const trimmed = words.trim()
  if (trimmed === '') return false
  return trimmed.replace(/!\[[^\]]*\]\([^)]*\)/g, '').trim() === ''
}

/** `YIn` (no thread open): pictures or files sent together, two or more, as one item. */
function attachmentGroups(items: DisplayItem[]): DisplayItem[] {
  const out: DisplayItem[] = []
  let group: DisplayItem[] = []
  let groupKey: string | undefined
  const flush = () => {
    if (group.length >= 2)
      out.push({
        kind: 'attachment-group',
        entries: group.flatMap((item) => item.entries),
        breakEntry: group[0]!.breakEntry,
      })
    else out.push(...group)
    group = []
    groupKey = undefined
  }
  for (const item of items) {
    const line = item.entries[0]
    const key = item.kind === 'entry' && line ? attachmentKey(line) : undefined
    if (key != null) {
      if (group.length > 0 && (key !== groupKey || item.breakEntry != null))
        flush()
      group.push(item)
      groupKey = key
      continue
    }
    flush()
    out.push(item)
  }
  flush()
  return out
}

/** `Qht`: which attachments go together. */
function attachmentKey(entry: Entry): string | undefined {
  const replyTo = [
    'message',
    'send-message',
    'user-attachment',
    'notice',
  ].includes(entry.kind)
    ? str(entry.get('replyTo')) || undefined
    : undefined
  const batch = str(entry.get('batchId')) || undefined
  if (entry.kind === 'user-attachment' && batch != null)
    return replyTo != null ? `ua:${batch}:${replyTo}` : `ua:${batch}`
  if (replyTo != null) return undefined
  if (entry.kind === 'user-attachment') return 'ua:legacy'
  const url = str(field(entry.message, 'url'))
  if (
    entry.kind === 'send-message' &&
    messageType(entry) === 'attachment' &&
    url != null &&
    isPictureOrVideo(url)
  )
    return `ai:${senderKey(entry)}`
  return undefined
}

/** The window's picture extensions (`kft`). */
export const pictureExtensions = new Set([
  'avif',
  'bmp',
  'gif',
  'ico',
  'jpeg',
  'jpg',
  'png',
  'svg',
  'webp',
])

/** The extension of an address's path, lower case. */
function extension(url: string): string {
  let path = url
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) {
    try {
      path = new URL(url).pathname
    } catch {
      path = url
    }
  }
  const last = path.split('/').pop() ?? ''
  const dot = last.lastIndexOf('.')
  return dot > 0 ? last.slice(dot + 1).toLowerCase() : ''
}

/** `IZ`: a picture or a video, by its extension (`kft`, `uAe`). */
export function isPictureOrVideo(url: string): boolean {
  const ext = extension(url)
  return (
    pictureExtensions.has(ext) ||
    ['m4v', 'mov', 'mp4', 'ogv', 'webm'].includes(ext)
  )
}

/** `KIn`: the lines between this agent and others, one call's lines apart from the rest (`__simeonVoiceKey`). */
function exchangeGroups(items: DisplayItem[]): DisplayItem[] {
  const out: DisplayItem[] = []
  let group: DisplayItem[] = []
  const flush = () => {
    if (group.length > 0)
      out.push({
        kind: 'agent-comm-group',
        entries: group.flatMap((item) => item.entries),
        breakEntry: group[0]!.breakEntry,
      })
    group = []
  }
  for (const item of items) {
    const line = item.entries[0]
    if (item.kind === 'entry' && line && isTeammateLine(line)) {
      const first = group[0]?.entries[0]
      if (first && voiceKey(first) !== voiceKey(line)) flush()
      group.push(item)
      continue
    }
    flush()
    out.push(item)
  }
  flush()
  return out
}

function voiceKey(entry: Entry): string {
  const peer = entry.fromAgent ?? entry.toAgent
  return peer?.id.startsWith('voice-call:') ? peer.id : ''
}

/** `WIn`: two or more routine changes in a row as one item. */
function routineGroups(items: DisplayItem[]): DisplayItem[] {
  const out: DisplayItem[] = []
  let group: DisplayItem[] = []
  const flush = () => {
    if (group.length >= 2)
      out.push({
        kind: 'routine-event-group',
        entries: group.flatMap((item) => item.entries),
        breakEntry: group[0]!.breakEntry,
      })
    else out.push(...group)
    group = []
  }
  for (const item of items) {
    const line = item.entries[0]
    if (
      item.kind === 'entry' &&
      line &&
      line.kind === 'event' &&
      str(field(line.event, 'type')) === 'automation-changed'
    ) {
      group.push(item)
      continue
    }
    flush()
    out.push(item)
  }
  flush()
  return out
}

/** The window's `Tpe`: who a line is from, for runs. */
export function senderKey(entry: Entry): string {
  const author = entry.author
  if (entry.kind === 'send-message' && author) return `member:${author.id}`
  if (entry.kind === 'message') {
    const from = entry.fromAgent
    if (from) return `agent:${from.id}`
    const human = entry.get('fromUser')
    if (human != null) return `human:${str(field(human, 'authId')) ?? ''}`
    const to = entry.toAgent
    if (to && str(field(entry.get('toAgent'), 'kind')) === 'agent')
      return `agent:${to.id}`
  }
  return side(entry)
}

/** The window's `JZ`: "assistant", "user", the message's role, or "other". */
export function side(entry: Entry): string {
  if (isLineToPerson(entry)) return 'other'
  switch (entry.kind) {
    case 'message': {
      const fromUser = entry.get('fromUser') != null
      if (isTeammateLine(entry) || fromUser) return 'assistant'
      return entry.role ?? ''
    }
    case 'send-message':
      return 'assistant'
    case 'user-attachment':
      return 'user'
    default:
      return 'other'
  }
}
