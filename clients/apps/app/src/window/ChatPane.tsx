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
// Still to come, each with its part (docs/web-app/PROGRESS.md): find, the
// agent's working line, the motion of a line coming in, the time on a
// sideways swipe, two agents' messages and a call's lines opened over the
// chat (2b);
// the pictures from the computer, files' kinds, sizes and Save, link cards,
// previews (2c); the call button (step 5); the cards (step 3); the agent's
// pane opened from the head (step 4).

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
import {
  type Bubble,
  type ChatImage,
  type ChatRow,
  channelTitle,
  exchangeLabel,
  exchangePeers,
  isOneEmoji,
  notShown,
  quoteLine,
  replyPlaceholder,
  routineLabel,
  routineVerb,
  stampText,
  voiceChatLabel,
} from '../core/chat'
import { type RunFlags, noRun } from '../core/chatRuns'
import { english, languageCode } from '../core/language'
import { type Agent, fileTitle } from '../core/models'
import type { AppStore } from '../core/store'
import { wordsLanguage } from '../core/words'
import { t } from '../l10n'
import { AgentMark } from './AgentMark'
import { Composer } from './Composer'
import {
  type Dismissal,
  HoverBar,
  type MenuItem,
  type MessageActions,
  PopMenu,
  type Reply,
  TapbackCapsule,
} from './MessageActions'
import { MessageBlocks } from './MessageText'
import { classes } from './classes'
import { useWatched } from './useStore'

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
)

/** A click on the button whose menu or capsule it just closed closes it, and opens nothing (the Mac's `closedByClick`, half a second). */
const reopenGap = 500

export function ChatPane({
  store,
  agentId,
}: {
  store: AppStore
  agentId: string
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
  const pane = useRef<HTMLElement>(null)
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
        action: () => void navigator.clipboard?.writeText(bubble.text),
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
          : overlay?.kind === 'tapback'
            ? overlay.bubble.id
            : undefined,
    }
  }, [agentId, overlay, store])

  return (
    <section className="chat-pane" aria-label={agent?.name} ref={pane}>
      {/* A thread, or back to the chat: the lines on screen start again, at their newest. */}
      <Transcript
        key={threadRoot ?? ''}
        store={store}
        agentId={agentId}
        threadRoot={threadRoot}
        composerHeight={composerHeight}
        actions={actions}
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
      <Composer
        store={store}
        agentId={agentId}
        name={agent?.name ?? ''}
        threadRoot={threadRoot}
        reply={reply}
        onCancelReply={() => setAnswering(undefined)}
        focusKey={focusKey}
        onHeight={setComposerHeight}
      />
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
          close={closeOverlay}
        />
      )}
    </section>
  )
}

/**
 * The chat's head (`header`, 116 high, padded 4 12 28 8): the ground at 78%
 * over a blur, fading out over its last 30 points; the agent's picture (52)
 * over its name in a pill (13, medium).
 */
function ChatHeader({ store, agent }: { store: AppStore; agent: Agent }) {
  return (
    <header className="chat-header">
      <div className="veil" aria-hidden="true" />
      <div className="identity" title={agent.name}>
        <AgentMark agent={agent} agents={store.agents} size={52} />
        <span className="name-pill">{agent.name}</span>
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
      <span className="crumb title">{title}</span>
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
  actions,
}: {
  store: AppStore
  agentId: string
  threadRoot?: string
  composerHeight: number
  actions: MessageActions
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
    pinned.current = gap <= pinGap
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

  const jump = useCallback((rowId: string) => {
    const element = scroller.current?.querySelector(
      `[data-row-id="${CSS.escape(rowId)}"]`,
    )
    if (!element) return
    pinned.current = false
    setAtNewest(false)
    element.scrollIntoView({ behavior: 'smooth', block: 'center' })
    // Lit in the warning yellow at 22%, then it fades (`sand-12cjh1l`).
    setLit(rowId)
    setTimeout(() => setLit((now) => (now === rowId ? undefined : now)), 2_500)
  }, [])

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
    }),
    [store, agentId, threadRoot, shownIds, jump, lit, column, actions],
  )

  return (
    <Control.Provider value={control}>
      <div className="transcript" ref={scroller} onScroll={onScroll}>
        <div
          className="transcript-rows"
          ref={content}
          style={{
            paddingTop: threadRoot != null ? 44 : 116,
            paddingBottom: composerHeight + 28 + 40,
          }}
        >
          {rows.map((row) =>
            row.kind === 'thread' && threads.has(row.rootId) ? null : (
              <TranscriptRow
                key={row.id}
                row={row}
                run={runs[row.id] ?? noRun}
                isGroup={agent?.isGroup ?? false}
                threadCount={threads.get(row.id)}
              />
            ),
          )}
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
}: {
  row: ChatRow
  run: RunFlags
  isGroup: boolean
  threadCount?: number
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
}: {
  row: ChatRow
  run: RunFlags
  isGroup: boolean
  threadCount?: number
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
        />
      )
    case 'file':
      return (
        <div
          className={classes('file-card', run.startsGroup && 'starts-group')}
        >
          <span className="file-icon" aria-hidden="true" />
          <span className="file-title" title={row.name}>
            {fileTitle(row.name)}
          </span>
        </div>
      )
    case 'teammates': {
      const peers = exchangePeers(row.exchange)
      const title =
        peers.length === 1 ? peers[0]!.name : t`${peers.length} agents`
      return (
        <div className="system-event">
          <span className="label">{exchangeLabel(row.exchange)}</span>
          <span className="event-chip">
            <span className="marks">
              {peers.slice(0, 3).map((peer) => {
                const known = control.store.agent(peer.id)
                return known ? (
                  <AgentMark
                    key={peer.id}
                    agent={known}
                    agents={control.store.agents}
                    size={16}
                  />
                ) : (
                  <span
                    key={peer.id}
                    className="picture"
                    style={{ width: 16, height: 16 }}
                  />
                )
              })}
            </span>
            <span className="chip-title">{title}</span>
          </span>
        </div>
      )
    }
    case 'routines':
      return row.routines.length >= 3 ? (
        <div className="system-event">
          <span className="label">{routineVerb(row.action)}</span>
          <span className="event-chip">
            <Clock />
            <span className="chip-title">{t`${row.routines.length} routines`}</span>
          </span>
        </div>
      ) : (
        <div className="system-event">
          <span className="label">
            {routineLabel(row.action, row.routines.length)}
          </span>
          {row.routines.map((routine, index) => (
            <span key={routine.id} className="routine">
              {index > 0 && <span className="label">{t('and')}</span>}
              <span className="event-chip">
                <Clock />
                <span className="chip-title">{routine.name}</span>
              </span>
            </span>
          ))}
        </div>
      )
    case 'voiceCall':
      return (
        <div
          className="call-line"
          title={voiceChatLabel(row.seconds, row.live)}
        >
          <VoiceGlyph />
          <span>{voiceChatLabel(row.seconds, row.live)}</span>
        </div>
      )
    case 'notice':
      return <div className="notice">{row.text}</div>
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
      // Step 3 draws each card; until then its place is kept and said.
      return (
        <div
          className={classes('later-card', run.startsGroup && 'starts-group')}
        >
          {notShown()}
        </div>
      )
  }
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

/** The call's glyph: five strokes of a voice, the middle ones tallest. */
function VoiceGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M5 10v4M9 7v10M13 9v6M17 6v12M21 10v4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
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
}: {
  bubble: Bubble
  run: RunFlags
  isGroup: boolean
  threadCount?: number
}) {
  const control = useControl()
  const message = (
    <Message
      bubble={bubble}
      run={run}
      isGroup={isGroup}
      threadCount={threadCount}
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
}: {
  bubble: Bubble
  run: RunFlags
  isGroup: boolean
  threadCount?: number
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
      {showsWords && (
        <div className="bubble-stack">
          <Shaped
            bubble={bubble}
            run={run}
            isGroup={isGroup}
            chinJoined={chinJoined}
            threadCount={threadCount}
          />
          {bubble.reactions.length > 0 && <ReactionPills bubble={bubble} />}
        </div>
      )}
      {!chinJoined && threadCount != null && (
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
}: {
  bubble: Bubble
  run: RunFlags
  isGroup: boolean
  chinJoined: boolean
  threadCount?: number
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
    const joinsBelow = run.continuesNext || (isGroup && bubble.showsAvatar)
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
          <MessageBlocks markdown={bubble.text} />
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
        {words}
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

/** A picture's address on screen: the web's own, or one the person sent from this tab; a computer's file comes with the previews (2c). */
function useShownPicture(image: ChatImage): string | undefined {
  const control = useControl()
  const sent = control.store.sentFile(image.url)
  const blob = useMemo(
    () =>
      sent ? URL.createObjectURL(new Blob([sent.data as BlobPart])) : undefined,
    [sent],
  )
  useEffect(() => () => (blob ? URL.revokeObjectURL(blob) : undefined), [blob])
  if (image.url.startsWith('https://')) return image.url
  return blob
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
  return (
    <div className={alone ? 'picture-strip' : 'picture-strip under-words'}>
      {images.map((image, index) => (
        <Picture key={image.url + index} image={image} size={sizes[index]!} />
      ))}
    </div>
  )
}

function Picture({
  image,
  size,
}: {
  image: ChatImage
  size: { width: number; height: number }
}) {
  const shown = useShownPicture(image)
  return (
    <span
      className="chat-picture"
      style={{ width: size.width, height: size.height }}
    >
      {shown && <img src={shown} alt={image.alt} />}
    </span>
  )
}
