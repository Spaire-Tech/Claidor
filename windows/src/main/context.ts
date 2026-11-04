// What every part of the main process is given (main.ts makes it): the app's
// facts, its data folder, the window, and the app's own moments (a link in,
// the quit). Each part registers its calls with `handle` (bridge.ts) and its
// own work here, in its own file under parts/.

import type { BrowserWindow } from 'electron'
import type { DesktopFacts } from '../../../clients/apps/app/src/desktop/contract'
import type { AppFacts } from './facts'

export interface AppContext {
  /** The main window's facts (the call's window has its own, 7c). */
  readonly facts: DesktopFacts
  readonly app: AppFacts
  /** The app's data folder (`app.getPath('userData')`: `%APPDATA%\Simeon`). */
  readonly dataFolder: string
  /** The preload every window of the app's page loads. */
  readonly preload: string
  /** The window, when it exists (it is hidden, not closed, by its ×). */
  mainWindow(): BrowserWindow | undefined
  /** The window brought forward: shown, restored from the taskbar, in front. */
  showMainWindow(): BrowserWindow
  /** Quits for real (the ×, Alt-F4 and Control-W only hide the window). */
  quit(): void
  /**
   * Quits, then Simeon opens again with no link (Relaunch after a new
   * language, Update Now): once, by the updater's installer when it runs as
   * Simeon quits (`relaunchTaken`), else by the app itself.
   */
  relaunch(): void
  /** Whether the quit under way opens Simeon again. */
  relaunchAsked(): boolean
  /** The updater's installer opens Simeon after it: the app doesn't too (two would race the install). */
  relaunchTaken(): void
  /** A `simeon://` link that reached the app (at launch, from a second launch); 7d reads them. */
  onLink(listener: (url: string) => void): void
  /** Something of the main process's own to do before quitting, after the page's (`quitting`). */
  beforeQuit(task: () => void | Promise<void>): void
  /** Which agents have tabs in the app's browser, told to the page as the app quits (parts/browser.ts). */
  browsing(provider: () => readonly string[]): void
}
