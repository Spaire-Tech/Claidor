// A link that opens the app (SimeonMacCore's DeepLink.swift), read by the
// Mac's own rules, so the Windows app accepts exactly what the Mac does:
//
// - `<scheme>://app/v1/open`: back from the browser's sign-in, or from
//   Stripe's page; it only brings the window forward;
// - `<scheme>://app/v1/info?topic=deep-links`: the Deep Links dialog;
// - `<scheme>://app/v1/plugin/add?id=<1–19 digits>`: a connector's page;
// - `<scheme>://app/v1/pack/add?id=<pack id>`: a starter pack to add, from
//   the website's Add to Simeon;
// - the same four under `https://app.simeonlabs.com/sand/link/v1/…`.
//
// Anything else is refused: longer than 2,048 characters, not printable
// ASCII, a `#` or a `\`, a broken `%` escape, a `%` or a `.`/`..` segment
// in the path, a user, a password or a port, an unknown or repeated query
// key, or a value the route does not allow.
//
// With it, the two links a connector's sign-in comes back on, which the
// Mac's sign-in sheet takes before `DeepLink` sees them: the maker's answer
// the server sends back to the app (AppReturnSignIn.swift's `answer`,
// `<scheme>://mcp-oauth?state=…&code=…`) and the server's last page
// (`<scheme>://connected[?status=failed]`, Connecting.swift's `failed`).

import { type SignInAnswer, queryItems, signInAnswer } from './connecting'
import { isPackId } from './starterPacks'

/** What a link asks (`DeepLink.Route`). */
export type DeepLinkRoute =
  | { kind: 'open' }
  | { kind: 'info'; topic: 'deep-links' }
  | { kind: 'pluginAdd'; id: string }
  | { kind: 'packAdd'; id: string }

/** Where it came from: the app's own scheme, or an `https://app.simeonlabs.com/sand/link/…` address. */
export type DeepLinkSource = 'scheme' | 'https'

export interface DeepLink {
  route: DeepLinkRoute
  source: DeepLinkSource
}

/** The app's own scheme on the Mac and on Windows (`SimeonConfig.macURLScheme`). */
export const appScheme = 'simeon'
export const maxLength = 2_048
export const authority = 'app'
export const httpsHost = 'app.simeonlabs.com'
export const httpsPrefix = '/sand/link'
const openPath = '/v1/open'
const infoPath = '/v1/info'
const pluginPath = '/v1/plugin/add'
const packPath = '/v1/pack/add'

/** One `name=value` of the query, as `URLComponents.queryItems` reads it (`value` undefined when there is no `=`). */
interface Item {
  name: string
  value?: string
}

/** A link's parts, as `URLComponents` reads `scheme://host/path?query`; none for a user, a password, a port or no `//`. */
function parts(
  raw: string,
): { scheme: string; host: string; path: string; items: Item[] } | undefined {
  const colon = raw.indexOf(':')
  if (colon <= 0 || !raw.startsWith('//', colon + 1)) return undefined
  const scheme = raw.slice(0, colon)
  const rest = raw.slice(colon + 3)
  const question = rest.indexOf('?')
  const beforeQuery = question < 0 ? rest : rest.slice(0, question)
  const slash = beforeQuery.indexOf('/')
  const host = slash < 0 ? beforeQuery : beforeQuery.slice(0, slash)
  // A user, a password or a port (`user@app`, `app:80`).
  if (host.includes('@') || host.includes(':')) return undefined
  const path = slash < 0 ? '' : beforeQuery.slice(slash)
  const query = question < 0 ? '' : rest.slice(question + 1)
  const items: Item[] = []
  for (const piece of query === '' ? [] : query.split('&')) {
    const at = piece.indexOf('=')
    try {
      items.push(
        at < 0
          ? { name: decodeURIComponent(piece) }
          : {
              name: decodeURIComponent(piece.slice(0, at)),
              value: decodeURIComponent(piece.slice(at + 1)),
            },
      )
    } catch {
      // Bytes that are no text: nothing the app reads.
      return undefined
    }
  }
  return { scheme, host, path, items }
}

/**
 * The link, or none (`DeepLink.parse`). `schemes` are the ones this app
 * answers to: `simeon` for the Mac's and the Windows app.
 */
export function parseDeepLink(
  raw: string,
  schemes: readonly string[] = [appScheme],
): DeepLink | undefined {
  if (
    raw === '' ||
    !isPrintableASCII(raw) ||
    raw.length > maxLength ||
    raw.includes('#') ||
    raw.includes('\\') ||
    !hasValidPercentEncoding(raw) ||
    !hasCanonicalPath(raw)
  )
    return undefined
  const lower = raw.toLowerCase()
  const scheme = schemes
    .map((one) => one.toLowerCase())
    .find((one) => lower.startsWith(`${one}:`))
  let source: DeepLinkSource
  if (scheme !== undefined) source = 'scheme'
  else if (lower.startsWith('https:')) source = 'https'
  else return undefined
  const read = parts(raw)
  if (!read) return undefined
  // Empty pieces (`?id=1&`, `&&`) are no keys, as the browser's URLSearchParams reads them; a bare `=` is a key with no name, which no route knows.
  const query = read.items.filter(
    (item) => !(item.name === '' && item.value === undefined),
  )
  let path: string
  if (source === 'scheme') {
    if (read.scheme.toLowerCase() !== scheme || read.host !== authority)
      return undefined
    path = read.path
  } else {
    if (
      read.scheme.toLowerCase() !== 'https' ||
      read.host.toLowerCase() !== httpsHost ||
      !read.path.startsWith(`${httpsPrefix}/`)
    )
      return undefined
    path = read.path.slice(httpsPrefix.length)
  }
  switch (path) {
    case pluginPath: {
      const id = only(query, 'id')
      return id !== undefined && isPluginId(id)
        ? { route: { kind: 'pluginAdd', id }, source }
        : undefined
    }
    case packPath: {
      const id = only(query, 'id')
      return id !== undefined && isPackId(id)
        ? { route: { kind: 'packAdd', id }, source }
        : undefined
    }
    case openPath:
      return query.length === 0
        ? { route: { kind: 'open' }, source }
        : undefined
    case infoPath:
      return allowlisted(query, { topic: ['deep-links'] })
        ? { route: { kind: 'info', topic: 'deep-links' }, source }
        : undefined
    default:
      return undefined
  }
}

/** The one value of a query that has `name` and nothing else. */
function only(query: readonly Item[], name: string): string | undefined {
  if (query.length !== 1) return undefined
  const [item] = query
  return item?.name === name ? item.value : undefined
}

/** The link written the one way the app writes it (`canonical`). */
export function canonicalDeepLink(link: DeepLink, scheme: string): string {
  const route = link.route
  switch (route.kind) {
    case 'open':
      return `${scheme}://${authority}${openPath}`
    case 'info':
      return `${scheme}://${authority}${infoPath}?topic=${route.topic}`
    case 'pluginAdd':
      return `${scheme}://${authority}${pluginPath}?id=${route.id}`
    case 'packAdd':
      return `${scheme}://${authority}${packPath}?id=${route.id}`
  }
}

/** A plugin's id: 1 to 19 digits (`isPluginId`). */
export function isPluginId(value: string): boolean {
  return /^[0-9]{1,19}$/.test(value)
}

function isPrintableASCII(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code < 33 || code > 126) return false
  }
  return true
}

/** Every `%` starts two hex digits. */
function hasValidPercentEncoding(value: string): boolean {
  return !/%(?![0-9A-Fa-f]{2})/.test(value)
}

/** Before the query: no `%` at all, and no `/.` or `/..` segment. */
function hasCanonicalPath(value: string): boolean {
  const question = value.indexOf('?')
  const beforeQuery = question < 0 ? value : value.slice(0, question)
  if (beforeQuery.includes('%')) return false
  return !beforeQuery
    .split('/')
    .slice(1)
    .some((segment) => segment === '.' || segment === '..')
}

/** Each key allowed, once, with an allowed value; every allowed key there (`allowlisted`). */
function allowlisted(
  items: readonly Item[],
  allowed: Record<string, readonly string[]>,
): boolean {
  const seen = new Map<string, string>()
  for (const item of items) {
    const values = Object.hasOwn(allowed, item.name)
      ? allowed[item.name]
      : undefined
    if (
      values === undefined ||
      seen.has(item.name) ||
      item.value === undefined ||
      !values.includes(item.value)
    )
      return false
    seen.set(item.name, item.value)
  }
  return Object.keys(allowed).every((key) => seen.has(key))
}

// MARK: A connector's sign-in coming back to the app

/** The host and query of a link in the app's own scheme; none for any other. */
function ownLink(
  raw: string,
  scheme: string,
): { host: string; query: string } | undefined {
  if (raw.length > maxLength) return undefined
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return undefined
  }
  if (url.protocol !== `${scheme}:`) return undefined
  return { host: url.host, query: url.search }
}

/** Where a maker's answer lands in the app: `<scheme>://mcp-oauth?…` (`AppReturnSignIn.host`). */
export const appReturnHost = 'mcp-oauth'

/**
 * The maker's answer the server sent back to the app, with the sign-in's
 * state; none for any other link (`AppReturnSignIn.answer`).
 */
export function appReturnAnswer(
  raw: string,
  scheme: string = appScheme,
): SignInAnswer | undefined {
  const link = ownLink(raw, scheme)
  if (link?.host !== appReturnHost) return undefined
  return signInAnswer(link.query)
}

/** Where the server's last page of a sign-in sends the browser back: `<scheme>://connected` (apps.py). */
export const connectedHost = 'connected'

/**
 * The server's last page of a sign-in, back on the app's own address:
 * whether it said the sign-in didn't work (`?status=failed`,
 * `Connecting.failed`); none for any other link.
 */
export function connectedReturn(
  raw: string,
  scheme: string = appScheme,
): { failed: boolean } | undefined {
  const link = ownLink(raw, scheme)
  if (link?.host !== connectedHost) return undefined
  const failed = queryItems(link.query).some(
    (item) =>
      item.name === 'status' &&
      ['failed', 'error'].includes(item.value?.toLowerCase() ?? ''),
  )
  return { failed }
}
