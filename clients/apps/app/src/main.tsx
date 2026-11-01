import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { currentLanguage } from './core/language'
import { loadWords } from './core/words'
import './index.css'

async function start() {
  // The person's language, chosen from the ones Simeon is in, before anything is drawn.
  const language = currentLanguage()
  document.documentElement.lang = language
  await loadWords(language)
  const root = document.getElementById('root')
  if (root) {
    createRoot(root).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  }
}

void start()
