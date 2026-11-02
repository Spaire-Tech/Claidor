// Signing in and reaching the computer, the web's way (`MacSession` in
// mac/Simeon/MacSession.swift; the old web app's `desktop/web/bridge.ts`).
//
// - A pair kept in the tab is used as it is.
// - Else the website's sign-in cookie is traded for one (`/auth/web-session`).
// - Else the window goes to the website's own sign-in page, told to come back
//   here: on the web the sign-in page is the gate (the Mac's own sign-in
//   screen comes with Windows, docs/web-app/PROGRESS.md).
// - Signed in: "Setting up" until a list is on screen, the server's copy
//   when it comes first, else the computer's; then the window.
// - A sign-in the server ends (a spent pair) goes back to the website's page.
//
// - Then the start-up gate: an account never onboarded and with no agents
//   gets the first run (window/FirstRun.tsx); a computer that does not answer
//   yet is asked once more after 2.5 s. `?first-run` in the address forces
//   it, as the Mac's `--first-run` does.
// - Signing out drops this tab's pair, then the website's own sign-out ends
//   its cookie, so the next visit does not sign straight back in.
//
// In the Windows app (src/desktop/session.ts) the session is the Mac's own
// (`MacSession`): no website. Signed out, the window shows the sign-in
// screen (window/SignInScreen.tsx); Continue to sign in opens
// `/loginDeepControl` in the default browser and polls `/auth/poll` meanwhile
// (core/signIn.ts), "Reopen link" opens the same page again and Cancel
// stops; the pair is kept by the app. The agents and chats kept on the PC
// show at once (core/savedChats.ts). Signing out, or a sign-in the server
// ends, forgets all of it and shows the sign-in screen again, with the
// Mac's line under its buttons.

import {
  SimeonAPI,
  type TokenVault,
  resolveApiBase,
  sessionVault,
} from './core/api'
import { LiveBackend } from './core/backend'
import { Gateway } from './core/gateway'
import { FetchClient, type HTTPClient } from './core/http'
import type { SavedChats } from './core/savedChats'
import {
  type SavedGatewayStore,
  sessionSavedGateway,
} from './core/savedGateway'
import { freshMetadata, loginURL, poll, simeonConfig } from './core/signIn'
import { AppStore, accountFrom } from './core/store'
import { t } from './l10n'

export type Phase =
  | 'starting'
  | 'signedOut'
  /** "Continue in your browser" (the Windows app's sign-in, the Mac's `waitingForBrowser`). */
  | 'waitingForBrowser'
  | 'settingUp'
  | 'firstRun'
  | 'signedIn'

/** How the web app names itself to the server (`x-simeon-client-version`). */
export const clientVersion = 'web-next-0.1.0'

export interface SessionOptions {
  /** Where the API is; by default from where the page is. */
  base?: string
  /** Goes to the website's sign-in page (the tests listen instead). */
  goSignIn?: (returnTo: string) => void
  /** Makes the server's door (the tests give theirs). */
  makeAPI?: (base: string, ended: () => void) => SimeonAPI
  /** Makes the computer's door. */
  makeBackend?: (api: SimeonAPI) => LiveBackend
  /** Where the page is now, for the way back after signing in. */
  here?: () => string
  /** Where the computer's address is kept; by default the tab's storage. */
  saved?: SavedGatewayStore
  /** Goes to the website's sign-out, which ends its cookie (the tests listen instead). */
  goSignOut?: (base: string) => void
  /** How long the gate waits before asking a silent computer again (2.5 s). */
  gateRetryMs?: number
  /** The first run on any account (`?first-run`). */
  forcesFirstRun?: boolean
  /** Where the pair is kept; by default the tab's storage (the Windows app: its own, src/desktop/session.ts). */
  vault?: TokenVault
  /** How the app names itself to the server; by default the web's (`clientVersion`). */
  clientVersion?: string
  /** Trades the website's cookie for a pair when none is kept (the web's way in; the Windows app has no website cookie). */
  tradesCookie?: boolean
  /**
   * Opens a page in the default browser: the Mac's sign-in, through the
   * browser and `/auth/poll` (`signInWithBrowser`). The Windows app's; the
   * web signs in on the website instead.
   */
  openBrowser?: (url: string) => void
  /** The sign-in's poll's own HTTP and waits (the tests give theirs). */
  signInHTTP?: HTTPClient
  signInWait?: (seconds: number) => Promise<void>
  /** The agents and chats kept on this device (the Windows app's, the Mac's `SavedChats`); none on the web. */
  savedChats?: SavedChats
}

export function defaultGoSignOut(base: string): void {
  location.assign(`${base}/v1/auth/logout`)
}

/** `?first-run` in the address: the first run on any account, to compare it with the Mac's. */
function firstRunAsked(): boolean {
  if (typeof location === 'undefined') return false
  return new URLSearchParams(location.search).has('first-run')
}

export function defaultGoSignIn(returnTo: string): void {
  location.assign(`/login?return_to=${encodeURIComponent(returnTo)}`)
}

export class WebSession {
  phase: Phase = 'starting'
  /** The line under the sign-in screen's buttons when the last sign-in failed or ended (the Mac's `signedOut(message:)`). */
  signedOutMessage?: string
  readonly store = new AppStore()
  private api?: SimeonAPI
  private base = ''
  /** The browser's sign-in under way: its Cancel, and the page it opened (`signing`, `loginURL`). */
  private signing?: AbortController
  private loginPage?: string
  private readonly listeners = new Set<() => void>()
  private version = 0

  constructor(private readonly options: SessionOptions = {}) {
    this.store.readsServerCopy = true
    // The window says a list that can't be read in the sidebar, not as an alert.
    this.store.reportsRosterFailure = false
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getVersion = (): number => this.version

  private set(phase: Phase, message?: string): void {
    if (this.phase === phase && this.signedOutMessage === message) return
    this.phase = phase
    this.signedOutMessage = message
    this.version += 1
    for (const listener of [...this.listeners]) listener()
  }

  private saved(): SavedGatewayStore {
    return this.options.saved ?? sessionSavedGateway()
  }

  private here(): string {
    if (this.options.here) return this.options.here()
    return typeof location === 'undefined'
      ? ''
      : `${location.pathname}${location.search}`
  }

  private goSignIn(): void {
    this.set('signedOut')
    ;(this.options.goSignIn ?? defaultGoSignIn)(this.here())
  }

  /** How the app names itself to the server: the web's, or the Windows app's. */
  private get clientVersion(): string {
    return this.options.clientVersion ?? clientVersion
  }

  /** The server's door, with its pair; a sign-in the server ends comes back here. */
  private makeAPI(): SimeonAPI {
    const ended = () => this.ended(api)
    const api =
      this.options.makeAPI?.(this.base, ended) ??
      new SimeonAPI({
        base: this.base,
        clientVersion: this.clientVersion,
        vault: this.options.vault ?? sessionVault(),
      })
    api.onSessionEnded(ended)
    return api
  }

  async start(): Promise<void> {
    if (this.phase !== 'starting') return
    this.base = this.options.base ?? resolveApiBase(location)
    const api = this.makeAPI()
    this.api = api
    if (!api.isSignedIn && (this.options.tradesCookie ?? true)) {
      try {
        await api.signInFromCookie()
      } catch {
        // The website did not answer: its sign-in page says why.
      }
    }
    if (!api.isSignedIn) {
      this.goSignIn()
      return
    }
    await this.enter(api)
  }

  // MARK: The Windows app's sign-in (MacSession.swift's `signIn`)

  /**
   * Continue to sign in, or Sign up (the web app's sign-up page): the page
   * in the default browser, and the poll. Signed in, the window; else the
   * sign-in screen with the Mac's line for what went wrong.
   */
  signInWithBrowser(signUp = false): void {
    const open = this.options.openBrowser
    if (!open || this.signing) return
    const signing = new AbortController()
    this.signing = signing
    void (async () => {
      const metadata = await freshMetadata()
      if (this.signing !== signing) return
      const url = loginURL(this.base, metadata, {
        signUp,
        redirectTarget: simeonConfig.macURLScheme,
      })
      this.loginPage = url
      this.set('waitingForBrowser')
      open(url)
      const outcome = await poll(
        this.base,
        metadata,
        this.clientVersion,
        this.options.signInHTTP ?? new FetchClient(),
        { signal: signing.signal, wait: this.options.signInWait },
      )
      if (this.signing !== signing || signing.signal.aborted) return
      this.signing = undefined
      this.loginPage = undefined
      switch (outcome.kind) {
        case 'tokens': {
          const api = this.makeAPI()
          this.api = api
          api.signedIn(outcome.pair)
          await this.enter(api)
          return
        }
        case 'stopped':
          this.set('signedOut')
          return
        case 'refused':
          this.set(
            'signedOut',
            t(
              "Sign-in on this device is restricted by your organization's device policy. Sign in with an allowed account to continue.",
            ),
          )
          return
        case 'gaveUp':
          this.set('signedOut', t('Sign-in did not finish. Try again.'))
      }
    })()
  }

  /** "Reopen link": the same sign-in page again. */
  reopenLink(): void {
    if (this.loginPage) this.options.openBrowser?.(this.loginPage)
  }

  /** Cancel: the poll stops and the sign-in screen comes back. */
  cancelSignIn(): void {
    this.signing?.abort()
    this.signing = undefined
    this.loginPage = undefined
    this.set('signedOut')
  }

  // MARK: Signed in

  /** Reaches the person's computer: "Setting up" until the agents are on screen. */
  private async enter(api: SimeonAPI): Promise<void> {
    this.set('settingUp')
    // The agents and chats kept on this device (the Windows app's): with them, the window shows at once, while the computer is asked.
    const kept = this.options.savedChats
    if (kept) {
      this.store.saved = kept
      await kept.load()
      if (this.api !== api) return
    }
    void api
      .profile()
      .then((profile) => {
        const account = accountFrom(profile)
        if (account && this.api === api) {
          this.store.account = account
        }
      })
      .catch(() => {})
    const backend =
      this.options.makeBackend?.(api) ??
      new LiveBackend(new Gateway({ api, saved: this.saved() }), api)
    await this.store.attach(backend, () => {
      if (this.api === api && this.store.showingSaved) this.set('signedIn')
    })
    if (this.api !== api) return
    // The start-up gate (`hUn`): a new account gets the first run; a computer not answering yet is asked once more.
    let gate = await this.store.firstRun()
    if (gate === 'unknown') {
      await new Promise((done) =>
        setTimeout(done, this.options.gateRetryMs ?? 2_500),
      )
      if (this.api !== api) return
      gate =
        this.store.agents.length === 0 ? await this.store.firstRun() : 'seen'
    }
    if (this.api !== api) return
    const forced = this.options.forcesFirstRun ?? firstRunAsked()
    this.set(gate !== 'seen' || forced ? 'firstRun' : 'signedIn')
  }

  /** The first run's hand-off is done: the window. */
  finishFirstRun(): void {
    if (this.phase === 'firstRun') this.set('signedIn')
  }

  /** Sign Out (asked first by the screen): this tab's pair dropped on the server and here, then the website's own sign-out; in the Windows app, the sign-in screen, and what the PC kept forgotten. */
  async signOut(): Promise<void> {
    const api = this.api
    if (!api) return
    this.api = undefined
    this.store.detach()
    this.store.forgetSaved()
    this.saved().write(null)
    await api.signOut()
    this.set('signedOut')
    ;(this.options.goSignOut ?? defaultGoSignOut)(this.base)
  }

  /** The server ended the sign-in: back to the website's sign-in page; in the Windows app, the sign-in screen saying so (`SandAuthSignInExpiredError`). */
  private ended(api: SimeonAPI): void {
    // Already signed out: a late refusal of an earlier call does not replace what the sign-in screen says.
    if (this.api !== api) return
    this.api = undefined
    this.store.detach()
    this.store.forgetSaved()
    this.saved().write(null)
    this.set('signedOut', t('Your Simeon sign-in expired. Sign in again.'))
    ;(this.options.goSignIn ?? defaultGoSignIn)(this.here())
  }
}
