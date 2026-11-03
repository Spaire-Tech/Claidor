// The `simeon://` links that reached the app (main.ts finds them on the
// command line, at launch and from a second launch), handed to the main
// window's page: held until the page takes them (`takeLinks`, once it
// listens), then sent as they come (`link`). A page that reloads takes them
// again; what came meanwhile waits. What a link does is the page's
// (src/desktop/links.ts, the Mac's `MacServices.handle`).

/** At most this many links wait for a page (a burst of launches): the newest kept. */
export const heldAtMost = 32

/** A page that may take the links (the main window's), or none. */
export interface LinkPage {
  /** Still there (not destroyed). */
  readonly alive: boolean
  send(url: string): void
}

export class LinkPost {
  private held: string[] = []
  private page?: LinkPage

  /** A link reached the app: to the page that listens, else held. */
  arrive(url: string): void {
    const page = this.page
    if (page?.alive) {
      page.send(url)
      return
    }
    this.page = undefined
    this.held.push(url)
    if (this.held.length > heldAtMost) this.held.splice(0, this.held.length - heldAtMost)
  }

  /** The page listens now: what was held is handed over, once. */
  take(page: LinkPage): string[] {
    this.page = page
    return this.held.splice(0)
  }

  /** The page went (reloaded, closed): links wait again until it takes them. */
  left(page: LinkPage): void {
    if (this.page === page) this.page = undefined
  }
}
