// The window (`AppRoot` and `MainWindow` in mac/Simeon/MainWindow.swift):
// the mark while the sign-in and the computer are found; a new account's
// first run, or the access cover; then the sidebar and the open agent's
// chat side by side. The agent left open stays open
// (the address keeps it, `?agent=`), else the first in the sidebar's order
// opens, the pins first (`WindowState.chooseFirst`).

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { t } from './l10n'
import type { WebSession } from './session'
import { AccessCover } from './window/AccessCover'
import { ChatPane } from './window/ChatPane'
import { FirstRunScreen } from './window/FirstRun'
import { FlightPane, useFlightPane } from './window/FlightCards'
import { Sidebar, listOrder } from './window/Sidebar'
import {
  type SidebarSize,
  dragTo,
  keepSize,
  readSize,
  showsRail,
  sidebarWidth,
  toggled,
} from './window/sidebarLayout'
import { useWatched } from './window/useStore'
import { type Shown, ViewerContext, ViewerLayer } from './window/Viewers'

/** An Apple computer: its shortcuts take ⌘. */
const apple =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

/** The window's width, as it is resized. */
function useWindowWidth(): number {
  return useSyncExternalStore(
    (changed) => {
      window.addEventListener('resize', changed)
      return () => window.removeEventListener('resize', changed)
    },
    () => window.innerWidth,
  )
}

/**
 * The sidebar's right edge, 12 wide over its hairline (`SidebarResizeEdge`):
 * dragged, it widens, narrows or folds the sidebar; the pointer's place
 * across the window is the sidebar's new width.
 */
function ResizeEdge({
  left,
  drag,
  dragging,
}: {
  left: number
  drag: (x: number) => void
  dragging: (on: boolean) => void
}) {
  const held = useRef(false)
  return (
    <div
      className="resize-edge"
      style={{ left }}
      role="separator"
      aria-orientation="vertical"
      aria-label={t('Resize sidebar')}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        event.preventDefault()
        event.currentTarget.setPointerCapture(event.pointerId)
        held.current = true
        dragging(true)
        drag(event.clientX)
      }}
      onPointerMove={(event) => {
        if (held.current) drag(event.clientX)
      }}
      onPointerUp={() => {
        held.current = false
        dragging(false)
      }}
      onPointerCancel={() => {
        held.current = false
        dragging(false)
      }}
    />
  )
}

function Splash() {
  return (
    <main className="splash">
      <img
        className="mark"
        src={`${import.meta.env.BASE_URL}favicon.svg`}
        alt="Simeon"
      />
    </main>
  )
}

/** The agent the address names (`?agent=`), as the window was left. */
function agentInAddress(): string | undefined {
  if (typeof window === 'undefined') return undefined
  return new URLSearchParams(window.location.search).get('agent') ?? undefined
}

/** The address says which chat is open, so a reload or a sign-in's return comes back to it. */
function keepInAddress(agentId: string | undefined): void {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  if (agentId) url.searchParams.set('agent', agentId)
  else url.searchParams.delete('agent')
  if (url.href !== window.location.href)
    window.history.replaceState(null, '', url)
}

function MainWindow({ session }: { session: WebSession }) {
  const store = session.store
  useWatched(store)
  const [open, setOpen] = useState<string | undefined>(agentInAddress)
  // The agent left open while it is there, else the first in the sidebar's order.
  const known = open != null && store.agents.some((agent) => agent.id === open)
  const shown = known ? open : listOrder(store)[0]
  useEffect(() => keepInAddress(shown), [shown])
  // Files dropped outside the chat are taken by nothing, and the browser does not open them in the window's place.
  useEffect(() => {
    const refuse = (event: DragEvent) => {
      if (event.defaultPrevented) return
      if (!event.dataTransfer?.types.includes('Files')) return
      event.preventDefault()
      event.dataTransfer.dropEffect = 'none'
    }
    window.addEventListener('dragover', refuse)
    window.addEventListener('drop', refuse)
    return () => {
      window.removeEventListener('dragover', refuse)
      window.removeEventListener('drop', refuse)
    }
  }, [])
  // The sidebar's width, kept in this browser: its rail when folded or when the chat would be narrower than 424.
  const windowWidth = useWindowWidth()
  const [size, setSize] = useState<SidebarSize>(readSize)
  const resize = useCallback((change: (now: SidebarSize) => SidebarSize) => {
    setSize((now) => {
      const next = change(now)
      if (next !== now) keepSize(next)
      return next
    })
  }, [])
  const [resizing, setResizing] = useState(false)
  // A flight's details beside the chat (FlightCards.tsx, until the agent's pane in step 4): the sidebar is measured beside them.
  const pane = useFlightPane(store, shown, size, resize, windowWidth)
  const rail = showsRail(size, windowWidth - pane)
  const width = sidebarWidth(size, windowWidth - pane)
  // ⌘B (Control-B on Windows) folds the sidebar to its rail and opens it again, from a field too.
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const command = apple ? event.metaKey : event.ctrlKey
      if (!command || event.metaKey === event.ctrlKey) return
      if (event.shiftKey || event.altKey || event.key.toLowerCase() !== 'b')
        return
      event.preventDefault()
      resize(toggled)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [resize])
  // A file's preview, or pictures and videos, over the window (`Viewers`), one at a time.
  const [viewer, setViewer] = useState<Shown>()
  const closeViewer = useCallback(() => setViewer(undefined), [])
  return (
    <ViewerContext.Provider value={setViewer}>
      <div className={resizing ? 'window resizing' : 'window'}>
        <Sidebar
          store={store}
          open={shown}
          onOpen={setOpen}
          rail={rail}
          width={width}
        />
        <main className="chat-area">
          {shown != null && (
            <ChatPane
              key={shown}
              store={store}
              agentId={shown}
              onOpenAgent={setOpen}
            />
          )}
        </main>
        <FlightPane store={store} width={pane} />
        <ResizeEdge
          left={width - 7}
          drag={(x) => resize((now) => dragTo(now, x, window.innerWidth))}
          dragging={setResizing}
        />
      </div>
      <ViewerLayer shown={viewer} store={store} close={closeViewer} />
    </ViewerContext.Provider>
  )
}

/**
 * Signed in (`AppRoot`): the access cover when the account was refused
 * before its computer was ever reached; a new account's first run; else
 * the window.
 */
function SignedIn({ session }: { session: WebSession }) {
  const store = session.store
  useWatched(store)
  const covered =
    store.accessBlocked &&
    !store.hasReachedBox &&
    store.access.state !== 'granted'
  if (covered) return <AccessCover session={session} />
  if (session.phase === 'firstRun')
    return (
      <FirstRunScreen
        store={store}
        open={(agentId) => {
          // The window opens on Simeon's chat.
          if (agentId) keepInAddress(agentId)
          session.finishFirstRun()
        }}
      />
    )
  return <MainWindow session={session} />
}

export function App({ session }: { session?: WebSession }) {
  useWatched(session ?? { subscribe: () => () => {}, getVersion: () => 0 })
  if (!session) return <Splash />
  if (session.phase === 'signedIn' || session.phase === 'firstRun')
    return <SignedIn session={session} />
  return <Splash />
}
