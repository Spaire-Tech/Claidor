// When the app's page goes: it reloads or goes to another of the app's own
// addresses. Electron says a navigation started (`did-start-navigation`)
// before it asks whether it may (`will-navigate`), so a link to another site,
// which main.ts refuses and hands to the default browser, starts one too
// (measured with Electron 44: `did-start` then `will-navigate` for a refused
// click and for `location.href`). Only the app's own address is one the page
// can really go to; the rest never leave it.

import { appStart } from '../appProtocol'

/** What `did-start-navigation` says of a navigation. */
export interface NavigationStart {
  url: string
  isMainFrame: boolean
  isSameDocument: boolean
}

/** Whether the app's page is going: its main frame, to a new document, at the app's own address (a reload is one). */
export function pageLeaves(start: NavigationStart): boolean {
  return start.isMainFrame && !start.isSameDocument && typeof start.url === 'string' && start.url.startsWith(appStart)
}
