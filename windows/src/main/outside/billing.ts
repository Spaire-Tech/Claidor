// Stripe's page for the account in a window of the app's own
// (mac/Simeon/MacConnector.swift's `MacBillingPage`, the Mac's sign-in sheet
// on the window): over the app's window and holding it while it shows, as a
// sheet does; Stripe's own pages and the bank's checks go on inside it;
// links that open a new window go to the default browser. It closes once
// the page comes back on the app's own link (Simeon Labs' server sends
// Stripe's return on: `/desktop/billing/back?to=simeon` → `simeon://app/v1/open`),
// or when the person closes it. Nothing of the app reaches it: no preload,
// its own storage (`persist:simeon-billing`, kept between openings, as the
// Mac's sheet shares the browser's sign-ins), no permission of any kind.

import {
  BrowserWindow,
  type Session,
  type WebContents,
  nativeTheme,
  screen,
  session,
  shell,
} from 'electron'
import { ownsNavigation } from '../navigation'
import { opensOutside } from '../policy'

/** The window's own storage: Stripe's cookies, apart from the app's page. */
export const billingPartition = 'persist:simeon-billing'

/** The app's own scheme, which the page comes back on. */
const backScheme = 'simeon:'

/** What a navigation of the billing window's page does: comes back to the app, goes on inside it, or is refused. */
export function billingStep(url: string, apiBase: string): 'back' | 'go' | 'refuse' {
  let address: URL
  try {
    address = new URL(url)
  } catch {
    return 'refuse'
  }
  if (address.protocol === backScheme) return 'back'
  if (address.protocol === 'https:' && address.hostname !== '') return 'go'
  // The app's own server on this computer (a developer's, the checks' stand-in): its return page.
  try {
    if (address.origin === new URL(apiBase).origin) return 'go'
  } catch {
    // No server: nothing else goes.
  }
  return 'refuse'
}

/** The first page: https only (Stripe's), as the Mac takes it (`StoreSettings.billingPortal`). */
export function opensBilling(url: string): boolean {
  try {
    const address = new URL(url)
    return address.protocol === 'https:' && address.hostname !== '' && !address.username && !address.password
  } catch {
    return false
  }
}

/** Its size: 960 × 760 at most, inside the work area of the app's window's screen, centred over the window. */
export function billingBounds(
  parent: { x: number; y: number; width: number; height: number } | undefined,
  area: { x: number; y: number; width: number; height: number },
): { x: number; y: number; width: number; height: number } {
  const width = Math.min(960, Math.max(480, area.width - 48))
  const height = Math.min(760, Math.max(520, area.height - 48))
  const centre = parent
    ? { x: parent.x + parent.width / 2, y: parent.y + parent.height / 2 }
    : { x: area.x + area.width / 2, y: area.y + area.height / 2 }
  const x = Math.round(Math.min(Math.max(centre.x - width / 2, area.x), area.x + area.width - width))
  const y = Math.round(Math.min(Math.max(centre.y - height / 2, area.y), area.y + area.height - height))
  return { x, y, width, height }
}

let billingSession: Session | undefined

/** The billing window's storage, with no permission for any page in it. */
function billingStorage(): Session {
  if (billingSession) return billingSession
  const own = session.fromPartition(billingPartition)
  own.setPermissionRequestHandler((_contents, _permission, done) => done(false))
  own.setPermissionCheckHandler(() => false)
  // Nothing is saved from it without the person: Electron's own save dialog.
  billingSession = own
  return own
}

let open: { window: BrowserWindow; ended: Promise<'back' | 'closed'> } | undefined

/**
 * Opens Stripe's page over `parent`: `back` once it came back on the app's
 * link, `closed` when the person closed it, `busy` when one is open already
 * (brought forward), `browser` when the window couldn't be made (the page
 * went to the default browser instead: the Mac's fallback).
 */
export function openBillingWindow(
  url: string,
  parent: BrowserWindow | undefined,
  apiBase: string,
): Promise<'back' | 'closed' | 'browser' | 'busy'> {
  if (open && !open.window.isDestroyed()) {
    open.window.show()
    open.window.focus()
    return Promise.resolve('busy')
  }
  let window: BrowserWindow
  try {
    const display = parent && !parent.isDestroyed() ? screen.getDisplayMatching(parent.getBounds()) : screen.getPrimaryDisplay()
    const bounds = billingBounds(parent && !parent.isDestroyed() ? parent.getBounds() : undefined, display.workArea)
    window = new BrowserWindow({
      ...bounds,
      parent: parent && !parent.isDestroyed() ? parent : undefined,
      modal: !!parent && !parent.isDestroyed(),
      show: false,
      title: 'Simeon',
      autoHideMenuBar: true,
      minimizable: false,
      backgroundColor: nativeTheme.shouldUseDarkColors ? '#070707' : '#fcfcfc',
      webPreferences: {
        session: billingStorage(),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        webSecurity: true,
        spellcheck: false,
      },
    })
  } catch {
    void shell.openExternal(url)
    return Promise.resolve('browser')
  }
  const contents = window.webContents
  ownsNavigation(contents)
  const ended = new Promise<'back' | 'closed'>((done) => {
    let end: 'back' | 'closed' | undefined
    const finish = (how: 'back' | 'closed') => {
      if (end) return
      end = how
      done(how)
      if (!window.isDestroyed()) window.close()
    }
    watchNavigation(contents, apiBase, () => finish('back'))
    window.on('closed', () => {
      if (open?.window === window) open = undefined
      finish('closed')
    })
  })
  open = { window, ended }
  window.once('ready-to-show', () => window.show())
  void window.loadURL(url).catch(() => {
    // Offline, or the page refused: the window stays, saying so in Chromium's words, until it is closed.
    if (!window.isDestroyed()) window.show()
  })
  return ended
}

/** Where the page may go: Stripe's pages (and the bank's) inside; the app's own link closes it; new windows to the default browser. */
function watchNavigation(contents: WebContents, apiBase: string, back: () => void): void {
  const step = (event: { preventDefault(): void }, url: string) => {
    const next = billingStep(url, apiBase)
    if (next === 'go') return
    event.preventDefault()
    if (next === 'back') back()
  }
  contents.on('will-navigate', (event) => step(event, event.url))
  contents.on('will-redirect', (event) => {
    if (event.isMainFrame) step(event, event.url)
  })
  // A link Chromium hands to the system (an app's own scheme), wherever it came from: the app's own link closes it, nothing else leaves.
  contents.session.setPermissionRequestHandler((_contents, permission, done, details) => {
    const external = 'externalURL' in details ? details.externalURL : undefined
    if (permission === 'openExternal' && external && billingStep(external, apiBase) === 'back') back()
    done(false)
  })
  contents.setWindowOpenHandler(({ url }) => {
    if (billingStep(url, apiBase) === 'back') back()
    else if (opensOutside(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  contents.on('will-attach-webview', (event) => event.preventDefault())
}
