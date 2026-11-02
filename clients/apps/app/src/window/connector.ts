// Connecting an app (mac/Simeon/MacConnector.swift, `MacConnector`): the
// consent first (`ConnectConsent`, ConnectConsent.tsx), then the app's
// sign-in, closed once the app is connected. One for the window, shared
// through `ConnectorContext`: the chat's cards (Connect), Connectors' rows
// and pages (Add, Connect, an account's sign-in, Add Another Account) all
// go through it, so one sign-in is open at a time; a newer one takes the
// older one's place.
//
// The web's way (2 November 2026, the session): the Mac opens the page in
// Apple's sign-in sheet on the window, at any time; a browser lets a page
// open a tab only on the person's click. So the click opens a tab, blank,
// at once (`holdingTab`, the consent's Connect does it for its `go`), and
// that click's work hands the tab to its own sign-in (`signIn`'s `tab`):
// a sign-in takes only the tab it is given, never another click's; the tab
// waits until its sign-in takes it, and closes if the work ends without
// one. The page opens without `opener`, the way step 3c's Slack and GitHub
// cards open theirs. As on the Mac the app is asked every 2 seconds, up to
// 150 times, and the tab is closed once it is connected, while it is still
// the window's to close: blank, or on the web app's own pages. A tab that
// has gone to another site can't be closed from here (measured in
// Chromium): with `opener` nulled the window is no longer, in HTML's
// words, familiar with it, and keeping `opener` would let that site send
// the window itself to a page of its own (measured too). Such a tab stays
// on that site's last page (the server's says "close this tab"); a
// sign-in that comes back through the server ends on the web app's own
// return page, which closes its tab itself.
//
// A tab the person closed can't say whether the sign-in had finished (the
// server's last page says "close this tab", and the web app's own return
// page closes itself): it is the Mac's browser fallback, "it may finish
// there", so it is looked at ten more times (the Mac's sheet closed on the
// maker's page) and then ends `unconfirmed`, and the app it added is never
// taken back for it. A blank tab closed before its page came is the person
// changing their mind, and a tab the browser refused on the click can't be
// had later: both `cancelled`, as a Mac sheet that never opened (the
// second is said in the window's alert). When the web app's own return
// page says the maker refused the sign-in (`signInEndsChannel`), it ends as
// the Mac's sheet closed on a refusal: two more looks, then `cancelled`.
//
// The makers that send a sign-in back only to this computer's own loopback
// (`localhost:8787`, `loopbackOnly` in the computer's catalogue: Canva,
// Dropbox, Square, Vercel…) are listened for by the Mac and the iPhone; a
// browser can't listen, so their page is never opened here (it couldn't
// finish) and the connect ends `cancelled`, the app it added taken back.
// The catalogues have no sentence for why yet (docs/web-app/PROGRESS.md).
//
// The Windows app's way (step 7d, `ConnectorBrowser`'s `scheme` and
// `catchLoopback`, src/desktop/connectorBrowser.ts): the page opens in the
// default browser (Google and others refuse their sign-in inside an
// embedded web view), which the app can't watch or close, so it is the
// Mac's browser fallback, asked every 2 seconds, 150 times. As on the Mac,
// our start link names the app (`back=simeon`), a sign-in that comes back
// through Simeon Labs' server is named to it first (`sendSignInBack`), and
// the app listens on this PC's loopback for the makers that take only that
// (`LoopbackCatcher`). What comes back on the app's own address
// (`simeon://connected`, `simeon://mcp-oauth`) is the Mac's sheet closing
// there (`cameBack`, `answered`).

import {
  createContext,
  useCallback,
  useContext,
  useSyncExternalStore,
} from 'react'
import { type ConnectConsent, connectConsent } from '../core/connectConsent'
import {
  type SignInAnswer,
  type SignInEnd,
  didntConnect,
  loopbackBusy,
  loopbackState,
  returning,
  serverReturnState,
  signInEndsChannel,
  signInHeard,
  undoes,
} from '../core/connecting'
import type { AppStore } from '../core/store'

export type { SignInEnd } from '../core/connecting'

/** The consent over the window, and what Connect then does (`MacConnector.Ask`). */
export interface ConnectAsk {
  /** The app's name, as the catalogue or the card names it. */
  name: string
  /** What the person reads (`ConnectConsent`). */
  consent: ConnectConsent
  /** What Connect does, given the tab its click opened (none when Connect leads to no page). */
  go: (tab: HeldTab | undefined) => Promise<void>
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

/**
 * A tab opened blank on one click (`holdingTab`), for the sign-in that
 * click leads to: only the sign-in it is handed to (`signIn`'s `tab`) takes
 * it. It waits until then, and is closed if its click's work ends without
 * one.
 */
export class HeldTab {
  /** A sign-in took it. */
  taken = false
  /** Its click's work ended without a sign-in taking it: closed. */
  released = false

  constructor(
    /** None when the browser refused to open it on the click. */
    readonly tab: SignInTab | undefined,
  ) {}

  /** The browser refused it: no page can be shown for this click. */
  get refused(): boolean {
    return this.tab === undefined
  }
}

/** What connecting asks of the browser (a stand-in in the tests). */
export interface ConnectorBrowser {
  /** A new tab, opened blank now; none when the browser won't open one (it lets a page open tabs only on the person's click). */
  openTab(): SignInTab | undefined
  wait(ms: number): Promise<void>
  /** Hears the web app's return page say how a sign-in with this state ended (`signInEndsChannel`); stops hearing when called back. */
  hear?(state: string, heard: (refused: boolean) => void): () => void
  /**
   * The app's own scheme, when a sign-in's last page can send the browser
   * back to the app (the Windows app's `simeon`): our start link names it
   * (`returning`), and a sign-in that comes back through Simeon Labs'
   * server is named to it first (`sendSignInBack`). None on the web.
   */
  readonly scheme?: string
  /**
   * Listens on this computer's loopback for a sign-in whose page returns
   * there (the Windows app, the core's `LoopbackCatcher`), telling `caught`
   * its answer, once. Resolves with what stops listening, or none when
   * another app holds the address. None on the web, which can't listen.
   */
  catchLoopback?(
    state: string,
    caught: (answer: SignInAnswer) => void,
  ): Promise<(() => void) | undefined>
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
        if (closable(tab)) tab.close()
      },
    }
  },
  wait: (ms) => new Promise((done) => setTimeout(done, ms)),
  hear(state, heard) {
    if (typeof BroadcastChannel === 'undefined') return () => {}
    const channel = new BroadcastChannel(signInEndsChannel)
    channel.onmessage = (event: MessageEvent) => {
      const said = signInHeard(event.data)
      if (said?.state === state) heard(said.refused)
    }
    return () => channel.close()
  },
}

/**
 * Whether the window may close a tab it opened: open, and blank or on the
 * web app's own pages (its address can be read). On another site a browser
 * refuses it ("Unsafe attempt to initiate navigation"), the tab's `opener`
 * being nulled: nothing is tried there.
 */
export function closable(tab: {
  readonly closed: boolean
  readonly location: { readonly href: string }
}): boolean {
  if (tab.closed) return false
  try {
    void tab.location.href
    return true
  } catch {
    return false
  }
}

/** The app is asked every 2 seconds, 150 times: 5 minutes (`signIn`). */
export const askEvery = 2_000
export const askTimes = 150
/** Looks after the tab closed (the Mac's sheet closed on the maker's page). */
export const looksAfterClosing = 10
/** Looks after the return page said the maker refused (the Mac's sheet closed on a refusal). */
export const looksAfterRefusal = 2

/**
 * A tab and the asking together (the Mac's `SignInSheetState`): once the
 * tab is closed, ten more looks, then `unconfirmed`; once the return page
 * said the maker refused, two, then `cancelled`.
 */
class TabWatch {
  private looksLeft?: number
  private refusedOnPage = false
  /** The sign-in came back on the app's own address (the Windows app): the Mac's sheet closed there. */
  private backHere = false

  cameBack(): void {
    this.backHere = true
  }

  refused(): void {
    if (this.refusedOnPage) return
    this.refusedOnPage = true
    this.looksLeft = looksAfterRefusal
  }

  keepGoing(closed: boolean): boolean {
    if (!closed && !this.backHere && !this.refusedOnPage) return true
    this.looksLeft ??= looksAfterClosing
    if (this.looksLeft <= 0) return false
    this.looksLeft -= 1
    return true
  }

  get ending(): SignInEnd {
    return this.refusedOnPage ? 'cancelled' : 'unconfirmed'
  }
}

/** How a sign-in ended, and whether its tab was refused by the browser (said to the person by the connector's own flows). */
interface SignInRun {
  end: SignInEnd
  refused: boolean
}

export class Connector {
  private listeners = new Set<() => void>()
  private version = 0

  /** The consent over the window, or none (`asking`). */
  asking?: ConnectAsk
  /** The app whose sign-in is open (its name), or none (`connecting`): the other Connect buttons wait. */
  connecting?: string
  /** What the window's alert tells the person, or none: a sign-in's page that couldn't open (the browser refused its tab). */
  told?: string
  /** The open sign-in's tab (the Mac's `session`). */
  private tab?: SignInTab
  /** The newest sign-in (`current`): an older one finds it changed and ends `replaced`. */
  private current = 0
  /** The open sign-in's loopback listener (the Mac's `catcher`), stopped as it ends or another takes its place. */
  private stopLoopback?: () => void
  /** The open sign-in, once its page is shown: its name, the state it comes back with through the server, and its watch. */
  private open?: { name: string; state?: string; watch: TabWatch }

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
   * `go` on Connect (`ask(_:store:then:)`), given the tab Connect's click
   * opened, to hand to its sign-in (`signIn(url, name, done, { tab })`).
   * `signIn: false` when Connect goes on to no sign-in page (a form of
   * values first): no tab is opened, and `go` is given none.
   */
  ask(
    name: string,
    go: (tab: HeldTab | undefined) => Promise<void>,
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
    if (ask.opensSignIn) void this.holdingTab((tab) => ask.go(tab))
    else void ask.go(undefined)
  }

  /**
   * `work` with a tab opened blank now, on the person's click, handed to it
   * for its sign-in (`signIn(url, name, done, { tab })`). Call it from the
   * click itself (a browser opens a tab only then). The tab waits until a
   * sign-in takes it; when `work` ends and none has, it closes. A sign-in
   * that waits before its page (Connectors' spacing) is started before
   * `work` ends, its wait given as `after`.
   */
  async holdingTab(work: (tab: HeldTab) => Promise<void>): Promise<void> {
    const held = new HeldTab(this.browser.openTab())
    try {
      await work(held)
    } finally {
      if (!held.taken) {
        held.released = true
        held.tab?.close()
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
    this.ask(name, async (held) => {
      if (this.connecting !== undefined) return
      // The browser refused the click's tab: no page can be shown, so nothing is asked or added; the person is told.
      if (held?.refused) {
        this.tell(didntConnect(name))
        return
      }
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
      const { end, refused } = await this.run(
        start.url,
        name,
        async () => {
          await this.store.loadApps()
          return this.store.isConnected(name)
        },
        { tab: held },
      )
      if (refused) this.tell(didntConnect(name))
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
   * sign-in, no consent, closed once the server lists a new account. Called
   * from the click itself, which opens its tab.
   */
  addAccount(toolkit: string, name: string): void {
    if (this.connecting !== undefined) return
    void this.holdingTab(async (held) => {
      if (held.refused) {
        this.tell(didntConnect(name))
        return
      }
      this.connecting = name
      this.changed()
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
      const { refused } = await this.run(
        url,
        name,
        async () => {
          await this.store.loadAppAccounts(toolkit)
          return this.store.appAccountIds(toolkit).some((id) => !before.has(id))
        },
        { tab: held },
      )
      if (refused) this.tell(didntConnect(name))
    })
  }

  /**
   * The app's sign-in page in a tab, closed once `done` says so
   * (`signIn(_:name:store:done:)`); how it ended (`SignInEnd`). `tab` is the
   * one its click opened (`holdingTab`), taken at once: give it whenever
   * there is one, and start the sign-in before that click's work ends;
   * `after` is a wait before the page shows (Connectors' spacing between
   * two pages). Without `tab`, a tab is opened now, which a browser allows
   * only on a click. A newer sign-in takes this one's place and closes its
   * tab.
   */
  async signIn(
    url: string,
    name: string,
    done: () => Promise<boolean>,
    options: { tab?: HeldTab; after?: Promise<unknown> } = {},
  ): Promise<SignInEnd> {
    return (await this.run(url, name, done, options)).end
  }

  /**
   * The server's last page of a sign-in sent the browser back to the app
   * (the Windows app's `simeon://connected`): as the Mac's sheet closing on
   * the app's own address, ten more looks, or two when the page said it
   * didn't work, then ended (`SignInSheetState.close`).
   */
  cameBack(failed: boolean): void {
    const open = this.open
    if (!open) return
    if (failed) open.watch.refused()
    else open.watch.cameBack()
  }

  /**
   * A maker's answer the server sent back to the app (the Windows app's
   * `simeon://mcp-oauth`): when it is the open sign-in's (its state), it is
   * finished on this account's computer (`finishReturnedSignIn`, the
   * catalogue's words for a refusal), and the sign-in then ends as the
   * Mac's sheet does on it; false when it isn't, or the store doesn't take
   * it (not named by this app, already finished): then nothing ends.
   */
  async answered(answer: SignInAnswer): Promise<boolean> {
    const open = this.open
    if (!open || open.state == null || open.state !== answer.state) return false
    if (!(await this.store.finishReturnedSignIn(answer))) return false
    if (answer.error == null) open.watch.cameBack()
    else open.watch.refused()
    return true
  }

  /**
   * The window went (signed out, the page going): the open sign-in ends
   * here, its loopback listener let go (the port freed), its wait stops at
   * its next look, and nothing it catches later goes anywhere. A newer
   * sign-in may start afterwards (React may draw the window again).
   */
  close(): void {
    this.current += 1
    this.stopLoopback?.()
    this.stopLoopback = undefined
    this.open = undefined
    this.tab = undefined
    this.asking = undefined
    this.connecting = undefined
    this.changed()
  }

  /** The window's alert, read: gone. */
  dismissTold(): void {
    if (this.told === undefined) return
    this.told = undefined
    this.changed()
  }

  private tell(words: string): void {
    this.told = words
    this.changed()
  }

  private async run(
    url: string,
    name: string,
    done: () => Promise<boolean>,
    options: { tab?: HeldTab; after?: Promise<unknown> },
  ): Promise<SignInRun> {
    const held = options.tab
    // The click's tab, taken at once: its work may end while this waits.
    const own = held && !held.taken && !held.released ? held : undefined
    if (own) own.taken = true
    this.tab?.close()
    this.tab = undefined
    // The replaced sign-in's listener lets go of the address now.
    this.stopLoopback?.()
    this.stopLoopback = undefined
    const token = ++this.current
    this.connecting = name
    this.changed()
    let stopHearing: (() => void) | undefined
    try {
      if (options.after) await options.after.catch(() => {})
      if (this.current !== token) {
        own?.tab?.close()
        return { end: 'replaced', refused: false }
      }
      // The sign-in's last page sends the browser back to the app (`returning`), when the app has an address of its own.
      const scheme = this.browser.scheme
      const page = scheme != null ? returning(url, scheme) : url
      const loopback = loopbackState(page)
      if (loopback != null) {
        // A maker that sends it back only to this computer's loopback: a browser can't listen there, so its page couldn't finish.
        if (!this.browser.catchLoopback) {
          own?.tab?.close()
          return { end: 'cancelled', refused: false }
        }
        // The Windows app listens there while the sign-in is open; its answer goes to this account's computer.
        const listening: { stop?: () => void } = {}
        const stop = await this.browser.catchLoopback(loopback, (answer) => {
          listening.stop?.()
          // Caught after this sign-in ended (replaced, the window gone): it goes nowhere.
          if (this.current !== token) return
          void this.store.finishLoopbackSignIn(answer, name)
        })
        // A newer sign-in took this one's place meanwhile: replaced, never "busy" (nothing it added is taken back).
        if (this.current !== token) {
          stop?.()
          own?.tab?.close()
          return { end: 'replaced', refused: false }
        }
        if (!stop) {
          this.store.keepProblem(loopbackBusy(name))
          own?.tab?.close()
          return { end: 'cancelled', refused: false }
        }
        listening.stop = stop
        this.stopLoopback = stop
      }
      // One that comes back through Simeon Labs' server comes back to the app, named to the server first, which finishes it on its own computer (`AppReturnSignIn`).
      const serverState = serverReturnState(page)
      if (serverState != null && scheme != null) {
        await this.store.sendSignInBack(serverState, scheme, name)
        if (this.current !== token) {
          own?.tab?.close()
          return { end: 'replaced', refused: false }
        }
      }
      // Its click's own tab; with none given, one opened now (a sign-in started on the click itself).
      const tab = held ? own?.tab : this.browser.openTab()
      // The browser refused it (or it was handed over late, already let go): a tab can't be opened later, off the click. It never opened.
      if (!tab) return { end: 'cancelled', refused: true }
      // The blank tab closed before its page came: the person changed their mind.
      if (tab.closed) return { end: 'cancelled', refused: false }
      this.tab = tab
      const watch = new TabWatch()
      this.open = { name, state: serverState, watch }
      // On the web, one that comes back through Simeon Labs' server goes on to the web app's own page (connected.html),
      // which finishes it on the computer, closes the tab and says here, by its state, whether the maker refused it.
      if (serverState != null)
        stopHearing = this.browser.hear?.(serverState, (refused) => {
          if (refused) watch.refused()
        })
      tab.go(page)
      for (let look = 0; look < askTimes; look += 1) {
        await this.browser.wait(askEvery)
        if (this.current !== token) return { end: 'replaced', refused: false }
        if (await answered(done)) {
          tab.close()
          return { end: 'connected', refused: false }
        }
        if (!watch.keepGoing(tab.closed))
          return { end: watch.ending, refused: false }
      }
      tab.close()
      return { end: 'unconfirmed', refused: false }
    } finally {
      stopHearing?.()
      if (this.current === token) {
        this.stopLoopback?.()
        this.stopLoopback = undefined
        this.open = undefined
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
