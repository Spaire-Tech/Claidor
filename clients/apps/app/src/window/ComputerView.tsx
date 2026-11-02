// Step 5b: an agent's computer (mac/Simeon/ComputerView.swift,
// ComputerPreview.swift; SimeonCore's CloudComputer.swift and
// StoreComputer.swift): the Computer tab of the agent's pane, and the full
// view over the window. The window places them (App.tsx, AgentPane.tsx);
// the cards open the full view (`openComputerView`). The screen itself is
// noVNC in the page (`liveScreen.ts`).
//
// The web's own choices (docs/web-app/PROGRESS.md, "Decisions"): the full
// view's bar has no room for traffic lights (a page has none: the Mac's full
// screen); a page can't read the clipboard without asking, so this
// computer's words go to the agent's with a paste (⌘V or Ctrl+V while the
// screen holds the keys), not on a click, the window coming forward or the
// screen coming up; the computer's copied words are written to the
// clipboard only while the page has the focus (one copied while it is
// behind is dropped, never written later over a newer copy); Tab goes round
// the view's own buttons, where the Mac's swallows it. The Windows app reads
// and writes the clipboard without asking, so the clipboard is the Mac's
// there (step 7d, clipboard.ts): this PC's words go on a click in the
// screen, as the window comes forward and as the screen comes up, and the
// computer's copy is written at once, even while the window is behind.

import {
  type CSSProperties,
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import {
  type AgentPointer,
  type ComputerHelper,
  type ComputerPlaceholder,
  ScreenCrashes,
  computerScreen,
  focusedHelper,
  fullPlaceholder,
  helperStrip,
  pointerPlace,
  pointerScale,
  pressDelay,
  previewPlaceholder,
  screenURL,
  streamLog,
  streamWords,
} from '../core/cloudComputer'
import type { Agent } from '../core/models'
import type { AppStore } from '../core/store'
import { t } from '../l10n'
import { classes } from './classes'
import { appClipboard } from './clipboard'
import './ComputerView.css'
import { ContextMenu } from './ContextMenu'
import { somethingOver } from './Dialogs'
import { LiveScreen, ScreenClipboard, ScreenEvents } from './liveScreen'
import { useWatched } from './useStore'
import { type WindowModel, useWindowModel } from './windowModel'

/**
 * The full view opened (`WindowState.openComputer`): the computer is
 * started (`ensureForeverBox`) and nothing behind keeps the keys. From the
 * pane's preview, the hand-off card, a checkout's Review order and the
 * bank's check.
 */
export function openComputerView(
  model: WindowModel,
  store: AppStore,
  agentId: string,
  helper?: string,
): void {
  store.openComputer(agentId)
  model.openComputer(agentId, helper)
  const focused = document.activeElement
  if (focused instanceof HTMLElement) focused.blur()
}

/** The message field of the chat on screen, which takes the keys back when the view closes (`WindowState.composerFocus`). */
function messageField(): HTMLTextAreaElement | null {
  return document.querySelector<HTMLTextAreaElement>(
    '.chat-area .composer textarea.field',
  )
}

/** The agent's name, or "This agent" without one. */
function shownName(agent: Agent | undefined): string {
  return agent && agent.name !== '' ? agent.name : t('This agent')
}

// MARK: The screen

interface ScreenHandlers {
  onPhase: (phase: string) => void
  onClipboard?: (words: string) => void
  onHostKey?: (key: string) => void
  onPaste?: (words: string | undefined, shift: boolean) => void
  /** The screen once made, and none once it is gone. */
  onScreen?: (screen: LiveScreen | undefined) => void
}

/**
 * A screen of an agent's computer (`ComputerScreenView`), connected through
 * Simeon Labs' proxy once its address is known: asked again when the stream
 * comes back (a rebuilt computer has a new network token), every 3 s, 20
 * times at most. A new address is a new connection.
 */
function ScreenView({
  store,
  vncUrl,
  interactive = false,
  ...handlers
}: {
  store: AppStore
  vncUrl: string
  interactive?: boolean
} & ScreenHandlers) {
  const latest = useRef(handlers)
  useLayoutEffect(() => {
    latest.current = handlers
  })
  const [socket, setSocket] = useState<string>()
  const current = useRef<string>(undefined)
  const live = store.isLive
  useEffect(() => {
    let cancelled = false
    void (async () => {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const found = await store.screenSocket(vncUrl)
        if (cancelled) return
        if (found != null) {
          if (found !== current.current) {
            current.current = found
            setSocket(found)
            latest.current.onPhase('starting')
          }
          return
        }
        if (attempt === 0)
          streamLog.write(
            'box reachability outcome=network method=screenSocket cause=no-connection baseUrl=',
          )
        await new Promise((resolve) => setTimeout(resolve, 3000))
        if (cancelled) return
      }
    })()
    return () => {
      cancelled = true
    }
  }, [store, vncUrl, live])
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const element = host.current
    if (socket == null || !element) return
    const events = new ScreenEvents()
    events.onPhase = (phase) => latest.current.onPhase(phase)
    events.onClipboard = (words) => latest.current.onClipboard?.(words)
    events.onHostKey = (key) => latest.current.onHostKey?.(key)
    events.onPaste = (words, shift) => latest.current.onPaste?.(words, shift)
    const screen = new LiveScreen(element, socket, { interactive }, events)
    events.screen = screen
    latest.current.onScreen?.(screen)
    return () => {
      screen.close()
      latest.current.onScreen?.(undefined)
    }
  }, [socket, interactive])
  return (
    <div
      ref={host}
      key={socket}
      className={classes('screen-host', !interactive && 'watched')}
      aria-hidden={interactive ? undefined : true}
    />
  )
}

// MARK: The full view

/** The full computer view over the window (`ComputerLayer`), while one is open; closed, the message field takes the keys again. */
export function ComputerLayer({ store }: { store: AppStore }): ReactNode {
  const model = useWindowModel()
  useWatched(model)
  useWatched(store)
  const open = model.computer
  const was = useRef(open !== undefined)
  useEffect(() => {
    const showing = open !== undefined
    if (was.current && !showing) {
      const frame = window.requestAnimationFrame(() => {
        if (!somethingOver()) messageField()?.focus()
      })
      was.current = showing
      return () => window.cancelAnimationFrame(frame)
    }
    was.current = showing
  }, [open])
  if (!open) return null
  return (
    <ComputerFullView
      key={open.agentId}
      store={store}
      model={model}
      agentId={open.agentId}
      asked={open.helper}
    />
  )
}

/** The largest 16:10 that fits a box (`aspectRatio(…, contentMode: .fit)`). */
function useFitted(): [
  RefObject<HTMLDivElement | null>,
  { width: number; height: number },
] {
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  useLayoutEffect(() => {
    const element = box.current
    if (!element) return
    const measure = () => {
      const width = element.clientWidth
      const height = element.clientHeight
      const ratio = computerScreen.width / computerScreen.height
      const fitted = Math.min(width, height * ratio)
      setSize({ width: fitted, height: fitted / ratio })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return [box, size]
}

/**
 * An agent's computer over the whole window (`ComputerFullView`, `bbn`:
 * sidebar, chat and pane under it, the window showing through at 5%),
 * always the person's to use while it is open. At the top a 44 bar with
 * Exit fullscreen at its right; under it, 8 in: the hand-off's banner, the
 * screen as the largest 16:10 that fits, the helper's name when a helper's
 * screen is shown, and the other helpers' screens. Opening it started the
 * computer; closing it hands nothing back and lets go of the screen. While
 * it shows, the keys are the screen's: Escape, ⌘K, ⌘N and the rest too.
 */
function ComputerFullView({
  store,
  model,
  agentId,
  asked,
}: {
  store: AppStore
  model: WindowModel
  agentId: string
  asked?: string
}) {
  const name = shownName(store.agent(agentId))
  const status = store.computer.status(agentId)
  const helpers = store.computerHelpers(agentId)
  const focused = focusedHelper(helpers, asked)
  const helper = helpers.find((one) => one.subagentId === focused)
  const url = screenURL(status)
  // A helper's screen is a new connection (`{stageKey}:{url}`).
  const stageKey = focused ?? 'setup'
  const [phase, setPhase] = useState('starting')
  const phaseRef = useRef(phase)
  useLayoutEffect(() => {
    phaseRef.current = phase
  })
  const screen = useRef<LiveScreen>(undefined)
  const [clipboard] = useState(() => new ScreenClipboard())
  // The Windows app's clipboard, the Mac's way; none on the web.
  const [pcClipboard] = useState(() => appClipboard(clipboard))
  const view = useRef<HTMLDivElement>(null)
  const [stage, fitted] = useFitted()
  const helpersRef = useRef(helpers)
  useLayoutEffect(() => {
    helpersRef.current = helpers
  })

  // Another helper's screen is a new connection: its picture is on its way again.
  const lastStage = useRef(stageKey)
  useEffect(() => {
    if (lastStage.current === stageKey) return
    lastStage.current = stageKey
    setPhase('starting')
  }, [stageKey])

  // Once the screen is up it takes the keys (the window makes it the first responder when ready).
  useEffect(() => {
    if (phase === 'connected') screen.current?.focus()
  }, [phase])

  // The Windows app: this PC's words to the computer on a click in the screen, the window coming forward, or the screen coming up (`sendClipboard`).
  const sendClipboard = useRef(() => {})
  useLayoutEffect(() => {
    sendClipboard.current = () => {
      if (phaseRef.current === 'connected')
        void pcClipboard?.send(screen.current)
    }
  })
  useEffect(() => {
    if (phase === 'connected') sendClipboard.current()
  }, [phase])
  useEffect(() => {
    if (!pcClipboard) return
    const forward = () => sendClipboard.current()
    window.addEventListener('focus', forward)
    return () => window.removeEventListener('focus', forward)
  }, [pcClipboard])

  // Every key is the screen's while it shows; while the screen has none, Tab goes round the view's buttons and the arrows switch helpers' screens.
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (screen.current?.hasKeys) return
      // A menu over the view (More screens) has its own keys.
      if (document.querySelector('.context-menus')) return
      const element = view.current
      if (!element) return
      const plain =
        !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey
      if (event.key === 'Tab') {
        event.preventDefault()
        const stops = [
          ...element.querySelectorAll<HTMLElement>('button:not([disabled])'),
        ]
        if (stops.length === 0) return
        const at = stops.indexOf(document.activeElement as HTMLElement)
        const next =
          at < 0
            ? event.shiftKey
              ? stops.length - 1
              : 0
            : (at + (event.shiftKey ? -1 : 1) + stops.length) % stops.length
        stops[next]!.focus()
        return
      }
      if (
        plain &&
        (event.key === 'ArrowUp' ||
          event.key === 'ArrowDown' ||
          event.key === 'ArrowLeft' ||
          event.key === 'ArrowRight')
      ) {
        event.preventDefault()
        model.stepComputerHelper(
          event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 1,
          helpersRef.current,
        )
      }
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [model])

  const copy: ComputerPlaceholder | undefined =
    url == null
      ? fullPlaceholder(
          name,
          store.computer.readState(agentId),
          store.computer.phase(agentId),
          status?.pullPercent,
          helpers.length > 0,
        )
      : undefined
  return (
    <div
      ref={view}
      className="computer-view"
      role="dialog"
      aria-modal="true"
      aria-label={t`${name}'s screen`}
    >
      <ComputerTopBar exit={() => model.closeComputer()} />
      <div className="computer-body">
        {status?.handoff && (
          <HandoffBanner
            name={name}
            instruction={status.handoff.instruction}
            answer={(skip) => {
              void store.handBackComputer(agentId, skip)
              model.closeComputer()
            }}
          />
        )}
        <div ref={stage} className="computer-stage">
          {url != null ? (
            <div
              className="computer-screen"
              style={{ width: fitted.width, height: fitted.height }}
              onPointerDownCapture={() => sendClipboard.current()}
            >
              <ScreenView
                key={`${stageKey}:${url}`}
                store={store}
                vncUrl={url}
                interactive
                onPhase={setPhase}
                onScreen={(made) => {
                  screen.current = made
                }}
                // The arrows from inside the screen switch between helpers' screens too (`sand:vnc-host-key`).
                onHostKey={(key) =>
                  model.stepComputerHelper(
                    key === 'ArrowUp' || key === 'ArrowLeft' ? -1 : 1,
                    helpersRef.current,
                  )
                }
                // The computer's copied text onto this computer's clipboard, unless it was just sent either way; on the web only while the page has the focus, in the Windows app at once.
                onClipboard={(words) => {
                  if (pcClipboard) {
                    void pcClipboard.fromBox(words)
                    return
                  }
                  const fresh = clipboard.fromBox(words, document.hasFocus())
                  if (fresh != null)
                    void navigator.clipboard?.writeText(fresh).catch(() => {})
                }}
                // ⌘V: the words the computer doesn't hold go with the keys, read from the paste itself.
                onPaste={(words, shift) => {
                  if (phaseRef.current !== 'connected') return
                  pcClipboard?.pasted(words)
                  screen.current?.pasteAndPress(clipboard.toBox(words), shift)
                }}
              />
            </div>
          ) : (
            copy && (
              <PlaceholderWords
                copy={copy}
                tone="cover"
                retry={() => store.retryComputer(agentId)}
              />
            )
          )}
        </div>
        {helper && <div className="computer-helper-name">{helper.title}</div>}
        {helpers.length > 1 && url != null && (
          <HelperStrip
            store={store}
            helpers={helpers.filter((one) => one.subagentId !== focused)}
            vncUrl={url}
            pick={(pick) => model.showComputerHelper(pick)}
          />
        )}
      </div>
    </div>
  )
}

/**
 * The bar across the top (`ComputerTopBar`, `pbn`, 44 high, black at 55%):
 * 8 in from the left (the Mac's full screen: a page has no traffic lights),
 * and Exit fullscreen at the right (24 × 24, 6 round, the contract arrows in
 * white at 85%; white on a faint grey under the pointer). No title.
 */
function ComputerTopBar({ exit }: { exit: () => void }) {
  return (
    <div className="computer-top-bar">
      <span className="computer-drag" />
      <button
        type="button"
        className="computer-exit"
        title={t('Exit fullscreen')}
        aria-label={t('Exit fullscreen')}
        onClick={exit}
      >
        <ContractGlyph />
      </button>
    </div>
  )
}

/**
 * The hand-off over the screen (`HandoffBanner`, `Je`, 10 round, the orange
 * at 13%): the instruction or "{name} needs you" in amber (13/18, two lines
 * at most, all of it on hover), then Skip this step and I'm done, continue
 * (24 high, 6 round, 12/16). Both answer the agent, close the view and give
 * the message field the keys.
 */
function HandoffBanner({
  name,
  instruction,
  answer,
}: {
  name: string
  instruction: string
  answer: (skip: boolean) => void
}) {
  const words = instruction.trim() === '' ? t`${name} needs you` : instruction
  return (
    <div className="handoff-banner">
      <div className="handoff-banner-words" title={words}>
        {words}
      </div>
      <div className="handoff-banner-buttons">
        <button
          type="button"
          className="handoff-banner-button"
          onClick={() => answer(true)}
        >
          {t('Skip this step')}
        </button>
        <button
          type="button"
          className="handoff-banner-button primary"
          onClick={() => answer(false)}
        >
          {t("I'm done, continue")}
        </button>
      </div>
    </div>
  )
}

/**
 * The helpers' screens under the stage (`HelperStrip`, `fbn`, 122 high, 8
 * apart, centred): the others, all of them up to four, else three and "and
 * N more" with a menu of the rest. Each is the agent's screen watched only
 * (160 × 100, 8 round) over its name (12/16); a click switches to it.
 */
function HelperStrip({
  store,
  helpers,
  vncUrl,
  pick,
}: {
  store: AppStore
  helpers: ComputerHelper[]
  vncUrl: string
  pick: (subagentId: string) => void
}) {
  const strip = helperStrip(helpers.length)
  const [menu, setMenu] = useState<{ x: number; y: number }>()
  const rest = helpers.slice(strip.shown)
  return (
    <div className="helper-strip">
      {helpers.slice(0, strip.shown).map((helper) => (
        <button
          key={helper.subagentId}
          type="button"
          className="helper-tile"
          title={t`Switch to ${helper.title}`}
          aria-label={t`Switch to ${helper.title}`}
          onClick={() => pick(helper.subagentId)}
        >
          <HelperThumb store={store} vncUrl={vncUrl} />
          <span className="helper-name">{helper.title}</span>
        </button>
      ))}
      {strip.more != null && (
        <button
          type="button"
          className="helper-tile"
          title={t`${strip.more} more screens`}
          aria-label={t`Show ${strip.more} more screens`}
          onClick={(event) => {
            // Under the tile, or over it when the window's foot leaves no room (the menu: 24 a row, padded 5).
            const box = event.currentTarget.getBoundingClientRect()
            const tall = rest.length * 24 + 10
            const below = box.bottom + 4 + tall <= window.innerHeight - 8
            setMenu({
              x: box.left,
              y: below ? box.bottom + 4 : box.top - 4 - tall,
            })
          }}
        >
          <span className="helper-thumb more">
            <DisplayGlyph size={18} />
          </span>
          <span className="helper-name">{t`and ${strip.more} more`}</span>
        </button>
      )}
      {menu && (
        <ContextMenu
          label={t('More screens')}
          at={menu}
          close={() => setMenu(undefined)}
          items={rest.map((helper) => ({
            label: helper.title,
            action: () => pick(helper.subagentId),
          }))}
        />
      )}
    </div>
  )
}

/** A helper's thumbnail (`HelperThumb`): the agent's own screen (`CTn` gives each the agent's address), watched only, shown once connected. */
function HelperThumb({ store, vncUrl }: { store: AppStore; vncUrl: string }) {
  const [phase, setPhase] = useState('starting')
  return (
    <span className="helper-thumb">
      <span
        className="helper-screen"
        style={{ opacity: phase === 'connected' ? 1 : 0 }}
      >
        <ScreenView store={store} vncUrl={vncUrl} onPhase={setPhase} />
      </span>
    </span>
  )
}

// MARK: The Computer tab

/**
 * The Computer tab of an agent's pane (`ComputerPreview`, I03, `_bn`):
 * "Needs your attention" while the agent waits on the person; the frame
 * (the pane's width, 16:10, 14 round, the pane's grey and a hairline) with
 * the screen watched only, the agent's own pointer over it and "Open" on
 * hover or focus; the words for a screen not there yet, a spinner while it
 * connects (its notice after 20 seconds), "Screen preview unavailable"
 * after too many failures, or the display's glyph; "{name}'s screen" under
 * it. A click anywhere on the frame opens the full view, which starts the
 * computer; the tab itself only reads it (the window watches the open
 * agent's computer).
 */
export function ComputerPreview({
  store,
  agent,
}: {
  store: AppStore
  agent: Agent
}): ReactNode {
  const model = useWindowModel()
  useWatched(streamLog)
  const id = agent.id
  const status = store.computer.status(id)
  const read = store.computer.readState(id)
  const helpers = store.computerHelpers(id)
  const first = helpers[0]
  // While the full view shows this computer the preview draws nothing: one connection to it at a time.
  const covered = model.computer?.agentId === id
  const url = covered ? undefined : screenURL(status)
  const name = shownName(agent)
  const [phase, setPhase] = useState('starting')
  // "Connected" holds from the first connection until the page is loaded again (`DAe`): a reconnect keeps the picture.
  const [connected, setConnected] = useState(false)
  const [stuck, setStuck] = useState(false)
  const shownUrl = useRef(url)
  useEffect(() => {
    if (shownUrl.current === url) return
    shownUrl.current = url
    setConnected(false)
    setPhase('starting')
  }, [url])
  const onPhase = (now: string) => {
    setPhase(now)
    if (now === 'connected') setConnected(true)
    if (now === 'starting') setConnected(false)
  }
  const spinning = url != null && !connected && phase !== 'unavailable'
  // A spinner up 20 s gets its notice (`COMPUTER_STREAM_NOTICE_DELAY_MS`, checked 50 ms after).
  useEffect(() => {
    setStuck(false)
    if (!spinning) return
    const timer = setTimeout(
      () => setStuck(true),
      (computerScreen.noticeDelay + 0.05) * 1000,
    )
    return () => clearTimeout(timer)
  }, [spinning])
  const placeholder =
    url == null && !covered
      ? previewPlaceholder(
          name,
          read,
          store.computer.phase(id),
          status?.pullPercent,
        )
      : undefined
  return (
    <div className="computer-preview">
      {status?.handoff && (
        <ComputerAttention
          name={name}
          instruction={status.handoff.instruction}
          answer={(skip) => void store.handBackComputer(id, skip)}
        />
      )}
      <div
        className="computer-frame"
        role="group"
        aria-label={t('Computer preview')}
      >
        {url != null && (
          <>
            <span
              className="frame-screen"
              style={{
                opacity: connected && phase !== 'unavailable' ? 1 : 0,
              }}
            >
              <ScreenView store={store} vncUrl={url} onPhase={onPhase} />
            </span>
            <AgentPointerOverlay
              pointer={store.pointers[first?.subagentId ?? id]}
            />
          </>
        )}
        {/* The whole frame opens the computer; "Open" shows on hover or keyboard focus while there is a screen. */}
        <button
          type="button"
          className="frame-open"
          aria-label={first?.title ?? t('Open computer')}
          title={first?.title}
          onClick={() => openComputerView(model, store, id, first?.subagentId)}
        >
          {url != null && <OpenPill />}
        </button>
        {!covered &&
          (url != null ? (
            phase === 'unavailable' ? (
              <span className="frame-words">{ScreenCrashes.unavailable}</span>
            ) : (
              !connected && <ScreenSpinner size={20} />
            )
          ) : placeholder ? (
            <PlaceholderWords
              copy={placeholder}
              tone="pane"
              retry={() => store.retryComputer(id)}
            />
          ) : (
            <span className="frame-display">
              <DisplayGlyph size={13} />
            </span>
          ))}
        {/* A spinner up 20 seconds: why, at the frame's foot. */}
        {!covered && stuck && spinning && (
          <span className="frame-notice">
            {streamLog.notice(streamWords.notConnecting)}
          </span>
        )}
      </div>
      <div className="computer-caption">{t`${name}'s screen`}</div>
    </div>
  )
}

/** "Open" over the screen (`OpenPill`, 67 × 32): the expand arrows (11) and the word (12/16), light on the dark scrim, a capsule. */
function OpenPill() {
  return (
    <span className="open-pill" aria-hidden="true">
      <ExpandGlyph />
      <span>{t('Open')}</span>
    </span>
  )
}

/**
 * "Needs your attention" over the frame (`ComputerAttention`, `V1t`, 14
 * round, padded 10, the orange wash and a hairline): the title (13/18,
 * 500, orange), the instruction or "{name} needs you", then Skip this step
 * and I'm done, continue at the right (24 high, 6 round, 12/16). Both
 * answer the agent; neither opens or closes anything.
 */
function ComputerAttention({
  name,
  instruction,
  answer,
}: {
  name: string
  instruction: string
  answer: (skip: boolean) => void
}) {
  return (
    <div
      className="computer-attention"
      role="group"
      aria-label={t('Needs your attention')}
    >
      <div className="attention-words">
        <div className="attention-title">{t('Needs your attention')}</div>
        <div className="attention-instruction">
          {instruction.trim() === '' ? t`${name} needs you` : instruction}
        </div>
      </div>
      <div className="attention-buttons">
        <button
          type="button"
          className="attention-button"
          onClick={() => answer(true)}
        >
          {t('Skip this step')}
        </button>
        <button
          type="button"
          className="attention-button primary"
          onClick={() => answer(false)}
        >
          {t("I'm done, continue")}
        </button>
      </div>
    </div>
  )
}

// MARK: Words over a screen not there yet

/**
 * The words over a screen not there yet (`ComputerPlaceholderView`, `U1t`):
 * what is happening (13/18), a bar (how far, or moving), and Retry under
 * "Can't reach…" with the reason the log last gave, in red. In the pane's
 * tone (its grey, padded 12) or over the full view's dark (white, padded
 * 24). Only Retry takes the pointer.
 */
function PlaceholderWords({
  copy,
  tone,
  retry,
}: {
  copy: ComputerPlaceholder
  tone: 'pane' | 'cover'
  retry: () => void
}) {
  useWatched(streamLog)
  return (
    <div className={classes('placeholder-words', tone)}>
      <div className="placeholder-message">{copy.message}</div>
      {copy.isBusy && <ComputerBar percent={copy.percent} />}
      {copy.hasRetry && (
        <>
          <button type="button" className="placeholder-retry" onClick={retry}>
            {t('Retry')}
          </button>
          {/* The reason, at once, under "Can't reach…" (`computer-stream-notice.ts`). */}
          <div className="placeholder-notice">
            {streamLog.notice(streamWords.statusUnreadable)}
          </div>
        </>
      )}
    </div>
  )
}

/**
 * The bar under the words (`ComputerBar`, `Y9n`): 6 high and round, the
 * words' colour at 10% under it. Moving, a 30% piece crosses it every 1.4 s
 * (still with Reduce Motion); with a percent the track makes room for
 * "NN%" and fills to it. 237 wide with its label.
 */
function ComputerBar({ percent }: { percent?: number }) {
  const label = percent != null ? `${Math.round(percent)}%` : t('Loading')
  return (
    <div className="computer-bar" role="progressbar" aria-label={label}>
      <span className="bar-track">
        {percent != null ? (
          <span
            className="bar-fill"
            style={{ width: `${Math.min(Math.max(percent, 0), 100)}%` }}
          />
        ) : (
          <span className="bar-piece" />
        )}
      </span>
      {percent != null && <span className="bar-label">{label}</span>}
    </div>
  )
}

/** The window's spinner (`ScreenSpinner`): a ring (2) at 30% with its top quarter at 60%, turning every 0.7 s. */
function ScreenSpinner({ size }: { size: number }) {
  return (
    <span
      className="screen-spinner"
      role="img"
      aria-label={t('Loading')}
      style={{ width: size, height: size }}
    />
  )
}

// MARK: The agent's pointer

/**
 * The agent's own pointer on its screen (`AgentPointerOverlay`, `Abn`):
 * where it last moved or clicked, gliding there after the first, pressing
 * on a click once it has had half a second to get there (0.13 s down, 0.15
 * s back). Black with a white rim and a soft shadow, sized to the frame.
 */
function AgentPointerOverlay({ pointer }: { pointer?: AgentPointer }) {
  const box = useRef<HTMLSpanElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  useLayoutEffect(() => {
    const element = box.current
    if (!element) return
    const measure = () =>
      setSize({ width: element.clientWidth, height: element.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const moves = useRef(0)
  const lastMove = useRef<number>(undefined)
  const previous = useRef<AgentPointer>(undefined)
  const [pressed, setPressed] = useState(false)
  const [gliding, setGliding] = useState(false)
  // A press under way finishes even when the pointer moves on (the Mac's `Task`); the view going ends it.
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>())
  useEffect(() => {
    const running = timers.current
    return () => running.forEach(clearTimeout)
  }, [])
  useEffect(() => {
    const now = pointer
    if (!now || previous.current === now) return
    const old = previous.current
    previous.current = now
    const moved = old != null && (old.x !== now.x || old.y !== now.y)
    const sinceMove =
      lastMove.current != null ? (now.at - lastMove.current) / 1000 : undefined
    if (moved) lastMove.current = now.at
    moves.current += 1
    setGliding(moves.current > 1)
    if (now.type !== 'click') return
    const later = (ms: number, then: () => void) => {
      const timer = setTimeout(() => {
        timers.current.delete(timer)
        then()
      }, ms)
      timers.current.add(timer)
    }
    later(pressDelay(sinceMove ?? 0) * 1000, () => {
      setPressed(true)
      later(150, () => setPressed(false))
    })
  }, [pointer])
  const place =
    pointer && size.width > 0
      ? pointerPlace(pointer, size.width, size.height)
      : undefined
  const scale = pointerScale(size.width)
  return (
    <span ref={box} className="agent-pointer-layer" aria-hidden="true">
      {place && (
        <span
          className={classes('agent-pointer', gliding && 'gliding')}
          style={
            {
              // Its 20-point box centred 10 × scale past the place, drawn from its top left (`position`, `scaleEffect(anchor: .topLeading)`).
              left: place.x + 10 * scale - 10,
              top: place.y + 10 * scale - 10,
              '--pointer-scale': 0.85 * scale * (pressed ? 0.75 : 1),
            } as CSSProperties
          }
        >
          <PointerGlyph />
        </span>
      )}
    </span>
  )
}

// MARK: Glyphs

/** `display`: a screen on a short stand. */
function DisplayGlyph({ size }: { size: number }) {
  return (
    <svg
      width={size * 1.2}
      height={size}
      viewBox="0 0 24 20"
      aria-hidden="true"
    >
      <rect
        x="1.2"
        y="1.2"
        width="21.6"
        height="13.8"
        rx="2.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M12 15v3.4M7.8 18.6h8.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** `arrow.up.left.and.arrow.down.right`, 11 medium. */
function ExpandGlyph() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M2 6.5V2h4.5M2 2l5 5M14 9.5V14H9.5M14 14l-5-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** `arrow.down.right.and.arrow.up.left`, 12 medium: the arrows pointing in. */
function ContractGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M7 2.5V7H2.5M7 7 2 2M9 13.5V9h4.5M9 9l5 5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** `location.fill` turned a quarter left: a pointer's arrow, black with a white rim (two white copies 0.6 off each way). */
function PointerGlyph() {
  const arrow = 'M3 3 L10.6 21 L13.1 13.1 L21 10.6 Z'
  return (
    <svg width="20" height="20" viewBox="0 0 24 24">
      <path
        d={arrow}
        fill="#fff"
        stroke="#fff"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <path d={arrow} fill="#000" strokeLinejoin="round" />
    </svg>
  )
}
