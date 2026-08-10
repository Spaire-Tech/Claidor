/**
 * Where the server is, and which deal is open.
 *
 * `DEAL_ID` is a build-time setting only while there is one deal to look
 * at. It becomes a route the moment Projects lists more than one, and the
 * screens already take the id as an argument so that change is a wiring
 * change rather than a rewrite.
 */

export const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://127.0.0.1:8000'
export const DEAL_ID = import.meta.env.VITE_DEAL_ID ?? ''
