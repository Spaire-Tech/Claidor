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

import { SimeonAPI, resolveApiBase, sessionVault } from './core/api'
import { LiveBackend } from './core/backend'
import { Gateway } from './core/gateway'
import {
  type SavedGatewayStore,
  sessionSavedGateway,
} from './core/savedGateway'
import { AppStore, accountFrom } from './core/store'

export type Phase =
  | 'starting'
  | 'signedOut'
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
  readonly store = new AppStore()
  private api?: SimeonAPI
  private base = ''
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

  private set(phase: Phase): void {
    if (this.phase === phase) return
    this.phase = phase
    this.version += 1
    for (const listener of [...this.listeners]) listener()
  }

  private saved(): SavedGatewayStore {
    return this.options.saved ?? sessionSavedGateway()
  }

  private here(): string {
    return this.options.here?.() ?? `${location.pathname}${location.search}`
  }

  private goSignIn(): void {
    this.set('signedOut')
    ;(this.options.goSignIn ?? defaultGoSignIn)(this.here())
  }

  async start(): Promise<void> {
    if (this.phase !== 'starting') return
    const base = this.options.base ?? resolveApiBase(location)
    this.base = base
    const ended = () => this.ended(api)
    const api =
      this.options.makeAPI?.(base, ended) ??
      new SimeonAPI({ base, clientVersion, vault: sessionVault() })
    api.onSessionEnded(ended)
    this.api = api
    if (!api.isSignedIn) {
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

  /** Reaches the person's computer: "Setting up" until the agents are on screen. */
  private async enter(api: SimeonAPI): Promise<void> {
    this.set('settingUp')
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

  /** Sign Out (asked first by the screen): this tab's pair dropped on the server and here, then the website's own sign-out. */
  async signOut(): Promise<void> {
    const api = this.api
    if (!api) return
    this.api = undefined
    this.store.detach()
    this.saved().write(null)
    await api.signOut()
    this.set('signedOut')
    ;(this.options.goSignOut ?? defaultGoSignOut)(this.base)
  }

  /** The server ended the sign-in: back to the website's sign-in page. */
  private ended(api: SimeonAPI): void {
    if (this.api !== api) return
    this.api = undefined
    this.store.detach()
    this.saved().write(null)
    this.goSignIn()
  }
}
