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
// is signed out on the server once the page is done, so no session is left
// behind. A browser signed in to the website with another account than the
// window's finishes on that account's computer, which doesn't know the
// sign-in and refuses it: said, nothing else happens (the code is single
// use and bound to the verifier only the right computer holds).

import { type SignInAnswer, signInAnswer } from './core/connecting'
import { plainError } from './core/plainWords'
import { t } from './l10n'

/** How the page names itself to the server: the window's own (`clientVersion` in session.ts, which the page doesn't load: it holds the whole window). */
export const pageClientVersion = 'web-next-0.1.0'

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
 * the maker's `error`): what the page says, and whether it closes its tab.
 */
export async function finishSignIn(
  query: string,
  finishing: Finishing,
): Promise<{ words: PageWords; closes: boolean }> {
  const answer: SignInAnswer | undefined = signInAnswer(query)
  // The maker refused: its own sentence, when it sent one.
  if (answer?.error != null)
    return { words: didntFinish(answer.errorDescription), closes: false }
  if (answer?.code == null) return { words: didntFinish(), closes: false }
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
  try {
    await finishing.complete({ stateId: answer.state, code: answer.code })
    return { words: { title: t('Connected'), body: '' }, closes: true }
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error)
    return { words: didntFinish(plainError(why)), closes: false }
  } finally {
    await finishing.signOut().catch(() => {})
  }
}
