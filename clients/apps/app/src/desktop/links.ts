// `simeon://` links in the Windows app (mac/Simeon/MacServices.swift's
// `handle`, `pendingPlugin`, `pendingPack`, `lastLink`, `deepLinkInfo`):
// the app holds what reached it (at launch, from a second launch) until the
// page takes it (`takeLinks`), then sends each new one (`link`).
//
// - A connector's sign-in answer the server sent back
//   (`simeon://mcp-oauth?…`) is read first, before any other rule, and is
//   finished on this account's computer only when this app named that
//   sign-in to the server, signed in, in its lifetime
//   (`finishReturnedSignIn`); any other is dropped without a word, its
//   words never shown (the Mac finishes any: review of 2 November 2026).
//   Never held, never dropped as a repeat.
// - The server's last page back on the app's address (`simeon://connected`)
//   is the open sign-in's sheet closing there; outside a sign-in nothing.
// - Every other link is read by the Mac's rules (`parseDeepLink`); the same
//   link again within 2 s is dropped. `open` does nothing more (the app
//   brought the window forward), `info` shows the Deep Links dialog (signed
//   out too), a plugin's link opens Connectors on its page and a starter
//   pack's shows its sheet, each held until the window is signed in and
//   past the first run (MainWindow attaches itself).

import { useEffect } from 'react'
import {
  type DeepLinkSource,
  appReturnAnswer,
  appScheme,
  canonicalDeepLink,
  connectedReturn,
  parseDeepLink,
} from '../core/deepLink'
import type { AppStore } from '../core/store'
import type { Connector } from '../window/connector'
import type { Desktop } from './desktop'

/** The same link again within this is dropped (`lastLink`). */
export const repeatWindowMs = 2_000

/** What a link asks of the signed-in window, once it is there. */
export interface LinkWindow {
  /** Connectors on a plugin's page (`plugins.open(.plugin(id))`). */
  openPlugin(id: string): void
  /** The starter pack's sheet (`askPack`). */
  askPack(id: string): void
  /** The window's connector, whose open sign-in a return finishes. */
  readonly connector?: Pick<Connector, 'answered' | 'cameBack'>
}

export class DesktopLinks {
  /** The Deep Links dialog, while it shows: where its link came from (`deepLinkInfo`). */
  info?: DeepLinkSource
  private window?: LinkWindow
  private pendingPlugin?: string
  private pendingPack?: string
  private last?: { link: string; at: number }
  private listeners = new Set<() => void>()
  private version = 0

  constructor(
    /** The signed-in account's store, when there is one (the session's). */
    private readonly store: () => AppStore | undefined,
    private readonly now: () => number = () => Date.now(),
  ) {}

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getVersion = (): number => this.version

  private changed(): void {
    this.version += 1
    for (const listener of [...this.listeners]) listener()
  }

  /** Hears the app: each new link, then the ones it held for the page. */
  listen(host: Desktop): () => void {
    const stop = host.on('link', (url) => void this.take(url))
    void host
      .call('takeLinks')
      .then((held) => {
        for (const url of held) void this.take(url)
      })
      .catch(() => {})
    return stop
  }

  /** One link to the app (`handle`). */
  async take(raw: string): Promise<void> {
    if (typeof raw !== 'string') return
    // A connected app's sign-in the browser finished: the app hands it to its computer (`AppReturnSignIn`).
    // Only a sign-in this app named to the server, signed in, in its lifetime (`finishReturnedSignIn`); any other is dropped without a word.
    const answer = appReturnAnswer(raw)
    if (answer) {
      if (await this.window?.connector?.answered(answer)) return
      await this.store()?.finishReturnedSignIn(answer)
      return
    }
    // The server's last page back on the app's own address: the open sign-in's sheet closing there.
    const back = connectedReturn(raw)
    if (back) {
      this.window?.connector?.cameBack(back.failed)
      return
    }
    const link = parseDeepLink(raw, [appScheme])
    if (!link) return
    const canonical = canonicalDeepLink(link, appScheme)
    const now = this.now()
    if (
      this.last &&
      this.last.link === canonical &&
      now - this.last.at < repeatWindowMs
    )
      return
    this.last = { link: canonical, at: now }
    const route = link.route
    switch (route.kind) {
      case 'open':
        break
      case 'info':
        this.info = link.source
        this.changed()
        break
      case 'pluginAdd':
        if (this.window) this.window.openPlugin(route.id)
        else this.pendingPlugin = route.id
        break
      case 'packAdd':
        if (this.window) this.window.askPack(route.id)
        else this.pendingPack = route.id
        break
    }
  }

  /** The window signed in and past the first run: what came before it is opened now. The returned function lets it go. */
  attach(window: LinkWindow): () => void {
    this.window = window
    const plugin = this.pendingPlugin
    this.pendingPlugin = undefined
    if (plugin !== undefined) window.openPlugin(plugin)
    const pack = this.pendingPack
    this.pendingPack = undefined
    if (pack !== undefined) window.askPack(pack)
    return () => {
      if (this.window === window) this.window = undefined
    }
  }

  /** Done, ×, Escape or a click outside the dialog. */
  closeInfo(): void {
    if (this.info === undefined) return
    this.info = undefined
    this.changed()
  }
}

let running: DesktopLinks | undefined

/** The Windows app's links, heard from the start (main.tsx): the dialog may show signed out. */
export function startDesktopLinks(
  host: Desktop,
  store: () => AppStore | undefined,
): DesktopLinks {
  running = new DesktopLinks(store)
  running.listen(host)
  return running
}

/** The signed-in window takes the links meant for it while it is drawn (MainWindow); nothing on the web. */
export function useDesktopLinks(window: LinkWindow): void {
  useEffect(() => running?.attach(window), [window])
}

/** Forgets the running links (the tests). */
export function resetDesktopLinksForTests(): void {
  running = undefined
}
