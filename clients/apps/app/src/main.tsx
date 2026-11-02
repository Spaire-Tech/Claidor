import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { currentLanguage } from './core/language'
import { loadWords } from './core/words'
import './index.css'
import { WebSession } from './session'
import { applyTheme } from './window/theme'

async function start() {
  // The theme chosen in Settings (`simeon.theme`), before anything is drawn.
  applyTheme()
  // The person's language, chosen from the ones Simeon is in, before anything is drawn.
  const language = currentLanguage()
  document.documentElement.lang = language
  await loadWords(language)
  const session = new WebSession()
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
