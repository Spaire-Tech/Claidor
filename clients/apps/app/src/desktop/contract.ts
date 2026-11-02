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
  readLogs(): { name: 'computer-stream.log' | 'voice-call.log'; text: string }[]
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

  // MARK: 7d, links and pages outside

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
