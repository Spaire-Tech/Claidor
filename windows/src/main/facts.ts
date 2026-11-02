// What the app knows about itself and hands the page (contract.ts,
// `DesktopFacts`): its version and build, Windows' version and languages,
// the server, and the few settings the page reads from the environment.

import type { DesktopFacts } from '../../../clients/apps/app/src/desktop/contract'

export const defaultAPI = 'https://api.simeonlabs.com'

/** The settings the page may read (`SIMEON_VOICE_CALLS`, core/call.ts); nothing else of the environment reaches it. */
export const pageSettings = ['SIMEON_VOICE_CALLS'] as const

function isLoopback(host: string): boolean {
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '[::1]' ||
    host === '::1'
  )
}

/**
 * The server the app talks to: `--api=<address>` or `SIMEON_API` (the Mac's
 * own two ways), followed only to a server on this computer or to Simeon
 * Labs' own over https (as the web's `?api=`, core/api.ts `allowedAPI`);
 * anything else is the real one.
 */
export function apiBaseFrom(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
): string {
  const flag = argv.find((arg) => arg.startsWith('--api='))
  const asked = flag ? flag.slice('--api='.length) : env.SIMEON_API
  if (!asked) return defaultAPI
  let url: URL
  try {
    url = new URL(asked)
  } catch {
    return defaultAPI
  }
  const local =
    (url.protocol === 'http:' || url.protocol === 'https:') &&
    isLoopback(url.hostname)
  const ours =
    url.protocol === 'https:' &&
    (url.hostname === 'simeonlabs.com' || url.hostname.endsWith('.simeonlabs.com'))
  if (!local && !ours) return defaultAPI
  if (url.username || url.password || url.search || url.hash) return defaultAPI
  return url.origin + url.pathname.replace(/\/+$/, '')
}

export interface AppFacts {
  version: string
  build: string
  osVersion: string
  platform: string
  systemLanguages: string[]
  argv: readonly string[]
  env: Readonly<Record<string, string | undefined>>
}

/** The facts for a window's page. */
export function factsFor(app: AppFacts, window: DesktopFacts['window']): DesktopFacts {
  const env: Record<string, string> = {}
  for (const key of pageSettings) {
    const value = app.env[key]
    if (value != null) env[key] = value
  }
  return {
    platform: app.platform,
    version: app.version,
    build: app.build,
    track: 'stable',
    osVersion: app.osVersion,
    apiBase: apiBaseFrom(app.argv, app.env),
    systemLanguages: [...app.systemLanguages],
    env,
    window,
  }
}

/** The facts as one command-line argument for the page's preload (`additionalArguments`): no secret is ever in them. */
export const factsFlag = '--simeon-facts='

export function factsArgument(facts: DesktopFacts): string {
  return `${factsFlag}${Buffer.from(JSON.stringify(facts)).toString('base64')}`
}
