// A chat's rows, as the Mac draws them (`ChatRow`, `Bubble` and `Chat` in
// ios/SimeonCore/Sources/SimeonCore/Chat.swift; the window's `npt` and
// `WIn`): a time stamp after a quarter of an hour, the "New" line before the
// first unread message, the person's bubbles on the right, an agent's on the
// left, agents talking to each other folded into one line, routines changed
// one after another into one, a thread's replies counted under their message.
//
// The cards (questions, drafts, flights, approvals and the rest) come with
// step 3 (docs/web-app/PROGRESS.md): until then each is a `card` row that
// keeps its line, and the chat says it can't be shown in this version.

import {
  isOneEmoji,
  isPictureOrVideo,
  side as lineSide,
  pictureExtensions,
  sameDay,
} from './chatRuns'
import { Entry, earlierCall } from './entry'
import {
  type JSONValue,
  arr,
  bool,
  field,
  int,
  isObject,
  num,
  parseJSON,
  str,
  text,
} from './json'
import { t, tk } from './l10n'
import { displayLocale } from './listTime'
import { soleFence } from './markdown'
import { type Party, fileName, fileTitle } from './models'
import { plainError } from './plainWords'
import { storeEntryCard, storeHeadline } from './requestCards'

/** Whose side a row sits on, for spacing runs: the person, an agent (by id, or none), or the middle. */
export type Side = 'person' | 'middle' | `agent:${string}`

/** A picture an agent sent with a message (`message.images`): a `file://` path on its computer or an `https` address, and its shape when known. */
export interface ChatImage {
  url: string
  alt: string
  width?: number
  height?: number
}

export function chatImageFrom(json: unknown): ChatImage | undefined {
  const url = text(field(json, 'url')) ?? text(json)
  if (
    !url ||
    !(
      url.startsWith('file://') ||
      url.startsWith('https://') ||
      url.startsWith('/')
    )
  )
    return undefined
  const positive = (value: unknown) => {
    const n = num(value)
    return n != null && n > 0 ? n : undefined
  }
  return {
    url,
    alt: str(field(json, 'alt')) ?? '',
    width: positive(field(json, 'width')),
    height: positive(field(json, 'height')),
  }
}

/** Width over height; 4:3 when the shape is not known (the window's gallery). */
export function aspect(image: ChatImage): number {
  return image.width != null && image.height != null
    ? image.width / image.height
    : 4 / 3
}

/**
 * A message that came in from a messaging channel or that the agent sent to
 * one (the window's `eTe`): the platform's name, and who sent it.
 */
export interface ChannelTag {
  platform: string
  inbound: boolean
  sender?: string
}

export function channelTag(
  channel: string | undefined,
  inbound: boolean,
  sender?: string,
): ChannelTag | undefined {
  if (channel == null) return undefined
  const trimmed = channel.trim()
  const colon = trimmed.indexOf(':')
  if (colon <= 0) return undefined
  const platform = trimmed.slice(0, colon).trim()
  const chat = trimmed.slice(colon + 1).trim()
  if (platform === '' || chat === '') return undefined
  const named: Record<string, string> = { discord: 'Discord', slack: 'Slack' }
  return { platform: named[platform] ?? platform, inbound, sender }
}

/** "From Ada on Discord", "From Discord", "Sent to Slack". */
export function channelTitle(tag: ChannelTag): string {
  if (!tag.inbound) return t`Sent to ${tag.platform}`
  if (tag.sender) return t`From ${tag.sender} on ${tag.platform}`
  return t`From ${tag.platform}`
}

export interface Bubble {
  id: string
  text: string
  fromPerson: boolean
  /** In a group, the member who spoke. */
  author?: Party
  /** In a group: the author's name above the first of their bubbles in a row, the picture beside the last. */
  showsName: boolean
  showsAvatar: boolean
  reactions: string[]
  /** The reactions that are the person's own: a pick of one takes it back. */
  myReactions: string[]
  isStreaming: boolean
  /** The message this one answers (`replyTo`), and its line as the window quotes it above the bubble. */
  replyTo?: string
  quote?: string
  /** Milliseconds since the epoch. */
  timestampMs?: number
  /** An agent's pictures (`message.images`), drawn under its words. */
  images: ChatImage[]
  /** A message of the person's held while the computer was out of reach, when it was written (`sentWhileOfflineAtMs`). */
  sentOfflineAtMs?: number
  /** The one link the message is, drawn as a card instead of a bubble (the window's `xEn`). */
  loneLink?: string
  /** It came from a messaging channel, or the agent sent it to one. */
  channel?: ChannelTag
  /** The agent saying who it is (`message.introduction`): its own name in these words is drawn in its pill. */
  introduces: boolean
}

function bubble(
  fields: Partial<Bubble> & Pick<Bubble, 'id' | 'text' | 'fromPerson'>,
): Bubble {
  return {
    showsName: false,
    showsAvatar: false,
    reactions: [],
    myReactions: [],
    isStreaming: false,
    images: [],
    introduces: false,
    ...fields,
  }
}

/** Agents talking to each other, folded (the window's `JIn`/`WPn`): one message, a fan-out, or a thread. */
export type Exchange =
  | { kind: 'single'; inbound: boolean; peer: Party }
  | { kind: 'fanout'; peers: Party[] }
  | { kind: 'thread'; count: number; peers: Party[] }

/** The words before the agents' chip: "Message from", "Messaged", "4 messages with". */
export function exchangeLabel(exchange: Exchange): string {
  switch (exchange.kind) {
    case 'single':
      return exchange.inbound ? t('Message from') : t('Messaged')
    case 'fanout':
      return t('Messaged')
    case 'thread':
      return t`${exchange.count} messages with`
  }
}

export function exchangePeers(exchange: Exchange): Party[] {
  return exchange.kind === 'single' ? [exchange.peer] : exchange.peers
}

/** A routine named in a "Created routine" line. */
export interface RoutineRef {
  id: string
  name: string
}

/** One line of a call: who said it, and what. */
export interface CallLine {
  fromPerson: boolean
  text: string
}

/** The cards step 3 draws, each keeping its line until then. */
export type CardKind =
  | 'flights'
  | 'question'
  | 'draft'
  | 'connectors'
  | 'listenerConnect'
  | 'approval'
  | 'secret'
  | 'computer'
  | 'form'
  | 'credential'
  | 'onePasswordConnect'
  | 'storeEntry'
  | 'cloudAgent'
  | 'purchase'
  | 'products'
  | 'flightPassengers'
  | 'joined'

export type ChatRow =
  /** A time over the messages after a quarter of an hour. */
  | { kind: 'stamp'; id: string; date: number }
  /** "New" before the first unread message. */
  | { kind: 'unread'; id: string }
  | { kind: 'bubble'; id: string; bubble: Bubble }
  | { kind: 'file'; id: string; name: string; url: string; fromPerson: boolean }
  | { kind: 'teammates'; id: string; exchange: Exchange; entries: Entry[] }
  /** A call with the agent: its length and what both said; `live` while it is on. */
  | {
      kind: 'voiceCall'
      id: string
      seconds: number
      lines: CallLine[]
      live: boolean
    }
  | { kind: 'routines'; id: string; action: string; routines: RoutineRef[] }
  /** A line about the chat, or a card this version cannot draw. */
  | { kind: 'notice'; id: string; text: string }
  /** Under a message of the person's that did not reach the agent: "Failed to send", Resend, Delete. */
  | { kind: 'failedSend'; id: string; nonce: string }
  /** Under a message held while the computer was out of reach: "Waiting to send…", and Cancel. */
  | { kind: 'queuedSend'; id: string; nonce: string }
  /** Under a message that has a thread: "1 reply", "3 replies", on the message's side. */
  | { kind: 'thread'; id: string; rootId: string; count: number; side: Side }
  /** A card (step 3), with its line. */
  | { kind: 'card'; id: string; card: CardKind; entry: Entry }

/** Whose side the row sits on (`ChatRow.side`). */
export function rowSide(row: ChatRow): Side {
  switch (row.kind) {
    case 'bubble':
      return row.bubble.fromPerson
        ? 'person'
        : `agent:${row.bubble.author?.id ?? ''}`
    case 'file':
      return row.fromPerson ? 'person' : 'agent:'
    case 'failedSend':
    case 'queuedSend':
      return 'person'
    case 'thread':
      return row.side
    case 'card':
    case 'notice':
      return 'agent:'
    default:
      return 'middle'
  }
}

/** A new stamp after a quarter of an hour without a line, or on a new day (the window's `zIn`). */
export const stampGap = 15 * 60 * 1000

export const notShown = () =>
  t("This message can't be shown in this version of Simeon.")

/** The cards the core says in the message's own words when it can't read them (`message["content"] ?? notShown`). */
const ownWordsCards: ReadonlySet<CardKind> = new Set([
  'purchase',
  'products',
  'flightPassengers',
  'joined',
])

/**
 * What the chat says, as a notice, for a card whose line can't be read
 * (Chat.swift's `row(for:)`): a checkout, products, the travellers' form
 * and a teammate joined say the message's own words when it has them; the
 * others, "This message can't be shown…".
 */
export function unreadCardWords(kind: CardKind, entry: Entry): string {
  return (
    (ownWordsCards.has(kind)
      ? text(field(entry.message, 'content'))
      : undefined) ?? notShown()
  )
}

/**
 * A long text cut for drawing (the Mac folds a message past 664 pt behind
 * "Show more"): at most `limit` characters, at the last line break in its
 * final fifth when there is one; whether anything was left out.
 */
export function clipped(
  words: string,
  limit: number,
): { text: string; clipped: boolean } {
  const characters = [...words]
  if (characters.length <= limit) return { text: words, clipped: false }
  const head = characters.slice(0, limit).join('')
  const lineBreak = head.lastIndexOf('\n')
  if (lineBreak >= 0 && [...head.slice(0, lineBreak)].length > (limit * 4) / 5)
    return { text: head.slice(0, lineBreak), clipped: true }
  return { text: head + '…', clipped: true }
}

/** A code block as drawn: at most `lines` lines, each at most `width` characters. */
export function clippedCode(
  words: string,
  lines: number,
  width: number,
): { text: string; clipped: boolean } {
  let cut = false
  const out: string[] = []
  for (const line of words.split('\n')) {
    if (out.length === lines) {
      cut = true
      break
    }
    const characters = [...line]
    if (characters.length > width) {
      out.push(characters.slice(0, width).join('') + '…')
      cut = true
    } else out.push(line)
  }
  return { text: out.join('\n'), clipped: cut }
}

/**
 * The chat's rows. `unreadAfter` (milliseconds) puts the "New" line before
 * the first agent's line written after it. A thread's replies stay out of
 * it: one whose thread's first message is here is counted under that message
 * ("N replies"); one whose first message isn't loaded stays in the chat,
 * unless older lines may still hold it (`mayHoldOlderHistory`).
 */
export function chatRows(
  entries: readonly Entry[],
  options: {
    isGroup?: boolean
    unreadAfter?: number
    mayHoldOlderHistory?: boolean
  } = {},
): ChatRow[] {
  const isGroup = options.isGroup ?? false
  if (!entries.some((entry) => entry.isBranched))
    return layout(entries, { isGroup, unreadAfter: options.unreadAfter })
  const split = threadSplit(entries, options.mayHoldOlderHistory ?? false)
  // Quotes read every line: a message in the chat can answer a reply in a thread.
  const rows = layout(split.visible, {
    quoting: entries,
    isGroup,
    unreadAfter: options.unreadAfter,
  })
  if (split.counts.size === 0) return rows
  const out: ChatRow[] = []
  for (const row of rows) {
    out.push(row)
    const count = split.counts.get(row.id)
    if (count != null && !isSendState(row))
      out.push({
        kind: 'thread',
        id: `thread-${row.id}`,
        rootId: row.id,
        count,
        side: rowSide(row),
      })
  }
  return out
}

function isSendState(row: ChatRow): boolean {
  return ['failedSend', 'queuedSend', 'thread', 'stamp', 'unread'].includes(
    row.kind,
  )
}

/** The window's `N_n`: the lines the chat shows, and each thread's count of replies, by its first message's id. */
export function threadSplit(
  entries: readonly Entry[],
  mayHoldOlderHistory = false,
): { visible: Entry[]; counts: Map<string, number> } {
  const byId = byIdLast(entries)
  const visible: Entry[] = []
  const counts = new Map<string, number>()
  for (const entry of entries) {
    if (!entry.isBranched) {
      visible.push(entry)
      continue
    }
    const root = threadRoot(entry, byId)
    if (root == null) {
      if (!mayHoldOlderHistory) visible.push(entry)
      continue
    }
    counts.set(root, (counts.get(root) ?? 0) + 1)
  }
  return { visible, counts }
}

function byIdLast(entries: readonly Entry[]): Map<string, Entry> {
  const out = new Map<string, Entry>()
  for (const entry of entries) out.set(entry.id, entry)
  return out
}

/** A thread on its own (the window's thread view): the message it started from, then every reply in it. */
export function threadRows(
  rootId: string,
  entries: readonly Entry[],
  isGroup = false,
): ChatRow[] {
  return layout(threadEntries(rootId, entries), { quoting: entries, isGroup })
}

/** The thread's lines: its first message, then the replies that lead back to it. */
export function threadEntries(
  rootId: string,
  entries: readonly Entry[],
): Entry[] {
  const byId = byIdLast(entries)
  const replies = entries.filter(
    (entry) => entry.isBranched && threadRoot(entry, byId) === rootId,
  )
  const root = byId.get(rootId)
  return root ? [root, ...replies] : replies
}

/** How many replies each thread has, by the id of the message it started from. */
export function threadCounts(entries: readonly Entry[]): Map<string, number> {
  return threadSplit(entries).counts
}

/**
 * The message a reply's thread started from (the window's `x_n`): up its
 * `replyTo`s through other replies to the first line that is not one.
 * Undefined when a line on the way isn't loaded, for a line that answers
 * nothing, and for a loop.
 */
export function threadRoot(
  entry: Entry,
  byId: ReadonlyMap<string, Entry>,
): string | undefined {
  let current = entry
  const seen = new Set([entry.id])
  for (;;) {
    const parent = current.threadParent
    const next = parent != null ? byId.get(parent) : undefined
    if (parent == null || !next) return undefined
    if (!next.isBranched) return parent
    if (seen.has(parent)) return undefined
    seen.add(parent)
    current = next
  }
}

/** What a line is, as a reply or a thread names it (the window's `ide`). */
type ReplyPreview =
  | { kind: 'text'; text: string }
  | { kind: 'image'; url: string }
  | { kind: 'file'; url: string; name?: string }
  | { kind: 'link'; url: string }
  | { kind: 'missing' }

function replyPreview(entry: Entry | undefined): ReplyPreview {
  if (!entry) return { kind: 'missing' }
  switch (entry.kind) {
    case 'message':
      return { kind: 'text', text: entry.content ?? '' }
    case 'send-message': {
      const message = entry.message
      if (message == null) return { kind: 'missing' }
      if (str(field(message, 'type')) === 'attachment') {
        const url = text(field(message, 'url')) ?? ''
        const name = text(field(message, 'file_name'))
        const lower = url.toLowerCase()
        const isWeb = lower.startsWith('https:') || lower.startsWith('http:')
        if (isWeb && (name ?? '') === '') return { kind: 'link', url }
        if (isPicture(name ?? url)) return { kind: 'image', url }
        return { kind: 'file', url, name }
      }
      return { kind: 'text', text: cardText(message) }
    }
    case 'user-attachment': {
      const path = text(entry.get('file_path')) ?? ''
      const name = text(entry.get('file_name'))
      return isPicture(name ?? path)
        ? { kind: 'image', url: path }
        : { kind: 'file', url: path, name }
    }
    default:
      return { kind: 'missing' }
  }
}

/** The host of an address, or undefined. */
function hostOf(url: string): string | undefined {
  try {
    const host = new URL(url).hostname
    return host === '' ? undefined : host
  } catch {
    return undefined
  }
}

/**
 * A thread's name in its header (the window's `jvn` over `ide`): its first
 * message's words without their Markdown, up to 40 characters (cut at 39,
 * its trailing punctuation dropped, and "…"), "Thread" when it has none;
 * "Photo" for a picture, a file's name, a link's host.
 */
export function threadTitle(root: Entry | undefined): string {
  const preview = replyPreview(root)
  switch (preview.kind) {
    case 'text': {
      const words = plainPreview(preview.text)
      if (words === '') return t('Thread')
      const characters = [...words]
      if (characters.length <= 40) return words
      let head = characters.slice(0, 39).join('')
      while (head !== '' && /[\s:;,.!?–—-]$/u.test(head))
        head = [...head].slice(0, -1).join('')
      return head + '…'
    }
    case 'image':
      return t('Photo')
    case 'file':
      return fileTitle(preview.name ? preview.name : fileBaseName(preview.url))
    case 'link':
      return hostOf(preview.url) ?? preview.url
    case 'missing':
      return t('Thread')
  }
}

/** The words a card stands for in a quote or a thread's name (the window's `PAe`). */
export function cardText(message: unknown): string {
  const of = (...keys: string[]) => {
    let value: unknown = message
    for (const key of keys) value = field(value, key)
    return str(value) ?? ''
  }
  switch (str(field(message, 'type')) ?? '') {
    case 'text':
      return of('content')
    case 'attachment':
      return of('url')
    case 'widget':
      return of('widget', 'prompt')
    case 'cloud-agent': {
      const title = of('title').trim()
      return title === '' ? t('Cloud agent') : t`Cloud agent: ${title}`
    }
    case 'secret-request':
      return of('secretRequest', 'label')
    case 'user-form':
      return of('form', 'title')
    case 'credential-request':
      return of('credential', 'title')
    case 'onepassword-connect':
      return t('Connect 1Password')
    case 'store-entry': {
      const card = storeEntryCard(message as JSONValue)
      return card === undefined ? '' : storeHeadline(card)
    }
    case 'email-draft': {
      const subject = of('draft', 'subject')
      return subject === '' ? of('draft', 'body') : subject
    }
    case 'slack-draft':
      return of('draft', 'body')
    case 'permission-request':
      return of('permission', 'title')
    case 'auto-review-approval':
      return t`Approval required: ${of('approval', 'summary')}`
    case 'local-tool-permission':
      return t`Permission required: ${of('ask', 'target')}`
    case 'connector': {
      const name = of('connector')
      return str(field(message, 'variant')) === 'connected'
        ? t`${name} connected`
        : t`Connect ${name}`
    }
    case 'connectors': {
      const names = (arr(field(message, 'connectors')) ?? [])
        .map(text)
        .filter((n): n is string => n != null)
      return names.length === 0
        ? t('Connect tools')
        : t`Connect ${names.join(', ')}`
    }
    case 'listener-connect':
      return str(field(message, 'platform')) === 'slack'
        ? t('Connect Slack')
        : t('Connect GitHub')
    case 'purchase':
      return str(field(message, 'content')) ?? t('Checkout')
    case 'products':
      return str(field(message, 'content')) ?? t('Products')
    case 'flight-passengers':
      return str(field(message, 'content')) ?? t('Traveller details')
    case 'agent-joined': {
      const name = text(field(message, 'name'))
      return name != null ? joinedTitle(name) : t('Message')
    }
    default:
      return t('Message')
  }
}

/** "Iris just joined your team" (`JoinedCard.title`). */
export function joinedTitle(name: string): string {
  return t`${name} just joined your team`
}

export function isPicture(nameOrPath: string): boolean {
  const last =
    nameOrPath
      .split(/[/\\]/)
      .filter((part) => part !== '')
      .pop() ?? nameOrPath
  const dot = last.lastIndexOf('.')
  if (dot <= 0 || dot === last.length - 1) return false
  return pictureExtensions.has(last.slice(dot + 1).toLowerCase())
}

/** A file's name from its address, as the window's `JAe` takes it: the last part of the path, decoded. */
export function fileBaseName(url: string): string {
  let path = url
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) {
    try {
      const pathname = new URL(url).pathname
      try {
        path = decodeURIComponent(pathname)
      } catch {
        path = pathname
      }
    } catch {
      path = url
    }
  }
  while (path.endsWith('/')) path = path.slice(0, -1)
  const last = path.split('/').pop() ?? path
  return last === '' ? url : last
}

const previewRules: [RegExp, string][] = [
  [/`+/g, ''],
  [/!\[([^\]]*)\]\([^)]*\)/g, '$1'],
  [/\[([^\]]+)\]\([^)]*\)/g, '$1'],
  [/\$\$((?:[^$\\]|\\[\s\S])+)\$\$/g, '$1'],
  [/\\\(([\s\S]+?)\\\)/g, '$1'],
  [/\\\[([\s\S]+?)\\\]/g, '$1'],
  [/\\\$/g, '$$'],
  [/^\s{0,3}#{1,6}\s+/gm, ''],
  [/^\s{0,3}>\s?/gm, ''],
  [/^\s{0,3}(?:[-*+]|\d+[.)])\s+/gm, ''],
  [/\*\*([^*]+)\*\*/g, '$1'],
  [/__([^_]+)__/g, '$1'],
  [/~~([^~]+)~~/g, '$1'],
  [/\*([^*\n]+)\*/g, '$1'],
  [
    /(?<![\p{L}\p{M}\p{Nd}\p{Pc}])_([^_\n]+)_(?![\p{L}\p{M}\p{Nd}\p{Pc}])/gu,
    '$1',
  ],
  [/\|/g, ' '],
]

/** A message's words without their Markdown, on one line (the window's `o5e` and its `Xun` rules). */
export function plainPreview(words: string): string {
  let out = words
  for (const [pattern, template] of previewRules)
    out = out.replace(pattern, template)
  return out.split(/\s+/u).filter(Boolean).join(' ')
}

/** An `https:` address with a host, from words that are only it. */
function httpsLink(words: string): string | undefined {
  const address = words.trim()
  const lower = address.toLowerCase()
  if (!lower.startsWith('https://') && !lower.startsWith('http://'))
    return undefined
  try {
    const url = new URL(address)
    if (url.protocol !== 'https:' || url.hostname === '') return undefined
    return address
  } catch {
    return undefined
  }
}

const markdownLink = /^\[[^\]\n]*\]\(\s*([^)\s]+)(?:\s+[^)]*)?\)\s*$/

/**
 * A message that is one link and nothing else (the window's `cGe`). When it
 * carries the composer's document (`richText`), that decides; without one,
 * the words, trimmed, exactly `[words](address)` or the address alone. Only
 * an `https:` address with a host is a card.
 */
export function loneLink(words: string, richText?: string): string | undefined {
  const doc = richDocument(richText)
  if (doc) return documentLink(doc)
  const trimmedWords = words.trim()
  const match = markdownLink.exec(trimmedWords)
  return httpsLink(match ? match[1]! : trimmedWords)
}

export type DocNode = { [key: string]: unknown }

/** The composer's document (TipTap's JSON) when `richText` is one (`KAe`, `Chat.document`). */
export function richDocument(
  richText: string | undefined,
): DocNode | undefined {
  if (!richText) return undefined
  const doc = parseJSON(richText)
  return isObject(doc) && doc.type === 'doc' ? (doc as DocNode) : undefined
}

function documentLink(doc: DocNode): string | undefined {
  const nodes = (node: DocNode): DocNode[] =>
    Array.isArray(node.content)
      ? (node.content.filter(isObject) as DocNode[])
      : []
  const blankText = (node: DocNode) =>
    (typeof node.text === 'string' ? node.text : '').trim() === ''
  const isBreak = (node: DocNode) => node.type === 'hardBreak'
  const blankPiece = (node: DocNode) =>
    isBreak(node) || (node.type === 'text' && blankText(node))
  // A paragraph of nothing but spaces and line breaks (`iGe`).
  const blank = (node: DocNode) =>
    node.type === 'paragraph' && nodes(node).every(blankPiece)
  const blocks = nodes(doc)
  while (blocks.length > 0 && blank(blocks[0]!)) blocks.shift()
  while (blocks.length > 0 && blank(blocks[blocks.length - 1]!)) blocks.pop()
  if (blocks.length !== 1 || blocks[0]!.type !== 'paragraph') return undefined
  let pieces = nodes(blocks[0]!)
  while (pieces.length > 0 && blankPiece(pieces[0]!)) pieces.shift()
  while (pieces.length > 0 && blankPiece(pieces[pieces.length - 1]!))
    pieces.pop()
  pieces = pieces.filter((piece) => piece.type !== 'text' || !blankText(piece))
  if (pieces.length !== 1 || pieces[0]!.type !== 'text') return undefined
  const marks = Array.isArray(pieces[0]!.marks)
    ? (pieces[0]!.marks.filter(isObject) as DocNode[])
    : []
  if (marks.some((mark) => mark.type === 'code')) return undefined
  const linkMark = marks.find((mark) => mark.type === 'link')
  const href = linkMark ? str(field(linkMark.attrs, 'href')) : undefined
  return httpsLink(
    href ?? (typeof pieces[0]!.text === 'string' ? pieces[0]!.text : ''),
  )
}

/** The rows of `entries`; a reply's quote is looked up in `quoting` (all the chat's lines), else in `entries`. */
function layout(
  entries: readonly Entry[],
  options: {
    quoting?: readonly Entry[]
    isGroup: boolean
    unreadAfter?: number
  },
): ChatRow[] {
  let rows: ChatRow[] = []
  let lastShown: number | undefined
  let index = 0
  const unreadAfter = options.unreadAfter
  let dividerPlaced = unreadAfter == null
  // A file the person sent carries no time of its own: it takes its message's, by the nonce they were sent with (`UIn`).
  const sentAt = nonceTimes(entries)
  // The rows of the untimed lines just before, and whose they are: a stamp goes above them (`$In`).
  let untimed: { start: number; role: string } | undefined

  const stamp = (before: Entry) => {
    const at0 = before.timestampMs
    if (
      !dividerPlaced &&
      unreadAfter != null &&
      !before.isFromPerson &&
      at0 != null &&
      at0 > unreadAfter
    ) {
      rows.push({ kind: 'unread', id: 'unread-divider' })
      dividerPlaced = true
    }
    const role = lineSide(before)
    const nonce = text(before.get('clientNonce'))
    const at =
      before.timestampMs ?? (nonce != null ? sentAt.get(nonce) : undefined)
    if (at == null) {
      if (untimed?.role !== role) untimed = { start: rows.length, role }
      return
    }
    if (
      lastShown == null ||
      Math.abs(at - lastShown) >= stampGap ||
      !sameDay(at, lastShown)
    ) {
      const place =
        untimed && untimed.role === role ? untimed.start : rows.length
      rows.splice(place, 0, {
        kind: 'stamp',
        id: `stamp-${before.id}`,
        date: at,
      })
    }
    lastShown = at
    untimed = undefined
  }

  while (index < entries.length) {
    const entry = entries[index]!
    // Agents talking to each other, and calls written before calls were one line.
    const peer = entry.kind === 'message' ? entry.teammate : undefined
    if (peer) {
      const run: Entry[] = [entry]
      let next = index + 1
      const call = earlierCall(peer)
      while (next < entries.length && entries[next]!.kind === 'message') {
        const other = entries[next]!.teammate
        if (!other) break
        const otherCall = earlierCall(other)
        if (call) {
          if (otherCall?.callId !== call.callId) break
        } else if (otherCall) break
        run.push(entries[next]!)
        next += 1
      }
      stamp(entry)
      if (call)
        rows.push({
          kind: 'voiceCall',
          id: entry.id,
          seconds: call.seconds,
          lines: run.map((line) => ({
            fromPerson: line.fromAgent != null,
            text: line.content ?? '',
          })),
          live: false,
        })
      else
        rows.push({
          kind: 'teammates',
          id: entry.id,
          exchange: exchangeOf(run),
          entries: run,
        })
      index = next
      continue
    }
    // Routines changed one after another fold into one line (`WIn`, `_In`).
    const isRoutine = (line: Entry) =>
      line.kind === 'event' &&
      str(field(line.event, 'type')) === 'automation-changed'
    if (isRoutine(entry)) {
      const run: Entry[] = [entry]
      let next = index + 1
      while (next < entries.length && isRoutine(entries[next]!)) {
        run.push(entries[next]!)
        next += 1
      }
      stamp(entry)
      routineOutcomes(run).forEach((outcome, n) => {
        rows.push({
          kind: 'routines',
          id: n === 0 ? entry.id : `${entry.id}-${outcome.action}`,
          action: outcome.action,
          routines: outcome.routines,
        })
      })
      index = next
      continue
    }
    // Pictures and videos sent one after another in one send are drawn together, as pictures (`aMn`, `j2e`); other files stay cards.
    const first = mediaAttachment(entry)
    if (first) {
      const pictures = [first]
      let next = index + 1
      const key = attachmentBatch(entry)
      for (;;) {
        const candidate = entries[next]
        const more = candidate ? mediaAttachment(candidate) : undefined
        if (!candidate || !more || attachmentBatch(candidate) !== key) break
        pictures.push(more)
        next += 1
      }
      stamp(entry)
      const fromPerson = entry.kind === 'user-attachment'
      rows.push({
        kind: 'bubble',
        id: entry.id,
        bubble: bubble({
          id: entry.id,
          text: '',
          fromPerson,
          author: fromPerson ? undefined : entry.author,
          reactions: entry.reactions.map((reaction) => reaction.emoji),
          replyTo: text(entry.get('replyTo')),
          timestampMs: entry.timestampMs,
          images: pictures,
          myReactions: entry.myReactions,
        }),
      })
      index = next
      continue
    }
    const row = rowFor(entry)
    if (row) {
      stamp(entry)
      rows.push(row)
    }
    index += 1
  }
  rows = quoted(rows, options.quoting ?? entries)
  rows = unique(rows)
  return options.isGroup ? markRuns(rows) : rows
}

/** The time of each message the person sent, by the nonce it was sent with: its files take it (`UIn`). */
function nonceTimes(entries: readonly Entry[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const entry of entries) {
    if (entry.kind !== 'message') continue
    const nonce = text(entry.get('clientNonce'))
    const at = entry.timestampMs
    if (nonce != null && at != null) out.set(nonce, at)
  }
  return out
}

/** A file that is a picture or a video, as a picture: the person's, or an agent's (`IZ`). */
function mediaAttachment(entry: Entry): ChatImage | undefined {
  if (entry.kind === 'user-attachment') {
    const path = text(entry.get('file_path')) ?? text(entry.get('filePath'))
    if (path == null) return undefined
    const name =
      text(entry.get('file_name')) ?? text(entry.get('fileName')) ?? ''
    if (!isPictureOrVideo(path) && !isPictureOrVideo(name)) return undefined
    const positive = (value: unknown) => {
      const n = num(value)
      return n != null && n > 0 ? n : undefined
    }
    return {
      url: path,
      alt: '',
      width: positive(entry.get('width')),
      height: positive(entry.get('height')),
    }
  }
  const message = entry.message
  const url = text(field(message, 'url'))
  if (
    entry.kind === 'send-message' &&
    str(field(message, 'type')) === 'attachment' &&
    url != null &&
    isPictureOrVideo(url)
  )
    return { url, alt: str(field(message, 'alt')) ?? '' }
  return undefined
}

/** Which send a file came in (`batchId`, or the old untold one), and an agent's pictures by their author: they are drawn together. */
function attachmentBatch(entry: Entry): string {
  if (entry.kind === 'user-attachment') {
    const batch = text(entry.get('batchId'))
    return batch != null ? `ua:${batch}` : 'ua:legacy'
  }
  return `ai:${entry.author?.id ?? ''}`
}

/** Each row once: the screen keys rows by id. A repeated line is the same line twice. */
function unique(rows: ChatRow[]): ChatRow[] {
  const seen = new Set<string>()
  if (
    !rows.some((row) => (seen.has(row.id) ? true : (seen.add(row.id), false)))
  )
    return rows
  seen.clear()
  return rows.filter((row) =>
    seen.has(row.id) ? false : (seen.add(row.id), true),
  )
}

/** Who said a line, for `quoted`: the person, or the agent by its id. */
function speaker(of: Bubble): string {
  return of.fromPerson ? '' : 'agent:' + (of.author?.id ?? '')
}

/**
 * A reply's quote over its bubble (`pCn`): the answered line, one line, cut
 * at 96 characters; "(deleted)" when it is gone. An agent's answer to a line
 * whose writer has said nothing since has none (28 October 2026, the founder:
 * "the whole reply to makes sense when there's many messages, not when its
 * only one"). The person's own replies keep theirs.
 */
function quoted(rows: ChatRow[], entries: readonly Entry[]): ChatRow[] {
  if (!rows.some((row) => row.kind === 'bubble' && row.bubble.replyTo != null))
    return rows
  const byId = new Map<string, Entry>()
  for (const entry of entries)
    if (!byId.has(entry.id)) byId.set(entry.id, entry)
  const bubbleAt = new Map<string, number>()
  rows.forEach((row, index) => {
    if (row.kind === 'bubble' && !bubbleAt.has(row.bubble.id))
      bubbleAt.set(row.bubble.id, index)
  })
  return rows.map((row, index) => {
    if (row.kind !== 'bubble' || row.bubble.replyTo == null) return row
    const target = row.bubble.replyTo
    const at = bubbleAt.get(target)
    if (!row.bubble.fromPerson && at != null && at < index) {
      const answered = rows[at]!
      if (answered.kind === 'bubble') {
        const between = rows.slice(at + 1, index)
        const spoke = between.some(
          (other) =>
            other.kind === 'bubble' &&
            speaker(other.bubble) === speaker(answered.bubble),
        )
        if (!spoke) return row
      }
    }
    return {
      ...row,
      bubble: { ...row.bubble, quote: quoteLine(byId.get(target), 96) },
    }
  })
}

/**
 * The line a reply quotes over its bubble (96 characters) and the composer's
 * reply line (72), as the window writes them (`OAe` over `ide`): the words
 * without their Markdown, cut at `limit` less one with "…", "(empty)" when
 * there are none; "Photo" for a picture, a file's name, a link's host;
 * "(deleted)" when the line is gone.
 */
export function quoteLine(entry: Entry | undefined, limit: number): string {
  const preview = replyPreview(entry)
  switch (preview.kind) {
    case 'text': {
      const words = plainPreview(preview.text)
      return words === '' ? t('(empty)') : clippedLine(words, limit)
    }
    case 'image':
      return t('Photo')
    case 'file':
      return clippedLine(
        fileTitle(preview.name ? preview.name : fileBaseName(preview.url)),
        limit,
      )
    case 'link':
      return clippedLine(hostOf(preview.url) ?? preview.url, limit)
    case 'missing':
      return t('(deleted)')
  }
}

/** The composer's words while answering this (the window's `x9n`). */
export function replyPlaceholder(entry: Entry | undefined): string {
  switch (replyPreview(entry).kind) {
    case 'image':
      return t('Reply to attachment…')
    case 'file':
      return t('Reply to file…')
    case 'link':
      return t('Reply to link…')
    default:
      return t('Reply…')
  }
}

/** A line cut the window's way: spaces run together; past `limit`, its first `limit - 1` characters and "…". */
export function clippedLine(words: string, limit: number): string {
  const line = words.split(/\s+/u).filter(Boolean).join(' ')
  const characters = [...line]
  if (characters.length <= limit) return line
  return (
    characters
      .slice(0, Math.max(0, limit - 1))
      .join('')
      .replace(/\s+$/u, '') + '…'
  )
}

/** The window's `JIn`: one message is "Messaged" or "Message from"; only outgoing to several is a fan-out; else a thread. */
export function exchangeOf(run: readonly Entry[]): Exchange {
  const peers: Party[] = []
  for (const line of run) {
    const party = line.teammate
    if (party && !peers.some((peer) => peer.id === party.id)) peers.push(party)
  }
  if (run.length === 1 && peers[0])
    return {
      kind: 'single',
      inbound: run[0]!.fromAgent != null,
      peer: peers[0],
    }
  if (run.every((line) => line.toAgent != null) && peers.length >= 2)
    return { kind: 'fanout', peers }
  return { kind: 'thread', count: run.length, peers }
}

/** The window's `_In`: per routine its last action ("deleted" wins, a creation stays a creation), grouped by action in first-seen order. */
function routineOutcomes(
  run: readonly Entry[],
): { action: string; routines: RoutineRef[] }[] {
  const order: string[] = []
  const state = new Map<
    string,
    { name: string; created: boolean; last: string }
  >()
  for (const line of run) {
    const event = line.event
    const id =
      text(field(event, 'automationId')) ?? text(field(event, 'automationName'))
    if (event == null || id == null) continue
    const action = str(field(event, 'action')) ?? 'updated'
    const name = str(field(event, 'automationName')) ?? ''
    const known = state.get(id)
    if (known)
      state.set(id, {
        name,
        created: known.created || action === 'created',
        last: action,
      })
    else {
      order.push(id)
      state.set(id, { name, created: action === 'created', last: action })
    }
  }
  const out: { action: string; routines: RoutineRef[] }[] = []
  for (const id of order) {
    const s = state.get(id)!
    const action =
      s.last === 'deleted' ? 'deleted' : s.created ? 'created' : s.last
    const ref = { id, name: s.name }
    const group = out.find((outcome) => outcome.action === action)
    if (group) group.routines.push(ref)
    else out.push({ action, routines: [ref] })
  }
  return out
}

/** The words before a routines line's chips: "Created routine", "Created routines" (`XPn`). */
export function routineLabel(action: string, count: number): string {
  const one = count === 1
  switch (action) {
    case 'created':
      return one ? t('Created routine') : t('Created routines')
    case 'updated':
      return one ? t('Updated routine') : t('Updated routines')
    case 'enabled':
      return one ? t('Enabled routine') : t('Enabled routines')
    case 'disabled':
      return one ? t('Disabled routine') : t('Disabled routines')
    case 'deleted':
      return one ? t('Deleted routine') : t('Deleted routines')
    default:
      return one ? t('Changed routine') : t('Changed routines')
  }
}

/** "Created", "Updated", "Enabled", "Disabled", "Deleted", else "Changed" (`Y5e`), before a chip of three routines or more. */
export function routineVerb(action: string): string {
  switch (action) {
    case 'created':
      return tk('routine.created')
    case 'updated':
      return tk('routine.updated')
    case 'enabled':
      return tk('routine.enabled')
    case 'disabled':
      return tk('routine.disabled')
    case 'deleted':
      return tk('routine.deleted')
    default:
      return tk('routine.changed')
  }
}

/** The answered ask to run commands on the person's computer, in one line (`LocalToolAsk.outcome`). */
function localAskOutcome(status: string): string {
  switch (status) {
    case 'always':
      return t('Simeon can run commands on your computer.')
    case 'never':
      return t('Simeon cannot run commands on your computer.')
    case 'denied':
    case 'expired':
      return t('Simeon was not allowed to run commands on your computer.')
    default:
      return t('Simeon can run commands on your computer this time.')
  }
}

/** Whether a message's words are a flights card (`FlightsCard.parse`: one `simeon-flights` fence with offers in it). */
function isFlights(words: string): boolean {
  const body = soleFence(words, 'simeon-flights')
  if (body == null) return false
  return (arr(field(parseJSON(body), 'offers')) ?? []).some(isObject)
}

/** The row one line makes, or none (`Chat.row(for:)`). */
export function rowFor(entry: Entry): ChatRow | undefined {
  const reactions = entry.reactions.map((reaction) => reaction.emoji)
  const mine = entry.myReactions
  const card = (kind: CardKind): ChatRow => ({
    kind: 'card',
    id: entry.id,
    card: kind,
    entry,
  })
  switch (entry.kind) {
    case 'message':
    case 'user-message':
    case 'human-message': {
      const words = entry.content
      if (words == null || words.trim() === '') return undefined
      const fromPerson = entry.isFromPerson || entry.role === 'user'
      if (!fromPerson && isFlights(words)) return card('flights')
      // The person's own message (not another person's, not one from a channel, not between agents) can be a link card.
      const own =
        entry.role === 'user' &&
        entry.get('fromUser') === undefined &&
        entry.get('channel') === undefined &&
        entry.teammate == null
      const link = own ? loneLink(words, str(entry.get('richText'))) : undefined
      // A message that came in from a channel (the host writes it as the person's, with `channel` and `channelSender`).
      const channel = fromPerson
        ? channelTag(
            str(entry.get('channel')),
            true,
            str(entry.get('channelSender')),
          )
        : undefined
      return {
        kind: 'bubble',
        id: entry.id,
        bubble: bubble({
          id: entry.id,
          text: words,
          fromPerson,
          author: fromPerson ? undefined : entry.author,
          reactions,
          isStreaming: entry.isStreaming,
          replyTo: text(entry.get('replyTo')),
          timestampMs: entry.timestampMs,
          sentOfflineAtMs: fromPerson
            ? num(entry.get('sentWhileOfflineAtMs'))
            : undefined,
          loneLink: link,
          myReactions: mine,
          channel,
        }),
      }
    }
    case 'notice': {
      const words = text(entry.get('text')) ?? entry.content
      if (words == null || words.trim() === '') return undefined
      // One the engine wrote for the person (`forPerson`: Claude's, in their
      // language) is shown as it is; one the computer wrote in its own terms
      // reads plainly (PlainWords), which hides any line naming Claude.
      if (bool(entry.get('forPerson')) === true) {
        return { kind: 'notice', id: entry.id, text: words }
      }
      return {
        kind: 'notice',
        id: entry.id,
        text: plainError(
          words,
          t('Something didn’t work here. Try again in a little while.'),
        ),
      }
    }
    case 'user-attachment': {
      const path = text(entry.get('file_path')) ?? text(entry.get('filePath'))
      const name =
        text(entry.get('file_name')) ??
        text(entry.get('fileName')) ??
        (path != null ? fileName(path) : undefined) ??
        t('Attachment')
      return {
        kind: 'file',
        id: entry.id,
        name,
        url: str(entry.get('file_path')) ?? str(entry.get('filePath')) ?? '',
        fromPerson: true,
      }
    }
    case 'send-message': {
      const message = entry.message
      if (message == null) return undefined
      if (text(entry.get('boxRequestId')) != null) return card('computer')
      switch (str(field(message, 'type'))) {
        case 'text': {
          const words = str(field(message, 'content')) ?? ''
          const images = (arr(field(message, 'images')) ?? [])
            .map(chatImageFrom)
            .filter((image): image is ChatImage => image != null)
          // A message may be pictures alone: the gallery without words.
          if (words.trim() === '' && images.length === 0) return undefined
          if (images.length === 0 && isFlights(words)) return card('flights')
          const streaming = bool(entry.get('streaming')) ?? false
          return {
            kind: 'bubble',
            id: entry.id,
            bubble: bubble({
              id: entry.id,
              text: words,
              fromPerson: false,
              author: entry.author,
              reactions,
              isStreaming: streaming,
              replyTo: text(entry.get('replyTo')),
              timestampMs: entry.timestampMs,
              images,
              loneLink:
                !streaming && images.length === 0 ? loneLink(words) : undefined,
              myReactions: mine,
              channel: channelTag(str(field(message, 'channel')), false),
              introduces: bool(field(message, 'introduction')) === true,
            }),
          }
        }
        case 'attachment': {
          const url = text(field(message, 'url'))
          if (url == null) return undefined
          // The agent's own name for it (`file_name`); the computer keeps the file under one made from its contents.
          return {
            kind: 'file',
            id: entry.id,
            name: text(field(message, 'file_name')) ?? fileName(url),
            url,
            fromPerson: false,
          }
        }
        case 'widget':
          return text(field(field(message, 'widget'), 'prompt')) != null
            ? card('question')
            : undefined
        case 'email-draft':
        case 'slack-draft':
          return field(message, 'draft') != null ? card('draft') : undefined
        case 'connectors':
          return (arr(field(message, 'connectors')) ?? []).some(
            (name) => text(name) != null,
          )
            ? card('connectors')
            : undefined
        case 'connector':
          return text(field(message, 'connector')) != null
            ? card('connectors')
            : undefined
        case 'listener-connect': {
          const platform = text(field(message, 'platform'))
          return platform === 'slack' || platform === 'github'
            ? card('listenerConnect')
            : undefined
        }
        case 'auto-review-approval':
          return field(message, 'approval') != null
            ? card('approval')
            : undefined
        case 'secret-request':
          return field(message, 'secretRequest') != null
            ? card('secret')
            : undefined
        case 'user-form':
          return card('form')
        case 'credential-request':
          return card('credential')
        case 'onepassword-connect':
          return card('onePasswordConnect')
        case 'store-entry':
          return card('storeEntry')
        case 'cloud-agent':
          return text(field(message, 'bcId')) != null
            ? card('cloudAgent')
            : undefined
        case 'purchase':
          return card('purchase')
        case 'products':
          return card('products')
        case 'flight-passengers':
          return card('flightPassengers')
        case 'agent-joined':
          // Without the agent's id and name, the message's own words (`JoinedCard(message:)`).
          return text(field(message, 'agentId')) != null &&
            (text(field(message, 'name'))?.trim() ?? '') !== ''
            ? card('joined')
            : {
                kind: 'notice',
                id: entry.id,
                text: text(field(message, 'content')) ?? notShown(),
              }
        case 'local-tool-permission': {
          // Waiting, it is the Mac's dock above the composer, not a line; expired, it is gone; answered, one line says how (`_Ln`).
          const status =
            str(field(field(message, 'ask'), 'status')) ?? 'pending'
          if (
            field(message, 'ask') == null ||
            status === 'pending' ||
            status === 'expired'
          )
            return undefined
          return { kind: 'notice', id: entry.id, text: localAskOutcome(status) }
        }
        case 'permission-request':
          // The older card, retired in the window (`yGe`, variant "retired").
          return {
            kind: 'notice',
            id: entry.id,
            text: t('This message type is no longer supported in Simeon.'),
          }
        default: {
          const words = text(field(message, 'content'))
          if (words != null)
            return {
              kind: 'bubble',
              id: entry.id,
              bubble: bubble({
                id: entry.id,
                text: words,
                fromPerson: false,
                author: entry.author,
                reactions,
                replyTo: text(entry.get('replyTo')),
                timestampMs: entry.timestampMs,
              }),
            }
          return { kind: 'notice', id: entry.id, text: notShown() }
        }
      }
    }
    case 'event': {
      const event = entry.event
      if (event == null) return undefined
      switch (str(field(event, 'type'))) {
        case 'voice-call': {
          const lines = (arr(field(event, 'lines')) ?? []).flatMap(
            (line): CallLine[] => {
              const said = text(field(line, 'text'))
              return said != null
                ? [
                    {
                      fromPerson: str(field(line, 'speaker')) === 'user',
                      text: said,
                    },
                  ]
                : []
            },
          )
          return {
            kind: 'voiceCall',
            id: entry.id,
            seconds: int(field(event, 'seconds')) ?? 0,
            lines,
            live: str(field(event, 'status')) === 'live',
          }
        }
        case 'name-changed': {
          const to = text(field(event, 'to'))
          return to != null
            ? { kind: 'notice', id: entry.id, text: t`Renamed to ${to}` }
            : undefined
        }
        case 'channel-connected': {
          const label = text(field(event, 'label'))
          return label != null
            ? { kind: 'notice', id: entry.id, text: t`Connected to ${label}` }
            : undefined
        }
        case 'channel-disconnected': {
          const label = text(field(event, 'label'))
          return label != null
            ? {
                kind: 'notice',
                id: entry.id,
                text: t`Disconnected from ${label}`,
              }
            : undefined
        }
        default:
          return undefined
      }
    }
    default:
      return undefined
  }
}

/** In a group: a member's name over the first bubble of their run, their picture beside the last. */
function markRuns(rows: ChatRow[]): ChatRow[] {
  const authorOf = (row: ChatRow | undefined) =>
    row?.kind === 'bubble' && !row.bubble.fromPerson
      ? row.bubble.author?.id
      : undefined
  return rows.map((row, i) => {
    if (row.kind !== 'bubble' || row.bubble.fromPerson || !row.bubble.author)
      return row
    const author = row.bubble.author.id
    return {
      ...row,
      bubble: {
        ...row.bubble,
        showsName: authorOf(rows[i - 1]) !== author,
        showsAvatar: authorOf(rows[i + 1]) !== author,
      },
    }
  })
}

/** The streamed answer's row with its new words, when it is the chat's last row; undefined when the chat must be laid out again. */
export function replacingLast(
  rows: readonly ChatRow[],
  entry: Entry,
): ChatRow[] | undefined {
  const old = rows[rows.length - 1]
  const fresh = rowFor(entry)
  if (old?.kind !== 'bubble' || old.id !== entry.id || fresh?.kind !== 'bubble')
    return undefined
  const next = [...rows]
  next[next.length - 1] = {
    ...fresh,
    bubble: {
      ...fresh.bubble,
      showsName: old.bubble.showsName,
      showsAvatar: old.bubble.showsAvatar,
      author: old.bubble.author,
      quote: old.bubble.quote,
    },
  }
  return next
}

/** The same rows, as Swift compares two (every field). */
export function sameRow(a: ChatRow, b: ChatRow): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b)
}

function clock(date: Date, locale: string, timeZone?: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

/**
 * A stamp the window's way (`ept`): "Today 6:34 AM", "Yesterday 11:40 PM",
 * "Wed, Oct 7 3:12 PM" this year, "Oct 7, 2025 3:12 PM" before.
 */
export function stampText(
  ms: number,
  options: { now?: Date; locale?: string; timeZone?: string } = {},
): string {
  const date = new Date(ms)
  const now = options.now ?? new Date()
  const locale = options.locale ?? displayLocale()
  const timeZone = options.timeZone
  const time = clock(date, locale, timeZone)
  const day = (d: Date) =>
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    }).format(d)
  if (day(date) === day(now)) return t`Today ${time}`
  if (day(date) === day(new Date(now.getTime() - 86_400_000)))
    return t`Yesterday ${time}`
  const year = (d: Date) =>
    new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric' }).format(d)
  const format = (shape: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { timeZone, ...shape }).format(date)
  if (year(date) === year(now))
    return `${format({ weekday: 'short', month: 'short', day: 'numeric' })} ${time}`
  return `${format({ month: 'short', day: 'numeric', year: 'numeric' })} ${time}`
}

/** A message's own time ("10:15 AM"). */
export function clockText(
  ms: number,
  options: { locale?: string; timeZone?: string } = {},
): string {
  return clock(
    new Date(ms),
    options.locale ?? displayLocale(),
    options.timeZone,
  )
}

/** A call's line in the chat (`__simeonVoiceEvent`): "Voice chat · now" while it is on, then "Voice chat · 02:48". */
export function voiceChatLabel(seconds: number, live: boolean): string {
  return live
    ? t('Voice chat · now')
    : t`Voice chat · ${callLength(Math.max(0, seconds))}`
}

const two = (n: number) => String(n).padStart(2, '0')

/** A call's length the Mac's way: "01:11", or "1:02:05" past the hour. */
export function callLength(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${two(m)}:${two(s)}`
}

/** The running call's clock, the banner's way: "0:16", "12:04", "1:02:05". */
export function callClock(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`
}

/** Whether a bubble's words are one emoji, drawn large with no bubble (`Chat.isOneEmoji`). */
export { isOneEmoji }

/** The row that shows a line: its own, or the folded run of messages between agents that holds it (`Chat.rowId`). */
export function rowIdOf(
  entryId: string,
  rows: readonly ChatRow[],
): string | undefined {
  for (const row of rows) {
    if (row.id === entryId) return row.id
    if (
      row.kind === 'teammates' &&
      row.entries.some((entry) => entry.id === entryId)
    )
      return row.id
  }
  return undefined
}
