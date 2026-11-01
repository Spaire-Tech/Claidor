// What the window shows, kept in one place (`AppStore` in
// ios/SimeonCore/Sources/SimeonCore/Store.swift and StoreSaved.swift), and
// told to the screens when it changes.
//
// Translated so far: the roster (step 1d) and the chats (step 2a). On
// attach, the server's copy of the list (`chats/agents`) shows while the
// computer has not answered; the computer's own list replaces it; a computer
// that rests where the server lets it sleep is no failure; a refused account
// raises the access cover; the host's events keep the list current. A chat
// opened shows the server's copy of its lines (`chats/lines`) while the
// computer's are on their way, streams its new lines, and is read; a message
// shows at once, waits while the computer is out of reach (handed to the
// server meanwhile), says when it failed, and gives way to the host's copy.
// The cards, the connectors and the rest come with their screens
// (docs/web-app/PROGRESS.md). The Mac also shows what it kept on disk
// (`SavedChats`); the web shows the server's copy instead (the decision is in
// PROGRESS.md).

import { SimeonAPIError } from './api'
import {
  type AgentBackend,
  type AttachmentRef,
  type BackendEvent,
  LiveBackend,
  type SendOptions,
  newMessageId,
} from './backend'
import {
  type ChatRow,
  chatRows,
  replacingLast,
  sameRow,
  threadEntries,
  threadRoot,
  threadRows,
  threadSplit,
  threadTitle,
} from './chat'
import { type RunFlags, runFlags } from './chatRuns'
import { Entry, appliedChange } from './entry'
import { GatewayError } from './gatewayConnection'
import { type JSONValue, arr, bool, field, num, str, text } from './json'
import { t } from './l10n'
import { type Agent, agentFrom, sameAgent, sortRoster } from './models'
import { plainError } from './plainWords'

/** A message the person sent, shown at once and kept until the host's own copy arrives (the Mac's outbox). */
interface Outgoing {
  /**
   * Held while the computer is out of reach, on its way, with the host, or
   * refused; or with Simeon Labs' server, which wakes the computer and hands
   * it over (`handToServer`): shown as sent, and sent again (the same nonce,
   * so it lands once) when the computer is back.
   */
  state: 'queued' | 'sending' | 'sent' | 'failed' | 'withServer'
  id: string
  text: string
  files: { name: string; data: Uint8Array }[]
  replyTo?: string
  /** A reply in the thread of `replyTo` (`isFork`). */
  thread: boolean
  /** The composer's document, when a skill was picked with "/" (`richText`). */
  richText?: string
  at: number
  /** The chat's lines when it was sent: the host's copy is a line not among them. */
  known: Set<string>
  /** Held while the computer was out of reach: when it was written, sent with it (`composedAtMs`). */
  composedOffline: boolean
}

/** A message canceled before it went: what goes back into its composer. */
export interface CanceledDraft {
  id: string
  /** The composer it came from (`draftScope`). */
  scope: string
  text: string
  files: { name: string; data: Uint8Array }[]
  /** The message it answered, outside a thread. */
  replyTo?: string
  richText?: string
}

/** A line in the composer for six seconds (the window's `sand-prompt-error-notice`). */
export interface ComposerNotice {
  id: string
  agentId: string
  text: string
}

/** Where a composer's draft is kept: the chat's id, or its thread's ("<chat>#thread-<first message>"). */
export function draftScope(agentId: string, thread?: string): string {
  return thread != null ? `${agentId}#thread-${thread}` : agentId
}

/** Where a waiting message's file is: in this tab, under the message's own id (`sentFile`). */
export function outboxFileURL(messageId: string, index: number): string {
  return `outbox:${messageId}-file${index}`
}

/** A waiting message as the host would write it: its text, and a line per file. */
function entriesFor(item: Outgoing): Entry[] {
  let lines: { [key: string]: JSONValue }[] = item.files.map((file, index) => ({
    kind: 'user-attachment',
    id: `${item.id}-file${index}`,
    file_name: file.name,
    file_path: outboxFileURL(item.id, index),
    timestampMs: item.at,
  }))
  if (item.text !== '') {
    const message: { [key: string]: JSONValue } = {
      kind: 'message',
      id: item.id,
      role: 'user',
      content: item.text,
      timestampMs: item.at,
    }
    if (item.replyTo != null) message.replyTo = item.replyTo
    lines.push(message)
  }
  // A reply in a thread waits in the thread, as the host will keep it.
  if (item.thread && item.replyTo != null) {
    const root = item.replyTo
    lines = lines.map((line) => ({
      ...line,
      branched: true,
      replyTo: line.replyTo ?? root,
    }))
  }
  return lines
    .map((line) => Entry.from(line))
    .filter((entry): entry is Entry => entry != null)
}

/** The waiting messages held while offline and now on their way or with the host: their own lines say so already. */
function sentOfflineOf(waiting: readonly Outgoing[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const item of waiting) {
    if (
      item.composedOffline &&
      (item.state === 'sending' ||
        item.state === 'sent' ||
        item.state === 'withServer') &&
      !out.has(item.id)
    )
      out.set(item.id, item.at)
  }
  return out
}

/** "Sent while offline" on the lines this app held and sent (`marks`), and on no other: the host's own mark is taken off. */
export function offlineMarked(
  entries: readonly Entry[],
  marks: ReadonlyMap<string, number>,
): Entry[] {
  return entries.map((entry) => {
    const wanted = marks.get(entry.id)
    const has = num(entry.get('sentWhileOfflineAtMs'))
    return wanted === has
      ? entry
      : entry.setting('sentWhileOfflineAtMs', wanted)
  })
}

/** "Failed to send" or "Waiting to send…" under each waiting message that has a row here (the chat or its thread). */
function withSendStates(
  rows: ChatRow[],
  waiting: readonly Outgoing[],
): ChatRow[] {
  const out = [...rows]
  for (const item of waiting) {
    if (item.state !== 'failed' && item.state !== 'queued') continue
    let last = -1
    out.forEach((row, index) => {
      if (row.id === item.id || row.id.startsWith(item.id + '-file'))
        last = index
    })
    if (last < 0) continue
    out.splice(
      last + 1,
      0,
      item.state === 'failed'
        ? { kind: 'failedSend', id: `failed-${item.id}`, nonce: item.id }
        : { kind: 'queuedSend', id: `queued-${item.id}`, nonce: item.id },
    )
  }
  return out
}

/** The fetched lines, and after them any live line the fetch had not seen yet. */
export function mergeLines(
  fresh: readonly Entry[],
  live: readonly Entry[],
): Entry[] {
  if (fresh.length === 0) return [...live]
  const known = new Set(fresh.map((entry) => entry.id))
  const newest = Math.max(0, ...fresh.map((entry) => entry.timestampMs ?? 0))
  return [
    ...fresh,
    ...live.filter(
      (entry) =>
        !known.has(entry.id) && (entry.timestampMs ?? Infinity) >= newest,
    ),
  ]
}

/** Just before the oldest of the last `unread` lines an agent wrote; undefined when nothing is unread. */
export function unreadBoundary(
  entries: readonly Entry[],
  unread: number,
): number | undefined {
  if (unread <= 0) return undefined
  const theirs = entries.filter(
    (entry) =>
      !entry.isFromPerson &&
      entry.timestampMs != null &&
      (entry.kind === 'message' || entry.kind === 'send-message') &&
      entry.teammate == null,
  )
  const first = theirs.slice(-unread)[0]?.timestampMs
  return first != null ? first - 1 : undefined
}

/** Rows kept as they were where nothing changed, so a screen that draws a row once per object redraws only what moved. */
function keptRows(
  old: readonly ChatRow[] | undefined,
  fresh: ChatRow[],
): ChatRow[] {
  if (!old) return fresh
  const byId = new Map(old.map((row) => [row.id, row]))
  let same = old.length === fresh.length
  const out = fresh.map((row, index) => {
    const before = byId.get(row.id)
    const kept = before && sameRow(before, row) ? before : row
    if (kept !== old[index]) same = false
    return kept
  })
  return same ? (old as ChatRow[]) : out
}

/** The same run flags, field by field. */
function sameFlags(
  a: Record<string, RunFlags> | undefined,
  b: Record<string, RunFlags>,
): boolean {
  return a != null && JSON.stringify(a) === JSON.stringify(b)
}

/** A chat with no rows yet: one list for all of them, so a screen sees no change. */
const noRows: readonly ChatRow[] = []

/** The kept lines of the server's copy (`SavedChats.linesKept`). */
const serverLinesKept = 300

/** The signed-in person, from `user/profile` (`Account` in Store.swift). */
export interface Account {
  name: string
  email: string
  /** The picture the sign-in gave (`avatarUrl`, Google's), https only. */
  pictureURL?: string
  /** The account's id on Simeon Labs' server. */
  id?: string
}

export function accountFrom(profile: unknown): Account | undefined {
  const email = str(field(profile, 'email')) ?? ''
  const name =
    text(field(profile, 'preferredName')) ??
    text(field(profile, 'name')) ??
    text(field(profile, 'nickname')) ??
    email.split('@')[0] ??
    ''
  if (name === '' && email === '') return undefined
  const picture = text(field(profile, 'avatarUrl'))
  return {
    name,
    email,
    pictureURL: picture?.startsWith('https://') ? picture : undefined,
    id: text(field(profile, 'id')),
  }
}

function sameList(a: readonly Agent[], b: readonly Agent[]): boolean {
  return a.length === b.length && a.every((agent, i) => sameAgent(agent, b[i]!))
}

export class AppStore {
  agents: Agent[] = []
  account?: Account
  /** The list shown is a copy (the server's), not yet the computer's. */
  showingSaved = false
  /** The copy shown is the server's. */
  listFromServer = false
  /** The computer has answered with its list in this sign-in. */
  hasReachedBox = false
  /** The list could not be read (the computer did not answer). */
  rosterFailed = false
  /** The computer refused this account (no plan): the window's access cover. */
  accessBlocked = false
  /** The event stream is up. */
  isLive = false
  /** The computer sleeps where the server lets it, and is not woken for the list. */
  isAsleep = false
  isLoading = false
  /** Retry is under way (the sidebar's "Retrying…"). */
  rosterRetrying = false
  /** What went wrong, in the person's words, when the screens should say it. */
  problem?: string
  /** Whether the list's failure is said (`problem`); the Mac says it in the sidebar instead. */
  reportsRosterFailure = true
  /** Read the server's copy of the list while the computer has not answered. */
  readsServerCopy = false

  // The chats

  /** Each chat's lines; the screens draw `chatRows`. */
  transcripts: Record<string, Entry[]> = {}
  /** The chat on screen, if one is: it is the one fetched again after a reconnect or a missed line. */
  openChat?: string
  /** Each chat laid out (`chatRows`), kept with its lines so a redraw does not lay it out again. */
  chatRows: Record<string, ChatRow[]> = {}
  /** Each chat's runs, the messages still sending among them, by row id. */
  runFlags: Record<string, Record<string, RunFlags>> = {}
  /** The step an agent is on right now ("Checking Linear"), by agent. */
  steps: Record<string, string> = {}
  /**
   * The computer out of reach: the event stream dropped and has not come
   * back. A message waits ("Will send when reconnected") and goes when it
   * does, marked as written offline. Unknown is not down.
   */
  isDown = false
  /** A message is held until the computer is back ("Will send when reconnected"). */
  waitingToSend = false
  /** Lines that arrived while their chat was on screen, and messages just sent: they come in with the Mac's motion, once. */
  arrived = new Set<string>()
  /** Chats whose lines are on their way from the host: an empty chat shows it is loading, not frozen. */
  fetching = new Set<string>()
  /** Where each chat's older lines start (`nextBeforeSeq`); absent once the first line is here. */
  olderBefore: Record<string, number> = {}
  loadingOlder = new Set<string>()
  /** Chats that could not be fetched and have nothing to show: "Couldn't load this conversation" and Retry. */
  loadFailed = new Set<string>()
  /** Where the "New" line goes in each chat: after this time (ms), set when a chat with unread messages opens. */
  unreadAfter: Record<string, number> = {}
  /** The thread open in each chat (agent → the id of its first message), laid out in `threadRows`. */
  openThreads: Record<string, string> = {}
  /** Each open thread laid out: its first message and its replies. */
  threadRows: Record<string, ChatRow[]> = {}
  /** What the person has typed and not sent, by composer (`draftScope`). Kept in this tab only. */
  drafts: Record<string, string> = {}
  /** The last message canceled, until its composer takes it back. */
  canceledDraft?: CanceledDraft
  composerNotice?: ComposerNotice
  /** Whether the tab is in front: a chat left open behind another tab is not being read. */
  isForeground = true

  private backend?: AgentBackend
  private running: Record<string, string> = {}
  /** Chats with streamed lines waiting to be laid out, at most every 90 ms. */
  private pendingLayout = new Set<string>()
  private layoutTimer?: ReturnType<typeof setTimeout>
  private refreshing = new Set<string>()
  private peeking = new Set<string>()
  /** The newest line each chat was fetched again for, so a line the fetch does not carry is not fetched for twice. */
  private caughtUp: Record<string, string> = {}
  /** A streamed answer's newest copy, when it is the only change waiting: just the last row is redrawn. */
  private streamingOnly = new Map<string, Entry>()
  /** Messages on their way, by chat. */
  private outbox = new Map<string, Outgoing[]>()
  /** The messages this app held while the computer was out of reach, then sent, by the line that became of them: when each was written. */
  private sentOffline = new Map<string, number>()
  /** Chats with older pages loaded: a fetch of the newest lines keeps them. */
  private paged = new Set<string>()
  /** Each chat's thread replies and the first message of their thread. */
  private threadRootsOf: Record<string, Map<string, string>> = {}
  /** Chats showing the server's copy of their lines, not yet the computer's: the ids of those lines, which the computer's copy replaces. */
  private savedLines = new Map<string, Set<string>>()
  /** Chats whose server copy has older lines before it. */
  private savedOlder = new Set<string>()
  private serverLinesAsked = new Set<string>()
  private handingToServer = new Set<string>()
  private marking = new Set<string>()
  private markAgain = new Set<string>()
  /** Files the person sent from this tab, by every address the chat shows them under. The last 24. */
  private sentFiles: { keys: string[]; data: Uint8Array }[] = []
  private listening?: AbortController
  private onListShown?: () => void
  private readonly listeners = new Set<() => void>()
  private version = 0

  /** For the screens: called after each change. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** A number that changes with every change, for `useSyncExternalStore`. */
  getVersion = (): number => this.version

  private changed(): void {
    this.version += 1
    for (const listener of [...this.listeners]) listener()
  }

  /**
   * Starts on a backend: the roster, then the live events. `shown` is told as
   * soon as a list is on screen, the server's copy or the computer's.
   */
  async attach(backend: AgentBackend, shown?: () => void): Promise<void> {
    const account = this.account
    this.detach()
    this.account = account
    this.backend = backend
    this.onListShown = shown
    if (this.readsServerCopy) void this.showServerList(backend)
    this.isLoading = true
    this.changed()
    const listening = new AbortController()
    this.listening = listening
    void backend
      .events((event) => {
        if (this.backend === backend) this.apply(event)
      }, listening.signal)
      .catch(() => {})
    try {
      await this.reloadRoster()
    } finally {
      if (this.backend === backend) {
        this.isLoading = false
        this.onListShown = undefined
        this.changed()
      }
    }
  }

  /** Signed out, or the sign-in ended. */
  detach(): void {
    this.listening?.abort()
    this.listening = undefined
    this.backend = undefined
    this.agents = []
    this.account = undefined
    this.showingSaved = false
    this.listFromServer = false
    this.hasReachedBox = false
    this.rosterFailed = false
    this.accessBlocked = false
    this.isLive = false
    this.isAsleep = false
    this.problem = undefined
    this.onListShown = undefined
    this.transcripts = {}
    this.openChat = undefined
    this.chatRows = {}
    this.runFlags = {}
    this.steps = {}
    this.isDown = false
    this.waitingToSend = false
    this.arrived = new Set()
    this.fetching = new Set()
    this.olderBefore = {}
    this.loadingOlder = new Set()
    this.loadFailed = new Set()
    this.unreadAfter = {}
    this.openThreads = {}
    this.threadRows = {}
    this.drafts = {}
    this.canceledDraft = undefined
    this.composerNotice = undefined
    this.running = {}
    clearTimeout(this.layoutTimer)
    this.layoutTimer = undefined
    this.pendingLayout = new Set()
    this.refreshing = new Set()
    this.caughtUp = {}
    this.streamingOnly = new Map()
    this.outbox = new Map()
    this.sentOffline = new Map()
    this.paged = new Set()
    this.threadRootsOf = {}
    this.savedLines = new Map()
    this.savedOlder = new Set()
    this.sentFiles = []
    this.changed()
  }

  /**
   * The server's copy of the list (`GET /desktop/api/chats/agents`), shown
   * when it comes before the computer answers. The computer's list replaces it.
   */
  private async showServerList(asked: AgentBackend): Promise<void> {
    let answer
    try {
      answer = await asked.server('chats/agents')
    } catch {
      return
    }
    if (asked !== this.backend || this.hasReachedBox) return
    const list = (arr(field(answer, 'agents')) ?? [])
      .map(agentFrom)
      .filter((agent): agent is Agent => agent != null)
    if (list.length === 0) return
    this.showingSaved = true
    this.listFromServer = true
    this.agents = sortRoster(list)
    this.changed()
    this.onListShown?.()
  }

  async reloadRoster(): Promise<void> {
    const backend = this.backend
    if (!backend) return
    try {
      const list = await backend.listAgents()
      if (backend !== this.backend) return
      this.showingSaved = false
      this.listFromServer = false
      this.agents = this.readingOpenChat(sortRoster(list))
      this.rosterFailed = false
      this.accessBlocked = false
      this.hasReachedBox = true
      this.changed()
    } catch (error) {
      if (backend !== this.backend) return
      // The computer rests where the server lets it sleep: the server's copy stands, and nothing failed.
      if (GatewayError.isResting(error)) return
      this.rosterFailed = true
      // The computer refused this account (`EnsureSandBox`'s permission_denied: no plan): the access cover, not a failure to report.
      this.accessBlocked =
        error instanceof SimeonAPIError && error.status === 403
      if (this.reportsRosterFailure && !this.accessBlocked) {
        const why = error instanceof Error ? error.message : String(error)
        this.problem = t`Couldn't reach your agents: ${why}`
      }
      this.changed()
    }
  }

  /**
   * The sidebar's Retry under "Can't reach your computer" and "Reconnecting
   * to your computer…": the computer asked for again, then the agents read again.
   */
  async retryRoster(): Promise<void> {
    this.rosterRetrying = true
    this.changed()
    try {
      this.backend?.invalidate?.()
      await this.reloadRoster()
    } finally {
      this.rosterRetrying = false
      this.changed()
    }
  }

  apply(event: BackendEvent): void {
    switch (event.kind) {
      case 'agents': {
        this.showingSaved = false
        this.listFromServer = false
        const sorted = this.readingOpenChat(sortRoster(event.agents))
        if (!sameList(sorted, this.agents)) this.agents = sorted
        this.changed()
        this.catchUpOpenChat()
        return
      }
      case 'agentUpserted': {
        // The host sends the same agent again often (each step of a turn); only a change redraws the list.
        if (this.agents.some((agent) => sameAgent(agent, event.agent))) return
        const next = this.agents.filter((agent) => agent.id !== event.agent.id)
        next.push(event.agent)
        this.agents = this.readingOpenChat(sortRoster(next))
        this.changed()
        if (event.agent.id === this.openChat) this.catchUpOpenChat()
        return
      }
      case 'transcript': {
        const change = event.change
        const current = this.transcripts[change.agentId]
        if (!current) return
        let streaming = false
        if (change.type === 'upsert') {
          const entry = change.entry
          streaming = entry.isStreaming || bool(entry.get('streaming')) === true
          const isNew = !current.some((line) => line.id === entry.id)
          if (isNew && change.agentId === this.openChat)
            this.arrived.add(entry.id)
          // The answer growing at the end of the chat: only its own row changes, unless a whole layout is already waiting.
          const growingLast =
            !isNew &&
            streaming &&
            current[current.length - 1]?.id === entry.id &&
            !this.outbox.has(change.agentId)
          const wholeWaiting =
            this.pendingLayout.has(change.agentId) &&
            !this.streamingOnly.has(change.agentId)
          if (growingLast && !wholeWaiting)
            this.streamingOnly.set(change.agentId, entry)
          else this.streamingOnly.delete(change.agentId)
        } else {
          this.streamingOnly.delete(change.agentId)
        }
        const next = appliedChange(change, current)
        if (this.streamingOnly.has(change.agentId)) {
          this.transcripts[change.agentId] = next
          this.scheduleLayout(change.agentId)
        } else {
          this.setTranscript(change.agentId, next, streaming)
        }
        return
      }
      case 'step':
        if (event.running) {
          this.running[event.agentId] = event.id
          this.steps[event.agentId] = event.summary
        } else if (this.running[event.agentId] === event.id) {
          delete this.running[event.agentId]
          delete this.steps[event.agentId]
        } else return
        this.changed()
        return
      case 'connection': {
        // Back after a drop (the laptop slept, the network changed): what was said meanwhile never streamed, so fetch it.
        const recovered = event.live && !this.isLive
        if (event.live) this.isAsleep = false
        const was = this.isLive
        this.isLive = event.live
        if (this.isDown === event.live) this.setDown(!event.live)
        if (was !== event.live) this.changed()
        if (recovered && this.backend) {
          void (async () => {
            await this.reloadRoster()
            if (this.openChat) await this.refresh(this.openChat)
          })()
        }
        return
      }
      case 'computerAsleep':
        if (this.isAsleep === event.asleep) return
        this.isAsleep = event.asleep
        this.changed()
        return
      default:
        // The rest comes with its screens.
        return
    }
  }

  /** One agent, by id. */
  agent(id: string): Agent | undefined {
    return this.agents.find((agent) => agent.id === id)
  }

  // MARK: The chats

  rows(agentId: string): readonly ChatRow[] {
    return this.chatRows[agentId] ?? noRows
  }

  private setTranscript(agentId: string, entries: Entry[], soon = false): void {
    this.transcripts[agentId] = entries
    this.streamingOnly.delete(agentId)
    this.settleOutbox(agentId, entries)
    if (soon) this.scheduleLayout(agentId)
    else this.layOut(agentId)
  }

  private layOut(agentId: string): void {
    this.pendingLayout.delete(agentId)
    // Only the streamed row redrawn, unless a thread is open: its rows are laid out with the chat's.
    const streamed = this.streamingOnly.get(agentId)
    this.streamingOnly.delete(agentId)
    const before = this.chatRows[agentId]
    if (this.openThreads[agentId] == null && streamed && before) {
      const swapped = replacingLast(before, streamed)
      if (swapped) {
        this.chatRows[agentId] = keptRows(before, swapped)
        if (this.chatRows[agentId] !== before) this.changed()
        return
      }
    }
    const waiting = this.outbox.get(agentId) ?? []
    let entries = [
      ...(this.transcripts[agentId] ?? []),
      ...waiting.flatMap(entriesFor),
    ]
    const marks = new Map(this.sentOffline)
    for (const [id, at] of sentOfflineOf(waiting))
      if (!marks.has(id)) marks.set(id, at)
    entries = offlineMarked(entries, marks)
    const isGroup = this.agent(agentId)?.isGroup ?? false
    const after = this.unreadAfter[agentId]
    // Older lines still to load may hold a reply's first message: such a reply waits for them.
    const older =
      this.olderBefore[agentId] != null || this.savedOlder.has(agentId)
    const rows = withSendStates(
      chatRows(entries, {
        isGroup,
        unreadAfter: after,
        mayHoldOlderHistory: older,
      }),
      waiting,
    )
    const split = threadSplit(entries, older)
    const flags = runFlags(split.visible, after, new Set(split.counts.keys()))
    let moved = false
    if (!sameFlags(this.runFlags[agentId], flags)) {
      this.runFlags[agentId] = flags
      moved = true
    }
    const kept = keptRows(before, rows)
    if (kept !== before) {
      this.chatRows[agentId] = kept
      moved = true
    }
    this.threadRootsOf[agentId] = AppStore.threadRootsIn(entries)
    const root = this.openThreads[agentId]
    if (root != null) {
      const thread = withSendStates(threadRows(root, entries, isGroup), waiting)
      const keptThread = keptRows(this.threadRows[agentId], thread)
      if (keptThread !== this.threadRows[agentId]) {
        this.threadRows[agentId] = keptThread
        moved = true
      }
    }
    if (moved) this.changed()
  }

  /** Each thread reply's first message, by the reply's id. */
  private static threadRootsIn(entries: readonly Entry[]): Map<string, string> {
    const out = new Map<string, string>()
    if (!entries.some((entry) => entry.isBranched)) return out
    const byId = new Map<string, Entry>()
    for (const entry of entries) byId.set(entry.id, entry)
    for (const entry of entries) {
      if (!entry.isBranched) continue
      const root = threadRoot(entry, byId)
      if (root != null) out.set(entry.id, root)
    }
    return out
  }

  private scheduleLayout(agentId: string): void {
    this.pendingLayout.add(agentId)
    if (this.layoutTimer) return
    this.layoutTimer = setTimeout(() => {
      this.layoutTimer = undefined
      for (const id of [...this.pendingLayout]) this.layOut(id)
    }, 90)
  }

  /** The motion was played: a row scrolled away and back comes in still. */
  settled(id: string): void {
    this.arrived.delete(id)
  }

  /**
   * A chat comes on screen: what the app already has at once (the server's
   * copy too), then the chat opened on the host as the window opens it (its
   * newest lines, and its new ones streaming from now on); and it is read.
   * The "New" line marks what came since it was last read.
   */
  async open(agentId: string): Promise<void> {
    const backend = this.backend
    if (!backend) return
    this.openChat = agentId
    const agent = this.agent(agentId)
    const unread = agent
      ? agent.hasUnread
        ? Math.max(agent.unreadCount, 1)
        : 0
      : 0
    if (this.readsServerCopy) void this.showServerLines(agentId)
    const cached = this.transcripts[agentId]
    if (cached) {
      const boundary = unreadBoundary(cached, unread)
      if (boundary != null) this.unreadAfter[agentId] = boundary
      else delete this.unreadAfter[agentId]
      this.setTranscript(agentId, cached)
    }
    this.changed()
    await this.refresh(agentId, unread)
    if (backend !== this.backend) return
    const index = this.agents.findIndex((row) => row.id === agentId)
    if (index >= 0) {
      this.agents = this.agents.map((row, i) =>
        i === index ? { ...row, hasUnread: false, unreadCount: 0 } : row,
      )
      this.changed()
    }
    await backend.markRead(agentId)
  }

  /**
   * A chat's newest lines for its preview, read without opening it on the
   * host, so it stays unread. Kept: the chat opens with them at once.
   */
  async peek(agentId: string): Promise<void> {
    const backend = this.backend
    if (!backend) return
    if (this.transcripts[agentId] == null) await this.showServerLines(agentId)
    if (
      !(
        this.transcripts[agentId] == null || this.savedLinesLackNewest(agentId)
      ) ||
      this.peeking.has(agentId)
    )
      return
    this.peeking.add(agentId)
    try {
      const entries = await backend.tail(agentId, 40)
      if (!(this.transcripts[agentId] == null || this.savedLines.has(agentId)))
        return
      // Lines kept older than the newest forty stay under them, and all of it is replaced when the chat is fetched.
      const known = new Set(entries.map((entry) => entry.id))
      const oldest = entries[0]?.timestampMs ?? Infinity
      const lines = [
        ...(this.transcripts[agentId] ?? []).filter(
          (entry) => !known.has(entry.id) && (entry.timestampMs ?? 0) < oldest,
        ),
        ...entries,
      ]
      if (this.savedLines.has(agentId))
        this.savedLines.set(agentId, new Set(lines.map((entry) => entry.id)))
      this.setTranscript(agentId, lines)
    } catch {
      // The preview stays as it was.
    } finally {
      this.peeking.delete(agentId)
    }
  }

  /** The chat left the screen: all of it was read, whatever came while it was open. */
  close(agentId: string): void {
    if (this.openChat === agentId) {
      this.openChat = undefined
      this.changed()
    }
    this.markRead(agentId)
  }

  /** The chat on screen is read: here at once, and on the host. */
  markRead(agentId: string): void {
    const index = this.agents.findIndex((agent) => agent.id === agentId)
    const agent = this.agents[index]
    if (agent && (agent.hasUnread || agent.unreadCount > 0)) {
      this.agents = this.agents.map((row, i) =>
        i === index ? { ...row, hasUnread: false, unreadCount: 0 } : row,
      )
      this.changed()
    }
    this.markReadSoon(agentId)
  }

  /**
   * The host counts a chat unread when anything in it is newer than its last
   * reading, so a line that comes into the chat on screen makes it unread
   * again. While it is on screen, the roster's word for it is "read", and the
   * host is told so.
   */
  private readingOpenChat(list: Agent[]): Agent[] {
    const open = this.openChat
    if (!this.isForeground || open == null) return list
    const index = list.findIndex((agent) => agent.id === open)
    const agent = list[index]
    if (!agent || !(agent.hasUnread || agent.unreadCount > 0)) return list
    this.markReadSoon(open)
    return list.map((row, i) =>
      i === index ? { ...row, hasUnread: false, unreadCount: 0 } : row,
    )
  }

  /** One `setAgentUnread` at a time per chat; one more after it if more came meanwhile. */
  private markReadSoon(agentId: string): void {
    const backend = this.backend
    if (!backend) return
    if (this.marking.has(agentId)) {
      this.markAgain.add(agentId)
      return
    }
    this.marking.add(agentId)
    void backend.markRead(agentId).finally(() => {
      this.marking.delete(agentId)
      if (this.markAgain.delete(agentId)) this.markReadSoon(agentId)
    })
  }

  /** The chat fetched again: its newest lines, with any that streamed in meanwhile kept. */
  async refresh(agentId: string, unread?: number): Promise<void> {
    const backend = this.backend
    if (!backend || this.refreshing.has(agentId)) return
    this.refreshing.add(agentId)
    this.fetching.add(agentId)
    this.changed()
    try {
      const page = await backend.transcriptPage(agentId)
      if (backend !== this.backend) return
      const fresh = page.entries
      // The server's copy goes: the computer's copy is the chat's. Only what streamed in since stays.
      const kept = this.savedLines.get(agentId) ?? new Set<string>()
      this.savedLines.delete(agentId)
      this.savedOlder.delete(agentId)
      let merged = mergeLines(
        fresh,
        (this.transcripts[agentId] ?? []).filter(
          (entry) => !kept.has(entry.id),
        ),
      )
      const oldest = fresh[0]?.timestampMs
      if (this.paged.has(agentId) && oldest != null) {
        // Older pages scrolled in stay: the fetch carries only the newest lines.
        const known = new Set(merged.map((entry) => entry.id))
        merged = [
          ...(this.transcripts[agentId] ?? []).filter(
            (entry) =>
              !known.has(entry.id) && (entry.timestampMs ?? 0) < oldest,
          ),
          ...merged,
        ]
      } else if (page.olderBefore != null)
        this.olderBefore[agentId] = page.olderBefore
      else delete this.olderBefore[agentId]
      if (unread != null) {
        const boundary = unreadBoundary(merged, unread)
        if (boundary != null) this.unreadAfter[agentId] = boundary
        else delete this.unreadAfter[agentId]
      }
      this.loadFailed.delete(agentId)
      this.setTranscript(agentId, merged)
    } catch (error) {
      if (backend !== this.backend) return
      // The computer rests: the server's copy stands, and nothing failed.
      if (GatewayError.isResting(error)) return
      // Nothing to show: the chat says it could not load, with Retry (the window's "Couldn't load this conversation").
      const shown = this.transcripts[agentId]
      if (shown && shown.length > 0) return
      this.loadFailed.add(agentId)
      this.setTranscript(agentId, [])
    } finally {
      this.refreshing.delete(agentId)
      this.fetching.delete(agentId)
      this.changed()
    }
  }

  /** The open chat's newest line is one the app has not seen (a line that did not stream): fetch the chat again. */
  private catchUpOpenChat(): void {
    const chat = this.openChat
    if (chat == null) return
    const newest = this.agent(chat)?.lastMessageId
    const have = this.transcripts[chat]
    if (newest == null || !have || this.refreshing.has(chat)) return
    if (
      have.some((entry) => entry.id === newest) ||
      this.caughtUp[chat] === newest
    )
      return
    this.caughtUp[chat] = newest
    void this.refresh(chat)
  }

  /** The hundred lines before the oldest one here (the chat, scrolled near its top). */
  async loadOlder(agentId: string): Promise<void> {
    const backend = this.backend
    const before = this.olderBefore[agentId]
    if (!backend || before == null || this.loadingOlder.has(agentId)) return
    this.loadingOlder.add(agentId)
    this.changed()
    try {
      const page = await backend.transcriptPage(agentId, before)
      if (backend !== this.backend) return
      const have = this.transcripts[agentId] ?? []
      const known = new Set(have.map((entry) => entry.id))
      this.paged.add(agentId)
      if (page.olderBefore != null) this.olderBefore[agentId] = page.olderBefore
      else delete this.olderBefore[agentId]
      this.setTranscript(agentId, [
        ...page.entries.filter((entry) => !known.has(entry.id)),
        ...have,
      ])
    } catch {
      // Scrolled up again, it asks again.
    } finally {
      this.loadingOlder.delete(agentId)
      this.changed()
    }
  }

  /**
   * The server's copy of a chat's lines (`GET /desktop/api/chats/lines`),
   * shown while the computer's copy has not come; the computer's replaces it.
   */
  private async showServerLines(agentId: string): Promise<void> {
    const asked = this.backend
    if (
      !this.readsServerCopy ||
      !asked ||
      this.serverLinesAsked.has(agentId) ||
      !this.showsKeptOrNothing(agentId)
    )
      return
    this.serverLinesAsked.add(agentId)
    try {
      let answer: JSONValue
      try {
        answer = await asked.server(
          `chats/lines?agentId=${encodeURIComponent(agentId)}&limit=${serverLinesKept}`,
        )
      } catch {
        return
      }
      if (asked !== this.backend || !this.showsKeptOrNothing(agentId)) return
      const entries = Entry.list(field(answer, 'entries'))
      if (entries.length === 0) return
      const kept = this.savedLines.get(agentId) ?? new Set<string>()
      const lines = mergeLines(
        entries,
        (this.transcripts[agentId] ?? []).filter(
          (entry) => !kept.has(entry.id),
        ),
      )
      this.savedLines.set(agentId, new Set(lines.map((entry) => entry.id)))
      if (bool(field(answer, 'hasOlder')) === true) this.savedOlder.add(agentId)
      else this.savedOlder.delete(agentId)
      this.loadFailed.delete(agentId)
      this.setTranscript(agentId, lines)
    } finally {
      this.serverLinesAsked.delete(agentId)
    }
  }

  /** The chat shows only the server's lines, or nothing yet (or "Couldn't load"): the computer's copy has not come. */
  private showsKeptOrNothing(agentId: string): boolean {
    return (
      this.savedLines.has(agentId) ||
      (this.transcripts[agentId]?.length ?? 0) === 0
    )
  }

  /** The chat shows the server's lines without its newest one, as the list knows it. */
  private savedLinesLackNewest(agentId: string): boolean {
    const kept = this.savedLines.get(agentId)
    if (!kept) return false
    const newest = this.agent(agentId)?.lastMessageId
    return newest == null || !kept.has(newest)
  }

  // MARK: Sending

  /**
   * A message, and the composer's files (each put on the agent's computer
   * first, `uploadAttachment`). It shows at once and stays until the host's
   * copy arrives; if it cannot be sent it says "Failed to send" under it,
   * with Resend and Delete.
   */
  async send(
    words: string,
    agentId: string,
    options: {
      files?: { name: string; data: Uint8Array }[]
      replyTo?: string
      inThread?: boolean
      richText?: string
      id?: string
    } = {},
  ): Promise<void> {
    const trimmed = words.trim()
    const files = options.files ?? []
    if (!this.backend || (trimmed === '' && files.length === 0)) return
    // It waits while the computer is out of reach, or behind another of this chat's messages still on its way.
    const behind = (this.outbox.get(agentId) ?? []).some(
      (item) => item.state === 'sending' || item.state === 'queued',
    )
    const waits = this.isDown || behind
    const item: Outgoing = {
      id: options.id ?? newMessageId(),
      text: trimmed,
      files,
      replyTo: options.replyTo,
      thread: (options.inThread ?? false) && options.replyTo != null,
      richText: options.richText,
      at: Date.now(),
      known: new Set(
        (this.transcripts[agentId] ?? []).map((entry) => entry.id),
      ),
      state: waits ? 'queued' : 'sending',
      // A computer that is only asleep is not offline: the agent is not told the message was written offline.
      composedOffline: waits && this.isDown && !this.isAsleep,
    }
    files.forEach((file, index) =>
      this.keepSent(file.data, outboxFileURL(item.id, index)),
    )
    this.outbox.set(agentId, [...(this.outbox.get(agentId) ?? []), item])
    this.outboxChanged()
    this.arrived.add(item.id)
    files.forEach((_, index) => this.arrived.add(`${item.id}-file${index}`))
    this.layOut(agentId)
    // Held: it goes when the computer is back, or when the one before it has gone; held while the computer is out of reach,
    // it goes to the server meanwhile.
    if (waits) {
      if (this.isDown) await this.handToServer(agentId)
      return
    }
    await this.deliver(item.id, agentId)
  }

  private outboxChanged(): void {
    const waiting = [...this.outbox.values()].some((list) =>
      list.some((item) => item.state === 'queued'),
    )
    if (waiting !== this.waitingToSend) {
      this.waitingToSend = waiting
      this.changed()
    }
  }

  /**
   * The chat's held messages handed to Simeon Labs' server while the computer
   * is out of reach (`POST /desktop/api/chats/send`): the server keeps each,
   * wakes the computer and hands it over. In the order written: one with
   * files (they go to the computer itself) waits here, and those after it
   * with it. What the server refuses waits here.
   */
  private async handToServer(agentId: string): Promise<void> {
    const backend = this.backend
    if (!this.readsServerCopy || !backend || this.handingToServer.has(agentId))
      return
    this.handingToServer.add(agentId)
    let handed = false
    try {
      while (this.isDown && this.backend === backend) {
        const item = this.nextToHand(agentId)
        if (!item) break
        const args = LiveBackend.sendArguments(
          agentId,
          item.text,
          [],
          {
            replyTo: item.replyTo,
            isFork: item.thread,
            richText: item.richText,
            composedAtMs: item.composedOffline ? item.at : undefined,
          },
          item.id,
        )
        try {
          await backend.server('chats/send', 'POST', args)
        } catch {
          return
        }
        handed = true
        // Sent to the computer meanwhile (it came back), or canceled: left as it is.
        const now = this.outbox
          .get(agentId)
          ?.find((waiting) => waiting.id === item.id)
        if (this.backend !== backend || now?.state !== 'queued') return
        this.mark(item.id, agentId, 'withServer')
      }
    } finally {
      this.handingToServer.delete(agentId)
      // The server wakes the computer for it: the chat reaches it now, so the answer streams as it is written.
      if (handed) backend.computerWaking?.()
    }
  }

  /** The chat's first held message, when every one before it is with the host or the server; none at one on its way, or with files. */
  private nextToHand(agentId: string): Outgoing | undefined {
    for (const item of this.outbox.get(agentId) ?? []) {
      switch (item.state) {
        case 'sent':
        case 'withServer':
        case 'failed':
          continue
        case 'sending':
          return undefined
        case 'queued':
          return item.files.length === 0 ? item : undefined
      }
    }
    return undefined
  }

  /**
   * Cancel on a held message: it never left, so it leaves the screen and what
   * was written goes back to its composer. False, with "This message is
   * already sending and can't be canceled." in the composer, when it is no
   * longer held.
   */
  cancelQueued(id: string, agentId: string): boolean {
    const item = this.outbox
      .get(agentId)
      ?.find((waiting) => waiting.id === id && waiting.state === 'queued')
    if (!item) {
      this.showComposerNotice(
        t("This message is already sending and can't be canceled."),
        agentId,
      )
      return false
    }
    this.discardFailed(id, agentId)
    // What was written goes back to the composer it came from.
    this.canceledDraft = {
      id: newMessageId(),
      scope: draftScope(agentId, item.thread ? item.replyTo : undefined),
      text: item.text,
      files: item.files,
      replyTo: item.thread ? undefined : item.replyTo,
      richText: item.richText,
    }
    this.changed()
    return true
  }

  /** The composer took the canceled message back, or had words of its own. */
  takeCanceledDraft(id: string): void {
    if (this.canceledDraft?.id === id) {
      this.canceledDraft = undefined
      this.changed()
    }
  }

  /** What the person has typed and not sent in a composer, kept while the tab is open. */
  setDraft(words: string, scope: string): void {
    const kept = words.trim() === '' ? undefined : words
    if (this.drafts[scope] === kept) return
    if (kept == null) delete this.drafts[scope]
    else this.drafts[scope] = kept
    this.changed()
  }

  showComposerNotice(words: string, agentId: string, seconds = 6): void {
    const notice = { id: newMessageId(), agentId, text: plainError(words) }
    this.composerNotice = notice
    this.changed()
    setTimeout(() => {
      if (this.composerNotice?.id === notice.id) {
        this.composerNotice = undefined
        this.changed()
      }
    }, seconds * 1000)
  }

  /** Out of reach, or back: held messages say which, and go to the server meanwhile; back, they go. */
  private setDown(down: boolean): void {
    this.isDown = down
    const held = [...this.outbox.keys()].filter((chat) =>
      (this.outbox.get(chat) ?? []).some((item) => item.state === 'queued'),
    )
    for (const chat of held) this.layOut(chat)
    if (down) for (const chat of held) void this.handToServer(chat)
    else
      for (const chat of [...this.outbox.keys()]) void this.sendNextQueued(chat)
    this.changed()
  }

  /** The chat's next held message, when none of its messages is on its way and the computer is in reach (the window's `flushAgent`). */
  private async sendNextQueued(agentId: string): Promise<void> {
    // Out of reach meanwhile (the one before failed as it went): the server takes them.
    if (this.isDown) {
      await this.handToServer(agentId)
      return
    }
    const list = this.outbox.get(agentId) ?? []
    if (list.some((item) => item.state === 'sending')) return
    const next = list.find(
      (item) => item.state === 'queued' || item.state === 'withServer',
    )
    if (next) await this.deliver(next.id, agentId)
  }

  private keepSent(data: Uint8Array, key: string): void {
    this.sentFiles.push({ keys: [key], data })
    if (this.sentFiles.length > 24)
      this.sentFiles.splice(0, this.sentFiles.length - 24)
  }

  /** A file sent from this tab, by any address it is shown under, with all of them (the first is its waiting line's). */
  sentFile(url: string): { keys: string[]; data: Uint8Array } | undefined {
    for (let i = this.sentFiles.length - 1; i >= 0; i -= 1)
      if (this.sentFiles[i]!.keys.includes(url)) return this.sentFiles[i]
    return undefined
  }

  /** Resend on a message that failed. */
  async resend(id: string, agentId: string): Promise<void> {
    if (
      !(this.outbox.get(agentId) ?? []).some(
        (item) => item.id === id && item.state === 'failed',
      )
    )
      return
    await this.deliver(id, agentId)
  }

  /** Delete on a message that failed: it was never sent, so it only leaves the screen. */
  discardFailed(id: string, agentId: string): void {
    const left = (this.outbox.get(agentId) ?? []).filter(
      (item) => item.id !== id,
    )
    if (left.length === 0) this.outbox.delete(agentId)
    else this.outbox.set(agentId, left)
    this.outboxChanged()
    this.layOut(agentId)
  }

  private mark(id: string, agentId: string, state: Outgoing['state']): void {
    const item = this.outbox.get(agentId)?.find((waiting) => waiting.id === id)
    if (!item) return
    const was = item.state
    item.state = state
    this.outboxChanged()
    // Laid out again only for a change the chat shows ("Failed to send", "Waiting to send…").
    const shown = (s: Outgoing['state']) => s === 'failed' || s === 'queued'
    if (shown(was) || shown(state)) this.layOut(agentId)
  }

  private async deliver(id: string, agentId: string): Promise<void> {
    const backend = this.backend
    const item = this.outbox.get(agentId)?.find((waiting) => waiting.id === id)
    if (!backend || !item) return
    this.mark(id, agentId, 'sending')
    const refs: AttachmentRef[] = []
    try {
      for (const [index, file] of item.files.entries()) {
        const answer = await backend.command('uploadAttachment', {
          filename: file.name,
          bytesBase64: base64(file.data),
          agentId,
        })
        const path = text(field(answer, 'path'))
        if (path == null)
          throw new GatewayError('the computer kept no copy', true)
        refs.push({ path, name: file.name })
        // The host's line for the file names this path: the tab's copy answers for it too.
        const key = outboxFileURL(item.id, index)
        const kept = [...this.sentFiles]
          .reverse()
          .find((sent) => sent.keys.includes(key))
        if (kept && !kept.keys.includes(path)) kept.keys.push(path)
      }
      const options: SendOptions = {
        replyTo: item.replyTo,
        isFork: item.thread,
        richText: item.richText,
        composedAtMs: item.composedOffline ? item.at : undefined,
      }
      await backend.send(agentId, item.text, refs, options, item.id)
    } catch {
      this.mark(id, agentId, 'failed')
      await this.sendNextQueued(agentId)
      return
    }
    this.mark(id, agentId, 'sent')
    void this.sendNextQueued(agentId)
    // The host's copy may already be here: the waiting one goes, and only then is the chat laid out again.
    const waiting = this.outbox.get(agentId)?.length ?? 0
    this.settleOutbox(agentId, this.transcripts[agentId] ?? [])
    if ((this.outbox.get(agentId)?.length ?? 0) !== waiting)
      this.layOut(agentId)
    // The host has it. If its copy did not stream (a dropped stream), fetch the chat; then the waiting one goes either way.
    setTimeout(() => void this.settleLate(id, agentId), 4_000)
  }

  private async settleLate(id: string, agentId: string): Promise<void> {
    if (!(this.outbox.get(agentId) ?? []).some((item) => item.id === id)) return
    await this.refresh(agentId)
    if (
      (this.outbox.get(agentId) ?? []).some(
        (item) => item.id === id && item.state === 'sent',
      )
    ) {
      this.discardFailed(id, agentId)
    }
  }

  /** The host's copy of a waiting message arrived: the waiting one goes, and the host's takes its place without moving in again. */
  private settleOutbox(agentId: string, entries: readonly Entry[]): void {
    const waiting = this.outbox.get(agentId)
    if (!waiting || waiting.length === 0) return
    const claimed = new Set<string>()
    const left = waiting.filter((item) => {
      if (item.state === 'failed' || item.state === 'queued') return true
      const words = item.text.trim()
      const names = new Set(item.files.map((file) => file.name))
      const copy = entries.find((entry) => {
        if (item.known.has(entry.id) || claimed.has(entry.id)) return false
        // The host keeps the nonce it was sent with: that is this message, whatever the host made of its text.
        if (text(entry.get('clientNonce')) === item.id) return true
        if (words !== '')
          return (
            (entry.isFromPerson || entry.role === 'user') &&
            entry.content?.trim() === words
          )
        return (
          entry.kind === 'user-attachment' &&
          names.has(
            text(entry.get('file_name')) ?? text(entry.get('fileName')) ?? '',
          )
        )
      })
      if (!copy) return true
      claimed.add(copy.id)
      // Held while offline: the host's line keeps saying so, here, until the tab closes.
      if (item.composedOffline) this.sentOffline.set(copy.id, item.at)
      this.arrived.delete(copy.id)
      return false
    })
    if (left.length === 0) this.outbox.delete(agentId)
    else this.outbox.set(agentId, left)
    this.outboxChanged()
  }

  // MARK: Threads (the window's thread view)

  /** A thread comes on screen in its chat, made from the chat's own lines: its first message and the replies that lead back to it. */
  openThread(rootId: string, agentId: string): void {
    this.openThreads[agentId] = rootId
    this.layOut(agentId)
    this.changed()
  }

  /** Back to the chat. */
  closeThread(agentId: string): void {
    if (this.openThreads[agentId] == null) return
    delete this.openThreads[agentId]
    delete this.threadRows[agentId]
    this.changed()
  }

  /** The first message of the thread a line is in, when it is a reply in one. */
  threadRootOf(entryId: string, agentId: string): string | undefined {
    return this.threadRootsOf[agentId]?.get(entryId)
  }

  /** The thread's first message, for its header. */
  threadTitle(rootId: string, agentId: string): string {
    return threadTitle(
      (this.transcripts[agentId] ?? []).find((entry) => entry.id === rootId),
    )
  }

  /** The lines find searches: the open thread's, else the chat's own, with the messages waiting to go. */
  findableEntries(agentId: string): Entry[] {
    const entries = [
      ...(this.transcripts[agentId] ?? []),
      ...(this.outbox.get(agentId) ?? []).flatMap(entriesFor),
    ]
    const root = this.openThreads[agentId]
    if (root != null) return threadEntries(root, entries)
    return threadSplit(entries, this.olderBefore[agentId] != null).visible
  }
}

/** Bytes as base64, for `uploadAttachment`. */
function base64(data: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < data.length; i += 0x8000)
    binary += String.fromCharCode(...data.subarray(i, i + 0x8000))
  return btoa(binary)
}
