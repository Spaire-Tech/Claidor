// The browser in the app, the frames of other sites in a tab
// (docs/app-browser/README.md, step 3c, 4 November 2026).
//
// Measured in Electron 44: in an offscreen tab, a click sent to the page
// never reaches a frame of another site (a card form, a bank's check): the
// page gets it. Sent through that frame's own DevTools session, at the
// frame's own coordinates, it does, trusted as a person's; the keys then
// reach the field it focused. So each tab keeps a session for each frame of
// another site (`Target.setAutoAttach`, frames only, nothing paused), every
// pointer event goes to the frame under it, and the helper (page.ts) runs
// in those frames too, in a world of its own the page can't see.

import type { WebContents } from 'electron'

/** A frame of another site in the tab, reached over its own DevTools session. */
interface ChildFrame {
  readonly sessionId: string
  /** The session of the document holding its frame element; undefined: the tab's page. */
  readonly parentSession: string | undefined
  frameId?: string
  /** Its frame element, in the parent's session. */
  owner?: number
  /** The helper's world in it. */
  contextId?: number
}

/** Where a pointer event goes: a session (none: the page) and how far that frame's corner is from the page's. */
interface Target {
  readonly sessionId: string | undefined
  readonly dx: number
  readonly dy: number
}

/** At most this many frames of other sites are kept for one tab. */
const childrenMax = 40
const nestingMax = 6
const worldName = 'simeon-helper'
/** A pointer event or a key the page doesn't take in this long is given up. */
const queueItemMs = 5_000

type Params = Record<string, unknown>

export class Frames {
  private readonly children = new Map<string, ChildFrame>()
  /** The pointer and keys, one after another, so a click lands before the keys after it. */
  private chain: Promise<unknown> = Promise.resolve()
  /** A press holds its frame until its release, as a person's drag does. */
  private captured: Target | undefined
  /** The frame last pressed in: the keys after go straight to it (it takes the keyboard a moment after the click). */
  private keysTo: string | undefined

  constructor(private readonly contents: WebContents) {}

  /** Once the tab's DevTools are attached. */
  start(): void {
    this.contents.debugger.on('message', (_event, method, params, sessionId) => this.heard(method, params, sessionId || undefined))
    this.autoAttach(undefined)
  }

  private send<T = Params>(method: string, params: Params, sessionId?: string): Promise<T> {
    if (this.contents.isDestroyed()) return Promise.reject(new Error('The tab closed.'))
    const devtools = this.contents.debugger
    return (sessionId === undefined ? devtools.sendCommand(method, params) : devtools.sendCommand(method, params, sessionId)) as Promise<T>
  }

  private autoAttach(sessionId: string | undefined): void {
    void this.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true, filter: [{ type: 'iframe' }] }, sessionId).catch(() => {})
  }

  private heard(method: string, params: unknown, from: string | undefined): void {
    const event = typeof params === 'object' && params !== null ? (params as Params) : {}
    if (method === 'Target.attachedToTarget') {
      const info = typeof event.targetInfo === 'object' && event.targetInfo !== null ? (event.targetInfo as Params) : {}
      if (info.type !== 'iframe' || typeof event.sessionId !== 'string' || this.children.size >= childrenMax) return
      this.children.set(event.sessionId, { sessionId: event.sessionId, parentSession: from })
      // Its own frames of other sites, a payment form's bank check inside it.
      this.autoAttach(event.sessionId)
    } else if (method === 'Target.detachedFromTarget' && typeof event.sessionId === 'string') {
      this.children.delete(event.sessionId)
      if (this.captured?.sessionId === event.sessionId) this.captured = undefined
      if (this.keysTo === event.sessionId) this.keysTo = undefined
    }
  }

  /** The frames of other sites now, outer ones first. */
  list(): string[] {
    return [...this.children.keys()]
  }

  private async frameIdOf(child: ChildFrame): Promise<string> {
    if (child.frameId === undefined) {
      const tree = await this.send<{ frameTree?: { frame?: { id?: unknown } } }>('Page.getFrameTree', {}, child.sessionId)
      const id = tree.frameTree?.frame?.id
      if (typeof id !== 'string') throw new Error('The frame has no id.')
      child.frameId = id
    }
    return child.frameId
  }

  private async ownerOf(child: ChildFrame): Promise<number> {
    if (child.owner === undefined) {
      const answer = await this.send<{ backendNodeId?: unknown }>('DOM.getFrameOwner', { frameId: await this.frameIdOf(child) }, child.parentSession)
      if (typeof answer.backendNodeId !== 'number') throw new Error('The frame has no element.')
      child.owner = answer.backendNodeId
    }
    return child.owner
  }

  /** The corner of a node's content box in its session's viewport; nothing for one not drawn. */
  private async corner(backendNodeId: number, sessionId: string | undefined): Promise<{ x: number; y: number } | undefined> {
    const box = await this.send<{ model?: { content?: unknown } }>('DOM.getBoxModel', { backendNodeId }, sessionId).catch(() => undefined)
    const quad = box?.model?.content
    if (!Array.isArray(quad) || quad.length < 8 || !quad.every((n) => typeof n === 'number')) return undefined
    const xs = [quad[0], quad[2], quad[4], quad[6]] as number[]
    const ys = [quad[1], quad[3], quad[5], quad[7]] as number[]
    if (Math.max(...xs) - Math.min(...xs) < 1 || Math.max(...ys) - Math.min(...ys) < 1) return undefined
    return { x: Math.min(...xs), y: Math.min(...ys) }
  }

  /** Where a frame's viewport sits on the page now; nothing for one not drawn, or gone. */
  async offsetOf(sessionId: string | undefined, depth = 0): Promise<{ x: number; y: number } | undefined> {
    if (sessionId === undefined) return { x: 0, y: 0 }
    const child = this.children.get(sessionId)
    if (!child || depth > nestingMax) return undefined
    const parent = await this.offsetOf(child.parentSession, depth + 1)
    if (!parent) return undefined
    const corner = await this.corner(await this.ownerOf(child), child.parentSession)
    return corner && { x: parent.x + corner.x, y: parent.y + corner.y }
  }

  /** A frame's element scrolled into view in each document around it, the outermost first. */
  async reveal(sessionId: string, depth = 0): Promise<void> {
    const child = this.children.get(sessionId)
    if (!child || depth > nestingMax) return
    if (child.parentSession !== undefined) await this.reveal(child.parentSession, depth + 1)
    await this.send('DOM.scrollIntoViewIfNeeded', { backendNodeId: await this.ownerOf(child) }, child.parentSession).catch(() => {})
  }

  /** The frame under a point of the page, what the page draws there decides (an overlay over a frame is the page's). */
  private async route(x: number, y: number): Promise<Target> {
    let sessionId: string | undefined
    let dx = 0
    let dy = 0
    for (let depth = 0; depth < nestingMax && this.children.size > 0; depth += 1) {
      const hit = await this.send<{ backendNodeId?: unknown }>('DOM.getNodeForLocation', { x: Math.round(x - dx), y: Math.round(y - dy), ignorePointerEventsNone: true }, sessionId).catch(() => undefined)
      const node = hit?.backendNodeId
      if (typeof node !== 'number') break
      let next: ChildFrame | undefined
      for (const child of this.children.values()) {
        if (child.parentSession !== sessionId) continue
        if ((await this.ownerOf(child).catch(() => undefined)) === node) {
          next = child
          break
        }
      }
      if (!next) break
      const corner = await this.corner(node, sessionId)
      if (!corner) break
      dx += corner.x
      dy += corner.y
      sessionId = next.sessionId
    }
    return { sessionId, dx, dy }
  }

  /** The frame a point of the page is in: its session, or none for the page's own. */
  async frameAt(x: number, y: number): Promise<string | undefined> {
    return (await this.route(x, y)).sessionId
  }

  /** One after another; one the page never answers is given up after a while, so the next still goes. */
  private queue(work: () => Promise<void>): Promise<void> {
    const bounded = () => {
      let timer: ReturnType<typeof setTimeout> | undefined
      return Promise.race([
        work(),
        new Promise<never>((_, fail) => {
          timer = setTimeout(() => fail(new Error("The page didn't take the pointer or the keys in time.")), queueItemMs)
        }),
      ]).finally(() => clearTimeout(timer))
    }
    const next = this.chain.then(bounded, bounded)
    this.chain = next.catch(() => {})
    return next
  }

  /** A mouse or wheel event at a point of the page, sent to the frame under it, in turn. */
  pointer(params: Params & { type: string; x: number; y: number }): Promise<void> {
    return this.queue(async () => {
      const where = params.type !== 'mousePressed' && this.captured ? this.captured : await this.route(params.x, params.y)
      if (params.type === 'mousePressed') {
        this.captured = where
        this.keysTo = where.sessionId
      }
      try {
        await this.send('Input.dispatchMouseEvent', { ...params, x: Math.round(params.x - where.dx), y: Math.round(params.y - where.dy) }, where.sessionId)
      } catch (error) {
        // The frame went meanwhile: the page has it. The page's own failure is the step's.
        if (where.sessionId === undefined) throw error
        await this.send('Input.dispatchMouseEvent', params)
      } finally {
        if (params.type === 'mouseReleased') this.captured = undefined
      }
    })
  }

  /** A key or typed words, after the pointer events before it: to the frame last pressed in, else the page (whose focused frame has them). */
  input(method: string, params: Params): Promise<void> {
    return this.queue(async () => {
      const to = this.keysTo
      if (to === undefined) return void (await this.send(method, params))
      await this.send(method, params, to).catch(async () => {
        this.keysTo = undefined
        await this.send(method, params)
      })
    })
  }

  /** A script in the helper's world of a frame of another site (made once, again after its page changed); its value. */
  async evaluate(sessionId: string, code: string): Promise<unknown> {
    const child = this.children.get(sessionId)
    if (!child) throw new Error('The frame went.')
    for (let attempt = 0; ; attempt += 1) {
      if (child.contextId === undefined) {
        const world = await this.send<{ executionContextId?: unknown }>('Page.createIsolatedWorld', { frameId: await this.frameIdOf(child), worldName }, sessionId)
        if (typeof world.executionContextId !== 'number') throw new Error('The frame could not be read.')
        child.contextId = world.executionContextId
      }
      try {
        const answer = await this.send<{ result?: { value?: unknown }; exceptionDetails?: unknown }>('Runtime.evaluate', { expression: code, contextId: child.contextId, returnByValue: true, awaitPromise: true }, sessionId)
        if (answer.exceptionDetails !== undefined) throw new Error('The frame could not be read.')
        return answer.result?.value
      } catch (error) {
        // Its page loaded again: a new world, once.
        const gone = error instanceof Error && /context/i.test(error.message)
        child.contextId = undefined
        child.frameId = undefined
        if (!gone || attempt >= 1) throw error
      }
    }
  }
}
