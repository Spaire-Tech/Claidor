// The window (`AppRoot` and `MainWindow` in mac/Simeon/MainWindow.swift):
// the mark while the sign-in and the computer are found, then the sidebar
// and the chat side by side. The chat itself is step 2.

import { useState } from 'react'
import type { WebSession } from './session'
import { Sidebar } from './window/Sidebar'
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

function MainWindow({ session }: { session: WebSession }) {
  const [open, setOpen] = useState<string>()
  return (
    <div className="window">
      <Sidebar store={session.store} open={open} onOpen={setOpen} />
      <main className="chat-area" />
    </div>
  )
}

export function App({ session }: { session?: WebSession }) {
  useWatched(session ?? { subscribe: () => () => {}, getVersion: () => 0 })
  if (!session || session.phase !== 'signedIn') return <Splash />
  return <MainWindow session={session} />
}
