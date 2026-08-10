/**
 * The two seconds between « Sign in » and a panel that works.
 *
 * Office opens this page as a real top-level window rather than an iframe,
 * and that is the entire mechanism. The panel cannot be signed in directly:
 * it runs on its own origin inside Office, so a `SameSite=Lax` session
 * cookie is never sent with its requests and Safari and Edge block
 * third-party cookies outright. This window is first-party, the cookie
 * works here, and what crosses back is a bearer token.
 *
 * What happens, in order:
 *
 * 1. Ask the server for a panel token, sending the session cookie.
 * 2. Signed in already — the common case, because the banker has the
 *    dashboard open — so a token comes back and goes to the panel.
 * 3. Not signed in: show a link to the dashboard. The person signs in
 *    there, comes back, and this page tries again on focus.
 *
 * No redirect chain, no PKCE, no provider round-trip. The server already
 * knows how to turn a browser session into a token; the only thing missing
 * was a window where the session exists.
 */

import { API_BASE, DASHBOARD_URL } from './config'

interface PanelToken {
  token: string
  expires_in: number
  scopes: string[]
}

const status = document.getElementById('status')!
const dashboard = document.getElementById('dashboard') as HTMLAnchorElement

function send(payload: Record<string, unknown>): void {
  // `messageParent` takes a string and only works same-origin — Office
  // enforces that, which is why this page ships with the add-in rather
  // than living on the dashboard.
  Office.context.ui.messageParent(JSON.stringify(payload))
}

async function mint(): Promise<PanelToken | null> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}/v1/tieout/panel/token`, {
      method: 'POST',
      // The cookie is the whole reason this page exists.
      credentials: 'include',
    })
  } catch {
    // `fetch` throws a bare TypeError for both « the server is down » and
    // « CORS refused this », and the browser prints the difference only to
    // its own console. Naming the likely cause is worth more than
    // repeating « failed to fetch », because the fix is a config line.
    throw new Error(
      `Could not reach ${API_BASE}. If it is running, its CORS_ORIGINS has ` +
        `to include ${window.location.origin} for the session cookie to be sent.`,
    )
  }
  if (response.status === 401 || response.status === 403) return null
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { detail?: string } | null
    throw new Error(body?.detail ?? 'could not sign in')
  }
  return (await response.json()) as PanelToken
}

async function attempt(): Promise<void> {
  try {
    const minted = await mint()
    if (minted) {
      status.textContent = 'Signed in.'
      send({ token: minted.token, expires_in: minted.expires_in })
      return
    }

    // Not signed in. Not an error — most people opening this for the first
    // time land here, and « sign in over there, then come back » is the
    // instruction, not a failure message.
    status.textContent = 'Sign in to Claidor in your browser, then come back here.'
    status.className = 'quiet'
    dashboard.href = DASHBOARD_URL
    dashboard.target = '_blank'
    dashboard.rel = 'noopener'
    dashboard.hidden = false
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : 'could not sign in'
    send({ error: status.textContent })
  }
}

Office.onReady(() => {
  void attempt()

  // They went to the dashboard, signed in, and came back to this window.
  // Trying again on focus turns a two-window dance into something that
  // just works, with no button to press at the right moment.
  window.addEventListener('focus', () => {
    if (!dashboard.hidden) void attempt()
  })
})
