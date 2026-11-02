import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { currentLanguage } from './core/language'
import { loadWords } from './core/words'
import { CallWindowPage } from './desktop/CallWindow'
import { desktop } from './desktop/desktop'
import { listenForQuitting } from './desktop/quitting'
import { desktopSessionOptions } from './desktop/session'
import { DesktopSurfaces } from './desktop/surfaces'
import './index.css'
import { WebSession } from './session'
import './window/desktop.css'
import { applyTheme } from './window/theme'

async function start() {
  // The theme chosen in Settings (`simeon.theme`), before anything is drawn.
  applyTheme()
  // The person's language, chosen from the ones Simeon is in, before anything is drawn.
  const language = currentLanguage()
  document.documentElement.lang = language
  await loadWords(language)
  // In the Windows app: its own server, keeping and name (src/desktop/session.ts), and the window's own drag areas (window/desktop.css).
  const host = desktop()
  if (host) document.documentElement.dataset.desktop = host.facts.platform
  // The Windows app's call window: the call's banner alone (src/desktop/CallWindow.tsx), no session of its own.
  if (host?.facts.window === 'call') {
    document.documentElement.dataset.window = 'call'
    const root = document.getElementById('root')
    if (root)
      createRoot(root).render(
        <StrictMode>
          <CallWindowPage host={host} />
        </StrictMode>,
      )
    return
  }
  const session = new WebSession(host ? desktopSessionOptions(host) : {})
  if (host) listenForQuitting(host)
  // Windows' notifications, the taskbar, the tray and the menu keys, for the app's life (src/desktop/surfaces.ts).
  if (host) new DesktopSurfaces(host, session).start()
  const root = document.getElementById('root')
  if (root) {
    createRoot(root).render(
      <StrictMode>
        <App session={session} />
      </StrictMode>,
    )
  }
  await session.start()
}

void start()
