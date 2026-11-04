// The browser in the app, its tabs (docs/app-browser/README.md, step 2a).
//
// - One store of sign-ins for all of the person's agents (decision 2): the
//   partition `persist:simeon-browser`, apart from the app's own page.
// - Each tab is an offscreen Chromium window: drawn, read and clicked while
//   nothing shows it (measured 4 November 2026: a hidden window or view can't
//   be photographed, an offscreen one can). Step 2b shows its picture in the
//   Computer tab.
// - Each agent (its view) has its own tabs. A page's popup opens as a tab of
//   the same agent, its opener kept (a sign-in window reports back to it),
//   and becomes the agent's tab until it closes.
// - The page is driven over the DevTools protocol, its clicks and keys
//   trusted, as a person's.
// - Nothing of the app reaches these pages: no preload, no Node, sandboxed,
//   every permission refused, only http and https opened.
// - A dialog is answered at once (an alert taken, a confirm or prompt
//   dismissed, which is the safe answer) and the agent is told; a download
//   lands in Downloads\Simeon and the agent is told.

import { accessSync, mkdirSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { BrowserWindow, type Session, type WebContents, app, session as sessions } from 'electron'
import { ownsNavigation } from '../navigation'
import { Frames } from './frames'
import { chromeAgent, openable, zoneIdentifier } from './rules'

export const partition = 'persist:simeon-browser'

/** The size every tab is drawn at. */
export const viewport = { width: 1280, height: 800 } as const

/** At most this many tabs for one agent, and for all of them. */
const tabsPerAgent = 12
const tabsInAll = 40

export interface Tab {
  readonly id: string
  readonly window: BrowserWindow
  readonly contents: WebContents
  /** The agent's view the tab belongs to. */
  readonly group: string
  readonly opener?: string
  /** What happened since the agent last heard (a dialog, a download, a popup), said with the next answer. */
  notes: string[]
  /** When the page last started a navigation of its own document. */
  navigatedAt: number
  loading: boolean
  /** Its frames of other sites, each over its own DevTools session; the pointer goes through it (step 3c). */
  readonly frames: Frames
  /** The page's icon, as it names it (the checkout card's shop icon). */
  favicon?: string
}

export interface TabsOptions {
  /** Where downloads go: this PC's Downloads\Simeon. */
  downloads: string
  log(line: string): void
  /** Another partition for the tests. */
  partition?: string
}

export class Tabs {
  private readonly all = new Map<string, Tab>()
  /** The tab each agent's view acts on. */
  private readonly current = new Map<string, string>()
  private readonly listeners = new Set<(group: string) => void>()
  private next = 1
  readonly session: Session

  constructor(private readonly options: TabsOptions) {
    this.session = sessions.fromPartition(options.partition ?? partition)
    this.prepareSession()
  }

  private prepareSession(): void {
    const ses = this.session
    ses.setUserAgent(chromeAgent(app.userAgentFallback))
    ses.setPermissionRequestHandler((_contents, _permission, answer) => answer(false))
    ses.setPermissionCheckHandler(() => false)
    ses.on('will-download', (_event, item, contents) => {
      const tab = contents ? this.byContents(contents) : undefined
      const name = path.basename(item.getFilename()).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 180) || 'download'
      mkdirSync(this.options.downloads, { recursive: true })
      const target = uniquePath(this.options.downloads, name)
      item.setSavePath(target)
      item.once('done', (_done, state) => {
        // Marked as from the internet, as Chrome marks a download, so Windows still warns before such a program runs.
        if (state === 'completed' && process.platform === 'win32') void writeFile(`${target}:Zone.Identifier`, zoneIdentifier(item.getURL())).catch(() => {})
        if (!tab) return
        tab.notes.push(
          state === 'completed'
            ? `The page downloaded ${path.basename(target)} (${sizeOf(item.getReceivedBytes())}) to this PC's Downloads\\Simeon folder.`
            : `A download of ${name} did not finish (${state}).`,
        )
      })
    })
  }

  /** Told when an agent's tabs change: one opened, closed or chosen, a page loading, loaded, moved or renamed (the Computer tab's view, view.ts). */
  onChange(listener: (group: string) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private changed(group: string): void {
    for (const listener of [...this.listeners]) listener(group)
  }

  private byContents(contents: WebContents): Tab | undefined {
    for (const tab of this.all.values()) if (tab.contents === contents) return tab
    return undefined
  }

  /** The agent's tab, made on its first step. */
  tabFor(group: string): Tab {
    const id = this.current.get(group)
    const tab = id === undefined ? undefined : this.all.get(id)
    if (tab && !tab.contents.isDestroyed()) return tab
    return this.open(group)
  }

  /** The agents with tabs open (the quit's question, decision 3). */
  groups(): string[] {
    return [...new Set([...this.all.values()].filter((tab) => !tab.contents.isDestroyed()).map((tab) => tab.group))]
  }

  /** The agent's tabs, oldest first. */
  groupTabs(group: string): Tab[] {
    return [...this.all.values()].filter((tab) => tab.group === group && !tab.contents.isDestroyed())
  }

  currentTab(group: string): Tab | undefined {
    const id = this.current.get(group)
    return id === undefined ? undefined : this.all.get(id)
  }

  select(group: string, tab: Tab): void {
    this.current.set(group, tab.id)
    this.changed(group)
  }

  /** A new tab for the agent, which becomes its tab. */
  open(group: string, opener?: Tab): Tab {
    if (this.groupTabs(group).length >= tabsPerAgent) throw new Error(`An agent may have ${tabsPerAgent} tabs open; close one with browser_tabs first.`)
    if (this.all.size >= tabsInAll) throw new Error('The browser has too many tabs open; close some with browser_tabs first.')
    const window = new BrowserWindow({ show: false, ...viewport, webPreferences: this.webPreferences() })
    return this.adopt(group, window, opener)
  }

  private webPreferences(): Electron.WebPreferences {
    return {
      offscreen: true,
      partition: this.options.partition ?? partition,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      backgroundThrottling: false,
      spellcheck: false,
      webviewTag: false,
    }
  }

  private adopt(group: string, window: BrowserWindow, opener?: Tab): Tab {
    const contents = window.webContents
    const tab: Tab = {
      id: `t${this.next++}`,
      window,
      contents,
      group,
      ...(opener ? { opener: opener.id } : {}),
      notes: [],
      navigatedAt: 0,
      loading: false,
      frames: new Frames(contents),
    }
    this.all.set(tab.id, tab)
    this.current.set(group, tab.id)
    // The tab's navigation is ruled here, not by the app's rule for its own pages (which would send its links to the default browser).
    ownsNavigation(contents)
    window.setContentSize(viewport.width, viewport.height)
    contents.setFrameRate(10)
    contents.setAudioMuted(true)
    contents.on('did-start-navigation', (details) => {
      if (details.isMainFrame && !details.isSameDocument) tab.navigatedAt = Date.now()
    })
    contents.on('did-start-loading', () => {
      tab.loading = true
      this.changed(group)
    })
    contents.on('did-stop-loading', () => {
      tab.loading = false
      this.changed(group)
    })
    contents.on('did-navigate', () => this.changed(group))
    contents.on('did-navigate-in-page', () => this.changed(group))
    contents.on('page-title-updated', () => this.changed(group))
    contents.on('did-start-navigation', (details) => {
      if (details.isMainFrame && !details.isSameDocument) delete tab.favicon
    })
    contents.on('page-favicon-updated', (_event, favicons) => {
      // The icon the page names, before the site's default one.
      const web = favicons.filter((one) => /^https?:\/\//i.test(one))
      const icon = web.find((one) => !/\/favicon\.ico(?:[?#]|$)/i.test(one)) ?? web[0]
      if (icon) tab.favicon = icon.slice(0, 2_000)
    })
    contents.on('will-navigate', (event) => {
      if (!openable(event.url)) event.preventDefault()
    })
    contents.on('will-redirect', (event) => {
      if (!openable(event.url)) event.preventDefault()
    })
    // A popup is a tab of the same agent, its opener kept.
    contents.setWindowOpenHandler(({ url }) => {
      if (!openable(url) && url !== '' && url !== 'about:blank') return { action: 'deny' }
      if (this.groupTabs(group).length >= tabsPerAgent || this.all.size >= tabsInAll) return { action: 'deny' }
      return { action: 'allow', overrideBrowserWindowOptions: { show: false, ...viewport, webPreferences: this.webPreferences() } }
    })
    contents.on('did-create-window', (child) => {
      const popup = this.adopt(group, child, tab)
      tab.notes.push(`The page opened a new tab (${popup.id}); the next steps act on it, and browser_tabs select goes back.`)
    })
    contents.once('destroyed', () => this.forget(tab))
    window.once('closed', () => this.forget(tab))
    this.attach(tab)
    this.changed(group)
    return tab
  }

  private attach(tab: Tab): void {
    const devtools = tab.contents.debugger
    try {
      devtools.attach('1.3')
    } catch (error) {
      this.options.log(`[browser] the page's DevTools could not be reached: ${error instanceof Error ? error.message : String(error)}`)
      return
    }
    devtools.on('message', (_event, method, params) => {
      if (method !== 'Page.javascriptDialogOpening') return
      const kind = String(params?.type ?? 'alert')
      const message = String(params?.message ?? '').replace(/\s+/g, ' ').trim().slice(0, 300)
      const accept = kind === 'alert' || kind === 'beforeunload'
      void devtools.sendCommand('Page.handleJavaScriptDialog', { accept }).catch(() => {})
      tab.notes.push(
        accept
          ? `The page showed a message: ${JSON.stringify(message)} (OK was pressed).`
          : `The page asked ${JSON.stringify(message)} (a ${kind}); it was dismissed, the safe answer. If it must be accepted, the person can do it in Take Control.`,
      )
    })
    void devtools.sendCommand('Page.enable').catch(() => {})
    tab.frames.start()
    // An offscreen popup's page is 0×0 whatever its window's size (measured 4 November 2026): it is given its size
    // over DevTools once its page is up, and keeps it when it moves on. (Before a tab's first page, that crashes Electron.)
    if (tab.opener !== undefined)
      tab.contents.once('dom-ready', () => {
        void devtools
          .sendCommand('Emulation.setDeviceMetricsOverride', { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: false })
          .catch(() => {})
      })
  }

  private forget(tab: Tab): void {
    if (!this.all.delete(tab.id)) return
    this.changed(tab.group)
    if (this.current.get(tab.group) !== tab.id) return
    // The agent's tab closed: back to its opener, else its newest tab.
    const opener = tab.opener === undefined ? undefined : this.all.get(tab.opener)
    const fallback = opener ?? this.groupTabs(tab.group).at(-1)
    if (fallback) {
      this.current.set(tab.group, fallback.id)
      fallback.notes.push(`The tab ${tab.id} closed; the next steps act on ${fallback.id} again.`)
    } else this.current.delete(tab.group)
    this.changed(tab.group)
  }

  close(tab: Tab): void {
    if (!tab.window.isDestroyed()) tab.window.destroy()
    this.forget(tab)
  }

  /** Every tab closed (the app quitting, signed out). */
  closeAll(): void {
    for (const tab of [...this.all.values()]) this.close(tab)
    this.current.clear()
  }

  /** The agent's tabs as Auto-review reads them, and the one its steps act on. */
  reviewState(group: string): { pages: { id: string; url: string }[]; viewPageId?: string } {
    const pages = this.groupTabs(group).map((tab) => ({ id: tab.id, url: tab.contents.getURL() }))
    const current = this.current.get(group)
    return current === undefined ? { pages } : { pages, viewPageId: current }
  }
}

function sizeOf(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function uniquePath(folder: string, name: string): string {
  const extension = path.extname(name)
  const stem = name.slice(0, name.length - extension.length) || 'download'
  let candidate = path.join(folder, name)
  for (let n = 2; n < 1000; n += 1) {
    try {
      // A name already taken gets " (2)", " (3)"… as Windows does.
      accessSync(candidate)
      candidate = path.join(folder, `${stem} (${n})${extension}`)
    } catch {
      return candidate
    }
  }
  return path.join(folder, `${stem} (${Date.now()})${extension}`)
}
