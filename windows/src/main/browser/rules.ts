// The browser in the app, the rules that need no Electron (and so are
// checked by `npm test`): which addresses an agent's tab may open, and the
// user agent it shows sites.

/** The addresses an agent's tab may open: the web, and an empty page. */
export function openable(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return true
    return parsed.href === 'about:blank'
  } catch {
    return false
  }
}

/** The user agent of the Chrome this Chromium is, without Electron's and the app's names. */
export function chromeAgent(agent: string): string {
  return agent.replace(/\s(?:Electron|simeon-windows|Simeon)\/\S+/gi, '').replace(/\s{2,}/g, ' ').trim()
}

/** Windows' mark of the web (`Zone.Identifier`, the Internet zone) for a download from `url`, without any name or password in it. */
export function zoneIdentifier(url: string): string {
  let host = ''
  try {
    const parsed = new URL(url)
    parsed.username = ''
    parsed.password = ''
    host = parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : ''
  } catch {
    host = ''
  }
  return `[ZoneTransfer]\r\nZoneId=3\r\n${host ? `HostUrl=${host}\r\n` : ''}`
}
