/**
 * Where the server is, where signing in happens, and where the dashboard
 * lives.
 *
 * All three come from the build rather than from code, because the panel
 * is deployed once per environment and sideloaded by hand — a hardcoded
 * origin here means somebody editing a source file to test against their
 * own machine and then committing it by accident.
 */

export const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://127.0.0.1:8000'

/** The dashboard, for « sign in over there and come back ». */
export const DASHBOARD_URL =
  import.meta.env.VITE_DASHBOARD_URL ?? 'http://127.0.0.1:3000'

/**
 * The page the sign-in dialog opens.
 *
 * It must be on the add-in's own origin. Office enforces that — it is not
 * a convention — because `messageParent` is same-origin only, and that
 * message is how the token gets back to the panel.
 *
 * `BASE_URL` is Vite's own base path — `/panel/` in the deployed build,
 * `/` in dev — and it belongs in this URL. The first run inside real
 * Word opened the dialog on `/signin.html` at the *root*, which is the
 * dashboard's 404 page wearing the dashboard's own « nobody frames me »
 * policy: Office's dialog frame was refused, no token ever came back,
 * and Office reported « couldn't start this add-in » with the actual
 * reason one console line long.
 */
export const SIGN_IN_URL =
  import.meta.env.VITE_SIGN_IN_URL ??
  `${window.location.origin}${import.meta.env.BASE_URL}signin.html`
