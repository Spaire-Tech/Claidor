// Windows of the app whose page is not the app's own (7d's Stripe window,
// outside/billing.ts): their part rules where they may go, so main.ts's rule
// for every other window (only the app's page; addresses to the default
// browser) leaves them be.

import type { WebContents } from 'electron'

const own = new WeakSet<WebContents>()

/** The part that made `contents` rules its navigation itself. */
export function ownsNavigation(contents: WebContents): void {
  own.add(contents)
}

/** Whether a part rules this page's navigation itself. */
export function navigatesOnItsOwn(contents: WebContents): boolean {
  return own.has(contents)
}
