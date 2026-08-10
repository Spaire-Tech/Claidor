/**
 * Signing in from inside Office, where cookies do not reach.
 *
 * The panel is an iframe on its own origin. A session cookie set on the
 * dashboard is `SameSite=Lax` and is never sent with the panel's requests;
 * Safari and Edge block third-party cookies outright. So the panel holds a
 * bearer token, and getting one means opening a real browser window.
 *
 * `Office.context.ui.displayDialogAsync` is that window. It opens on our
 * own origin — a rule Office enforces, not a convention — runs the normal
 * sign-in, and hands the token back through `messageParent`. The dialog is
 * a first-party browsing context, so the cookie works there; only the
 * panel's own iframe is the problem, and the token is what crosses.
 *
 * **The token is kept in `localStorage`, scoped to the add-in's origin.**
 * Not in `Office.context.document.settings`, which lives *inside the
 * document* — a token stamped there would travel to whoever the deck is
 * emailed to. That store is for the lineage id, which is not a secret.
 */

const KEY = 'claidor.panel.token'
const EXPIRY = 'claidor.panel.token.expires'

export interface Session {
  token: string
  expiresAt: number | null
}

export function current(): Session | null {
  const token = localStorage.getItem(KEY)
  if (!token) return null
  const raw = localStorage.getItem(EXPIRY)
  const expiresAt = raw ? Number(raw) : null
  if (expiresAt && expiresAt < Date.now()) {
    signOut()
    return null
  }
  return { token, expiresAt }
}

export function signOut(): void {
  localStorage.removeItem(KEY)
  localStorage.removeItem(EXPIRY)
}

function keep(session: Session): void {
  localStorage.setItem(KEY, session.token)
  if (session.expiresAt) localStorage.setItem(EXPIRY, String(session.expiresAt))
}

/**
 * Open the sign-in dialog and resolve with the token it sends back.
 *
 * Rejects rather than resolving null when the person closes the dialog,
 * because « they cancelled » and « it failed » lead to different screens:
 * one goes back to the signed-out state quietly, the other says why.
 */
export function signIn(dialogUrl: string): Promise<Session> {
  return new Promise((resolve, reject) => {
    if (typeof Office === 'undefined' || !Office.context?.ui) {
      return reject(new Error('not running inside Office'))
    }

    Office.context.ui.displayDialogAsync(
      dialogUrl,
      // 60/40 of the *screen*, not the panel. The panel is 320px wide and
      // the sign-in page is not.
      { height: 60, width: 40, promptBeforeOpen: false },
      (result) => {
        if (result.status !== Office.AsyncResultStatus.Succeeded) {
          return reject(
            new Error(result.error?.message ?? 'could not open sign-in'),
          )
        }
        const dialog = result.value

        dialog.addEventHandler(
          Office.EventType.DialogMessageReceived,
          (event) => {
            const message = (event as { message?: string }).message
            dialog.close()
            try {
              const payload = JSON.parse(message ?? '{}') as {
                token?: string
                expires_in?: number
                error?: string
              }
              if (payload.error) return reject(new Error(payload.error))
              if (!payload.token)
                return reject(new Error('sign-in returned no token'))
              const session: Session = {
                token: payload.token,
                expiresAt: payload.expires_in
                  ? Date.now() + payload.expires_in * 1000
                  : null,
              }
              keep(session)
              resolve(session)
            } catch {
              reject(new Error('sign-in returned something unreadable'))
            }
          },
        )

        dialog.addEventHandler(
          Office.EventType.DialogEventReceived,
          (event) => {
            // 12006 is « the user closed the dialog ». Everything else is a
            // failure worth naming.
            const code = (event as { error?: number }).error
            reject(
              new Error(
                code === 12006 ? 'sign-in was cancelled' : 'sign-in failed',
              ),
            )
          },
        )
      },
    )
  })
}
