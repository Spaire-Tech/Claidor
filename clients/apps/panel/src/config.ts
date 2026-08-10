/**
 * Where the server is, and where signing in happens.
 *
 * Both come from the build rather than from code, because the panel is
 * deployed once per environment and sideloaded by hand — a hardcoded
 * origin here means a developer editing a source file to test against
 * their own machine, and then committing it by accident.
 */

export const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://127.0.0.1:8000'

/**
 * The page the sign-in dialog opens.
 *
 * It must be on the add-in's own origin — Office enforces that, it is not
 * a convention — and it ends by calling `messageParent` with the token.
 */
export const SIGN_IN_URL =
  import.meta.env.VITE_SIGN_IN_URL ?? `${window.location.origin}/signin.html`
