import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { currentLanguage } from './core/language'
import { loadWords } from './core/words'
import { CallWindowPage } from './desktop/CallWindow'
import { desktop } from './desktop/desktop'
import { startDesktopLinks } from './desktop/links'
import { listenForQuitting } from './desktop/quitting'
import { desktopSessionOptions, startDesktopSession } from './desktop/session'
import { DesktopSurfaces } from './desktop/surfaces'
import { followWindowLook } from './desktop/windowLook'
import './index.css'
import { WebSession } from './session'
import { mountDeepLinks } from './window/DeepLinks'
import { QuitAlert, quitAsk } from './window/QuitAlert'
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
  // Quitting while an agent works in the app's browser asks first (window/QuitAlert.tsx).
  if (host)
    listenForQuitting(
      host,
      quitAsk(() => session.store),
    )
  // Windows' caption buttons in the page's colours, following the theme (src/desktop/windowLook.ts).
  if (host) followWindowLook(host)
  // The logs and the chats kept on this PC (src/desktop/session.ts); the call's window returned above and never signs in.
  if (host) startDesktopSession(host, session)
  // Windows' notifications, the taskbar, the tray and the menu keys, for the app's life (src/desktop/surfaces.ts).
  if (host) new DesktopSurfaces(host, session).start()
  // In the Windows app's own window: `simeon://` links, heard from the start (the Deep Links dialog shows signed out too; 7d).
  if (host?.facts.window === 'main')
    mountDeepLinks(startDesktopLinks(host, () => session.store))
  const root = document.getElementById('root')
  if (root) {
    createRoot(root).render(
      <StrictMode>
        <App session={session} />
        {host && <QuitAlert />}
      </StrictMode>,
    )
  }
  await session.start()
}

void start()
