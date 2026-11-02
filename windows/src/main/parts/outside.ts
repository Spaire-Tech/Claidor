// Step 7d, links and pages outside: `simeon://` links, the sign-in listener on 127.0.0.1:8787, Stripe's pages, Windows Hello, the clipboard, 1Password (MacConnector.swift, DeepLink.swift, PurchaseApproval.swift, MacOnePassword.swift).
// Its calls are answered here (`handle`, ../bridge.ts) and named in
// clients/apps/app/src/desktop/contract.ts, in its own section. Every
// argument is checked here: it comes from a page.
//
// - Links: held for the main window's page until it takes them, then sent
//   as they come (outside/links.ts); what each does is the page's (the Mac's
//   rules, src/core/deepLink.ts).
// - The loopback: one sign-in's listener at a time, its answer to the page
//   that asked; let go when the sign-in ends, the page goes, or after ten
//   minutes (the sign-in's own wait is five).
// - Stripe's page: a window of the app's own over the main one
//   (outside/billing.ts).
// - Windows Hello (outside/hello.ts), the clipboard (Electron's own, read
//   for the main window's page only), 1Password's command-line tool
//   (outside/onePassword.ts).
// - Downloads keep Electron's own save dialog (Windows' Save As), as the
//   Mac's save panel: nothing is saved without the person.

import { type WebContents, clipboard } from 'electron'
import { emit, handle, text } from '../bridge'
import type { AppContext } from '../context'
import { openBillingWindow, opensBilling } from '../outside/billing'
import { Hello } from '../outside/hello'
import { type LinkPage, LinkPost } from '../outside/links'
import { LoopbackCatcher } from '../outside/loopback'
import { OnePassword } from '../outside/onePassword'

/** A loopback listener is let go after this, whatever happens: the sign-in it serves asks for 5 minutes. */
export const loopbackMostMs = 10 * 60_000
/** The longest sign-in state taken (the computer's are short: `vendor-canva-Zz9_…`). */
const stateLimit = 512
/** The clipboard's text the page may write, at most (a page's argument). */
const clipboardLimit = 16 * 1024 * 1024

/** A sign-in's state: printable, no spaces, as the core reads it from a query. */
function signInState(value: unknown): string {
  const state = text(value, stateLimit)
  if (!/^[\x21-\x7e]+$/.test(state)) throw new Error('A sign-in state was expected.')
  return state
}

export function register(context: AppContext): void {
  const mainPage = (): WebContents | undefined => context.mainWindow()?.webContents

  // MARK: Links

  const post = new LinkPost()
  const pages = new WeakMap<WebContents, LinkPage>()
  context.onLink((url) => post.arrive(url))
  handle('takeLinks', (from) => {
    if (from !== mainPage()) return []
    let page = pages.get(from)
    if (!page) {
      const made: LinkPage = {
        get alive() {
          return !from.isDestroyed()
        },
        send: (url: string) => emit(from, 'link', url),
      }
      page = made
      pages.set(from, made)
      // The page reloaded or went: links wait for it again, until it takes them.
      from.on('did-start-navigation', (details) => {
        if (details.isMainFrame && !details.isSameDocument) post.left(made)
      })
      from.once('destroyed', () => post.left(made))
    }
    return post.take(page)
  })

  // MARK: The loopback

  let catcher: { catcher: LoopbackCatcher; page: WebContents; timer: ReturnType<typeof setTimeout> } | undefined
  const letGo = (state?: string) => {
    if (!catcher || (state !== undefined && catcher.catcher.state !== state)) return
    clearTimeout(catcher.timer)
    catcher.catcher.stop()
    catcher = undefined
  }
  handle('catchLoopback', async (from, value) => {
    const state = signInState(value)
    // A newer sign-in takes the older one's place, and its address.
    letGo()
    const made = await LoopbackCatcher.start(state, (answer) => emit(from, 'loopbackAnswer', answer))
    if (!made) return false
    // Another call came meanwhile: the newest keeps the address.
    if (catcher) {
      made.stop()
      return false
    }
    catcher = {
      catcher: made,
      page: from,
      timer: setTimeout(() => letGo(state), loopbackMostMs),
    }
    from.once('destroyed', () => {
      if (catcher?.page === from) letGo()
    })
    return true
  })
  handle('stopLoopback', (_from, value) => {
    letGo(signInState(value))
  })
  context.beforeQuit(() => letGo())

  // MARK: Stripe's page

  handle('openBilling', (from, value) => {
    const url = text(value, 8_192)
    if (!opensBilling(url)) throw new Error('Stripe’s page is an https address.')
    const window = context.mainWindow()
    return openBillingWindow(url, window && from === window.webContents ? window : undefined, context.facts.apiBase)
  })

  // MARK: Windows Hello

  const hello = new Hello(process.platform, process.env)
  // A reason longer than Hello shows is cut there (`reasonLimit`), never refused.
  handle('confirmPresence', (_from, value) => hello.confirm(text(value, 4_096)))

  // MARK: The clipboard

  handle('readClipboard', (from) => {
    if (from !== mainPage()) return ''
    return clipboard.readText()
  })
  handle('writeClipboard', (_from, value) => {
    clipboard.writeText(text(value, clipboardLimit))
  })

  // MARK: 1Password

  const onePassword = new OnePassword(process.platform, process.env)
  handle('onePasswordAccounts', () => onePassword.accounts())
  handle('onePasswordConnect', (_from, value) => onePassword.connect(text(value, 128)))
}
