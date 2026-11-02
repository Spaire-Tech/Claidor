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

  // MARK: 7e, updates

  // MARK: 7f, the agent's hands on this PC

  /**
   * Reads the person's computer's requests to this PC (`GET
   * {gateway}/local-exec/requests`) and answers them, until the stream ends;
   * resolves saying how. The page's own loop waits while the computer rests
   * and dials again, as the Mac's `LocalHandsProvider.run` (store.ts, 7f).
   */
  handsStream(target: HandsTarget): HandsStreamEnd
  /** Ends the open stream now (the computer's address moved): its `handsStream` resolves `ended`. */
  handsEnd(): void
  /** Another account's computer, or none: the stream ends and the commands still running are stopped. */
  handsStop(): void
  /** Signed out: as `handsStop`, and the setting forgotten, so the next account starts from "Ask every time". */
  handsSignedOut(): void
  /** "Execution on Local Computer" as this PC keeps it, kept for this account once it is known (lower case e-mail). */
  handsPermission(account: string | null): HandsPermission
  /** The person's choice (Settings, the Allow card); what it is now, the team's ceiling applied, comes back. */
  handsChoose(choice: HandsPermissionValue): HandsPermission
  /** The team's ceiling, as Simeon Labs' server says it (null: none). */
  handsCeiling(ceiling: HandsPermissionValue | null): HandsPermission
  /** "Allow once" written down before the answer goes to the computer, or the hands would refuse what it then asks. */
  handsAllowOnce(approval: HandsApproval): void
  /** The commands allowed once forgotten: a message sent, or Settings' Forget. */
  handsForgetOnce(): void
}

// MARK: 7f's shapes, for its calls above

/** Where the hands reach the person's computer: the gateway's address and the headers that open it (never written down). */
export interface HandsTarget {
  baseURL: string
  headers: Record<string, string>
}

/** How a requests stream ended: the computer closed it, it could not be opened or broke, it went silent 35 s, the page ended it, or the hands stopped. */
export interface HandsStreamEnd {
  connected: boolean
  ended: 'closed' | 'failed' | 'stalled' | 'ended' | 'stopped'
}

export type HandsPermissionValue = 'always' | 'ask' | 'never'

/** The setting as this PC keeps it: the person's choice, the team's ceiling, and the two together, which the computer is told. */
export interface HandsPermission {
  choice: HandsPermissionValue
  ceiling: HandsPermissionValue | null
  effective: HandsPermissionValue
}

/** An "Allow once" answer: the ask's request, its action and its target, exactly. */
export interface HandsApproval {
  id: string
  action: string
  target: string
}

/** What the main process tells the page. */
export interface DesktopEvents {
  // MARK: 7a, the frame

  /** The app is about to quit: do what must be done (hang up, keep the chats), then `readyToQuit`. It waits a second at most. */
  quitting: null

  // MARK: 7b, signing in and the session

  // MARK: 7c, notifications, the taskbar, the tray, the menu and the call's window

  // MARK: 7d, links and pages outside

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
