// The session in the Windows app (`MacSession` in mac/Simeon/MacSession.swift):
// the server the app names, the pair and the computer's address kept by the
// app (Windows' own protection, `safeStorage`), the app's own name to the
// server, and no website: no cookie to trade, and signing in or out never
// leaves the window. The sign-in screen and the browser's sign-in are 7b's.

import { sessionVault } from '../core/api'
import { sessionSavedGateway } from '../core/savedGateway'
import type { SessionOptions } from '../session'
import type { Desktop } from './desktop'

/** How the Windows app names itself to the server (`x-simeon-client-version`), as the Mac's `mac-<version>+<build>`. */
export function desktopClientVersion(desktop: Desktop): string {
  return `windows-${desktop.facts.version}+${desktop.facts.build}`
}

export function desktopSessionOptions(desktop: Desktop): SessionOptions {
  return {
    base: desktop.facts.apiBase,
    vault: sessionVault(desktop.kept),
    saved: sessionSavedGateway(desktop.kept),
    clientVersion: desktopClientVersion(desktop),
    tradesCookie: false,
    // The window stays: signed out, it shows the sign-in screen (7b).
    goSignIn: () => {},
    goSignOut: () => {},
  }
}
