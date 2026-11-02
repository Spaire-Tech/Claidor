// What the Windows app does around the window for the app's whole life, as
// the Mac's MacServices.swift does (the window may be hidden): Windows'
// notifications and the taskbar's number from the computer's word on the
// agents (`rosterNews`, AgentNotifications, DockBadge), telling the
// computer whether the window is in front (`setWindowFocused`, which decides
// what counts as read), what connecting sets on the computer, the tray's
// menu (MenuBar.swift) in the page's words, and the Mac's menu keys that
// Windows has no menu bar for (SimeonMacApp.swift's `SimeonCommands`). The
// window's own part (the open agent, New Agent, About) is
// useDesktopWindow.ts; the main process's is windows/src/main/parts/surfaces.ts.

import {
  NotificationFeed,
  type NotificationTransition,
  type RosterNews,
  notificationContent,
} from '../core/agentNotifications'
import { DockBadge } from '../core/dockBadge'
import type { AppStore } from '../core/store'
import { t } from '../l10n'
import { badgePicture } from './badge'
import type { TrayMenu } from './contract'
import type { Desktop } from './desktop'
import { beforeQuit } from './quitting'

/** What the signed-in window adds to the tray's menu (useDesktopWindow.ts). */
export type WindowTray = Pick<TrayMenu, 'agents' | 'call'>

/** The session as the surfaces read it (`WebSession`): its phase and its store. */
export interface FollowedSession {
  readonly phase: string
  readonly store: AppStore
  subscribe(listener: () => void): () => void
}

export interface SurfacesOptions {
  /** Whether the window is in front until the app says (`isWindowFocused`). */
  focused?: boolean
  /** Where the window's keys are heard. */
  target?: EventTarget
  now?: () => number
  /** The taskbar's picture for a number (badge.ts). */
  picture?: (count: number) => string | undefined
}

/** The tray's words, in the page's language (the Mac's catalogue). */
export function trayWords(): TrayMenu['words'] {
  return {
    openSimeon: t('Open Simeon'),
    // New chat while group chats are on (`Features.groupChats`, off): New Agent, as the sidebar's compose button.
    newChat: t('New Agent'),
    aboutSimeon: t('About Simeon'),
    checkForUpdates: t('Check for Updates…'),
    quitSimeon: t('Quit Simeon'),
  }
}

/** The surfaces the app follows, once started (main.tsx). */
export function desktopSurfaces(): DesktopSurfaces | undefined {
  return DesktopSurfaces.current
}

export class DesktopSurfaces {
  /** The one started (main.tsx), for the window's part (useDesktopWindow.ts). */
  static current?: DesktopSurfaces
  private readonly feed = new NotificationFeed()
  private readonly badge = new DockBadge()
  /**
   * The main window is the one in front (MacServices.swift's
   * `isMainWindowFocused`): the window's own focus as Windows has it
   * (`BrowserWindow`'s focus and blur, told by the app), not the page's,
   * which a page in front of nothing may still claim.
   */
  private inFront: boolean
  private readonly focused = () => this.inFront
  private readonly target?: EventTarget
  private readonly now: () => number
  private readonly picture: (count: number) => string | undefined
  /** The account the notifications are for (MacServices.swift's `account`). */
  private account?: string
  private wasLive = false
  private windowTray?: WindowTray
  private sentTray = ''
  private readonly stops: (() => void)[] = []

  constructor(
    private readonly host: Desktop,
    private readonly session: FollowedSession,
    options: SurfacesOptions = {},
  ) {
    this.inFront =
      options.focused ??
      (typeof document !== 'undefined' && document.hasFocus())
    this.target =
      options.target ?? (typeof window !== 'undefined' ? window : undefined)
    this.now = options.now ?? Date.now
    this.picture = options.picture ?? ((count) => badgePicture(count))
  }

  private get store(): AppStore {
    return this.session.store
  }

  /** Follows the session for the app's life (MacServices.swift's `follow`). */
  start(): () => void {
    DesktopSurfaces.current = this
    const store = this.store
    store.rosterNews = (news) => this.take(news)
    this.stops.push(() => {
      if (store.rosterNews) store.rosterNews = undefined
    })
    this.stops.push(store.subscribe(() => this.track()))
    this.stops.push(this.session.subscribe(() => this.track()))
    // The window came in front or went behind (`focusChanged`), and how it is now.
    this.stops.push(
      this.host.on('windowFocus', (focused) => {
        if (typeof focused === 'boolean') this.focusChanged(focused)
      }),
    )
    void this.host
      .call('isWindowFocused')
      .then((focused) => {
        if (typeof focused === 'boolean' && focused !== this.inFront)
          this.focusChanged(focused)
      })
      .catch(() => {})
    const target = this.target
    if (target) {
      const keys = (event: Event) => this.key(event as KeyboardEvent)
      target.addEventListener('keydown', keys)
      this.stops.push(() => target.removeEventListener('keydown', keys))
    }
    // Quitting with a call on ends it, rather than leaving its line "now" (CallBannerWindow.swift's `follow`).
    this.stops.push(
      beforeQuit(() => {
        const call = this.store.call
        if (call && call.phase !== 'ended') this.store.hangUp()
      }),
    )
    this.track()
    this.pushTray()
    return () => this.stop()
  }

  stop(): void {
    for (const stop of this.stops.splice(0)) stop()
    if (DesktopSurfaces.current === this) DesktopSurfaces.current = undefined
  }

  private focusChanged(focused: boolean): void {
    this.inFront = focused
    this.store.windowFocusChanged(this.focused)
  }

  /** The signed-in window's part of the tray's menu, or undefined once it is gone (signed out, the first run). */
  setWindowTray(tray: WindowTray | undefined): void {
    this.windowTray = tray
    this.pushTray()
  }

  private pushTray(): void {
    const tray: TrayMenu = {
      words: trayWords(),
      signedIn: this.windowTray != null,
      agents: this.windowTray?.agents ?? [],
      ...(this.windowTray?.call ? { call: this.windowTray.call } : {}),
    }
    const json = JSON.stringify(tray)
    if (json === this.sentTray) return
    this.sentTray = json
    void this.host.call('setTray', tray).catch(() => {})
  }

  /**
   * The account and the computer (MacServices.swift's `track`): another
   * account, or none, forgets what was told and takes this run's
   * notifications back, the taskbar shows nothing; the computer reached
   * (again) is told what the Mac tells it.
   */
  private track(): void {
    const store = this.store
    const signedOut = this.session.phase === 'signedOut'
    // The account is known after its computer (the profile answers later), and Reload keeps it: only signing out is none.
    const next =
      store.account?.email.toLowerCase() ??
      (signedOut ? undefined : this.account)
    if (next !== this.account) {
      const previous = this.account
      this.account = next
      if (previous != null) {
        this.feed.reset()
        this.setBadge(this.badge.reset())
        void this.host.call('clearNotifications').catch(() => {})
      }
    }
    const live = store.isLive
    if (live && !this.wasLive) void store.desktopConnected(this.focused)
    this.wasLive = live
  }

  /** The computer's word on the agents: notifications and the taskbar (MacServices.swift's `take`). */
  private take(news: RosterNews): void {
    const focused = this.focused()
    const now = this.now()
    switch (news.kind) {
      case 'seed':
        this.post(this.feed.seed(news.agents, focused, now))
        this.setBadge(this.badge.roster(news.agents))
        return
      case 'roster':
        this.post(this.feed.roster(news.agents, focused, now))
        this.setBadge(this.badge.roster(news.agents))
        return
      case 'update':
        this.post(this.feed.update(news.agent, focused, now))
        this.setBadge(this.badge.update(news.agent))
        return
    }
  }

  /** "Iris needs you" with Windows' sound; a finished turn without one (`post`). */
  private post(transitions: readonly NotificationTransition[]): void {
    for (const transition of transitions) {
      const words = notificationContent(transition)
      void this.host
        .call('notify', {
          agentId: transition.agentId,
          title: words.title,
          body: words.body,
          sound: transition.kind === 'agent-needs-input',
        })
        .catch(() => {})
    }
  }

  /** The number of unread messages, hidden agents aside; none at 0 (`setBadge`). */
  private setBadge(total: number | undefined): void {
    if (total == null) return
    const image = this.picture(total)
    void this.host
      .call('setBadge', {
        count: total,
        ...(image ? { image } : {}),
        description: DockBadge.label(total) ?? '',
      })
      .catch(() => {})
  }

  /**
   * The Mac's menu keys (`SimeonCommands`), which Windows has no menu bar
   * for, with Control: Control-W hides the window (File › Close Window),
   * Control-R reads everything again from the computer (View › Reload),
   * Control-Q quits; and F11, Windows' own key for full screen (View ›
   * Enter Full Screen). The computer's screen, holding the keys, takes them
   * all, as the Mac's does (its keys never reach the window).
   */
  private key(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.isComposing || event.repeat) return
    const plain = !event.ctrlKey && !event.metaKey && !event.altKey
    if (plain && !event.shiftKey && event.key === 'F11') {
      event.preventDefault()
      void this.host.call('toggleFullScreen').catch(() => {})
      return
    }
    if (!event.ctrlKey || event.metaKey || event.altKey || event.shiftKey)
      return
    switch (event.key.toLowerCase()) {
      case 'w':
        event.preventDefault()
        void this.host.call('closeWindow').catch(() => {})
        return
      case 'q':
        event.preventDefault()
        void this.host.call('quit').catch(() => {})
        return
      case 'r':
        event.preventDefault()
        // Signed in only, as the Mac's (`reload`'s guard).
        if (this.session.phase === 'signedIn')
          void this.store.reloadFromComputer()
        return
    }
  }
}
