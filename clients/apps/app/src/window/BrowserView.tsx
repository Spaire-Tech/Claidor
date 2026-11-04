// The browser in the app, in the Computer tab (docs/app-browser/README.md,
// step 2b): an agent's tabs in the Windows app's own browser, seen as a live
// picture (src/desktop/browser.ts; the tabs themselves are
// windows/src/main/browser). There is no Mac screen to translate yet: the
// Mac's view comes in step 4, from these words and measures.
//
// - The pane's Computer tab: a grey line saying where the work happens ("On
//   this PC"), the agent's tab in the frame the computer's screen has, the
//   agent's face where it points, and the site with its lock under it. A
//   click opens the full view; Simeon's computer isn't started.
// - The full view over the window, like a small Safari: Back, Forward and
//   Reload, the site with its lock, Take control in blue (Give back while
//   the person has it), the agent's tabs as pills with their sites' icons
//   when there are two or more, and the page as the largest 16:10 that
//   fits. While the person has control, the agent waits, its face is gone,
//   and the page takes the person's pointer, wheel and keys; closing the
//   view gives it back.

import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { pictureURL } from '../core/faces'
import type { Agent } from '../core/models'
import type { AppStore } from '../core/store'
import {
  type BrowserShown,
  type PCBrowser,
  isSecure,
  keyInput,
  modifiersOf,
  pcBrowser,
  showsPCBrowser,
  siteOf,
} from '../desktop/browser'
import type { BrowserTabShown } from '../desktop/contract'
import { t } from '../l10n'
import { AgentPicture } from './AgentMark'
import './BrowserView.css'
import { classes } from './classes'
import {
  AgentPointerOverlay,
  ComputerAttention,
  ContractGlyph,
  HandoffBanner,
  OpenPill,
  ScreenSpinner,
  openComputerView,
} from './ComputerView'
import { useSiteIcon } from './MessageText'
import { useWatched } from './useStore'
import { type WindowModel, useWindowModel } from './windowModel'

/** The page's own pixels: every tab is drawn at this size (windows/src/main/browser/tabs.ts). */
const page = { width: 1280, height: 800 }

const nothingWatched = { subscribe: () => () => {}, getVersion: () => 0 }

/** The agent's browser on this PC while a view draws it; undefined on the web, until the app has said, and for another agent. */
export function usePCBrowser(agentId: string): BrowserShown | undefined {
  const browser = pcBrowser()
  useEffect(
    () => (browser ? browser.want(agentId) : undefined),
    [browser, agentId],
  )
  useWatched(browser ?? nothingWatched)
  return browser?.shown(agentId)
}

/** The agent's name, or "This agent" without one. */
function shownName(agent: Agent | undefined): string {
  return agent && agent.name !== '' ? agent.name : t('This agent')
}

/** The grey line at the top of the Computer tab: where the agent's work happens (shown once the server's switch is on for the person). */
export function WhereLine({ onPC }: { onPC: boolean }) {
  return (
    <div className="computer-where">
      {onPC ? t('On this PC') : t("On Simeon's computer")}
    </div>
  )
}

// MARK: The picture

/** The agent's tab as the app last drew it, on a canvas of the page's size; `drawn` once the first picture is up. */
function BrowserPicture({
  browser,
  agentId,
  drawn,
}: {
  browser: PCBrowser
  agentId: string
  drawn?: () => void
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const latestDrawn = useRef(drawn)
  useLayoutEffect(() => {
    latestDrawn.current = drawn
  })
  useEffect(() => {
    const element = canvas.current
    if (!element) return
    const context = element.getContext('2d')
    let gone = false
    let busy = false
    let waiting: Parameters<Parameters<PCBrowser['onFrame']>[1]>[0] | undefined
    const draw = async (frame: NonNullable<typeof waiting>) => {
      busy = true
      try {
        const bitmap = await createImageBitmap(
          new Blob([frame.jpeg as BlobPart], { type: 'image/jpeg' }),
        )
        if (!gone) {
          if (element.width !== frame.width) element.width = frame.width
          if (element.height !== frame.height) element.height = frame.height
          context?.drawImage(bitmap, 0, 0)
          latestDrawn.current?.()
        }
        bitmap.close()
      } catch {
        // A picture that can't be read is skipped; the next one comes.
      } finally {
        busy = false
      }
      // Only the newest of the pictures that came meanwhile is drawn.
      const next = waiting
      waiting = undefined
      if (next && !gone) void draw(next)
    }
    const stop = browser.onFrame(agentId, (frame) => {
      if (busy) waiting = frame
      else void draw(frame)
    })
    return () => {
      gone = true
      stop()
    }
  }, [browser, agentId])
  return (
    <canvas
      ref={canvas}
      className="browser-canvas"
      width={page.width}
      height={page.height}
      aria-hidden="true"
    />
  )
}

/** The agent's face as its pointer: its picture (or the quiet disc) in a white rim. */
function FacePointer({ agent }: { agent: Agent | undefined }) {
  return (
    <span className="face-pointer-disc">
      <AgentPicture url={agent ? pictureURL(agent) : undefined} size={22} />
    </span>
  )
}

/** The site of the tab with its lock, "Not Secure" before a page that didn't come over https, "New Tab" for a tab with no page. */
function SiteLine({ tab }: { tab: BrowserTabShown | undefined }) {
  const site = tab ? siteOf(tab.url) : ''
  if (site === '') return <span className="browser-site">{t('New Tab')}</span>
  const secure = isSecure(tab?.url ?? '')
  return (
    <span className="browser-site" title={tab?.url}>
      {secure ? (
        <LockGlyph />
      ) : (
        <span className="browser-not-secure">{t('Not Secure')}</span>
      )}
      <span className="browser-site-name">{site}</span>
    </span>
  )
}

// MARK: The Computer tab

/**
 * The Computer tab while the agent's tabs are on this PC: the grey line,
 * the frame (the pane's width, 16:10, as the computer's screen) with the
 * picture, the agent's face where it points and "Open" on hover or focus, a
 * spinner until the first picture, and the site with its lock under it.
 */
export function BrowserPreview({
  store,
  agent,
  shown,
}: {
  store: AppStore
  agent: Agent
  shown: BrowserShown
}): ReactNode {
  const model = useWindowModel()
  const browser = pcBrowser()
  const [drawn, setDrawn] = useState(false)
  const tab = shown.tabs.find((one) => one.id === shown.current)
  const name = shownName(agent)
  const handoff = store.computer.status(agent.id)?.handoff
  if (!browser) return null
  return (
    <div className="computer-preview">
      <WhereLine onPC />
      {handoff && (
        <ComputerAttention
          name={name}
          instruction={handoff.instruction}
          answer={(skip) => handBack(store, agent.id, skip)}
        />
      )}
      <div
        className="computer-frame"
        role="group"
        aria-label={t`${name}'s browser`}
      >
        <span className="frame-screen" style={{ opacity: drawn ? 1 : 0 }}>
          <BrowserPicture
            browser={browser}
            agentId={agent.id}
            drawn={() => setDrawn(true)}
          />
        </span>
        {!shown.person && (
          <AgentPointerOverlay
            pointer={shown.pointer}
            face={<FacePointer agent={agent} />}
          />
        )}
        <button
          type="button"
          className="frame-open"
          aria-label={t('Open')}
          onClick={() => openBrowserView(model, agent.id)}
        >
          <OpenPill />
        </button>
        {!drawn && <ScreenSpinner size={20} />}
      </div>
      <div className="computer-caption">
        <SiteLine tab={tab} />
      </div>
    </div>
  )
}

/** The full view of the agent's browser over the window; nothing behind keeps the keys. */
export function openBrowserView(model: WindowModel, agentId: string): void {
  model.openBrowser(agentId)
  const focused = document.activeElement
  if (focused instanceof HTMLElement) focused.blur()
}

/**
 * Where a card opens the agent's screen (step 3): its tab on this PC when
 * the Computer tab shows it there, in Take control when the person is
 * asked to act (the take-over, the bank's check); else Simeon's computer
 * over the window, as before, which starts it.
 */
export async function openAgentScreen(
  model: WindowModel,
  store: AppStore,
  agentId: string,
  options: { control: boolean },
): Promise<void> {
  const browser = pcBrowser()
  const shown = browser ? await browser.peek(agentId) : undefined
  if (browser && showsPCBrowser(shown, store.computerHelpers(agentId).length)) {
    if (options.control) browser.control(agentId, true)
    openBrowserView(model, agentId)
    return
  }
  openComputerView(model, store, agentId)
}

/** Whether the agent's page is in this PC's browser now, asked once while `asking` (an open in-chat form says where its values are typed). */
export function useOnThisPC(
  store: AppStore,
  agentId: string,
  asking: boolean,
): boolean {
  const [onPC, setOnPC] = useState(false)
  useEffect(() => {
    const browser = pcBrowser()
    if (!browser || !asking) return
    let live = true
    void browser.peek(agentId).then((shown) => {
      if (live)
        setOnPC(showsPCBrowser(shown, store.computerHelpers(agentId).length))
    })
    return () => {
      live = false
    }
  }, [store, agentId, asking])
  return onPC
}

/** The take-over answered (I'm done, Skip): the agent's browser on this PC given back first, so its next step doesn't wait, then the agent told. */
export function handBack(store: AppStore, agentId: string, skip = false): void {
  pcBrowser()?.control(agentId, false)
  void store.handBackComputer(agentId, skip)
}

// MARK: The full view

/** The largest 16:10 that fits a box. */
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
      const ratio = page.width / page.height
      const fitted = Math.min(element.clientWidth, element.clientHeight * ratio)
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
 * The agent's browser over the whole window (the computer's full view, its
 * dark and its bar): Back, Forward, Reload (Stop while a page loads), the
 * site, Take control or Give back, and Exit fullscreen; the agent's tabs as
 * pills under the bar when there are two or more; the page. The bar's
 * buttons and the pills are the person's while they have control. The tabs
 * all closing closes it.
 */
export function BrowserFullView({
  store,
  model,
  agentId,
}: {
  store: AppStore
  model: WindowModel
  agentId: string
}) {
  const browser = pcBrowser()
  const shown = usePCBrowser(agentId)
  const agent = store.agent(agentId)
  const name = shownName(agent)
  const [stage, fitted] = useFitted()
  const view = useRef<HTMLDivElement>(null)
  const person = shown?.person === true
  // The agent asked for the person here (request_box_help): its banner, as over the computer's screen.
  const handoff = store.computer.status(agentId)?.handoff

  // Nothing of the agent's here any more (its tabs closed, or the web): back to the window.
  const known = shown !== undefined
  const empty = known && shown.tabs.length === 0
  useEffect(() => {
    if (!browser || empty) model.closeComputer()
  }, [browser, empty, model])

  // Closing the view gives the browser back.
  const held = useRef(person)
  useLayoutEffect(() => {
    held.current = person
  })
  useEffect(
    () => () => {
      if (held.current) browser?.control(agentId, false)
    },
    [browser, agentId],
  )

  // Tab goes round the view's own buttons while the page doesn't have the keys.
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const element = view.current
      if (!element || element.querySelector('.browser-keys:focus')) return
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
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [])

  if (!browser) return null
  const tab = shown?.tabs.find((one) => one.id === shown.current)
  const act = (what: 'back' | 'forward' | 'reload' | 'stop') =>
    browser.bar(agentId, { act: what })
  return (
    <div
      ref={view}
      className="computer-view browser-view"
      role="dialog"
      aria-modal="true"
      aria-label={t`${name}'s browser`}
    >
      <div className="computer-top-bar browser-bar">
        <BarButton
          label={t('Back')}
          disabled={!person || !shown?.canGoBack}
          onClick={() => act('back')}
        >
          <ChevronGlyph flip />
        </BarButton>
        <BarButton
          label={t('Forward')}
          disabled={!person || !shown?.canGoForward}
          onClick={() => act('forward')}
        >
          <ChevronGlyph />
        </BarButton>
        {tab?.loading ? (
          <BarButton
            label={t('Stop')}
            disabled={!person}
            onClick={() => act('stop')}
          >
            <StopGlyph />
          </BarButton>
        ) : (
          <BarButton
            label={t('Reload')}
            disabled={!person || !tab}
            onClick={() => act('reload')}
          >
            <ReloadGlyph />
          </BarButton>
        )}
        <span className="computer-drag" />
        <div className="browser-address">
          <SiteLine tab={tab} />
        </div>
        <span className="computer-drag" />
        <button
          type="button"
          className={classes('browser-control', person && 'held')}
          onClick={() => browser.control(agentId, !person)}
        >
          {person ? t('Give back') : t('Take control')}
        </button>
        <button
          type="button"
          className="computer-exit"
          title={t('Exit fullscreen')}
          aria-label={t('Exit fullscreen')}
          onClick={() => model.closeComputer()}
        >
          <ContractGlyph />
        </button>
      </div>
      {shown && shown.tabs.length > 1 && (
        <div className="browser-pills" role="tablist" aria-label={t('Tabs')}>
          {shown.tabs.map((one) => (
            <TabPill
              key={one.id}
              tab={one}
              current={one.id === shown.current}
              enabled={person}
              choose={() =>
                browser.bar(agentId, { act: 'select', tabId: one.id })
              }
            />
          ))}
        </div>
      )}
      <div className="computer-body">
        {handoff && (
          <HandoffBanner
            name={name}
            instruction={handoff.instruction}
            answer={(skip) => {
              handBack(store, agentId, skip)
              model.closeComputer()
            }}
          />
        )}
        {person && !handoff && (
          <div className="browser-paused">
            {t`${name} is paused while you're in control.`}
          </div>
        )}
        <div ref={stage} className="computer-stage">
          <div
            className="computer-screen browser-screen"
            style={{ width: fitted.width, height: fitted.height }}
          >
            <BrowserPicture browser={browser} agentId={agentId} />
            {person ? (
              <PersonInput
                browser={browser}
                agentId={agentId}
                cursor={shown?.cursor ?? 'default'}
              />
            ) : (
              <AgentPointerOverlay
                pointer={shown?.pointer}
                face={<FacePointer agent={agent} />}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function BarButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className="browser-bar-button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

/** A tab's pill: its site's icon (the globe until it comes) and its title; the person's to choose while they have control. */
function TabPill({
  tab,
  current,
  enabled,
  choose,
}: {
  tab: BrowserTabShown
  current: boolean
  enabled: boolean
  choose: () => void
}) {
  const site = siteOf(tab.url)
  const title = site === '' ? t('New Tab') : tab.title || site
  return (
    <button
      type="button"
      role="tab"
      aria-selected={current}
      className={classes('browser-pill', current && 'current')}
      disabled={!enabled && !current}
      title={tab.url}
      onClick={() => {
        if (enabled && !current) choose()
      }}
    >
      {site !== '' ? <PillIcon site={site} /> : <GlobeGlyph />}
      <span className="browser-pill-title">{title}</span>
    </button>
  )
}

/** The site's own /favicon.ico once it has come (never a favicon service), the globe meanwhile and for a site without one. */
function PillIcon({ site }: { site: string }) {
  const [state, settle] = useSiteIcon(site)
  return (
    <>
      {state !== 'shown' && <GlobeGlyph />}
      {state !== 'none' && (
        <img
          className={
            state === 'shown' ? 'browser-pill-icon' : 'browser-pill-icon coming'
          }
          src={`https://${site}/favicon.ico`}
          alt=""
          aria-hidden="true"
          referrerPolicy="no-referrer"
          onLoad={(event) => settle(event.currentTarget.naturalWidth > 0)}
          onError={() => settle(false)}
        />
      )}
    </>
  )
}

// MARK: The person's input

/**
 * Over the page while the person has control: the pointer, the wheel and
 * the keys go to the tab, placed in the page's own pixels; the page's own
 * pointer shows. A field off screen takes the keys, so a keyboard's
 * composition (accents, Chinese, Japanese) arrives as words.
 */
function PersonInput({
  browser,
  agentId,
  cursor,
}: {
  browser: PCBrowser
  agentId: string
  cursor: string
}) {
  const layer = useRef<HTMLDivElement>(null)
  const keys = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    keys.current?.focus()
  }, [])

  useEffect(() => {
    const element = layer.current
    if (!element) return
    const place = (event: MouseEvent) => {
      const rect = element.getBoundingClientRect()
      const x =
        ((event.clientX - rect.left) / Math.max(1, rect.width)) * page.width
      const y =
        ((event.clientY - rect.top) / Math.max(1, rect.height)) * page.height
      return {
        x: Math.min(page.width, Math.max(0, x)),
        y: Math.min(page.height, Math.max(0, y)),
      }
    }
    const buttonOf = (button: number) =>
      button === 0
        ? 'left'
        : button === 1
          ? 'middle'
          : button === 2
            ? 'right'
            : 'none'
    let moving: number | undefined
    let lastMove: MouseEvent | undefined
    const sendMove = () => {
      moving = undefined
      const event = lastMove
      if (!event) return
      const at = place(event)
      browser.input(agentId, {
        kind: 'mouse',
        type: 'mouseMoved',
        ...at,
        button: 'none',
        buttons: event.buttons & 7,
        clickCount: 0,
        modifiers: modifiersOf(event),
      })
    }
    // Moves are sent once a frame at most.
    const move = (event: MouseEvent) => {
      lastMove = event
      if (moving === undefined) moving = window.requestAnimationFrame(sendMove)
    }
    const press = (
      event: MouseEvent,
      type: 'mousePressed' | 'mouseReleased',
    ) => {
      if (moving !== undefined) {
        window.cancelAnimationFrame(moving)
        sendMove()
      }
      const at = place(event)
      browser.input(agentId, {
        kind: 'mouse',
        type,
        ...at,
        button: buttonOf(event.button),
        buttons: event.buttons & 7,
        clickCount: Math.max(1, Math.min(3, event.detail || 1)),
        modifiers: modifiersOf(event),
      })
    }
    const down = (event: MouseEvent) => {
      event.preventDefault()
      keys.current?.focus()
      press(event, 'mousePressed')
      // A press held past the page's edge still ends on it.
      const up = (released: MouseEvent) => {
        window.removeEventListener('mouseup', up, true)
        window.removeEventListener('mousemove', move, true)
        press(released, 'mouseReleased')
      }
      window.addEventListener('mouseup', up, true)
      window.addEventListener('mousemove', move, true)
    }
    const hover = (event: MouseEvent) => {
      if (event.buttons === 0) move(event)
    }
    const wheel = (event: WheelEvent) => {
      event.preventDefault()
      const scale =
        event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? page.height : 1
      browser.input(agentId, {
        kind: 'wheel',
        ...place(event),
        deltaX: event.deltaX * scale,
        deltaY: event.deltaY * scale,
        modifiers: modifiersOf(event),
      })
    }
    const menu = (event: Event) => event.preventDefault()
    element.addEventListener('mousedown', down)
    element.addEventListener('mousemove', hover)
    element.addEventListener('wheel', wheel, { passive: false })
    element.addEventListener('contextmenu', menu)
    return () => {
      if (moving !== undefined) window.cancelAnimationFrame(moving)
      element.removeEventListener('mousedown', down)
      element.removeEventListener('mousemove', hover)
      element.removeEventListener('wheel', wheel)
      element.removeEventListener('contextmenu', menu)
    }
  }, [browser, agentId])

  const key = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    const native = event.nativeEvent
    const input = keyInput(native)
    if (!input) return
    event.preventDefault()
    event.stopPropagation()
    browser.input(agentId, input)
  }
  return (
    <div ref={layer} className="browser-input" style={{ cursor }}>
      <textarea
        ref={keys}
        className="browser-keys"
        aria-label={t('Take control')}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        onKeyDown={key}
        onKeyUp={key}
        onCompositionEnd={(event) => {
          const words = event.data
          if (words)
            browser.input(agentId, {
              kind: 'text',
              text: words.slice(0, 2_000),
            })
          event.currentTarget.value = ''
        }}
        onInput={(event) => {
          // Anything typed here outside a composition went to the page already.
          if (!(event.nativeEvent as InputEvent).isComposing)
            event.currentTarget.value = ''
        }}
      />
    </div>
  )
}

// MARK: Glyphs

function LockGlyph() {
  return (
    <svg
      className="browser-lock"
      width="10"
      height="12"
      viewBox="0 0 10 12"
      aria-hidden="true"
    >
      <path
        d="M2.5 5V3.6a2.5 2.5 0 0 1 5 0V5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <rect x="1" y="5" width="8" height="6.4" rx="1.4" fill="currentColor" />
    </svg>
  )
}

function ChevronGlyph({ flip = false }: { flip?: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path
        d={flip ? 'M8.8 2.5 4.3 7l4.5 4.5' : 'M5.2 2.5 9.7 7l-4.5 4.5'}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ReloadGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M11.4 7.2a4.4 4.4 0 1 1-1.3-3.3" />
        <path d="M10.6 1.6v2.6H8" />
      </g>
    </svg>
  )
}

function StopGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path
        d="m3.5 3.5 7 7m0-7-7 7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

function GlobeGlyph() {
  return (
    <svg
      className="browser-pill-globe"
      width="14"
      height="14"
      viewBox="0 0 16 16"
      aria-hidden="true"
    >
      <g fill="none" stroke="currentColor" strokeWidth="1.1">
        <circle cx="8" cy="8" r="6.5" />
        <ellipse cx="8" cy="8" rx="2.8" ry="6.5" />
        <path d="M1.5 8h13" />
      </g>
    </svg>
  )
}
