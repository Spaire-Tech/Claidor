// The call's own window in the Windows app (mac/Simeon/CallBannerWindow.swift):
// the Mac's banner is a panel of its own, floating over every window, so in
// the Windows app it is a window of its own too, made by the main process
// (windows/src/main/surfaces/callWindow.ts), drawing the banner from the
// main window's call. Here: the main window's side, which sends the call as
// it changes and does what the call's window's buttons ask
// (`followCallWindow`), and the call's window's side, a stand-in for the
// store that the banner reads (`CallMirror`).

import type { CallState } from '../core/call'
import type { Agent } from '../core/models'
import type { AppStore } from '../core/store'
import type { CallAction, ShownCall } from './contract'
import type { Desktop } from './desktop'

/** How often the waveform's bars go to the call's window: as often as they change (`callLevels`, every 90 ms). */
export const levelsEvery = 90

/**
 * The main window's side: the call and its agent to the call's window as
 * they change, its bars every 90 ms while it is up, and the window's
 * buttons done here (the in-window banner is not drawn in the Windows app).
 */
export function followCallWindow(
  host: Desktop,
  store: AppStore,
  every = levelsEvery,
): () => void {
  let sentCall: CallState | undefined
  let sentAgent: Agent | undefined
  let sentLevels = ''
  // The first is always sent: a call the app still shows from before this page is gone.
  let first = true
  const levels = () => {
    if (!store.call) return
    const now = JSON.stringify(store.callLevels)
    if (now === sentLevels) return
    sentLevels = now
    void host.call('showCallLevels', [...store.callLevels]).catch(() => {})
  }
  const push = () => {
    const call = store.call
    const agent = call ? store.agent(call.agentId) : undefined
    if (!first && call === sentCall && agent === sentAgent) return
    first = false
    sentCall = call
    sentAgent = agent
    const shown: ShownCall | null = call
      ? {
          call: { ...call },
          ...(agent ? { agent: { ...agent } } : {}),
        }
      : null
    if (!call) sentLevels = ''
    void host.call('showCall', shown).catch(() => {})
    levels()
  }
  const stopWatching = store.subscribe(push)
  const timer = setInterval(levels, every)
  const stopHearing = host.on('callAction', (action) => {
    doCallAction(store, action)
  })
  push()
  return () => {
    stopWatching()
    stopHearing()
    clearInterval(timer)
  }
}

/** A button of the call's window, done on the main window's store (CallBannerWindow.swift's buttons, and `closing` for Control-W). */
export function doCallAction(store: AppStore, action: CallAction): void {
  switch (action) {
    case 'mute':
      store.mute(true)
      return
    case 'unmute':
      store.mute(false)
      return
    case 'hangUp':
      store.hangUp()
      return
    case 'dismiss':
      store.dismissCall()
      return
    case 'close': {
      // File › Close Window on the banner: a call that is on ends (and is recorded), one that is over goes.
      const call = store.call
      if (!call) return
      if (call.phase === 'ended') store.dismissCall()
      else store.hangUp()
    }
  }
}

/**
 * The call's window's side: the call as the main window sent it, read by
 * the banner as it reads the store (`BannerSource` in window/Call.tsx); its
 * buttons go back to the main window.
 */
export class CallMirror {
  call?: CallState
  callLevels: number[] = []
  agents: Agent[] = []
  /** The main window's zoom, which Chromium gives this page too: the page draws itself back at 1 (`callZoom`). */
  zoom = 1
  private readonly listeners = new Set<() => void>()
  private version = 0

  constructor(private readonly host: Desktop) {}

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getVersion = (): number => this.version

  agent(id: string): Agent | undefined {
    return this.agents.find((agent) => agent.id === id)
  }

  /** The call as it is now, then each change. */
  start(): () => void {
    const stops = [
      this.host.on('callShown', (shown) => this.take(shown)),
      this.host.on('callLevels', (levels) => {
        // Only the waveform reads them, every frame: no redraw for them.
        if (Array.isArray(levels)) this.callLevels = levels
      }),
      this.host.on('callZoom', (zoom) => {
        if (typeof zoom !== 'number' || !(zoom > 0) || zoom === this.zoom)
          return
        this.zoom = zoom
        this.changed()
      }),
    ]
    void this.host
      .call('callWindowReady')
      .then((shown) => this.take(shown))
      .catch(() => {})
    return () => {
      for (const stop of stops) stop()
    }
  }

  /** A call shown (or none). */
  take(shown: ShownCall | null): void {
    const call = shown?.call as CallState | undefined
    this.call = call
    this.agents = shown?.agent ? [shown.agent as unknown as Agent] : []
    if (!call) this.callLevels = []
    this.changed()
  }

  private changed(): void {
    this.version += 1
    for (const listener of [...this.listeners]) listener()
  }

  mute(muted: boolean): void {
    this.send(muted ? 'mute' : 'unmute')
  }

  hangUp(): void {
    this.send('hangUp')
  }

  dismissCall(): void {
    this.send('dismiss')
  }

  /** Control-W on the call's window. */
  close(): void {
    this.send('close')
  }

  private send(action: CallAction): void {
    void this.host.call('callWindowAction', action).catch(() => {})
  }
}
