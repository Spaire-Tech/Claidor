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

import {
  type PlanFacts,
  type SandAccess,
  accessFrom,
  checkingAccess,
  planFacts,
  unknownAccess,
} from './access'
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
  addingAllowRule,
  autoReviewFrom,
  autoReviewJSON,
  proposedRule,
} from './cards'
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
import { type ConnectedApp, connectedApp } from './connectedApps'
import { Entry, appliedChange } from './entry'
import { fileLine, fileSize } from './fileLine'
import { byteCap, computerPath } from './filePreview'
import {
  type FlightBookingAnswer,
  type FlightOffer,
  type OpenFlight,
  type Traveller,
  bookingAnswer,
  travellerJSON,
} from './flightCards'
import { GatewayError } from './gatewayConnection'
import { type JSONValue, arr, bool, field, int, num, str, text } from './json'
import { t } from './l10n'
import { currentLanguage } from './language'
import { type Agent, agentFrom, sameAgent, sortRoster } from './models'
import {
  type FirstRun,
  chiefOfStaff,
  computerWait,
  handOffDwell,
  normalizedName,
  probeEvery,
  suggestedName,
  unreachableLine,
} from './onboarding'
import { plainError } from './plainWords'
import {
  type SidebarSection,
  createSection,
  newSectionId,
  normalize,
  parseSections,
  sectionsJSON,
} from './sidebarSections'
import { bytesFromBase64URL } from './tokens'

/** A call whose failure changes nothing: tried, and let be. */
async function quietly(call: Promise<unknown>): Promise<void> {
  try {
    await call
  } catch {
    // Told again another time, or not needed.
  }
}

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
  /** The connected apps (`desktopMcp` `listServers`), which "@" offers; read as a chat opens. */
  apps: ConnectedApp[] = []
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
  /** Each file card's line once the computer answered, and whether it read the file as text. */
  private fileLines = new Map<string, FileFacts>()
  private appsLoad?: Promise<void>
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
    // The pins and sections, shared with the Mac through the computer's settings.
    if (this.backend === backend) await this.loadSidebar()
  }

  /** Signed out, or the sign-in ended. */
  detach(): void {
    this.listening?.abort()
    this.listening = undefined
    this.backend = undefined
    this.access = checkingAccess
    this.plan = undefined
    this.pendingAnswers = {}
    this.answeredApprovals = {}
    this.resetRequestCards()
    this.resetConnectCards()
    this.resetFlightCards()
    this.resetShopCards()
    this.firstRunAgentId = undefined
    this.firstRunNamed = false
    // A hand-off waiting on the name step ends (it finds the account gone and makes nothing).
    const waiting = this.firstRunNameWaiters
    this.firstRunNameWaiters = []
    for (const resume of waiting) resume()
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
    this.apps = []
    this.pinnedIds = []
    this.sidebarSections = undefined
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
    this.fileLines = new Map()
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
            await this.loadSidebar()
          })()
        }
        return
      }
      case 'settingsChanged': {
        // Another device (or this one) changed the computer's settings: the pins and sections read again.
        const every = event.fields.length === 0
        const pins = every || event.fields.includes('pinnedAgentIds')
        const sections = every || event.fields.includes('sidebarSections')
        if (pins && sections) void this.loadSidebar()
        else if (pins) void this.loadPins()
        else if (sections) void this.loadSections()
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

  // MARK: The list, as the Mac's sidebar (pins, sections, read, hidden, delete, duplicate)

  /** The pinned agents, in their order (the host's `pinnedAgentIds`, shared with the Mac). */
  pinnedIds: string[] = []
  /**
   * The sidebar's sections as the host keeps them (`sidebarSections`): none
   * read yet, and nothing can be moved, until the computer answers; empty
   * when the person has made none.
   */
  sidebarSections?: SidebarSection[]
  /** Bumped by each pin written here: a read of the host's pins begun before it would undo it, so it is dropped. */
  private pinWrites = 0
  /** Pin writes on their way: no read begins meanwhile (its answer could come back without the write). */
  private pinWritesInFlight = 0
  /** Bumped by each sections write, so a read begun before it is dropped. */
  private sectionWrites = 0
  private sectionSeed = 0

  /** The pinned agents that still exist and are not hidden, in pin order. */
  get pinned(): Agent[] {
    return this.pinnedIds
      .map((id) =>
        this.agents.find((agent) => agent.id === id && !agent.isHidden),
      )
      .filter((agent): agent is Agent => agent != null)
  }

  get hiddenAgents(): Agent[] {
    return this.agents.filter((agent) => agent.isHidden)
  }

  /** The host's settings, read without waking a computer that rests. */
  private async hostSettings(): Promise<JSONValue | undefined> {
    try {
      return await this.backend?.command(
        'getHostSettings',
        {},
        { wakes: false },
      )
    } catch {
      return undefined
    }
  }

  /** The pins and sections at once: one read of the computer's settings. */
  async loadSidebar(): Promise<void> {
    if (this.pinWritesInFlight > 0) return this.loadSections()
    const pins = this.pinWrites
    const sections = this.sectionWrites
    const settings = await this.hostSettings()
    if (settings === undefined) return
    this.takePins(settings, pins)
    this.takeSections(settings, sections)
  }

  /** The computer's pins (`getHostSettings` → `pinnedAgentIds`). */
  async loadPins(): Promise<void> {
    if (this.pinWritesInFlight > 0) return
    const started = this.pinWrites
    const settings = await this.hostSettings()
    if (settings !== undefined) this.takePins(settings, started)
  }

  /** The pins read, unless one was written since the read began. */
  private takePins(settings: JSONValue, started: number): void {
    if (started !== this.pinWrites || this.pinWritesInFlight > 0) return
    const ids = (arr(field(settings, 'pinnedAgentIds')) ?? [])
      .map(text)
      .filter((id): id is string => id != null)
    if (ids.join('\u0000') === this.pinnedIds.join('\u0000')) return
    this.pinnedIds = ids
    this.changed()
  }

  /** Pin or unpin: the whole ordered list is written, as the Mac writes it (`setHostSettings({pinnedAgentIds})`); a new pin goes last. */
  async setPinned(agentId: string, pinned: boolean): Promise<void> {
    const next = this.pinnedIds.filter((id) => id !== agentId)
    if (pinned) next.push(agentId)
    await this.writePins(
      next,
      pinned ? t("Couldn't pin it") : t("Couldn't unpin it"),
    )
  }

  /** Moves a pin to another pin's place (the Mac's drag in the pin grid). */
  async movePin(agentId: string, index: number): Promise<void> {
    const from = this.pinnedIds.indexOf(agentId)
    if (from < 0) return
    const next = this.pinnedIds.filter((id) => id !== agentId)
    next.splice(Math.min(Math.max(index, 0), next.length), 0, agentId)
    await this.writePins(next, t("Couldn't move the pin"))
  }

  /** Shown at once, then written; a refusal puts back what the host holds. */
  private async writePins(next: string[], failure: string): Promise<void> {
    if (next.join('\u0000') === this.pinnedIds.join('\u0000')) return
    this.pinWrites += 1
    this.pinnedIds = next
    this.changed()
    this.pinWritesInFlight += 1
    const written = await this.command(
      'setHostSettings',
      { pinnedAgentIds: next },
      failure,
    )
    this.pinWritesInFlight -= 1
    if (written === undefined) await this.loadPins()
  }

  /** The host's sections (`getHostSettings` → `sidebarSections`, an empty list when none). */
  async loadSections(): Promise<void> {
    const started = this.sectionWrites
    const settings = await this.hostSettings()
    if (settings !== undefined) this.takeSections(settings, started)
  }

  /** The sections read, unless they were written since the read began. */
  private takeSections(settings: JSONValue, started: number): void {
    if (started !== this.sectionWrites) return
    const next = parseSections(field(settings, 'sidebarSections') ?? [])
    if (JSON.stringify(next) === JSON.stringify(this.sidebarSections)) return
    this.sidebarSections = next
    this.changed()
  }

  /**
   * One change to the sections, shown at once and written whole
   * (`setHostSettings({sidebarSections})`), as the window's store edits
   * them; a refusal puts back what the host holds. Nothing changes before
   * there are sections read.
   */
  editSections(
    change: (sections: SidebarSection[]) => SidebarSection[],
  ): boolean {
    const current = this.sidebarSections
    if (!current) return false
    const next = normalize(change(current))
    if (JSON.stringify(next) === JSON.stringify(current)) return true
    this.sectionWrites += 1
    this.sidebarSections = next
    this.changed()
    void (async () => {
      const written = await this.command(
        'setHostSettings',
        { sidebarSections: sectionsJSON(next) },
        t("Couldn't change it"),
      )
      if (written === undefined) await this.loadSections()
    })()
    return true
  }

  /** A new section at the top, holding these agents; its id, to rename it at once. */
  createSection(agentIds: readonly string[]): string | undefined {
    if (!this.sidebarSections) return undefined
    this.sectionSeed += 1
    const id = newSectionId(this.sectionSeed)
    this.editSections((sections) => createSection(sections, id, agentIds))
    return id
  }

  /** Mark as Read / Mark as Unread (`setAgentUnread`), shown at once. */
  async setUnread(agentId: string, unread: boolean): Promise<void> {
    this.agents = this.agents.map((agent) =>
      agent.id === agentId
        ? {
            ...agent,
            hasUnread: unread,
            unreadCount: unread ? Math.max(agent.unreadCount, 1) : 0,
          }
        : agent,
    )
    this.changed()
    await this.command(
      'setAgentUnread',
      { id: agentId, isUnread: unread, atMs: Date.now() },
      t("Couldn't change it"),
    )
  }

  /** Hide from the list, or show again (`setAgentHiddenFromSidebar`). A hidden agent keeps working and keeps its history. */
  async setHidden(agentId: string, hidden: boolean): Promise<void> {
    this.agents = this.agents.map((agent) =>
      agent.id === agentId ? { ...agent, isHidden: hidden } : agent,
    )
    this.changed()
    const done = await this.command(
      'setAgentHiddenFromSidebar',
      { id: agentId, isHidden: hidden },
      hidden ? t("Couldn't hide it") : t("Couldn't show it again"),
    )
    if (done === undefined) await this.reloadRoster()
  }

  /** Deletes agents or groups and their chats (`deleteAgents`); false when the host refused. */
  async deleteAgents(agentIds: readonly string[]): Promise<boolean> {
    const backend = this.backend
    if (!backend) return false
    try {
      await backend.command('deleteAgents', { ids: [...agentIds] })
    } catch {
      this.problem = t('Deleting failed. Check your connection and try again.')
      this.changed()
      return false
    }
    const gone = new Set(agentIds)
    this.agents = this.agents.filter((agent) => !gone.has(agent.id))
    this.pinnedIds = this.pinnedIds.filter((id) => !gone.has(id))
    for (const id of agentIds) {
      delete this.transcripts[id]
      delete this.chatRows[id]
      delete this.runFlags[id]
    }
    this.changed()
    return true
  }

  /** A copy of an agent (`duplicateAgent`); the copy's id, to open it. */
  async duplicate(agentId: string): Promise<string | undefined> {
    const answer = await this.command(
      'duplicateAgent',
      { id: agentId },
      t("Couldn't duplicate it"),
    )
    if (answer === undefined) return undefined
    await this.reloadRoster()
    return (
      text(field(field(answer, 'agent'), 'id')) ??
      text(field(answer, 'id')) ??
      text(field(answer, 'agentId'))
    )
  }

  /** Rename in the row (`updateAgent` with the name and the description as they are); shown at once, the roster read again on a refusal. */
  async renameAgent(agentId: string, name: string): Promise<void> {
    const agent = this.agent(agentId)
    if (!agent) return
    this.agents = this.agents.map((one) =>
      one.id === agentId ? { ...one, name } : one,
    )
    this.changed()
    // As the Mac's profile field: quietly, the roster read again on a refusal.
    try {
      await this.backend?.command('updateAgent', {
        id: agentId,
        profile: { name, description: agent.description },
      })
    } catch {
      await this.reloadRoster()
    }
  }

  // MARK: The first run (Onboarding.swift) and the account's access (StoreSettings.swift)

  /** Whether this account may use Simeon (`GetSandAccessStatus`): checking until it is read. */
  access: SandAccess = checkingAccess
  /** The plan, as far as the access cover reads it (`user/quota`); none until it is read. */
  plan?: PlanFacts
  /** Simeon, once the hand-off made him: a second try does not make a second. */
  private firstRunAgentId?: string
  private firstRunNamed = false
  private firstRunNameWaiters: (() => void)[] = []

  private async countAgents(backend: AgentBackend): Promise<number> {
    const answer = await backend.command('countAgents', {})
    return int(answer) ?? int(field(answer, 'count')) ?? 0
  }

  /**
   * The start-up gate (`hUn`): seen when the host says so; else the agents
   * are counted, and an account that has some is marked seen (the host is
   * told); none means the first run. Where the server lets the computer
   * rest: none made yet and no agents is a new account (its computer is made
   * by the hand-off, its first task); asleep with agents listed here or in
   * the server's copy has used Simeon. Neither wakes it.
   */
  async firstRun(): Promise<FirstRun> {
    const backend = this.backend
    if (!backend) return 'unknown'
    const rest = await backend.computerRest()
    if (rest === 'absent') return this.agents.length === 0 ? 'needed' : 'seen'
    if (rest === 'asleep') {
      if (this.agents.length === 0 && this.readsServerCopy)
        await this.showServerList(backend)
      if (this.agents.length > 0) return 'seen'
    }
    try {
      const settings = await backend.command('getHostSettings', {})
      if (bool(field(settings, 'hasSeenOnboarding')) === true) return 'seen'
    } catch {
      // The count below says.
    }
    try {
      if ((await this.countAgents(backend)) > 0) {
        await quietly(
          backend.command('setHostSettings', { hasSeenOnboarding: true }),
        )
        return 'seen'
      }
      return 'needed'
    } catch {
      return this.agents.length === 0 ? 'unknown' : 'seen'
    }
  }

  /**
   * The hand-off (`Pe`): at least 1.5 s on screen; the computer first (asked
   * every 2.5 s, a minute at most); then, unless the account is onboarded
   * already, the name step's end and the name read again by the computer
   * (`refreshUserName`), and only then Simeon made (his request named for
   * the device, `client`) and his introduction begun, which calls the
   * person by the name they gave; the first run marked done. His id, to
   * open his chat; undefined when the account already had agents. A second
   * try after a failure makes no second Simeon.
   */
  async handOff(
    client: string,
    ready: () => void,
    wait: (seconds: number) => Promise<void> = (seconds) =>
      new Promise((done) => setTimeout(done, seconds * 1000)),
    now: () => number = Date.now,
  ): Promise<string | undefined> {
    const backend = this.backend
    if (!backend) throw new GatewayError(unreachableLine(), false)
    const started = now()
    const dwell = async () => {
      const left = handOffDwell - (now() - started) / 1000
      if (left > 0) await wait(left)
    }
    // The computer: any answer means it is up.
    let count: number | undefined
    while (count === undefined) {
      try {
        count = await this.countAgents(backend)
        break
      } catch {
        // Not yet.
      }
      if ((now() - started) / 1000 >= computerWait) break
      await wait(probeEvery)
    }
    if (count !== undefined) ready()
    if (this.firstRunAgentId === undefined) {
      // The name step over first, and only then the account looked at, so another device's first run meanwhile is seen.
      await this.nameStepOver()
      if (this.backend !== backend)
        throw new GatewayError(unreachableLine(), false)
      if (count === undefined) {
        try {
          count = await this.countAgents(backend)
          ready()
        } catch {
          // Asked again below, by making Simeon.
        }
      }
      let seen = false
      try {
        seen =
          bool(
            field(
              await backend.command('getHostSettings', {}),
              'hasSeenOnboarding',
            ),
          ) === true
      } catch {
        // Not seen, as far as can be told.
      }
      if (seen || (count ?? 0) > 0) {
        await quietly(
          backend.command('setHostSettings', { hasSeenOnboarding: true }),
        )
        await dwell()
        await this.reloadRoster()
        return undefined
      }
      // The language first: a computer made for this first task was not told it, and Simeon introduces himself in it.
      await quietly(
        backend.command('setHostSettings', { userLanguage: currentLanguage() }),
      )
      // The name the person gave, read again by the computer: it read Google's as it started.
      await quietly(backend.command('refreshUserName', {}))
      const made = await backend.command(
        'createAgent',
        chiefOfStaff(
          `${client}-onboarding-${crypto.randomUUID().toLowerCase()}`,
        ),
      )
      const id =
        text(field(field(made, 'agent'), 'id')) ?? text(field(made, 'id'))
      if (!id)
        throw new GatewayError('createAgent: no agent in the answer', true)
      this.firstRunAgentId = id
    }
    const id = this.firstRunAgentId
    await backend.command('kickstartAgent', { id })
    await backend.command('setHostSettings', { hasSeenOnboarding: true })
    await dwell()
    await this.reloadRoster()
    return id
  }

  /** The name step's suggestion (`GET user/profile`): the name chosen, else Google's or Apple's first name. */
  async namePrompt(): Promise<string | undefined> {
    try {
      const profile = await this.backend?.server('user/profile')
      return profile === undefined ? undefined : suggestedName(profile)
    } catch {
      return undefined
    }
  }

  /** The name the agents call the person (`POST user/name`); an empty one is not sent. */
  async saveName(typed: string): Promise<void> {
    const name = normalizedName(typed)
    const backend = this.backend
    if (name === '' || !backend) return
    await quietly(backend.server('user/name', 'POST', { name }))
    if (this.account) {
      this.account = { ...this.account, name }
      this.changed()
    }
  }

  /** The first run's name step is over: the name saved, then the hand-off may make Simeon. */
  async finishNameStep(typed: string): Promise<void> {
    await this.saveName(typed)
    this.firstRunNamed = true
    const waiting = this.firstRunNameWaiters
    this.firstRunNameWaiters = []
    for (const resume of waiting) resume()
  }

  /** Until the name step is over, or the account is gone (`detach`). */
  private nameStepOver(): Promise<void> {
    if (this.firstRunNamed) return Promise.resolve()
    return new Promise((resume) => this.firstRunNameWaiters.push(resume))
  }

  /** Whether this account may use Simeon (`GetSandAccessStatus`); unknown when it can't be read. */
  async refreshAccess(): Promise<void> {
    const backend = this.backend
    if (!backend?.dashboard) {
      this.access = backend ? unknownAccess : checkingAccess
      this.changed()
      return
    }
    try {
      this.access = accessFrom(
        await backend.dashboard('GetSandAccessStatus', {}),
      )
    } catch {
      this.access = unknownAccess
    }
    this.changed()
  }

  /** The plan, as the cover reads it (`GET user/quota`); a failure keeps what was read. */
  async refreshPlan(): Promise<void> {
    try {
      const quota = await this.backend?.server('user/quota')
      if (quota === undefined) return
      this.plan = planFacts(quota)
      this.changed()
    } catch {
      // The last read stays.
    }
  }

  /** Stripe's page for the account (`POST billing/portal`, with its flow): its address, or the words to show. */
  async billingPortal(
    flow?: string,
  ): Promise<{ url?: string; message?: string }> {
    const fallback = t('Couldn’t open billing. Try again.')
    const backend = this.backend
    if (!backend) return { message: t('Sign in to Simeon to continue') }
    try {
      const answer = await backend.server(
        'billing/portal',
        'POST',
        flow ? { flow } : {},
      )
      const url = str(field(answer, 'portalUrl'))
      return url?.startsWith('https://') ? { url } : { message: fallback }
    } catch (error) {
      const words = plainError(
        error instanceof Error ? error.message : String(error),
        fallback,
      )
      return { message: words === '' ? fallback : words }
    }
  }

  // MARK: The waiting cards' answers (Store.swift's card commands)

  /** An answer given on a question card, shown until the computer's copy has it; "" for one dismissed. */
  pendingAnswers: Record<string, string> = {}
  /** How each approval card was answered here (`approved`, `always`, `denied`, `expired`). */
  answeredApprovals: Record<string, string> = {}

  /** A choice, several choices (one per line) or the person's own words, on a question card (`respondToWidget`). */
  async answer(value: string, entryId: string, agentId: string): Promise<void> {
    const backend = this.backend
    if (!backend) return
    this.pendingAnswers[entryId] = value
    this.changed()
    try {
      await backend.command('respondToWidget', { agentId, entryId, value })
    } catch (error) {
      delete this.pendingAnswers[entryId]
      const why = error instanceof Error ? error.message : String(error)
      const name = this.agent(agentId)?.name
      this.problem = name
        ? t`Your answer didn't reach ${name}: ${why}`
        : t`Your answer didn't reach the agent: ${why}`
      this.changed()
    }
  }

  /** The question card's X (`dismissWidget`). */
  async dismissQuestion(entryId: string, agentId: string): Promise<void> {
    this.pendingAnswers[entryId] = ''
    this.changed()
    const done = await this.command(
      'dismissWidget',
      { entryId, agentId },
      t("Couldn't dismiss the question"),
    )
    if (done === undefined) {
      delete this.pendingAnswers[entryId]
      this.changed()
    }
  }

  /** Send on an email or Slack draft, with what the person changed in it (`sendDraft`). */
  async sendDraft(
    entryId: string,
    agentId: string,
    draft: JSONValue,
  ): Promise<void> {
    await this.command(
      'sendDraft',
      { agentId, entryId, draft },
      t("The draft didn't send"),
    )
  }

  async discardDraft(entryId: string, agentId: string): Promise<void> {
    await this.command(
      'discardDraft',
      { agentId, entryId },
      t("Couldn't discard the draft"),
    )
  }

  /**
   * Allow once (`approved`), Always allow (`always`) or Deny (`denied`) on an
   * auto-review approval (`pe`): Always allow first adds the proposed rule
   * to Auto-review, and counts as Allow once when there is none or it can't
   * be saved. The answer shows once the computer takes it, "Expired" when it
   * says the request is stale; any other failure says nothing, as the card.
   */
  async resolveApproval(
    requestId: string,
    resolution: string,
    rule: string | undefined,
    entryId: string,
    agentId: string,
  ): Promise<void> {
    const backend = this.backend
    if (!backend) return
    const sent =
      resolution === 'always'
        ? await this.alwaysAllow(proposedRule(rule))
        : resolution
    try {
      await backend.command('resolveAutoReviewApproval', {
        requestId,
        resolution: sent,
        entryId,
        agentId,
      })
      this.answeredApprovals[entryId] = sent
    } catch (error) {
      const why = error instanceof Error ? error.message : String(error)
      if (why.includes('auto-review/stale'))
        this.answeredApprovals[entryId] = 'expired'
      else delete this.answeredApprovals[entryId]
    }
    this.changed()
  }

  /** The rule saved to Auto-review's allowed list: `always`, or `approved` when there is none or it could not be saved. */
  private async alwaysAllow(rule: string | undefined): Promise<string> {
    const backend = this.backend
    if (rule == null || !backend) return 'approved'
    let settings: JSONValue
    try {
      settings = await backend.command('getHostSettings', {})
    } catch {
      return 'approved'
    }
    const next = addingAllowRule(
      autoReviewFrom(field(settings, 'autoReviewInstructions')),
      rule,
    )
    try {
      await backend.command('setHostSettings', {
        autoReviewInstructions: autoReviewJSON(next),
      })
    } catch {
      return 'approved'
    }
    return 'always'
  }

  // MARK: Step 3b's cards: the secret, the computer hand-off, the in-chat
  // form, 1Password's fill and connect (Store.swift's commands for them).
  // 3b's state and commands go below this line, and nowhere else.

  /** 3b's card state back to nothing (signed out). */
  private resetRequestCards(): void {}

  /** 3b's answers shown here, settled once the computer's copy of a chat has them. */
  private settleRequestCards(agentId: string, entries: readonly Entry[]): void {
    void agentId
    void entries
  }

  // MARK: Step 3c's cards: apps to connect, Slack or GitHub for a routine,
  // the cloud agent, a new teammate joined (Store.swift's commands for them).
  // 3c's state and commands go below this line, and nowhere else.

  /** 3c's card state back to nothing (signed out). */
  private resetConnectCards(): void {}

  /** 3c's answers shown here, settled once the computer's copy of a chat has them. */
  private settleConnectCards(agentId: string, entries: readonly Entry[]): void {
    void agentId
    void entries
  }

  // MARK: Step 3d's flight cards: the flights found and the travellers'
  // form (Store.swift's `startFlightBooking`, `submitFlightPassengers`…).
  // The flights' state and commands go below this line, and nowhere else.

  /**
   * The flight whose details the pane shows (`PaneState.flight`): its key
   * (the card's row and the offer's place), the offer as it was opened, and
   * the agent whose chat holds the card. The window draws it beside that
   * chat (FlightCards.tsx) until the agent's pane comes (step 4).
   */
  openFlight?: OpenFlight

  /** The flight cards' state back to nothing (signed out). */
  private resetFlightCards(): void {
    this.openFlight = undefined
  }

  /**
   * Nothing to settle: Book with Simeon and the form's Continue wait for the
   * computer's own answer, and the form's state is the computer's
   * (`passengersState`), so nothing is shown here ahead of its copy.
   */
  private settleFlightCards(agentId: string, entries: readonly Entry[]): void {
    void agentId
    void entries
  }

  /** A flight row (`__simeonOpenFlight`): the open one again closes its details; another shows in their place. */
  toggleFlight(key: string, offer: FlightOffer, agentId: string): void {
    this.openFlight =
      this.openFlight?.key === key ? undefined : { key, offer, agentId }
    this.changed()
  }

  /** The details' ×, Escape, Book with Simeon done, or another chat opened. */
  closeFlight(): void {
    if (this.openFlight === undefined) return
    this.openFlight = undefined
    this.changed()
  }

  /** "Book with Simeon" on a flight (`startFlightBooking`): the traveller form in the chat, or why not. */
  async startFlightBooking(
    entryId: string,
    offerIndex: number,
    agentId: string,
  ): Promise<FlightBookingAnswer> {
    const backend = this.backend
    if (!backend) return { message: t("Your computer isn't connected.") }
    try {
      return bookingAnswer(
        await backend.command('startFlightBooking', {
          agentId,
          entryId,
          offerIndex,
        }),
      )
    } catch (error) {
      return { message: error instanceof Error ? error.message : String(error) }
    }
  }

  /** The traveller form's Continue (`submitFlightPassengers`): the flight's checkout card, or what to fix. */
  async submitFlightPassengers(
    entryId: string,
    travellers: readonly Traveller[],
    agentId: string,
  ): Promise<FlightBookingAnswer> {
    const backend = this.backend
    if (!backend) return { message: t("Your computer isn't connected.") }
    try {
      return bookingAnswer(
        await backend.command('submitFlightPassengers', {
          agentId,
          entryId,
          passengers: travellers.map(travellerJSON),
        }),
      )
    } catch (error) {
      return { message: error instanceof Error ? error.message : String(error) }
    }
  }

  /** The traveller form's Cancel (the core's; neither the Mac's form nor the iPhone's offers it). */
  async cancelFlightPassengers(
    entryId: string,
    agentId: string,
  ): Promise<void> {
    await this.command(
      'submitFlightPassengers',
      { agentId, entryId, cancel: true },
      t("Couldn't cancel the booking"),
    )
  }

  // MARK: Step 3d's shop cards: a checkout paid with Link and products to
  // buy (Store.swift's `answerPurchase`, `buyProduct`…).
  // The shop's state and commands go below this line, and nowhere else.

  /** The shop cards' state back to nothing (signed out). */
  private resetShopCards(): void {}

  /** The shop cards' answers shown here, settled once the computer's copy of a chat has them. */
  private settleShopCards(agentId: string, entries: readonly Entry[]): void {
    void agentId
    void entries
  }

  // MARK: The chats

  rows(agentId: string): readonly ChatRow[] {
    return this.chatRows[agentId] ?? noRows
  }

  private setTranscript(agentId: string, entries: Entry[], soon = false): void {
    this.transcripts[agentId] = entries
    // A card's answer shown here is the computer's once its copy has it.
    for (const entry of entries)
      if (
        this.pendingAnswers[entry.id] !== undefined &&
        (text(entry.get('respondedValue')) != null ||
          bool(entry.get('widgetDismissed')) === true)
      )
        delete this.pendingAnswers[entry.id]
    this.settleRequestCards(agentId, entries)
    this.settleConnectCards(agentId, entries)
    this.settleFlightCards(agentId, entries)
    this.settleShopCards(agentId, entries)
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

  // MARK: Files

  /**
   * A file an agent sent or the person attached, read from the computer in
   * 4 MiB pieces (`readAttachmentChunk`), as the Mac's preview reads it;
   * none when the computer will not hand it over. With `wakes` false (a
   * picture shown as a chat opens), it waits for a resting computer without
   * waking it.
   */
  async readFile(
    url: string,
    agentId: string,
    {
      limit = 60 << 20,
      wakes = true,
    }: { limit?: number; wakes?: boolean } = {},
  ): Promise<Uint8Array | undefined> {
    const sent = this.sentFile(url)
    if (sent) return sent.data
    const backend = this.backend
    if (!backend) return undefined
    const path = computerPath(url)
    const pieces: Uint8Array[] = []
    let read = 0
    let total = Number.MAX_SAFE_INTEGER
    while (read < Math.min(total, limit)) {
      let piece: JSONValue
      try {
        piece = await backend.command(
          'readAttachmentChunk',
          { path, agentId, offset: read, length: 4 << 20 },
          { wakes },
        )
      } catch {
        return read === 0 ? undefined : joined(pieces, read)
      }
      total = int(field(piece, 'totalSize')) ?? read
      const bytes = bytesFromBase64URL(str(field(piece, 'bytesBase64')) ?? '')
      if (!bytes || bytes.length === 0) break
      pieces.push(bytes)
      read += bytes.length
    }
    if (read === 0) {
      try {
        const image = await backend.command(
          'readAttachmentImage',
          { path },
          { wakes },
        )
        const address =
          str(field(image, 'dataUrl')) ??
          str(field(image, 'url')) ??
          str(image) ??
          ''
        const comma = address.indexOf(',')
        const bytes =
          comma >= 0 ? bytesFromBase64URL(address.slice(comma + 1)) : undefined
        if (bytes && bytes.length > 0) return bytes
      } catch {
        // Neither way: nothing to show.
      }
    }
    return read === 0 ? undefined : joined(pieces, read)
  }

  // MARK: Dictation

  /** What was said in a recording (`transcribeAudio`): Simeon Labs' transcription, in the app's language. */
  async transcribe(audio: Uint8Array, mimeType: string): Promise<string> {
    const backend = this.backend
    if (!backend?.transcribe)
      throw new SimeonAPIError(
        t('Voice transcription source is unavailable.'),
        0,
      )
    return backend.transcribe(audio, mimeType)
  }

  // MARK: The composer's lists

  /**
   * The agent's skills and routines (`getAgentWorkflows`), for "/" and "@";
   * nothing, quietly, when they can't be read. With `wakes` false (a chat
   * opening), a computer that rests is waited for, not woken (step 4),
   * until `signal` ends the wait.
   */
  async workflows(
    agentId: string,
    wakes = true,
    signal?: AbortSignal,
  ): Promise<JSONValue> {
    const backend = this.backend
    if (!backend) return []
    try {
      if (!wakes && backend.commandWhenAwake)
        return await backend.commandWhenAwake(
          'getAgentWorkflows',
          { id: agentId },
          signal,
        )
      return await backend.command(
        'getAgentWorkflows',
        { id: agentId },
        { wakes },
      )
    } catch {
      return []
    }
  }

  /**
   * The connected apps, read again; one read at a time. With `wakes` false
   * (a chat opening), nothing is read while the computer rests, and it is
   * not waited for.
   */
  loadApps(wakes = true): Promise<void> {
    this.appsLoad ??= this.readApps(wakes).finally(() => {
      this.appsLoad = undefined
    })
    return this.appsLoad
  }

  private async readApps(wakes: boolean): Promise<void> {
    const backend = this.backend
    if (!backend) return
    let state: JSONValue
    try {
      state = await backend.command(
        'desktopMcp',
        { action: 'listServers', args: [] },
        { wakes },
      )
    } catch {
      return
    }
    if (this.backend !== backend) return
    const next = (arr(field(state, 'servers')) ?? arr(state) ?? [])
      .map(connectedApp)
      .filter((app): app is ConnectedApp => app != null)
    if (JSON.stringify(next) !== JSON.stringify(this.apps)) {
      this.apps = next
      this.changed()
    }
  }

  /**
   * A file card's line under its name and whether the computer read the
   * file as text (`fileFacts`): the size, or "Couldn't read file"; "" until
   * the computer answers, and again after a failed read, which is tried
   * next time. Text, Markdown and JSON open only once read as text.
   */
  async fileFacts(url: string, wakes = true): Promise<FileFacts> {
    const known = this.fileLines.get(url)
    if (known) return known
    const sent = this.sentFile(url)
    if (sent)
      return {
        line: fileSize(sent.data.length),
        readsAsText: isText(sent.data),
      }
    const backend = this.backend
    if (!backend) return { line: '' }
    let answer: JSONValue
    try {
      answer = await backend.command(
        'readAttachmentText',
        { path: computerPath(url) },
        { wakes },
      )
    } catch {
      return { line: '' }
    }
    const facts = {
      line: fileLine(answer),
      readsAsText: str(field(answer, 'kind')) === 'text',
    }
    this.fileLines.set(url, facts)
    return facts
  }

  /**
   * A file read for the preview (`readForPreview`): its size asked first
   * (a piece of no length), so a file over the cap (25 MB) is never
   * fetched; then its bytes, or nothing when the computer will not hand it
   * over.
   */
  async readForPreview(url: string, agentId: string): Promise<PreviewRead> {
    const sent = this.sentFile(url)
    if (sent)
      return sent.data.length > byteCap
        ? { kind: 'tooLarge', size: sent.data.length }
        : { kind: 'ready', data: sent.data }
    const backend = this.backend
    if (!backend) return { kind: 'missing' }
    try {
      const probe = await backend.command('readAttachmentChunk', {
        path: computerPath(url),
        agentId,
        offset: 0,
        length: 0,
      })
      const total = int(field(probe, 'totalSize'))
      if (total != null && total > byteCap)
        return { kind: 'tooLarge', size: total }
    } catch {
      // No size: the read below says whether it is there.
    }
    const data = await this.readFile(url, agentId, { limit: byteCap })
    return data ? { kind: 'ready', data } : { kind: 'missing' }
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

  // MARK: The cards' and the messages' commands (host/gateway-protocol.ts)

  /** One command to the computer; a failure is said once (`problem`), and gives nothing back. */
  async command(
    method: string,
    args: JSONValue,
    failure?: string,
  ): Promise<JSONValue | undefined> {
    const backend = this.backend
    if (!backend) return undefined
    try {
      return await backend.command(method, args)
    } catch (error) {
      const why = error instanceof Error ? error.message : String(error)
      this.problem = t`${failure ?? t("That didn't work")}: ${why}`
      this.changed()
      return undefined
    }
  }

  /** A reaction of the person's own, added or taken off: on the message at once, taken back if the computer refuses it. */
  async react(emoji: string, entryId: string, agentId: string): Promise<void> {
    const shown = this.toggleMyReaction(emoji, entryId, agentId)
    const answer = await this.command(
      'reactToMessage',
      { entryId, emoji, agentId },
      t("Couldn't react"),
    )
    if (answer === undefined && shown)
      this.toggleMyReaction(emoji, entryId, agentId)
  }

  /** The person's own `emoji` on one message, added or taken off here; false when the message isn't in the chat read. */
  private toggleMyReaction(
    emoji: string,
    entryId: string,
    agentId: string,
  ): boolean {
    const entries = this.transcripts[agentId]
    const index = entries?.findIndex((entry) => entry.id === entryId) ?? -1
    if (!entries || index < 0) return false
    const next = [...entries]
    next[index] = next[index]!.togglingMyReaction(emoji)
    this.setTranscript(agentId, next)
    return true
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

/** What the preview has of a file (`PreviewRead`): its bytes, too large to show (over 25 MB), or nothing. */
export type PreviewRead =
  | { kind: 'ready'; data: Uint8Array }
  | { kind: 'tooLarge'; size: number }
  | { kind: 'missing' }

/** A file card's line, and whether the computer read the file as text (unknown until it answers). */
export interface FileFacts {
  line: string
  readsAsText?: boolean
}

/** The pieces read, as one. */
function joined(pieces: readonly Uint8Array[], length: number): Uint8Array {
  const all = new Uint8Array(length)
  let at = 0
  for (const piece of pieces) {
    all.set(piece, at)
    at += piece.length
  }
  return all
}

/** Whether the bytes are UTF-8 text (`String(data:encoding: .utf8)`). */
function isText(data: Uint8Array): boolean {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(data)
    return true
  } catch {
    return false
  }
}

/** Bytes as base64, for `uploadAttachment`. */
function base64(data: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < data.length; i += 0x8000)
    binary += String.fromCharCode(...data.subarray(i, i + 0x8000))
  return btoa(binary)
}
