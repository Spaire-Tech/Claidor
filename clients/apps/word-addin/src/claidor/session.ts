/**
 * Where the pane keeps its Claidor token.
 *
 * Three places were candidates and two of them are wrong, in ways worth
 * writing down because both look reasonable.
 *
 * **`Office.context.roamingSettings`** is what
 * `docs/vesence-clone/decisions.md` said to use, and it does not exist
 * here: the typings mark it `[Api set: Mailbox 1.1]`. It is Outlook's.
 * Code reading it in Word gets `undefined`, returns "not signed in", and
 * never says why.
 *
 * **`Office.context.document.settings`** is Word's equivalent and is far
 * worse. It serialises *into the .docx*. A token stored there travels with
 * the agreement — to the counterparty, to opposing counsel, into whatever
 * document management system the file lands in. It is the one storage
 * location in Word that must never hold a credential.
 *
 * **`localStorage` on the add-in's own origin** is what is left, and it is
 * right: sandboxed to our origin, never serialised into the document, and
 * cleared with the pane. It is also what upstream chose, for the same
 * reason, in a comment in `src/auth/session.ts`.
 *
 * Every access is guarded. `localStorage` throws outright under Office
 * storage partitioning, InPrivate windows and some enterprise cookie
 * policies, and a pane that crashes on boot because storage is blocked is
 * worse than one that asks for the token again.
 */

const TOKEN_KEY = 'claidor.token'

/** What a Claidor personal access token looks like. */
const TOKEN_SHAPE = /^claidor_pat_[A-Za-z0-9_-]{16,}$/

/**
 * Session fallback for a pane whose storage is blocked. Without it, pasting
 * a token appears to work and is gone on the next render, which reads as
 * the token being rejected.
 */
let inMemory: string | null = null

export function claidorToken(): string | null {
  try {
    const stored = localStorage.getItem(TOKEN_KEY)
    if (stored) return stored
  } catch {
    // Storage blocked; fall through to the session fallback.
  }
  return inMemory
}

export function hasClaidorToken(): boolean {
  return claidorToken() !== null
}

/**
 * Is this the right kind of string at all?
 *
 * Checked before it is stored, because the alternative is a 401 several
 * screens later that reads as "your sign-in expired" when what actually
 * happened is that somebody pasted a Slack webhook.
 */
export function looksLikeToken(value: string): boolean {
  return TOKEN_SHAPE.test(value.trim())
}

/**
 * Store the token. Returns whether it survived being written down.
 *
 * A caller must not reload the pane on `false`: the token is only in
 * memory then, and a reload would wipe it and return the user to where
 * they started with no explanation.
 */
export function setClaidorToken(value: string | null): boolean {
  inMemory = value
  try {
    if (value) localStorage.setItem(TOKEN_KEY, value)
    else localStorage.removeItem(TOKEN_KEY)
    return true
  } catch {
    return false
  }
}
