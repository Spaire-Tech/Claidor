// connected.html's script: the page that ends a connected app's sign-in
// come back through Simeon Labs' server (connectedPage.ts says what it
// does), in the person's language and the theme chosen in this browser.

import './connected.css'
import {
  type PageWords,
  connectingWords,
  finishSignIn,
  pageApiBase,
  pageClientVersion,
  signOutPair,
} from './connectedPage'
import { MemoryVault, SimeonAPI } from './core/api'
import { type SignInHeard, signInEndsChannel } from './core/connecting'
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

/** How it ended, said to the window that opened the sign-in (connector.ts listens by the sign-in's state). */
function tellWindow(heard: SignInHeard): void {
  if (typeof BroadcastChannel === 'undefined') return
  const channel = new BroadcastChannel(signInEndsChannel)
  channel.postMessage(heard)
  channel.close()
}

async function start(): Promise<void> {
  applyTheme()
  const language = currentLanguage()
  document.documentElement.lang = language
  await loadWords(language)
  say(connectingWords())
  // The page's own pair, in its memory only (connectedPage.ts).
  const vault = new MemoryVault()
  const api = new SimeonAPI({
    base: pageApiBase(location),
    clientVersion: pageClientVersion,
    vault,
  })
  // Signed out once, whichever comes first: the page done, or the page going (the window closed its tab).
  const signOut = async () => {
    const token = vault.read()?.accessToken
    vault.write(null)
    if (token)
      await signOutPair(
        (input, init) => fetch(input, init),
        api.base,
        api.language,
        token,
      )
  }
  addEventListener('pagehide', () => void signOut())
  const { words, closes, heard } = await finishSignIn(location.search, {
    signIn: () => api.signInFromCookie(),
    complete: async (answer) => {
      await new Gateway({ api }).command('completeMcpOAuth', answer)
    },
    signOut,
  })
  if (heard) tellWindow(heard)
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
