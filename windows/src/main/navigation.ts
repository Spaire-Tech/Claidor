// Windows of the app whose page is not the app's own (7d's Stripe window,
// outside/billing.ts): their part rules where they may go, so main.ts's rule
// for every other window (only the app's page; addresses to the default
// browser) leaves them be.

import { type WebContents, app } from 'electron'

const own = new WeakSet<WebContents>()

/** The part that made `contents` rules its navigation itself. */
export function ownsNavigation(contents: WebContents): void {
  own.add(contents)
}

/** Whether a part rules this page's navigation itself. */
export function navigatesOnItsOwn(contents: WebContents): boolean {
  return own.has(contents)
}

/**
 * What any page of the app may open: nothing but the app's own page in its
 * windows; addresses go to the default browser. A page a part rules itself
 * (`ownsNavigation`: 7d's Stripe window, the agents' tabs of the browser in
 * the app) is left to its part. Here so the checks run the app's own rule.
 */
export function ruleEveryPage(options: {
  appStart: string
  opensOutside(url: string): boolean
  openOutside(url: string): void
}): void {
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-attach-webview', (event) => event.preventDefault())
    contents.on('will-navigate', (event, url) => {
      if (url.startsWith(options.appStart) || navigatesOnItsOwn(contents)) return
      event.preventDefault()
      if (options.opensOutside(url)) options.openOutside(url)
    })
    contents.setWindowOpenHandler(({ url }) => {
      if (options.opensOutside(url)) options.openOutside(url)
      return { action: 'deny' }
    })
  })
}
