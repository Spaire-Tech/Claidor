// What the Windows app's page may load, open and use: the same policy the
// website gives /app-next (clients/apps/web/next.config.mjs, `appWindowCSP`),
// the Mac's list of addresses handed to the system (mac/Simeon/MainWindow.swift,
// the `openURL` handler: http, https, mailto, obsidian, tel), and the browser
// permissions the page may have.

/** The content security policy for the page, with the server it talks to. */
export function contentSecurityPolicy(apiBase: string): string {
  const api = new URL(apiBase)
  const http = api.origin
  const ws = `${api.protocol === 'https:' ? 'wss:' : 'ws:'}//${api.host}`
  // A stand-in server on this computer is http: upgrading it would break the checks.
  const upgrades = api.protocol === 'https:'
  return [
    "default-src 'self'",
    `connect-src 'self' blob: ${http} ${ws} https://*.elevenlabs.io wss://*.elevenlabs.io`,
    `img-src 'self' blob: data: https: ${http}`,
    `media-src 'self' blob: https: ${http}`,
    `frame-src ${http}`,
    "script-src 'self' blob:",
    "worker-src 'self' blob:",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' blob: data:",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    ...(upgrades ? ['upgrade-insecure-requests'] : []),
  ].join('; ')
}

const outside = new Set(['http:', 'https:', 'mailto:', 'tel:', 'obsidian:'])

/** An address the default browser (or its own app) may be given: http, https, mailto, tel, obsidian; nothing else, nothing malformed. */
export function opensOutside(address: string): boolean {
  let url: URL
  try {
    url = new URL(address)
  } catch {
    return false
  }
  if (!outside.has(url.protocol)) return false
  if ((url.protocol === 'http:' || url.protocol === 'https:') && !url.hostname)
    return false
  return true
}

/**
 * A browser permission the page asks for: the microphone (dictation and
 * calls; never the camera), the clipboard (the computer's screen), the
 * window going full screen, and nothing else. Only the app's own page.
 */
export function allowsPermission(
  permission: string,
  fromApp: boolean,
  media?: { mediaTypes?: readonly string[] },
): boolean {
  if (!fromApp) return false
  switch (permission) {
    case 'media': {
      const types = media?.mediaTypes ?? []
      return types.length > 0 && types.every((type) => type === 'audio')
    }
    case 'clipboard-read':
    case 'clipboard-sanitized-write':
    case 'fullscreen':
      return true
    default:
      return false
  }
}
