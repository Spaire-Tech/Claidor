// Connecting an app (mac/Simeon/MacConnector.swift, `MacConnector`): the
// consent first (`ConnectConsent`, ConnectConsent.tsx), then the app's
// sign-in, closed once the app is connected. One for the window, shared
// through `ConnectorContext`: the chat's cards (Connect), Connectors' rows
// and pages (Add, Connect, an account's sign-in, Add Another Account) all
// go through it, so one sign-in is open at a time; a newer one takes the
// older one's place.
//
// The web's way (2 November 2026, the session): the Mac opens the page in
// Apple's sign-in sheet on the window; a browser has none, so the page
// opens in a tab of the browser's own, opened blank at once on the person's
// click (a browser lets a tab open only then; the computer is asked for the
// page meanwhile), without `opener`, then sent to the page, the way step
// 3c's Slack and GitHub cards open theirs. As on the Mac the app is asked
// every 2 seconds, up to 150 times, and the tab is closed once it is
// connected. A tab the person closed can't say whether the sign-in had
// finished (the server's last page says "close this tab", and the web
// app's own return page closes itself): it is the Mac's browser
// fallback, "it may finish there", so it is looked at ten more times (the
// Mac's sheet closed on the maker's page) and then ends `unconfirmed`, and
// the app it added is never taken back for it. A blank tab closed before
// its page came is the person changing their mind: `cancelled`.
//
// The makers that send a sign-in back only to this computer's own loopback
// (`localhost:8787`, `loopbackOnly` in the computer's catalogue: Canva,
// Dropbox, Square, Vercel…) are listened for by the Mac and the iPhone; a
// browser can't listen, so their page is never opened here (it couldn't
// finish) and the connect ends `cancelled`, the app it added taken back.
// The catalogues have no sentence for why yet (docs/web-app/PROGRESS.md).

import {
  createContext,
  useCallback,
  useContext,
  useSyncExternalStore,
} from 'react'
import { type ConnectConsent, connectConsent } from '../core/connectConsent'
import { type SignInEnd, loopbackState, undoes } from '../core/connecting'
import type { AppStore } from '../core/store'

export type { SignInEnd } from '../core/connecting'

/** The consent over the window, and what Connect then does (`MacConnector.Ask`). */
export interface ConnectAsk {
  /** The app's name, as the catalogue or the card names it. */
  name: string
  /** What the person reads (`ConnectConsent`). */
  consent: ConnectConsent
  go: () => Promise<void>
  /** Connect goes on to a sign-in page: its tab is opened blank on the click. */
  opensSignIn: boolean
}

/** A tab a sign-in shows in. */
export interface SignInTab {
  readonly closed: boolean
  /** Sends it to the sign-in's page. */
  go(url: string): void
  close(): void
}

/** What connecting asks of the browser (a stand-in in the tests). */
export interface ConnectorBrowser {
  /** A new tab, opened blank now; none when the browser won't open one (it lets a page open tabs only on the person's click). */
  openTab(): SignInTab | undefined
  /** The page in a tab not watched (`NSWorkspace.open`): when no tab of ours would open. */
  openElsewhere(url: string): void
  wait(ms: number): Promise<void>
}

/** The browser's own tabs. */
export const browserTabs: ConnectorBrowser = {
  openTab() {
    const tab = window.open('', '_blank')
    if (!tab) return undefined
    // A tab opened so starts with a copy of this tab's storage, the sign-in's pair with it: emptied before the tab goes anywhere, so no page in it ever finds it.
    try {
      tab.sessionStorage.clear()
    } catch {
      // Storage the browser blocks holds nothing.
    }
    tab.opener = null
    return {
      get closed() {
        return tab.closed
      },
      go(url) {
        if (!tab.closed) tab.location.href = url
      },
      close() {
        if (!tab.closed) tab.close()
      },
    }
  },
  openElsewhere(url) {
    window.open(url, '_blank', 'noopener')
  },
  wait: (ms) => new Promise((done) => setTimeout(done, ms)),
}

/** The app is asked every 2 seconds, 150 times: 5 minutes (`signIn`). */
export const askEvery = 2_000
export const askTimes = 150
/** Looks after the tab closed (the Mac's sheet closed on the maker's page). */
export const looksAfterClosing = 10

/**
 * A tab and the asking together (the Mac's `SignInSheetState`): once the
 * tab is closed, ten more looks, then the end.
 */
class TabWatch {
  private looksLeft?: number

  keepGoing(closed: boolean): boolean {
    if (!closed) return true
    this.looksLeft ??= looksAfterClosing
    if (this.looksLeft <= 0) return false
    this.looksLeft -= 1
    return true
  }
}

export class Connector {
  private listeners = new Set<() => void>()
  private version = 0

  /** The consent over the window, or none (`asking`). */
  asking?: ConnectAsk
  /** The app whose sign-in is open (its name), or none (`connecting`): the other Connect buttons wait. */
  connecting?: string
  /** The open sign-in's tab (the Mac's `session`). */
  private tab?: SignInTab
  /** Tabs opened blank on a click, waiting for their page. */
  private held: SignInTab[] = []
  /** The newest sign-in (`current`): an older one finds it changed and ends `replaced`. */
  private current = 0

  constructor(
    readonly store: AppStore,
    private readonly browser: ConnectorBrowser = browserTabs,
  ) {}

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getVersion = (): number => this.version

  protected changed(): void {
    this.version += 1
    for (const listener of this.listeners) listener()
  }

  /** The consent is over the window: its Return and Escape are its own (`MacConnector.showing`). */
  get showing(): boolean {
    return this.asking !== undefined
  }

  /**
   * The consent for `name` (the catalogue's app when there is one), then
   * `go` on Connect (`ask(_:store:then:)`). `signIn: false` when Connect
   * goes on to no sign-in page (a form of values first): no tab is opened
   * for it.
   */
  ask(
    name: string,
    go: () => Promise<void>,
    options: { signIn?: boolean } = {},
  ): void {
    this.asking = {
      name,
      consent: connectConsent(this.store.catalogApp(name), name),
      go,
      opensSignIn: options.signIn ?? true,
    }
    this.changed()
  }

  cancel(): void {
    if (!this.asking) return
    this.asking = undefined
    this.changed()
  }

  /** Connect on the consent: its click opens the sign-in's tab, blank, before anything is asked. */
  confirm(): void {
    const ask = this.asking
    if (!ask) return
    this.asking = undefined
    this.changed()
    if (ask.opensSignIn) void this.holdingTab(ask.go)
    else void ask.go()
  }

  /**
   * `work` with a tab opened blank now, on the person's click: the first
   * sign-in it opens (`signIn`) is shown there, and the tab closes if none
   * is. For a sign-in asked for without the consent (Reopen, Retry), so its
   * tab can open.
   */
  async holdingTab(work: () => Promise<void>): Promise<void> {
    const tab = this.browser.openTab()
    if (tab) this.held.push(tab)
    try {
      await work()
    } finally {
      const left = tab ? this.held.indexOf(tab) : -1
      if (tab && left >= 0) {
        this.held.splice(left, 1)
        tab.close()
      }
    }
  }

  /**
   * A chat card's Connect (`connect(_:store:)`): the consent, then the app
   * added and its sign-in opened in one go, closed once the app is
   * connected. A sign-in the person cancels takes the app it added back
   * out, the card's spinner held until that is done.
   */
  connect(name: string): void {
    this.ask(name, async () => {
      if (this.connecting !== undefined) return
      // The card's spinner while the page is asked for.
      this.connecting = name
      this.changed()
      const start = await this.store.beginConnect(name)
      if (!start) {
        if (this.connecting === name) {
          this.connecting = undefined
          this.changed()
        }
        return
      }
      const end = await this.signIn(start.url, name, async () => {
        await this.store.loadApps()
        return this.store.isConnected(name)
      })
      if (undoes(end, start)) {
        this.connecting = name
        this.changed()
        await this.store.undoConnect(start, name)
        if (this.connecting === name) {
          this.connecting = undefined
          this.changed()
        }
      }
    })
  }

  /**
   * Add Another Account for an app Simeon Labs' server serves
   * (`addAccount(_:name:store:)`, `AppAccounts`): one more account's
   * sign-in, no consent, closed once the server lists a new account.
   */
  addAccount(toolkit: string, name: string): void {
    if (this.connecting !== undefined) return
    this.connecting = name
    this.changed()
    void this.holdingTab(async () => {
      await this.store.loadAppAccounts(toolkit)
      const before = new Set(this.store.appAccountIds(toolkit))
      const url = await this.store.anotherAccountURL(toolkit, name)
      if (!url) {
        if (this.connecting === name) {
          this.connecting = undefined
          this.changed()
        }
        return
      }
      await this.signIn(url, name, async () => {
        await this.store.loadAppAccounts(toolkit)
        return this.store.appAccountIds(toolkit).some((id) => !before.has(id))
      })
    })
  }

  /**
   * The app's sign-in page in a tab, closed once `done` says so
   * (`signIn(_:name:store:done:)`); how it ended (`SignInEnd`). A newer
   * sign-in takes this one's place and closes its tab.
   */
  async signIn(
    url: string,
    name: string,
    done: () => Promise<boolean>,
  ): Promise<SignInEnd> {
    this.tab?.close()
    this.tab = undefined
    const token = ++this.current
    this.connecting = name
    this.changed()
    const held = this.held.pop()
    try {
      // A maker that sends it back only to this computer's loopback: a browser can't listen there, so its page couldn't finish.
      if (loopbackState(url) != null) {
        held?.close()
        return 'cancelled'
      }
      // One that comes back through Simeon Labs' server (`serverReturnState`) is named to it first by the Mac and the
      // iPhone, with their own address; the web has none, and the server sends it on to the web app's own page
      // (connected.html), which finishes it on the computer and closes the tab. Nothing to do before it opens.
      // The blank tab closed before its page came: the person changed their mind.
      if (held?.closed) return 'cancelled'
      const tab = held ?? this.browser.openTab()
      if (!tab) {
        // In a tab not ours, it may finish there: never taken back.
        this.browser.openElsewhere(url)
        return 'unconfirmed'
      }
      this.tab = tab
      tab.go(url)
      const watch = new TabWatch()
      for (let look = 0; look < askTimes; look += 1) {
        await this.browser.wait(askEvery)
        if (this.current !== token) return 'replaced'
        if (await answered(done)) {
          tab.close()
          return 'connected'
        }
        if (!watch.keepGoing(tab.closed)) return 'unconfirmed'
      }
      tab.close()
      return 'unconfirmed'
    } finally {
      if (this.current === token) {
        this.tab = undefined
        this.connecting = undefined
        this.changed()
      }
    }
  }
}

/** One look: a look that fails is no answer, and the next one asks again. */
async function answered(done: () => Promise<boolean>): Promise<boolean> {
  try {
    return await done()
  } catch {
    return false
  }
}

export const ConnectorContext = createContext<Connector | undefined>(undefined)

/** The window's connector; none outside the window (a card drawn on its own, in a test). */
export function useConnector(): Connector | undefined {
  return useContext(ConnectorContext)
}

/** Redraws a screen as the connector changes (the consent, the app connecting); nothing without one. */
export function useConnectorWatched(connector: Connector | undefined): void {
  const subscribe = useCallback(
    (listener: () => void) => connector?.subscribe(listener) ?? (() => {}),
    [connector],
  )
  const version = useCallback(() => connector?.getVersion() ?? 0, [connector])
  useSyncExternalStore(subscribe, version, version)
}
