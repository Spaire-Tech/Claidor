// The open agent's chat (`ChatPane`, `ChatHeader`, `Transcript`,
// `TranscriptRow`, `BubbleRow` and the events in mac/Simeon/ChatPane.swift;
// `ThreadChin`, `ThreadHeader` in MessageActions.swift; `ReplyQuote`,
// `ChannelTagView`, `PictureStrip` in Cards.swift; `CallLineRow` in
// CallChat.swift): its messages the window's whole height, under a blurred
// head and over the message field, opening at the newest and held there
// while new lines come; a thread in the chat's place under its breadcrumb.
//
// A message's hover bar, its reactions' capsule, its menus and the reply
// over the field are in MessageActions.tsx.
//
// Find (⌘F) is in FindBar.tsx; the agent's working line under the messages
// in ActivitySlot.tsx. The phone in the head, a call's line, its lines and
// two agents' messages over the chat are in Call.tsx (step 5d).
//
// Still to come, each with its part (docs/web-app/PROGRESS.md): the motion
// of a line coming in, the time on a sideways swipe (2b); the pictures from
// the computer, files' kinds, sizes and Save, link cards, previews (2c); the
// agent's pane opened from the head (step 4). The cards (step 3) are drawn
// by `CardRow` from Cards.tsx and their groups' files (RequestCards,
// ConnectCards, FlightCards, ShopCards).

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { activityLine } from '../core/activity'
import { parseCallRecord } from '../core/call'
import { approvalCard, draftCard, questionCard } from '../core/cards'
import {
  type Bubble,
  type CardKind,
  type ChatImage,
  type ChatRow,
  type RoutineRef,
  channelTitle,
  exchangeLabel,
  isOneEmoji,
  quoteLine,
  replyPlaceholder,
  routineLabel,
  routineVerb,
  stampText,
  unreadCardWords,
} from '../core/chat'
import {
  FindMarks,
  type FindMatch,
  findIndex,
  findMatches,
  steppedIndex,
} from '../core/chatFind'
import { type RunFlags, noRun } from '../core/chatRuns'
import { pictureURL } from '../core/faces'
import { fileKind } from '../core/filePreview'
import { english, languageCode } from '../core/language'
import type { AgentName } from '../core/mentions'
import type { Agent } from '../core/models'
import type { AppStore } from '../core/store'
import { wordsLanguage } from '../core/words'
import { t } from '../l10n'
import { ActivitySlot } from './ActivitySlot'
import { AgentMark } from './AgentMark'
import { DropOverlay, useFileDrop, useStaging } from './Attachments'
import {
  CallHeadRow,
  CallLineRow,
  CallRecordView,
  ChatCoverView,
  ExchangeChip,
  useCovered,
} from './Call'
import {
  ApprovalCardView,
  type CardProps,
  DraftCardView,
  QuestionCardView,
  cardWidth,
} from './Cards'
import { Composer } from './Composer'
import { DiskBanner } from './ComputerStates'
import { connectCardView } from './ConnectCards'
import { ContextMenu } from './ContextMenu'
import { somethingOver } from './Dialogs'
import { EmojiPicker } from './EmojiPicker'
import { FileCard, LinkCard, useShownPicture } from './Files'
import { FindBar, FindContext, Marked } from './FindBar'
import { flightCardView } from './FlightCards'
import {
  type Dismissal,
  HoverBar,
  type MenuItem,
  type MessageActions,
  PopMenu,
  type Reply,
  TapbackCapsule,
} from './MessageActions'
import {
  MentionContext,
  type MentionSetting,
  MessageBlocks,
} from './MessageText'
import { requestCardView } from './RequestCards'
import { useSearchReveal } from './SearchPanel'
import { shopCardView } from './ShopCards'
import { useOpenMedia } from './Viewers'
import { classes } from './classes'
import { copyText } from './clipboard'
import { apple } from './keys'
import { useWatched } from './useStore'
import { useWindowModel } from './windowModel'

/** What a row asks of the chat around it: going to another row, opening a thread, a message's actions. */
interface ChatControl {
  store: AppStore
  agentId: string
  threadRoot?: string
  /** The rows on screen, so a quote of one goes to it. */
  shownIds: ReadonlySet<string>
  jump: (rowId: string) => void
  lit?: string
  /** The messages' column: the chat's width less its 16 on each side. */
  column: number
  actions: MessageActions
  /** The agents a message can name (`mentionNames`: not the groups). */
  names: readonly AgentName[]
  /** Another agent's chat, from its pill. */
  openAgent: (agentId: string) => void
}

const Control = createContext<ChatControl | null>(null)
const useControl = () => useContext(Control)!

/** A place in the chat's own coordinates. */
interface Spot {
  left: number
  top: number
  right: number
  bottom: number
}

/** What is open over the chat: a message's menu, or its reactions' capsule; with the chat's size then. */
type Overlay = { bounds: { width: number; height: number } } & (
  | {
      kind: 'menu'
      forId: string
      items: MenuItem[]
      at: { x: number; y: number; endAligned: boolean }
    }
  | { kind: 'tapback'; bubble: Bubble; anchor: Spot }
  | { kind: 'picker'; bubble: Bubble; anchor: Spot }
)

/** Find in the chat: open or not, its words, ⌘F's count (the field takes the keys on each), the match stepped to for these words, and the lines it was for. */
interface FindState {
  open: boolean
  query: string
  focus: number
  choice?: { query: string; match: FindMatch; index: number }
  thread?: string
}

const noMatches: FindMatch[] = []

/** A click on the button whose menu or capsule it just closed closes it, and opens nothing (the Mac's `closedByClick`, half a second). */
const reopenGap = 500

export function ChatPane({
  store,
  agentId,
  onOpenAgent,
}: {
  store: AppStore
  agentId: string
  /** The window opens another agent's chat (a name's pill). */
  onOpenAgent: (agentId: string) => void
}) {
  useWatched(store)
  // The chat comes on screen: what the app has at once, then the host's; it is read. It leaves: all of it was read.
  useEffect(() => {
    void store.open(agentId)
    return () => store.close(agentId)
  }, [agentId, store])
  const agent = store.agent(agentId)
  const threadRoot = store.openThreads[agentId]
  const [composerHeight, setComposerHeight] = useState(56)
  // Low disk's height and the 8 under it, while it shows (`bannerHeight`, step 5c).
  const [bannerHeight, setBannerHeight] = useState(0)
  const pane = useRef<HTMLElement>(null)
  // The files waiting to go with the next message (`ChatControl.staged`), and files dropped anywhere on the chat.
  const staging = useStaging()
  const drop = useFileDrop(staging.stage)
  // A call's lines or an exchange over the chat (step 5d): its field is hidden and takes no keys, and files dropped are refused (`coversChat`).
  const covered = useCovered(agentId)
  // The message being answered (`ChatControl.reply`), in the chat or the thread it was chosen in.
  const [answering, setAnswering] = useState<{
    reply: Reply
    thread?: string
  }>()
  const reply = answering?.thread === threadRoot ? answering?.reply : undefined
  /** Bumped to give the field the keys (`focusCount`). */
  const [focusKey, setFocusKey] = useState(0)
  const [overlay, setOverlay] = useState<Overlay>()
  const closed = useRef<{ id: string; at: number }>(undefined)

  // Find in the chat (⌘F, `ChatControl`'s find): open, its words, ⌘F's count, the match stepped to.
  const [find, setFind] = useState<FindState>({
    open: false,
    query: '',
    focus: 0,
  })
  // The bar belongs to the lines on screen: on a thread, or back, it starts again, still open.
  const here: FindState =
    find.thread === threadRoot
      ? find
      : { ...find, query: '', choice: undefined, thread: threadRoot }
  // Find reads the lines on screen: the thread's while one is open (`ChatFind`).
  const matches = here.open
    ? findMatches(here.query, store.findableEntries(agentId))
    : noMatches
  const index = findIndex(matches, here.choice, here.query)
  const current = index != null ? matches[index] : undefined
  const findOnScreen =
    here.open && here.query.trim() !== ''
      ? { needle: here.query.toLowerCase(), current }
      : undefined
  /** Brings a row to the middle without lighting it (find's `scrollToEntryWithoutHighlight`); set by the lines on screen. */
  const revealRef = useRef<(rowId: string) => void>(undefined)
  /** Brings a row to the middle and lights it (`jump`); set by the lines on screen. A line search found goes there (step 4d). */
  const jumpRef = useRef<(rowId: string) => void>(undefined)
  useSearchReveal(store, agentId, jumpRef)

  // ⌘F (Ctrl-F on Windows): the bar, or its field again with its words chosen.
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      // ⌘ on a Mac (where Control-F moves the caret in a field), Control elsewhere.
      const command = apple ? event.metaKey : event.ctrlKey
      if (!command || event.metaKey === event.ctrlKey) return
      if (event.shiftKey || event.altKey) return
      if (event.key.toLowerCase() !== 'f') return
      event.preventDefault()
      if (somethingOver()) return
      setFind((now) => ({ ...now, open: true, focus: now.focus + 1 }))
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])

  /** Next (1) or Previous (-1), round at either end, the row brought to the middle unlit (`stepFind`). */
  const stepFind = (delta: number) => {
    if (index == null) return
    const at = steppedIndex(index, delta, matches.length)
    const match = matches[at]!
    setFind({ ...here, choice: { query: here.query, match, index: at } })
    revealRef.current?.(match.rowId)
  }

  const closeOverlay = useCallback(
    (why: Dismissal) => {
      // Closed by a click: the same button pressed again opens nothing (`closedByClick`).
      if (why === 'click' && overlay)
        closed.current = {
          id: overlay.kind === 'menu' ? overlay.forId : overlay.bubble.id,
          at: Date.now(),
        }
      setOverlay(undefined)
    },
    [overlay],
  )

  const actions = useMemo<MessageActions>(() => {
    const local = (rect: DOMRect): Spot => {
      const box = pane.current!.getBoundingClientRect()
      return {
        left: rect.left - box.left,
        top: rect.top - box.top,
        right: rect.right - box.left,
        bottom: rect.bottom - box.top,
      }
    }
    const bounds = () => ({
      width: pane.current?.clientWidth ?? 0,
      height: pane.current?.clientHeight ?? 0,
    })
    const justClosed = (id: string) =>
      closed.current?.id === id && Date.now() - closed.current.at < reopenGap
    const tapback = (bubble: Bubble, anchor: Element | null | undefined) => {
      if (!pane.current || !anchor) return
      setOverlay({
        kind: 'tapback',
        bubble,
        anchor: local(anchor.getBoundingClientRect()),
        bounds: bounds(),
      })
    }
    const startReply = (bubble: Bubble) => {
      const entry = (store.transcripts[agentId] ?? []).find(
        (line) => line.id === bubble.id,
      )
      setAnswering({
        reply: {
          id: bubble.id,
          line: quoteLine(entry, 72),
          placeholder: replyPlaceholder(entry),
        },
        thread: store.openThreads[agentId],
      })
      setFocusKey((key) => key + 1)
    }
    // The menus (`MessageMenu.show`): More holds Start a thread and Copy; the right click Add reaction, then Reply, Start a thread and Copy. No thread is started inside one.
    const items = (bubble: Bubble, context: boolean): MenuItem[] => {
      const out: MenuItem[] = []
      if (context) {
        out.push({
          label: t('Add reaction'),
          glyph: 'smile',
          action: () =>
            tapback(
              bubble,
              pane.current?.querySelector(
                `[data-bubble-id="${CSS.escape(bubble.id)}"]`,
              ),
            ),
        })
        out.push({
          label: t('Reply'),
          glyph: 'reply',
          separated: true,
          action: () => startReply(bubble),
        })
      }
      if (store.openThreads[agentId] == null)
        out.push({
          label: t('Start a thread'),
          glyph: 'thread',
          action: () => {
            store.openThread(bubble.id, agentId)
            setFocusKey((key) => key + 1)
          },
        })
      out.push({
        label: t('Copy'),
        glyph: 'copy',
        action: () => void copyText(bubble.text).catch(() => {}),
      })
      return out
    }
    return {
      react: (bubble, anchor) => {
        if (!justClosed(bubble.id)) tapback(bubble, anchor)
      },
      reply: startReply,
      more: (bubble, button) => {
        if (justClosed(bubble.id) || !pane.current) return
        const spot = local(button.getBoundingClientRect())
        // 4 under the button, its left edge on the button's, or its right edge for the person's message.
        setOverlay({
          kind: 'menu',
          forId: bubble.id,
          items: items(bubble, false),
          at: {
            x: bubble.fromPerson ? spot.right : spot.left,
            y: spot.bottom + 4,
            endAligned: bubble.fromPerson,
          },
          bounds: bounds(),
        })
      },
      context: (bubble, x, y) => {
        const box = pane.current?.getBoundingClientRect()
        if (!box) return
        setOverlay({
          kind: 'menu',
          forId: bubble.id,
          items: items(bubble, true),
          at: { x: x - box.left, y: y - box.top, endAligned: false },
          bounds: bounds(),
        })
      },
      heldFor:
        overlay?.kind === 'menu'
          ? overlay.forId
          : overlay?.kind === 'tapback' || overlay?.kind === 'picker'
            ? overlay.bubble.id
            : undefined,
    }
  }, [agentId, overlay, store])

  return (
    <section
      className="chat-pane"
      aria-label={agent?.name}
      ref={pane}
      {...(covered ? {} : drop.handlers)}
    >
      {/* Under a call's lines or an exchange (step 5d), the chat, its head and its field take no keys and are not read, as the Mac's covers are modal; find, the sidebar and search stay. */}
      <div
        className={classes('chat-under', covered && 'covered')}
        inert={covered}
      >
        {/* A thread, or back to the chat: the lines on screen start again, at their newest. */}
        <Transcript
          key={threadRoot ?? ''}
          store={store}
          agentId={agentId}
          threadRoot={threadRoot}
          composerHeight={composerHeight}
          bannerHeight={bannerHeight}
          actions={actions}
          find={findOnScreen}
          revealRef={revealRef}
          jumpRef={jumpRef}
          openAgent={onOpenAgent}
        />
        {agent &&
          (threadRoot != null ? (
            <ThreadHeader
              store={store}
              agent={agent}
              title={store.threadTitle(threadRoot, agentId)}
            />
          ) : (
            <ChatHeader store={store} agent={agent} />
          ))}
        {/* Low disk, 8 under the head and in the page's flow: the messages start under it (step 5c). */}
        <DiskBanner
          store={store}
          top={(threadRoot != null ? 44 : 116) + 8}
          onHeight={setBannerHeight}
        />
        <Composer
          store={store}
          agentId={agentId}
          name={agent?.name ?? ''}
          threadRoot={threadRoot}
          reply={reply}
          onCancelReply={() => setAnswering(undefined)}
          focusKey={focusKey}
          onHeight={setComposerHeight}
          staging={staging}
        />
      </div>
      {/* Find's bar, 8 under the head and 16 from the right, over the messages. */}
      {here.open && (
        <FindBar
          // Its own key: the lines' key is the thread's id too, and siblings with one key are not told apart.
          key={`find:${threadRoot ?? ''}`}
          query={here.query}
          focus={here.focus}
          ordinal={index != null ? index + 1 : 0}
          count={matches.length}
          top={(threadRoot != null ? 44 : 116) + 8}
          onQuery={(query) => setFind({ ...here, query })}
          step={stepFind}
          close={() =>
            setFind({
              open: false,
              query: '',
              focus: here.focus,
              thread: threadRoot,
            })
          }
        />
      )}
      {overlay?.kind === 'menu' && (
        <PopMenu
          items={overlay.items}
          at={overlay.at}
          bounds={overlay.bounds}
          close={closeOverlay}
        />
      )}
      {overlay?.kind === 'tapback' && (
        <TapbackCapsule
          bubble={overlay.bubble}
          anchor={overlay.anchor}
          bounds={overlay.bounds}
          pick={(emoji) => void store.react(emoji, overlay.bubble.id, agentId)}
          more={() =>
            setOverlay({
              kind: 'picker',
              bubble: overlay.bubble,
              anchor: overlay.anchor,
              bounds: overlay.bounds,
            })
          }
          close={closeOverlay}
        />
      )}
      {overlay?.kind === 'picker' && (
        <EmojiPicker
          mine={overlay.bubble.myReactions}
          anchor={overlay.anchor}
          bounds={overlay.bounds}
          pick={(emoji) => void store.react(emoji, overlay.bubble.id, agentId)}
          close={closeOverlay}
        />
      )}
      {drop.dropping && !covered && <DropOverlay />}
      {/* A call's lines (under the agent's own head) or two agents' exchange, over the chat and its field (step 5d). */}
      <ChatCoverView
        store={store}
        agentId={agentId}
        head={agent && <ChatHeader store={store} agent={agent} />}
      />
    </section>
  )
}

/**
 * The chat's head (`header`, 116 high, padded 4 12 28 8): the ground at 78%
 * over a blur, fading out over its last 30 points; the agent's picture (52)
 * over its name in a pill (13, medium).
 */
function ChatHeader({ store, agent }: { store: AppStore; agent: Agent }) {
  const model = useWindowModel()
  // Both open the agent's pane on Profile, and close it when it shows (`toggleSettings`).
  return (
    <header className="chat-header">
      <div className="veil" aria-hidden="true" />
      <div className="identity">
        <button
          type="button"
          className="identity-button"
          aria-label={t('View agent settings')}
          onClick={() => model.toggleSettings()}
        >
          <AgentMark agent={agent} agents={store.agents} size={52} />
        </button>
        {/* The phone beside the name while calls are on (step 5d). */}
        <CallHeadRow store={store} agent={agent}>
          <button
            type="button"
            className="identity-button name-pill"
            title={agent.name}
            aria-label={t('View agent settings')}
            onClick={() => model.toggleSettings()}
          >
            {agent.name}
          </button>
        </CallHeadRow>
      </div>
    </header>
  )
}

/**
 * A thread's head (`ThreadHeader`, 44 high on the ground, padded 0 12 0 8):
 * the chat's picture (20) and name going back to the chat, a chevron, and
 * the thread's first message cut to one line.
 */
function ThreadHeader({
  store,
  agent,
  title,
}: {
  store: AppStore
  agent: Agent
  title: string
}) {
  const model = useWindowModel()
  return (
    <header className="thread-header" aria-label={t('Thread breadcrumb')}>
      <button
        type="button"
        className="crumb"
        title={t`Back to ${agent.name}`}
        aria-label={t`Back to ${agent.name}`}
        onClick={() => store.closeThread(agent.id)}
      >
        <AgentMark agent={agent} agents={store.agents} size={20} />
        <span>{agent.name}</span>
      </button>
      <Chevron />
      <button
        type="button"
        className="crumb title"
        aria-label={t('View conversation details')}
        onClick={() => model.toggleDetails()}
      >
        {title}
      </button>
    </header>
  )
}

function Chevron({ down = false }: { down?: boolean }) {
  return (
    <svg
      className="chevron"
      width="12"
      height="12"
      viewBox="0 0 12 12"
      aria-hidden="true"
    >
      <path
        d={down ? 'M3 4.5 6 7.5l3-3' : 'M4.5 3 7.5 6l-3 3'}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** A chat or thread with no rows yet, and no runs: one of each, so a redraw sees no change. */
const noRows: readonly ChatRow[] = []
const noRuns: Record<string, RunFlags> = {}

/** Within 4 points of the bottom is at the newest (the window's pin, `lht`). */
const pinGap = 4

/**
 * The messages (`sand-virtual-transcript`): 16 in from each side, 116 down
 * from the top and over the message field, opening at the newest. At the
 * newest the chat is held there, and anything new keeps it there; scrolling
 * up lets go, and back down holds it again. Scrolled near the top, older
 * lines are read. Read further up, ⌄ goes to the newest with what came
 * meanwhile; a message of the person's own goes there wherever the chat was.
 */
function Transcript({
  store,
  agentId,
  threadRoot,
  composerHeight,
  bannerHeight,
  actions,
  find,
  revealRef,
  jumpRef,
  openAgent,
}: {
  store: AppStore
  agentId: string
  threadRoot?: string
  composerHeight: number
  /** Low disk's height and the 8 under it, or 0 (step 5c). */
  bannerHeight: number
  actions: MessageActions
  /** What find lights: its words in small letters, and the match it stands on. */
  find?: { needle: string; current?: FindMatch }
  revealRef: React.RefObject<((rowId: string) => void) | undefined>
  jumpRef: React.RefObject<((rowId: string) => void) | undefined>
  openAgent: (agentId: string) => void
}) {
  const rows =
    threadRoot != null
      ? (store.threadRows[agentId] ?? noRows)
      : store.rows(agentId)
  const runs = threadRoot != null ? noRuns : (store.runFlags[agentId] ?? noRuns)
  const agent = store.agent(agentId)
  const scroller = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)
  const [atNewest, setAtNewest] = useState(true)
  /** The newest row while the chat was last at its newest: the agents' messages after it are what came meanwhile, counted on ⌄. */
  const [seenUpTo, setSeenUpTo] = useState<string>()
  const [lit, setLit] = useState<string>()
  const [column, setColumn] = useState(0)
  const last = useRef<{
    drawn: boolean
    firstId?: string
    lastId?: string
    height: number
  }>({ drawn: false, height: 0 })

  const toNewest = useCallback((smooth: boolean) => {
    const element = scroller.current
    if (!element) return
    pinned.current = true
    setAtNewest(true)
    element.scrollTo({
      top: element.scrollHeight,
      behavior: smooth ? 'smooth' : 'auto',
    })
  }, [])

  // New rows: held at the newest while pinned; older lines read in above keep what was on screen where it was.
  useLayoutEffect(() => {
    const element = scroller.current
    if (!element) return
    const before = last.current
    const firstId = rows[0]?.id
    const lastId = rows[rows.length - 1]?.id
    if (!before.drawn || pinned.current) {
      element.scrollTop = element.scrollHeight
    } else if (firstId !== before.firstId && lastId === before.lastId) {
      element.scrollTop += element.scrollHeight - before.height
    } else if (lastId !== before.lastId && before.lastId != null) {
      const from = rows.findIndex((row) => row.id === before.lastId)
      const added = from >= 0 ? rows.slice(from + 1) : []
      // A message of the person's own just went out: to the newest, wherever the chat was (28 October 2026).
      // Held at the newest from here; the scroll's own events say so on screen.
      if (added.some((row) => row.kind === 'bubble' && row.bubble.fromPerson)) {
        pinned.current = true
        element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' })
      }
    }
    last.current = {
      drawn: true,
      firstId,
      lastId,
      height: element.scrollHeight,
    }
  }, [rows, toNewest])

  // Longer content (a picture loaded, a message unfolded, a taller field) keeps the newest in view while pinned.
  useEffect(() => {
    const element = scroller.current
    const inner = content.current
    if (!element || !inner) return
    const observer = new ResizeObserver(() => {
      if (pinned.current) element.scrollTop = element.scrollHeight
      last.current.height = element.scrollHeight
      setColumn(Math.max(0, element.clientWidth - 32))
    })
    observer.observe(inner)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const onScroll = () => {
    const element = scroller.current
    if (!element) return
    const gap = element.scrollHeight - element.scrollTop - element.clientHeight
    // A jump's scroll under way leaves the newest line, though its first steps are still near it.
    if (!jumping.current) pinned.current = gap <= pinGap
    if (pinned.current !== atNewest) setAtNewest(pinned.current)
    const newest = rows[rows.length - 1]?.id
    if (pinned.current && seenUpTo !== newest) setSeenUpTo(newest)
    // Near its top: the hundred lines before.
    if (
      element.scrollTop < 400 &&
      threadRoot == null &&
      store.olderBefore[agentId] != null
    )
      void store.loadOlder(agentId)
  }

  /**
   * A row brought to the middle: the chat holds its newest line no more,
   * even while the scroll's first steps are still near it (a far one, a
   * found line or a quote, was taken back to the newest). Once the scroll
   * ends (or nothing moved, or after 3 s) the chat reads where it stands
   * again, holding the newest line when it landed there (ChatPane.swift's
   * `follow`). A later jump ends an earlier one's watch.
   */
  const jumping = useRef(false)
  const jumpWatch = useRef<() => void>(undefined)
  const settle = useRef<() => void>(undefined)
  const scrollToRow = useCallback((element: Element) => {
    jumpWatch.current?.()
    const box = scroller.current
    pinned.current = false
    setAtNewest(false)
    jumping.current = true
    const startTop = box?.scrollTop
    let watching = true
    const stopWatching = () => {
      if (!watching) return
      watching = false
      clearTimeout(timer)
      clearTimeout(still)
      box?.removeEventListener('scrollend', ended)
      jumpWatch.current = undefined
    }
    const ended = () => {
      stopWatching()
      jumping.current = false
      settle.current?.()
    }
    const timer = setTimeout(ended, 3_000)
    // Already in place: no scroll starts, so no scroll ends.
    const still = setTimeout(() => {
      if (box && box.scrollTop === startTop) ended()
    }, 150)
    box?.addEventListener('scrollend', ended)
    jumpWatch.current = stopWatching
    element.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [])
  useEffect(() => () => jumpWatch.current?.(), [])
  useLayoutEffect(() => {
    settle.current = onScroll
  })

  const jump = useCallback(
    (rowId: string) => {
      const element = scroller.current?.querySelector(
        `[data-row-id="${CSS.escape(rowId)}"]`,
      )
      if (!element) return
      scrollToRow(element)
      // Lit in the warning yellow at 22%, then it fades (`sand-12cjh1l`).
      setLit(rowId)
      setTimeout(
        () => setLit((now) => (now === rowId ? undefined : now)),
        2_500,
      )
    },
    [scrollToRow],
  )

  // Find's step: the row to the middle, unlit, letting go of the newest.
  useEffect(() => {
    revealRef.current = (rowId: string) => {
      const element = scroller.current?.querySelector(
        `[data-row-id="${CSS.escape(rowId)}"]`,
      )
      if (!element) return
      scrollToRow(element)
    }
    return () => {
      revealRef.current = undefined
    }
  }, [revealRef, scrollToRow])
  useEffect(() => {
    jumpRef.current = jump
    return () => {
      jumpRef.current = undefined
    }
  }, [jump, jumpRef])

  // The agent at work: the words beside its picture under the messages; none while it waits on an ask to use this PC (`Le`: the Allow card says it).
  const asking = agent ? store.localAsk(agent.id) != null : false
  const activity = useMemo(
    () =>
      agent && !asking
        ? activityLine(agent, (id) => store.agent(id)?.name)
        : undefined,
    [agent, asking, store],
  )

  const unseen = useMemo(() => {
    if (atNewest || seenUpTo == null) return 0
    const from = rows.findIndex((row) => row.id === seenUpTo)
    return from < 0
      ? 0
      : rows
          .slice(from + 1)
          .filter((row) => row.kind === 'bubble' && !row.bubble.fromPerson)
          .length
  }, [atNewest, seenUpTo, rows])

  const shownIds = useMemo(
    () =>
      new Set(rows.flatMap((row) => (row.kind === 'bubble' ? [row.id] : []))),
    [rows],
  )
  // A message's "N replies" joins it; one under a card stays its own row.
  const threads = useMemo(() => {
    const out = new Map<string, number>()
    for (const row of rows)
      if (row.kind === 'thread' && shownIds.has(row.rootId))
        out.set(row.rootId, row.count)
    return out
  }, [rows, shownIds])
  // The agents a message can name, as the store notes them (`noteNames`): every one but the groups.
  const agents = store.agents
  const names = useMemo(
    () =>
      agents
        .filter((one) => !one.isGroup)
        .map((one) => ({ name: one.name.trim(), id: one.id })),
    [agents],
  )
  const control = useMemo<ChatControl>(
    () => ({
      store,
      agentId,
      threadRoot,
      shownIds,
      jump,
      lit,
      column,
      actions,
      names,
      openAgent,
    }),
    [
      store,
      agentId,
      threadRoot,
      shownIds,
      jump,
      lit,
      column,
      actions,
      names,
      openAgent,
    ],
  )

  return (
    <Control.Provider value={control}>
      <div className="transcript" ref={scroller} onScroll={onScroll}>
        <div
          className="transcript-rows"
          ref={content}
          style={{
            // Under the head, and under low disk while it shows (step 5c).
            paddingTop: (threadRoot != null ? 44 : 116) + bannerHeight,
            // Over the message field: its frame and 28 (the working line's 40 is in its slot).
            paddingBottom: composerHeight + 28,
          }}
        >
          {rows.map((row, at) =>
            row.kind === 'thread' && threads.has(row.rootId) ? null : (
              <FindContext.Provider
                key={row.id}
                value={
                  find
                    ? new FindMarks(
                        find.needle,
                        find.current?.rowId === row.id
                          ? find.current.occurrence
                          : undefined,
                      )
                    : undefined
                }
              >
                <TranscriptRow
                  row={row}
                  run={runs[row.id] ?? noRun}
                  isGroup={agent?.isGroup ?? false}
                  threadCount={threads.get(row.id)}
                  // Under the last message while the agent works, the working line meets its bubble (`isIndicatorSeamingBubble`).
                  seamsBelow={activity != null && at === rows.length - 1}
                />
              </FindContext.Provider>
            ),
          )}
          <ActivitySlot store={store} agent={agent} line={activity} />
        </div>
      </div>
      {!atNewest && (
        <button
          type="button"
          className="to-newest glass-disc"
          style={{ bottom: composerHeight + 26 }}
          title={t('Jump to latest')}
          aria-label={t('Jump to latest')}
          onClick={() => toNewest(true)}
        >
          <Chevron down />
          {unseen > 0 && <span className="unseen">{unseen}</span>}
        </button>
      )}
    </Control.Provider>
  )
}

/**
 * One row (`sand-transcript-row`, padded 2 above and below): on the right
 * for the person, on the left for an agent, in the middle for a time, the
 * "New" line and the chat's events. A message or card that starts a group
 * sits 12 lower.
 */
function TranscriptRow({
  row,
  run,
  isGroup,
  threadCount,
  seamsBelow,
}: {
  row: ChatRow
  run: RunFlags
  isGroup: boolean
  threadCount?: number
  seamsBelow: boolean
}) {
  const control = useControl()
  const side = row.kind === 'notice' ? 'middle' : rowSideClass(row)
  return (
    <div
      className={classes(
        'transcript-row',
        side,
        control.lit === row.id && 'lit',
      )}
      data-row-id={row.id}
    >
      <RowContent
        row={row}
        run={run}
        isGroup={isGroup}
        threadCount={threadCount}
        seamsBelow={seamsBelow}
      />
    </div>
  )
}

function rowSideClass(row: ChatRow): string {
  switch (row.kind) {
    case 'bubble':
      return row.bubble.fromPerson ? 'person' : 'agent'
    case 'file':
      return row.fromPerson ? 'person' : 'agent'
    case 'failedSend':
    case 'queuedSend':
      return 'person'
    case 'thread':
      return row.side === 'person'
        ? 'person'
        : row.side === 'middle'
          ? 'middle'
          : 'agent'
    case 'card':
      return 'agent'
    default:
      return 'middle'
  }
}

function RowContent({
  row,
  run,
  isGroup,
  threadCount,
  seamsBelow,
}: {
  row: ChatRow
  run: RunFlags
  isGroup: boolean
  threadCount?: number
  seamsBelow: boolean
}) {
  const control = useControl()
  switch (row.kind) {
    case 'stamp':
      return <div className="stamp">{stampText(row.date)}</div>
    case 'unread':
      return (
        <div className="unread-divider" aria-label={t('New messages')}>
          <span className="hairline" />
          <span className="new">{t('New')}</span>
          <span className="hairline" />
        </div>
      )
    case 'bubble':
      return (
        <BubbleRow
          bubble={row.bubble}
          run={run}
          isGroup={isGroup}
          threadCount={threadCount}
          seamsBelow={seamsBelow}
        />
      )
    case 'file':
      return (
        <FileCard
          name={row.name}
          url={row.url}
          agentId={control.agentId}
          store={control.store}
          column={control.column}
          startsGroup={run.startsGroup}
        />
      )
    case 'teammates':
      // Step 5d's: the chip opens their messages over the chat, or a menu of them.
      return (
        <div className="system-event">
          <span className="label">{exchangeLabel(row.exchange)}</span>
          <ExchangeChip
            store={control.store}
            agentId={control.agentId}
            exchange={row.exchange}
          />
        </div>
      )
    case 'routines':
      return (
        <RoutinesLine
          action={row.action}
          routines={row.routines}
          agentId={control.agentId}
        />
      )
    case 'voiceCall':
      // Step 5d's: an ended call with words opens them over the chat.
      return (
        <CallLineRow
          store={control.store}
          agentId={control.agentId}
          id={row.id}
          seconds={row.seconds}
          lines={row.lines}
          live={row.live}
        />
      )
    case 'notice':
      return (
        <div className="notice">
          <Marked words={row.text} />
        </div>
      )
    case 'failedSend':
      return (
        <div className="send-state">
          <span className="failed">{t('Failed to send')}</span>
          <button
            type="button"
            className="link-button"
            onClick={() =>
              void control.store.resend(row.nonce, control.agentId)
            }
          >
            {t('Resend')}
          </button>
          <button
            type="button"
            className="quiet-link"
            onClick={() =>
              control.store.discardFailed(row.nonce, control.agentId)
            }
          >
            {t('Delete')}
          </button>
        </div>
      )
    case 'queuedSend':
      return (
        <div className="send-state">
          <span className="waiting">
            {control.store.isLive
              ? t('Waiting to send…')
              : t('Will send when reconnected')}
          </span>
          <button
            type="button"
            className="link-button"
            onClick={() =>
              control.store.cancelQueued(row.nonce, control.agentId)
            }
          >
            {t('Cancel')}
          </button>
        </div>
      )
    case 'thread':
      // Under a card: the chip on its own.
      return (
        <ThreadChin rootId={row.rootId} count={row.count} attached={false} />
      )
    case 'card':
      return <CardRow row={row} startsGroup={run.startsGroup} />
  }
}

/** Each card's widest, as the Mac's chat sets it (`limit(…)` in ChatPane.swift's `TranscriptRow`). */
const cardCaps: Record<CardKind, number> = {
  question: 640,
  draft: 640,
  approval: 520,
  secret: 640,
  computer: 520,
  form: 520,
  credential: 520,
  onePasswordConnect: 520,
  storeEntry: 460,
  connectors: 640,
  listenerConnect: 520,
  cloudAgent: 640,
  joined: 460,
  flights: 680,
  flightPassengers: 520,
  purchase: 520,
  products: 640,
}

/** A card in its place: as wide as a message may be, at most its own cap. */
function CardRow({
  row,
  startsGroup,
}: {
  row: Extract<ChatRow, { kind: 'card' }>
  startsGroup: boolean
}) {
  const control = useControl()
  const card: CardProps = {
    entry: row.entry,
    entryId: row.entry.id,
    agentId: control.agentId,
    store: control.store,
    column: control.column,
    openAgent: control.openAgent,
  }
  const view = cardView(row.card, card)
  // A card whose line can't be read is said in the chat's middle, as the
  // core makes it a notice (`unreadCardWords`).
  if (view == null)
    return (
      <div className="notice card-notice">
        {unreadCardWords(row.card, row.entry)}
      </div>
    )
  return (
    <div
      className={classes('card-row', startsGroup && 'starts-group')}
      style={{ maxWidth: cardWidth(control.column, cardCaps[row.card]) }}
    >
      {view}
    </div>
  )
}

/** The card for a row, from its group's file; none when the entry doesn't read as one. */
function cardView(kind: CardKind, card: CardProps): React.ReactNode {
  const props = {
    entryId: card.entryId,
    agentId: card.agentId,
    store: card.store,
  }
  switch (kind) {
    case 'question': {
      const read = questionCard(card.entry)
      return read && <QuestionCardView {...props} card={read} />
    }
    case 'draft': {
      const read = draftCard(card.entry)
      return read && <DraftCardView {...props} card={read} />
    }
    case 'approval': {
      const read = approvalCard(card.entry)
      return read && <ApprovalCardView {...props} card={read} />
    }
    // 3b: what an agent asks of the person (RequestCards.tsx).
    case 'secret':
    case 'computer':
    case 'form':
    case 'credential':
    case 'onePasswordConnect':
    case 'storeEntry':
      return requestCardView(kind, card)
    // 3c: apps to connect, Slack or GitHub for a routine, the cloud agent, a new teammate (ConnectCards.tsx).
    case 'connectors':
    case 'listenerConnect':
    case 'cloudAgent':
    case 'joined':
      return connectCardView(kind, card)
    // 3d: flights and the travellers' form (FlightCards.tsx).
    case 'flights':
    case 'flightPassengers':
      return flightCardView(kind, card)
    // 3d: a checkout and products to buy (ShopCards.tsx).
    case 'purchase':
    case 'products':
      return shopCardView(kind, card)
  }
}

/**
 * A line of routines made or changed (mac/Simeon/ChatPane.swift's
 * `RoutinesLine`): one or two chips, joined by "and", three or more as a
 * count. A routine's chip opens the agent's pane on Routines with its
 * editor (`KPn`); the count opens a menu of them where the pointer is
 * (`YPn`).
 */
function RoutinesLine({
  action,
  routines,
  agentId,
}: {
  action: string
  routines: RoutineRef[]
  agentId: string
}) {
  const model = useWindowModel()
  const [list, setList] = useState<{ x: number; y: number }>()
  const open = (id: string) => model.openRoutineFor(id, agentId)
  if (routines.length >= 3)
    return (
      <div className="system-event">
        <span className="label">{routineVerb(action)}</span>
        <button
          type="button"
          className="event-chip routine-chip"
          title={t`${routines.length} routines, show list`}
          aria-label={t`${routines.length} routines, show list`}
          aria-haspopup="menu"
          onClick={(event) => {
            // From the keys (Return, Space) there is no pointer: the list opens under the chip.
            if (event.detail === 0) {
              const chip = event.currentTarget.getBoundingClientRect()
              setList({ x: chip.left, y: chip.bottom + 4 })
            } else setList({ x: event.clientX, y: event.clientY })
          }}
        >
          <Clock />
          <span className="chip-title">{t`${routines.length} routines`}</span>
        </button>
        {list && (
          <ContextMenu
            at={list}
            close={() => setList(undefined)}
            items={routines.map((routine) => ({
              label: routine.name,
              glyph: 'clock',
              action: () => open(routine.id),
            }))}
          />
        )}
      </div>
    )
  return (
    <div className="system-event">
      <span className="label">{routineLabel(action, routines.length)}</span>
      {routines.map((routine, index) => (
        <span key={routine.id} className="routine">
          {index > 0 && <span className="label">{t('and')}</span>}
          <button
            type="button"
            className="event-chip routine-chip"
            title={t`Open routine ${routine.name}`}
            aria-label={t`Open routine ${routine.name}`}
            onClick={() => open(routine.id)}
          >
            <Clock />
            <span className="chip-title">{routine.name}</span>
          </button>
        </span>
      ))}
    </div>
  )
}

function Clock() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <circle
        cx="8"
        cy="8"
        r="5.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path
        d="M8 5v3.2l2 1.3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

/**
 * Under a message that has replies (`ThreadChin`): "2 replies" with a
 * chevron, "View thread" under the pointer. Joined under its bubble as a
 * chin, or a small pill of its own when the message has reactions.
 */
function ThreadChin({
  rootId,
  count,
  attached,
}: {
  rootId: string
  count: number
  attached: boolean
}) {
  const control = useControl()
  // The Mac writes "1 reply" as it is, in every language; the catalogue's plural says "1 réponse" (PROGRESS.md, 2a part 2).
  const replies =
    count === 1 && languageCode(wordsLanguage()) === english
      ? '1 reply'
      : t`${count} replies`
  return (
    <button
      type="button"
      className={attached ? 'thread-chin attached' : 'thread-chin'}
      aria-label={t`View thread, ${replies}`}
      onClick={() => control.store.openThread(rootId, control.agentId)}
    >
      <span className="replies">{replies}</span>
      <span className="view">{t('View thread')}</span>
      <Chevron />
    </button>
  )
}

/** One or two characters (`Tpt`): the bubble at least 36 wide, its words centred. */
const isShort = (bubble: Bubble, trimmed: string) =>
  bubble.channel == null && trimmed !== '' && trimmed.length <= 2

/**
 * A message (`BubbleRow`): the person's on the right in the window's blue,
 * an agent's on the left in grey with a hairline and a soft shadow, at most
 * 88% of the column, 640, or the column less 82. In a group the agents'
 * messages sit 30 in, the author's name over the first of a run and their
 * picture (22) beside the last. A run's bubbles meet at 6-point corners.
 * Reactions hang under the message's right end; a thread's chip joins it.
 */
function BubbleRow({
  bubble,
  run,
  isGroup,
  threadCount,
  seamsBelow,
}: {
  bubble: Bubble
  run: RunFlags
  isGroup: boolean
  threadCount?: number
  seamsBelow: boolean
}) {
  const control = useControl()
  const message = (
    <Message
      bubble={bubble}
      run={run}
      isGroup={isGroup}
      threadCount={threadCount}
      seamsBelow={seamsBelow}
    />
  )
  if (bubble.fromPerson || !isGroup) {
    return (
      <div
        className={run.startsGroup ? 'bubble-row starts-group' : 'bubble-row'}
      >
        {message}
      </div>
    )
  }
  const member = bubble.author
    ? control.store.agent(bubble.author.id)
    : undefined
  return (
    <div
      className={
        run.startsGroup && !bubble.showsName
          ? 'bubble-row group starts-group'
          : 'bubble-row group'
      }
    >
      <span className="gutter">
        {bubble.showsAvatar && member && (
          <AgentMark agent={member} agents={control.store.agents} size={22} />
        )}
      </span>
      <div className="group-column">
        {bubble.showsName && bubble.author && (
          <span className="author">{bubble.author.name}</span>
        )}
        {message}
      </div>
    </div>
  )
}

function Message({
  bubble,
  run,
  isGroup,
  threadCount,
  seamsBelow,
}: {
  bubble: Bubble
  run: RunFlags
  isGroup: boolean
  threadCount?: number
  seamsBelow: boolean
}) {
  const control = useControl()
  const words = bubble.text.trim()
  const chinJoined = threadCount != null && bubble.reactions.length === 0
  const showsWords = words !== '' || bubble.images.length === 0
  const quoteTarget = bubble.replyTo
  return (
    <div
      className={bubble.fromPerson ? 'message mine' : 'message'}
      onContextMenu={(event) => {
        // A link keeps the browser's own menu (open it, copy its address); the rest of the message is its menu's.
        if ((event.target as Element).closest('a')) return
        event.preventDefault()
        control.actions.context(bubble, event.clientX, event.clientY)
      }}
    >
      {/* In a thread, a reply to its first message carries no quote. */}
      {bubble.quote != null &&
        quoteTarget != null &&
        quoteTarget !== control.threadRoot && (
          <ReplyQuote words={bubble.quote} target={quoteTarget} />
        )}
      {bubble.loneLink != null ? (
        <div className="bubble-stack">
          <LinkCard
            link={bubble.loneLink}
            column={control.column - (isGroup && !bubble.fromPerson ? 30 : 0)}
            bubbleId={bubble.id}
          >
            <HoverBar bubble={bubble} actions={control.actions} />
          </LinkCard>
          {bubble.reactions.length > 0 && <ReactionPills bubble={bubble} />}
        </div>
      ) : (
        showsWords && (
          <div className="bubble-stack">
            <Shaped
              bubble={bubble}
              run={run}
              isGroup={isGroup}
              chinJoined={chinJoined}
              threadCount={threadCount}
              seamsBelow={seamsBelow}
            />
            {bubble.reactions.length > 0 && <ReactionPills bubble={bubble} />}
          </div>
        )
      )}
      {(!chinJoined || bubble.loneLink != null) && threadCount != null && (
        <ThreadChin rootId={bubble.id} count={threadCount} attached={false} />
      )}
      {bubble.images.length > 0 && (
        <PictureStrip
          images={bubble.images}
          alone={words === ''}
          column={control.column - (isGroup && !bubble.fromPerson ? 30 : 0)}
        />
      )}
    </div>
  )
}

/** The line a reply answers, over its message (`ReplyQuote`): an arrow and the line, 13, at 40%. */
function ReplyQuote({ words, target }: { words: string; target: string }) {
  const control = useControl()
  const shown = control.shownIds.has(target)
  const label = shown ? t('Jump to replied message') : t('Open reply thread')
  return (
    <button
      type="button"
      className="reply-quote"
      title={label}
      aria-label={label}
      onClick={() => {
        if (shown) control.jump(target)
        else {
          const root = control.store.threadRootOf(target, control.agentId)
          if (root != null) control.store.openThread(root, control.agentId)
        }
      }}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
        <path
          d="M5.5 3.5 2.5 6.5l3 3M2.5 6.5H8a3.5 3.5 0 0 1 3.5 3.5v.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span>{words}</span>
    </button>
  )
}

function Shaped({
  bubble,
  run,
  isGroup,
  chinJoined,
  threadCount,
  seamsBelow,
}: {
  bubble: Bubble
  run: RunFlags
  isGroup: boolean
  chinJoined: boolean
  threadCount?: number
  /** The working line under it meets it at a 6-point corner. */
  seamsBelow: boolean
}) {
  const control = useControl()
  const trimmed = bubble.text.trim()
  const short = isShort(bubble, trimmed)
  const bar = <HoverBar bubble={bubble} actions={control.actions} />
  // An emoji on its own: 32 on 38, no bubble.
  if (isOneEmoji(trimmed) && bubble.channel == null)
    return (
      <div className="lone-emoji" data-bubble-id={bubble.id}>
        {trimmed}
        {bar}
      </div>
    )
  const r = (value: number) => `${value}px`
  let radius: string
  if (bubble.fromPerson) {
    radius = [
      18,
      run.continuesPrevious ? 6 : 18,
      chinJoined ? 0 : run.continuesNext ? 6 : 18,
      chinJoined ? 0 : 18,
    ]
      .map(r)
      .join(' ')
  } else {
    // A run's bubbles meet at 6-point corners; so does the one beside its author's picture in a group.
    const joinsBelow =
      run.continuesNext ||
      (seamsBelow && bubble.reactions.length === 0) ||
      (isGroup && bubble.showsAvatar)
    radius = [
      run.continuesPrevious ? 6 : 18,
      18,
      chinJoined ? 0 : 18,
      chinJoined ? 0 : joinsBelow ? 6 : 18,
    ]
      .map(r)
      .join(' ')
  }
  return (
    <div className="shaped">
      <div
        className={classes(
          'bubble',
          bubble.fromPerson ? 'yours' : 'theirs',
          short && 'short',
        )}
        style={{ borderRadius: radius }}
        data-bubble-id={bubble.id}
      >
        {bubble.fromPerson ? (
          <FoldingText words={bubble.text} centred={short} />
        ) : (
          <AgentWords bubble={bubble} />
        )}
        {bubble.channel && (
          <span
            className="channel-tag"
            title={channelTitle(bubble.channel)}
            aria-label={channelTitle(bubble.channel)}
          >
            <span aria-hidden="true">{bubble.channel.inbound ? '↓' : '↑'}</span>
            {bubble.channel.platform}
          </span>
        )}
        {bar}
      </div>
      {chinJoined && threadCount != null && (
        <ThreadChin rootId={bubble.id} count={threadCount} attached />
      )}
    </div>
  )
}

/** An agent's words, the names in them read as its own (`speaker`, `introducing`) and the person's name left plain. */
function AgentWords({ bubble }: { bubble: Bubble }) {
  const control = useControl()
  const { store, names, openAgent, agentId } = control
  const personName = store.account?.name
  const speaker = bubble.author?.id ?? agentId
  const setting = useMemo<MentionSetting>(
    () => ({
      agents: names,
      personName,
      speaker,
      introducing: bubble.introduces,
      picture: (id) => {
        const agent = store.agent(id)
        return agent ? pictureURL(agent) : undefined
      },
      open: openAgent,
    }),
    [names, personName, speaker, bubble.introduces, store, openAgent],
  )
  // A call written by a host from before 2 October 2026: its record, opening on its recap (step 5d, `CallRecordView`).
  const record = parseCallRecord(bubble.text)
  if (record) return <CallRecordView {...record} />
  return (
    <MentionContext.Provider value={setting}>
      <MessageBlocks markdown={bubble.text} />
    </MentionContext.Provider>
  )
}

/** The person's words in their bubble, folded at 160 when longer, with Show more under them and Show less once open. */
function FoldingText({ words, centred }: { words: string; centred: boolean }) {
  const box = useRef<HTMLDivElement>(null)
  const [folds, setFolds] = useState(false)
  const [open, setOpen] = useState(false)
  useLayoutEffect(() => {
    const element = box.current
    if (!element) return
    const measure = () => setFolds(element.scrollHeight > 161)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [words])
  return (
    <div className="folding">
      <div
        ref={box}
        className={centred ? 'person-words centred' : 'person-words'}
        style={
          folds && !open ? { maxHeight: 160, overflow: 'hidden' } : undefined
        }
      >
        <Marked words={words} />
      </div>
      {folds && (
        <button
          type="button"
          className="show-more"
          onClick={() => setOpen(!open)}
        >
          {open ? t('Show less') : t('Show more')}
          <Chevron down={!open} />
        </button>
      )}
    </div>
  )
}

/**
 * The reactions under a message (`ReactionPills`): each emoji once, with how
 * many when more than one, on a pale pill ringed with the ground, 22 high;
 * the person's own on a pale blue.
 */
function ReactionPills({ bubble }: { bubble: Bubble }) {
  const control = useControl()
  const counts = new Map<string, number>()
  for (const emoji of bubble.reactions)
    counts.set(emoji, (counts.get(emoji) ?? 0) + 1)
  return (
    <div className="reaction-pills">
      {/* A click on one adds the person's own, or takes it back (`ReactionPills`). */}
      {[...counts].map(([emoji, count]) => {
        const mine = bubble.myReactions.includes(emoji)
        const label = mine
          ? t`Remove your ${emoji} reaction`
          : t`Toggle your ${emoji} reaction`
        return (
          <button
            key={emoji}
            type="button"
            className={mine ? 'reaction mine' : 'reaction'}
            aria-label={label}
            onClick={() =>
              void control.store.react(emoji, bubble.id, control.agentId)
            }
          >
            <span className="emoji">{emoji}</span>
            {count > 1 && <span className="count">{count}</span>}
          </button>
        )
      })}
    </div>
  )
}

/** One picture's size (`PictureStrip.single`): its width up to 320, at most 200 high, its shape kept. */
function single(
  image: ChatImage,
  limit: number,
): { width: number; height: number } {
  const widest = Math.max(0, Math.min(320, limit))
  if (image.width == null || image.height == null)
    return { width: widest, height: Math.min(200, widest) }
  const ratio = image.width / image.height
  let width = Math.min(image.width, widest)
  let height = width / ratio
  if (height > 200) {
    height = 200
    width = height * ratio
  }
  return { width: Math.round(width), height: Math.round(height) }
}

/** An agent's or the person's pictures (`PictureStrip`): one alone at its own size, several in a row 192 high, 6 apart. */
function PictureStrip({
  images,
  alone,
  column,
}: {
  images: ChatImage[]
  alone: boolean
  /** The messages' column: the chat's width less its sides (30 less in a group). */
  column: number
}) {
  // As wide as 86% of the column, 560, or the column less 82 (the Mac's `PictureStrip` limit).
  const limit = Math.max(0, Math.min(column * 0.86, 560, column - 82))
  let sizes: { width: number; height: number }[]
  if (alone && images.length === 1) sizes = [single(images[0]!, limit)]
  else {
    const ratios = images.map((image) =>
      image.width && image.height ? image.width / image.height : 1,
    )
    const sum = ratios.reduce((a, b) => a + b, 0)
    const gaps = Math.max(0, images.length - 1) * 6
    const natural = sum * 192
    const height =
      natural + gaps > limit && natural > 0
        ? Math.max(48, (limit - gaps) / sum)
        : 192
    sizes = ratios.map((ratio) => ({
      width: Math.round(height * ratio),
      height: Math.round(height),
    }))
  }
  // A picture opens full screen, the others beside it.
  const control = useControl()
  const openMedia = useOpenMedia()
  const open = (index: number) =>
    openMedia?.(
      images.map((image) => ({
        url: image.url,
        agentId: control.agentId,
        caption: image.alt === '' ? undefined : image.alt,
      })),
      index,
    )
  return (
    <div className={alone ? 'picture-strip' : 'picture-strip under-words'}>
      {images.map((image, index) => (
        <Picture
          key={image.url + index}
          image={image}
          size={sizes[index]!}
          open={() => open(index)}
        />
      ))}
    </div>
  )
}

function Picture({
  image,
  size,
  open,
}: {
  image: ChatImage
  size: { width: number; height: number }
  open: () => void
}) {
  const control = useControl()
  const shown = useShownPicture(image, control.store, control.agentId)
  return (
    <button
      type="button"
      className="chat-picture"
      style={{ width: size.width, height: size.height }}
      aria-label={
        fileKind(image.url) === 'video'
          ? t('Open video full screen')
          : t('Open image full screen')
      }
      onClick={open}
    >
      {shown && <img src={shown} alt={image.alt} />}
    </button>
  )
}
