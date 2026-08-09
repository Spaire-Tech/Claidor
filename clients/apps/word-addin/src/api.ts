/**
 * Talking to the server.
 *
 * Bearer tokens, never cookies. An add-in runs in an iframe on its own
 * origin, so a SameSite=Lax session cookie is not sent with these
 * requests, and Safari and Edge block third-party cookies outright. This
 * is decided in `docs/vesence-clone/decisions.md`; the point of writing it
 * down there is that the alternative fails in a way that looks like a
 * login bug for a week.
 *
 * The token lives in `Office.context.roamingSettings`, which Office
 * persists per user per document type. When Microsoft Entra SSO replaces
 * the dialog sign-in, only `token()` changes — nothing below it does.
 */

import type { Review } from './locate'

const TOKEN_KEY = 'claidor.token'

export class NotSignedIn extends Error {}
export class ServerRefused extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

export function apiBase(): string {
  return import.meta.env['VITE_API_BASE'] ?? 'https://api.claidor.com'
}

export function token(): string | null {
  const settings = globalThis.Office?.context?.roamingSettings
  const stored = settings?.get(TOKEN_KEY)
  return typeof stored === 'string' && stored.length > 0 ? stored : null
}

export async function saveToken(value: string): Promise<void> {
  const settings = globalThis.Office?.context?.roamingSettings
  if (!settings) throw new Error('Office is not available.')
  settings.set(TOKEN_KEY, value)
  await new Promise<void>((resolve, reject) => {
    settings.saveAsync((result) => {
      if (result.status === Office.AsyncResultStatus.Succeeded) resolve()
      else reject(result.error)
    })
  })
}

/** Send the document text for checking. */
export async function check(text: string): Promise<Review> {
  const bearer = token()
  if (!bearer) throw new NotSignedIn('Sign in to check this document.')

  const response = await fetch(`${apiBase()}/v1/redline/check`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${bearer}`,
    },
    body: JSON.stringify({ text }),
  })

  if (response.status === 401) {
    throw new NotSignedIn('That sign-in has expired.')
  }
  if (!response.ok) {
    // The server puts something readable in `detail` — the document's own
    // size when it is too large, for instance. Show that rather than a
    // status code the reader cannot act on.
    let detail = `The server refused the request (${response.status}).`
    try {
      const body = (await response.json()) as { detail?: unknown }
      if (typeof body.detail === 'string') detail = body.detail
    } catch {
      // A non-JSON error body is not itself worth reporting.
    }
    throw new ServerRefused(response.status, detail)
  }

  return (await response.json()) as Review
}

/**
 * Sign in through an Office dialog.
 *
 * `displayDialogAsync` is the only way an add-in can run an OAuth flow:
 * the iframe it lives in cannot navigate to an identity provider. The
 * dialog posts the token back with `messageParent`.
 */
export function signIn(): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = `${apiBase()}/v1/oauth2/authorize?client=word-addin`
    Office.context.ui.displayDialogAsync(
      url,
      { height: 60, width: 30, promptBeforeOpen: false },
      (result) => {
        if (result.status !== Office.AsyncResultStatus.Succeeded) {
          reject(result.error)
          return
        }
        const dialog = result.value
        dialog.addEventHandler(
          Office.EventType.DialogMessageReceived,
          (event) => {
            dialog.close()
            const message = (event as { message?: string }).message ?? ''
            if (message) resolve(message)
            else reject(new Error('Sign-in did not return a token.'))
          },
        )
        dialog.addEventHandler(Office.EventType.DialogEventReceived, () => {
          dialog.close()
          reject(new Error('Sign-in was closed.'))
        })
      },
    )
  })
}
