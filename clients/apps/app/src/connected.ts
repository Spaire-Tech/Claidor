// connected.html's script: the page that ends a connected app's sign-in
// come back through Simeon Labs' server (connectedPage.ts says what it
// does), in the person's language and the theme chosen in this browser.

import './connected.css'
import {
  type PageWords,
  connectingWords,
  finishSignIn,
  pageClientVersion,
} from './connectedPage'
import { MemoryVault, SimeonAPI, resolveApiBase } from './core/api'
import { Gateway } from './core/gateway'
import { currentLanguage } from './core/language'
import { loadWords } from './core/words'
import { applyTheme } from './window/theme'

function say(words: PageWords): void {
  const title = document.getElementById('title')
  const body = document.getElementById('body')
  if (title) title.textContent = words.title
  if (body) {
    body.textContent = words.body
    body.hidden = words.body === ''
  }
}

async function start(): Promise<void> {
  applyTheme()
  const language = currentLanguage()
  document.documentElement.lang = language
  await loadWords(language)
  say(connectingWords())
  // The page's own pair, in its memory only (connectedPage.ts).
  const api = new SimeonAPI({
    base: resolveApiBase(location),
    clientVersion: pageClientVersion,
    vault: new MemoryVault(),
  })
  const { words, closes } = await finishSignIn(location.search, {
    signIn: () => api.signInFromCookie(),
    complete: async (answer) => {
      await new Gateway({ api }).command('completeMcpOAuth', answer)
    },
    signOut: () => api.signOut(),
  })
  say(words)
  // The tab the window opened closes itself, as the old page's does; one the page didn't open stays.
  if (closes)
    setTimeout(() => {
      try {
        window.close()
      } catch {
        // Stays open, saying Connected.
      }
    }, 1_500)
}

void start()
