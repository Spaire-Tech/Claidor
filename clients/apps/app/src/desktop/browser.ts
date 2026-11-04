// The browser in the app, in the page (docs/app-browser/README.md, step 2b):
// an agent's tabs in the Windows app's own browser (windows/src/main/browser),
// as the Computer tab and its full view draw them. The app is told which
// agent the page shows (`browserWatch`), then tells its state as it changes
// (`browserShown`) and sends its tab as pictures (`browserFrame`).
//
// The page shows one agent's browser at a time. Each view that draws one
// asks for it (`want`): the latest view still drawn is the one watched (the
// full view over the pane's preview), and the one under it is watched again
// when it goes. On the web there is no app around the page: nothing here.

import type {
  BrowserBarAct,
  BrowserFrame,
  BrowserInput,
  BrowserShown,
} from './contract'
import type { Desktop } from './desktop'
import { desktop } from './desktop'

export type { BrowserFrame, BrowserInput, BrowserShown } from './contract'

export class PCBrowser {
  /** The watched agent's browser, once the app has said. */
  private state: BrowserShown | undefined
  private watching: string | null = null
  private readonly wanted: { agentId: string }[] = []
  private readonly listeners = new Set<() => void>()
  private readonly frameListeners = new Set<(frame: BrowserFrame) => void>()
  /** The last picture, for a view drawn after it came. */
  private lastFrame: BrowserFrame | undefined
  private version = 0

  constructor(private readonly host: Desktop) {
    host.on('browserShown', (shown) => {
      if (shown.agentId === this.watching) this.take(shown)
    })
    host.on('browserFrame', (frame) => {
      if (frame.agentId !== this.watching) return
      this.lastFrame = frame
      for (const listener of [...this.frameListeners]) listener(frame)
    })
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getVersion = (): number => this.version

  /** A view draws this agent's browser; the function it gets back lets go. */
  want(agentId: string): () => void {
    const entry = { agentId }
    this.wanted.push(entry)
    this.rewatch()
    return () => {
      const at = this.wanted.indexOf(entry)
      if (at >= 0) this.wanted.splice(at, 1)
      this.rewatch()
    }
  }

  /** The agent's browser, while it is the one watched and the app has said. */
  shown(agentId: string): BrowserShown | undefined {
    return this.state?.agentId === agentId ? this.state : undefined
  }

  /** The pictures of the watched agent's tab, the last one at once. */
  onFrame(
    agentId: string,
    listener: (frame: BrowserFrame) => void,
  ): () => void {
    const wrapped = (frame: BrowserFrame) => {
      if (frame.agentId === agentId) listener(frame)
    }
    this.frameListeners.add(wrapped)
    if (this.lastFrame?.agentId === agentId) wrapped(this.lastFrame)
    return () => this.frameListeners.delete(wrapped)
  }

  /** Take control (true) or give it back (false). */
  control(agentId: string, person: boolean): void {
    this.host
      .call('browserControl', agentId, person)
      .then((shown) => {
        if (shown && shown.agentId === this.watching) this.take(shown)
      })
      .catch(() => {})
  }

  bar(agentId: string, act: BrowserBarAct): void {
    void this.host.call('browserBar', agentId, act).catch(() => {})
  }

  input(agentId: string, input: BrowserInput): void {
    void this.host.call('browserInput', agentId, input).catch(() => {})
  }

  private rewatch(): void {
    const top = this.wanted.at(-1)?.agentId ?? null
    if (top === this.watching) return
    this.watching = top
    if (this.state?.agentId !== top) {
      this.state = undefined
      this.lastFrame = undefined
      this.bump()
    }
    this.host
      .call('browserWatch', top)
      .then((shown) => {
        if (shown && shown.agentId === this.watching) this.take(shown)
      })
      .catch(() => {})
  }

  private take(shown: BrowserShown): void {
    this.state = shown
    this.bump()
  }

  private bump(): void {
    this.version += 1
    for (const listener of [...this.listeners]) listener()
  }
}

let made: { host: Desktop; browser: PCBrowser } | undefined

/** The page's one view of this PC's browser, in the Windows app's own window; undefined on the web and in the call's window. */
export function pcBrowser(): PCBrowser | undefined {
  const host = desktop()
  if (!host || host.facts.window !== 'main') return undefined
  if (made?.host !== host) made = { host, browser: new PCBrowser(host) }
  return made.browser
}

/** Forgets it (the tests give a new app each time). */
export function resetPCBrowserForTests(): void {
  made = undefined
}

/** The site of an address as the bar shows it: its host without "www.", or nothing for a page that has none. */
export function siteOf(url: string): string {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return ''
    return parsed.hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

/** Whether the page came over https (the lock). */
export function isSecure(url: string): boolean {
  return url.startsWith('https://')
}

/** Whether the Computer tab shows this PC's browser: the agent has tabs here, and no helper of its is at work on Simeon's computer's screen. */
export function showsPCBrowser(
  shown: BrowserShown | undefined,
  computerHelpers: number,
): boolean {
  return shown !== undefined && shown.tabs.length > 0 && computerHelpers === 0
}

/** The DevTools modifiers of a key or pointer event (Alt 1, Ctrl 2, Meta 4, Shift 8). */
export function modifiersOf(event: {
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
}): number {
  return (
    (event.altKey ? 1 : 0) |
    (event.ctrlKey ? 2 : 0) |
    (event.metaKey ? 4 : 0) |
    (event.shiftKey ? 8 : 0)
  )
}

const editKeys: Record<
  string,
  Extract<BrowserInput, { kind: 'edit' }>['command']
> = {
  c: 'copy',
  x: 'cut',
  v: 'paste',
  a: 'selectAll',
  z: 'undo',
  y: 'redo',
}

/**
 * A key pressed on the page shown, as the tab is sent it: Ctrl+C, X, V, A,
 * Z and Y as the tab's own editing (with this PC's clipboard), Ctrl+Shift+Z
 * as redo; a key that types a character with its text (AltGr's too); any
 * other key as it is. Nothing for a key held by the keyboard's composition.
 */
export function keyInput(event: {
  type: string
  key: string
  code: string
  keyCode: number
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  isComposing?: boolean
  getModifierState?(key: string): boolean
}): BrowserInput | undefined {
  if (event.isComposing || event.key === 'Process' || event.key === 'Dead')
    return undefined
  const down = event.type === 'keydown'
  const altGraph = event.getModifierState?.('AltGraph') === true
  const command = (event.ctrlKey || event.metaKey) && !event.altKey && !altGraph
  if (command && down) {
    const key = event.key.toLowerCase()
    if (key === 'z' && event.shiftKey) return { kind: 'edit', command: 'redo' }
    const edit = editKeys[key]
    if (edit) return { kind: 'edit', command: edit }
  }
  if (command && !down && editKeys[event.key.toLowerCase()]) return undefined
  const types = [...event.key].length === 1 && (!command || altGraph)
  const text = event.key === 'Enter' ? '\r' : types ? event.key : undefined
  return {
    kind: 'key',
    type: down ? 'keyDown' : 'keyUp',
    key: event.key.slice(0, 32),
    code: event.code.slice(0, 32),
    keyCode: event.keyCode,
    ...(down && text !== undefined ? { text } : {}),
    modifiers: modifiersOf(event),
  }
}
