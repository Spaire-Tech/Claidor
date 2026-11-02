// The one loopback listener the app holds at a time (the Mac's `catcher`),
// and when it is let go: a newer sign-in takes its place; the sign-in ends
// (`stopLoopback`, its own state only); the page that asked reloads, goes
// to another address or is closed (a code caught then would go to a page
// that no longer waits for it: review of 2 November 2026); at quit; and
// after its longest wait whatever happens. Its port is then free.

/** What holds the address (outside/loopback.ts's `LoopbackCatcher`). */
export interface Held {
  readonly state: string
  stop(): void
}

export class LoopbackSlot<Page> {
  private held?: { listener: Held; page: Page; timer: ReturnType<typeof setTimeout> }
  /** Bumped by each ask: a slower start that finds a newer ask lets go of what it got. */
  private asks = 0
  /** The page whose ask is starting. */
  private starting?: Page

  constructor(
    /** Starts a listener for `state` whose answer goes to `page`. */
    private readonly start: (state: string, page: Page) => Promise<Held | undefined>,
    private readonly longestMs: number,
  ) {}

  get holding(): boolean {
    return this.held !== undefined
  }

  /** Listens for `state` for `page`, in the place of any other; false when the address stays taken, or a newer ask came meanwhile. */
  async catch(page: Page, state: string): Promise<boolean> {
    this.letGo()
    const ask = ++this.asks
    this.starting = page
    const listener = await this.start(state, page)
    if (ask === this.asks) this.starting = undefined
    if (!listener) return false
    if (ask !== this.asks || this.held) {
      listener.stop()
      return false
    }
    this.held = { listener, page, timer: setTimeout(() => this.stop(state), this.longestMs) }
    return true
  }

  /** The sign-in with `state` ended: its listener goes; another's stays. */
  stop(state: string): void {
    if (this.held?.listener.state === state) this.letGo()
  }

  /** `page` reloaded, went elsewhere or closed: the listener it asked for goes. */
  left(page: Page): void {
    // A start still on its way for that page finds it gone.
    if (this.starting === page) {
      this.starting = undefined
      this.asks += 1
    }
    if (this.held?.page === page) this.letGo()
  }

  /** Lets go of whatever is held (a newer ask, quitting). */
  letGo(): void {
    const held = this.held
    if (!held) return
    this.held = undefined
    clearTimeout(held.timer)
    held.listener.stop()
  }
}
