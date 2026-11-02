// Where the hands reach the person's computer, as the page hands it over
// (its `Gateway.currentConnection()`: the gateway's address and the headers
// that open it), checked here: it comes from a page. Only Simeon Labs' own
// servers over https, the app's own server (`--api=`, a stand-in on this
// computer in the checks), or this computer itself, only when the app's
// server is on this computer too (a developer's build, the checks); only
// the gateway's own three headers, each a plain line. Nothing of it is ever
// written down.

/** The headers a gateway takes (`GatewayConnection.headers()`): its token, the network token, and that the app lets it sleep. */
export const targetHeaders = ['authorization', 'x-anyrun-network-token', 'x-simeon-lets-sleep'] as const

export interface Target {
  baseURL: string
  headers: Record<string, string>
}

function isLoopback(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1'
}

/** The page's target, checked; an error says what was wrong with it, never what it held. */
export function checkTarget(value: unknown, apiBase: string): Target {
  if (typeof value !== 'object' || value == null) throw new Error('The computer’s address was expected.')
  const { baseURL, headers } = value as { baseURL?: unknown; headers?: unknown }
  if (typeof baseURL !== 'string' || baseURL.length > 2_048) throw new Error('The computer’s address was expected.')
  let url: URL
  try {
    url = new URL(baseURL)
  } catch {
    throw new Error('The computer’s address was not an address.')
  }
  if (url.username || url.password || url.search || url.hash)
    throw new Error('The computer’s address was refused.')
  const ours =
    url.protocol === 'https:' &&
    (url.hostname === 'simeonlabs.com' || url.hostname.endsWith('.simeonlabs.com'))
  let server = false
  let serverIsLocal = false
  try {
    const api = new URL(apiBase)
    server = url.origin === api.origin
    serverIsLocal = isLoopback(api.hostname)
  } catch {
    server = false
  }
  const local = serverIsLocal && (url.protocol === 'http:' || url.protocol === 'https:') && isLoopback(url.hostname)
  if (!ours && !local && !server) throw new Error('The computer’s address was refused.')
  if (typeof headers !== 'object' || headers == null || Array.isArray(headers))
    throw new Error('The computer’s headers were expected.')
  const checked: Record<string, string> = {}
  for (const [name, raw] of Object.entries(headers as Record<string, unknown>)) {
    const key = name.toLowerCase()
    if (!(targetHeaders as readonly string[]).includes(key)) throw new Error('A header was refused.')
    if (typeof raw !== 'string' || raw.length > 8_192 || /[\r\n\0]/.test(raw))
      throw new Error('A header was refused.')
    checked[key] = raw
  }
  return { baseURL: url.origin + url.pathname.replace(/\/+$/, ''), headers: checked }
}

/** Whether two targets are the same computer with the same keys. */
export function sameTarget(a: Target | undefined, b: Target | undefined): boolean {
  if (!a || !b) return a === b
  if (a.baseURL !== b.baseURL) return false
  const keys = new Set([...Object.keys(a.headers), ...Object.keys(b.headers)])
  for (const key of keys) if (a.headers[key] !== b.headers[key]) return false
  return true
}
