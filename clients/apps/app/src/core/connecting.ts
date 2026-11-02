// One Connect for an app (the core's Connecting.swift; the founder, 13
// October 2026: "should just be a connect button"): the consent, then the
// app added on the computer and its sign-in opened at once, ending
// Connected; when the person cancels the sign-in, or it never opens,
// nothing is left half added. With which sign-ins come back where
// (LoopbackSignIn.swift's and AppReturnSignIn.swift's `state`), and what a
// sign-in's last page reads from its own address.
//
// Left out, the Mac's alone: `returning` (our start link names the app that
// opens it, `back=`, so Apple's sheet closes on the app's own address; a
// browser has no such address, and the server's own "Connected" page ends
// it) and `failed` (the address the sheet closed on).

import { bool, field, str, text } from './json'
import { t } from './l10n'

/** The button of an app that isn't connected, wherever it shows (`Connecting.connect`). */
export function connectWord(): string {
  return t('Connect')
}

/** How a sign-in ended (`SignInEnd`). */
export type SignInEnd =
  /** The computer says the app is connected. */
  | 'connected'
  /** The person closed it, or it never opened. */
  | 'cancelled'
  /** It closed on the maker's page, or the wait ran out, before the computer said connected: it may still finish. */
  | 'unconfirmed'
  /** Another sign-in took this one's place. */
  | 'replaced'

/** A connect begun (`ConnectStart`, the store's `beginConnect`): the sign-in page, and the app this connect added, so a cancelled one can be taken back. */
export interface ConnectStart {
  url: string
  /** The catalogue's entry this connect installed on the computer; none when it was there already. */
  addedPlugin?: string
}

/** A connect that ended so takes back the app it added: only one the person cancelled, never one that may still finish (`undoes`). */
export function undoes(end: SignInEnd, start: ConnectStart): boolean {
  return end === 'cancelled' && start.addedPlugin != null
}

/** A line at the foot of Connectors (`Plugins.Notice`): a failure stays longer. */
export interface ConnectNotice {
  isError: boolean
  text: string
}

/** Once connected: the app, and the skills it brought (`connectedNotice`). */
export function connectedNotice(
  name: string,
  skills: number,
  error?: string,
): ConnectNotice {
  if (error != null)
    return {
      isError: true,
      text: t`Connected ${name}, but its skills didn't sync: ${error}`,
    }
  if (skills === 1)
    return { isError: false, text: t`Connected ${name} and 1 skill` }
  return {
    isError: false,
    text:
      skills > 0
        ? t`Connected ${name} and ${skills} skills`
        : t`Connected ${name}`,
  }
}

/** The sign-in closed before the app was connected: it was taken back, and Connect is there again (`notConnectedNotice`). */
export function notConnectedNotice(name: string): ConnectNotice {
  return { isError: false, text: t`${name} wasn't connected` }
}

/** The sign-in closed on the maker's page and the computer hasn't said so yet: it is kept, and shows Connected in a moment (`stillConnectingNotice`). */
export function stillConnectingNotice(name: string): ConnectNotice {
  return { isError: false, text: t`Finishing ${name}'s sign-in…` }
}

/** What the sign-in that never opened says (`didntConnect`). */
export function didntConnect(name: string, why?: string): string {
  if (why == null || why === '') return t`${name} didn't connect. Try again.`
  return t`${name} didn't connect: ${why}`
}

// MARK: Where a sign-in comes back (LoopbackSignIn.swift, AppReturnSignIn.swift)

/** One `name=value` of an address's query, decoded as `URLComponents.queryItems` decodes it (a "+" stays a "+"). */
interface QueryItem {
  name: string
  value?: string
}

function decoded(part: string): string {
  try {
    return decodeURIComponent(part)
  } catch {
    return part
  }
}

/** The query's items in their order, from `?a=1&b` (no address: none). */
export function queryItems(query: string): QueryItem[] {
  const bare = query.startsWith('?') ? query.slice(1) : query
  if (bare === '') return []
  return bare.split('&').map((part) => {
    const at = part.indexOf('=')
    return at < 0
      ? { name: decoded(part) }
      : { name: decoded(part.slice(0, at)), value: decoded(part.slice(at + 1)) }
  })
}

function itemsOf(address: string): QueryItem[] {
  try {
    return queryItems(new URL(address).search)
  } catch {
    return []
  }
}

function first(items: QueryItem[], name: string): string | undefined {
  return items.find((item) => item.name === name)?.value
}

/** Where the makers that only take the loopback send a sign-in (`LoopbackSignIn.address`): the computer asks them for it (`loopbackOnly` in the catalogue). */
export const loopbackPort = 8787
export const loopbackPath = '/callback'
export const loopbackAddress = `http://localhost:${loopbackPort}${loopbackPath}`

/** Whether a sign-in's return address is this computer's own loopback (`isLoopback`). */
export function isLoopback(redirect: string): boolean {
  let url: URL
  try {
    url = new URL(redirect)
  } catch {
    return false
  }
  return (
    url.protocol === 'http:' &&
    ['localhost', '127.0.0.1'].includes(url.hostname) &&
    url.port === String(loopbackPort) &&
    url.pathname === loopbackPath
  )
}

/**
 * The sign-in's state when its page returns to the loopback (its
 * `redirect_uri`); none for every other sign-in
 * (`LoopbackSignIn.state(returningHere:)`). The Mac and the iPhone listen
 * there while the page is open; a browser can't, so such a page is never
 * opened on the web: it couldn't finish.
 */
export function loopbackState(url: string): string | undefined {
  const items = itemsOf(url)
  const redirect = first(items, 'redirect_uri')
  if (redirect == null || !isLoopback(redirect)) return undefined
  const state = first(items, 'state')
  return state != null && state !== '' ? state : undefined
}

/** Simeon Labs' return address the computer registers with the makers (`AppReturnSignIn.serverCallbackPath`). */
export const serverCallbackPath = '/desktop/mcp-oauth/callback'

/**
 * The sign-in's state when its page returns through Simeon Labs' server;
 * none for a loopback or any other sign-in
 * (`AppReturnSignIn.state(returningViaServer:)`). The server sends such a
 * sign-in on to the web app's own page (`/app/connected.html`), which
 * finishes it on the computer: the apps name it to the server first
 * (`mcp-oauth/return`, their own URL scheme), which a browser has none of.
 */
export function serverReturnState(url: string): string | undefined {
  const items = itemsOf(url)
  const redirect = first(items, 'redirect_uri')
  if (redirect == null) return undefined
  let target: URL
  try {
    target = new URL(redirect)
  } catch {
    return undefined
  }
  if (target.protocol !== 'https:' || target.pathname !== serverCallbackPath)
    return undefined
  const state = first(items, 'state')
  return state != null && state !== '' ? state : undefined
}

// MARK: How a sign-in that came back through the server ended (the web's)

/**
 * The channel the web app's return page tells the window on
 * (`BroadcastChannel`, the same site only): on the Mac the sheet closes on
 * the app's own address with the maker's answer
 * (`AppReturnSignIn.answer`); in a browser the answer lands on the return
 * page, in the sign-in's own tab, which says it here by the sign-in's state.
 */
export const signInEndsChannel = 'simeon.sign-in-ends'

/** What the return page tells the window: the sign-in's state, and whether the maker refused it. */
export interface SignInHeard {
  state: string
  refused: boolean
}

/** A message on the channel, read; none for anything else. */
export function signInHeard(data: unknown): SignInHeard | undefined {
  const state = text(field(data, 'state'))
  const refused = bool(field(data, 'refused'))
  if (state == null || refused == null) return undefined
  return { state, refused }
}

/** What the maker sent back: the code, or its refusal, with the sign-in's state (`LoopbackSignIn.Answer`). */
export interface SignInAnswer {
  state: string
  code?: string
  error?: string
  errorDescription?: string
}

/**
 * The maker's answer on the sign-in's last page, from that page's own query
 * (`?state=…&code=…`, or `error` and `error_description`); none without a
 * state (`AppReturnSignIn.answer`). The sentence comes form-encoded ("The+user
 * +said+no"); the code is left as sent.
 */
export function signInAnswer(query: string): SignInAnswer | undefined {
  const items = queryItems(query)
  const value = (name: string) => {
    const found = first(items, name)
    return found != null && found !== '' ? found : undefined
  }
  const state = value('state')
  if (state == null) return undefined
  return {
    state,
    code: value('code'),
    error: value('error'),
    errorDescription: value('error_description')?.replaceAll('+', ' '),
  }
}

/**
 * The sign-in page in a computer's answer to `authenticateServer`
 * (`authorizationUrl`): a web page's address only, never another kind of
 * link a tab would hand elsewhere.
 */
export function authorizationURL(started: unknown): string | undefined {
  const address = text(field(started, 'authorizationUrl'))
  if (address == null) return undefined
  try {
    const url = new URL(address)
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? url.href
      : undefined
  } catch {
    return undefined
  }
}

/** Whether a computer's answer to `authenticateServer` says it is signed in already. */
export function alreadySignedIn(started: unknown): boolean {
  return str(field(started, 'status')) === 'already-authenticated'
}
