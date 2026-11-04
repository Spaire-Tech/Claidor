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

/** Where a field is: the tab's page, or a frame of another site in it (its DevTools session, frames.ts). */
interface Place {
  readonly tab: Tab
  readonly sessionId?: string
}

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

/** A site as a card names it: its host, "www." aside, in lower case; nothing for a page that has none. */
function siteOf(address: string): string {
  const trimmed = address.trim()
  if (trimmed === '') return ''
  try {
    const url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return ''
    return url.hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return ''
  }
}

const fieldTypes = new Set(['text', 'email', 'tel', 'password', 'otp', 'number', 'date', 'select', 'textarea', 'checkbox'])

/** A card's fields as the engine sends them: an id, a type, and where it is (a ref, a selector, the words that label it). */
function formFields(raw: unknown): { id: string; type: string; target: { ref?: string; selector?: string; label?: string } }[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new StepError('The form names no field.')
  if (raw.length > 30) throw new StepError('The form has too many fields (30 at most).')
  return raw.map((one) => {
    const field = typeof one === 'object' && one !== null && !Array.isArray(one) ? (one as JSONObject) : {}
    const id = typeof field.id === 'string' && field.id.length > 0 && field.id.length <= 100 ? field.id : undefined
    if (id === undefined) throw new StepError('A field of the form has no id.')
    const target = typeof field.target === 'object' && field.target !== null && !Array.isArray(field.target) ? (field.target as JSONObject) : {}
    const short = (value: unknown, max: number) => (typeof value === 'string' && value.length > 0 && value.length <= max ? value : undefined)
    const ref = short(target.ref, 40)
    const selector = short(target.selector, 500)
    const label = short(target.label, 200)
    return {
      id,
      type: typeof field.type === 'string' && fieldTypes.has(field.type) ? field.type : 'text',
      target: { ...(ref ? { ref } : {}), ...(selector ? { selector } : {}), ...(label ? { label } : {}) },
    }
  })
}

/** The checkout's text is cut here (the card's total is looked for in it). */
const checkoutTextMax = 400_000

/** A card's fields, as the engine names them (`checkout-fill.ts`). */
const checkoutKinds = new Set(['card number', 'expiry', 'expiry month', 'expiry year', 'security code', 'name on card', 'billing ZIP'])

/** The card's fields in the order they are filled, each with the marks it is found by; a payment frame's own extra marks for its name and ZIP. */
function checkoutFields(raw: unknown): { kind: string; selector: string; frameOnly?: string }[] {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > checkoutKinds.size) throw new StepError('The checkout names no card fields.')
  return raw.map((one) => {
    const field = typeof one === 'object' && one !== null && !Array.isArray(one) ? (one as JSONObject) : {}
    const kind = typeof field.kind === 'string' && checkoutKinds.has(field.kind) ? field.kind : undefined
    const selector = typeof field.selector === 'string' && field.selector.length > 0 && field.selector.length <= 5_000 ? field.selector : undefined
    if (kind === undefined || selector === undefined) throw new StepError('A card field of the checkout has no kind or marks.')
    const frameOnly = typeof field.frameOnly === 'string' && field.frameOnly.length > 0 && field.frameOnly.length <= 2_000 ? field.frameOnly : undefined
    return { kind, selector, ...(frameOnly ? { frameOnly } : {}) }
  })
}

/** What each card field takes, a few spellings at most (a month as "04" or "4"). */
function checkoutValues(raw: unknown): Record<string, string[]> {
  const given = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as JSONObject) : {}
  const out: Record<string, string[]> = {}
  for (const kind of checkoutKinds) {
    const value = given[kind]
    out[kind] = Array.isArray(value) ? value.filter((one): one is string => typeof one === 'string' && one.length > 0 && one.length <= 200).slice(0, 3) : []
  }
  return out
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
      case 'form':
        return this.form(request, signal)
      case 'checkout':
        return this.checkout(request, signal)
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

  // MARK: The cards' fills (step 3b of docs/app-browser/README.md)

  /**
   * The in-chat form, 1Password, a saved login, a new password: what the
   * person gave is typed into the agent's tab on the site the card named,
   * key by key as a person types, into the fields the card points at (the
   * ref of the last snapshot, a selector, or the words that label it). The
   * answer says which fields went in, never what; nothing of the values is
   * kept or logged. `check` and `locate` only look for the fields.
   */
  private async form(request: BrowserRequest, signal: AbortSignal): Promise<Answer> {
    const { args, viewId } = request
    const action = text(args, 'action')
    if (!['check', 'locate', 'fill', 'newPassword'].includes(action ?? '')) throw new StepError('action must be one of check, locate, fill, newPassword.')
    const domain = siteOf(text(args, 'domain') ?? '')
    if (domain === '') throw new StepError("The form needs the site's domain, as the browser bar shows it.")
    const current = this.tabs.currentTab(viewId)
    const onSite = [current, ...this.tabs.groupTabs(viewId).filter((tab) => tab !== current)].filter(
      (tab): tab is Tab => tab !== undefined && !tab.contents.isDestroyed() && siteOf(tab.contents.getURL()) === domain,
    )
    if (onSite.length === 0) throw new StepError(`No tab on ${domain} is open in the browser on this PC. Open the page first (OpenPage, or the browser helper), then ask again.`)
    const delay = Math.max(0, Math.min(200, number(args, 'keyDelayMs') ?? 25))
    const looked: Place[] = []
    try {
      if (action === 'newPassword') {
        const tab = onSite[0] as Tab
        const value = typeof args.value === 'string' ? args.value : ''
        let filled = 0
        let failed = 0
        let seen = 0
        // The page's own new-password fields, then a frame of another site's (a sign-up held in one): three at most.
        for (const place of this.places(tab)) {
          if (seen >= 3 || value.length === 0) break
          looked.push(place)
          const { count } = await this.helperIn<{ count: number }>(place, 'passwordFields').catch((error: unknown) => {
            if (place.sessionId === undefined) throw error
            return { count: 0 }
          })
          for (let index = 0; index < count && seen < 3; index += 1, seen += 1) {
            if (await this.fillField(place, `password:${index}`, 'password', value, delay, signal)) filled += 1
            else failed += 1
          }
        }
        return { ok: true, summary: `Typed a new password on ${domain}.`, data: JSON.stringify({ page: domain, filled, failed }) }
      }
      const fields = formFields(args.fields)
      // The tab whose fields are all there (the most of them, else): a sign-in may be open twice. A field may be in a frame of another site.
      let best: { tab: Tab; at: Map<string, Place>; missing: string[] } | undefined
      for (const tab of onSite) {
        const at = new Map<string, Place>()
        for (const place of this.places(tab)) {
          const left = fields.filter((field) => !at.has(field.id))
          if (left.length === 0) break
          looked.push(place)
          const located = await this.helperIn<{ found: string[] }>(place, 'formFind', left).catch((error: unknown) => {
            if (place.sessionId === undefined) throw error
            return { found: [] as string[] }
          })
          for (const id of located.found) at.set(id, place)
        }
        const missing = fields.filter((field) => !at.has(field.id)).map((field) => field.id)
        if (best === undefined || missing.length < best.missing.length) best = { tab, at, missing }
        if (missing.length === 0) break
      }
      const chosen = best as { tab: Tab; at: Map<string, Place>; missing: string[] }
      if (action === 'check') return { ok: true, summary: `Looked for the form's fields on ${domain}.`, data: JSON.stringify({ page: domain, missing: chosen.missing }) }
      const found = fields.filter((field) => chosen.at.has(field.id)).map((field) => field.id)
      if (action === 'locate') return { ok: true, summary: `Looked for the fields on ${domain}.`, data: JSON.stringify({ page: domain, found }) }
      const values = typeof args.values === 'object' && args.values !== null && !Array.isArray(args.values) ? (args.values as JSONObject) : {}
      const missingAs = text(args, 'missingAs') === 'notFound' ? 'notFound' : 'fillFailed'
      const outcomes: Record<string, string> = {}
      for (const field of fields) {
        checkpoint(signal)
        const value = typeof values[field.id] === 'string' ? (values[field.id] as string) : ''
        const place = chosen.at.get(field.id)
        if (value.length === 0) outcomes[field.id] = 'notFilled'
        else if (!place) outcomes[field.id] = missingAs
        else outcomes[field.id] = (await this.fillField(place, `form:${field.id}`, field.type, value, delay, signal)) ? 'filled' : 'fillFailed'
      }
      // Enter only for one field that went in (a one-time code); nothing else is ever sent.
      let submitted = false
      const only = fields[0]
      const onlyPlace = only === undefined ? undefined : chosen.at.get(only.id)
      if (args.submitAfterFill === true && fields.length === 1 && only !== undefined && onlyPlace !== undefined && outcomes[only.id] === 'filled') {
        submitted = await this.helperIn(onlyPlace, 'focus', `form:${only.id}`, false)
          .then(() => this.press(chosen.tab, 'Enter'))
          .then(() => true, () => false)
        await this.settle(viewId, chosen.tab, Date.now())
      }
      return { ok: true, summary: `Filled the form on ${domain}.`, data: JSON.stringify({ page: domain, outcomes, submitted }) }
    } finally {
      await Promise.all(looked.map((place) => this.helperIn(place, 'formForget').catch(() => undefined)))
    }
  }

  /** The tab's page, then each frame of another site in it, outer ones first. */
  private places(tab: Tab): Place[] {
    return [{ tab }, ...tab.frames.list().map((sessionId) => ({ tab, sessionId }))]
  }

  /** One field: ticked, chosen, set (a date field), or typed key by key; whether it holds what was asked. A failure is false, a stopped step stops. */
  private async fillField(place: Place, ref: string, type: string, value: string, delay: number, signal: AbortSignal): Promise<boolean> {
    const { tab } = place
    try {
      const kind = await this.helperIn<{ tag: string; inputType: string; role: string }>(place, 'fieldKind', ref)
      if (type === 'checkbox') {
        const wanted = /^(true|yes|on|1|checked)$/i.test(value.trim())
        if (kind.tag === 'INPUT') await this.helperIn(place, 'fill', ref, wanted ? 'true' : 'false')
        else if ((await this.helperIn<{ checked?: boolean }>(place, 'holds', ref)).checked !== wanted) {
          const point = await this.aimIn(place, ref)
          await this.click(tab, point.x, point.y, {})
        }
        return (await this.helperIn<{ checked?: boolean }>(place, 'holds', ref)).checked === wanted
      }
      if (type === 'select') {
        if (kind.tag !== 'SELECT') return false
        await this.helperIn(place, 'choose', ref, [value])
        return (await this.helperIn<{ holds: boolean }>(place, 'holds', ref)).holds
      }
      if (type === 'date' && kind.inputType === 'date') {
        await this.helperIn(place, 'fill', ref, value)
        return (await this.helperIn<{ holds: boolean }>(place, 'holds', ref)).holds
      }
      let focus = await this.helperIn<{ focused: boolean }>(place, 'focus', ref, true)
      if (!focus.focused) {
        const point = await this.aimIn(place, ref)
        await this.click(tab, point.x, point.y, {})
        focus = await this.helperIn(place, 'focus', ref, true)
      }
      if (!focus.focused) return false
      // What was there goes (the focus selected it), then each key as a person presses it; the keys reach the frame that has the focus.
      await this.press(tab, 'Backspace')
      for (const character of value) {
        checkpoint(signal)
        const key = readKey(character)
        if (key?.text !== undefined && key.code !== '') await this.pressKey(tab, key)
        else await this.cdp(tab, 'Input.insertText', { text: character })
        if (delay > 0) await sleep(delay)
      }
      return (await this.helperIn<{ holds: boolean }>(place, 'holds', ref)).holds
    } catch (error) {
      if (error instanceof Stopped) throw error
      return false
    }
  }

  // MARK: The checkout (step 3c of docs/app-browser/README.md)

  /**
   * The checkout card's reads and fills, in the agent's tab on the shop's
   * site, as the computer's are (`checkout-fill.ts` in the engine): what the
   * page says (the card's total is checked against it), its picture, Link's
   * one-time card typed into the card fields (in the page, or in a payment
   * provider's frame of another site; the engine sends the fields' marks),
   * or Link's pay token put into Link's own block. The card is typed key by
   * key and never kept, logged or sent back: the answer says which fields
   * went in. The Pay button is left to the agent.
   */
  private async checkout(request: BrowserRequest, signal: AbortSignal): Promise<Answer> {
    const { args, viewId } = request
    const action = text(args, 'action')
    if (!['read', 'picture', 'fill', 'token'].includes(action ?? '')) throw new StepError('action must be one of read, picture, fill, token.')
    const hint = (text(args, 'pageHint') ?? '').trim().slice(0, 2_000)
    const site = siteOf(hint)
    const address = (tab: Tab) => tab.contents.getURL()
    const current = this.tabs.currentTab(viewId)
    const mine = [current, ...this.tabs.groupTabs(viewId).filter((tab) => tab !== current)].filter(
      (tab): tab is Tab => tab !== undefined && !tab.contents.isDestroyed() && openable(address(tab)),
    )
    // The tab whose address holds the agent's words, else one on that site or under it (shop.example.com, checkout.shop.example.com).
    const byAddress = hint === '' ? [] : mine.filter((tab) => address(tab).includes(hint))
    const bySite = site === '' ? [] : mine.filter((tab) => !byAddress.includes(tab) && (siteOf(address(tab)) === site || siteOf(address(tab)).endsWith(`.${site}`)))
    const pageOf = (tab: Tab | undefined) => (tab === undefined ? site : siteOf(address(tab)))
    if (action === 'read' || action === 'picture') {
      const showing = [...byAddress, ...bySite].slice(0, 2)
      if (showing.length === 0) throw new StepError(`No tab on ${site || 'the checkout'} is open in the browser on this PC.`)
      for (const tab of showing) {
        checkpoint(signal)
        if (action === 'read') {
          const { text: words } = await this.helper<{ text: string }>(tab, 'pageText').catch(() => ({ text: '' }))
          if (words.trim().length > 0) return { ok: true, summary: `Read the checkout on ${pageOf(tab)}.`, data: JSON.stringify({ page: pageOf(tab), text: words.slice(0, checkoutTextMax) }) }
          continue
        }
        const jpeg = await within(tab.contents.capturePage(), 8_000, 'timeout')
          .then((image) => (image.isEmpty() ? undefined : image.toJPEG(70).toString('base64')))
          .catch(() => undefined)
        if (jpeg) return { ok: true, summary: `Took the checkout's picture on ${pageOf(tab)}.`, data: JSON.stringify({ page: pageOf(tab), jpegB64: jpeg, ...(tab.favicon ? { iconUrl: tab.favicon } : {}) }) }
      }
      throw new StepError(`The tab on ${pageOf(showing[0])} didn't answer.`)
    }
    if (mine.length === 0) throw new StepError('No tab is open in the browser on this PC. Open the checkout page first.')
    const hinted = hint === '' ? mine : byAddress.length > 0 ? byAddress : bySite
    const candidates = hinted.length > 0 ? hinted : mine
    const looked: Place[] = []
    try {
      if (action === 'token') {
        const token = need(text(args, 'token'), 'token')
        for (const tab of candidates) {
          for (const place of this.places(tab)) {
            const { set } = await this.helperIn<{ set: boolean }>(place, 'linkToken', token).catch(() => ({ set: false }))
            if (set) return { ok: true, summary: `Put Link's pay token into the checkout on ${pageOf(tab)}.`, data: JSON.stringify({ page: pageOf(tab), found: true }) }
          }
        }
        return { ok: true, summary: "Link's block isn't on the checkout.", data: JSON.stringify({ page: pageOf(hinted[0]), found: false }) }
      }
      const fields = checkoutFields(args.fields)
      const values = checkoutValues(args.values)
      const expiryLong = text(args, 'expiryLong')
      const delay = Math.max(0, Math.min(200, number(args, 'keyDelayMs') ?? 35))
      const cardNumber = fields.find((field) => field.kind === 'card number')
      if (cardNumber === undefined) throw new StepError('The checkout names no card number field.')
      const findIn = async (place: Place, id: string, selector: string): Promise<boolean> => {
        if (!looked.includes(place)) looked.push(place)
        const located = await this.helperIn<{ found: string[] }>(place, 'formFind', [{ id, type: 'text', target: { selector } }]).catch(() => ({ found: [] as string[] }))
        return located.found.length > 0
      }
      // The first tab with a card number field, in the page or in a frame of another site.
      let tab: Tab | undefined
      let places: Place[] = []
      for (const candidate of candidates) {
        places = this.places(candidate)
        for (const place of places) {
          if (await findIn(place, 'probe', cardNumber.selector)) {
            tab = candidate
            break
          }
        }
        if (tab) break
      }
      if (tab === undefined) return { ok: true, summary: 'No card fields.', data: JSON.stringify({ page: pageOf(hinted[0]), hinted: hinted.length > 0, found: false }) }
      // In front, as the computer brings the checkout's tab to the front.
      this.tabs.select(viewId, tab)
      const filled = new Set<string>()
      const numberIn = new Set<string>()
      for (const place of places) {
        for (const field of fields) {
          checkpoint(signal)
          const { kind } = field
          const options = values[kind] ?? []
          if (filled.has(kind) || options.length === 0) continue
          if ((kind === 'expiry month' || kind === 'expiry year') && filled.has('expiry')) continue
          let found = await findIn(place, kind, field.selector)
          // A payment frame's own name and ZIP, beside the card number in that frame.
          if (!found && field.frameOnly !== undefined && place.sessionId !== undefined && (numberIn.has(place.sessionId) || (await findIn(place, 'probe', cardNumber.selector))))
            found = await findIn(place, kind, field.frameOnly)
          if (!found) continue
          const ref = `form:${kind}`
          const shape = await this.helperIn<{ tag: string; yyyy?: boolean }>(place, 'fieldKind', ref).catch(() => undefined)
          if (shape === undefined) continue
          const wanted = kind === 'expiry' && shape.yyyy === true && expiryLong !== undefined ? [expiryLong] : options
          let done = false
          if ((kind === 'expiry month' || kind === 'expiry year') && shape.tag === 'SELECT') {
            for (const option of wanted) {
              if (await this.helperIn(place, 'choose', ref, [option]).then(() => true, () => false)) {
                done = true
                break
              }
            }
          } else done = await this.fillField(place, ref, 'text', wanted[0] ?? '', delay, signal)
          if (!done) continue
          filled.add(kind)
          if (kind === 'card number' && place.sessionId !== undefined) numberIn.add(place.sessionId)
        }
      }
      return { ok: true, summary: `Typed the card into the checkout on ${pageOf(tab)}.`, data: JSON.stringify({ page: pageOf(tab), hinted: hinted.length > 0, found: true, filled: [...filled] }) }
    } finally {
      await Promise.all(looked.map((place) => this.helperIn(place, 'formForget').catch(() => undefined)))
    }
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
    if (tab.contents.isDestroyed()) return Promise.reject(new StepError('The tab closed.'))
    // To the frame under the point, another site's too (frames.ts, step 3c).
    return tab.frames.pointer({ type, x: Math.round(x), y: Math.round(y), button: 'none', ...extra })
  }

  /** A helper call where a field is: the tab's page, or a frame of another site in it. */
  private async helperIn<T>(place: Place, method: string, ...args: unknown[]): Promise<T> {
    if (place.sessionId === undefined) return this.helper<T>(place.tab, method, ...args)
    if (place.tab.contents.isDestroyed()) throw new StepError('The tab closed.')
    const result = (await within(
      place.tab.frames.evaluate(place.sessionId, helperCall(method, ...args)),
      helperTimeoutMs,
      "The page didn't answer (it may be busy); try the step again.",
    )) as { error?: unknown } | undefined
    if (result && typeof result === 'object' && typeof result.error === 'string') throw new StepError(result.error)
    return result as T
  }

  /** Where to click a ref, on the page: in a frame of another site, scrolled into view and not behind anything of the page around it. */
  private async aimIn(place: Place, ref: string): Promise<{ x: number; y: number }> {
    const { tab, sessionId } = place
    if (sessionId === undefined) return this.aim(tab, ref)
    await tab.frames.reveal(sessionId)
    let point = await this.helperIn<{ x: number; y: number; covered?: string }>(place, 'locate', ref)
    if (point.covered) {
      await sleep(300)
      point = await this.helperIn(place, 'locate', ref)
    }
    if (point.covered) throw new StepError(`${ref} is behind ${point.covered}.`)
    const offset = await tab.frames.offsetOf(sessionId)
    if (!offset) throw new StepError(`The frame holding ${ref} isn't shown.`)
    const x = point.x + offset.x
    const y = point.y + offset.y
    if (x < 0 || y < 0 || x > viewport.width || y > viewport.height) throw new StepError(`${ref} is past the edge of the window.`)
    if ((await tab.frames.frameAt(x, y)) !== sessionId) throw new StepError(`${ref} is behind something else on the page.`)
    return { x, y }
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
