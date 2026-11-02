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
  pausesSending,
  paymentMethodFlow,
  planFacts,
  unknownAccess,
} from './access'
import type { AgentDraft } from './agentDraft'
import { type ExchangeLine, exchangeLines } from './agentNetwork'
import {
  type VoiceChoice,
  keptVoice,
  voiceChoicesFrom,
  voicePlan,
} from './agentVoices'
import { SimeonAPIError } from './api'
import {
  type AppAccount,
  type AppAccounts,
  accountPath,
  appAccountsFrom,
  toolkitOf,
} from './appAccounts'
import {
  type AgentBackend,
  type AttachmentRef,
  type BackendEvent,
  LiveBackend,
  type SendOptions,
  newMessageId,
} from './backend'
import { type CallEngine, type CallState, voiceCallsEnabled } from './call'
import { type CallTonePlaying, WebCallTones } from './callTones'
import {
  addingAllowRule,
  autoReviewFrom,
  autoReviewJSON,
  proposedRule,
} from './cards'
import { type ChannelsView, channelDeadline, channelsFrom } from './channels'
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
import {
  type AgentPointer,
  type BoxStatus,
  ComputerBook,
  type ComputerHelper,
  type TypingField,
  agentPointerFrom,
  boxStatusFrom,
  computerScreen,
  helperScreens,
  screenURL,
  typingFieldFrom,
  withDeadline,
} from './cloudComputer'
import {
  type RebuildKind,
  type RebuildSteps,
  RebuildWords,
  type UpdateAvailability,
  projectSteps,
  updateAvailability,
} from './computerRebuild'
import {
  type CatalogApp,
  type CloudAgentRead,
  type ListenerPlatform,
  appsComingSoonBuiltIn,
  catalogApp,
  catalogFrom,
  cloudAgentInfo,
  comingSoonFrom,
  connectedToolCount,
  isComingSoon,
  isConnected,
  listenerConnectedIn,
  webPage,
} from './connectCards'
import { type ConnectedApp, connectedApp, makeApp } from './connectedApps'
import {
  type ConnectStart,
  type SignInAnswer,
  alreadySignedIn,
  authorizationURL,
  didntConnect,
} from './connecting'
import { callTransport } from './elevenLabsVoice'
import { Entry, appliedChange } from './entry'
import {
  type AgentFace,
  faceForReset,
  faceURL,
  ownFace,
  shuffledFace,
  voiceForFace,
} from './faces'
import { type DeviceFacts, type FeedbackReport, feedbackBody } from './feedback'
import { fileLine, fileSize } from './fileLine'
import { byteCap, computerPath } from './filePreview'
import {
  type FlightBookingAnswer,
  type Traveller,
  bookingAnswer,
  travellerJSON,
} from './flightCards'
import { GatewayError } from './gatewayConnection'
import {
  type AutoReviewInstructions,
  detectedTimeZone,
  isHiddenZone,
  normalizedRules,
} from './generalSettings'
import {
  type JSONObject,
  type JSONValue,
  arr,
  bool,
  field,
  int,
  num,
  str,
  text,
} from './json'
import { t } from './l10n'
import { currentLanguage } from './language'
import {
  MigrationRelay,
  type RebuildServer,
  type RecreateAnswer,
  rebuildServerOf,
} from './migrationWatch'
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
  PluginCalls,
  type Removal,
  privateCopies,
  setupAgentIn,
} from './pluginCalls'
import {
  type AgentSkill,
  type EffectivePlugin,
  type PluginEntry,
  type PluginServer,
  type PluginTool,
  pluginEntriesFrom,
  serverAccounts,
} from './plugins'
import { type SignInFlow, signInKey, signInTimeout } from './pluginsOverlay'
import {
  RebuildDriver,
  type RebuildInputs,
  noRebuildInputs,
} from './rebuildDriver'
import { RoutineTestRuns } from './routineEditing'
import {
  type Routine,
  createdRoutine,
  routinesFrom,
  sameRoutines,
} from './routines'
import {
  type FileHit,
  type MessageHit,
  type RoutineHit,
  fileHitFrom,
  messageHitFrom,
  routineHitFrom,
} from './search'
import {
  type SidebarSection,
  createSection,
  newSectionId,
  normalize,
  parseSections,
  sectionsJSON,
} from './sidebarSections'
import {
  type PackAsk,
  type StarterPack,
  packAddFailure,
  packAgentArguments,
  packFrom,
  packReadFailure,
  packSectionId,
} from './starterPacks'
import { bytesFromBase64URL } from './tokens'
import { TrayList } from './trays'
import {
  creditsFlow,
  isOutOfCredits,
  startNowFlow,
  upgradeFlow,
} from './upgrade'
import {
  type UsageLoad,
  emptyUsage,
  shownSummary,
  showsSection,
  usageFreshMs,
  usageSummary,
} from './usage'
import { LiveCall, type VoiceTransport } from './voiceCall'

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
    this.resetAvatarAndNewAgent()
    this.resetRoutines()
    this.resetSearchAndChannels()
    this.resetOrgChartAndPacks()
    this.resetComputer()
    this.resetRebuild()
    this.resetCalls()
    this.resetConnecting()
    this.resetConnectors()
    this.resetConnectorPages()
    this.resetGeneralSettings()
    this.resetUsageAndBilling()
    this.resetDesktopSession()
    this.resetDesktopSurfaces()
    this.resetDesktopOutside()
    this.resetDesktopUpdates()
    this.resetDesktopHands()
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
        // Held while the computer is rebuilt, read again once it ends (Store.swift's `rosterHeld`, 5c).
        if (this.holdsRoster()) return
        this.showingSaved = false
        this.listFromServer = false
        const sorted = this.readingOpenChat(sortRoster(event.agents))
        if (!sameList(sorted, this.agents)) this.agents = sorted
        this.changed()
        this.catchUpOpenChat()
        return
      }
      case 'agentUpserted': {
        if (this.holdsRoster()) return
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
          // The computers watched read again, and started again where started here (5b).
          this.computerReconnected()
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
      case 'automations':
        this.applyAutomations(event.agentId, event.automations)
        return
      case 'computerAsleep':
        if (this.isAsleep === event.asleep) return
        this.isAsleep = event.asleep
        this.changed()
        return
      case 'computer':
      case 'diskPressure':
      case 'computerAction':
      case 'subagents':
        this.applyComputer(event)
        return
      case 'tray':
        // The computer's notices (6f): the credits' line reads an open agent's.
        this.takeTray(event.tray)
        return
      case 'appsChanged':
        // An app connected or removed on the computer: the apps read again (Store.swift's `.appsChanged`), so a sign-in finished after its wait says Connected.
        void this.loadApps()
        return
      default:
        // The rebuild's and the move's (5c); the rest comes with its screens.
        this.applyRebuild(event)
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
    this.forgetRoutines(agentIds)
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
    await this.saveProfileField(agentId, name, agent.description)
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

  /**
   * Stripe's page for the account (`POST billing/portal`, StoreSettings.swift's
   * `billingPortal`): the confirmation of the next plan up (`update_confirm`
   * with its `tier`), the card form for a payment that failed
   * (`payment_method`), Start Plan Now for a card trial (`start_now`),
   * extra credits (`credits`), or its front page. No `back` on the web: it
   * opens it in a tab, and the page ends on the web's billing page (decision
   * of 1 November 2026); the Windows app names itself (`back: "simeon"`,
   * as the Mac), so the page ends on the app's own link. Its address, or the
   * words to show.
   */
  async billingPortal(
    flow?: string,
    tier?: string,
    back?: string,
  ): Promise<{ url?: string; message?: string }> {
    const fallback = t('Couldn’t open billing. Try again.')
    const backend = this.backend
    if (!backend) return { message: t('Sign in to Simeon to continue') }
    const fields: JSONObject = {}
    if (flow === upgradeFlow && tier) {
      fields.flow = upgradeFlow
      fields.tier = tier
    } else if (
      flow &&
      [paymentMethodFlow, startNowFlow, creditsFlow].includes(flow)
    )
      fields.flow = flow
    if (back) fields.back = back
    try {
      const answer = await backend.server('billing/portal', 'POST', fields)
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
  //
  // Nothing of these cards is kept here: each reads its own line, which the
  // computer stamps (`secretProvided`, `boxResolution`, `formState`,
  // `credentialState`, `connectState`), and what a card holds while it is
  // answered (what was typed, a refusal) is the card's own, as the Mac's.
  // The secret's X is the question's (`dismissQuestion`, `dismissWidget`).

  /** 3b's card state back to nothing (signed out). */
  private resetRequestCards(): void {}

  /** 3b's answers shown here, settled once the computer's copy of a chat has them. */
  private settleRequestCards(agentId: string, entries: readonly Entry[]): void {
    void agentId
    void entries
  }

  /** Save securely on a secret card (`submitSecret`): the computer keeps it where the agent asked, and marks the card (`secretProvided`). */
  async submitSecret(
    value: string,
    entryId: string,
    agentId: string,
  ): Promise<void> {
    await this.command(
      'submitSecret',
      { entryId, value, agentId },
      t("The secret wasn't saved"),
    )
  }

  /**
   * I'm done (`button`) or Skip (`dismissed`) on a hand-off
   * (`handBackForeverBox`); the computer takes it from there, and a failure
   * is not said (the window's is an empty function).
   */
  async handBackComputer(agentId: string, skip = false): Promise<void> {
    try {
      await this.backend?.command('handBackForeverBox', {
        id: agentId,
        trigger: skip ? 'dismissed' : 'button',
      })
    } catch {
      // Said nowhere, as the Mac's.
    }
  }

  /**
   * The in-chat form's Fill in (`submitUserForm`): the values go to the
   * computer, which types them into the page; nothing is kept here.
   * Undefined once it is taken, else the computer's sentence (a field left
   * empty, a form already answered).
   */
  async submitUserForm(
    values: JSONValue,
    entryId: string,
    agentId: string,
  ): Promise<string | undefined> {
    const failed = t("The form wasn't sent")
    const reply = await this.command(
      'submitUserForm',
      { agentId, entryId, values },
      failed,
    )
    if (reply === undefined) return failed
    return bool(field(reply, 'ok')) === false
      ? (text(field(reply, 'message')) ?? failed)
      : undefined
  }

  /** The in-chat form's X (`dismissUserForm`): a decline. */
  async dismissUserForm(entryId: string, agentId: string): Promise<void> {
    await this.command(
      'dismissUserForm',
      { agentId, entryId },
      t("Couldn't dismiss the form"),
    )
  }

  /** The 1Password fill card's Fill (`allow`), once the person confirmed it, or Not now. Undefined once taken, else why not. */
  async answerCredentialRequest(
    entryId: string,
    allow: boolean,
    agentId: string,
  ): Promise<string | undefined> {
    const failed = t("1Password didn't get your answer")
    const reply = await this.command(
      'answerCredentialRequest',
      { agentId, entryId, allow },
      failed,
    )
    if (reply === undefined) return failed
    return bool(field(reply, 'ok')) === false
      ? (text(field(reply, 'message')) ?? failed)
      : undefined
  }

  /** The 1Password connect card's X (`dismissOnePasswordConnect`): a decline. */
  async dismissOnePasswordConnect(
    entryId: string,
    agentId: string,
  ): Promise<void> {
    await this.command(
      'dismissOnePasswordConnect',
      { agentId, entryId },
      t("Couldn't dismiss the card"),
    )
  }

  // MARK: Step 3c's cards: apps to connect, Slack or GitHub for a routine,
  // the cloud agent, a new teammate joined (Store.swift's commands for them).
  // 3c's state and commands go below this line, and nowhere else.

  /** The apps the catalogue offers (`getCatalog`, in the app's language): an app card's title and line, and the id the computer files it under. */
  catalog: CatalogApp[] = []
  /** The same answer's entries as Connectors lists them (Store.swift's `catalogEntries`, `PluginEntry`; step 6c). */
  catalogEntries: PluginEntry[] = []
  /** The apps that can't be connected yet (`AppsComingSoon`): the server's list once read. */
  appsComingSoon: Set<string> = new Set(appsComingSoonBuiltIn)
  /** The catalogue was read from the computer in this sign-in. */
  private catalogFresh = false
  private appCardsLoad?: Promise<void>
  private catalogRead?: Promise<PluginEntry[] | undefined>

  /** 3c's card state back to nothing (signed out). */
  private resetConnectCards(): void {
    this.catalog = []
    this.catalogEntries = []
    this.appsComingSoon = new Set(appsComingSoonBuiltIn)
    this.catalogFresh = false
    this.appCardsLoad = undefined
    this.catalogRead = undefined
  }

  /**
   * 3c's answers shown here, settled once the computer's copy of a chat has
   * them: none. Nothing these cards show is the person's answer kept here:
   * the apps, the catalogue, Slack's and GitHub's links, a cloud agent's
   * state and the roster are each read from the computer as they are.
   */
  private settleConnectCards(agentId: string, entries: readonly Entry[]): void {
    void agentId
    void entries
  }

  /**
   * What an app card reads as it shows (the Mac's card's `loadApps`): the
   * connected apps, and, once a sign-in, the catalogue and the apps that
   * can't be connected yet, all at once. One read at a time.
   */
  loadAppCards(): Promise<void> {
    if (this.appCardsLoad) return this.appCardsLoad
    const load: Promise<void> = (async () => {
      const once = !this.catalogFresh
      await Promise.all([
        this.loadApps(),
        once ? this.readCatalog() : undefined,
        once ? this.loadAppsComingSoon() : undefined,
      ])
    })().finally(() => {
      // Only this read's: a sign-out and sign-in meanwhile may have started another.
      if (this.appCardsLoad === load) this.appCardsLoad = undefined
    })
    this.appCardsLoad = load
    return load
  }

  /**
   * The catalogue from the computer (`desktopMcp` `getCatalog`, Store.swift's
   * `readCatalog`): the cards' apps and Connectors' entries, from one answer
   * (`takeCatalog`); what was shown stays when it doesn't answer. One read
   * at a time: a card's and Connectors' often ask together. The entries, or
   * none when it didn't answer.
   */
  readCatalog(): Promise<PluginEntry[] | undefined> {
    if (this.catalogRead) return this.catalogRead
    const read: Promise<PluginEntry[] | undefined> =
      this.fetchCatalog().finally(() => {
        // Only this read's: a sign-out and sign-in meanwhile may have started another.
        if (this.catalogRead === read) this.catalogRead = undefined
      })
    this.catalogRead = read
    return read
  }

  private async fetchCatalog(): Promise<PluginEntry[] | undefined> {
    const backend = this.backend
    if (!backend) return undefined
    let answer: JSONValue
    try {
      answer = await backend.command('desktopMcp', {
        action: 'getCatalog',
        args: [{ language: currentLanguage() }],
      })
    } catch {
      return undefined
    }
    if (this.backend !== backend) return undefined
    this.catalogFresh = true
    const next = catalogFrom(answer)
    const entries = pluginEntriesFrom(answer)
    let moved = false
    if (JSON.stringify(next) !== JSON.stringify(this.catalog)) {
      this.catalog = next
      moved = true
    }
    if (JSON.stringify(entries) !== JSON.stringify(this.catalogEntries)) {
      this.catalogEntries = entries
      moved = true
    }
    if (moved) this.changed()
    return this.catalogEntries
  }

  /** Which apps can't be connected yet, from Simeon Labs' server (`GET apps`); an older server's answer, or none, keeps the list. */
  async loadAppsComingSoon(): Promise<void> {
    const backend = this.backend
    if (!backend) return
    let answer: JSONValue
    try {
      answer = await backend.server('apps')
    } catch {
      return
    }
    const named = comingSoonFrom(answer)
    if (this.backend !== backend || !named) return
    const same =
      named.size === this.appsComingSoon.size &&
      [...named].every((one) => this.appsComingSoon.has(one))
    if (same) return
    this.appsComingSoon = named
    this.changed()
  }

  /** The catalogue's app a card names ("Gmail"). */
  catalogApp(name: string): CatalogApp | undefined {
    return catalogApp(this.catalog, name)
  }

  /** Whether an app a card names is connected. */
  isConnected(name: string): boolean {
    return isConnected(this.apps, this.catalog, name)
  }

  /** Whether an app can't be connected yet: "Coming soon" on its card. */
  isComingSoon(name: string): boolean {
    return isComingSoon(this.appsComingSoon, this.catalog, name)
  }

  /** How many tools a connected app brings. */
  connectedToolCount(name: string): number {
    return connectedToolCount(this.apps, name)
  }

  /** Whether Slack or GitHub is linked for routines to wake on (`getListenerIntegrations`); none while it can't be known. */
  async listenerConnected(
    platform: ListenerPlatform,
  ): Promise<boolean | undefined> {
    const backend = this.backend
    if (!backend) return undefined
    try {
      return listenerConnectedIn(
        await backend.command('getListenerIntegrations', {}),
        platform,
      )
    } catch {
      return undefined
    }
  }

  /** The page that links Slack or GitHub (`getListenerConnectUrl`); a failure is said (`problem`), as the core says it. */
  async listenerConnectURL(
    platform: ListenerPlatform,
  ): Promise<string | undefined> {
    const backend = this.backend
    if (!backend) return undefined
    try {
      const answer = await backend.command('getListenerConnectUrl', {
        platform,
      })
      return text(field(answer, 'url'))
    } catch (error) {
      const why = error instanceof Error ? error.message : String(error)
      this.problem = t`Couldn't open the link: ${why}`
      this.changed()
      return undefined
    }
  }

  /** A cloud agent's state (`getCloudAgentInfo`): what it is, nothing (final), or that it couldn't be asked. */
  async cloudAgent(bcId: string): Promise<CloudAgentRead> {
    const backend = this.backend
    if (!backend) return { kind: 'failed' }
    let answer: JSONValue
    try {
      answer = await backend.command('getCloudAgentInfo', {
        bcId,
        includeFiles: false,
      })
    } catch {
      return { kind: 'failed' }
    }
    const info = cloudAgentInfo(answer)
    return info ? { kind: 'info', info } : { kind: 'empty' }
  }

  // MARK: Step 3d's flight cards: the flights found and the travellers'
  // form (Store.swift's `startFlightBooking`, `submitFlightPassengers`…).
  // The flights' state and commands go below this line, and nowhere else.

  /** The flight cards' state back to nothing (signed out): none is kept here; a flight's details are the window's (windowModel.ts). */
  private resetFlightCards(): void {}

  /**
   * Nothing to settle: Book with Simeon and the form's Continue wait for the
   * computer's own answer, and the form's state is the computer's
   * (`passengersState`), so nothing is shown here ahead of its copy.
   */
  private settleFlightCards(agentId: string, entries: readonly Entry[]): void {
    void agentId
    void entries
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

  /** Checkout cards answered here (Allow is `sending`, Deny `denied`), until the computer's copy says so. */
  answeredPurchases: Record<string, import('./shopCards').PurchaseState> = {}
  /** The Link card picked on a checkout card here (its id), until Allow carries it to the computer. */
  pickedPurchaseCards: Record<string, string> = {}
  /** Buy pressed here on a products card (the product's place), until the computer's copy says so. */
  pressedProducts: Record<string, number> = {}
  /** Checkout cards with Link this app asked the computer to keep watching, once each per state. */
  private watchedPurchases = new Set<string>()

  /** The shop cards' state back to nothing (signed out). */
  private resetShopCards(): void {
    this.answeredPurchases = {}
    this.pickedPurchaseCards = {}
    this.pressedProducts = {}
    this.watchedPurchases = new Set()
  }

  /** The shop cards' answers shown here, settled once the computer's copy of a chat has them. */
  private settleShopCards(agentId: string, entries: readonly Entry[]): void {
    void agentId
    for (const entry of entries) {
      if (
        this.answeredPurchases[entry.id] !== undefined &&
        (text(entry.get('purchaseState')) ?? 'review') !== 'review'
      )
        delete this.answeredPurchases[entry.id]
      const pressed = this.pressedProducts[entry.id]
      if (
        pressed !== undefined &&
        (int(entry.get('productsBuying')) === pressed ||
          (arr(entry.get('productsBought')) ?? []).some(
            (one) => int(one) === pressed,
          ))
      )
        delete this.pressedProducts[entry.id]
    }
  }

  /**
   * Allow or Deny on a checkout card (`answerPurchase`): the card shows the
   * answer at once; Allow then waits on Link, which asks the person to
   * approve it in the Link app. Allow carries the card picked on the card,
   * and `confirmed`, the device's own yes (Face ID or Touch ID on the Mac,
   * Windows Hello later), as the approval Link is handed so it asks no more;
   * the web has none to give (docs/web-app/PROGRESS.md). A failed answer, or
   * one the computer didn't take (Link refused the card picked, which its
   * line says), comes back to the buttons.
   */
  async answerPurchase(
    entryId: string,
    allow: boolean,
    agentId: string,
    confirmed?: { method?: string; deviceType?: string },
  ): Promise<void> {
    if (this.answeredPurchases[entryId] !== undefined) return
    this.answeredPurchases[entryId] = allow ? 'sending' : 'denied'
    this.changed()
    const args: Record<string, JSONValue> = { agentId, entryId, allow }
    const picked = this.pickedPurchaseCards[entryId]
    // The card picked on the card rides with Allow (14 October 2026); the computer checks it with Link first.
    if (allow && picked !== undefined) args.paymentMethodId = picked
    const approval =
      allow && confirmed ? this.purchaseApproval(confirmed) : undefined
    if (approval) args.approval = approval
    const reply = await this.command(
      'answerPurchase',
      args,
      allow
        ? t("The purchase didn't go to Link")
        : t("Couldn't deny the purchase"),
    )
    const waits =
      reply != null &&
      typeof reply === 'object' &&
      !Array.isArray(reply) &&
      (text(field(reply, 'purchaseState')) ?? 'review') === 'review'
    if (reply === undefined || waits) {
      delete this.answeredPurchases[entryId]
      this.changed()
    }
  }

  /**
   * The approval Allow carries, once the device confirmed it (`approval`):
   * who (this account: its id on Simeon Labs' server, else its e-mail),
   * when (whole seconds), how (`biometric_face`, `biometric_fingerprint`,
   * none for a passcode) and on what (`mobile` on an iPhone). None only when
   * nobody is signed in: Link then asks in its app.
   */
  purchaseApproval(
    confirmed: { method?: string; deviceType?: string },
    at: Date = new Date(),
  ): Record<string, JSONValue> | undefined {
    const account = this.account
    if (!account) return undefined
    const who =
      account.id != null && account.id !== ''
        ? account.id
        : account.email.trim()
    if (who === '') return undefined
    const approval: Record<string, JSONValue> = {
      approvedAt: Math.round(at.getTime() / 1000),
      userId: who,
    }
    if (confirmed.method != null)
      approval.authenticationMethod = confirmed.method
    if (confirmed.deviceType != null) approval.deviceType = confirmed.deviceType
    if (account.name !== '') approval.userName = account.name
    return approval
  }

  /** A Link card picked on a checkout card, before Allow: the card shows it at once; Allow carries it. */
  pickPurchaseCard(entryId: string, cardId: string): void {
    this.pickedPurchaseCards[entryId] = cardId
    this.changed()
  }

  /**
   * "Buy with <agent>" on one product of a products card (`buyProduct`): the
   * card marks it at once, and the agent is woken to buy exactly that one.
   * A failed press comes back to the button.
   */
  async buyProduct(
    entryId: string,
    index: number,
    agentId: string,
  ): Promise<void> {
    if (this.pressedProducts[entryId] === index) return
    this.pressedProducts[entryId] = index
    this.changed()
    const done = await this.command(
      'buyProduct',
      { agentId, entryId, index },
      t("Couldn't tell your agent to buy it"),
    )
    if (done === undefined) {
      delete this.pressedProducts[entryId]
      this.changed()
    }
  }

  /**
   * A checkout card still with Link, on screen: the computer makes sure it
   * is watching Link for it (after a restart nothing is), and closes a
   * flight it was paying when it restarted. It never answers a card; once
   * per card and state while the app runs.
   */
  async keepWatchingPurchase(
    entryId: string,
    agentId: string,
    state: import('./shopCards').PurchaseState = 'approving',
  ): Promise<void> {
    const key = `${entryId}#${state}`
    const backend = this.backend
    if (this.watchedPurchases.has(key) || !backend) return
    this.watchedPurchases.add(key)
    try {
      await backend.command('answerPurchase', {
        agentId,
        entryId,
        resume: true,
      })
    } catch {
      // Nothing to say: the card shows the computer's copy either way.
    }
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

  // MARK: Step 4's agent's pane: Profile (StoreAgents.swift's
  // `saveProfileField`, Store.swift's `setNotify`), and the gates "/" and
  // ⌘K share (Jump.swift's `agentNetworkEnabled`, `channelsAvailable`).

  /**
   * One field of the profile (`updateAgent`), as the pane sends it: the
   * name and description always, the title only when it is the field
   * changed. Shown at once; a refusal puts the roster back, quietly.
   */
  async saveProfileField(
    agentId: string,
    name: string,
    description: string,
    title?: string,
  ): Promise<void> {
    if (!this.agent(agentId)) return
    const profile: Record<string, JSONValue> = { name, description }
    if (title !== undefined) profile.title = title
    this.agents = this.agents.map((one) =>
      one.id === agentId
        ? {
            ...one,
            name,
            description,
            ...(title !== undefined ? { title } : {}),
          }
        : one,
    )
    this.changed()
    try {
      await this.backend?.command('updateAgent', { id: agentId, profile })
    } catch {
      await this.reloadRoster()
    }
  }

  /** Notifications on the agent's page (`setAgentNotifyOnUpdates`): shown at once; a refusal is said. */
  async setNotify(agentId: string, on: boolean): Promise<void> {
    this.agents = this.agents.map((one) =>
      one.id === agentId ? { ...one, notifyOnUpdates: on } : one,
    )
    this.changed()
    await this.command(
      'setAgentNotifyOnUpdates',
      { id: agentId, isEnabled: on },
      t("Couldn't change notifications"),
    )
  }

  /** One read for a gate: with `wakes` false, a computer that rests is waited for, not woken, until `signal` ends the wait. */
  private async gateRead(
    method: string,
    args: JSONValue,
    wakes: boolean,
    signal?: AbortSignal,
  ): Promise<JSONValue | undefined> {
    const backend = this.backend
    if (!backend) return undefined
    try {
      if (!wakes && backend.commandWhenAwake)
        return await backend.commandWhenAwake(method, args, signal)
      return await backend.command(method, args, { wakes })
    } catch {
      return undefined
    }
  }

  /** Whether the agent network is on for this account (`isAgentNetworkEnabled`): the Org Chart's gate. */
  async agentNetworkEnabled(
    wakes = true,
    signal?: AbortSignal,
  ): Promise<boolean> {
    const answer = await this.gateRead(
      'isAgentNetworkEnabled',
      {},
      wakes,
      signal,
    )
    return bool(answer) ?? bool(field(answer, 'enabled')) ?? false
  }

  /** Whether a chat can have channels (`getAgentChannels`): any platform available, or any connected. */
  async channelsAvailable(
    agentId: string,
    wakes = true,
    signal?: AbortSignal,
  ): Promise<boolean> {
    const answer = await this.gateRead(
      'getAgentChannels',
      { id: agentId },
      wakes,
      signal,
    )
    const manifests = arr(field(answer, 'manifests')) ?? []
    const connections = arr(field(answer, 'connections')) ?? []
    return (
      manifests.some(
        (manifest) => str(field(manifest, 'availability')) === 'available',
      ) || connections.length > 0
    )
  }

  // MARK: Step 4b's avatar and New Agent: the avatar editor (AvatarEditor.swift,
  // AvatarCrop.swift, AgentVoices.swift, StoreFaces.swift) and New Agent's
  // sheet (NewAgentSheet.swift, AgentDraft.swift, StoreAgents.swift's
  // `createAgent`). 4b's state and commands go below this line, and nowhere
  // else.
  //
  // The pass that gives every agent without a picture its face
  // (StoreFaces.swift's `queueFaces`, `assignMissingFaces`) is not here: the
  // web shows the face each would be given (`pictureOf`) and leaves the
  // giving to the Mac and the iPhone for now (docs/web-app/PROGRESS.md).

  /** The voices listed, kept ten minutes as the Mac keeps them (`voiceList`). */
  private voiceList?: { at: number; list: VoiceChoice[] }
  /** A pass giving the agents their voices, one at a time (`assigning`). */
  private assigningVoices?: Promise<Record<string, string>>

  /**
   * A face's picture as shipped (WebP, 512 px), read from the app's own
   * copy: what is sent to the computer (`AgentFaces.data`). The tests give
   * their own reader.
   */
  readFace = async (face: AgentFace): Promise<Uint8Array | undefined> => {
    const url = faceURL(face)
    if (!url) return undefined
    try {
      const answer = await fetch(url)
      return answer.ok ? new Uint8Array(await answer.arrayBuffer()) : undefined
    } catch {
      return undefined
    }
  }

  /** 4b's state back to nothing (signed out). */
  private resetAvatarAndNewAgent(): void {
    this.voiceList = undefined
    this.assigningVoices = undefined
  }

  /** One agent's row changed here at once (`updateAgentLocally`). */
  private changeAgent(agentId: string, change: (agent: Agent) => Agent): void {
    let changed = false
    this.agents = this.agents.map((agent) => {
      if (agent.id !== agentId) return agent
      changed = true
      return change(agent)
    })
    if (changed) this.changed()
  }

  /**
   * The voices to pick from (`GET proxy/v1/voice/voices`: the founder's,
   * never ElevenLabs' others); none when calls are not switched on or the
   * server can't be reached. Kept ten minutes, as the Mac keeps them.
   */
  async voices(): Promise<VoiceChoice[]> {
    const kept = this.voiceList
    if (kept && Date.now() - kept.at < 600_000) return kept.list
    const backend = this.backend
    if (!backend) return []
    let list: VoiceChoice[]
    try {
      list = voiceChoicesFrom(await backend.server('proxy/v1/voice/voices'))
    } catch {
      return []
    }
    if (backend !== this.backend) return []
    if (list.length > 0) this.voiceList = { at: Date.now(), list }
    return list
  }

  /**
   * The agent's voice for its picker (`ensureVoice`): its own while it is on
   * the list, else one given now by its name, with every other agent missing
   * one. Undefined is the agent's own voice, Michael.
   */
  async ensureVoice(agentId: string): Promise<string | undefined> {
    if (!this.agent(agentId)) await this.reloadRoster()
    const list = await this.voices()
    const kept = keptVoice(this.agent(agentId)?.voiceId, list)
    if (kept !== undefined) return kept
    if (list.length === 0 || !this.agent(agentId)) return undefined
    // A pass already under way may have started before this agent was hired: then one more.
    let all = await this.assignMissingVoices()
    if (all[agentId] === undefined) all = await this.assignMissingVoices()
    return all[agentId]
  }

  /**
   * Gives each agent without a voice on the list its own, as the Mac does
   * (`assignMissingVoices`), and saves it on the agent (`updateAgent` with
   * `voiceId`). One pass at a time; every agent's voice after it.
   */
  async assignMissingVoices(): Promise<Record<string, string>> {
    if (this.assigningVoices) return this.assigningVoices
    const pass = this.giveMissingVoices()
    this.assigningVoices = pass
    try {
      return await pass
    } finally {
      if (this.assigningVoices === pass) this.assigningVoices = undefined
    }
  }

  private async giveMissingVoices(): Promise<Record<string, string>> {
    const list = await this.voices()
    const plan = voicePlan(this.agents, list)
    for (const { agentId, voiceId } of plan.given) {
      const backend = this.backend
      const agent = this.agent(agentId)
      if (!backend || !agent) continue
      this.changeAgent(agentId, (row) => ({ ...row, voiceId }))
      // Given for now when it can't be saved; the next pass tries again.
      await quietly(
        backend.command('updateAgent', {
          id: agentId,
          profile: {
            name: agent.name,
            description: agent.description,
            title: agent.title,
            voiceId,
          },
        }),
      )
    }
    return plan.voices
  }

  /** The agent's voice (`updateAgent` with `voiceId`, as the Mac's picker saves it): shown at once; refused, the old one comes back and the refusal is thrown. */
  async setAgentVoice(agentId: string, voiceId: string): Promise<void> {
    const agent = this.agent(agentId)
    const backend = this.backend
    if (!agent || !backend) return
    const was = agent.voiceId
    this.changeAgent(agentId, (row) => ({ ...row, voiceId }))
    const profile: Record<string, JSONValue> = {
      name: agent.name,
      description: agent.description,
      voiceId,
    }
    if (!agent.isGroup) profile.title = agent.title
    try {
      await backend.command('updateAgent', { id: agentId, profile })
    } catch (error) {
      this.changeAgent(agentId, (row) => ({ ...row, voiceId: was }))
      throw error
    }
  }

  /** The face's picture to the computer, and the face kept on the agent when it was not kept already (with the voice, when one is given with it). */
  private async sendFace(
    backend: AgentBackend,
    face: AgentFace,
    agent: Agent,
    voiceId?: string,
  ): Promise<void> {
    const bytes = await this.readFace(face)
    if (!bytes)
      throw new GatewayError(
        t`The face ${face.id} is missing from the app.`,
        true,
      )
    await backend.command('setAgentAvatarBytes', {
      id: agent.id,
      pngBase64: base64(bytes),
    })
    if (agent.avatarShape === face.id && voiceId === undefined) return
    // `updateAgent` always carries the name and the description; the fields left out are kept.
    const profile: Record<string, JSONValue> = {
      name: agent.name,
      description: agent.description,
      avatarShape: face.id,
    }
    if (voiceId !== undefined) profile.voiceId = voiceId
    await backend.command('updateAgent', { id: agent.id, profile })
  }

  /**
   * A face from the editor (a pick, Shuffle or Reset, `wearFace`): the
   * agent's picture, and the face kept on it. When the face is not of its
   * voice's gender, the voice changes with it, so face and voice agree.
   * Shown at once; a refusal puts the roster back and is thrown.
   */
  async wearFace(agentId: string, face: AgentFace): Promise<void> {
    const backend = this.backend
    const agent = this.agent(agentId)
    if (!backend || !agent) return
    const list = await this.voices()
    const voiceId = voiceForFace(agent, face, this.agents, list)
    this.changeAgent(agentId, (row) => ({
      ...row,
      avatarVersion: face.version,
      avatarShape: face.id,
      avatarDataURL: undefined,
      ...(voiceId !== undefined ? { voiceId } : {}),
    }))
    try {
      await this.sendFace(backend, face, agent, voiceId)
    } catch (error) {
      await this.reloadRoster()
      throw error
    }
    await this.reloadRoster()
  }

  /** Shuffle: the next face of `gender` no other agent wears, put on at once; the face, or undefined when there is none. */
  async shuffleFace(
    agentId: string,
    gender: string,
  ): Promise<AgentFace | undefined> {
    const agent = this.agent(agentId)
    if (!agent) return undefined
    const current = ownFace(agent)
    const face = shuffledFace(
      current?.gender === gender ? current : undefined,
      gender,
      agentId,
      this.agents,
    )
    if (!face) return undefined
    await this.wearFace(agentId, face)
    return face
  }

  /** Reset: back to the face the agent was given (or the one it would be given now, for an agent from before faces). */
  async resetFace(agentId: string): Promise<AgentFace | undefined> {
    const agent = this.agent(agentId)
    if (!agent) return undefined
    const face = faceForReset(agent, this.agents, await this.voices())
    if (!face) return undefined
    await this.wearFace(agentId, face)
    return face
  }

  /** A picture of the agent's own, uploaded or drawn (`setAgentAvatarBytes`; the face it was given stays kept for Reset); the computer's refusal is thrown. */
  async setAvatarImage(agentId: string, png: Uint8Array | null): Promise<void> {
    const backend = this.backend
    if (!backend) return
    await backend.command('setAgentAvatarBytes', {
      id: agentId,
      pngBase64: png ? base64(png) : null,
    })
    await this.reloadRoster()
  }

  /**
   * A picture drawn from a description for the avatar editor
   * (`POST proxy/v1/images/generations`, the cheapest quality: it is a
   * thumbnail); its bytes, or the words of what went wrong, thrown. It costs
   * the person's credits.
   */
  async generateAvatarImage(description: string): Promise<Uint8Array> {
    const words = description.trim()
    if (words === '')
      throw new GatewayError(t('Describe the avatar to generate first.'), true)
    const backend = this.backend
    if (!backend)
      throw new GatewayError(t('Image generation returned no picture.'), false)
    const answer = await backend.server('proxy/v1/images/generations', 'POST', {
      prompt: words,
      size: 'auto',
      quality: 'low',
    })
    const drawn = text(field(arr(field(answer, 'data'))?.[0], 'b64_json'))
    const bytes = drawn ? bytesFromBase64URL(drawn) : undefined
    if (!bytes || bytes.length === 0)
      throw new GatewayError(t('Image generation returned no picture.'), false)
    return bytes
  }

  /**
   * New Agent (`createAgent(name:draft:)`): the agent made with the face it
   * was shown, its title and, when the person chose any, its voice; a
   * picture drawn or uploaded goes right after it. It is asked to introduce
   * itself. Its id, or undefined with the core's words in `problem`.
   */
  async createAgentFromDraft(
    name: string,
    draft: AgentDraft,
  ): Promise<string | undefined> {
    const backend = this.backend
    if (!backend) return undefined
    let ready = draft.named(name)
    if (draft.chosen)
      ready = ready.settleVoice(this.agents, await this.voices())
    try {
      const id = await this.mintAgent(backend, {
        name,
        title: ready.title,
        face: ready.shownFace(this.agents)?.id,
        voiceId: draft.chosen ? ready.voiceId : undefined,
      })
      if (draft.chosen && ready.picture)
        // Not saved: it wears its face then, as any agent with no picture.
        await quietly(
          backend.command('setAgentAvatarBytes', {
            id,
            pngBase64: base64(ready.picture),
          }),
        )
      await this.reloadRoster()
      return id
    } catch (error) {
      const why = error instanceof Error ? error.message : String(error)
      this.problem = t`Couldn't create ${name}: ${why}`
      this.changed()
      return undefined
    }
  }

  /**
   * `createAgent` as the core's backend sends it (Backend.swift's
   * `createAgent(name:title:description:face:voiceId:)`): introduced at once,
   * the face kept on it (`avatarShape`), its title its role, the voice kept.
   */
  private async mintAgent(
    backend: AgentBackend,
    agent: { name: string; title: string; face?: string; voiceId?: string },
  ): Promise<string> {
    const args: Record<string, JSONValue> = {
      name: agent.name,
      description: '',
      isKickstartRequested: true,
      origin: 'user',
      clientNonce: newMessageId(),
    }
    const role = agent.title.trim()
    if (role !== '') args.title = role
    if (agent.face !== undefined) args.avatarShape = agent.face
    if (agent.voiceId !== undefined) args.voiceId = agent.voiceId
    const answer = await backend.command('createAgent', args)
    const id = text(field(field(answer, 'agent'), 'id'))
    if (!id) throw new GatewayError('createAgent: no agent in the answer', true)
    return id
  }

  // MARK: Step 4c's routines: an agent's routines in its pane and a routine's
  // editor (RoutinesPage.swift, RoutineTriggerCard.swift, Routines.swift,
  // RoutineEditing.swift, RoutineTriggers.swift). 4c's state and commands go
  // below this line, and nowhere else.

  /** Each agent's routines as the host lists them (`getAgentAutomations`, and its `agents-automation` pushes); absent until read. A list is replaced only when it changed, so a screen sees a new list only then. */
  routinesByAgent: Record<string, Routine[]> = {}
  /** Test run's waits, for every routine (the Mac's `pane.runBlocks`). */
  readonly routineRuns = new RoutineTestRuns(() => this.changed())

  /** 4c's state back to nothing (signed out). */
  private resetRoutines(): void {
    this.routinesByAgent = {}
    this.routineRuns.reset()
  }

  /** An agent's list, kept when it changed; Test run's waits move on. */
  private setRoutines(agentId: string, list: Routine[] | undefined): void {
    const was = this.routinesByAgent[agentId]
    if (sameRoutines(was, list)) return
    const next = { ...this.routinesByAgent }
    if (list) next[agentId] = list
    else delete next[agentId]
    this.routinesByAgent = next
    this.changed()
    this.routineRuns.listChanged(agentId, this)
  }

  /** The host's answer, when it is a list (`takeRoutines`). */
  private takeRoutines(agentId: string, answer: JSONValue): void {
    const list = routinesFrom(answer)
    if (list) this.setRoutines(agentId, list)
  }

  /** An agent's routines changed on the computer (`agents-automation`, Store.swift's `.automations`): the whole list. */
  private applyAutomations(agentId: string, rows: JSONValue[]): void {
    this.setRoutines(agentId, routinesFrom(rows) ?? [])
  }

  /** Agents deleted (`forgetAgents`): their routines go with them. */
  private forgetRoutines(agentIds: readonly string[]): void {
    for (const id of agentIds) this.setRoutines(id, undefined)
  }

  /** One routine command; its answer, or undefined when it was refused or the sign-in ended meanwhile. */
  private async routineCommand(
    method: string,
    args: JSONValue,
  ): Promise<{ answer: JSONValue } | undefined> {
    const backend = this.backend
    if (!backend) return undefined
    try {
      const answer = await backend.command(method, args)
      return this.backend === backend ? { answer } : undefined
    } catch {
      return undefined
    }
  }

  /** The agent's routines, read again (`getAgentAutomations`); false when the computer did not answer. */
  async loadRoutines(agentId: string): Promise<boolean> {
    const done = await this.routineCommand('getAgentAutomations', {
      id: agentId,
    })
    if (!done) return false
    this.takeRoutines(agentId, done.answer)
    return true
  }

  /** A new routine (`createAgentAutomation`): the record made, or undefined when none was (a refusal, or the agent's 50 already). */
  async createRoutine(
    agentId: string,
    spec: JSONObject,
  ): Promise<Routine | undefined> {
    const before = new Set(
      (this.routinesByAgent[agentId] ?? []).map((routine) => routine.id),
    )
    const done = await this.routineCommand('createAgentAutomation', {
      id: agentId,
      spec,
    })
    if (!done) return undefined
    this.takeRoutines(agentId, done.answer)
    return createdRoutine(
      this.routinesByAgent[agentId] ?? [],
      before,
      str(field(spec, 'name')) ?? '',
    )
  }

  /** A routine changed (`updateAgentAutomation`); false when it was not saved. */
  async updateRoutine(
    agentId: string,
    routineId: string,
    spec: JSONObject,
  ): Promise<boolean> {
    const done = await this.routineCommand('updateAgentAutomation', {
      id: agentId,
      automationId: routineId,
      spec,
    })
    if (!done) return false
    this.takeRoutines(agentId, done.answer)
    return true
  }

  /** The Active switch (`setAgentAutomationEnabled`), shown at once; false when refused, and the switch goes back. */
  async enableRoutine(
    agentId: string,
    routineId: string,
    on: boolean,
  ): Promise<boolean> {
    const was = this.routinesByAgent[agentId]
    if (was?.some((routine) => routine.id === routineId))
      this.setRoutines(
        agentId,
        was.map((routine) =>
          routine.id === routineId ? { ...routine, isEnabled: on } : routine,
        ),
      )
    const done = await this.routineCommand('setAgentAutomationEnabled', {
      id: agentId,
      automationId: routineId,
      isEnabled: on,
    })
    if (!done) {
      if (this.backend) this.setRoutines(agentId, was)
      return false
    }
    this.takeRoutines(agentId, done.answer)
    return true
  }

  /** Delete, with no question and nothing said when it fails (`deleteAgentAutomation`). */
  async removeRoutine(agentId: string, routineId: string): Promise<void> {
    const done = await this.routineCommand('deleteAgentAutomation', {
      id: agentId,
      automationId: routineId,
    })
    if (done) this.takeRoutines(agentId, done.answer)
  }

  /** Test run (`runAgentAutomationNow`), then the list again for its new run; nothing is said either way. False when the run was refused (and the list is not read). */
  async testRoutine(agentId: string, routineId: string): Promise<boolean> {
    const done = await this.routineCommand('runAgentAutomationNow', {
      id: agentId,
      automationId: routineId,
    })
    if (!done) return false
    await this.loadRoutines(agentId)
    return true
  }

  // MARK: Step 4d's search, channels and a group's members: ⌘K
  // (SearchPanel.swift, Jump.swift, Search.swift), an agent's channels
  // (ChannelsPage.swift, Channels.swift), a group's members
  // (PaneMembersFlight.swift, GroupMembers.swift). 4d's state and commands
  // go below this line, and nowhere else.

  /**
   * 4d's state back to nothing (signed out). The store keeps none: search's
   * words and answers are the window's (SearchPanel.swift's `SearchState`),
   * a Channels page's answer is its own (`ChannelsModel`), and a found line
   * being read in (`loadUntil`) stops when the sign-in it began in ends.
   */
  private resetSearchAndChannels(): void {}

  /** Whether the computer's search index is on (`isGlobalSearchEnabled`); on when it can't be read, as the Mac's default. */
  async globalSearchEnabled(): Promise<boolean> {
    const backend = this.backend
    if (!backend) return true
    let answer: JSONValue
    try {
      answer = await backend.command('isGlobalSearchEnabled', {})
    } catch {
      return true
    }
    return bool(answer) ?? bool(field(answer, 'enabled')) ?? true
  }

  /** Every chat's messages matching the words (`searchAgents`; the computer gives at most 50, 5 a chat, newest first). Thrown when it can't answer. */
  async searchMessages(query: string): Promise<MessageHit[]> {
    const backend = this.backend
    if (!backend) return []
    const answer = await backend.command('searchAgents', { query })
    return (arr(answer) ?? [])
      .map(messageHitFrom)
      .filter((hit): hit is MessageHit => hit != null)
  }

  /** Files matching the words, or the newest 50 for none (`searchMedia`). Thrown when the computer can't answer. */
  async searchFiles(query: string): Promise<FileHit[]> {
    const backend = this.backend
    if (!backend) return []
    const answer = await backend.command('searchMedia', { query })
    return (arr(answer) ?? [])
      .map(fileHitFrom)
      .filter((hit): hit is FileHit => hit != null)
  }

  /** Every agent's routines (`listAllAutomations`); none when they can't be read. */
  async allRoutines(): Promise<RoutineHit[]> {
    const backend = this.backend
    if (!backend) return []
    let answer: JSONValue
    try {
      answer = await backend.command('listAllAutomations', {})
    } catch {
      return []
    }
    return (arr(answer) ?? [])
      .map(routineHitFrom)
      .filter((hit): hit is RoutineHit => hit != null)
  }

  /**
   * A chat's older lines, page by page, until the given one is among them
   * (the Mac's `revealSearchHit`: at most 20 pages or 30 s). Whether it is.
   * It ends with the sign-in it began in.
   */
  async loadUntil(
    entryId: string,
    agentId: string,
    pages = 20,
    seconds = 30,
  ): Promise<boolean> {
    const backend = this.backend
    const started = Date.now()
    const has = () =>
      this.transcripts[agentId]?.some((entry) => entry.id === entryId) === true
    const late = () => (Date.now() - started) / 1000 > seconds
    // The chat opening fetches its newest lines first.
    while (this.transcripts[agentId] == null || this.fetching.has(agentId)) {
      if (late() || backend !== this.backend) return has()
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    for (let page = 0; page < pages; page += 1) {
      // A page the chat itself is reading (its own scroll near the top) is waited for, not counted: loadOlder returns at once meanwhile.
      while (this.loadingOlder.has(agentId)) {
        if (late() || backend !== this.backend) return has()
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
      if (has()) return true
      if (this.olderBefore[agentId] == null || late()) return false
      if (backend !== this.backend) return false
      await this.loadOlder(agentId)
    }
    return has()
  }

  /** A group's members, in its order, those the roster has (`members(of:)`). */
  members(group: Agent): Agent[] {
    return group.memberIds
      .map((id) => this.agent(id))
      .filter((agent): agent is Agent => agent != null)
  }

  /** A group's members (`setGroupMembers`): shown at once, put back and thrown when refused, for the dialog to say. */
  async setGroupMembers(groupId: string, memberIds: string[]): Promise<void> {
    const backend = this.backend
    if (!backend) return
    const was = this.agent(groupId)?.memberIds
    const set = (ids: string[]) => {
      this.agents = this.agents.map((one) =>
        one.id === groupId ? { ...one, memberIds: ids } : one,
      )
      this.changed()
    }
    if (was) set(memberIds)
    try {
      await backend.command('setGroupMembers', {
        id: groupId,
        memberAgentIds: memberIds,
      })
    } catch (error) {
      if (was && this.agent(groupId) && backend === this.backend) set(was)
      throw error
    }
  }

  /** An agent's channels (`getAgentChannels`): undefined when the computer doesn't answer within 15 s. */
  channels(agentId: string): Promise<ChannelsView | undefined> {
    return this.channelCall('getAgentChannels', { id: agentId })
  }

  /** Store securely: the token for `platform` (Slack takes its app and bot tokens together, the computer sorts them). */
  connectChannel(
    agentId: string,
    platform: string,
    token: string,
  ): Promise<ChannelsView | undefined> {
    return this.channelCall('connectChannel', {
      id: agentId,
      platform,
      token,
    })
  }

  refreshChannel(
    agentId: string,
    platform: string,
  ): Promise<ChannelsView | undefined> {
    return this.channelCall('refreshChannel', { id: agentId, platform })
  }

  disconnectChannel(
    agentId: string,
    platform: string,
  ): Promise<ChannelsView | undefined> {
    return this.channelCall('disconnectChannel', { id: agentId, platform })
  }

  /** A channel call (`I$n`): it answers the whole view, and gives up after 15 s (a failure keeps the last answer on screen). */
  private async channelCall(
    method: string,
    args: JSONValue,
  ): Promise<ChannelsView | undefined> {
    const backend = this.backend
    if (!backend) return undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const answer = await Promise.race([
        backend.command(method, args),
        new Promise<undefined>((resolve) => {
          timer = setTimeout(() => resolve(undefined), channelDeadline * 1000)
        }),
      ])
      return channelsFrom(answer)
    } catch {
      return undefined
    } finally {
      clearTimeout(timer)
    }
  }

  // MARK: Step 4e's org chart and starter packs (OrgChart.swift,
  // AgentNetwork.swift, StarterPackSheet.swift, StarterPacks.swift). 4e's
  // state and commands go below this line, and nowhere else.

  /**
   * The starter pack's sheet while it shows (MacServices.swift's
   * `packAsk`): the pack asked for, then read from the server or why it
   * couldn't be, and Add under way. Asked by the window (`askPack`).
   */
  packAsk?: PackAsk
  /** Bumped by each pack asked for and by signing out: a read begun before is dropped. */
  private packAsks = 0

  /** 4e's state back to nothing (signed out). */
  private resetOrgChartAndPacks(): void {
    this.packAsk = undefined
    this.packAsks += 1
  }

  /** Signed out: what the core's `starterPack` says without a backend. */
  private notSignedIn(): SimeonAPIError {
    return new SimeonAPIError(t('Sign in to Simeon first.'), 401)
  }

  /**
   * What two agents said to each other (OrgChart.swift's `ExchangeCard`):
   * the first one's last 200 lines (`tail`, read without opening its chat
   * or waking a computer that rests), their messages to each other, the
   * last 30. Refused when the lines can't be read.
   */
  async networkExchange(
    source: { id: string; name: string },
    targetId: string,
  ): Promise<ExchangeLine[]> {
    const backend = this.backend
    if (!backend) throw this.notSignedIn()
    const entries = await backend.tail(source.id, 200)
    return exchangeLines(entries, source, targetId)
  }

  /** A pack, read from Simeon Labs' server (`starterPack`); the server's sentence when it has none ("This team isn't available anymore."). */
  async starterPack(id: string): Promise<StarterPack> {
    const backend = this.backend
    if (!backend) throw this.notSignedIn()
    const answer = await backend.server(`packs/${id}`)
    const pack = packFrom(answer)
    if (!pack)
      throw new SimeonAPIError(t("This team isn't available anymore."), 404)
    return pack
  }

  /** The pack's agents already here (its section's, still listed); none when it was never added or they are gone. */
  packAgents(pack: StarterPack): string[] {
    const id = packSectionId(pack.id)
    const section = this.sidebarSections?.find((one) => one.id === id)
    if (!section) return []
    const listed = new Set(this.agents.map((agent) => agent.id))
    return section.agentIds.filter((agentId) => listed.has(agentId))
  }

  /**
   * Add (`addPack`): the five agents made one after another, each with its
   * face, title and instructions, and each speaking first at once; then a
   * section named after the pack at the top of the sidebar, holding them.
   * The ids made, the first to open; one that fails is said (`problem`)
   * and the rest are still made.
   */
  async addPack(pack: StarterPack): Promise<string[]> {
    return (await this.makePack(pack)).made
  }

  /** `addPack`, with the last refusal's words (what the Mac's sheet reads back as `problemShown`). */
  private async makePack(
    pack: StarterPack,
  ): Promise<{ made: string[]; problem?: string }> {
    const backend = this.backend
    if (!backend) return { made: [] }
    if (this.sidebarSections === undefined) await this.loadSections()
    const made: string[] = []
    let problem: string | undefined
    for (const member of pack.members) {
      try {
        const answer = await backend.command(
          'createAgent',
          packAgentArguments(member, newMessageId()),
        )
        const id = text(field(field(answer, 'agent'), 'id'))
        if (!id)
          throw new GatewayError('createAgent: no agent in the answer', true)
        made.push(id)
      } catch (error) {
        const why = error instanceof Error ? error.message : String(error)
        problem = t`Couldn't create ${member.name}: ${why}`
        this.problem = problem
        this.changed()
      }
    }
    if (backend !== this.backend) return { made: [], problem }
    await this.reloadRoster()
    if (made.length > 0) {
      // A section at the top holding them, named after the pack (`create`, then `rename`; written normalised).
      const sectionId = packSectionId(pack.id)
      this.editSections((sections) =>
        createSection(sections, sectionId, made).map((section) =>
          section.id === sectionId
            ? { ...section, name: pack.folder }
            : section,
        ),
      )
    }
    return { made, problem }
  }

  /** The website's Add to Simeon (MacServices.swift's `askPack`): the sheet at once, its pack read from the server. */
  askPack(id: string): void {
    if (!this.backend) return
    this.packAsks += 1
    const asked = this.packAsks
    this.packAsk = { id, adding: false }
    this.changed()
    void (async () => {
      let read: PackAsk
      try {
        read = { id, adding: false, pack: await this.starterPack(id) }
      } catch (error) {
        read = { id, adding: false, failure: { read: packReadFailure(error) } }
      }
      if (asked !== this.packAsks || this.packAsk?.id !== id) return
      this.packAsk = read
      this.changed()
    })()
  }

  /**
   * Add on the sheet (`addAskedPack`): a team already added only opens;
   * else the five are made and the sheet goes. The agent to open, the
   * first one's chat; none while adding, or when nothing could be made
   * (the sheet then says why).
   */
  async addAskedPack(): Promise<string | undefined> {
    const ask = this.packAsk
    const pack = ask?.pack
    if (!ask || !pack || ask.adding) return undefined
    const first = this.packAgents(pack)[0]
    if (first) {
      this.packAsk = undefined
      this.changed()
      return first
    }
    const asked = this.packAsks
    this.packAsk = { ...ask, adding: true }
    this.changed()
    const { made, problem } = await this.makePack(pack)
    if (asked !== this.packAsks || this.packAsk?.id !== pack.id)
      return undefined
    if (made[0]) {
      this.packAsk = undefined
      this.changed()
      return made[0]
    }
    this.packAsk = {
      id: pack.id,
      adding: false,
      failure: packAddFailure(problem),
    }
    this.changed()
    return undefined
  }

  /** ×, Escape or a click beside the sheet: it goes, unless Add is under way. */
  closePack(): void {
    if (!this.packAsk || this.packAsk.adding) return
    this.packAsk = undefined
    this.packAsks += 1
    this.changed()
  }

  // MARK: Step 5b's computer: its screen, the Computer tab and the full view
  // (StoreComputer.swift, CloudComputer.swift, ComputerPreview.swift,
  // ComputerView.swift). 5b's state and commands go below this line, and
  // nowhere else.

  /** Each agent's computer: its status, read and pushed, and who is looking (CloudComputer.swift's `ComputerBook`, Store.swift's `computer`). */
  readonly computer = new ComputerBook()
  /** Each agent's subagents, read once a view watches its computer (`getSubagents`), then kept by the host's pushes. */
  subagentsByAgent: Record<string, JSONValue[]> = {}
  /** The agent's pointer on its computer, the last place it moved or clicked (`computer-action`). */
  pointers: Record<string, AgentPointer> = {}
  /** When the computer was last read again for the window coming forward or the stream coming back, in ms (`lastComputerCatchUp`). */
  lastComputerCatchUp = -Infinity
  /** A status read or a start waits this long, in seconds (`ComputerScreen.deadline`; the tests make it short). */
  computerDeadline: number = computerScreen.deadline

  /**
   * The computer's disk (CloudComputer.swift's `diskPressure`): kept by 5b
   * from a status's `diskPressure` and the `box-disk-pressure` push, which
   * then calls `diskPressureChanged` (5c's, StoreRebuild.swift's); read by
   * 5c's low-disk banner. Nothing while it has room.
   */
  diskPressure?: JSONValue

  /**
   * 5b's state back to nothing (signed out): the book forgets everything
   * but who is watching (`ComputerBook.reset`), so a start answered after
   * the sign-out is dropped and the window's watch stays counted until it
   * lets go. (Store.swift makes a new book, which forgets the watchers too.)
   */
  private resetComputer(): void {
    this.computer.reset()
    this.subagentsByAgent = {}
    this.pointers = {}
    this.lastComputerCatchUp = -Infinity
    if (this.diskPressure !== undefined) {
      this.diskPressure = undefined
      this.diskPressureChanged()
    }
  }

  /**
   * After the book moved (Store.swift's `computer` didSet): the screens are
   * told when something they draw changed, and 5c when the disk did
   * (`diskPressureChanged`). `seen` is the book's version before.
   */
  private computerChanged(seen: number): void {
    const disk = this.computer.diskPressure
    if (JSON.stringify(disk) !== JSON.stringify(this.diskPressure)) {
      this.diskPressure = disk
      this.diskPressureChanged()
    }
    // The rebuild follows the selected computer's status (5c; Store.swift's `computer` didSet, StoreRebuild.swift's `rebuildInputs`).
    this.rebuildStatusChanged()
    if (this.computer.version !== seen) this.changed()
  }

  /** A `forever-box`, `box-disk-pressure`, `computer-action` or `subagents` push (StoreComputer.swift's `applyComputer`). */
  private applyComputer(
    event: Extract<
      BackendEvent,
      { kind: 'computer' | 'diskPressure' | 'computerAction' | 'subagents' }
    >,
  ): void {
    const seen = this.computer.version
    switch (event.kind) {
      case 'computer': {
        const status = boxStatusFrom(event.status)
        if (status) this.computer.ingest(status)
        break
      }
      case 'diskPressure':
        // The same level again (the computer says it often) changes nothing.
        this.computer.ingestDiskPressure(event.pressure)
        break
      case 'computerAction': {
        const agentId = text(field(event.action, 'agentId'))
        const pointer = agentPointerFrom(event.action)
        if (agentId == null || pointer == null) return
        this.pointers = { ...this.pointers, [agentId]: pointer }
        this.changed()
        return
      }
      case 'subagents':
        this.subagentsByAgent = {
          ...this.subagentsByAgent,
          [event.parentId]: event.subagents,
        }
        this.changed()
        return
    }
    this.computerChanged(seen)
  }

  /** The event stream back (`computerReconnected`, `noteReconnect`): what is watched read again, what was started here started again, the helpers again. */
  private computerReconnected(): void {
    this.lastComputerCatchUp = Date.now()
    const { read, ensure } = this.computer.reconnected()
    for (const id of read) {
      this.readComputer(id)
      void this.loadSubagents(id)
    }
    for (const id of ensure) this.ensureComputer(id)
  }

  /** A view shows this agent's computer (MainWindow.swift's `watch`, `watchComputer`): its status is read now when the stream is up, and kept fresh while it shows; its helpers read once. */
  watchComputer(agentId: string): void {
    this.computer.watch(agentId)
    if (this.isLive) this.readComputer(agentId)
    if (this.subagentsByAgent[agentId] === undefined)
      void this.loadSubagents(agentId)
  }

  unwatchComputer(agentId: string): void {
    this.computer.unwatch(agentId)
  }

  /** `getForeverBoxStatus`, given 15 s; a later answer is still taken if nothing newer came (`readComputer`). */
  readComputer(agentId: string): void {
    const backend = this.backend
    if (!backend) return
    const seen = this.computer.version
    const attempt = this.computer.beginRead(agentId)
    this.computerChanged(seen)
    if (attempt == null) return
    const call = backend.command('getForeverBoxStatus', { id: agentId })
    void (async () => {
      const outcome = await withDeadline(this.computerDeadline, call)
      if (this.backend !== backend) return
      const before = this.computer.version
      if (outcome.kind === 'answered') {
        this.computer.readAnswered(
          agentId,
          attempt,
          boxStatusFrom(outcome.value),
        )
        this.computerChanged(before)
        return
      }
      this.computer.readFailed(agentId, attempt)
      this.computerChanged(before)
      if (outcome.kind === 'failed') return
      try {
        const late = await call
        if (this.backend !== backend) return
        const now = this.computer.version
        this.computer.lateRead(agentId, attempt, boxStatusFrom(late))
        this.computerChanged(now)
      } catch {
        const now = this.computer.version
        this.computer.readFailed(agentId, attempt)
        this.computerChanged(now)
      }
    })()
  }

  /** `ensureForeverBox`: wakes or starts the computer and waits for its screen, given 15 s; the agent is "demanded" from now on (`ensureComputer`). */
  ensureComputer(agentId: string): void {
    const backend = this.backend
    if (!backend) return
    const seen = this.computer.version
    const generation = this.computer.beginEnsure(agentId)
    this.computerChanged(seen)
    if (generation == null) return
    const call = backend.command('ensureForeverBox', { id: agentId })
    void (async () => {
      const outcome = await withDeadline(this.computerDeadline, call)
      if (this.backend !== backend) return
      const before = this.computer.version
      if (outcome.kind === 'answered') {
        this.computer.ensureSettled(
          agentId,
          generation,
          boxStatusFrom(outcome.value),
          false,
        )
        this.computerChanged(before)
        return
      }
      this.computer.ensureSettled(agentId, generation, undefined, true)
      this.computerChanged(before)
      if (outcome.kind === 'failed') return
      try {
        const late = await call
        if (this.backend !== backend) return
        const now = this.computer.version
        this.computer.lateEnsure(agentId, generation, boxStatusFrom(late))
        this.computerChanged(now)
      } catch {
        // Failed after its deadline: already said.
      }
    })()
  }

  /** Retry under "Can't reach…": read again, and start again if it was started here (`retryComputer`). */
  retryComputer(agentId: string): void {
    this.readComputer(agentId)
    if (this.computer.demanded.has(agentId)) this.ensureComputer(agentId)
  }

  /** Opening the full view (`XOn` `_`): the computer is started (`openComputer`). */
  openComputer(agentId: string): void {
    this.ensureComputer(agentId)
  }

  /**
   * What a click on the computer focused (`typingFocus`,
   * host/box/typing-focus.ts): the field's kind, or `none` for nothing to
   * type into; none when the computer did not say (an engine without the
   * question, no answer). The iPhone's: the Mac's view doesn't ask.
   */
  async typingFocus(agentId: string): Promise<TypingField | undefined> {
    const backend = this.backend
    if (!backend) return undefined
    try {
      const answer = await backend.command('typingFocus', { id: agentId })
      const focus = str(field(answer, 'focus'))
      return focus == null ? undefined : typingFieldFrom(focus)
    } catch {
      return undefined
    }
  }

  /** The person takes control: the computer's Chrome made ready to see their clicks (`typingFocus` with `prepare`); an engine without it does no harm. */
  async prepareTypingFocus(agentId: string): Promise<void> {
    await quietly(
      this.backend?.command('typingFocus', { id: agentId, prepare: true }) ??
        Promise.resolve(),
    )
  }

  /** Take control (`takeComputerControl`): a working agent is stopped and the computer is the person's until handed back; true when that started a hand-off. */
  async takeComputerControl(agentId: string): Promise<boolean> {
    const backend = this.backend
    if (!backend) return false
    try {
      const answer = await backend.command('takeComputerControl', {
        id: agentId,
      })
      return bool(field(answer, 'handoff')) ?? false
    } catch {
      return false
    }
  }

  /** Stop task (`stopAgentTask`): the agent's run and its helpers stop; an open hand-off ends without waking it. */
  async stopAgentTask(agentId: string): Promise<boolean> {
    const backend = this.backend
    if (!backend) return false
    try {
      const answer = await backend.command('stopAgentTask', { id: agentId })
      return bool(field(answer, 'stopped')) ?? false
    } catch {
      return false
    }
  }

  /** The address of a screen the host gave (its loopback page), through Simeon Labs' proxy (`screenSocket`, `GatewayConnection.screenSocket`); none away from a live computer. */
  async screenSocket(vncUrl: string): Promise<string | undefined> {
    const backend = this.backend
    if (!(backend instanceof LiveBackend)) return undefined
    try {
      const connection = await backend.gateway.currentConnection()
      if (this.backend !== backend) return undefined
      return connection.screenSocket(vncUrl)
    } catch {
      return undefined
    }
  }

  /** The agent's subagents (`getSubagents`), read once a view watches its computer, then kept by the host's pushes. */
  async loadSubagents(agentId: string): Promise<void> {
    const backend = this.backend
    if (!backend) return
    let answer: JSONValue
    try {
      answer = await backend.command('getSubagents', { id: agentId })
    } catch {
      return
    }
    if (this.backend !== backend) return
    this.subagentsByAgent = {
      ...this.subagentsByAgent,
      [agentId]: arr(answer) ?? arr(field(answer, 'subagents')) ?? [],
    }
    this.changed()
  }

  /**
   * The helpers' screens on this agent's computer, in the host's order
   * (`MTn`): only while the agent's own computer has a screen, since each
   * helper is drawn with that screen (`CTn` gives them the agent's `N2e`).
   */
  computerHelpers(agentId: string): ComputerHelper[] {
    if (screenURL(this.computer.status(agentId)) == null) return []
    return helperScreens(this.subagentsByAgent[agentId] ?? [])
  }

  /** The most recent status of any agent's computer (`getMostRecentStatus`): the first run's "Waking your computer…". */
  get latestComputerStatus(): BoxStatus | undefined {
    return this.computer.mostRecent
  }

  /**
   * The window came forward (`windowCameForward`). A computer started here
   * is started again at once (`NTn`'s focus listener); at most once a
   * minute, and not while the computer is being rebuilt (`rebuildingNow`,
   * 5c), everything watched is read again with the agents, the open chat,
   * the pins and the sections (`noteWindowFocus`).
   */
  windowCameForward(): void {
    if (!this.isLive) return
    for (const id of this.computer.watched)
      if (this.computer.demanded.has(id)) this.ensureComputer(id)
    if (
      this.rebuildingNow() ||
      Date.now() - this.lastComputerCatchUp < computerScreen.focusCatchUp * 1000
    )
      return
    this.lastComputerCatchUp = Date.now()
    const { read, ensure } = this.computer.focused()
    for (const id of read) this.readComputer(id)
    for (const id of ensure) this.ensureComputer(id)
    void (async () => {
      await this.reloadRoster()
      if (this.openChat) await this.refresh(this.openChat)
      await this.loadSidebar()
    })()
  }

  // MARK: Step 5c's computer states: its rebuild, recovery and move, the
  // dialogs and pills, low disk (ComputerRebuild.swift, RebuildDriver.swift,
  // StoreRebuild.swift, MigrationWatch.swift, ComputerStates.swift). 5c's
  // state and commands go below this line, and nowhere else.
  //
  // The rebuild follows the store as the Mac's `didSet`s tell it: each
  // change the store announces is looked at here (`followRebuild`), and the
  // driver hears the selected agent, the roster's work, the stream and the
  // selected computer's status when they moved. The server's record of the
  // computer being replaced is followed while a sign-in lasts
  // (`MigrationRelay`), its steps coming in as `migration` events.

  /**
   * Simeon's computer being rebuilt, or the stream away (RebuildDriver.swift).
   * Every change the store announces is looked at by the rebuild from the
   * start (the Mac's `didSet`s on the roster, the chat, the stream and the
   * computer).
   */
  readonly rebuild: RebuildDriver = (() => {
    const driver = new RebuildDriver()
    driver.onChange = () => this.changed()
    driver.onHardLockChanged = (held) => this.hardLockChanged(held)
    this.subscribe(() => this.followRebuild())
    return driver
  })()
  /** The window shows the computer's rebuild (`followsRebuild`, the Mac's and the iPhone's): sending waits through it, the list holds still. */
  followsRebuild = true
  /**
   * The disk running low sets Disk Saver to work by itself (`$8n`,
   * `startsDiskSaver`). Not from a browser's tab, as the iPhone: the Mac
   * app open beside it starts it, and two apps each making one would give
   * the person two Disk Savers. The Windows app sets it, as the Mac.
   */
  startsDiskSaver = false
  /** The agent the window has selected (`windowSelection`), told by the window, so a chat closing just before the next opens does not read as nothing selected. */
  windowSelection?: string
  /** How the rebuild reaches Simeon Labs' server for a computer: through its sign-in; the tests give their own. */
  rebuildServerFor: (backend: AgentBackend) => RebuildServer | undefined =
    rebuildServerOf
  /** Roster pushes skipped while the computer was rebuilt: the list is read again after. */
  private rosterHeld = false
  /** A Disk Saver being made, so a second click waits for it. */
  private diskSaverCreation?: Promise<string | undefined>
  /** Disk Saver was set to work for this time the disk ran low. */
  private diskAuditDone = false
  /** The computer the rebuild follows, its relay, and what the driver was last told. */
  private rebuildBackend?: AgentBackend
  private migrations?: MigrationRelay
  private stopMigrations?: () => void
  private rebuildSeen: RebuildInputs = noRebuildInputs
  private rebuildLive = false

  /** 5c's state back to nothing (signed out). */
  private resetRebuild(): void {
    this.rebuildBackend = undefined
    this.rebuildSeen = noRebuildInputs
    this.rebuildLive = false
    this.stopMigrations?.()
    this.stopMigrations = undefined
    this.migrations?.stop()
    this.migrations = undefined
    this.rosterHeld = false
    this.diskSaverCreation = undefined
    this.diskAuditDone = false
    this.windowSelection = undefined
    this.rebuild.reset()
  }

  /** An event no other section takes: a step of the server's replacement of the computer (`.migration`). */
  private applyRebuild(event: BackendEvent): void {
    if (event.kind === 'migration') this.rebuild.migrationEvent(event.event)
  }

  /** A rebuild under way: the window's catch-up waits (`windowCameForward(rebuilding:)`). */
  rebuildingNow(): boolean {
    return this.rebuild.isHardLocked
  }

  /** The agent the window shows now, told by the window (`windowSelection`). */
  setWindowSelection(agentId: string | undefined): void {
    if (this.windowSelection === agentId) return
    this.windowSelection = agentId
    this.changed()
  }

  /**
   * Whether a newer computer is out for this agent's, as its status says
   * (`computer.status(id)?.raw["imageUpdateAvailable"]`, 5b's book);
   * unknown while it has none.
   */
  private imageUpdateAvailable(
    agentId: string | undefined,
  ): boolean | undefined {
    return bool(
      field(this.computer.status(agentId)?.raw, 'imageUpdateAvailable'),
    )
  }

  /**
   * The selected computer's status moved (Store.swift's `computer` didSet:
   * `rebuild.statusChanged(rebuildInputs)`), told by 5b's `computerChanged`.
   */
  private rebuildStatusChanged(): void {
    const inputs = this.rebuildInputs()
    const seen = this.rebuildSeen
    if (
      inputs.phase === seen.phase &&
      inputs.imageUpdateAvailable === seen.imageUpdateAvailable
    )
      return
    this.rebuildSeen = {
      ...seen,
      phase: inputs.phase,
      imageUpdateAvailable: inputs.imageUpdateAvailable,
    }
    this.rebuild.statusChanged(inputs)
  }

  /** The agent the window has selected, else the chat on screen (`computerSelection`). */
  private get computerSelection(): string | undefined {
    return this.windowSelection ?? this.openChat
  }

  /** What the driver is told (`rebuildInputs`): the selected agent when it is one and not a group, its computer, the agents at work, the stream. */
  private rebuildInputs(): RebuildInputs {
    const selection = this.computerSelection
    const agent = selection !== undefined ? this.agent(selection) : undefined
    const box = agent?.isGroup ? undefined : selection
    return {
      boxId: box,
      isCurrentGroup: agent?.isGroup ?? false,
      phase: this.computer.phase(box),
      imageUpdateAvailable: this.imageUpdateAvailable(box),
      anyRunning: this.agents.some((one) => one.isRunning),
      // A computer asleep on purpose is not one the stream lost (`isAsleep`).
      transportConnected: this.isLive || this.isAsleep,
    }
  }

  /** The store changed: the driver hears what moved, as the Mac's `didSet`s tell it. */
  private followRebuild(): void {
    const backend = this.backend
    if (backend !== this.rebuildBackend) {
      this.rebuildBackend = backend
      if (backend) {
        this.connectRebuild(backend)
        return
      }
    }
    const inputs = this.rebuildInputs()
    const seen = this.rebuildSeen
    this.rebuildSeen = inputs
    // Back after a drop (`recovered`): the server's last step read back.
    const recovered = this.isLive && !this.rebuildLive
    this.rebuildLive = this.isLive
    if (inputs.transportConnected !== seen.transportConnected)
      this.rebuild.transportChanged(inputs)
    if (
      inputs.boxId !== seen.boxId ||
      inputs.isCurrentGroup !== seen.isCurrentGroup ||
      inputs.anyRunning !== seen.anyRunning
    )
      this.rebuild.selectionChanged(inputs)
    else if (
      inputs.phase !== seen.phase ||
      inputs.imageUpdateAvailable !== seen.imageUpdateAvailable
    )
      this.rebuild.statusChanged(inputs)
    if (recovered && backend) {
      this.rebuild.migrationReadBack(this.migrations?.status)
      // A computer rebuilt meanwhile starts with no language: told again (Store.swift's `recovered`).
      void this.tellLanguage(backend)
      // And the zone this browser is in, as the Mac on every connect (step 6e).
      void this.tellTimeZone(backend)
    }
  }

  /**
   * The app's language to the computer and the account (StoreSettings.swift's
   * `tellLanguage`): the agents write in it. Told each time the stream comes
   * (back), as the core tells it, without waking a computer that rests.
   */
  private async tellLanguage(backend: AgentBackend): Promise<void> {
    const language = currentLanguage()
    try {
      await backend.command(
        'setHostSettings',
        { userLanguage: language },
        { wakes: false },
      )
    } catch {
      // Told the next time the stream comes back.
    }
    if (backend !== this.backend) return
    try {
      await backend.server('user/profile', 'POST', { language })
    } catch {
      // The header carries it meanwhile (`Accept-Language`).
    }
  }

  /** The window starts with an account (`connectRebuild`): the driver gets its calls, the server's record is followed and its last step read back. */
  private connectRebuild(backend: AgentBackend): void {
    const server = this.rebuildServerFor(backend)
    const relay = server
      ? new MigrationRelay((from, signal) =>
          server.watchMigration(from, signal),
        )
      : undefined
    this.migrations = relay
    if (relay) {
      this.stopMigrations = relay.listen((event) => {
        if (this.backend === backend) this.apply({ kind: 'migration', event })
      })
      relay.start()
    }
    // A recreate that started: its steps are watched for, and the computer is asked for again (the new one has new tokens).
    const accepted = (answer: RecreateAnswer): RecreateAnswer => {
      if (answer.kind === 'rejected') return answer
      relay?.recreateAccepted(
        answer.kind === 'started' ? answer.operationId : undefined,
      )
      backend.invalidate?.()
      return answer
    }
    const notSignedIn = () =>
      new SimeonAPIError(t('Sign in to Simeon first.'), 401)
    const inputs = this.rebuildInputs()
    this.rebuildSeen = inputs
    this.rebuildLive = this.isLive
    this.rebuild.connect(
      {
        update: async (_agentId, force) => {
          if (!server) throw notSignedIn()
          return accepted(await server.updateComputer(force))
        },
        reset: async () => {
          if (!server) throw notSignedIn()
          return accepted(await server.resetComputer())
        },
      },
      inputs,
    )
    this.rebuild.migrationReadBack(relay?.status)
  }

  /** A rebuild began or ended: once it ends, a list held still meanwhile is read again, as after a reconnect (`GOn`). */
  private hardLockChanged(held: boolean): void {
    if (held || !this.rosterHeld) return
    this.rosterHeld = false
    this.computerReconnected()
    void (async () => {
      await this.reloadRoster()
      if (this.openChat) await this.refresh(this.openChat)
      await this.loadSidebar()
    })()
  }

  /**
   * Whether a roster push is held while the computer is rebuilt (`roster.setFrozen`):
   * the store's `agents` and `agentUpserted` take nothing while this says
   * so, and the list is read again once the rebuild ends.
   */
  holdsRoster(): boolean {
    if (!this.followsRebuild || !this.rebuild.isHardLocked) return false
    this.rosterHeld = true
    return true
  }

  /** The agents at work now, by name (the busy confirmation's list). */
  get workingAgentNames(): string[] {
    return this.agents.filter((one) => one.isRunning).map((one) => one.name)
  }

  /**
   * "Update Simeon's Computer" in ⌘K, "/" and the sidebar (`UOn`): ready,
   * or with agents at work; undefined when it is not offered (no agent
   * open, the computer known to be up to date, an update queued, a rebuild
   * asked for or under way, or refused for the session). An unknown answer
   * offers it, as the window does.
   */
  get computerUpdateOffer(): UpdateAvailability | undefined {
    const selection = this.computerSelection
    const selected = selection !== undefined ? this.agent(selection) : undefined
    const baseline = selected !== undefined && !selected.isGroup
    const availability = updateAvailability({
      canUpdateBaseline: baseline,
      canUpdateBox: baseline && this.workingAgentNames.length === 0,
      isBoxUpToDate: this.imageUpdateAvailable(selection) === false,
      isUpdateQueued: this.rebuild.isUpdateQueued,
    })
    if (
      this.rebuild.pendingKind !== undefined ||
      this.rebuild.lock.isLocked ||
      this.rebuild.isBlocked ||
      !(availability === 'ready' || availability === 'busy-override')
    )
      return undefined
    return availability
  }

  /** A newer computer is out for the open agent (`imageUpdateAvailable`): the sidebar's Update. */
  get computerUpdateAvailable(): boolean {
    return this.imageUpdateAvailable(this.computerSelection) === true
  }

  /** The steps of the rebuild under way, for its dialog and its pill (`J1t`). */
  rebuildSteps(kind: RebuildKind): RebuildSteps {
    const lock = this.rebuild.lock
    const box = this.rebuild.inputs.boxId
    return projectSteps(
      kind,
      lock.stage,
      this.rebuild.migration.phaseFor(lock.operationId),
      this.rebuild.migration.phasesFor(lock.operationId),
      this.computer.status(box)?.pullPercent,
    )
  }

  /** A failure the window keeps (`store.problem = …`): the access notice's page that could not be opened, as the Mac's. */
  keepProblem(words: string | undefined): void {
    if (this.problem === words) return
    this.problem = words
    this.changed()
  }

  /** Sending waits while the computer is rebuilt (`isSendingPaused`), where the rebuild is shown, and while this account has no Simeon (`gft`). */
  get isSendingPaused(): boolean {
    return (
      (this.followsRebuild && this.rebuild.isHardLocked) ||
      pausesSending(this.access)
    )
  }

  // The disk

  /** The disk's state: "soft", "hard", or undefined when it has room (`diskPressureSnapshots`, from 5b's `diskPressure`). */
  get diskLevel(): string | undefined {
    return str(field(this.diskPressure, 'level'))
  }

  /** The Disk Saver agent, when there is one (`purpose: "disk-saver"`). */
  get diskSaver(): Agent | undefined {
    return this.agents.find((one) => one.purpose === 'disk-saver')
  }

  /**
   * "Go to Disk Saver" (`D1t.launch`): its chat if it exists, else a new
   * one made and introduced; the id to open, or undefined (the list not
   * read yet, or the computer refused).
   */
  async launchDiskSaver(): Promise<string | undefined> {
    const existing = this.diskSaver
    if (existing) return existing.id
    if (this.diskSaverCreation) return this.diskSaverCreation
    if (this.agents.length === 0 && !this.backend) return undefined
    const making = this.createDiskSaver()
    this.diskSaverCreation = making
    try {
      return await making
    } finally {
      if (this.diskSaverCreation === making) this.diskSaverCreation = undefined
    }
  }

  private async createDiskSaver(): Promise<string | undefined> {
    const backend = this.backend
    if (!backend) return undefined
    let answer: JSONValue
    try {
      answer = await backend.command('createAgent', {
        name: RebuildWords.diskSaverName,
        description: RebuildWords.diskSaverDescription,
        purpose: 'disk-saver',
        origin: 'user',
        isKickstartRequested: true,
        clientNonce: newMessageId(),
      })
    } catch {
      // Only reported in the window, never shown.
      return undefined
    }
    await this.reloadRoster()
    return (
      text(field(field(answer, 'agent'), 'id')) ?? text(field(answer, 'id'))
    )
  }

  /**
   * The disk's state changed (StoreRebuild.swift's `diskPressureChanged`,
   * `$8n`): called by 5b when `diskPressure` does. Once per time the disk
   * runs low, where this app starts Disk Saver: an existing one not at work
   * is asked to audit (`requestDiskSaverAudit`); with none, one is made,
   * not opened.
   */
  private diskPressureChanged(): void {
    if (this.diskLevel === undefined) {
      this.diskAuditDone = false
      return
    }
    const backend = this.backend
    if (
      !this.followsRebuild ||
      !this.startsDiskSaver ||
      this.diskAuditDone ||
      this.agents.length === 0 ||
      !backend
    )
      return
    this.diskAuditDone = true
    const saver = this.diskSaver
    if (saver) {
      if (saver.isRunning) return
      void backend
        .command('requestDiskSaverAudit', { id: saver.id })
        .catch(() => {})
    } else {
      void this.launchDiskSaver()
    }
  }

  // MARK: Step 5d's calls: a call with an agent, its banner and its lines
  // (Call.swift, CallTones.swift, VoiceCall.swift, CallBannerWindow.swift,
  // CallChat.swift), and two agents' exchange over the chat
  // (Exchange.swift). 5d's state and commands go below this line, and
  // nowhere else.

  /**
   * The call shown (Store.swift's `call`), its waveform's bars kept apart
   * (`callLevels`): they change every 90 ms, and only the waveform reads
   * them, so they change nothing the screens redraw for. The call keeps
   * only whether there are bars.
   */
  call?: CallState
  callLevels: number[] = []
  /** The voice for the next call (ElevenLabs' kit; a stand-in in the tests). */
  callVoice: () => VoiceTransport = callTransport
  /** The ring and the hang-up (the browser's audio; none in the tests unless given). */
  callTones: () => CallTonePlaying | undefined = () =>
    typeof AudioContext === 'undefined' ? undefined : new WebCallTones()
  /** One line per step of a call (the Mac's `voice-call.log`, echoed to the console as the Mac echoes it to stderr). */
  callLog: (line: string) => void = (line) =>
    console.info(`[simeon] voice-call ${line}`)
  /** The call's engine, for the computer it was made for (the Mac's `backend.call`, made at sign-in), with its tones. */
  private callEngine?: {
    engine: CallEngine
    backend: AgentBackend
    tones?: CallTonePlaying
  }

  /** Calls are on, and there is a computer to call through (`canCall`). */
  get canCall(): boolean {
    return this.backend != null && voiceCallsEnabled()
  }

  /**
   * The engine for this sign-in (MacSession.swift's `LiveCall`): the voice,
   * the person's name for the prompt, the agent's voice from its picker
   * (`ensureVoice`), the ring, a failed call kept until dismissed (the
   * banner's 20 s or Close), the log. Only while this is the computer in
   * use: a call heard after a sign-out never comes back on screen.
   */
  private callEngineNow(): CallEngine | undefined {
    const backend = this.backend
    if (!backend || !voiceCallsEnabled()) return undefined
    if (this.callEngine?.backend === backend) return this.callEngine.engine
    const tones = this.callTones()
    const engine = new LiveCall({
      backend,
      transport: this.callVoice(),
      personName: () => this.account?.name,
      voiceFor: (agentId) => this.ensureVoice(agentId),
      tones,
      failedStays: null,
      log: (line) => this.callLog(line),
      language: currentLanguage,
    })
    this.callEngine = { engine, backend, tones }
    engine.observe((state) => {
      if (this.callEngine?.engine === engine) this.takeCall(state)
    })
    return engine
  }

  /** The call's change: the screens redraw only when more than its bars changed (Store.swift's `take`). */
  private takeCall(state: CallState | undefined): void {
    if (!state) {
      this.callLevels = []
      if (this.call) {
        this.call = undefined
        this.changed()
      }
      return
    }
    this.callLevels = state.levels
    const kept: CallState = {
      ...state,
      levels: state.levels.length === 0 ? [] : [1],
    }
    if (JSON.stringify(kept) === JSON.stringify(this.call)) return
    this.call = kept
    this.changed()
  }

  /** The agent's own colour on the call: the one the app draws it in, not blue (the founder, 9 October 2026: the call showed another avatar). */
  startCall(agent: Agent): void {
    this.callEngineNow()?.start(agent.id, agent.name, agent.colour ?? '')
  }

  mute(muted: boolean): void {
    this.callEngine?.engine.mute(muted)
  }

  hangUp(): void {
    this.callEngine?.engine.hangUp()
  }

  /** A finished or failed call put away (the banner's Close). */
  dismissCall(): void {
    this.callEngine?.engine.dismiss()
  }

  /** 5d's state back to nothing (signed out): a call on ends (its voice let go, its record sent), and nothing of it comes back on screen. */
  private resetCalls(): void {
    const made = this.callEngine
    this.callEngine = undefined
    made?.engine.hangUp()
    // The tones' audio let go, once the hang-up has played: one for each sign-in at most.
    made?.tones?.close?.()
    this.call = undefined
    this.callLevels = []
  }

  // MARK: Step 6b's connecting: the consent, an app's sign-in, Add Another
  // Account, the chat card's Connect (mac/Simeon/MacConnector.swift; the
  // core's Store.swift `beginConnect`, `undoConnect`, `ConnectConsent.swift`,
  // `Connecting.swift`, `AppAccounts.swift`). The screens' side is
  // src/window/connector.ts and ConnectConsent.tsx.

  /**
   * Connect (`beginConnect`, `Connecting`): the app installed from the
   * catalogue when it is not on the computer yet, then its sign-in started;
   * the sign-in's page, and whether this connect added the app. An app this
   * connect added whose sign-in then doesn't open is taken back at once, so
   * nothing stays half added; `problem` says why.
   */
  async beginConnect(name: string): Promise<ConnectStart | undefined> {
    const backend = this.backend
    if (!backend) return undefined
    // The box's app events keep the list current, so it is read here only when it never was (an empty list counts as never read: the web keeps no time of the last read).
    if (this.catalog.length === 0 || this.apps.length === 0)
      await this.loadAppCards()
    if (this.backend !== backend) return undefined
    const key = name.toLowerCase()
    const plugin = this.catalogApp(name)
    let server = this.apps.find(
      (app) =>
        app.name.toLowerCase() === key ||
        (app.pluginId != null && app.pluginId === plugin?.id),
    )
    let added: string | undefined
    if (!server && plugin) {
      try {
        // The install and the maker's server id at once (the second only names the server the first makes).
        const [installed, vendor] = await Promise.all([
          backend.command('desktopMcp', {
            action: 'installEntry',
            args: [{ entryId: plugin.id }],
          }),
          backend
            .command('desktopMcp', {
              action: 'vendorServerIdForPlugin',
              args: [plugin.id],
            })
            .catch(() => undefined),
        ])
        if (this.backend !== backend) return undefined
        added = plugin.id
        this.apps = (arr(field(installed, 'servers')) ?? [])
          .map(connectedApp)
          .filter((app): app is ConnectedApp => app != null)
        this.changed()
        const vendorId = text(vendor)
        server = vendorId
          ? makeApp({
              serverId: vendorId,
              name: plugin.title,
              pluginId: plugin.id,
              accountKey: 'default',
              status: 'needs-auth',
              toolCount: 0,
            })
          : this.apps.find((app) => app.pluginId === plugin.id)
      } catch (error) {
        this.connectProblem(t`Couldn't add ${name}: ${this.connectWhy(error)}`)
        return undefined
      }
    }
    if (!server) {
      this.connectProblem(t`${name} isn't in Simeon's apps yet.`)
      return undefined
    }
    if (server.status === 'connected') return undefined
    try {
      const started = await backend.command('desktopMcp', {
        action: 'authenticateServer',
        args: [server.serverId, server.accountKey, 'connector_card'],
      })
      if (this.backend !== backend) return undefined
      const url = await this.signInStarted(started, name)
      if (url) return { url, addedPlugin: added }
      // Signed in already: kept, whatever the list says yet.
      if (alreadySignedIn(started)) return undefined
    } catch (error) {
      if (this.backend !== backend) return undefined
      this.connectProblem(
        didntConnect(name, plainError(this.connectWhy(error))),
      )
    }
    // No sign-in to open: the app this connect added goes again, unless it turned out signed in already.
    if (added) await this.takeBack(added, name, backend)
    return undefined
  }

  /**
   * A connect whose sign-in was cancelled (`undoConnect`, `Connecting.undoes`):
   * the app it added is uninstalled again (`uninstallPlugin`, as Uninstall
   * on its page does), so it isn't left added and not signed in. One the
   * computer says is connected after all is kept.
   */
  async undoConnect(start: ConnectStart, name: string): Promise<void> {
    const backend = this.backend
    if (start.addedPlugin == null || !backend) return
    await this.takeBack(start.addedPlugin, name, backend)
  }

  /** Sign in to one account of an app (`signInURL`, `authenticateServer`): its page, or none with the reason in `problem`. */
  async signInURL(app: ConnectedApp): Promise<string | undefined> {
    const backend = this.backend
    if (!backend) return undefined
    try {
      const started = await backend.command('desktopMcp', {
        action: 'authenticateServer',
        args: [app.serverId, app.accountKey, 'connector_card'],
      })
      return await this.signInStarted(started, app.name)
    } catch (error) {
      this.connectProblem(
        t`Couldn't sign in to ${app.name}: ${this.connectWhy(error)}`,
      )
      return undefined
    }
  }

  /** The app a connect added, uninstalled again unless the computer now says it is connected (`takeBack`): only on the computer it was added to (`backend`), never another account's. */
  private async takeBack(
    plugin: string,
    name: string,
    backend: AgentBackend,
  ): Promise<void> {
    if (this.backend !== backend) return
    await this.readApps(true)
    if (this.backend !== backend || this.isConnected(name)) return
    try {
      await backend.command('desktopMcp', {
        action: 'uninstallPlugin',
        args: [plugin],
      })
    } catch {
      // Left as it is: its page offers Uninstall.
    }
    if (this.backend === backend) await this.readApps(true)
  }

  /** The sign-in's page; or, when the computer has none to offer, why (it was signed in already, or the app can't sign in here), said rather than dropped (`signInStarted`). */
  private async signInStarted(
    started: JSONValue,
    name: string,
  ): Promise<string | undefined> {
    const url = authorizationURL(started)
    if (url) return url
    if (alreadySignedIn(started)) {
      await this.readApps(true)
      return undefined
    }
    this.connectProblem(didntConnect(name, text(field(started, 'message'))))
    return undefined
  }

  /** A failure's own words (`localizedDescription`). */
  private connectWhy(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
  }

  private connectProblem(words: string): void {
    this.problem = words
    this.changed()
  }

  /** 6b's state back to nothing (signed out): it keeps none; the connector's sign-in ends with the window. */
  private resetConnecting(): void {}

  // MARK: Step 6c's Connectors: the catalogue's entries, the computer's
  // servers and plugins, their tools and skills, the list
  // (mac/Simeon/PluginsModel.swift, PluginsWindow.swift; the core's
  // Plugins.swift, PluginsOverlay.swift, PluginCalls.swift). The screens'
  // side is src/window/Connectors.tsx.

  // The computer's side of mac/Simeon/PluginsModel.swift lives here, kept
  // until sign-out (`forget`); the window's side (the view, the order of
  // each action, its notice, the consent and the sign-in through the
  // window's connector) is src/window/pluginsModel.ts. The catalogue's
  // entries are 3c's `catalogEntries`, from the same `getCatalog` answer.

  /** Each account of each of the computer's servers, as Connectors last read them (`servers`, `listServers`). */
  pluginServers: PluginServer[] = []
  /** The plugins the computer has on (`plugins`, `listEffectivePlugins`). */
  effectivePlugins: EffectivePlugin[] = []
  /** Each server's tools as last read (`tools`, `listServerTools`), by the server's id. */
  pluginTools: ReadonlyMap<string, readonly PluginTool[]> = new Map()
  /** Why a tool's switch didn't change, said under its server's tools (`toolFailures`), by the server's id. */
  pluginToolFailures: ReadonlyMap<string, string> = new Map()
  /** The open agent's skills (`skills`, `getAgentWorkflows`). */
  agentSkills: AgentSkill[] = []
  /** The plugins the GitHub banner names (`authBlocked`, `getPluginSyncStatus`). */
  pluginAuthBlocked: string[] = []
  /** Sign-ins waiting on their page, by key (`flows`, `signInKey`): kept across openings, as the Mac's window keeps them. */
  signInFlows: ReadonlyMap<string, SignInFlow> = new Map()
  /** The catalogue's logos read so far (`logos`, `resolvePluginLogo`): data URLs, by address. The catalogue's, not the account's: kept for the next account, as the Mac keeps them. */
  pluginLogos: ReadonlyMap<string, string> = new Map()
  private pluginLogoReads = new Set<string>()
  private signInTimers = new Map<string, ReturnType<typeof setTimeout>>()
  /** The agent the window shows, whose skills Connectors lists (the model's `setAgent`): an answer for another agent is not kept. */
  private skillsAgent?: string

  /** 6c's state back to nothing (signed out; `PluginsModel.forget`). */
  private resetConnectors(): void {
    this.pluginServers = []
    this.effectivePlugins = []
    this.pluginTools = new Map()
    this.pluginToolFailures = new Map()
    this.agentSkills = []
    this.pluginAuthBlocked = []
    this.signInFlows = new Map()
    for (const timer of this.signInTimers.values()) clearTimeout(timer)
    this.signInTimers.clear()
    this.skillsAgent = undefined
  }

  /** Someone is signed in: Connectors' calls can go (the Mac's `try? calls()`). */
  get pluginCallsReady(): boolean {
    return this.backend != null
  }

  /** Connectors' calls to the computer (SimeonCore's `PluginCalls`); signed out, the core's words. */
  private pluginCalls(): PluginCalls {
    const backend = this.backend
    if (!backend) throw new GatewayError(t('Sign in to Simeon first.'), true)
    return new PluginCalls(backend)
  }

  // Reading

  /** The servers read again (`refreshServers`): as Connectors opens, every 15 s while it is open, as the window comes forward, after a change. No answer: they stay. */
  async readPluginServers(): Promise<void> {
    const backend = this.backend
    if (!backend) return
    let next: PluginServer[] | undefined
    try {
      next = await new PluginCalls(backend).servers()
    } catch {
      return
    }
    if (this.backend === backend) this.applyPluginServers(next)
  }

  /** The servers an answer held (none: they stay as they were); only a change redraws. A sign-in whose account now says connected is over (`apply(servers:)`). */
  private applyPluginServers(next: PluginServer[] | undefined): void {
    if (!next) return
    let moved = false
    if (JSON.stringify(next) !== JSON.stringify(this.pluginServers)) {
      this.pluginServers = next
      moved = true
    }
    const over = [...this.signInFlows.keys()].filter((key) =>
      this.pluginServers.some(
        (server) =>
          signInKey(server.serverIdentifier) === key &&
          server.status === 'connected',
      ),
    )
    if (over.length > 0) {
      const flows = new Map(this.signInFlows)
      for (const key of over) {
        flows.delete(key)
        clearTimeout(this.signInTimers.get(key))
        this.signInTimers.delete(key)
      }
      this.signInFlows = flows
      moved = true
    }
    if (moved) this.changed()
  }

  /** The plugins the computer has on, read again (`refreshPlugins`). */
  async readEffectivePlugins(): Promise<void> {
    const backend = this.backend
    if (!backend) return
    let list: EffectivePlugin[]
    try {
      list = await new PluginCalls(backend).effectivePlugins()
    } catch {
      return
    }
    if (this.backend !== backend) return
    if (JSON.stringify(list) === JSON.stringify(this.effectivePlugins)) return
    this.effectivePlugins = list
    this.changed()
  }

  /** The open agent's skills (`loadSkills`); with no agent open, none. */
  async readAgentSkills(agentId: string | undefined): Promise<void> {
    if (agentId == null) {
      if (this.skillsAgent != null || this.agentSkills.length === 0) return
      this.agentSkills = []
      this.changed()
      return
    }
    const backend = this.backend
    if (!backend) return
    let list: AgentSkill[]
    try {
      list = await new PluginCalls(backend).skills(agentId)
    } catch {
      return
    }
    if (this.backend !== backend) return
    this.setAgentSkills(agentId, list)
  }

  /**
   * The agent the window shows (Connectors' `setAgent`): only its skills are
   * kept, however the answers cross (an opening's read for no agent yet, an
   * Add's skills step for the agent open when it began).
   */
  showSkillsOf(agentId: string | undefined): void {
    this.skillsAgent = agentId
  }

  private setAgentSkills(agentId: string, list: AgentSkill[]): void {
    if (agentId !== this.skillsAgent) return
    if (JSON.stringify(list) === JSON.stringify(this.agentSkills)) return
    this.agentSkills = list
    this.changed()
  }

  /** A server's tools (`loadTools`); no answer, they stay. */
  async readPluginTools(serverId: string): Promise<void> {
    const backend = this.backend
    if (!backend) return
    let list: PluginTool[]
    try {
      list = await new PluginCalls(backend).tools(serverId)
    } catch {
      return
    }
    if (this.backend !== backend) return
    this.pluginTools = new Map(this.pluginTools).set(serverId, list)
    this.changed()
  }

  /** The GitHub banner's plugins (`readSyncStatus`, `getPluginSyncStatus`). */
  async readPluginSyncStatus(): Promise<void> {
    const backend = this.backend
    if (!backend) return
    let names: string[]
    try {
      names = await new PluginCalls(backend).authBlocked()
    } catch {
      return
    }
    if (this.backend !== backend) return
    if (JSON.stringify(names) === JSON.stringify(this.pluginAuthBlocked)) return
    this.pluginAuthBlocked = names
    this.changed()
  }

  /** The one sync each opening of Connectors starts (`syncPluginSkills`), the banner read again after it; a failure is let go. */
  async syncPluginSkillsQuietly(): Promise<void> {
    const backend = this.backend
    if (!backend) return
    try {
      await new PluginCalls(backend).syncSkills()
    } catch {
      // Let go: the banner says what can't be fetched.
    }
    await this.readPluginSyncStatus()
  }

  /**
   * A catalogue entry's logo (`loadLogo`, `resolvePluginLogo`): the
   * computer answers with a data URL (SVG or PNG); read once per address,
   * and only a picture is kept (any image kind the computer read: an `<img>` runs no script).
   */
  async readPluginLogo(address: string): Promise<void> {
    if (this.pluginLogos.has(address) || this.pluginLogoReads.has(address))
      return
    const backend = this.backend
    if (!backend) return
    this.pluginLogoReads.add(address)
    let source: string | undefined
    try {
      source = await new PluginCalls(backend).logo(address)
    } catch {
      return
    }
    if (source == null || !/^data:image\/[a-z0-9.+-]+[;,]/i.test(source)) return
    this.pluginLogos = new Map(this.pluginLogos).set(address, source)
    this.changed()
  }

  // Add, setup, remove (each refusal thrown, for the window to say)

  /** Add (`install`, `installEntry`): the servers as the computer answers them, and its plugins read again. */
  async installPlugin(
    entryId: string,
    values: Readonly<Record<string, string>>,
    team: boolean,
  ): Promise<void> {
    const calls = this.pluginCalls()
    this.applyPluginServers(await calls.install(entryId, values, team))
    await this.readEffectivePlugins()
  }

  /** The server a plugin from the app's own maker makes (`vendorServerIdForPlugin`), whose sign-in opens after Add; none for the rest. */
  async pluginVendorServer(entryId: string): Promise<string | undefined> {
    const backend = this.backend
    if (!backend) return undefined
    return new PluginCalls(backend).vendorServerId(entryId)
  }

  /** An account's sign-in asked of the computer (`authenticateServer`, no trigger: Connectors' own): its answer, with its status and the page to open. */
  askServerSignIn(serverId: string, accountKey: string): Promise<JSONValue> {
    return this.pluginCalls().signIn(serverId, accountKey)
  }

  /** Edit Values (`updatePluginInstall`): all of the plugin's setup values replaced. */
  updatePluginValues(
    pluginId: string,
    values: Readonly<Record<string, string>>,
  ): Promise<void> {
    return this.pluginCalls().updateInstall(pluginId, values)
  }

  /** Uninstall or Remove of a server (`removeServer`): what it did, the servers as they are then. */
  async removePluginServer(serverId: string): Promise<Removal> {
    const removal = await this.pluginCalls().removeServer(serverId)
    this.applyPluginServers(removal.servers)
    return removal
  }

  /** Uninstall of a plugin (`uninstallPlugin`): what it did, the servers as they are then, its plugins read again. */
  async uninstallPluginEntry(pluginId: string): Promise<Removal> {
    const removal = await this.pluginCalls().uninstallPlugin(pluginId)
    this.applyPluginServers(removal.servers)
    await this.readEffectivePlugins()
    return removal
  }

  /** A connect's app taken back out (`takeBack`): uninstalled again, unless the computer says it connected after all; the connected apps read again. */
  async takeBackPlugin(pluginId: string, serverId: string): Promise<void> {
    await this.readPluginServers()
    if (
      serverAccounts(this.pluginServers, serverId).some(
        (server) => server.status === 'connected',
      )
    )
      return
    try {
      await this.uninstallPluginEntry(pluginId)
    } catch {
      return
    }
    await this.loadApps()
  }

  // Skills

  /** The agent's private copies of a plugin's skills dropped, before its own are synced (`dropPrivateCopies`); a failure is let go. */
  async dropPluginCopies(
    entry: PluginEntry,
    agentId: string | undefined,
  ): Promise<void> {
    const backend = this.backend
    if (!backend || agentId == null) return
    if (privateCopies(entry, this.agentSkills).length === 0) return
    await new PluginCalls(backend).dropPrivateCopies(
      entry,
      this.agentSkills,
      agentId,
    )
  }

  /** The computer's plugin skills synced (`syncPluginSkills`): how many of them are the plugin's (none asked, none counted). */
  syncPluginSkills(pluginId?: string): Promise<number> {
    return this.pluginCalls().syncSkills(pluginId)
  }

  /** A private skill's switch (`setEnabled`, `setAgentWorkflowEnabled`); a failure is let go, as the overlay does. */
  async setAgentSkillEnabled(
    skill: AgentSkill,
    agentId: string | undefined,
  ): Promise<void> {
    const backend = this.backend
    if (!backend || agentId == null) return
    let list: AgentSkill[]
    try {
      list = await new PluginCalls(backend).setSkillEnabled(
        skill,
        !skill.isEnabledForAgent,
        agentId,
      )
    } catch {
      return
    }
    if (this.backend === backend) this.setAgentSkills(agentId, list)
  }

  /** Save on a skill's page (`updateAgentWorkflow`): the name and description trimmed, the trigger and source kept; the skills as the computer lists them. */
  async saveAgentSkill(
    skill: AgentSkill,
    name: string,
    description: string,
    body: string,
    agentId: string,
  ): Promise<void> {
    const list = await this.pluginCalls().updateSkill(
      skill,
      name,
      description,
      body,
      agentId,
    )
    if (list) this.setAgentSkills(agentId, list)
  }

  /** Delete skill (`deleteAgentWorkflow`): the skills as the computer lists them. */
  async deleteAgentSkill(skillId: string, agentId: string): Promise<void> {
    const list = await this.pluginCalls().deleteSkill(skillId, agentId)
    if (list) this.setAgentSkills(agentId, list)
  }

  // Tools

  /**
   * A tool's switch (`toggle`): changed at once, then asked of the
   * computer (`toggleMcpToolDisabled`); a refusal is said under the tools
   * and the switch goes back.
   */
  async togglePluginTool(toolName: string, serverId: string): Promise<void> {
    const list = this.pluginTools.get(serverId)
    if (list?.some((tool) => tool.name === toolName)) {
      this.pluginTools = new Map(this.pluginTools).set(
        serverId,
        list.map((tool) =>
          tool.name === toolName
            ? { ...tool, isDisabled: !tool.isDisabled }
            : tool,
        ),
      )
      this.changed()
    }
    try {
      const next = await this.pluginCalls().toggleTool(toolName, serverId)
      this.pluginTools = new Map(this.pluginTools).set(serverId, next)
      const failures = new Map(this.pluginToolFailures)
      failures.delete(serverId)
      this.pluginToolFailures = failures
      this.changed()
      await this.readPluginServers()
    } catch (error) {
      const why = error instanceof Error ? error.message : String(error)
      this.pluginToolFailures = new Map(this.pluginToolFailures).set(
        serverId,
        plainError(why),
      )
      this.changed()
      await this.readPluginTools(serverId)
    }
  }

  // Sign-ins waiting (`PBn`)

  /** A sign-in's page opened (`flows[key] = Flow`): Reopen while it waits, Retry once it has waited ten minutes (`expire`). */
  startSignInFlow(key: string, url: string): void {
    const openedAt = Date.now()
    this.signInFlows = new Map(this.signInFlows).set(key, {
      url,
      openedAt,
      timedOut: false,
    })
    this.expireSignInFlow(key, openedAt)
    this.changed()
  }

  /** Reopen: the waiting page opened again, its ten minutes counted from now. */
  reopenSignInFlow(key: string): void {
    const flow = this.signInFlows.get(key)
    if (!flow) return
    const openedAt = Date.now()
    this.signInFlows = new Map(this.signInFlows).set(key, { ...flow, openedAt })
    this.expireSignInFlow(key, openedAt)
    this.changed()
  }

  private expireSignInFlow(key: string, openedAt: number): void {
    clearTimeout(this.signInTimers.get(key))
    this.signInTimers.set(
      key,
      setTimeout(() => {
        this.signInTimers.delete(key)
        const flow = this.signInFlows.get(key)
        if (!flow || flow.openedAt !== openedAt) return
        this.signInFlows = new Map(this.signInFlows).set(key, {
          ...flow,
          timedOut: true,
        })
        this.changed()
      }, signInTimeout * 1000),
    )
  }

  // Fix with agent (`si.launch`)

  /** The Plugin Setup agent there is already (by its purpose). */
  get pluginSetupAgent(): Agent | undefined {
    return setupAgentIn(this.agents)
  }

  /**
   * Fix with agent once no Plugin Setup agent was found and the roster is
   * in (PluginCalls.swift's `makePluginSetupAgent`): the agent made, the
   * roster read again, and its first message sent. Its id once it can be
   * opened (even when the message could not be sent), and what went wrong
   * on the way, which the window says as `agentFailedNotice`.
   */
  async makePluginSetupAgent(): Promise<{ id?: string; failure?: string }> {
    const backend = this.backend
    if (!backend) return { failure: t('Sign in to Simeon first.') }
    const calls = new PluginCalls(backend)
    let id: string
    try {
      id = await calls.createSetupAgent()
    } catch (error) {
      return {
        failure: plainError(
          error instanceof Error ? error.message : String(error),
        ),
      }
    }
    await this.reloadRoster()
    try {
      await calls.sendSetupRequest(id)
    } catch (error) {
      return {
        id,
        failure: plainError(
          error instanceof Error ? error.message : String(error),
        ),
      }
    }
    return { id }
  }

  // MARK: Step 6d's Connectors pages and an app's accounts on Simeon Labs'
  // server (Add Another Account, rename, remove; the core's
  // AppAccounts.swift, Store.swift's `loadAppAccounts`,
  // `anotherAccountURL`). 6b's connector reads the three below; 6d writes
  // them.

  /** Each app's accounts as Simeon Labs' server last listed them, by the app's toolkit (`appAccounts`). */
  appAccounts: Record<string, AppAccounts> = {}
  /**
   * How many changes (a rename, a Remove) have been sent for each app: an
   * answer that left before a later change is older than that change's own
   * and is dropped, so a slow read never brings back an account just
   * removed or its old name. (The core keeps whichever answer comes last.)
   */
  private appAccountChanges = new Map<string, number>()

  /** The toolkit of an app whose accounts Simeon's server keeps: by its server's address, else its catalogue row's (`appsToolkit(serverURL:pluginId:)`). */
  appsToolkit(
    serverURL: string | undefined,
    pluginId: string | undefined,
  ): string | undefined {
    return (
      toolkitOf(serverURL) ??
      toolkitOf(
        pluginId === undefined
          ? undefined
          : this.catalog.find((app) => app.id === pluginId)?.serverURL,
      )
    )
  }

  /** An app's accounts read again (`GET apps/{toolkit}/accounts`, `loadAppAccounts`); what was shown stays when they can't be read, or when a change was sent since the read began. */
  async loadAppAccounts(toolkit: string): Promise<void> {
    const backend = this.backend
    if (!backend) return
    const asked = this.appAccountChanges.get(toolkit) ?? 0
    let answer: JSONValue
    try {
      answer = await backend.server(`apps/${toolkit}/accounts`)
    } catch {
      return
    }
    const read = appAccountsFrom(answer)
    if (this.backend !== backend || !read) return
    if ((this.appAccountChanges.get(toolkit) ?? 0) !== asked) return
    this.appAccounts = { ...this.appAccounts, [toolkit]: read }
    this.changed()
  }

  /** The ids of an app's accounts as last read (`appAccounts[toolkit].accounts`). */
  appAccountIds(toolkit: string): readonly string[] {
    return this.appAccounts[toolkit]?.accounts.map((one) => one.id) ?? []
  }

  /** The sign-in page for one more account (`POST apps/{toolkit}/connect` with `another`, `anotherAccountURL`): a web page only, and none once signed out; none when it can't be had (the store's problem says why). */
  async anotherAccountURL(
    toolkit: string,
    name: string,
  ): Promise<string | undefined> {
    const backend = this.backend
    if (!backend) return undefined
    let why: string | undefined
    let url: string | undefined
    try {
      const answer = await backend.server(`apps/${toolkit}/connect`, 'POST', {
        another: true,
      })
      url = webPage(text(field(answer, 'url')))
    } catch (error) {
      why = plainError(error instanceof Error ? error.message : String(error))
    }
    if (this.backend !== backend) return undefined
    if (url !== undefined) return url
    this.problem = didntConnect(name, why)
    this.changed()
    return undefined
  }

  /** The pencil: the person's own name for one account; an empty one goes back to who it signs in as (`renameAppAccount`). */
  async renameAppAccount(
    toolkit: string,
    account: AppAccount,
    name: string,
  ): Promise<void> {
    const next = name.split(/\s+/).filter(Boolean).join(' ')
    if (next === (account.name ?? '')) return
    await this.changeAppAccounts(
      toolkit,
      account,
      'PATCH',
      { name: next },
      t("Couldn't rename the account"),
    )
  }

  /** One account signed out of the app; the others stay (`removeAppAccount`). */
  async removeAppAccount(toolkit: string, account: AppAccount): Promise<void> {
    await this.changeAppAccounts(
      toolkit,
      account,
      'DELETE',
      undefined,
      t("Couldn't remove the account"),
    )
  }

  /** A change to one account; the server answers with the app's accounts as they now are (kept unless a later change was sent meanwhile), and a refusal is said (`problem`). */
  private async changeAppAccounts(
    toolkit: string,
    account: AppAccount,
    method: string,
    body: JSONValue | undefined,
    failure: string,
  ): Promise<void> {
    const backend = this.backend
    if (!backend) return
    const change = (this.appAccountChanges.get(toolkit) ?? 0) + 1
    this.appAccountChanges.set(toolkit, change)
    try {
      const answer = await backend.server(
        `apps/${toolkit}/accounts/${accountPath(account.id)}`,
        method,
        body,
      )
      const read = appAccountsFrom(answer)
      if (this.backend !== backend || !read) return
      if (this.appAccountChanges.get(toolkit) !== change) return
      this.appAccounts = { ...this.appAccounts, [toolkit]: read }
    } catch (error) {
      if (this.backend !== backend) return
      const why = error instanceof Error ? error.message : String(error)
      this.problem = t`${failure}: ${why}`
      // The last change refused: an earlier one's answer may have been dropped for it, so the list is read again.
      if (this.appAccountChanges.get(toolkit) === change)
        void this.loadAppAccounts(toolkit)
    }
    this.changed()
  }

  /** 6d's state back to nothing (signed out). */
  private resetConnectorPages(): void {
    this.appAccounts = {}
    this.appAccountChanges = new Map()
  }

  // MARK: Step 6e's Settings: General (the account, language, appearance,
  // time zone), the account's page (name, password), Permissions
  // (Auto-review's rules), Computer, Help & support, Legal; Send Feedback
  // and Report an Issue (mac/Simeon/SettingsGeneral.swift, SettingsPages.swift,
  // Feedback.swift; the core's AccountSettings.swift, StoreSettings.swift,
  // Feedback.swift).
  //
  // Nothing of these pages is kept here: each page reads the computer's
  // values afresh as it shows (`GeneralSettingsModel`), and each sheet holds
  // its own words. A password typed is read only as it is sent, and never
  // kept.

  /** 6e's state back to nothing (signed out): it keeps none. */
  private resetGeneralSettings(): void {}

  /** The zone this browser is in (`TimeZone.current`); the tests give their own. */
  timeZoneNow: () => string = detectedTimeZone

  /**
   * The name changed in Settings › Account (StoreSettings.swift's
   * `changeName`): what the agents call the person, as the first run's name
   * step saves it (`POST user/name`); the computer told to read it again
   * (`refreshUserName`; asleep, it reads it as it wakes). None once saved,
   * the account showing it; else why not, the server's sentence when it
   * says one ("A name of 1 to 60 characters.").
   */
  async changeName(typed: string): Promise<string | undefined> {
    const backend = this.backend
    if (!backend) return t('Sign in to Simeon first.')
    const name = normalizedName(typed)
    try {
      await backend.server('user/name', 'POST', { name })
    } catch (error) {
      if (error instanceof SimeonAPIError && error.message !== '')
        return error.message
      return t("Couldn't change it")
    }
    if (this.backend !== backend) return undefined
    if (this.account) {
      this.account = { ...this.account, name }
      this.changed()
    }
    await quietly(backend.command('refreshUserName', {}, { wakes: false }))
    return undefined
  }

  /** Settings › Account › Password: whether the account has one (`GET account/password`); none when it can't be asked (`hasPassword`). */
  async hasPassword(): Promise<boolean | undefined> {
    const backend = this.backend
    if (!backend) return undefined
    try {
      return bool(field(await backend.server('account/password', 'GET'), 'set'))
    } catch {
      return undefined
    }
  }

  /** Set or change the account's password (`PUT account/password`, `setPassword`): none once it is saved, else the sentence to show ("Use at least 8 characters."). The password is only sent. */
  async setPassword(password: string): Promise<string | undefined> {
    const backend = this.backend
    if (!backend) return t('Sign in to Simeon first.')
    try {
      await backend.server('account/password', 'PUT', { password })
      return undefined
    } catch (error) {
      if (error instanceof SimeonAPIError && error.message !== '')
        return error.message
      return t("The password wasn't saved. Try again.")
    }
  }

  /** The computer's settings, quietly: none when they can't be read (`readHostSettings`). */
  async readHostSettings(): Promise<JSONValue | undefined> {
    const backend = this.backend
    if (!backend) return undefined
    try {
      return await backend.command('getHostSettings', {})
    } catch {
      return undefined
    }
  }

  /** A setting written, quietly: false when refused (`writeHostSettings`). */
  private async writeHostSettings(update: JSONValue): Promise<boolean> {
    const backend = this.backend
    if (!backend) return false
    try {
      await backend.command('setHostSettings', update)
      return true
    } catch {
      return false
    }
  }

  /** The time zone (`setTimeZone`): the zone the agents and routines use, or none for the one this browser is in (not told when the browser hides it, `isHiddenZone`). */
  setTimeZone(
    zone: string | undefined,
    detected: string = this.timeZoneNow(),
  ): Promise<boolean> {
    return this.writeHostSettings(
      isHiddenZone(detected)
        ? { userTimeZoneOverride: zone ?? '' }
        : { userTimeZone: detected, userTimeZoneOverride: zone ?? '' },
    )
  }

  /** Auto-review (`setAutoReview`): its switch and its two lists of rules, as the host keeps them. */
  setAutoReview(rules: AutoReviewInstructions): Promise<boolean> {
    return this.writeHostSettings({
      autoReviewInstructions: autoReviewJSON(
        normalizedRules(autoReviewJSON(rules)),
      ),
    })
  }

  /**
   * The zone this browser is in, told to the computer each time the stream
   * comes (back), beside the language (MacServices.swift's `connected`),
   * without waking a computer that rests. The person's own pick stays the
   * computer's: the host keeps it apart (`userTimeZoneOverride`) and goes
   * by it while there is one. A browser that hides its zone (UTC,
   * `isHiddenZone`) tells nothing: the agents keep the zone the person's
   * other devices told.
   */
  private async tellTimeZone(backend: AgentBackend): Promise<void> {
    const zone = this.timeZoneNow()
    if (isHiddenZone(zone)) return
    await quietly(
      backend.command(
        'setHostSettings',
        { userTimeZone: zone },
        { wakes: false },
      ),
    )
  }

  /** Send Feedback and Report an Issue, e-mailed to Simeon Labs (`sendFeedback`); the server's sentence is thrown when it refuses. */
  async sendFeedback(
    report: FeedbackReport,
    facts: DeviceFacts,
    diagnostics: string | undefined,
  ): Promise<void> {
    const backend = this.backend
    if (!backend) throw new SimeonAPIError(t('Sign in to Simeon first.'), 401)
    await backend.server(
      'feedback',
      'POST',
      feedbackBody(report, facts, diagnostics),
    )
  }

  /** What the app knows of its own state, a line each, for a report's diagnostics (`diagnosticsState`). */
  get diagnosticsState(): string[] {
    const agents = this.agents.filter((agent) => !agent.isGroup).length
    const groups = this.agents.filter((agent) => agent.isGroup).length
    const lines = [
      `Signed in: ${this.account === undefined ? 'no' : 'yes'}`,
      `Agents: ${agents}, groups: ${groups}`,
      `Computer: ${this.latestComputerStatus?.state ?? 'unknown'}, stream ${this.isLive ? 'connected' : 'not connected'}${this.isAsleep ? ', asleep' : ''}`,
      `Open chat: ${this.openChat ?? 'none'}`,
    ]
    if (this.problem) lines.push(`Last problem shown: ${this.problem}`)
    return lines
  }

  // MARK: Step 6f's usage and billing: the usage (`UsageLoad`), Usage &
  // Billing, the credits line over the message field, Wallet, the
  // Credentials Store, the account menu and its Weekly usage, About
  // (mac/Simeon/SettingsUsage.swift, SettingsPages.swift's Wallet,
  // SettingsCredentials.swift, Account.swift; the core's AccountSettings.swift
  // usage, StoreSettings.swift, Upgrade.swift, Trays.swift, AccountMenu.swift,
  // CredentialsStore.swift).

  /**
   * The account's usage (`usage`, StoreSettings.swift): read once signed
   * in, as a chat opens and after each of its turns, when the account menu
   * opens and on Usage & Billing, unless it was read in the last 30 s; a
   * failure keeps the last summary on screen.
   */
  usage: UsageLoad = emptyUsage
  /** When the usage was last read, in ms (`usageReadAt`): the account menu counts its reset from it. */
  usageReadAt?: number
  /** The computer's notices (`trayList`, Trays.swift): the credits' line reads the open agent's. */
  trayList = new TrayList()
  private usageReading?: Promise<void>
  /** Each read of the usage numbered: only the latest one's answer lands. */
  private usageSeq = 0
  /** A billing page was opened in another tab and this one hasn't come back to the front since. */
  private billingAway = false

  /**
   * Usage & Billing in Settings' list (SettingsWindow.swift's `pages`):
   * while the usage is not read yet, and while it is shown (not for an
   * enterprise team).
   */
  get usageListed(): boolean {
    return shownSummary(this.usage) === undefined || showsSection(this.usage)
  }

  /** ⌘K and "/" offer Usage & Billing once the usage is read and shown (`usage.showsSection`). */
  get usageOffered(): boolean {
    return showsSection(this.usage)
  }

  /** The usage read again unless it was read under 30 s ago (`loadUsage`); a read on its way is waited for, not doubled. */
  loadUsage(now: number = Date.now()): Promise<void> {
    if (this.usage.kind === 'loading')
      return this.usageReading ?? Promise.resolve()
    if (
      this.usage.kind === 'ready' &&
      this.usageReadAt !== undefined &&
      now - this.usageReadAt < usageFreshMs
    )
      return Promise.resolve()
    return this.refreshUsage()
  }

  /** Retry, after Cancel Trial and after a billing page (`refreshUsage`): the server's quota summarised as the Electron app summarised it. */
  refreshUsage(): Promise<void> {
    const reading = this.readUsage()
    this.usageReading = reading
    return reading
  }

  private async readUsage(): Promise<void> {
    const backend = this.backend
    if (!backend) {
      this.usage = emptyUsage
      this.changed()
      return
    }
    this.usageSeq += 1
    const seq = this.usageSeq
    const previous = shownSummary(this.usage)
    this.usage = { kind: 'loading', previous }
    this.changed()
    // An answer lands only while it is the latest read's: an older one landing late (a turn's read under Cancel Trial's) is dropped.
    const latest = () => this.backend === backend && seq === this.usageSeq
    try {
      const quota = await backend.server('user/quota')
      if (!latest()) return
      this.usage = { kind: 'ready', summary: usageSummary(quota) }
      this.usageReadAt = Date.now()
    } catch {
      if (!latest()) return
      this.usage = { kind: 'failed', previous }
    }
    this.changed()
  }

  /** A billing page opened in another tab (Usage & Billing's rows): when this tab comes back to the front, they are read again. */
  billingTabOpened(): void {
    this.billingAway = true
  }

  /**
   * This tab back in front (the window's `focus`, the page shown again):
   * after a billing page, the access, the plan the access notice words
   * itself from (5c's `plan`) and the usage are read again, once, as the
   * Mac reads them when its sheet closes; Settings may have closed meanwhile.
   */
  async billingTabBack(): Promise<void> {
    if (!this.billingAway) return
    this.billingAway = false
    await this.refreshAccess()
    await Promise.all([this.refreshUsage(), this.refreshPlan()])
  }

  /**
   * Cancel Trial (`cancelTrial`, Connect's `CancelSandTrial`): none once it
   * is done and the access and the usage read again (the trial's end
   * changes what this account may do), else what to say in the question.
   */
  async cancelTrial(): Promise<string | undefined> {
    const backend = this.backend
    if (!backend?.dashboard) return t('Sign in to Simeon to continue')
    try {
      await backend.dashboard('CancelSandTrial', {})
    } catch (error) {
      if (
        error instanceof SimeonAPIError &&
        error.status >= 400 &&
        error.status < 500 &&
        error.message !== ''
      )
        return error.message
      return t('Couldn’t cancel the trial. Try again.')
    }
    if (this.backend !== backend) return undefined
    await this.refreshAccess()
    // The usage, and the plan the access notice words itself from (5c's `plan`).
    await Promise.all([this.refreshUsage(), this.refreshPlan()])
    return undefined
  }

  /** One of the computer's `tray` events (snapshot, pushed, dismissed, cleared), applied as it comes. */
  private takeTray(event: JSONValue): void {
    const before = this.trayList.trays
    this.trayList.take(event)
    if (this.trayList.trays !== before) this.changed()
  }

  /**
   * The computer's notices read (`loadTrays`, `getTrays`), what came
   * meanwhile applied over the answer. A resting computer is not woken: it
   * is read again when the stream comes back.
   */
  async loadTrays(): Promise<void> {
    const backend = this.backend
    if (!backend) return
    const seq = this.trayList.beginRead()
    let answer: JSONValue | undefined
    try {
      answer = await backend.command('getTrays', {}, { wakes: false })
    } catch {
      answer = undefined
    }
    if (this.backend !== backend) return
    const before = this.trayList.trays
    this.trayList.finishRead(seq, answer)
    if (this.trayList.trays !== before) this.changed()
  }

  /** Whether one of the agent's notices carries the server's sentence for spent credits (the credits' line's `outOfCredits`). */
  outOfCredits(agentId: string): boolean {
    return this.trayList.shown(agentId).some(isOutOfCredits)
  }

  /**
   * The Credentials Store's calls to Simeon Labs' server (`credentials`,
   * `credentials/{id}`; `CredentialsStoreModel(store:)`): the page's model
   * says each to the server, and keeps nothing of a password.
   */
  credentialsCall = (
    path: string,
    method?: string,
    body?: JSONValue,
  ): Promise<JSONValue> => {
    const backend = this.backend
    if (!backend)
      return Promise.reject(
        new SimeonAPIError(t('Sign in to Simeon first.'), 401),
      )
    return backend.server(path, method, body)
  }

  /** 6f's state back to nothing (signed out). */
  private resetUsageAndBilling(): void {
    this.usage = emptyUsage
    this.usageReadAt = undefined
    this.usageReading = undefined
    this.usageSeq += 1
    this.billingAway = false
    this.trayList = new TrayList()
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
    // Not while the computer is rebuilt (`rebuild-locked`), as Store.swift's.
    if (this.isSendingPaused) return
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

  // MARK: Step 7b's session in the Windows app: the chats kept on disk (the Mac's
  // `SavedChats`), the logs. Only in the Windows app (src/desktop/).

  private resetDesktopSession(): void {}

  // MARK: Step 7c's notifications, the taskbar's number, the tray and the menu: the
  // roster's news (the Mac's `rosterNews`), each agent's waiting and unread.

  private resetDesktopSurfaces(): void {}

  // MARK: Step 7d's links and pages outside: `simeon://` links handed in, a connector's
  // sign-in coming back (`completeMcpOAuth`), Stripe's pages in the app's window.

  /**
   * The sign-ins this app named to Simeon Labs' server to come back to it
   * (`sendSignInBack`), by their state: the app's own name and when. Only
   * these are finished when a `simeon://mcp-oauth` link comes back, within
   * `AppStore.returnedSignInMs`; forgotten on sign-out (review of 2 November 2026:
   * any page can write such a link).
   */
  private returnedSignIns = new Map<string, { name: string; at: number }>()

  /** A sign-in named to the server to come back to the app is finished within this (its own wait is 5 minutes). */
  static readonly returnedSignInMs = 10 * 60_000

  private resetDesktopOutside(): void {
    this.returnedSignIns.clear()
  }

  /**
   * A sign-in's answer the server sent back to the app
   * (`simeon://mcp-oauth`), finished on this account's computer
   * (`completeMcpOAuth`) only when this app named that sign-in in this
   * sign-in session, within its lifetime, and once: any other link is
   * dropped without a word. A refusal says the catalogue's sentence, never
   * the link's own words. Whether it was one of this app's.
   */
  async finishReturnedSignIn(
    answer: SignInAnswer,
    now: number = Date.now(),
  ): Promise<boolean> {
    const started = this.returnedSignIns.get(answer.state)
    if (!started || now - started.at > AppStore.returnedSignInMs) return false
    if (!this.backend) return false
    this.returnedSignIns.delete(answer.state)
    if (answer.error != null) {
      this.problem = didntConnect(started.name)
      this.changed()
      return true
    }
    await this.finishLoopbackSignIn(
      { state: answer.state, code: answer.code },
      started.name,
    )
    return true
  }

  /**
   * A connector's sign-in answer, caught on this PC's loopback or sent back
   * to the app by Simeon Labs' server (LoopbackSignIn.swift's and
   * AppReturnSignIn.swift's `finishLoopbackSignIn`), handed to this
   * account's computer, which started it: the code for the app's access
   * (`completeMcpOAuth`), then the apps read again, so the sign-in's own
   * wait sees it connected. The maker's refusal is said (`problem`).
   */
  async finishLoopbackSignIn(
    answer: SignInAnswer,
    name: string,
  ): Promise<void> {
    if (answer.error != null) {
      this.problem =
        answer.errorDescription ??
        t`${name} refused the sign-in (${answer.error}).`
      this.changed()
      return
    }
    const backend = this.backend
    if (answer.code == null || !backend) return
    try {
      await backend.command('completeMcpOAuth', {
        stateId: answer.state,
        code: answer.code,
      })
      await this.loadApps()
    } catch (error) {
      const why = error instanceof Error ? error.message : String(error)
      this.problem = t`Couldn't finish connecting ${name}: ${why}`
      this.changed()
    }
  }

  /**
   * Asks Simeon Labs' server to send this sign-in back to the app, by its
   * own scheme (`sendSignInBack`, `POST mcp-oauth/return`), remembering it
   * under the app's `name` (`finishReturnedSignIn`); false when it could not
   * (the server's own page then finishes it, as before).
   */
  async sendSignInBack(
    state: string,
    scheme: string,
    name: string,
    now: number = Date.now(),
  ): Promise<boolean> {
    const backend = this.backend
    if (!backend) return false
    // Remembered before it goes: the answer may come back before the server's reply does.
    for (const [old, started] of this.returnedSignIns)
      if (now - started.at > AppStore.returnedSignInMs)
        this.returnedSignIns.delete(old)
    this.returnedSignIns.set(state, { name, at: now })
    try {
      await backend.server('mcp-oauth/return', 'POST', { state, back: scheme })
      return true
    } catch {
      return false
    }
  }

  /**
   * Stripe's page closed (`settleAfterCardPage`): after a failed payment,
   * once it came back on the app's own link, the plan charged now on the
   * card just saved (`billing/settle`); then the access, the usage and the
   * plan the access notice words itself from read again, so the line over
   * the composer goes and Send comes back at once when it went through.
   */
  async settleAfterCardPage(paymentFailed: boolean): Promise<void> {
    const backend = this.backend
    if (paymentFailed && backend) {
      try {
        await backend.server('billing/settle', 'POST', {})
      } catch {
        // The plan is read again either way: it says whether it went through.
      }
    }
    await this.refreshAccess()
    await Promise.all([this.refreshUsage(), this.refreshPlan()])
  }

  /** Whether a payment had failed when Stripe's page was asked for (`usage.summary?.paymentFailed`; the access cover's plan says it too). */
  get paymentFailed(): boolean {
    return (
      shownSummary(this.usage)?.paymentFailed === true ||
      this.plan?.paymentFailed === true
    )
  }

  /**
   * The 1Password connect card's key, made by the person's 1Password app on
   * this PC, to the computer (`connectOnePassword`), which checks it with
   * 1Password and keeps it; with the card that asked, the card says
   * Connected. Nothing is kept here. None once kept, else why not.
   */
  async connectOnePassword(made: {
    token: string
    vaultId: string
    vaultName: string
    accountEmail?: string
    entryId?: string
    agentId?: string
  }): Promise<string | undefined> {
    const failed = t("1Password wasn't connected")
    const args: Record<string, JSONValue> = {
      token: made.token,
      vaultId: made.vaultId,
      vaultName: made.vaultName,
    }
    if (made.accountEmail != null) args.accountEmail = made.accountEmail
    if (made.entryId != null && made.agentId != null) {
      args.entryId = made.entryId
      args.agentId = made.agentId
    }
    const reply = await this.command('connectOnePassword', args, failed)
    if (reply === undefined) return failed
    return bool(field(reply, 'ok')) === false
      ? (text(field(reply, 'message')) ?? failed)
      : undefined
  }

  // MARK: Step 7e's updates (the updater's state lives in the main process; nothing of the
  // account's).

  private resetDesktopUpdates(): void {}

  // MARK: Step 7f's agent's hands on this PC: the local permission, the team's ceiling,
  // the Allow card's ask, commands allowed once.

  private resetDesktopHands(): void {}
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
