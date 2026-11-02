// Step 5d: calls with an agent (mac/Simeon/CallBannerWindow.swift,
// CallChat.swift, ChatPane.swift's `CallButton` and the name's row;
// SimeonCore's Call.swift, CallTones.swift, VoiceCall.swift), and two
// agents' messages to each other over the chat (mac/Simeon/Exchange.swift,
// ChatPane.swift's `ExchangeEvent`). The window places them (App.tsx,
// ChatPane.tsx).
//
// The Mac's banner is a panel of its own, floating over every window. A
// page can't float a window, so the banner sits inside the window, over
// everything in it, at the Mac's 12 from the top and 16 from the right of
// the chat's column, so it covers none of the window's own controls (the
// agent's pane, find's bar). The Windows app gives it its own
// always-on-top window, as the Mac's (src/desktop/callWindow.ts, step 7c):
// the card is drawn there, and not in the window.

import {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  CallBanner as Banner,
  type BannerLook,
  type CallState,
} from '../core/call'
import {
  type CallLine,
  type Exchange,
  exchangePeers,
  stampText,
  voiceChatLabel,
} from '../core/chat'
import { type ExchangeRow, exchangeRows, menuOrder } from '../core/exchanges'
import { pictureURL } from '../core/faces'
import type { Agent, Party } from '../core/models'
import type { AppStore } from '../core/store'
import { followCallWindow } from '../desktop/callWindow'
import { desktop } from '../desktop/desktop'
import { t } from '../l10n'
import { AgentMark, AgentPicture } from './AgentMark'
import './Call.css'
import { classes } from './classes'
import { ContextMenu } from './ContextMenu'
import { somethingOver } from './Dialogs'
import { Glyph as BarGlyph, useDismiss } from './MessageActions'
import {
  MentionContext,
  type MentionSetting,
  MessageBlocks,
} from './MessageText'
import { useWatched } from './useStore'
import { useWindowModel } from './windowModel'

// MARK: Calling

/**
 * Calling, wherever it is asked (`CallActions.call`, the chat's phone):
 * while a call is up, its banner comes forward instead, whichever agent was
 * asked (`voice-call-service.ts`).
 */
export function callAgent(store: AppStore, agent: Agent): void {
  if (store.call) {
    // The Windows app's call has its own window: forward, without the keys (`CallBannerWindow.focus`).
    const host = desktop()
    if (host) void host.call('focusCall').catch(() => {})
    else document.querySelector<HTMLElement>('.call-banner')?.focus()
    return
  }
  store.startCall(agent)
}

/** What the banner reads: the store, or the call's own window's copy of it in the Windows app (`CallMirror`). */
export type BannerSource = Pick<
  AppStore,
  | 'call'
  | 'callLevels'
  | 'agents'
  | 'agent'
  | 'mute'
  | 'hangUp'
  | 'dismissCall'
  | 'subscribe'
  | 'getVersion'
>

/** An agent's picture by its id (`AgentIdMark`): its own, or the quiet disc for one the app doesn't know. */
function MarkOf({
  store,
  id,
  size,
}: {
  store: Pick<BannerSource, 'agent' | 'agents'>
  id: string
  size: number
}) {
  const agent = store.agent(id)
  return agent ? (
    <AgentMark agent={agent} agents={store.agents} size={size} />
  ) : (
    <AgentPicture size={size} />
  )
}

// MARK: The banner

/**
 * The call's banner (`CallBannerWindow`, `CallBannerCard`): it shows with a
 * call and goes when the call is put away. Leaving the page with a call on
 * ends it (its voice let go, its record on its way), as quitting the Mac
 * does, rather than leaving its line "now". In the Windows app the card is
 * the call's own window's (src/desktop/callWindow.ts): none here.
 */
export function CallBanner({ store }: { store: AppStore }): ReactNode {
  useWatched(store)
  useEffect(() => {
    const leave = () => {
      const call = store.call
      if (call && call.phase !== 'ended') store.hangUp()
    }
    window.addEventListener('pagehide', leave)
    return () => window.removeEventListener('pagehide', leave)
  }, [store])
  const host = desktop()
  useEffect(
    () => (host ? followCallWindow(host, store) : undefined),
    [host, store],
  )
  const call = store.call
  if (!call || host) return null
  // Its Transcript closed at each call's start.
  return <PlacedBannerCard key={call.agentId} store={store} call={call} />
}

/** The card in the window, over the chat's column. */
function PlacedBannerCard({
  store,
  call,
}: {
  store: BannerSource
  call: CallState
}) {
  const place = useBannerPlace()
  return <BannerCard store={store} call={call} style={place} />
}

/**
 * Where the banner sits, measured from the window (the session, 2
 * November 2026): the Mac's 12 from the top and 16 from the right
 * (`CallBanner.insetTop`, `insetRight`), but of the chat's column, not the
 * window, so it covers none of the window's own controls: left of the
 * agent's pane when it is open, and 8 under find's bar while it is open in
 * that chat.
 */
function bannerPlace(): { top: number; right: number } {
  const column = document.querySelector('.chat-area')
  const area = column?.getBoundingClientRect()
  const find = column?.querySelector('.find-bar')?.getBoundingClientRect()
  return {
    top: Math.round(
      find ? find.bottom + 8 : (area?.top ?? 0) + Banner.insetTop,
    ),
    right: Math.round(
      area
        ? window.innerWidth - area.right + Banner.insetRight
        : Banner.insetRight,
    ),
  }
}

/** The banner's place, followed as the column changes (the pane, the sidebar, the window's size) and as find opens and closes. */
function useBannerPlace(): { top: number; right: number } {
  const [place, setPlace] = useState(bannerPlace)
  useEffect(() => {
    let frame = 0
    const measure = () => {
      frame = 0
      const next = bannerPlace()
      setPlace((now) =>
        now.top === next.top && now.right === next.right ? now : next,
      )
    }
    const soon = () => {
      if (frame === 0) frame = window.requestAnimationFrame(measure)
    }
    const column = document.querySelector('.chat-area')
    const resized = new ResizeObserver(soon)
    const changed = new MutationObserver(soon)
    if (column) {
      resized.observe(column)
      changed.observe(column, { childList: true, subtree: true })
    }
    window.addEventListener('resize', soon)
    soon()
    return () => {
      window.cancelAnimationFrame(frame)
      resized.disconnect()
      changed.disconnect()
      window.removeEventListener('resize', soon)
    }
  }, [])
  return place
}

/** The time now, again every `every` ms while `on` (the status line's `TimelineView(.periodic(by: 1))`). */
function useNow(every: number, on: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!on) return
    const timer = window.setInterval(() => setNow(Date.now()), every)
    return () => window.clearInterval(timer)
  }, [every, on])
  return now
}

/**
 * The card (`.banner`): the agent and the status line (a red hang-up while
 * it rings), the waveform while the call is on and the agent not working on
 * something, what both said when Transcript is on, then Mute (Unmute),
 * Transcript and End; Close alone when the call failed; nothing once it
 * ended. 360 wide, round 24, solid white (#2A2A2D on dark). A failed call
 * stays 20 s, and while the pointer is on it; leaving starts the 20 s again
 * (`FAILED_DISMISS_MS`). An ended one leaves by itself after 1.2 s (the
 * call). Placed by `style` in the window; the Windows app's call window
 * places it itself and hears the pointer come and go (`onPointer`).
 */
export function BannerCard({
  store,
  call,
  style,
  onPointer,
}: {
  store: BannerSource
  call: CallState
  style?: { top: number; right: number }
  onPointer?: (inside: boolean) => void
}) {
  const look = Banner.look(call)
  const [transcript, setTranscript] = useState(false)
  const [hovering, setHovering] = useState(false)
  const now = useNow(1000, look !== 'ringing')
  const endedAt = call.endedAt
  useEffect(() => {
    if (look !== 'failed' || hovering) return
    const timer = window.setTimeout(() => {
      // Only the failure it was set for, never a call started since.
      const shown = store.call
      if (shown?.failed && shown.endedAt === endedAt) store.dismissCall()
    }, Banner.failedStays * 1000)
    return () => window.clearTimeout(timer)
  }, [look, hovering, endedAt, store])
  return (
    <div
      className="call-banner"
      role="region"
      aria-label={t('Call')}
      tabIndex={-1}
      style={style}
      onMouseEnter={() => {
        setHovering(true)
        onPointer?.(true)
      }}
      onMouseLeave={() => {
        setHovering(false)
        onPointer?.(false)
      }}
    >
      <div className="call-top">
        <span className="call-avatar" aria-hidden="true">
          <MarkOf store={store} id={call.agentId} size={46} />
        </span>
        <div className="call-id">
          <div className="call-name">{call.agentName}</div>
          <div className="call-status">{Banner.status(call, now)}</div>
        </div>
        {look === 'ringing' && (
          <button
            type="button"
            className="call-quick"
            aria-label={t('End call')}
            onClick={() => store.hangUp()}
          >
            <PhoneDownGlyph size={17} />
          </button>
        )}
      </div>
      {Banner.hasWave(call) && (
        <BannerWave store={store} speaking={look === 'speaking'} />
      )}
      {transcript && look !== 'ringing' && (
        <BannerTranscript lines={call.lines} />
      )}
      <BannerBar
        store={store}
        call={call}
        look={look}
        transcript={transcript}
        toggleTranscript={() => setTranscript(!transcript)}
      />
    </div>
  )
}

/** Nothing while it rings or once it ended; Close when it failed; else Mute (Unmute), Transcript, End, 48 high, 1 apart. */
function BannerBar({
  store,
  call,
  look,
  transcript,
  toggleTranscript,
}: {
  store: BannerSource
  call: CallState
  look: BannerLook
  transcript: boolean
  toggleTranscript: () => void
}) {
  switch (look) {
    case 'ringing':
    case 'ended':
      return null
    case 'failed':
      return (
        <div className="call-bar">
          <button
            type="button"
            className="call-button"
            onClick={() => store.dismissCall()}
          >
            {t('Close')}
          </button>
        </div>
      )
    default:
      return (
        <div className="call-bar">
          <button
            type="button"
            className={classes('call-button', call.isMuted && 'muted')}
            aria-pressed={call.isMuted}
            onClick={() => store.mute(!call.isMuted)}
          >
            {call.isMuted ? <MicOffGlyph /> : <MicGlyph />}
            {call.isMuted ? t('Unmute') : t('Mute')}
          </button>
          <span className="call-rule" />
          <button
            type="button"
            className={classes('call-button', transcript && 'on')}
            aria-pressed={transcript}
            onClick={toggleTranscript}
          >
            <TranscriptGlyph />
            {t('Transcript')}
          </button>
          <span className="call-rule" />
          <button
            type="button"
            className="call-button end"
            onClick={() => store.hangUp()}
          >
            <PhoneDownGlyph size={15} />
            {t('End')}
          </button>
        </div>
      )
  }
}

/**
 * What both said (`BannerTranscript`): the person's on the right in the
 * chat's blue, the agent's on the left in the grey; 259 at most, then it
 * scrolls. It opens at the newest, and a new line brings it there only when
 * it was within 24 of the foot (someone reading further up stays where they
 * are).
 */
function BannerTranscript({ lines }: { lines: readonly CallLine[] }) {
  const box = useRef<HTMLDivElement>(null)
  const nearFoot = useRef(true)
  useLayoutEffect(() => {
    const element = box.current
    if (element && nearFoot.current) element.scrollTop = element.scrollHeight
  }, [lines.length])
  return (
    <div className="call-transcript" role="log" aria-label={t('Transcript')}>
      <div
        ref={box}
        className="call-transcript-scroll"
        onScroll={(event) => {
          const element = event.currentTarget
          nearFoot.current =
            element.scrollTop + element.clientHeight >=
            element.scrollHeight - 24
        }}
      >
        {lines.length === 0 && (
          <p className="call-empty">{Banner.emptyTranscript()}</p>
        )}
        {lines.map((line, index) => (
          <p
            key={index}
            className={classes('call-said', line.fromPerson && 'person')}
          >
            {line.text}
          </p>
        ))}
      </div>
    </div>
  )
}

/**
 * The waveform (`BannerWave`): 46 bars 5 wide and 2 apart, round 1, the ink
 * at 55%, highest in the middle and falling off to the edges, 16 above
 * their 2-point floor while the agent speaks and 12 while it listens; each
 * bar falls back by a fifth every frame (×0.82) unless the voice lifts it.
 * It reads the store's bars every frame, not through a redraw of the
 * window.
 */
function BannerWave({
  store,
  speaking,
}: {
  store: Pick<BannerSource, 'callLevels'>
  speaking: boolean
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const speakingRef = useRef(speaking)
  useEffect(() => {
    speakingRef.current = speaking
  }, [speaking])
  useEffect(() => {
    const element = canvas.current
    const context = element?.getContext('2d')
    if (!element || !context) return
    const bars = Banner.bars
    const levels = new Array<number>(bars).fill(0)
    let last: number | undefined
    let frame = 0
    const draw = (time: number) => {
      const width = element.clientWidth
      const height = element.clientHeight
      const scale = window.devicePixelRatio || 1
      if (element.width !== Math.round(width * scale)) {
        element.width = Math.round(width * scale)
        element.height = Math.round(height * scale)
      }
      context.setTransform(scale, 0, 0, scale, 0, 0)
      context.clearRect(0, 0, width, height)
      const frames = last == null ? 1 : Math.max(0, ((time - last) / 1000) * 60)
      last = time
      const fall = 0.82 ** frames
      const amplitude = speakingRef.current ? 16 : 12
      const incoming = store.callLevels
      const gap = 2
      const barWidth = (width - gap * (bars - 1)) / bars
      context.fillStyle = getComputedStyle(element).color
      context.globalAlpha = 0.55
      for (let index = 0; index < bars; index += 1) {
        // Symmetric: the middle bars from the first levels, as the window reads the lowest frequencies there.
        const slot = Math.min(
          Math.max(0, incoming.length - 1),
          Math.trunc(
            (Math.abs(index - (bars - 1) / 2) / (bars / 2 + 0.5)) *
              incoming.length,
          ),
        )
        const target =
          incoming.length === 0
            ? 0
            : Math.max(0, Math.min(1, incoming[slot] ?? 0))
        levels[index] = Math.max(target, levels[index]! * fall)
        const bar =
          2 +
          levels[index]! *
            amplitude *
            Math.sin((Math.PI * (index + 0.5)) / bars)
        context.beginPath()
        context.roundRect(
          index * (barWidth + gap),
          (height - bar) / 2,
          barWidth,
          bar,
          1,
        )
        context.fill()
      }
      frame = window.requestAnimationFrame(draw)
    }
    frame = window.requestAnimationFrame(draw)
    return () => window.cancelAnimationFrame(frame)
  }, [store])
  return <canvas ref={canvas} className="call-wave" aria-hidden="true" />
}

// MARK: The name's row and the phone

/**
 * The name's row in the chat's head (ChatPane.swift's `identity`): the
 * phone 8 past the pill and level with its top, the pill still in the
 * middle under the picture: an empty place as wide as the phone on the
 * pill's other side. Not for a group, not while calls are off.
 */
export function CallHeadRow({
  store,
  agent,
  children,
}: {
  store: AppStore
  agent: Agent
  children: ReactNode
}): ReactNode {
  if (agent.isGroup || !store.canCall) return children
  return (
    <div className="call-head-row">
      <span className="call-head-space" aria-hidden="true" />
      {children}
      <CallButton store={store} agent={agent} />
    </div>
  )
}

/**
 * `simeon-call-button`: a 24-point disc with the phone (11) in the window's
 * blue, darker under the pointer; Apple's glass in light, the flat dark
 * control on dark (#212121, its #2E2E2E edge, #2A2A2A under the pointer).
 * It calls the agent, and while a call is up it brings its banner forward.
 */
function CallButton({ store, agent }: { store: AppStore; agent: Agent }) {
  return (
    <button
      type="button"
      className="call-phone"
      title={t`Call ${agent.name}`}
      aria-label={t`Call ${agent.name}`}
      onClick={() => callAgent(store, agent)}
    >
      <PhoneGlyph />
    </button>
  )
}

// MARK: The call in the chat

/**
 * A call in the chat (`CallLineRow`): the host writes it when the call opens
 * ("Voice chat · now") and fills it at the end ("Voice chat · 02:48"). A
 * chip in the middle of the chat, 24 high, round: the voice's five strokes
 * (14) and the words (12 on 16, at 60%). An ended call with words opens
 * them over the chat, the pointer giving it the grey and the full ink
 * (0.12 s); the rest are words only.
 */
export function CallLineRow({
  agentId,
  id,
  seconds,
  lines,
  live,
}: {
  store: AppStore
  agentId: string
  id: string
  seconds: number
  lines: readonly CallLine[]
  live: boolean
}): ReactNode {
  const model = useWindowModel()
  const label = voiceChatLabel(seconds, live)
  if (!live && lines.length > 0)
    return (
      <button
        type="button"
        className="call-line opens"
        title={label}
        aria-label={t`Open ${label}`}
        onClick={() => model.coverChat({ kind: 'call', agentId, lineId: id })}
      >
        <VoiceGlyph />
        <span>{label}</span>
      </button>
    )
  return (
    <div className="call-line" title={label}>
      <VoiceGlyph />
      <span>{label}</span>
    </div>
  )
}

/**
 * A call written into the chat by an older host (Cards.swift's
 * `CallRecordView`, `simeon-call-record`, 340 wide at most): a phone in a
 * faint circle (30), "Voice call" (600) and its length (13, 60%), a chevron
 * that opens the recap under a hairline, 40 in.
 */
export function CallRecordView({
  duration,
  recap,
}: {
  duration: string
  recap?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="call-record">
      <button
        type="button"
        className="call-record-head"
        disabled={recap == null}
        aria-expanded={recap != null ? open : undefined}
        onClick={() => setOpen(!open)}
      >
        <span className="call-record-disc">
          <PhoneGlyph size={12} />
        </span>
        <span className="call-record-words">
          <span className="call-record-title">{t('Voice call')}</span>
          <span className="call-record-length">{duration}</span>
        </span>
        {recap != null && (
          <svg
            className={classes('call-record-chevron', open && 'open')}
            width="14"
            height="14"
            viewBox="0 0 14 14"
            aria-hidden="true"
          >
            <path
              d="M5 3.5 8.5 7 5 10.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>
      {open && recap != null && (
        <div className="call-record-recap">
          <span className="call-record-line" />
          <p>{recap}</p>
        </div>
      )}
    </div>
  )
}

// MARK: Agents talking to each other, in the chat

/**
 * Agents talking to each other, folded (ChatPane.swift's `ExchangeEvent`):
 * "Messaged", "Message from" or "4 messages with", then the agent, or "2
 * agents" over their pictures. One agent's chip opens their messages over
 * the chat; with several, a menu of them ("Agents in this exchange") does,
 * at the pointer.
 */
export function ExchangeChip({
  store,
  agentId,
  exchange,
}: {
  store: AppStore
  agentId: string
  exchange: Exchange
}) {
  const model = useWindowModel()
  const [menu, setMenu] = useState<{ x: number; y: number }>()
  const peers = exchangePeers(exchange)
  const title = peers.length === 1 ? peers[0]!.name : t`${peers.length} agents`
  const help =
    peers.length === 1 ? t`Open ${title}'s messages` : t`${title}, show list`
  return (
    <>
      <button
        type="button"
        className="event-chip exchange-chip"
        title={help}
        aria-label={help}
        aria-haspopup={peers.length > 1 ? 'menu' : undefined}
        onClick={(event) => {
          if (peers.length === 1)
            model.coverChat({ kind: 'exchange', agentId, peerId: peers[0]!.id })
          else if (peers.length > 1) {
            // From the keys (Return, Space) there is no pointer: the menu opens under the chip.
            if (event.detail === 0) {
              const chip = event.currentTarget.getBoundingClientRect()
              setMenu({ x: chip.left, y: chip.bottom + 4 })
            } else setMenu({ x: event.clientX, y: event.clientY })
          }
        }}
      >
        <span className="marks">
          {peers.slice(0, 3).map((peer) => (
            <MarkOf key={peer.id} store={store} id={peer.id} size={16} />
          ))}
        </span>
        <span className="chip-title">{title}</span>
      </button>
      {menu && (
        <PeersMenu
          store={store}
          peers={menuOrder(peers)}
          at={menu}
          close={() => setMenu(undefined)}
          pick={(peer) =>
            model.coverChat({ kind: 'exchange', agentId, peerId: peer.id })
          }
        />
      )}
    </>
  )
}

/**
 * The agents of an exchange with several (`ExchangeMenu`, "Agents in this
 * exchange"): each one's picture (18) and name, by name; choosing one opens
 * its messages with this agent. The window's own menu, at the pointer, kept
 * inside the window; Escape, a click elsewhere or a pick closes it; ↑ and ↓
 * choose.
 */
function PeersMenu({
  store,
  peers,
  at,
  close,
  pick,
}: {
  store: AppStore
  peers: readonly Party[]
  at: { x: number; y: number }
  close: () => void
  pick: (peer: Party) => void
}) {
  const box = useRef<HTMLDivElement>(null)
  useDismiss(box, close)
  useLayoutEffect(() => {
    const element = box.current
    if (!element) return
    let left = at.x
    let top = at.y
    if (left + element.offsetWidth > window.innerWidth - 8)
      left = at.x - element.offsetWidth
    if (top + element.offsetHeight > window.innerHeight - 8)
      top = Math.max(8, window.innerHeight - 8 - element.offsetHeight)
    element.style.left = `${Math.max(8, left)}px`
    element.style.top = `${Math.max(8, top)}px`
    element.style.visibility = 'visible'
    element.focus()
  }, [at])
  return (
    <div className="context-menus">
      <div
        ref={box}
        className="pop-menu context-menu"
        role="menu"
        aria-label={t('Agents in this exchange')}
        tabIndex={-1}
        style={{ position: 'fixed', visibility: 'hidden', left: 0, top: 0 }}
        onKeyDown={(event) => {
          const list = [
            ...(box.current?.querySelectorAll<HTMLButtonElement>(
              '.menu-item',
            ) ?? []),
          ]
          const index = list.indexOf(
            document.activeElement as HTMLButtonElement,
          )
          if (event.key === 'ArrowDown')
            list[(index + 1) % list.length]?.focus()
          else if (event.key === 'ArrowUp')
            list[
              index < 0
                ? list.length - 1
                : (index - 1 + list.length) % list.length
            ]?.focus()
          else return
          event.preventDefault()
        }}
      >
        {peers.map((peer) => (
          <button
            key={peer.id}
            type="button"
            role="menuitem"
            className="menu-item"
            onClick={() => {
              close()
              pick(peer)
            }}
          >
            <span className="menu-glyph peer-mark">
              <MarkOf store={store} id={peer.id} size={18} />
            </span>
            <span className="menu-label">{peer.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// MARK: What covers the chat

/**
 * What covers the chat and its field (`ChatControl.exchangePeer` and
 * `callOpen`): a call's lines, or two agents' exchange, read only, the
 * chat's ground over everything. The message field under it lets go of the
 * keys and takes none (ChatPane.tsx hides it); Escape closes it, not while
 * something is over the window (a picture full screen, search, a sheet),
 * nor, over an exchange, while find has the keys.
 */
export function ChatCoverView({
  store,
  agentId,
  head,
}: {
  store: AppStore
  agentId: string
  /** The agent's own head, over a call's lines (`ChatHeader`). */
  head?: ReactNode
}): ReactNode {
  const model = useWindowModel()
  useWatched(model)
  const cover = model.chatCover
  if (!cover || cover.agentId !== agentId) return null
  const close = () => model.coverChat(undefined)
  return cover.kind === 'call' ? (
    <CallChatView
      key={cover.lineId}
      store={store}
      agentId={agentId}
      lineId={cover.lineId}
      head={head}
      close={close}
    />
  ) : (
    <ExchangeView
      key={cover.peerId}
      store={store}
      agentId={agentId}
      peerId={cover.peerId}
      close={close}
    />
  )
}

/** Whether a chat of `agentId` is under a cover now: its field is hidden and drops are refused (`coversChat`). */
export function useCovered(agentId: string): boolean {
  const model = useWindowModel()
  useWatched(model)
  return model.chatCover?.agentId === agentId
}

/** The cover's Escape and the field letting go of the keys as it opens. */
function useCoverKeys(close: () => void, exchange: boolean) {
  const latest = useRef(close)
  useEffect(() => {
    latest.current = close
  })
  useEffect(() => {
    // The field, or the chip that opened it, lets go of the keys: the cover has them.
    const focused = document.activeElement
    if (focused instanceof HTMLElement && focused.closest('.chat-pane'))
      focused.blur()
    document.querySelector<HTMLElement>('.chat-cover')?.focus()
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      if (event.isComposing || somethingOver()) return
      // Escape closes a menu of the cover's own first (it takes it at the document).
      if (document.querySelector('.context-menus')) return
      // While find has the keys, Escape is find's.
      if (exchange && document.activeElement?.closest('.find-bar')) return
      // The cover takes it (`CallChat.swift`'s key monitor returns true): find, open under it, stays open.
      event.preventDefault()
      event.stopPropagation()
      latest.current()
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [exchange])
}

/** The cover's messages: scrolled to the newest as it opens (`defaultScrollAnchor(.bottom)`). */
function useOpensAtNewest() {
  const box = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const element = box.current
    if (element) element.scrollTop = element.scrollHeight
  }, [])
  return box
}

/** Copy, alone, for a message over the chat (`MessageMenu.showCopy`): at the pointer, or under More. */
type CopyMenu = { words: string; at: { x: number; y: number }; forId: string }

function CopyMenuView({ menu, close }: { menu: CopyMenu; close: () => void }) {
  return (
    <ContextMenu
      at={menu.at}
      close={close}
      items={[
        {
          label: t('Copy'),
          glyph: 'copy',
          action: () => void navigator.clipboard?.writeText(menu.words),
        },
      ]}
    />
  )
}

/**
 * Two agents' messages to each other, over the chat (`ExchangeView`,
 * `sand-thread-overlay`, "Agent exchange"), read only. Its head (44, the
 * ground) holds the two agents in the middle, each a picture (20) and its
 * name in a pill (13, 500), 4 apart, with ⇄ (at 30%) between them, 8 apart.
 * The messages run 44 down to 64 up, 16 in, 24 before the first and 52
 * after the last, opening at the newest; each agent's run as in a group
 * (the name over the first, the picture, 22, beside the last), fading under
 * the head (32) and over the foot (40) once there is more to see. A
 * message's actions are More alone with Copy; its author's name does not
 * open their chat.
 */
function ExchangeView({
  store,
  agentId,
  peerId,
  close,
}: {
  store: AppStore
  agentId: string
  peerId: string
  close: () => void
}) {
  useWatched(store)
  useCoverKeys(close, true)
  const agent = store.agent(agentId)
  const entries = store.transcripts[agentId]
  const rows = useMemo(
    () =>
      exchangeRows(
        entries ?? [],
        { id: agentId, name: agent?.name ?? '' },
        peerId,
      ),
    [entries, agentId, agent?.name, peerId],
  )
  // The peer as the chat named it, else as the roster does.
  const peerName =
    (entries ?? []).find((entry) => entry.teammate?.id === peerId)?.teammate
      ?.name ||
    store.agent(peerId)?.name ||
    ''
  const box = useOpensAtNewest()
  const [fades, setFades] = useState({ top: false, bottom: false })
  const [menu, setMenu] = useState<CopyMenu>()
  const measure = () => {
    const element = box.current
    if (!element) return
    setFades({
      top: element.scrollTop > 1,
      bottom:
        element.scrollTop + element.clientHeight < element.scrollHeight - 1,
    })
  }
  useLayoutEffect(measure, [rows, box])
  const names = useMemo(
    () =>
      store.agents
        .filter((one) => !one.isGroup)
        .map((one) => ({ name: one.name.trim(), id: one.id })),
    [store.agents],
  )
  const agentName = agent?.name ?? ''
  return (
    <div
      className="chat-cover"
      role="dialog"
      aria-label={t('Agent exchange')}
      tabIndex={-1}
    >
      <div ref={box} className="cover-scroll" onScroll={measure}>
        <div className="cover-column">
          {rows.map((row) =>
            row.kind === 'stamp' ? (
              <div key={row.id} className="cover-stamp">
                <span className="stamp">{stampText(row.date)}</span>
              </div>
            ) : (
              <ExchangeMessage
                key={row.id}
                store={store}
                row={row}
                names={names}
                held={menu?.forId === row.id}
                openMenu={setMenu}
              />
            ),
          )}
        </div>
      </div>
      <div className={classes('cover-fade top', fades.top && 'shown')} />
      <div className={classes('cover-fade bottom', fades.bottom && 'shown')} />
      <header
        className="exchange-head"
        aria-label={t`Agent exchange between ${agentName} and ${peerName}`}
      >
        <Participant store={store} id={agentId} name={agentName} />
        <ArrowsGlyph />
        <Participant store={store} id={peerId} name={peerName} />
      </header>
      <ReadOnlyNotice close={close} />
      {menu && <CopyMenuView menu={menu} close={() => setMenu(undefined)} />}
    </div>
  )
}

/** One of the exchange's two agents in its head: its picture (20) and its name in a pill, 4 apart. */
function Participant({
  store,
  id,
  name,
}: {
  store: AppStore
  id: string
  name: string
}) {
  return (
    <span className="exchange-party">
      <MarkOf store={store} id={id} size={20} />
      <span className="name-pill" title={name}>
        {name}
      </span>
    </span>
  )
}

/**
 * One message in an exchange (`ExchangeMessage`, an author run): the
 * picture's place (22) 8 from the bubble, the name over the first of a run,
 * the bubble as an agent's in the chat, at most 88% of the column, 640, or
 * the column less 82; its upper left corner 6 round when it runs on from
 * the one before, its lower left always. Under the pointer, More (24) 6
 * beside it, with Copy; a right click, Copy.
 */
function ExchangeMessage({
  store,
  row,
  names,
  held,
  openMenu,
}: {
  store: AppStore
  row: Extract<ExchangeRow, { kind: 'message' }>
  names: readonly { name: string; id: string }[]
  held: boolean
  openMenu: (menu: CopyMenu) => void
}) {
  const model = useWindowModel()
  const setting = useMemo<MentionSetting>(
    () => ({
      agents: names,
      personName: store.account?.name,
      speaker: row.sender.id,
      introducing: false,
      picture: (id) => {
        const agent = store.agent(id)
        return agent ? pictureURL(agent) : undefined
      },
      open: (id) => model.choose(id),
    }),
    [names, store, row.sender.id, model],
  )
  return (
    <div className="cover-row bubble-row group">
      <span className="gutter">
        {row.last && <MarkOf store={store} id={row.sender.id} size={22} />}
      </span>
      <div className="group-column">
        {row.first && <span className="author">{row.sender.name}</span>}
        <div
          className="message"
          onContextMenu={(event) => {
            if ((event.target as Element).closest('a')) return
            event.preventDefault()
            openMenu({
              words: row.text,
              at: { x: event.clientX, y: event.clientY },
              forId: row.id,
            })
          }}
        >
          <div
            className="bubble theirs"
            style={{
              borderRadius: `${row.first ? 18 : 6}px 18px 18px 6px`,
            }}
            aria-label={t('Agent message')}
          >
            <MentionContext.Provider value={setting}>
              <MessageBlocks markdown={row.text} />
            </MentionContext.Provider>
            <div
              className={classes('hover-bar', held && 'held')}
              role="group"
              aria-label={t`Message actions for ${row.sender.name} message`}
            >
              <button
                type="button"
                className="bar-button"
                title={t('More message actions')}
                aria-label={t('More message actions')}
                onClick={(event) => {
                  const spot = event.currentTarget.getBoundingClientRect()
                  openMenu({
                    words: row.text,
                    at: { x: spot.left, y: spot.bottom + 4 },
                    forId: row.id,
                  })
                }}
              >
                <BarGlyph name="more" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * A call's lines over the chat (`CallChatView`, the window's exchange
 * panel opened on a call, read only): the agent's own head, the call's
 * time, the person's words on the right in their blue and the agent's on
 * the left in the grey, its name over the first of a run and its picture
 * (22) by the last; at the foot, "This chat is view-only" and Close Chat.
 */
function CallChatView({
  store,
  agentId,
  lineId,
  head,
  close,
}: {
  store: AppStore
  agentId: string
  lineId: string
  head?: ReactNode
  close: () => void
}) {
  useWatched(store)
  useCoverKeys(close, false)
  const agent = store.agent(agentId)
  const row = [
    ...(store.chatRows[agentId] ?? []),
    ...(store.threadRows[agentId] ?? []),
  ].find((one) => one.id === lineId)
  const lines = row?.kind === 'voiceCall' ? row.lines : []
  const at = store.transcripts[agentId]?.find(
    (entry) => entry.id === lineId,
  )?.timestampMs
  const box = useOpensAtNewest()
  const [menu, setMenu] = useState<CopyMenu>()
  const copyAt =
    (words: string, forId: string) => (event: React.MouseEvent) => {
      event.preventDefault()
      setMenu({ words, at: { x: event.clientX, y: event.clientY }, forId })
    }
  return (
    <div
      className="chat-cover"
      role="dialog"
      aria-label={t`Voice chat with ${agent?.name ?? ''}`}
      tabIndex={-1}
    >
      <div ref={box} className="cover-scroll call">
        <div className="cover-column">
          {at != null && (
            <div className="cover-stamp">
              <span className="stamp">{stampText(at)}</span>
            </div>
          )}
          {lines.map((line, index) => {
            const id = `${lineId}-${index}`
            if (line.fromPerson)
              return (
                <div key={id} className="cover-row person">
                  <div className="message mine">
                    <div
                      className="bubble yours call-said-person"
                      aria-label={t`Your message: ${line.text}`}
                      onContextMenu={copyAt(line.text, id)}
                    >
                      {line.text}
                    </div>
                  </div>
                </div>
              )
            const first = index === 0 || lines[index - 1]!.fromPerson
            const last =
              index === lines.length - 1 || lines[index + 1]!.fromPerson
            return (
              <div key={id} className="cover-row bubble-row group">
                <span className="gutter">
                  {last && agent && (
                    <AgentMark agent={agent} agents={store.agents} size={22} />
                  )}
                </span>
                <div className="group-column">
                  {first && <span className="author">{agent?.name}</span>}
                  <div className="message">
                    <div
                      className="bubble theirs cover-plain"
                      style={{
                        borderRadius: `${first ? 18 : 6}px 18px 18px 6px`,
                      }}
                      aria-label={`${agent?.name ?? ''}: ${line.text}`}
                      onContextMenu={copyAt(line.text, id)}
                    >
                      {line.text}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
      {head}
      <ReadOnlyNotice close={close} />
      {menu && <CopyMenuView menu={menu} close={() => setMenu(undefined)} />}
    </div>
  )
}

/** The cover's foot (`ReadOnlyNotice`, `sand-exchange-readonly-notice`), 12 up and 40 high: a lock and "This chat is view-only" (12 on 16, at 40%, 6 apart), then Close Chat (a pill on the grey wash), 10 apart. */
function ReadOnlyNotice({ close }: { close: () => void }) {
  return (
    <div
      className="read-only"
      role="group"
      aria-label={t('Read-only agent conversation')}
    >
      <span className="read-only-line">
        <LockGlyph />
        {t('This chat is view-only')}
      </span>
      <button type="button" className="read-only-close" onClick={close}>
        {t('Close Chat')}
      </button>
    </div>
  )
}

// MARK: Glyphs (the Mac's SF Symbols, drawn)

/** The call's glyph: five strokes of a voice, the middle ones tallest. */
export function VoiceGlyph() {
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

/** The handset (`phone.down.fill` as the banner's `#i-end`). */
const handset =
  'M12 9.2c-2.1 0-4 .4-5.6 1.1l-.1 2.3c0 .5-.3.9-.7 1.1-.9.4-1.8 1-2.6 1.6-.4.3-1 .3-1.4-.1L.4 14a1.1 1.1 0 0 1 0-1.6C3.4 9.6 7.5 8 12 8s8.6 1.6 11.6 4.4c.5.4.5 1.1 0 1.6l-1.2 1.2c-.4.4-1 .4-1.4.1-.8-.6-1.7-1.2-2.6-1.6-.4-.2-.7-.6-.7-1.1l-.1-2.3A14 14 0 0 0 12 9.2z'

function PhoneDownGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d={handset} fill="currentColor" />
    </svg>
  )
}

/** `phone.fill`: the handset, its ear at the top left and its mouth at the bottom right. */
function PhoneGlyph({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M8.2 2.6c.5-.1 1 .2 1.2.7l1.5 3.6c.2.5.1 1-.3 1.4L8.7 9.9c1 2.2 2.8 4 5 5l1.6-1.9c.4-.4.9-.5 1.4-.3l3.6 1.5c.5.2.8.7.7 1.2l-.6 3.3c-.1.5-.5.9-1 .9C10.6 19.6 4.4 13.4 4.4 4.7c0-.5.4-.9.9-1Z"
        fill="currentColor"
      />
    </svg>
  )
}

function MicGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 14.5a3.5 3.5 0 0 0 3.5-3.5V5.5a3.5 3.5 0 1 0-7 0V11a3.5 3.5 0 0 0 3.5 3.5z"
      />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        d="M18.5 11a6.5 6.5 0 0 1-13 0M12 17.5V21"
      />
    </svg>
  )
}

function MicOffGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 14.5a3.5 3.5 0 0 0 3.5-3.5V5.5a3.5 3.5 0 1 0-7 0V11a3.5 3.5 0 0 0 3.5 3.5z"
      />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        d="M18.5 11a6.5 6.5 0 0 1-13 0M12 17.5V21M4 3l16 18"
      />
    </svg>
  )
}

/** Transcript's glyph (`#i-talk`): three lines, the last one shorter. */
function TranscriptGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
      <path
        d="M1.5 4.5h12M1.5 7.5h12M1.5 10.5h7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** `lock`, 10 in its 12. */
function LockGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <path
        d="M3 5.5h6a.8.8 0 0 1 .8.8v3.4a.8.8 0 0 1-.8.8H3a.8.8 0 0 1-.8-.8V6.3a.8.8 0 0 1 .8-.8ZM4 5.5V4a2 2 0 0 1 4 0v1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** `arrow.left.arrow.right` (10, medium) in its 12. */
function ArrowsGlyph() {
  return (
    <svg
      className="exchange-arrows"
      width="12"
      height="12"
      viewBox="0 0 12 12"
      aria-hidden="true"
    >
      <path
        d="M10 3.5H2M2 3.5 4 1.5M2 3.5 4 5.5M2 8.5h8M10 8.5 8 6.5M10 8.5 8 10.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
