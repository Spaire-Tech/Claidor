// The browser in the app, who has control (docs/app-browser/README.md, step
// 2b): the person takes an agent's browser in the Computer tab's full view
// (Take control) and gives it back. While they have it, the agent's steps
// wait in their queue (steps.ts), each for as long as its deadline allows,
// and the person's pointer and keys reach the page (view.ts).

export class Control {
  private readonly held = new Set<string>()
  private readonly waiting = new Map<string, Set<() => void>>()
  private readonly listeners = new Set<(group: string) => void>()

  /** Whether the person has the agent's browser now. */
  isHeld(group: string): boolean {
    return this.held.has(group)
  }

  /** The groups the person has now. */
  heldGroups(): string[] {
    return [...this.held]
  }

  onChange(listener: (group: string) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  take(group: string): void {
    if (this.held.has(group)) return
    this.held.add(group)
    this.tell(group)
  }

  /** Given back: the steps that waited go on. Whether it was held. */
  giveBack(group: string): boolean {
    if (!this.held.delete(group)) return false
    const waiters = this.waiting.get(group)
    this.waiting.delete(group)
    for (const done of waiters ?? []) done()
    this.tell(group)
    return true
  }

  /** Resolves true once the person doesn't have the agent's browser; false after `ms`, or when the step is stopped. */
  free(group: string, ms: number, signal: AbortSignal): Promise<boolean> {
    if (!this.held.has(group)) return Promise.resolve(true)
    return new Promise((resolve) => {
      let waiters = this.waiting.get(group)
      if (!waiters) {
        waiters = new Set()
        this.waiting.set(group, waiters)
      }
      const finish = (freed: boolean) => {
        clearTimeout(timer)
        signal.removeEventListener('abort', stopped)
        waiters?.delete(done)
        resolve(freed)
      }
      const done = () => finish(true)
      const stopped = () => finish(false)
      const timer = setTimeout(() => finish(false), Math.max(0, ms))
      waiters.add(done)
      if (signal.aborted) stopped()
      else signal.addEventListener('abort', stopped, { once: true })
    })
  }

  private tell(group: string): void {
    for (const listener of [...this.listeners]) listener(group)
  }
}
