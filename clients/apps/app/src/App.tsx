// The window (`AppRoot` and `MainWindow` in mac/Simeon/MainWindow.swift):
// the mark while the sign-in and the computer are found, then the sidebar
// and the open agent's chat side by side. The agent left open stays open
// (the address keeps it, `?agent=`), else the first in the list opens
// (`WindowState.chooseFirst`).

import { useCallback, useEffect, useState } from 'react'
import type { WebSession } from './session'
import { ChatPane } from './window/ChatPane'
import { Sidebar } from './window/Sidebar'
import { type Shown, ViewerContext, ViewerLayer } from './window/Viewers'
import { useWatched } from './window/useStore'

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
  // The agent left open while it is there, else the first in the list.
  const known = open != null && store.agents.some((agent) => agent.id === open)
  const shown = known ? open : store.agents.find((agent) => !agent.isHidden)?.id
  useEffect(() => keepInAddress(shown), [shown])
  // A file's preview, or pictures and videos, over the window (`Viewers`), one at a time.
  const [viewer, setViewer] = useState<Shown>()
  const closeViewer = useCallback(() => setViewer(undefined), [])
  return (
    <ViewerContext.Provider value={setViewer}>
      <div className="window">
        <Sidebar store={store} open={shown} onOpen={setOpen} />
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
      </div>
      <ViewerLayer shown={viewer} store={store} close={closeViewer} />
    </ViewerContext.Provider>
  )
}

export function App({ session }: { session?: WebSession }) {
  useWatched(session ?? { subscribe: () => () => {}, getVersion: () => 0 })
  if (!session || session.phase !== 'signedIn') return <Splash />
  return <MainWindow session={session} />
}
