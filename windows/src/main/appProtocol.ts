// The web app's own address inside the Windows app: `app://simeon/app-next/`.
// The page is the website's own build (clients/apps/web/public/app-next, the
// one `pnpm test` checks), copied into the app; a privileged scheme gives it
// a real origin (`app://simeon`), which the server lets call the API
// (server/simeon/app.py, DESKTOP_APP_ORIGINS), and its own storage. Nothing
// outside `app-next/` is served; nothing outside the copied folder is read.

import path from 'node:path'

export const appScheme = 'app'
export const appHost = 'simeon'
export const appOrigin = `${appScheme}://${appHost}`
/** The build's base, as the website serves it (`vite.config.ts`, `base`). */
export const appBase = '/app-next/'
/** The window's page. */
export const appStart = `${appOrigin}${appBase}`

/** The privileges the scheme is registered with, before the app is ready. */
export const appSchemePrivileges = {
  standard: true,
  secure: true,
  supportFetchAPI: true,
  stream: true,
  codeCache: true,
} as const

const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.txt': 'text/plain; charset=utf-8',
}

/** The type a file is served as; plain text when its name says nothing known. */
export function contentType(file: string): string {
  return types[path.extname(file).toLowerCase()] ?? 'text/plain; charset=utf-8'
}

/**
 * The file an address names inside the copied build, or undefined: another
 * host, a path outside `app-next/`, an encoded slash or backslash, `..`, a
 * NUL. A folder's address (ending in `/`) names its `index.html`.
 */
export function appFile(root: string, address: string): string | undefined {
  let url: URL
  try {
    url = new URL(address)
  } catch {
    return undefined
  }
  if (url.protocol !== `${appScheme}:` || url.host !== appHost) return undefined
  if (!url.pathname.startsWith(appBase)) return undefined
  let rest: string
  try {
    rest = decodeURIComponent(url.pathname.slice(appBase.length))
  } catch {
    return undefined
  }
  if (rest.includes('\0') || rest.includes('\\')) return undefined
  const parts = rest.split('/')
  if (parts.some((part) => part === '..' || part === '.')) return undefined
  if (rest === '' || rest.endsWith('/')) parts[parts.length - 1] = 'index.html'
  const file = path.resolve(root, ...parts.filter((part) => part !== ''))
  const inside = path.relative(path.resolve(root), file)
  if (inside === '' || inside.startsWith('..') || path.isAbsolute(inside))
    return undefined
  return file
}
