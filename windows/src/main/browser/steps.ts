// The browser in the app, its steps (docs/app-browser/protocol.md, "The
// ops"): what each of the agent's browser tools does in an agent's tab. One
// step at a time for each agent, in the order they came; different agents
// run side by side. Clicks, keys and the wheel go through the DevTools
// protocol, trusted as a person's; what the page shows is read by the
// helper in its own world (page.ts). Each answer is the step's sentence, the
// page it left, and its picture when the engine asks for one.

import { randomBytes } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { JSONObject } from '../hands/wire'
import type { Control } from './control'
import { readKey } from './keys'
import { helperCall, helperWorld } from './page'
import type { Answer, BrowserRequest } from './protocol'
import { openable } from './rules'
import { type Tab, type Tabs, viewport } from './tabs'

export interface StepsOptions {
  tabs: Tabs
  /** Where the files of an upload are written for the page to take. */
  uploads: string
  /** Who has control: while the person has an agent's browser, its steps wait (step 2b). */
  control?: Control
  /** Where the agent's pointer went on its tab, for the Computer tab's view. */
  pointer?(group: string, x: number, y: number, type: 'move' | 'click' | 'drag' | 'scroll'): void
  /** An agent's steps started or settled. */
  activity?(group: string): void
}

/** A step that waited out its time for the person to give control back says so this long before its deadline. */
const controlMarginMs = 5_000

/** A refusal or a failure said to the agent as it is. */
export class StepError extends Error {}

const navigateTimeoutMs = 25_000
const helperTimeoutMs = 10_000
const fullPageMaxSide = 2_000
const cdpAnswerMax = 20_000
const uploadMaxBytes = 25 * 1024 * 1024

/** DevTools commands an agent may not send: the browser's own, the sign-ins, the files of this PC, the input the tools give. */
const deniedPrefixes = ['Browser.', 'Target.', 'Storage.', 'SystemInfo.', 'Security.', 'Input.', 'Tethering.', 'Cast.', 'ServiceWorker.', 'BackgroundService.']
const deniedMethods = new Set([
  'Network.setCookie',
  'Network.setCookies',
  'Network.getCookies',
  'Network.getAllCookies',
  'Network.deleteCookies',
  'Network.clearBrowserCookies',
  'Network.clearBrowserCache',
  'DOM.setFileInputFiles',
  'Network.loadNetworkResource',
  'Page.setInterceptFileChooserDialog',
  'Page.setDownloadBehavior',
  'Page.navigate',
  'Page.close',
  'Page.crash',
])

function text(args: JSONObject, key: string): string | undefined {
  const value = args[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function number(args: JSONObject, key: string): number | undefined {
  const value = args[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function strings(args: JSONObject, key: string): string[] | undefined {
  const value = args[key]
  if (typeof value === 'string') return [value]
  return Array.isArray(value) ? value.filter((one): one is string => typeof one === 'string') : undefined
}

function need(value: string | undefined, name: string): string {
  if (value === undefined) throw new StepError(`${name} is required.`)
  return value
}

function sleep(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms))
}

function checkpoint(signal: AbortSignal): void {
  if (signal.aborted) throw new Stopped('The browser step was stopped.')
}

/** The step was stopped (cancelled, or out of time): nothing more is done for it. */
class Stopped extends StepError {}

function within<T>(promise: Promise<T>, ms: number, sentence: string, signal?: AbortSignal): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  let onAbort: (() => void) | undefined
  return Promise.race([
    promise,
    new Promise<never>((_, fail) => {
      timer = setTimeout(() => fail(new StepError(sentence)), ms)
      if (signal) {
        onAbort = () => fail(new Stopped('The browser step was stopped.'))
        if (signal.aborted) onAbort()
        else signal.addEventListener('abort', onAbort, { once: true })
      }
    }),
  ]).finally(() => {
    clearTimeout(timer)
    if (onAbort) signal?.removeEventListener('abort', onAbort)
  })
}

const modifierBits: Record<string, number> = { alt: 1, control: 2, ctrl: 2, meta: 4, command: 4, cmd: 4, shift: 8 }

function modifiersOf(args: JSONObject): number {
  let bits = 0
  for (const name of strings(args, 'modifiers') ?? []) bits |= modifierBits[name.toLowerCase()] ?? 0
  return bits
}

export class Steps {
  private readonly chains = new Map<string, Promise<unknown>>()

  constructor(private readonly options: StepsOptions) {}

  /** Files of earlier uploads, from a run before this one, gone. */
  async forgetUploads(): Promise<void> {
    await rm(this.options.uploads, { recursive: true, force: true }).catch(() => {})
  }

  /** One step, after the agent's step before it. */
  run(request: BrowserRequest, signal: AbortSignal): Promise<Answer> {
    const startedAt = Date.now()
    // Auto-review reads the tabs before a step; while the person has them, it doesn't queue behind the step that waits for them.
    if (request.op === 'review_state' && this.options.control?.isHeld(request.viewId)) return this.now(request, signal, startedAt)
    const before = this.chains.get(request.viewId) ?? Promise.resolve()
    const step = before.then(() => this.now(request, signal, startedAt))
    const settled = step.then(
      () => undefined,
      () => undefined,
    )
    this.chains.set(request.viewId, settled)
    this.options.activity?.(request.viewId)
    void settled.then(() => {
      if (this.chains.get(request.viewId) === settled) this.chains.delete(request.viewId)
      this.options.activity?.(request.viewId)
    })
    return step
  }

  /** Whether a step of the agent's is running or waiting. */
  busy(group: string): boolean {
    return this.chains.has(group)
  }

  /**
   * The person gave the agent's browser back: the refs of its last snapshot
   * are refused until the next one (the page may have changed under them),
   * and its next answer says so.
   */
  async personGaveBack(group: string): Promise<void> {
    const tabs = this.tabs.groupTabs(group)
    await Promise.all(
      tabs.map((tab) =>
        tab.contents.getURL() === ''
          ? undefined
          : within(tab.contents.executeJavaScriptInIsolatedWorld(helperWorld, [{ code: helperCall('forget') }]), helperTimeoutMs, 'timeout').catch(() => undefined),
      ),
    )
    const current = this.tabs.currentTab(group)
    current?.notes.push('The person used the browser (Take control) and gave it back; the page may have changed, so take a fresh browser_snapshot before acting.')
  }

  private async now(request: BrowserRequest, signal: AbortSignal, startedAt: number): Promise<Answer> {
    checkpoint(signal)
    // The person has the agent's browser: the step waits for it back, as long as its deadline allows. Reading the tabs for Auto-review doesn't wait.
    const control = this.options.control
    if (control?.isHeld(request.viewId) && request.op !== 'review_state') {
      const left = request.deadlineMs - (Date.now() - startedAt) - controlMarginMs
      const freed = await control.free(request.viewId, left, signal)
      checkpoint(signal)
      if (!freed)
        return {
          ok: false,
          error: 'The person has taken control of the browser here and hasn’t given it back yet. Wait a little, then take a fresh browser_snapshot before acting; or ask them in the chat.',
        }
    }
    try {
      return await this.step(request, signal)
    } catch (error) {
      if (error instanceof StepError) return { ok: false, error: error.message }
      const message = error instanceof Error ? error.message : String(error)
      return { ok: false, error: `The browser step failed: ${message.slice(0, 300)}` }
    }
  }

  private get tabs(): Tabs {
    return this.options.tabs
  }

  private async step(request: BrowserRequest, signal: AbortSignal): Promise<Answer> {
    const { args, viewId } = request
    switch (request.op) {
      case 'navigate':
        return this.navigate(request, signal)
      case 'snapshot': {
        const tab = this.tabs.tabFor(viewId)
        const outline = await this.helper<{ text: string; refs: number }>(tab, 'outline', {
          selector: text(args, 'selector'),
          interactive: args.interactive === true,
          maxDepth: number(args, 'maxDepth'),
        })
        return this.finish(request, tab, `Read the page (${outline.refs} controls with refs).`, outline.text)
      }
      case 'click': {
        const tab = this.tabs.tabFor(viewId)
        const ref = need(text(args, 'ref'), 'ref')
        const since = Date.now()
        const point = await this.aim(tab, ref, number(args, 'offsetX'), number(args, 'offsetY'))
        checkpoint(signal)
        await this.click(tab, point.x, point.y, args)
        await this.settle(viewId, tab, since)
        return this.finish(request, tab, `Clicked ${text(args, 'element') ?? ref}.`)
      }
      case 'mouse_click_xy': {
        const tab = this.tabs.tabFor(viewId)
        const x = number(args, 'x')
        const y = number(args, 'y')
        if (x === undefined || y === undefined) throw new StepError('x and y are required.')
        if (x < 0 || y < 0 || x > viewport.width || y > viewport.height)
          throw new StepError(`(${x}, ${y}) is outside the page, which is ${viewport.width}×${viewport.height}.`)
        const since = Date.now()
        await this.click(tab, x, y, args)
        await this.settle(viewId, tab, since)
        return this.finish(request, tab, `Clicked at (${Math.round(x)}, ${Math.round(y)}).`)
      }
      case 'type':
        return this.type(request, signal)
      case 'fill': {
        const tab = this.tabs.tabFor(viewId)
        const ref = need(text(args, 'ref'), 'ref')
        const value = typeof args.value === 'string' ? args.value : String(args.value ?? '')
        const done = await this.helper<{ filled: string; typeHere?: boolean }>(tab, 'fill', ref, value)
        if (done.typeHere) await this.cdp(tab, 'Input.insertText', { text: value })
        await sleep(100)
        return this.finish(request, tab, `Filled ${text(args, 'element') ?? ref}.`)
      }
      case 'select_option': {
        const tab = this.tabs.tabFor(viewId)
        const ref = need(text(args, 'ref'), 'ref')
        const values = strings(args, 'values')
        if (!values || values.length === 0) throw new StepError('values is required.')
        const done = await this.helper<{ chosen: string[] }>(tab, 'choose', ref, values)
        await sleep(100)
        return this.finish(request, tab, `Chose ${done.chosen.map((one) => JSON.stringify(one)).join(', ')} in ${text(args, 'element') ?? ref}.`)
      }
      case 'upload_file':
        return this.upload(request, signal)
      case 'press_key': {
        const tab = this.tabs.tabFor(viewId)
        const name = need(typeof args.key === 'string' ? args.key : undefined, 'key')
        const since = Date.now()
        await this.press(tab, name)
        await this.settle(viewId, tab, since)
        return this.finish(request, tab, `Pressed ${name}.`)
      }
      case 'scroll':
        return this.scroll(request)
      case 'drag':
        return this.drag(request, signal)
      case 'get_bounding_box': {
        const tab = this.tabs.tabFor(viewId)
        const ref = need(text(args, 'ref'), 'ref')
        const box = await this.helper<JSONObject>(tab, 'box', ref)
        return this.finish(request, tab, `The box of ${ref}, in the page's pixels.`, JSON.stringify(box))
      }
      case 'highlight': {
        const tab = this.tabs.tabFor(viewId)
        const ref = need(text(args, 'ref'), 'ref')
        const done = await this.helper<{ highlighted: string }>(tab, 'highlight', ref, number(args, 'durationMs') ?? 2_000)
        await sleep(80)
        return this.finish(request, tab, `Highlighted ${done.highlighted}.`)
      }
      case 'cdp':
        return this.devtools(request)
      case 'tabs':
        return this.tabsStep(request)
      case 'screenshot': {
        const tab = this.tabs.tabFor(viewId)
        if (args.fullPage === true) return this.fullPage(request, tab)
        return this.finish(request, tab, 'Took a picture of the page.')
      }
      case 'review_state':
        return { ok: true, summary: 'The agent’s tabs.', data: JSON.stringify(this.tabs.reviewState(viewId)) }
    }
  }

  // MARK: Steps

  private async navigate(request: BrowserRequest, signal: AbortSignal): Promise<Answer> {
    const url = need(text(request.args, 'url'), 'url').trim()
    if (!openable(url) || url === 'about:blank') throw new StepError('Only http and https addresses open in the browser.')
    const tab = request.args.newTab === true ? this.tabs.open(request.viewId) : this.tabs.tabFor(request.viewId)
    let note = ''
    try {
      await within(tab.contents.loadURL(url), navigateTimeoutMs, 'timeout', signal)
    } catch (error) {
      const code = (error as { code?: unknown }).code
      // Stopped: the page's load is stopped too, so the agent's next step doesn't wait behind it.
      if (error instanceof Stopped) {
        if (!tab.contents.isDestroyed()) tab.contents.stop()
        throw error
      }
      if (error instanceof StepError) note = ' The page is still loading.'
      // A download, or the page moving on by itself, ends the load early: not a failure.
      else if (code !== 'ERR_ABORTED') throw new StepError(`Could not open ${url} (${typeof code === 'string' ? code : 'the page did not load'}).`)
    }
    checkpoint(signal)
    const opened = request.args.newTab === true ? `Opened ${url} in a new tab (${tab.id}).` : `Opened ${url}.`
    return this.finish(request, tab, opened + note)
  }

  private async type(request: BrowserRequest, signal: AbortSignal): Promise<Answer> {
    const { args, viewId } = request
    const tab = this.tabs.tabFor(viewId)
    const ref = need(text(args, 'ref'), 'ref')
    const value = typeof args.text === 'string' ? args.text : need(undefined, 'text')
    const since = Date.now()
    let focus = await this.helper<{ focused: boolean; editable: boolean }>(tab, 'focus', ref, args.clear === true)
    if (!focus.focused) {
      const point = await this.aim(tab, ref)
      await this.click(tab, point.x, point.y, {})
      focus = await this.helper(tab, 'focus', ref, args.clear === true)
    }
    if (args.clear === true) await this.press(tab, 'Backspace')
    checkpoint(signal)
    if (args.slowly === true) {
      for (const character of value) {
        checkpoint(signal)
        const key = readKey(character)
        if (key?.text !== undefined && key.code !== '') await this.pressKey(tab, key)
        else await this.cdp(tab, 'Input.insertText', { text: character })
        await sleep(40)
      }
    } else await this.cdp(tab, 'Input.insertText', { text: value })
    if (args.submit === true) await this.press(tab, 'Enter')
    await this.settle(viewId, tab, since)
    return this.finish(request, tab, `Typed ${[...value].length} characters into ${text(args, 'element') ?? ref}${args.submit === true ? ' and pressed Enter' : ''}.`)
  }

  private async upload(request: BrowserRequest, signal: AbortSignal): Promise<Answer> {
    const { args, viewId } = request
    const tab = this.tabs.tabFor(viewId)
    const ref = need(text(args, 'ref'), 'ref')
    const files = Array.isArray(args.files) ? args.files : []
    if (files.length === 0) throw new StepError('browser_upload_file needs the files to attach.')
    const folder = path.join(this.options.uploads, randomBytes(8).toString('hex'))
    await mkdir(folder, { recursive: true })
    const written: string[] = []
    let total = 0
    for (const file of files) {
      if (typeof file !== 'object' || file == null || Array.isArray(file)) throw new StepError('A file to attach was not readable.')
      const { name, dataB64 } = file as JSONObject
      if (typeof name !== 'string' || typeof dataB64 !== 'string') throw new StepError('A file to attach was not readable.')
      const bytes = Buffer.from(dataB64, 'base64')
      total += bytes.length
      if (total > uploadMaxBytes) throw new StepError('These files are too large to attach in the browser here (25 MB at most together).')
      const safe = path.basename(name).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 180) || 'file'
      // A folder for each, so the page is given the file's own name.
      const own = path.join(folder, String(written.length))
      await mkdir(own, { recursive: true })
      const target = path.join(own, safe)
      await writeFile(target, bytes)
      written.push(target)
    }
    checkpoint(signal)
    const names = written.map((one) => path.basename(one)).join(', ')
    const token = randomBytes(8).toString('hex')
    const marked = await this.helper<{ isField: boolean; inFrame: boolean }>(tab, 'markFileField', ref, token)
    if (marked.isField && !marked.inFrame) {
      try {
        const root = (await this.cdp(tab, 'DOM.getDocument', { depth: 0 })) as { root: { nodeId: number } }
        const found = (await this.cdp(tab, 'DOM.querySelector', { nodeId: root.root.nodeId, selector: `[data-simeon-file="${token}"]` })) as { nodeId: number }
        if (!found.nodeId) throw new StepError(`${ref} could not be found to attach the files; take a fresh browser_snapshot.`)
        await this.cdp(tab, 'DOM.setFileInputFiles', { files: written, nodeId: found.nodeId })
      } finally {
        await this.helper(tab, 'unmark', token).catch(() => undefined)
      }
      await sleep(150)
      return this.finish(request, tab, `Attached ${names} to ${text(args, 'element') ?? ref}.`)
    }
    // A styled button or a drop zone: the file window its click opens is caught before it shows, and given the files.
    const devtools = tab.contents.debugger
    let chooser: ((params: { backendNodeId?: number; mode?: string }) => void) | undefined
    const opened = new Promise<{ backendNodeId?: number; mode?: string } | undefined>((done) => {
      chooser = done
      setTimeout(() => done(undefined), 5_000)
    })
    const listener = (_event: unknown, method: string, params: { backendNodeId?: number; mode?: string }) => {
      if (method === 'Page.fileChooserOpened') chooser?.(params)
    }
    devtools.on('message', listener)
    try {
      await this.cdp(tab, 'Page.setInterceptFileChooserDialog', { enabled: true })
      const point = await this.aim(tab, ref)
      await this.click(tab, point.x, point.y, {})
      const picker = await opened
      if (!picker || picker.backendNodeId === undefined)
        throw new StepError(`Clicking ${text(args, 'element') ?? ref} opened no file picker. Take a snapshot and pass the ref of the page's upload button or file field.`)
      const chosen = picker.mode === 'selectSingle' ? written.slice(0, 1) : written
      await this.cdp(tab, 'DOM.setFileInputFiles', { files: chosen, backendNodeId: picker.backendNodeId })
    } finally {
      devtools.removeListener('message', listener)
      await this.cdp(tab, 'Page.setInterceptFileChooserDialog', { enabled: false }).catch(() => undefined)
    }
    await sleep(150)
    return this.finish(request, tab, `Attached ${names} to ${text(args, 'element') ?? ref}.`)
  }

  private async scroll(request: BrowserRequest): Promise<Answer> {
    const { args, viewId } = request
    const tab = this.tabs.tabFor(viewId)
    const ref = text(args, 'ref')
    if (ref) {
      const done = await this.helper<{ scrolled: string }>(tab, 'scrollTo', ref)
      await sleep(150)
      return this.finish(request, tab, `Scrolled ${done.scrolled} into view.`)
    }
    let deltaX = number(args, 'deltaX') ?? 0
    let deltaY = number(args, 'deltaY') ?? 0
    let said: string
    if (deltaX === 0 && deltaY === 0) {
      const amount = Math.max(1, Math.min(10_000, number(args, 'amount') ?? 300))
      const direction = (text(args, 'direction') ?? 'down').toLowerCase()
      if (direction === 'up') deltaY = -amount
      else if (direction === 'left') deltaX = -amount
      else if (direction === 'right') deltaX = amount
      else deltaY = amount
      said = `Scrolled ${['up', 'left', 'right'].includes(direction) ? direction : 'down'} ${amount} pixels.`
    } else said = `Scrolled by (${deltaX}, ${deltaY}).`
    await this.mouse(tab, 'mouseWheel', viewport.width / 2, viewport.height / 2, { deltaX, deltaY })
    await sleep(250)
    return this.finish(request, tab, said)
  }

  private async drag(request: BrowserRequest, signal: AbortSignal): Promise<Answer> {
    const { args, viewId } = request
    const tab = this.tabs.tabFor(viewId)
    const source = need(text(args, 'sourceRef'), 'sourceRef')
    const from = await this.aim(tab, source)
    const targetRef = text(args, 'targetRef')
    let to: { x: number; y: number }
    if (targetRef) to = await this.aim(tab, targetRef)
    else {
      const x = number(args, 'targetX')
      const y = number(args, 'targetY')
      if (x === undefined || y === undefined) throw new StepError('A drag needs targetRef, or targetX and targetY.')
      to = { x, y }
    }
    checkpoint(signal)
    const since = Date.now()
    await this.mouse(tab, 'mouseMoved', from.x, from.y)
    await this.mouse(tab, 'mousePressed', from.x, from.y, { button: 'left', buttons: 1, clickCount: 1 })
    for (let n = 1; n <= 10; n += 1) {
      await this.mouse(tab, 'mouseMoved', from.x + ((to.x - from.x) * n) / 10, from.y + ((to.y - from.y) * n) / 10, { button: 'left', buttons: 1 })
      await sleep(20)
    }
    await this.mouse(tab, 'mouseReleased', to.x, to.y, { button: 'left', buttons: 0, clickCount: 1 })
    await this.settle(viewId, tab, since)
    return this.finish(request, tab, `Dragged ${text(args, 'element') ?? source} to ${targetRef ?? `(${Math.round(to.x)}, ${Math.round(to.y)})`}.`)
  }

  private async devtools(request: BrowserRequest): Promise<Answer> {
    const { args, viewId } = request
    const method = need(text(args, 'method'), 'method')
    if (deniedPrefixes.some((prefix) => method.startsWith(prefix)) || deniedMethods.has(method))
      throw new StepError(
        `The DevTools command ${JSON.stringify(method)} is not allowed: the browser's own, the sign-ins, files, navigation and input commands are refused; use the browser tools instead.`,
      )
    const tab = this.tabs.tabFor(viewId)
    const params = typeof args.params === 'object' && args.params !== null && !Array.isArray(args.params) ? args.params : {}
    const result = await within(this.cdp(tab, method, params as JSONObject), helperTimeoutMs, `${method} didn't answer in ${helperTimeoutMs / 1_000} seconds.`)
    let serialized = JSON.stringify(result ?? {})
    if (serialized.length > cdpAnswerMax)
      serialized = `${serialized.slice(0, cdpAnswerMax)} …(${serialized.length - cdpAnswerMax} more characters)`
    return this.finish(request, tab, `Ran ${method}.`, serialized)
  }

  private async tabsStep(request: BrowserRequest): Promise<Answer> {
    const { args, viewId } = request
    const action = text(args, 'action') ?? 'list'
    const mine = this.tabs.groupTabs(viewId)
    const current = this.tabs.currentTab(viewId)
    const index = number(args, 'index')
    switch (action) {
      case 'list': {
        const listed = mine.map((tab, n) => ({ index: n, url: tab.contents.getURL(), title: tab.contents.getTitle(), current: tab === current }))
        return {
          ok: true,
          summary: `${listed.length} tab${listed.length === 1 ? '' : 's'} open.`,
          data: JSON.stringify(listed, null, 1),
          viewId,
        }
      }
      case 'new': {
        const tab = this.tabs.open(viewId)
        return this.finish(request, tab, `Opened a new tab (index ${this.tabs.groupTabs(viewId).length - 1}).`)
      }
      case 'select': {
        if (index === undefined) throw new StepError('index is required to select a tab.')
        const tab = mine[index]
        if (!tab) throw new StepError(`No tab at index ${index} (${mine.length} open).`)
        this.tabs.select(viewId, tab)
        return this.finish(request, tab, `Selected tab ${index}.`)
      }
      case 'close': {
        const tab = index === undefined ? current : mine[index]
        if (!tab) throw new StepError(index === undefined ? 'There is no tab to close.' : `No tab at index ${index} (${mine.length} open).`)
        this.tabs.close(tab)
        const now = this.tabs.currentTab(viewId)
        if (!now) return { ok: true, summary: 'Closed the tab; none is open now.', viewId }
        return this.finish(request, now, 'Closed the tab.')
      }
      default:
        throw new StepError('action must be one of list, new, close, select.')
    }
  }

  private async fullPage(request: BrowserRequest, tab: Tab): Promise<Answer> {
    const page = await this.helper<{ scrollY: number; width: number; height: number }>(tab, 'page')
    const width = Math.min(page.width, fullPageMaxSide)
    const height = Math.min(page.height, fullPageMaxSide)
    const top = Math.max(0, Math.min(page.scrollY, page.height - height))
    const shot = (await this.cdp(tab, 'Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip: { x: 0, y: top, width, height, scale: 1 },
    })) as { data?: string }
    let summary = 'Took a picture of the whole page.'
    if (page.width > fullPageMaxSide || page.height > fullPageMaxSide)
      summary = `The page is ${page.width}×${page.height} pixels; the picture shows ${height} of them, from ${top} to ${top + height}. Scroll and take another to see the rest.`
    return this.finish(request, tab, summary, undefined, shot.data)
  }

  // MARK: The parts of a step

  private cdp(tab: Tab, method: string, params: JSONObject = {}): Promise<unknown> {
    if (tab.contents.isDestroyed()) return Promise.reject(new StepError('The tab closed.'))
    return tab.contents.debugger.sendCommand(method, params)
  }

  private async helper<T>(tab: Tab, method: string, ...args: unknown[]): Promise<T> {
    if (tab.contents.isDestroyed()) throw new StepError('The tab closed.')
    // A tab that never showed a page (its first load stopped) is given an empty one: a script waits for a page.
    if (tab.contents.getURL() === '') await within(tab.contents.loadURL('about:blank'), 5_000, 'The tab could not be opened.').catch(() => undefined)
    const result = (await within(
      tab.contents.executeJavaScriptInIsolatedWorld(helperWorld, [{ code: helperCall(method, ...args) }]),
      helperTimeoutMs,
      "The page didn't answer (it may be busy); try the step again.",
    )) as { error?: unknown } | undefined
    if (result && typeof result === 'object' && typeof result.error === 'string') throw new StepError(result.error)
    return result as T
  }

  /** Where to click a ref: scrolled into view, and not behind something else (looked at twice). */
  private async aim(tab: Tab, ref: string, offsetX?: number, offsetY?: number): Promise<{ x: number; y: number }> {
    let point = await this.helper<{ x: number; y: number; covered?: string }>(tab, 'locate', ref, offsetX, offsetY)
    if (point.covered) {
      await sleep(300)
      point = await this.helper(tab, 'locate', ref, offsetX, offsetY)
    }
    if (point.covered)
      throw new StepError(`${ref} is behind ${point.covered}. Close or move that first, or take a fresh browser_snapshot.`)
    return point
  }

  private mouse(tab: Tab, type: string, x: number, y: number, extra: JSONObject = {}): Promise<unknown> {
    // A press is the click shown; its release leaves it so.
    if (type !== 'mouseReleased') this.point(tab, x, y, type === 'mousePressed' ? 'click' : type === 'mouseMoved' && extra.buttons === 1 ? 'drag' : type === 'mouseWheel' ? 'scroll' : 'move')
    return this.cdp(tab, 'Input.dispatchMouseEvent', { type, x: Math.round(x), y: Math.round(y), button: 'none', ...extra })
  }

  private point(tab: Tab, x: number, y: number, type: 'move' | 'click' | 'drag' | 'scroll'): void {
    this.options.pointer?.(tab.group, Math.round(x), Math.round(y), type)
  }

  private async click(tab: Tab, x: number, y: number, args: JSONObject): Promise<void> {
    const button = text(args, 'button') === 'right' || text(args, 'button') === 'middle' ? (text(args, 'button') as string) : 'left'
    const buttons = button === 'left' ? 1 : button === 'right' ? 2 : 4
    const modifiers = modifiersOf(args)
    const hold = Math.max(0, Math.min(5_000, number(args, 'holdDurationMs') ?? 0))
    const counts = args.doubleClick === true ? [1, 2] : [1]
    await this.mouse(tab, 'mouseMoved', x, y, { modifiers })
    for (const clickCount of counts) {
      await this.mouse(tab, 'mousePressed', x, y, { button, buttons, clickCount, modifiers })
      if (hold > 0) await sleep(hold)
      await this.mouse(tab, 'mouseReleased', x, y, { button, buttons: 0, clickCount, modifiers })
    }
  }

  private async press(tab: Tab, name: string): Promise<void> {
    const key = readKey(name)
    if (!key) throw new StepError(`${JSON.stringify(name)} isn't a key this browser knows; use a name like Enter, Tab, Escape or ArrowDown, or one character.`)
    await this.pressKey(tab, key)
  }

  private async pressKey(tab: Tab, key: NonNullable<ReturnType<typeof readKey>>): Promise<void> {
    const common = { key: key.key, code: key.code, windowsVirtualKeyCode: key.keyCode, nativeVirtualKeyCode: key.keyCode, modifiers: key.modifiers }
    await this.cdp(tab, 'Input.dispatchKeyEvent', key.text === undefined ? { type: 'rawKeyDown', ...common } : { type: 'keyDown', text: key.text, unmodifiedText: key.text, ...common })
    await this.cdp(tab, 'Input.dispatchKeyEvent', { type: 'keyUp', ...common })
  }

  /** After a click or a key: a moment for the page, and its load waited for when it started one (5 s at most). */
  private async settle(viewId: string, tab: Tab, since: number): Promise<void> {
    await sleep(300)
    const now = this.tabs.currentTab(viewId) ?? tab
    const started = Date.now()
    while (Date.now() - started < 5_000) {
      const navigating = now.navigatedAt >= since || tab.navigatedAt >= since
      if (!(navigating && (now.loading || tab.loading))) break
      await sleep(100)
    }
  }

  /** The answer: the sentence and what happened meanwhile, the page the agent is on now, and its picture when asked. */
  private async finish(request: BrowserRequest, tab: Tab, summary: string, data?: string, pictureB64?: string): Promise<Answer> {
    const now = this.tabs.currentTab(request.viewId) ?? tab
    const notes = [...tab.notes.splice(0), ...(now !== tab ? now.notes.splice(0) : [])]
    const answer: Answer = {
      ok: true,
      summary: [summary, ...notes].join(' '),
      url: now.contents.isDestroyed() ? '' : now.contents.getURL(),
      title: now.contents.isDestroyed() ? '' : now.contents.getTitle(),
      viewId: request.viewId,
      ...(data === undefined ? {} : { data }),
    }
    if (request.screenshot && !now.contents.isDestroyed()) {
      const picture = pictureB64 ?? (await within(now.contents.capturePage(), 8_000, 'timeout').then((image) => image.toPNG().toString('base64')).catch(() => undefined))
      if (picture) answer.screenshotB64 = picture
    }
    return answer
  }
}
