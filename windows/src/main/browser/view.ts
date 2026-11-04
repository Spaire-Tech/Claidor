// The browser in the app, seen (docs/app-browser/README.md, step 2b): the
// Computer tab's view of an agent's tabs on this PC.
//
// - The app's page watches one agent at a time (the pane's Computer tab, or
//   its full view over the window). While it does, the page is told the
//   agent's tabs, who has control and where the agent last pointed
//   (`browserShown`), and sent the agent's tab as pictures as the tab draws
//   (`browserFrame`, a JPEG of the page's 1280 × 800).
// - Take control: the agent's next steps wait (control.ts, steps.ts), and
//   the person's pointer, wheel and keys reach the tab over the DevTools
//   protocol, as the agent's do. Back, Forward, Reload and the tabs are the
//   person's then too. Give back: the agent is told the page may have
//   changed, and its refs are refused until it looks again.
// - The page that watched going (closed, reloaded) gives everything back.

import type { NativeImage, WebContents } from 'electron'
import type {
  BrowserBarAct,
  BrowserFrame,
  BrowserInput,
  BrowserShown,
} from '../../../../clients/apps/app/src/desktop/contract'
import type { Control } from './control'
import type { Steps } from './steps'
import { type Tab, type Tabs, viewport } from './tabs'

export interface ViewOptions {
  tabs: Tabs
  steps: Steps
  control: Control
  /** The server's switch, as the engine's last welcome said it. */
  enabled(): boolean
  shown(to: WebContents, payload: BrowserShown): void
  frame(to: WebContents, payload: BrowserFrame): void
  log(line: string): void
  /** Whether the page's window is on screen (not hidden in the tray, not minimised): no picture is made while it isn't. Always, without it. */
  shows?(page: WebContents): boolean
  /** Calls `again` whenever the page's window comes back on screen. */
  whenShown?(page: WebContents, again: () => void): void
}

/** Pictures a second: a tab nobody watches, one watched, one the person has. */
const unwatchedRate = 10
const watchedRate = 20
const controlledRate = 30
const jpegQuality = 70
/** A burst of changes is told once, this long after the first. */
const tellAfterMs = 50

/** The page's pointers a page may be shown with (Electron's names that CSS has too). */
const cursors = new Set([
  'default', 'crosshair', 'pointer', 'text', 'wait', 'help', 'move', 'cell', 'copy', 'none', 'not-allowed', 'progress', 'alias',
  'context-menu', 'vertical-text', 'zoom-in', 'zoom-out', 'grab', 'grabbing', 'col-resize', 'row-resize', 'e-resize', 'n-resize',
  'ne-resize', 'nw-resize', 's-resize', 'se-resize', 'sw-resize', 'w-resize', 'ew-resize', 'ns-resize', 'nesw-resize', 'nwse-resize', 'all-scroll',
])
const cursorNames: Record<string, string> = { hand: 'pointer', ibeam: 'text', 'no-drop': 'not-allowed', nodrop: 'not-allowed' }

type Pointer = NonNullable<BrowserShown['pointer']>

function finite(value: unknown, low: number, high: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('A number was expected.')
  return Math.min(high, Math.max(low, value))
}

function whole(value: unknown, low: number, high: number): number {
  return Math.round(finite(value, low, high))
}

function word(value: unknown, max: number): string {
  if (typeof value !== 'string' || value.length > max) throw new Error('A short text was expected.')
  return value
}

export class BrowserViewer {
  private watching: { page: WebContents; agentId: string } | undefined
  private framing: { tab: Tab; paint: (event: unknown, dirty: unknown, image: NativeImage) => void; cursor: (event: unknown, type: string) => void } | undefined
  private cursor = 'default'
  private readonly pointers = new Map<string, Pointer>()
  /** A paint skipped while the page's window was off screen: the tab is drawn again when it is back. */
  private missed = false
  /** Agents the person is giving back: their input stops at once. */
  private readonly leaving = new Set<string>()
  private readonly heard = new WeakSet<WebContents>()
  private telling: ReturnType<typeof setTimeout> | undefined

  constructor(private readonly options: ViewOptions) {
    options.tabs.onChange((group) => this.changed(group))
    options.control.onChange((group) => this.changed(group))
  }

  /** The agent's pointer moved on its tab (steps.ts). */
  pointed(group: string, x: number, y: number, type: Pointer['type']): void {
    this.pointers.set(group, { x, y, type, at: Date.now() })
    this.changed(group)
  }

  /** The agent's steps started or settled, or something else of the browser changed (the switch). */
  changed(group?: string): void {
    if (!this.watching || (group !== undefined && group !== this.watching.agentId)) return
    if (this.telling) return
    this.telling = setTimeout(() => {
      this.telling = undefined
      this.follow()
      const watching = this.watching
      if (watching) this.options.shown(watching.page, this.state(watching.agentId))
    }, tellAfterMs)
  }

  /** The page watches this agent's browser, or none. */
  watch(page: WebContents, agentId: string | null): BrowserShown | null {
    this.hear(page)
    if (agentId === null) {
      if (this.watching?.page === page) this.watching = undefined
      this.follow()
      return null
    }
    this.watching = { page, agentId }
    this.follow()
    return this.state(agentId)
  }

  /** Take control (true) or give it back (false). */
  async control(page: WebContents, agentId: string, person: boolean): Promise<BrowserShown | null> {
    this.hear(page)
    const { control } = this.options
    if (person) {
      // Nothing to take while the agent has no tab here.
      if (this.options.tabs.groupTabs(agentId).length > 0) control.take(agentId)
    } else await this.giveBack(agentId)
    this.follow()
    return this.watching?.agentId === agentId ? this.state(agentId) : null
  }

  /** Back, Forward, Reload, Stop or a tab chosen: the person's, while they have control. */
  bar(agentId: string, act: BrowserBarAct): void {
    if (!this.personHas(agentId)) return
    const { tabs } = this.options
    if (act.act === 'select') {
      const tab = tabs.groupTabs(agentId).find((one) => one.id === word(act.tabId, 64))
      if (tab) tabs.select(agentId, tab)
      return
    }
    const tab = this.liveTab(agentId)
    if (!tab) return
    const history = tab.contents.navigationHistory
    switch (act.act) {
      case 'back':
        if (history.canGoBack()) history.goBack()
        return
      case 'forward':
        if (history.canGoForward()) history.goForward()
        return
      case 'reload':
        tab.contents.reload()
        return
      case 'stop':
        tab.contents.stop()
    }
  }

  /** The person's pointer, wheel or keys on the agent's tab, while they have control. */
  input(agentId: string, input: BrowserInput): void {
    if (!this.personHas(agentId)) return
    const tab = this.liveTab(agentId)
    if (!tab || typeof input !== 'object' || input === null) return
    // In turn on the tab's one line: the pointer to the frame under it (another site's too, step 3c), the keys after it.
    const send = (method: string, params: Record<string, unknown>) => {
      void tab.frames.input(method, params).catch(() => {})
    }
    const point = (params: Record<string, unknown> & { type: string; x: number; y: number }) => {
      void tab.frames.pointer(params).catch(() => {})
    }
    switch (input.kind) {
      case 'mouse': {
        const types = ['mousePressed', 'mouseReleased', 'mouseMoved']
        const buttons = ['none', 'left', 'middle', 'right']
        if (!types.includes(input.type) || !buttons.includes(input.button)) return
        point({
          type: input.type,
          x: finite(input.x, 0, viewport.width),
          y: finite(input.y, 0, viewport.height),
          button: input.button,
          buttons: whole(input.buttons, 0, 7),
          clickCount: whole(input.clickCount, 0, 3),
          modifiers: whole(input.modifiers, 0, 15),
        })
        return
      }
      case 'wheel':
        point({
          type: 'mouseWheel',
          x: finite(input.x, 0, viewport.width),
          y: finite(input.y, 0, viewport.height),
          button: 'none',
          deltaX: finite(input.deltaX, -5_000, 5_000),
          deltaY: finite(input.deltaY, -5_000, 5_000),
          modifiers: whole(input.modifiers, 0, 15),
        })
        return
      case 'key': {
        if (input.type !== 'keyDown' && input.type !== 'keyUp') return
        const keyCode = whole(input.keyCode, 0, 255)
        const typed = input.text === undefined ? undefined : word(input.text, 4)
        const common = {
          key: word(input.key, 32),
          code: word(input.code, 32),
          windowsVirtualKeyCode: keyCode,
          nativeVirtualKeyCode: keyCode,
          modifiers: whole(input.modifiers, 0, 15),
        }
        if (input.type === 'keyUp') send('Input.dispatchKeyEvent', { type: 'keyUp', ...common })
        else if (typed) send('Input.dispatchKeyEvent', { type: 'keyDown', text: typed, unmodifiedText: typed, ...common })
        else send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...common })
        return
      }
      case 'text':
        send('Input.insertText', { text: word(input.text, 2_000) })
        return
      case 'edit': {
        const contents = tab.contents
        const commands: Record<string, () => void> = { copy: () => contents.copy(), cut: () => contents.cut(), paste: () => contents.paste(), selectAll: () => contents.selectAll(), undo: () => contents.undo(), redo: () => contents.redo() }
        // Only these six: a name from the page is never looked up further.
        if (typeof input.command === 'string' && Object.hasOwn(commands, input.command)) commands[input.command]!()
      }
    }
  }

  /** Everything given back and nothing watched: the page that watched went or loaded again (the tabs stay, so the agent is told). */
  async reset(): Promise<void> {
    this.watching = undefined
    this.follow()
    await Promise.all(this.options.control.heldGroups().map((group) => this.giveBack(group)))
  }

  /** As `reset`, at once, as the tabs close (signed out, quitting): there is no page left to tell. */
  drop(): void {
    this.watching = undefined
    this.follow()
    for (const group of this.options.control.heldGroups()) this.options.control.giveBack(group)
  }

  /** The agent's browser as the page draws it. */
  state(agentId: string): BrowserShown {
    const { tabs, control, steps } = this.options
    const current = this.liveTab(agentId)
    const history = current?.contents.navigationHistory
    const pointer = this.pointers.get(agentId)
    return {
      agentId,
      enabled: this.options.enabled(),
      tabs: tabs.groupTabs(agentId).map((tab) => ({
        id: tab.id,
        title: tab.contents.getTitle(),
        url: tab.contents.getURL(),
        loading: tab.loading,
      })),
      ...(current ? { current: current.id } : {}),
      canGoBack: history?.canGoBack() ?? false,
      canGoForward: history?.canGoForward() ?? false,
      person: control.isHeld(agentId),
      working: steps.busy(agentId),
      ...(pointer ? { pointer } : {}),
      cursor: this.cursor,
    }
  }

  private personHas(agentId: string): boolean {
    return this.options.control.isHeld(agentId) && !this.leaving.has(agentId)
  }

  private liveTab(agentId: string): Tab | undefined {
    const tab = this.options.tabs.currentTab(agentId)
    return tab && !tab.contents.isDestroyed() ? tab : undefined
  }

  private async giveBack(agentId: string): Promise<void> {
    if (!this.options.control.isHeld(agentId) || this.leaving.has(agentId)) return
    this.leaving.add(agentId)
    try {
      // The refs are forgotten before the steps that waited go on.
      await this.options.steps.personGaveBack(agentId).catch(() => {})
    } finally {
      this.leaving.delete(agentId)
      this.options.control.giveBack(agentId)
    }
  }

  /** A page that watches or takes control: when it goes, or loads again, everything is given back. */
  private hear(page: WebContents): void {
    if (this.heard.has(page)) return
    this.heard.add(page)
    const gone = () => {
      if (this.watching?.page === page) void this.reset()
    }
    page.once('destroyed', gone)
    page.on('did-start-navigation', (details) => {
      if (details.isMainFrame && !details.isSameDocument) gone()
    })
    this.options.whenShown?.(page, () => {
      if (!this.missed || this.watching?.page !== page) return
      this.missed = false
      const tab = this.framing?.tab
      if (tab && !tab.contents.isDestroyed()) tab.contents.invalidate()
    })
  }

  /** The pictures follow the watched agent's tab: its paints sent, faster while the person has it. */
  private follow(): void {
    const watching = this.watching
    const tab = watching ? this.liveTab(watching.agentId) : undefined
    const rate = tab && watching ? (this.options.control.isHeld(watching.agentId) ? controlledRate : watchedRate) : unwatchedRate
    if (this.framing && this.framing.tab !== tab) {
      const { tab: old, paint, cursor } = this.framing
      this.framing = undefined
      if (!old.contents.isDestroyed()) {
        old.contents.off('paint', paint)
        old.contents.off('cursor-changed', cursor)
        old.contents.setFrameRate(unwatchedRate)
      }
      this.cursor = 'default'
    }
    if (!tab || !watching) return
    if (!this.framing) {
      const paint = (_event: unknown, _dirty: unknown, image: NativeImage) => this.paint(tab, image)
      const cursor = (_event: unknown, type: string) => {
        const named = cursorNames[type] ?? type
        const now = cursors.has(named) ? named : 'default'
        if (now === this.cursor) return
        this.cursor = now
        this.changed(tab.group)
      }
      this.framing = { tab, paint, cursor }
      tab.contents.on('paint', paint)
      tab.contents.on('cursor-changed', cursor)
      tab.contents.setFrameRate(rate)
      // The whole page drawn again at once, so the first picture doesn't wait for the page to change.
      tab.contents.invalidate()
      return
    }
    if (tab.contents.getFrameRate() !== rate) tab.contents.setFrameRate(rate)
  }

  private paint(tab: Tab, image: NativeImage): void {
    const watching = this.watching
    if (!watching || watching.page.isDestroyed() || this.framing?.tab !== tab || image.isEmpty()) return
    if (this.options.shows && !this.options.shows(watching.page)) {
      this.missed = true
      return
    }
    const size = image.getSize()
    let jpeg: Buffer
    try {
      jpeg = image.toJPEG(jpegQuality)
    } catch (error) {
      this.options.log(`[browser] a picture of the page could not be made: ${error instanceof Error ? error.message : String(error)}`)
      return
    }
    this.options.frame(watching.page, { agentId: watching.agentId, tabId: tab.id, jpeg: new Uint8Array(jpeg), width: size.width, height: size.height })
  }
}
