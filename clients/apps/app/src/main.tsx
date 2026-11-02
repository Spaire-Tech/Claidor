import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { currentLanguage } from './core/language'
import { loadWords } from './core/words'
import { desktop } from './desktop/desktop'
import { startDesktopLinks } from './desktop/links'
import { listenForQuitting } from './desktop/quitting'
import { desktopSessionOptions } from './desktop/session'
import './index.css'
import { WebSession } from './session'
import { mountDeepLinks } from './window/DeepLinks'
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
  const session = new WebSession(host ? desktopSessionOptions(host) : {})
  if (host) listenForQuitting(host)
  // In the Windows app's own window: `simeon://` links, heard from the start (the Deep Links dialog shows signed out too; 7d).
  if (host?.facts.window === 'main')
    mountDeepLinks(startDesktopLinks(host, () => session.store))
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
