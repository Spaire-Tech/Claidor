// The session in the Windows app (`MacSession` in mac/Simeon/MacSession.swift):
// the server the app names, the pair and the computer's address kept by the
// app (Windows' own protection, `safeStorage`), the app's own name to the
// server, and no website: no cookie to trade, and signing in or out never
// leaves the window. Signed out, the sign-in screen (window/SignInScreen.tsx)
// opens the server's sign-in page in the default browser (`openExternal`)
// and polls for the pair (core/signIn.ts). The agents and chats are kept on
// this PC (core/savedChats.ts), the logs in the app's folder.

import { sessionVault } from '../core/api'
import { streamLog } from '../core/cloudComputer'
import { sessionSavedGateway } from '../core/savedGateway'
import type { SessionOptions, WebSession } from '../session'
import type { Desktop } from './desktop'
import { beforeQuit } from './quitting'
import { desktopSavedChats } from './savedChats'

/** How the Windows app names itself to the server (`x-simeon-client-version`), as the Mac's `mac-<version>+<build>`. */
export function desktopClientVersion(desktop: Desktop): string {
  return `windows-${desktop.facts.version}+${desktop.facts.build}`
}

/** The call's own window (7c): it draws the main window's call, and never signs in nor keeps the chats. */
export function isCallWindow(desktop: Desktop): boolean {
  return desktop.facts.window === 'call'
}

export function desktopSessionOptions(desktop: Desktop): SessionOptions {
  return {
    base: desktop.facts.apiBase,
    vault: sessionVault(desktop.kept),
    saved: sessionSavedGateway(desktop.kept),
    clientVersion: desktopClientVersion(desktop),
    tradesCookie: false,
    // The window stays: signed out, it shows the sign-in screen.
    goSignIn: () => {},
    goSignOut: () => {},
    // The server's sign-in page in the default browser (the Mac's `NSWorkspace.open`).
    openBrowser: (url) =>
      void desktop.call('openExternal', url).catch(() => {}),
    savedChats: isCallWindow(desktop) ? undefined : desktopSavedChats(desktop),
  }
}

/**
 * What the Windows app adds around the session once it is made: Disk Saver
 * set to work by the app itself when the disk runs low, as on the Mac; the
 * call's steps and the screens' connections written to the app's two logs (the
 * Mac's `voice-call.log`, `computer-stream.log`); the chats kept when the
 * window goes behind and before the app quits (the Mac's
 * `applicationWillTerminate`, StoreSaved.swift's `isForeground`).
 */
export function startDesktopSession(
  desktop: Desktop,
  session: WebSession,
): () => void {
  if (isCallWindow(desktop)) return () => {}
  const store = session.store
  // The disk running low sets Disk Saver to work by itself, as the Mac app does (the store's `startsDiskSaver`; a browser's tab never does).
  store.startsDiskSaver = true
  const write = (
    name: 'voice-call.log' | 'computer-stream.log',
    line: string,
  ) => void desktop.call('writeLog', name, line).catch(() => {})
  store.callLog = (line) => write('voice-call.log', line)
  streamLog.sink = (line) => write('computer-stream.log', line)
  const keepNow = () => store.saveNow()
  const behind = () => {
    if (document.visibilityState === 'hidden') keepNow()
  }
  window.addEventListener('blur', keepNow)
  document.addEventListener('visibilitychange', behind)
  const stopQuitting = beforeQuit(async () => {
    store.saveNow()
    await store.saved?.waitForWrites()
  })
  return () => {
    window.removeEventListener('blur', keepNow)
    document.removeEventListener('visibilitychange', behind)
    stopQuitting()
    streamLog.sink = undefined
  }
}
