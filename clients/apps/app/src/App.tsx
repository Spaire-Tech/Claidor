// The window (`AppRoot` and `MainWindow` in mac/Simeon/MainWindow.swift):
// the mark while the sign-in and the computer are found; a new account's
// first run, or the access cover; then the sidebar and the open agent's
// chat side by side. The agent left open stays open
// (the address keeps it, `?agent=`), else the first in the sidebar's order
// opens, the pins first (`WindowState.chooseFirst`).

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { t } from './l10n'
import type { WebSession } from './session'
import { AccessCover } from './window/AccessCover'
import { AboutLayer } from './window/AccountMenu'
import { AgentPaneColumn, paneShownWidth } from './window/AgentPane'
import { CallBanner } from './window/Call'
import { ChatPane } from './window/ChatPane'
import { ComputerDialogLayer, ComputerPills } from './window/ComputerStates'
import { ComputerLayer } from './window/ComputerView'
import { ConsentLayer } from './window/ConnectConsent'
import { Connector, ConnectorContext } from './window/connector'
import { ConnectorsLayer } from './window/Connectors'
import { somethingOver } from './window/Dialogs'
import { FeedbackLayer } from './window/Feedback'
import { FirstRunScreen } from './window/FirstRun'
import { apple } from './window/keys'
import { NewAgentLayer } from './window/NewAgentSheet'
import { OrgChartView } from './window/OrgChart'
import { SearchLayer } from './window/SearchPanel'
import { SettingsLayer, overSlot } from './window/SettingsWindow'
import { Sidebar, listOrder } from './window/Sidebar'
import {
  type SidebarSize,
  dragTo,
  keepSize,
  railWidth,
  readSize,
  showsRail,
  sidebarWidth,
  toggled,
} from './window/sidebarLayout'
import { StarterPackLayer } from './window/StarterPackSheet'
import { useWatched } from './window/useStore'
import { type Shown, ViewerContext, ViewerLayer } from './window/Viewers'
import { WindowContext, WindowModel } from './window/windowModel'

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

/**
 * The window's own keys that are not in a menu (MainWindow.swift's
 * `KeyWatcher`), with ⌘ on an Apple computer and Control elsewhere: ⌘B
 * folds and opens the sidebar; ⌘K opens and closes search, ⌘⇧F opens it;
 * ⌘N opens New Agent; ⌘⇧, the agent's pane on Profile, ⌘⇧I and ⌥⌘B the
 * pane as it was; ⌘, Settings on General, ⌘⇧M and ⌘⇧W Connectors (step 6).
 * None of them while a sheet or an alert is over the window (search's own
 * keys are its own), nor while the computer is (its screen has every key);
 * ⌘B, ⌘K, ⌘, and Connectors' keys also over Settings or Connectors, as
 * on the Mac. A browser keeps some for itself (⌘N opens a browser window;
 * Control-Shift-W closes it; on Windows, Control-Shift-I its developer
 * tools); the Windows app has them all.
 */
function useWindowKeys(
  model: WindowModel,
  resize: (change: (now: SidebarSize) => SidebarSize) => void,
) {
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.isComposing) return
      // The computer over the window (step 5b): every key is its screen's, ⌘K, ⌘N and ⌘B too (MainWindow.swift's `computerShowing`).
      if (model.computerShowing) return
      const command = apple ? event.metaKey : event.ctrlKey
      const other = apple ? event.ctrlKey : event.metaKey
      if (!command || other) return
      const letter = event.key.toLowerCase()
      const shift = event.shiftKey
      const alt = event.altKey
      // ⌘B, from a field too, over Settings or Connectors too.
      if (!shift && !alt && letter === 'b') {
        event.preventDefault()
        if (!overSlot()) resize(toggled)
        return
      }
      // ⌘K: search, open or closed, over Settings or Connectors too (its own panel takes the rest of its keys).
      if (!shift && !alt && letter === 'k') {
        event.preventDefault()
        if (!overSlot() || model.searchOpen) model.toggleSearch()
        return
      }
      // ⌘, (`sand.openSettings`): Settings on General, from a field too; again while it is open, nothing.
      if (!shift && !alt && event.key === ',') {
        event.preventDefault()
        if (!overSlot()) model.openSettings('general')
        return
      }
      // ⌘⇧M ("Customize") and ⌘⇧W ("Skills"): Connectors on Marketplace, from a field too.
      if (shift && !alt && (letter === 'm' || letter === 'w')) {
        event.preventDefault()
        if (!overSlot()) model.openConnectors()
        return
      }
      if (somethingOver()) return
      if (shift && !alt && letter === 'f') {
        event.preventDefault()
        model.openSearch()
      } else if (!shift && !alt && letter === 'n') {
        event.preventDefault()
        model.startNewChat()
      } else if (shift && !alt && (event.key === ',' || event.key === '<')) {
        event.preventDefault()
        model.toggleSettings()
      } else if (
        (shift && !alt && letter === 'i') ||
        (!shift && alt && event.code === 'KeyB')
      ) {
        event.preventDefault()
        model.toggleDetails()
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [model, resize])
}

function MainWindow({ session }: { session: WebSession }) {
  const store = session.store
  useWatched(store)
  const [model] = useState(() => new WindowModel(agentInAddress()))
  useWatched(model)
  // Connecting an app: one consent and one sign-in at a time, for the cards and Connectors alike (step 6b).
  const [connector] = useState(() => new Connector(store))
  // The agent left open while it is there, else the first in the sidebar's order.
  const asked = model.selected
  const known =
    asked != null && store.agents.some((agent) => agent.id === asked)
  const shown = known ? asked : listOrder(store)[0]
  useEffect(() => keepInAddress(shown), [shown])
  // Another agent shown: the pane starts on its Profile, or on the page asked for it.
  const lastShown = useRef(shown)
  useEffect(() => {
    if (lastShown.current === shown) return
    lastShown.current = shown
    model.agentChanged(shown)
  }, [model, shown])
  // Signed out (or the computer lost): the chart and what floats over the window go with it.
  useEffect(() => () => model.leftWindow(), [model])
  // The open agent's computer is read and followed while its chat shows, not a group's (MainWindow.swift's `watchedComputer`, step 5b).
  const watched =
    shown != null && store.agent(shown)?.isGroup === false ? shown : undefined
  useEffect(() => {
    if (watched == null) return
    store.watchComputer(watched)
    return () => store.unwatchComputer(watched)
  }, [store, watched])
  // The window coming forward (`windowCameForward`): a computer started here started again, what is watched read again (step 5b).
  useEffect(() => {
    const forward = () => store.windowCameForward()
    window.addEventListener('focus', forward)
    return () => window.removeEventListener('focus', forward)
  }, [store])
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
  // The pane folds the sidebar as it opens and opens it again as it closes (`agent-pane-compacts-sidebar`).
  const folded = useRef(size.isCollapsed)
  useLayoutEffect(() => {
    folded.current = size.isCollapsed
  }, [size.isCollapsed])
  useEffect(() => {
    model.setLayout({
      isCollapsed: () => folded.current,
      setCollapsed: (collapsed) => {
        folded.current = collapsed
        resize((now) =>
          now.isCollapsed === collapsed
            ? now
            : { ...now, isCollapsed: collapsed },
        )
      },
    })
    return () => model.setLayout(undefined)
  }, [model, resize])
  const [resizing, setResizing] = useState(false)
  // The agent's pane beside the chat, measured beside the sidebar as it stands.
  const standing = size.isCollapsed ? railWidth : size.expandedWidth
  const pane = paneShownWidth(model, standing, windowWidth)
  useLayoutEffect(() => model.setPaneVisible(pane > 0), [model, pane])
  const rail = showsRail(size, windowWidth - pane)
  const width = sidebarWidth(size, windowWidth - pane)
  useWindowKeys(model, resize)
  // A file's preview, or pictures and videos, over the window (`Viewers`), one at a time.
  const [viewer, setViewer] = useState<Shown>()
  const closeViewer = useCallback(() => setViewer(undefined), [])
  const choose = useCallback(
    (agentId: string) => model.choose(agentId),
    [model],
  )
  return (
    <WindowContext.Provider value={model}>
      <ConnectorContext.Provider value={connector}>
        <ViewerContext.Provider value={setViewer}>
          <div className={resizing ? 'window resizing' : 'window'}>
            <Sidebar
              store={store}
              open={shown}
              onOpen={choose}
              rail={rail}
              width={width}
              session={session}
            />
            <main className="chat-area">
              {/* Moves the Windows app's window, as the Mac's chat head and empty window do (window/desktop.css). */}
              <div className="window-drag" aria-hidden="true" />
              {model.orgChart ? (
                <OrgChartView store={store} />
              ) : (
                shown != null && (
                  <ChatPane
                    key={shown}
                    store={store}
                    agentId={shown}
                    onOpenAgent={choose}
                  />
                )
              )}
            </main>
            <AgentPaneColumn
              store={store}
              agentId={shown}
              shownWidth={pane}
              sidebarWidth={width}
            />
            <ResizeEdge
              left={width - 7}
              drag={(x) => resize((now) => dragTo(now, x, window.innerWidth))}
              dragging={setResizing}
            />
          </div>
          {/* What stands over the window, in the Mac's order: a viewer, the computer, Settings or Connectors (the one overlay slot), search, the sheets, the computer's dialogs and its pills; About and an app's consent over all of it; the call's banner above all (the Mac's own window). */}
          <ViewerLayer shown={viewer} store={store} close={closeViewer} />
          <ComputerLayer store={store} />
          <SettingsLayer store={store} session={session} />
          <ConnectorsLayer store={store} />
          <SearchLayer store={store} />
          <NewAgentLayer store={store} />
          <StarterPackLayer store={store} />
          <FeedbackLayer store={store} />
          <ComputerDialogLayer store={store} />
          <ComputerPills store={store} />
          <AboutLayer />
          <ConsentLayer connector={connector} />
          <CallBanner store={store} />
        </ViewerContext.Provider>
      </ConnectorContext.Provider>
    </WindowContext.Provider>
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
