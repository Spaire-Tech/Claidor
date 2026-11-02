// The end of a connected app's sign-in that came back through Simeon Labs'
// server (connected.html): the server's callback
// (`/desktop/mcp-oauth/callback`, server/simeon/desktop/app_sign_in.py)
// sends a sign-in no app named to the web app's own `connected.html` with
// the maker's code and the sign-in's state; the page hands them to the
// computer that started the sign-in, which holds its verifier and trades
// the code for the app's access (`completeMcpOAuth`), says Connected and
// closes its tab. The window in the other tab sees the app connected at its
// next look. What the old web app's page does (desktop/web/bridge.ts,
// `finishConnectedAppSignIn`), in the new app's own words.
//
// Its account (2 November 2026, the session): the website's own, its cookie
// traded for a pair of the page's own (`/auth/web-session`), as the window
// itself signs in, so it is the account the window is in. The pair is held
// in the page's memory only, never in the tab's storage (the window's tab
// keeps its own, and the sign-in's tab is opened without a copy of it), and
// is signed out on the server once the page is done, and again as the page
// goes (`keepalive`) should the window close the tab first, so no session
// is left behind. A browser signed in to the website with another account than the
// window's finishes on that account's computer, which doesn't know the
// sign-in and refuses it: said, nothing else happens (the code is single
// use and bound to the verifier only the right computer holds).

import { SimeonAPI, resolveApiBase } from './core/api'
import {
  type SignInAnswer,
  type SignInHeard,
  signInAnswer,
} from './core/connecting'
import { plainError } from './core/plainWords'
import { t } from './l10n'

/** How the page names itself to the server: the window's own (`clientVersion` in session.ts, which the page doesn't load: it holds the whole window). */
export const pageClientVersion = 'web-next-0.1.0'

/**
 * The server the page talks to: from where the page is, as the window finds
 * it (`resolveApiBase`), but never from its own address's `?api=` except on
 * this computer's own loopback (a developer's server, the checks' stand-in):
 * the page's address is the maker's redirect, and anyone can write a link.
 */
export function pageApiBase(place: {
  readonly hostname: string
  readonly search: string
  readonly protocol: string
}): string {
  const local = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(
    place.hostname,
  )
  return resolveApiBase(
    local
      ? place
      : { hostname: place.hostname, protocol: place.protocol, search: '' },
  )
}

/** What the page says: its title and the line under it. */
export interface PageWords {
  title: string
  body: string
}

/** What the page asks of the server and the computer (stand-ins in the tests). */
export interface Finishing {
  /** The website's cookie traded for the page's own pair; false when the person isn't signed in on the website. */
  signIn(): Promise<boolean>
  /** The code to the computer (`completeMcpOAuth`). */
  complete(answer: { stateId: string; code: string }): Promise<void>
  /** The page's pair signed out on the server. */
  signOut(): Promise<void>
}

/** What the page says and does once it is done. */
export interface PageEnd {
  words: PageWords
  /** It closes its tab (Connected). */
  closes: boolean
  /** What it tells the window, by the sign-in's state (`signInEndsChannel`); none without a state, or before the sign-in could be finished (not signed in on the website). */
  heard?: SignInHeard
}

/** The catalogue's words for a sign-in that didn't finish; the computer's own words when it said why. */
function didntFinish(why?: string): PageWords {
  return {
    title: t("That didn't work."),
    body:
      why != null && why !== '' ? why : t('Sign-in did not finish. Try again.'),
  }
}

/** While the computer is asked. */
export function connectingWords(): PageWords {
  return { title: t('Connecting…'), body: '' }
}

/**
 * The sign-in finished from the page's own query (`?state=…&code=…`, or
 * the maker's `error`): what the page says, whether it closes its tab, and
 * what it tells the window. The maker's own sentence (`error_description`)
 * is not drawn: it comes in the address, which anyone can write.
 */
export async function finishSignIn(
  query: string,
  finishing: Finishing,
): Promise<PageEnd> {
  const answer: SignInAnswer | undefined = signInAnswer(query)
  // The maker refused: the window takes it as the Mac's sheet closed on a refusal.
  if (answer?.error != null)
    return {
      words: didntFinish(),
      closes: false,
      heard: { state: answer.state, refused: true },
    }
  if (answer?.code == null)
    return {
      words: didntFinish(),
      closes: false,
      heard: answer && { state: answer.state, refused: false },
    }
  let signedIn = false
  try {
    signedIn = await finishing.signIn()
  } catch {
    signedIn = false
  }
  if (!signedIn)
    return {
      words: { title: t('Sign in to Simeon first.'), body: '' },
      closes: false,
    }
  const heard = { state: answer.state, refused: false }
  try {
    await finishing.complete({ stateId: answer.state, code: answer.code })
    return { words: { title: t('Connected'), body: '' }, closes: true, heard }
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error)
    return { words: didntFinish(plainError(why)), closes: false, heard }
  } finally {
    await finishing.signOut().catch(() => {})
  }
}

/**
 * The page's pair signed out on the server (`/desktop/api/auth/logout`,
 * as `SimeonAPI.signOut`), sent so it outlives the tab (`keepalive`): the
 * window may close the tab the moment the app is connected. A browser that
 * won't send it so is asked plainly.
 */
export async function signOutPair(
  send: typeof fetch,
  base: string,
  language: string,
  token: string,
): Promise<void> {
  const url = `${base}${SimeonAPI.desktopPrefix}auth/logout`
  const request: RequestInit = {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'accept-language': language },
    credentials: 'omit',
  }
  try {
    await send(url, { ...request, keepalive: true })
  } catch {
    try {
      await send(url, request)
    } catch {
      // Ends with its hour, unused.
    }
  }
}
