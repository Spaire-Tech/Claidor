// The Windows app's bridge (windows/src/preload/preload.ts and
// windows/src/main/bridge.ts): what the page asks of the app around it, and
// what the app tells the page. One file both sides read, so a call's name and
// shape can't differ between them. It imports nothing, so the Windows app
// reads it without the rest of the web app.
//
// - A call is `desktop()?.call(name, …args)` in the page; the main process
//   answers it (`handle(name, …)`), always as a promise. A call no part has
//   answered yet rejects.
// - An event is `desktop()?.on(name, listener)` in the page; the main process
//   sends it (`emit(name, payload)`).
// - What must be read before anything else (the app's facts, the pair and the
//   computer's address) is handed to the page as it loads, not asked.
//
// Each part of step 7 writes only in its own section (docs/web-app/PROGRESS.md).

/** What the app says about itself as the page loads. */
export interface DesktopFacts {
  /** `process.platform`: "win32" on Windows ("linux" in the checks run on Linux). */
  platform: string
  /** The app's version (`app.getVersion()`), e.g. "0.1.0". */
  version: string
  /** The build number: the commit count at release, "0" in a developer's build. */
  build: string
  /** The release track, "stable" (the Mac's `AboutSimeon` track). */
  track: string
  /** Windows' own version (`os.release()`, e.g. "10.0.26100"). */
  osVersion: string
  /** The server: `https://api.simeonlabs.com`, or `--api=` for checks against stand-ins. */
  apiBase: string
  /** Windows' languages, most wanted first (`app.getPreferredSystemLanguages()`). */
  systemLanguages: string[]
  /** The settings the page reads from the environment (`SIMEON_VOICE_CALLS`). */
  env: Record<string, string>
  /** Which window this page is: the app's own, or the call's banner (7c). */
  window: 'main' | 'call'
}

/** The window's look, for Windows' own parts (the caption buttons, the menus' theme). */
export interface WindowLook {
  theme: 'system' | 'light' | 'dark'
  /** The colour under the caption buttons (`titleBarOverlay.color`), e.g. "#ffffff". */
  background: string
  /** The caption buttons' symbols (`titleBarOverlay.symbolColor`). */
  symbols: string
}

/** The calls the page makes; each answered by the main process. */
export interface DesktopCalls {
  // MARK: 7a, the frame

  /** Opens a page in the default browser: http, https, mailto, tel and obsidian only. */
  openExternal(url: string): void
  /** The window's look changed (the theme, the colour behind the caption buttons). */
  setWindowLook(look: WindowLook): void
  /** The page has done what it does before the app quits (after `quitting`). */
  readyToQuit(): void

  // MARK: 7b, signing in and the session

  // MARK: 7c, notifications, the taskbar, the tray, the menu and the call's window

  // MARK: 7d, links and pages outside

  /** The `simeon://` links the app holds for the main window's page (at launch, from a second launch, while the page loaded), each handed over once; later ones come as `link`. */
  takeLinks(): string[]
  /** Listens on this PC's loopback (port 8787) for one connector's sign-in, whose state is `state` (the core's `LoopbackCatcher`): its answer comes as `loopbackAnswer`. False when another app holds the address. A newer one takes its place. */
  catchLoopback(state: string): boolean
  /** Stops listening for that sign-in (it ended, or another took its place). */
  stopLoopback(state: string): void
  /** Stripe's page (https) in a window of the app's own over this one, as the Mac's sheet (`MacBillingPage`): `back` when it came back on the app's own link, `closed` when the person closed it, `browser` when it opened in the default browser instead, `busy` when one is open already. */
  openBilling(url: string): 'back' | 'closed' | 'browser' | 'busy'
  /** Windows Hello for one guarded act, with its reason (`PurchaseApproval.confirm`): `unavailable` when Hello can't ask (not set up, another system). */
  confirmPresence(reason: string): 'confirmed' | 'cancelled' | 'unavailable'
  /** This PC's clipboard's text (the main window's page only). */
  readClipboard(): string
  /** Text onto this PC's clipboard, whether or not the window is in front. */
  writeClipboard(text: string): void
  /** The person's 1Password accounts, from 1Password's command-line tool (`MacOnePassword.accounts`): a failure is a code, or 1Password's own sentence (`refused`). */
  onePasswordAccounts():
    | { accounts: { id: string; email: string; url: string }[] }
    | { failure: 'noTool' | 'noAccounts' | 'noAnswer' }
    | { refused: string }
  /** The vault "Shared with Simeon" in one of the accounts just listed (made when missing) and a key that can only read it (`MacOnePassword.connect`); an account not just listed is `noAccounts`. */
  onePasswordConnect(accountId: string):
    | {
        token: string
        vaultId: string
        vaultName: string
        accountEmail: string
      }
    | { failure: 'noTool' | 'noAccounts' | 'noVault' | 'noKey' | 'noAnswer' }
    | { refused: string }

  // MARK: 7e, updates

  // MARK: 7f, the agent's hands on this PC
}

/** What the main process tells the page. */
export interface DesktopEvents {
  // MARK: 7a, the frame

  /** The app is about to quit: do what must be done (hang up, keep the chats), then `readyToQuit`. It waits a second at most. */
  quitting: null

  // MARK: 7b, signing in and the session

  // MARK: 7c, notifications, the taskbar, the tray, the menu and the call's window

  // MARK: 7d, links and pages outside

  /** A `simeon://` link that reached the app after `takeLinks` (a second launch's command line). */
  link: string
  /** A loopback sign-in's answer, caught once (`LoopbackSignIn.Answer`): the code, or the maker's refusal, with its state. */
  loopbackAnswer: {
    state: string
    code?: string
    error?: string
    errorDescription?: string
  }

  // MARK: 7e, updates

  // MARK: 7f, the agent's hands on this PC
}

/** The events the preload holds while nobody listens, and hands to the first listener (a link that started the app, a notification clicked before the window was drawn). Each part adds its own. */
export const heldEvents: readonly (keyof DesktopEvents)[] = []

/** What the page keeps on the device, sealed with Windows' own protection (`safeStorage`): the web's two session keys. */
export const keptKeys = ['simeon.web.tokens', 'simeon.web.gateway'] as const
export type KeptKey = (typeof keptKeys)[number]

/** The preload's own object on `window.simeonDesktop`: the transport the page's `desktop()` wraps. */
export interface DesktopTransport {
  readonly facts: DesktopFacts
  /** The kept values as the page loaded, read at once. */
  readonly kept: Partial<Record<KeptKey, string>>
  keep(key: KeptKey, value: string | null): void
  call(name: string, args: unknown[]): Promise<unknown>
  on(name: string, listener: (payload: unknown) => void): () => void
}
