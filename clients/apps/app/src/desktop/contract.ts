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

  /** Settings › General's Relaunch (the Mac's `relaunch`): the app starts again, after the page's own work, as at any quit. */
  relaunch(): void
  /** A line for one of the app's logs in its data folder (the Mac's `voice-call.log`, `computer-stream.log`), stamped and appended there. */
  writeLog(name: 'voice-call.log' | 'computer-stream.log', line: string): void
  /** The logs' last 256 KB each, for a report's diagnostics (the Mac's `MacFeedback.logFiles`); an empty one is left out. */
  readLogs(): {
    name: 'computer-stream.log' | 'voice-call.log' | 'updates.log'
    text: string
  }[]
  /** This PC's maker and model as Windows names them, for a report (the Mac's `hw.model`); else the processor's kind ("x86_64"). */
  deviceModel(): string
  /** The agents, the sidebar's pins and sections and the connectors' catalogue kept on this PC (the Mac's `SavedChats`), each null when there is none. */
  readSaved(): { roster: unknown; layout: unknown; catalog: unknown }
  /** One chat's lines kept on this PC, or null. */
  readSavedChat(agentId: string): unknown
  /** Keeps one of the three files (a JSON object). */
  writeSaved(name: 'roster' | 'layout' | 'catalog', record: unknown): void
  /** Keeps one chat's lines (a JSON object), or forgets them (null). */
  writeSavedChat(agentId: string, record: unknown): void
  /** Every chat kept but these agents' goes. */
  keepSavedChats(agentIds: string[]): void
  /** Everything kept of the agents and chats goes (signed out). */
  forgetSaved(): void

  // MARK: 7c, notifications, the taskbar, the tray, the menu and the call's window

  /** A notification for an agent (MacServices.swift's `post`), in the page's words; Windows shows it, and a click brings the window forward and sends `openAgent`. */
  notify(note: AgentNote): void
  /** This run's notifications taken back: another account, or none (`removeDeliveredNotifications`). */
  clearNotifications(): void
  /** Whether the main window is the one in front now (`BrowserWindow.isFocused()`; the Mac's `isMainWindowFocused`). */
  isWindowFocused(): boolean
  /** The taskbar's number (the Mac's Dock badge): 0 for none. */
  setBadge(badge: TaskbarBadge): void
  /** The tray's menu (MenuBar.swift's `MenuBarMenu`, with the Mac's app menu's own items), in the page's words. */
  setTray(tray: TrayMenu): void
  /** Control-W (the Mac's File › Close Window): the window hides, as its ×. */
  closeWindow(): void
  /** F11 (the Mac's View › Enter Full Screen): the window full screen, or back. */
  toggleFullScreen(): void
  /** Control-Q (the Mac's Quit Simeon ⌘Q), from the main window or the call's. */
  quit(): void
  /** Control-= or Control-+ (0.1), Control-- (-0.1), Control-0 (0, back to 100 %): the main window's zoom, 50 % to 300 %, not kept (WindowChrome.swift's `WindowZoom`). */
  zoomWindow(step: number): void
  /** The call as the main window's page has it, or null once it is put away: the call's own window opens, follows it and closes (CallBannerWindow.swift). */
  showCall(call: ShownCall | null): void
  /** The call's waveform, as it changes (every 90 ms or so). */
  showCallLevels(levels: number[]): void
  /** The call's window brought forward, without the keys (the chat's phone or Call <name> while a call is up: `CallBannerWindow.focus`). */
  focusCall(): void
  /** The call's window's page is up: the call as it is now, or null. */
  callWindowReady(): ShownCall | null
  /** The call's window's page: its card's height (the window follows, its top where it is; 40 to 480). */
  callWindowHeight(height: number): void
  /** The call's window's page: the pointer on the card, or off it (the window takes clicks only over its card). */
  callWindowPointer(inside: boolean): void
  /** The call's window's page: a button pressed there, sent on to the main window's page (`callAction`). */
  callWindowAction(action: CallAction): void

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

  /** What the updater knows now (Settings › Updates as it opens, the dot beside Updates in Settings' list). */
  readUpdates(): DesktopEvents['updatesChanged']
  /** Looks for a release without installing it (the Mac's `lookQuietly`): Check Now, and the page as it opens. Nothing while a check or an install is under way, nor in a build that doesn't update itself. */
  lookForUpdates(): void
  /** Update Now: the release found, downloaded if it isn't yet, installed, and Simeon opened again (Sparkle's own check and install on the Mac). */
  installUpdate(): void
  /** Check for Updates Automatically and Download Updates Automatically, kept by the app; a switch left out stays as it is. */
  setUpdateSwitches(switches: {
    checksAutomatically?: boolean
    downloadsAutomatically?: boolean
  }): void

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

  /** The main window came in front (true) or went behind (MacServices.swift's `focusChanged`: the window's own focus, as Windows has it). */
  windowFocus: boolean
  /** A notification clicked, or an agent chosen in the tray: the window is forward; that agent's chat opens (MacServices.swift's `open(agent:)`). Held until the window listens. */
  openAgent: string
  /** The tray's New Agent (New chat while group chats are on): the window is forward. */
  newChat: null
  /** The tray's About Simeon: the window is forward. */
  openAbout: null
  /** The tray's Call <name> (the Mac's Agent › Call): the open agent is called, or the call's window comes forward. */
  callOpenAgent: null
  /**
   * The tray's Check for Updates… (the Mac's Simeon › Check for Updates…),
   * offered only in a packaged build: the window is forward and the page
   * opens Settings › Updates (7c); 7e's Updates page answers it with a
   * check, as its Check Now.
   */
  checkForUpdates: null
  /** A button pressed on the call's own window (or Control-W there), for the main window's page to do. */
  callAction: CallAction
  /** The call's window's page: the call changed; null once it is put away. */
  callShown: ShownCall | null
  /** The call's window's page: the waveform's bars. */
  callLevels: number[]
  /** The call's window's page: the main window's zoom, which Chromium gives every page of the app's origin; the page draws itself back at 100 %. */
  callZoom: number

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

  /** The updater's state (the Mac's `MacUpdates`), sent whenever it changes. */
  updatesChanged: {
    /** This build updates itself: a release (`windows/scripts/release.mjs`), installed. A developer's build never does. */
    available: boolean
    /** A check is under way. */
    checking: boolean
    /** The version of a release found that this PC doesn't have yet. */
    found: string | null
    /** The release found is downloaded: it installs as Simeon quits. */
    downloaded: boolean
    /** Update Now is under way: the release downloading, then installing. */
    installing: boolean
    /** The last check found nothing newer. */
    upToDate: boolean
    /** When a check last answered (ms since 1970), kept between launches. */
    lastChecked: number | null
    /** Check for Updates Automatically: once a day. */
    checksAutomatically: boolean
    /** Download Updates Automatically: a release found by the daily check is downloaded, and installed as Simeon quits. */
    downloadsAutomatically: boolean
  }
  // `checkForUpdates` (the tray's Check for Updates…) is declared in 7c's section above: 7e's Updates page answers it with a check.

  // MARK: 7f, the agent's hands on this PC
}

// MARK: 7c's shapes

/** A notification's words and sound (`AgentNotifications.content`): the Mac's sound for "needs you", none for "done". */
export interface AgentNote {
  agentId: string
  title: string
  body: string
  sound: boolean
}

/** The taskbar's number: the count, Windows' overlay drawn by the page (a square PNG data URL, 32 px for 16 on screen) and what it says to a screen reader. */
export interface TaskbarBadge {
  count: number
  image?: string
  description: string
}

/** The tray's menu as the page has it (MenuBar.swift): its words, and what the signed-in window adds. */
export interface TrayMenu {
  words: {
    openSimeon: string
    newChat: string
    aboutSimeon: string
    checkForUpdates: string
    quitSimeon: string
  }
  /** Signed in and past the first run: the window's own items show. */
  signedIn: boolean
  /** The agents most recently at work, hidden ones aside, at most 8 (`MenuBarMenu.listed`). */
  agents: { id: string; name: string; unread: boolean }[]
  /** Call <name> for the open agent, or a disabled Call Agent; absent while calls are off. */
  call?: { title: string; enabled: boolean }
}

/** The call as the call's window draws it: the core's `CallState` and its agent's row, as JSON. */
export interface ShownCall {
  call: Record<string, unknown>
  agent?: Record<string, unknown>
}

/** The call's window's buttons: Mute, Unmute, End, Close (a failed call), and Control-W (ends a call that is on, puts away one that is over). */
export type CallAction = 'mute' | 'unmute' | 'hangUp' | 'dismiss' | 'close'

/** The events the preload holds while nobody listens, and hands to the first listener (a link that started the app, a notification clicked before the window was drawn). Each part adds its own. */
export const heldEvents: readonly (keyof DesktopEvents)[] = ['openAgent']

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
