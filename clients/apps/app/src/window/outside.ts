// Pages the window opens outside itself, in one place: the web's own way on
// the web, the Mac's way in the Windows app (step 7d).
//
// - A page whose address comes after the click (the access cover's and the
//   access notice's Stripe page, Usage & Billing's, Slack's and GitHub's
//   linking page): on the web a tab opened blank in the click, the only
//   moment a browser lets a page open one (`openBlankTab`), sent to the page
//   once its address is known; in the Windows app nothing until then, and
//   then the default browser (the Mac's `NSWorkspace.open`).
// - Stripe's page for the account in the Windows app (`openBillingWindow`):
//   the Mac's sheet (`MacBillingPage.open`), a window of the app's own over
//   this one that closes as Stripe's page comes back on the app's own link
//   (`/desktop/billing/back?to=simeon`); then, after a failed payment, the
//   plan charged on the card just saved, and the access and the usage read
//   again.
// - Connecting an app (`connectorBrowser`): the browser's tabs on the web;
//   in the Windows app the default browser, the app's own scheme for the
//   sign-in's way back, and this PC's loopback for the makers that take
//   only that (connector.ts).

import { appScheme } from '../core/deepLink'
import type { AppStore } from '../core/store'
import { type Desktop, type DesktopCalls, desktop } from '../desktop/desktop'
import { t } from '../l10n'
import { openBlankTab } from './blankTab'
import { type ConnectorBrowser, browserTabs } from './connector'

/** The Windows app is around the window (its pages go to the default browser and its own windows). */
export function inApp(): boolean {
  return desktop() !== undefined
}

/**
 * A page opened outside the window in the click that asks for it, before
 * its address is known: on the web a tab opened blank now, in the Windows
 * app nothing until its address comes.
 */
export interface PendingPage {
  /** The browser refused the click's tab (the web; never in the Windows app). */
  readonly refused: boolean
  /** The person closed the blank tab before its page came (the web). */
  readonly closed: boolean
  /** Sends it to its page; `noReferrer` hides the app's address from the page. Refused on the click, the page gets a tab of its own if the browser allows it now. */
  go(url: string, options?: { noReferrer?: boolean }): void
  /** No page came: the blank tab closes (nothing to close in the Windows app). */
  drop(): void
}

/** A page in the default browser, from the Windows app: http, https, mailto, tel and obsidian only (the app checks). */
function inBrowser(host: Desktop, url: string): void {
  void host.call('openExternal', url).catch(() => {})
}

/** Call it in the click: on the web its tab opens now. */
export function openPending(): PendingPage {
  const host = desktop()
  if (host)
    return {
      refused: false,
      closed: false,
      go: (url) => inBrowser(host, url),
      drop() {},
    }
  const tab = openBlankTab()
  return {
    refused: tab === null,
    get closed() {
      return tab?.closed ?? false
    },
    go(url, options) {
      if (!tab) window.open(url, '_blank', 'noopener')
      else if (options?.noReferrer) sendTab(tab, url)
      else tab.location.href = url
    },
    drop() {
      tab?.close()
    },
  }
}

/** The blank tab sent to `url` by a link of its own that carries no referrer: the page isn't told the app's address. */
export function sendTab(page: Window, url: string): void {
  try {
    const link = page.document.createElement('a')
    link.href = url
    link.rel = 'noreferrer'
    page.document.body.append(link)
    link.click()
  } catch {
    page.location.href = url
  }
}

/** Stripe's page is being asked for or shown: one at a time (`MacBillingPage`'s `session`). */
let billingOpen = false

/**
 * Stripe's page for the account in the Windows app (`MacBillingPage.open`):
 * asked for naming the app (`back: "simeon"`), shown in a window of the
 * app's own over this one, the window's work waiting meanwhile ("Opening…"
 * on Usage & Billing's row, as the Mac's). After a failed payment, once
 * the page came back on the app's own link, the plan is charged on the card
 * just saved (`billing/settle`); the access and the usage are read again
 * either way. In the default browser when the window can't open (no
 * charge then). None when it opened, else why not.
 */
export async function openBillingWindow(
  store: AppStore,
  flow?: string,
  tier?: string,
): Promise<string | undefined> {
  const host = desktop()
  const fallback = t('Couldn’t open billing. Try again.')
  if (!host) return fallback
  if (billingOpen) return undefined
  billingOpen = true
  try {
    const paymentFailed = store.paymentFailed
    const answer = await store.billingPortal(flow, tier, appScheme)
    if (!answer.url) return answer.message ?? fallback
    let end: ReturnType<DesktopCalls['openBilling']>
    try {
      end = await host.call('openBilling', answer.url)
    } catch {
      return fallback
    }
    // Another is open already (the app brought it forward): this one is nothing more.
    if (end === 'busy') return undefined
    await store.settleAfterCardPage(paymentFailed && end === 'back')
    return undefined
  } finally {
    billingOpen = false
  }
}

/** How the window connects an app (connector.ts): the browser's tabs on the web, the default browser and this PC's loopback in the Windows app. */
export function connectorBrowser(): ConnectorBrowser {
  const host = desktop()
  return host ? appBrowser(host) : browserTabs
}

/** The Windows app's way (the Mac's browser fallback, its `back` and its `LoopbackCatcher`). */
export function appBrowser(host: Desktop): ConnectorBrowser {
  return {
    scheme: appScheme,
    // The default browser's tab is the person's: the app can neither watch it nor close it.
    openTab: () => ({
      closed: false,
      go: (url) => inBrowser(host, url),
      close() {},
    }),
    wait: (ms) => new Promise((done) => setTimeout(done, ms)),
    async catchLoopback(state, caught) {
      let heard = false
      const stopHearing = host.on('loopbackAnswer', (answer) => {
        if (heard || answer?.state !== state) return
        heard = true
        caught({
          state: answer.state,
          code: answer.code,
          error: answer.error,
          errorDescription: answer.errorDescription,
        })
      })
      let listening = false
      try {
        listening = await host.call('catchLoopback', state)
      } catch {
        listening = false
      }
      if (!listening) {
        stopHearing()
        return undefined
      }
      return () => {
        stopHearing()
        void host.call('stopLoopback', state).catch(() => {})
      }
    },
  }
}
