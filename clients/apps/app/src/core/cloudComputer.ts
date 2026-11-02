// An agent's screen on the cloud computer, as the shipped window reads and
// words it (ios/SimeonCore/Sources/SimeonCore/CloudComputer.swift: `TTn`,
// `NTn`, `qoe`, `$1t`, `CTn`, `fbn`, `Abn` in the window's main bundle;
// `preload-vnc.ts` and `computer-stream.ts` in the Electron app), and the
// call given a deadline (StoreComputer.swift's `withDeadline`). The screens
// only draw it; the store runs the calls (step 5b).

import { type JSONValue, field, isObject, num, str, text } from './json'
import { t } from './l10n'
import { plainError } from './plainWords'
import { type PendingHandoff, pendingHandoff } from './requestCards'

// MARK: The box's status

/** An agent's computer as the host says it (`BoxStatus`): `getForeverBoxStatus`, `ensureForeverBox`, the `forever-box` push. */
export interface BoxStatus {
  /** The agent it is for, as the host stamps it (a push says whose it is only by this). */
  agentId?: string
  /** The host's state: "running", "hibernated", "absent"… */
  state: string
  /** The screen's page, when the host has one. */
  vncUrl?: string
  /** The image being pulled: how far, 0–100. */
  pullPercent?: number
  /** The agent waiting on the person at the computer. */
  handoff?: PendingHandoff
  raw: JSONValue
}

/** A status from the host's answer; none for anything but an object (`BoxStatus.init?(json:)`). */
export function boxStatusFrom(
  json: JSONValue | undefined,
): BoxStatus | undefined {
  if (!isObject(json)) return undefined
  return {
    agentId: text(field(json, 'agentId')),
    state: str(field(json, 'state')) ?? 'absent',
    vncUrl: str(field(json, 'vncUrl')),
    pullPercent: num(field(field(json, 'pull'), 'percent')),
    handoff: pendingHandoff(json),
    raw: json,
  }
}

/** The page to show: only while the computer runs and has one (`N2e`). */
export function screenURL(status: BoxStatus | undefined): string | undefined {
  if (status?.state !== 'running' || !status.vncUrl) return undefined
  return status.vncUrl
}

/** A pull under way, even with no percent yet (`pull != null`). */
export function isPulling(status: BoxStatus): boolean {
  const pull = field(status.raw, 'pull')
  return pull !== undefined && pull !== null
}

/** Two statuses the same, field for field (Swift's `Equatable`). */
function sameStatus(a: BoxStatus | undefined, b: BoxStatus | undefined) {
  if (a === b) return true
  if (!a || !b) return false
  return JSON.stringify(a.raw) === JSON.stringify(b.raw)
}

/** Where the computer is (`qoe`). */
export type ComputerPhase =
  | 'pulling'
  | 'running'
  | 'local'
  | 'starting'
  | 'sleeping'
  | 'off'

export function computerPhase(
  status: BoxStatus | undefined,
  ensuring: boolean,
): ComputerPhase {
  if (status && isPulling(status)) return 'pulling'
  if (status?.state === 'running')
    return screenURL(status) != null ? 'running' : 'local'
  if (ensuring) return 'starting'
  return status?.state === 'hibernated' ? 'sleeping' : 'off'
}

/** Whether the status has been read: never yet, read, or failed before any was (`readState`). */
export type ComputerReadState = 'unknown' | 'known' | 'error'

// MARK: Words over a screen not there yet

/**
 * The words over a screen that isn't there yet (`$1t`): what it says, a bar
 * (with a percent, or moving), and Retry.
 */
export interface ComputerPlaceholder {
  message: string
  percent?: number
  isBusy: boolean
  hasRetry: boolean
}

export const placeholderWords = {
  get local() {
    return t(
      "This agent runs on your machine. There's no separate desktop to stream.",
    )
  },
  get booting() {
    return t('Booting up the computer')
  },
  get settingUp() {
    return t('Setting up the computer')
  },
}

/** The shipped function, as it is (`ComputerPlaceholder.copy`). */
export function placeholderCopy(options: {
  screenLoading: boolean
  unavailable: boolean
  name: string
  emptyMessage?: string
  emptyLoading: boolean
  pullPercent?: number
}): ComputerPlaceholder {
  const { name } = options
  if (options.screenLoading)
    return {
      message: t`Switching to ${name}'s screen…`,
      isBusy: true,
      hasRetry: false,
    }
  if (options.unavailable)
    return {
      message: t`Can't reach ${name}'s screen`,
      isBusy: false,
      hasRetry: true,
    }
  if (options.pullPercent != null)
    return {
      message: placeholderWords.settingUp,
      percent: options.pullPercent,
      isBusy: true,
      hasRetry: false,
    }
  return {
    message: options.emptyMessage ?? placeholderWords.booting,
    isBusy: options.emptyLoading,
    hasRetry: false,
  }
}

/** The pane's preview: never "Switching to…", and drawn only when busy or with Retry (`_bn`); none draws the bare desktop icon. */
export function previewPlaceholder(
  name: string,
  read: ComputerReadState,
  phase: ComputerPhase,
  pullPercent?: number,
): ComputerPlaceholder | undefined {
  const busy =
    read === 'error'
      ? false
      : read !== 'known' || phase === 'pulling' || phase === 'starting'
  const copy = placeholderCopy({
    screenLoading: false,
    unavailable: read === 'error',
    name,
    emptyLoading: busy,
    pullPercent,
  })
  return copy.isBusy || copy.hasRetry ? copy : undefined
}

/** The full view's stage (`XOn` `U`): with helpers on screen, only the plain wording. */
export function fullPlaceholder(
  name: string,
  read: ComputerReadState,
  phase: ComputerPhase,
  pullPercent: number | undefined,
  hasHelpers: boolean,
): ComputerPlaceholder {
  return placeholderCopy({
    screenLoading: !hasHelpers && read === 'unknown',
    unavailable: !hasHelpers && read === 'error',
    name,
    emptyMessage: phase === 'local' ? placeholderWords.local : undefined,
    emptyLoading: phase !== 'local',
    pullPercent: hasHelpers ? undefined : pullPercent,
  })
}

// MARK: Helpers' screens

/** A helper's screen in the full view's strip: a running computer-use subagent (`CTn`). */
export interface ComputerHelper {
  subagentId: string
  title: string
}

/** The running computer-use subagents, in the host's order; an empty title reads "Subagent". */
export function helperScreens(
  subagents: readonly JSONValue[],
): ComputerHelper[] {
  const out: ComputerHelper[] = []
  for (const row of subagents) {
    const id = text(field(row, 'subagentId'))
    if (
      str(field(row, 'status')) !== 'running' ||
      str(field(row, 'subagentType')) !== 'computerUse' ||
      id == null
    )
      continue
    const title = (str(field(row, 'title')) ?? '').trim()
    out.push({ subagentId: id, title: title === '' ? t('Subagent') : title })
  }
  return out
}

/** The screen in focus: the one asked for while it is there, else the first (`wbn`; a helper never carries a hand-off). */
export function focusedHelper(
  helpers: readonly ComputerHelper[],
  asked: string | undefined,
): string | undefined {
  if (asked != null && helpers.some((helper) => helper.subagentId === asked))
    return asked
  return helpers[0]?.subagentId
}

/** The strip shows the others: all of them up to four, else three and "and N more" (`fbn`, `kve` 3). */
export function helperStrip(others: number): { shown: number; more?: number } {
  return others > 4 ? { shown: 3, more: others - 3 } : { shown: others }
}

/** ↑← and ↓→ move between two or more screens, round (`bbn`). */
export function stepHelper(
  helpers: readonly ComputerHelper[],
  current: string | undefined,
  delta: number,
): string | undefined {
  if (helpers.length < 2) return undefined
  const index = helpers.findIndex((helper) => helper.subagentId === current)
  const n = helpers.length
  return helpers[((((index === -1 ? 0 : index) + delta) % n) + n) % n]!
    .subagentId
}

// MARK: The agent's pointer

/** The agent's pointer on the pane's preview (`Abn`, from `computer-action`). */
export interface AgentPointer {
  x: number
  y: number
  /** "move", "click", "drag" or "scroll". */
  type: string
  /** When it came, in ms. */
  at: number
}

export function agentPointerFrom(
  json: JSONValue | undefined,
  at: number = Date.now(),
): AgentPointer | undefined {
  const x = num(field(json, 'x'))
  const y = num(field(json, 'y'))
  if (x == null || y == null) return undefined
  return { x, y, type: str(field(json, 'type')) ?? 'move', at }
}

/** Where it sits on a frame of this width and height (the screen is 1280 × 800). */
export function pointerPlace(
  pointer: AgentPointer,
  width: number,
  height: number,
): { x: number; y: number } {
  return {
    x: (pointer.x / computerScreen.width) * width,
    y: (pointer.y / computerScreen.height) * height,
  }
}

/** Its size on a frame this wide (`Tbn`, `Sbn`, `xbn`). */
export function pointerScale(frameWidth: number): number {
  return Math.min(
    1.8,
    Math.max(0.75, (frameWidth / computerScreen.width) * 2.85),
  )
}

/** A click presses only once the pointer has had 0.5 s to get there (`Ebn`): the seconds to wait. */
export function pressDelay(sinceMove: number): number {
  return Math.max(0, 0.5 - sinceMove)
}

// MARK: The screen and its rules

/** The computer's screen and its rules (1280 × 800, `W8n`, `K8n`). */
export const computerScreen = {
  width: 1280,
  height: 800,
  /** A status read or a start waits this long, in seconds (`wTn`). */
  deadline: 15,
  /** A window coming forward reads again at most this often, in seconds (`SVn`). */
  focusCatchUp: 60,
  /** A spinner up this long gets its notice, in seconds (`COMPUTER_STREAM_NOTICE_DELAY_MS`). */
  noticeDelay: 20,
  /** The box's clipboard checked this often while the full view is open (`VNC_CLIPBOARD_POLL_MS`). */
  clipboardPoll: 0.5,
  /** This computer's clipboard sent at most this often (`VNC_CLIPBOARD_GESTURE_THROTTLE_MS`). */
  clipboardThrottle: 0.2,
  /** ⌘A ⌘C ⌘V ⌘X ⌘Z (with ⇧ or not) go to the computer as Ctrl, by the key's place (`SHORTCUTS`): their keysyms. */
  commandKeys: {
    KeyA: 0x61,
    KeyC: 0x63,
    KeyV: 0x76,
    KeyX: 0x78,
    KeyZ: 0x7a,
  } as Readonly<Record<string, number>>,
} as const

/**
 * A crashed screen page is loaded again, until it has crashed more than
 * three times, each within a minute of the one before (`sbn`, `rbn`); then
 * "Screen preview unavailable", until the full view shows it again.
 */
export class ScreenCrashes {
  count = 0
  /** The last crash, in ms. */
  last?: number
  gaveUp = false

  /** One more crash: true when the page should be loaded again. */
  crashed(now: number = Date.now()): boolean {
    if (this.last != null && now - this.last < 60_000) this.count += 1
    else this.count = 1
    this.last = now
    if (this.count > 3) this.gaveUp = true
    return !this.gaveUp
  }

  /** The full view shows it again: start over. */
  reset(): void {
    this.count = 0
    this.last = undefined
    this.gaveUp = false
  }

  static get unavailable(): string {
    return t('Screen preview unavailable')
  }
}

/**
 * The clipboard between this computer and the agent's while the full view
 * is open (`installVncClipboardBridge`): the computer's copied text comes
 * here unless it is what was just sent either way; this computer's goes
 * there 0.2 s apart at most.
 */
export class ClipboardBridge {
  sentToBox?: string
  sentToHere?: string
  /** The last try, in ms. */
  lastGesture?: number

  /** The computer's text: what to put on this computer's clipboard, or none. */
  fromBox(words: string): string | undefined {
    if (words === '' || words === this.sentToBox || words === this.sentToHere)
      return undefined
    this.sentToHere = words
    return words
  }

  /** Whether this computer's clipboard may be read and sent now (0.2 s since the last try, sent or not). */
  mayRead(now: number = Date.now()): boolean {
    if (
      this.lastGesture != null &&
      now - this.lastGesture < computerScreen.clipboardThrottle * 1000
    )
      return false
    this.lastGesture = now
    return true
  }

  /** This computer's text went to the agent's. */
  sent(words: string): void {
    this.sentToBox = words
  }
}

// MARK: The stream's reason

/** What a line of the screen's log does to the reason a stuck screen shows: set it, clear it (connected), or leave it. */
export type StreamReasonChange =
  | { kind: 'keep' }
  | { kind: 'clear' }
  | { kind: 'set'; reason: string }

const keep: StreamReasonChange = { kind: 'keep' }
const set = (reason: string): StreamReasonChange => ({ kind: 'set', reason })

/**
 * The log of the screen's connection (`computer-stream.log`) and the reason
 * a stuck screen shows (`computerStreamReason`): each line may set the
 * reason, clear it (connected) or leave it. The reasons in the screen's own
 * terms are English, as on the Mac: they stay in the log.
 */
export function streamReasonChange(line: string): StreamReasonChange {
  if (/\bstate=connected\b/.test(line) || /\bguest connected\b/.test(line))
    return { kind: 'clear' }
  if (line.includes('local docker: gateway ready')) return keep
  if (line.includes('attach rewrite partition'))
    return set(
      t(
        'The screen webview used the wrong session partition; it was corrected.',
      ),
    )
  const reach = /box reachability outcome=(\S+) method=(\S+) cause=(\S+)/.exec(
    line,
  )
  if (reach) {
    const [, outcome, method, cause] = reach
    switch (outcome) {
      case 'timeout':
        return set(
          `The computer's gateway did not answer "${method}" within the deadline.`,
        )
      case 'network':
        return set(
          `The computer's gateway could not be reached for "${method}" (${cause}).`,
        )
      case 'box_blocked':
        return set(t('The computer is blocked or paused.'))
      default:
        return set(
          `The computer's gateway failed "${method}": ${outcome} (${cause}).`,
        )
    }
  }
  const docker = /local docker FAILED: (.+)$/.exec(line)
  if (docker) return set(docker[1]!)
  const load = /guest load FAILED code=(-?\d+) \(([^)]*)\)/.exec(line)
  if (load) {
    const what = load[2]!
    const code = load[1]!
    return set(t`The screen page did not load (${what}, ${code}).`)
  }
  if (line.includes('guest preload FAILED'))
    return set(t("The screen page's helper script failed to load."))
  if (line.includes('renderer gone')) return set(t('The screen page crashed.'))
  if (line.includes('[SimeonScreen]')) {
    if (line.includes('noVNC did not start'))
      return set('noVNC never started inside the screen page.')
    if (line.includes('dialog=noVNC_credentials_dlg'))
      return set(t('The desktop is asking for a password.'))
    if (line.includes('dialog=noVNC_connect_dlg'))
      return set(
        'noVNC is waiting for a Connect click: autoconnect did not fire.',
      )
    if (line.includes('status="Failed to connect to server"'))
      return set("noVNC cannot reach the desktop's socket.")
    if (line.includes('status="Something went wrong, connection is closed"'))
      return set(t('The desktop closed the connection.'))
    if (line.includes('status="Disconnected"'))
      return set('noVNC disconnected.')
    const error = /page error: (.+)$/.exec(line)
    if (error) {
      const said = error[1]!
      return set(t`Error inside the screen page: ${said}`)
    }
  }
  const console = /guest console\[error\] (.+)$/.exec(line)
  if (console) {
    const said = console[1]!
    return set(t`Error inside the screen page: ${said}`)
  }
  return keep
}

/**
 * The notice's words (`noticeText`): the lead and the reason when it is
 * plain (PlainWords); the reason in the screen's own terms (noVNC, the
 * gateway, a page's script error) and the log stay in the log.
 */
export function streamNotice(lead: string, reason: string | undefined): string {
  const said = reason != null ? plainError(reason, '') : ''
  return [lead, said === '' ? t('Try again in a little while.') : said].join(
    ' ',
  )
}

export const streamWords = {
  /** Under a spinner up 20 s, and in "Can't reach…" at once. */
  get notConnecting() {
    return t("The computer's screen isn't connecting.")
  },
  get statusUnreadable() {
    return t("The computer's status could not be read.")
  },
}

/**
 * The log of the screens' connections (ComputerPreview.swift's
 * `ComputerStreamLog`): a line per step with its time, and the last reason
 * a screen is stuck, read from those lines, for the notices under a stuck
 * screen. The Mac writes it to a file beside its data, emptied at each
 * launch; a page has no such place, so it is kept in the tab's memory (its
 * last 500 lines), and no line carries an address's token.
 */
export class ComputerStreamLog {
  /** The last reason a screen gave for not connecting; cleared once one connects. */
  reason?: string
  readonly lines: string[] = []
  /** The Windows app's file beside its data, where each line also goes (src/desktop/session.ts). */
  sink?: (line: string) => void
  private listeners = new Set<() => void>()
  private version = 0

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getVersion = (): number => this.version

  write(line: string, now: Date = new Date()): void {
    this.lines.push(`${now.toISOString()} ${line}`)
    this.sink?.(line)
    if (this.lines.length > 500) this.lines.splice(0, this.lines.length - 500)
    const change = streamReasonChange(line)
    const before = this.reason
    if (change.kind === 'clear') this.reason = undefined
    else if (change.kind === 'set') this.reason = change.reason
    if (this.reason === before) return
    this.version += 1
    for (const listener of [...this.listeners]) listener()
  }

  /** The words of a notice: what is wrong and the last reason (`noticeText`). */
  notice(lead: string): string {
    return streamNotice(lead, this.reason)
  }
}

/** The one log of every screen in this tab (`ComputerStreamLog.shared`). */
export const streamLog = new ComputerStreamLog()

// MARK: The field a tap focused

/**
 * The field a click on the computer focused, as the computer's Chrome names
 * it (`TypingField`, `host/box/typing-focus.ts`): an input's type, `text`
 * for a text area or an editable block, `none` for nothing to type into. A
 * kind not known here is typed into as text.
 */
export type TypingField =
  | 'none'
  | 'text'
  | 'email'
  | 'password'
  | 'search'
  | 'tel'
  | 'url'
  | 'number'

const typingFields = new Set<string>([
  'text',
  'email',
  'password',
  'search',
  'tel',
  'url',
  'number',
])

export function typingFieldFrom(focus: string): TypingField {
  if (focus === '') return 'none'
  return typingFields.has(focus) ? (focus as TypingField) : 'text'
}

/** The keyboard comes up for it (`takesTyping`). */
export function takesTyping(field: TypingField): boolean {
  return field !== 'none'
}

// MARK: A call given so long

/** How a call under a deadline ended: answered, failed, or still out when the time was up (it may answer later). */
export type DeadlineOutcome<Value> =
  | { kind: 'answered'; value: Value }
  | { kind: 'failed' }
  | { kind: 'timedOut' }

/**
 * A call given so long (the window's `deadline.run`, `withDeadline`): the
 * outcome at the deadline at the latest. The call itself goes on, so a late
 * answer can still be awaited on `call`.
 */
export function withDeadline<Value>(
  seconds: number,
  call: Promise<Value>,
): Promise<DeadlineOutcome<Value>> {
  return new Promise((resolve) => {
    const timer = setTimeout(
      () => resolve({ kind: 'timedOut' }),
      seconds * 1000,
    )
    call.then(
      (value) => {
        clearTimeout(timer)
        resolve({ kind: 'answered', value })
      },
      () => {
        clearTimeout(timer)
        resolve({ kind: 'failed' })
      },
    )
  })
}

// MARK: What the window knows of each computer

interface BookEntry {
  status?: BoxStatus
  /** A read settled with nothing to show: read and empty, or failed (`settledReadState`). */
  settled?: ComputerReadState
  /** Bumped by each read and push, so an older read's answer is dropped. */
  readAttempt: number
  /** The read under way, by its attempt (`pendingRead`). */
  reading?: number
  /** A start under way (`pendingEnsure`, `isEnsureStarting`). */
  ensuring: boolean
  /** The views showing it (the pane's preview, the computer's view). */
  watchers: number
}

const newEntry = (): BookEntry => ({
  readAttempt: 0,
  ensuring: false,
  watchers: 0,
})

/**
 * What the window knows of each agent's computer (`ComputerBook`, `TTn`):
 * the last status, whether it has been read, the reads and starts under
 * way, and who is looking. Only state: the store runs the calls and reports
 * back here, so every rule is checked without a computer. A status, once
 * had, stays until a newer one: "Can't reach…" shows only before the first.
 * `version` moves with every change a screen can see.
 */
export class ComputerBook {
  /** At most this many are kept; ones nobody watches go first (`IVe`). */
  static readonly kept = 32

  readonly entries = new Map<string, BookEntry>()
  /** Oldest first: a status coming in moves its agent to the end (the Map's order). */
  private order: string[] = []
  /** Agents whose computer was started here once: a retry, a reconnect or the window coming forward starts it again (`hasDemanded`). */
  readonly demanded = new Set<string>()
  /** Bumped when the account goes: a start begun before is not applied (`d`). */
  private generation = 0
  /** The disk's state, from the last status or push (`diskPressureSnapshots`). */
  diskPressure?: JSONValue
  /** Moves with every change a screen can see. */
  version = 0

  status(id: string | undefined): BoxStatus | undefined {
    return id != null ? this.entries.get(id)?.status : undefined
  }

  /** Never read, read, or failed before any status came (`h`). */
  readState(id: string | undefined): ComputerReadState {
    const entry = id != null ? this.entries.get(id) : undefined
    if (!entry) return 'unknown'
    return entry.status != null ? 'known' : (entry.settled ?? 'unknown')
  }

  isEnsuring(id: string | undefined): boolean {
    return id != null ? (this.entries.get(id)?.ensuring ?? false) : false
  }

  /** The newest status of any agent's (`getMostRecentStatus`). */
  get mostRecent(): BoxStatus | undefined {
    for (let i = this.order.length - 1; i >= 0; i -= 1) {
      const status = this.entries.get(this.order[i]!)?.status
      if (status) return status
    }
    return undefined
  }

  phase(id: string | undefined): ComputerPhase {
    return computerPhase(this.status(id), this.isEnsuring(id))
  }

  isWatched(id: string): boolean {
    return (this.entries.get(id)?.watchers ?? 0) > 0
  }

  get watched(): string[] {
    return this.order.filter((id) => (this.entries.get(id)?.watchers ?? 0) > 0)
  }

  /** The entry, made if new (`m`), keeping at most 32. */
  private touch(id: string): BookEntry {
    let entry = this.entries.get(id)
    if (!entry) {
      entry = newEntry()
      this.entries.set(id, entry)
      this.order.push(id)
      this.evict()
    }
    return entry
  }

  /** Beyond 32, the oldest that nobody watches and nothing is reading or starting go (`f`). */
  private evict(): void {
    if (this.entries.size <= ComputerBook.kept) return
    for (const id of [...this.order]) {
      const entry = this.entries.get(id)
      if (
        !entry ||
        entry.watchers !== 0 ||
        entry.reading != null ||
        entry.ensuring
      )
        continue
      this.entries.delete(id)
      this.order = this.order.filter((one) => one !== id)
      if (this.entries.size <= ComputerBook.kept) return
    }
  }

  /** A status from the host, for the agent it names (`k`): it is the one shown, and the agent the newest. */
  private take(status: BoxStatus, asked: string): void {
    const id = status.agentId ?? asked
    const entry = this.touch(id)
    const seen =
      sameStatus(entry.status, status) &&
      entry.settled === undefined &&
      this.order[this.order.length - 1] === id
    entry.status = status
    entry.settled = undefined
    const disk = field(status.raw, 'diskPressure')
    const next = disk === null ? undefined : disk
    const sameDisk = JSON.stringify(next) === JSON.stringify(this.diskPressure)
    this.diskPressure = next
    this.order = this.order.filter((one) => one !== id)
    this.order.push(id)
    // The same status again (the host pushes it often) changes nothing on screen.
    if (!seen || !sameDisk) this.version += 1
  }

  /** A read settled with nothing new, only while no status is had (`v`). */
  private settle(id: string, attempt: number, state: ComputerReadState): void {
    const entry = this.entries.get(id)
    if (
      !entry ||
      entry.readAttempt !== attempt ||
      entry.status != null ||
      entry.settled === state
    )
      return
    entry.settled = state
    this.version += 1
  }

  // Watching

  /** A view shows it. */
  watch(id: string): void {
    this.touch(id).watchers += 1
  }

  unwatch(id: string): void {
    const entry = this.entries.get(id)
    if (!entry || entry.watchers <= 0) return
    entry.watchers -= 1
    this.evict()
  }

  // Reads (`getForeverBoxStatus`)

  /** A read begins: its attempt, or none when one is already under way. A failed state is cleared first, so Retry shows the wait. */
  beginRead(id: string): number | undefined {
    const entry = this.touch(id)
    if (entry.reading != null) return undefined
    const attempt = entry.readAttempt + 1
    entry.readAttempt = attempt
    if (entry.status == null && entry.settled === 'error') {
      entry.settled = undefined
      this.version += 1
    }
    entry.reading = attempt
    return attempt
  }

  private endRead(id: string, attempt: number): void {
    const entry = this.entries.get(id)
    if (entry?.reading === attempt) entry.reading = undefined
  }

  /** The read answered: a status is taken if no newer read or push came; an empty answer counts as read. */
  readAnswered(
    id: string,
    attempt: number,
    status: BoxStatus | undefined,
  ): void {
    this.endRead(id, attempt)
    if (status && this.entries.get(id)?.readAttempt === attempt) {
      this.take(status, id)
      return
    }
    this.settle(id, attempt, 'known')
  }

  /** The read failed or passed its 15 s: "Can't reach…" while no status is had. A late answer may still come (`lateRead`). */
  readFailed(id: string, attempt: number): void {
    this.endRead(id, attempt)
    this.settle(id, attempt, 'error')
  }

  /** The answer to a read that had passed its deadline, taken if nothing newer came. */
  lateRead(id: string, attempt: number, status: BoxStatus | undefined): void {
    if (!status || this.entries.get(id)?.readAttempt !== attempt) return
    this.take(status, id)
  }

  // Starts (`ensureForeverBox`)

  /** A start begins: the account's generation, or none when one is under way. The agent is now demanded either way. */
  beginEnsure(id: string): number | undefined {
    const entry = this.touch(id)
    this.demanded.add(id)
    if (entry.ensuring) return undefined
    entry.ensuring = true
    this.version += 1
    return this.generation
  }

  /** The start answered, failed or passed its 15 s; `status` is its answer when it had one. A failure shows "Can't reach…" only while no status is had (`b`). */
  ensureSettled(
    id: string,
    generation: number,
    status: BoxStatus | undefined,
    failed: boolean,
  ): void {
    const entry = this.entries.get(id)
    if (entry?.ensuring) {
      entry.ensuring = false
      this.version += 1
    }
    if (generation !== this.generation) return
    if (status) {
      this.take(status, id)
      return
    }
    if (failed && entry && entry.status == null && entry.settled !== 'error') {
      entry.settled = 'error'
      this.version += 1
    }
  }

  /** A start's answer after its 15 s, taken if the account is the same. */
  lateEnsure(
    id: string,
    generation: number,
    status: BoxStatus | undefined,
  ): void {
    if (!status || generation !== this.generation) return
    this.take(status, id)
  }

  // Pushes and the connection

  /** A `forever-box` push: newer than any read under way (`ingestForeverBox`). */
  ingest(status: BoxStatus, asked?: string): void {
    const id = status.agentId ?? asked
    if (id == null) return
    const entry = this.touch(id)
    entry.readAttempt += 1
    entry.reading = undefined
    this.take(status, id)
  }

  /** A `box-disk-pressure` push. */
  ingestDiskPressure(value: JSONValue | undefined): void {
    const next = value === null ? undefined : value
    if (JSON.stringify(next) === JSON.stringify(this.diskPressure)) return
    this.diskPressure = next
    this.version += 1
  }

  /** The event stream back after a drop (`noteReconnect`): what to read and what to start again. Reads under way are dropped. */
  reconnected(): { read: string[]; ensure: string[] } {
    const ids = this.watched
    for (const id of ids) {
      const entry = this.entries.get(id)!
      entry.readAttempt += 1
      entry.reading = undefined
    }
    return { read: ids, ensure: ids.filter((id) => this.demanded.has(id)) }
  }

  /** The window came forward (`noteWindowFocus`): read what is watched, start again what was demanded. */
  focused(): { read: string[]; ensure: string[] } {
    const ids = this.watched
    return { read: ids, ensure: ids.filter((id) => this.demanded.has(id)) }
  }

  /** The account went (`reset`): everything forgotten but who is watching. */
  reset(): void {
    this.generation += 1
    for (const id of [...this.order]) {
      const entry = this.entries.get(id)
      if (!entry) continue
      if (entry.watchers === 0) {
        this.entries.delete(id)
        continue
      }
      this.entries.set(id, {
        readAttempt: entry.readAttempt + 1,
        ensuring: false,
        watchers: entry.watchers,
      })
    }
    this.order = this.order.filter((id) => this.entries.has(id))
    this.demanded.clear()
    this.diskPressure = undefined
    this.version += 1
  }
}
