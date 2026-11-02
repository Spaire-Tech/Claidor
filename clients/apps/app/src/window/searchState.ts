// Search (⌘K, step 4d): the window's command palette, its state as the Mac
// keeps it (mac/Simeon/SearchPanel.swift's `SearchState`, `QFn`): what is
// typed, the tab, the row lit, whether ⌘ is held (the rows' ⌘1–⌘9 show),
// and what the person's computer answered: its messages and files for the
// words (asked 150 ms after the last key, the older answer kept until the
// new one comes), every routine, and whether its search, the agent network
// and the open chat's channels are on. Drawn by SearchPanel.tsx.
//
// The window's model says whether search is open (`searchOpen`: ⌘K, the
// sidebar's Search); this state follows it.

import {
  type Command,
  type Row,
  type Settled,
  type Status,
  commands,
  links,
  nextTab,
  ordered,
  results,
  settled,
  tabs,
  tokens,
} from '../core/jump'
import type { Agent } from '../core/models'
import {
  type FileHit,
  type MessageHit,
  type RoutineHit,
  type SearchTab,
  debounce,
} from '../core/search'
import type { AppStore } from '../core/store'
import { type WindowModel, windowActionIds } from './windowModel'

/** An Apple computer: its shortcuts take ⌘. */
const apple =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

/**
 * One list the computer answers for the words (`HostAnswer`, `_0t`): the
 * words its answer is for, the answer (kept while the next is on its way or
 * failed), where it stands, and the ask it is for.
 */
export interface HostAnswer<Hit> {
  answered: string
  results: Hit[]
  status: Status
  generation: number
}

function noAnswer<Hit>(): HostAnswer<Hit> {
  return { answered: '', results: [], status: 'empty', generation: 0 }
}

/** What is listed (`Listing`): the rows, the agents by id, the tabs shown, where the computer's answers stand, whether words are typed. */
export interface Listing {
  rows: Row[]
  agentsById: Map<string, Agent>
  tabs: SearchTab[]
  /** The tab shown: the one chosen, or All when it is not shown. */
  tab: SearchTab
  settled: Settled
  filtered: boolean
}

/**
 * The actions search offers now: those whose screens the window has, as
 * "/" (`windowActionIds`): Org Chart, Open Hidden Agents, Members, Channels,
 * Chat Settings, Update Simeon's Computer while it is offered. Settings,
 * Connectors and the themes come with their screens (step 6).
 */
export function offeredActions(list: readonly Command[]): Command[] {
  return list.filter((command) => windowActionIds.has(command.id))
}

/** A key as search reads it: the browser's `KeyboardEvent`, or a test's. */
export interface SearchKey {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
  isComposing?: boolean
}

export class SearchState {
  private listeners = new Set<() => void>()
  private version = 0

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getVersion = (): number => this.version

  private changed(): void {
    this.version += 1
    for (const listener of [...this.listeners]) listener()
  }

  isOpen = false
  query = ''
  tab: SearchTab = 'all'
  highlight = 0
  /** Bumped when the keys move the light, so the list brings that row into view (the pointer moving it does not). */
  keyMoves = 0
  modifierHeld = false
  /** Bumped to give the field the keys. */
  focus = 0

  globalSearch = true
  orgChart = false
  hasChannels = false
  messages: HostAnswer<MessageHit> = noAnswer()
  files: HostAnswer<FileHit> = noAnswer()
  routines: RoutineHit[] = []
  routinesStatus: Status = 'empty'

  constructor(
    private readonly store: AppStore,
    private readonly model: WindowModel,
    /** The agent whose chat the window shows. */
    private readonly current: () => string | undefined,
    private readonly sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms)),
  ) {}

  /** Opens and closes with the window's model (⌘K, the sidebar's Search); until the returned call. */
  follow(): () => void {
    const sync = () => {
      if (this.model.searchOpen && !this.isOpen) this.open()
      else if (!this.model.searchOpen && this.isOpen) this.close()
    }
    sync()
    return this.model.subscribe(sync)
  }

  /** ⌘K, the sidebar's Search: open, emptied, on All, the field taking the keys; then the gates read and the computer asked. */
  private open(): void {
    this.query = ''
    this.tab = 'all'
    this.highlight = 0
    this.modifierHeld = false
    this.isOpen = true
    this.focus += 1
    this.changed()
    const current = this.current()
    void (async () => {
      const [searchOn, networkOn, channelsOn] = await Promise.all([
        this.store.globalSearchEnabled(),
        this.store.agentNetworkEnabled(),
        current ? this.store.channelsAvailable(current) : false,
      ])
      if (!this.isOpen) return
      this.globalSearch = searchOn
      // The Org Chart row needs the network on and at least one agent (`GLn`).
      this.orgChart = networkOn && this.store.agents.length > 0
      this.hasChannels = channelsOn
      this.changed()
      if (!searchOn) return
      this.ask(this.query)
      this.routinesStatus = 'loading'
      this.changed()
      const all = await this.store.allRoutines()
      if (!this.isOpen) return
      this.routines = all
      this.routinesStatus = 'ready'
      this.changed()
    })()
  }

  /** Closed (Escape, ⌘K, a click outside, a row chosen): its answers go. Whether search, the agent network and the channels were on is kept for the next opening. */
  private close(): void {
    this.isOpen = false
    this.modifierHeld = false
    this.messages = noAnswer()
    this.files = noAnswer()
    this.routines = []
    this.routinesStatus = 'empty'
    this.changed()
  }

  /** The words changed: the light goes to the top and the computer is asked again. */
  type(query: string): void {
    this.query = query
    this.highlight = 0
    this.keyMoves += 1
    this.ask(query)
    this.changed()
  }

  /** Asks for messages (only for words) and files (also with none), 150 ms after the last key (`J0t`). */
  private ask(raw: string): void {
    if (!this.globalSearch) return
    const words = raw.trim()
    const messages = this.messages
    const files = this.files
    messages.generation += 1
    files.generation += 1
    const messageTurn = messages.generation
    const fileTurn = files.generation
    if (words === '') {
      messages.answered = ''
      messages.results = []
      messages.status = 'empty'
    } else {
      messages.status = 'loading'
    }
    files.status = 'loading'
    this.changed()
    void (async () => {
      await this.sleep(debounce * 1000)
      if (words !== '' && messages.generation === messageTurn) {
        try {
          const hits = await this.store.searchMessages(words)
          if (messages.generation === messageTurn) {
            messages.answered = words
            messages.results = hits
            messages.status = hits.length === 0 ? 'empty' : 'ready'
            this.changed()
          }
        } catch {
          if (messages.generation === messageTurn) {
            messages.status = 'failed'
            this.changed()
          }
        }
      }
      if (files.generation !== fileTurn) return
      try {
        const hits = await this.store.searchFiles(words)
        if (files.generation === fileTurn) {
          files.answered = words
          files.results = hits
          files.status = hits.length === 0 ? 'empty' : 'ready'
          this.changed()
        }
      } catch {
        if (files.generation === fileTurn) {
          files.status = 'failed'
          this.changed()
        }
      }
    })()
  }

  // MARK: What is listed

  /** The last listing, and what it was made from: made again only when search, the store or the open chat changes. */
  private listed?: { key: string; listing: Listing }

  /** The rows for the tab and the words (`listing`, `WFn`): the agents (pins first), the actions, and, with the computer's search on, its answers, the open chat's links and the routines. */
  listing(): Listing {
    const key = `${this.version}:${this.store.getVersion()}:${this.current() ?? ''}`
    if (this.listed?.key === key) return this.listed.listing
    const listing = this.makeListing()
    this.listed = { key, listing }
    return listing
  }

  private makeListing(): Listing {
    const store = this.store
    const visible = store.agents.filter((agent) => !agent.isHidden)
    const hidden = store.agents.filter((agent) => agent.isHidden)
    const byId = new Map<string, Agent>()
    for (const agent of store.agents)
      if (!byId.has(agent.id)) byId.set(agent.id, agent)
    const currentId = this.current()
    const offered = offeredActions(
      commands({
        orgChart: this.orgChart && store.agents.length > 0,
        hiddenCount: hidden.length,
        current: currentId ? store.agent(currentId) : undefined,
        hasChannels: this.hasChannels,
        // Usage & Billing and the themes come with Settings (step 6).
        usage: false,
        theme: 'system',
        computerUpdate: store.computerUpdateOffer !== undefined,
      }),
    )
    const shown = tabs(this.globalSearch)
    const tab = shown.includes(this.tab) ? this.tab : 'all'
    const words = this.query.trim()
    const global = this.globalSearch
    const rows = results({
      agents: ordered(visible, store.pinnedIds),
      hidden,
      commands: offered,
      messages: global
        ? this.messages.results.filter((hit) => byId.has(hit.agentId))
        : [],
      files: global
        ? this.files.results.filter((hit) => byId.has(hit.agentId))
        : [],
      messagesStale: this.messages.answered !== words,
      filesStale: this.files.answered !== words,
      links: global ? links(store.transcripts[currentId ?? ''] ?? []) : [],
      routines: global ? this.routines : [],
      tab,
      query: this.query,
    })
    const filtered = tokens(this.query).length > 0
    return {
      rows,
      agentsById: byId,
      tabs: shown,
      tab,
      settled: settled({
        tab,
        globalSearch: global,
        filtered,
        messages: this.messages.status,
        files: this.files.status,
        routines: this.routinesStatus,
      }),
      filtered,
    }
  }

  // MARK: Keys

  /**
   * A key while search is open (`key`, `Pe`): Escape closes; ↑ and ↓ move
   * the light (stopping at the ends); ← and → with nothing typed, and Tab
   * and ⇧Tab, change the tab round; ⌘1–⌘9 (or Control) open the first nine
   * rows; Return opens the lit one. ⌘F, the chat's find, waits under
   * search. True when the key was search's.
   */
  key(event: SearchKey, listing: Listing = this.listing()): boolean {
    if (event.isComposing) return false
    const none =
      !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
    const commandOnly =
      (apple
        ? event.metaKey && !event.ctrlKey
        : event.ctrlKey && !event.metaKey) &&
      !event.shiftKey &&
      !event.altKey
    const count = listing.rows.length
    const lit =
      count === 0 ? 0 : Math.min(Math.max(this.highlight, 0), count - 1)
    // ⌘F is the chat's find, not under search.
    if (commandOnly && event.key.toLowerCase() === 'f') return true
    // ⌘N, the window's New Agent, closes search for its sheet (`NewChatState.start`); a browser keeps it for a new window, Electron hands it over.
    if (commandOnly && event.key.toLowerCase() === 'n') {
      this.model.startNewChat()
      return true
    }
    switch (event.key) {
      case 'Escape':
        this.model.closeSearch()
        return true
      case 'ArrowDown':
      case 'ArrowUp':
        if (count === 0) return true
        this.highlight = Math.min(
          Math.max(lit + (event.key === 'ArrowDown' ? 1 : -1), 0),
          count - 1,
        )
        this.keyMoves += 1
        this.changed()
        return true
      case 'ArrowLeft':
      case 'ArrowRight':
        if (this.query !== '' || !none) break
        this.choose(
          nextTab(
            listing.tab,
            event.key === 'ArrowLeft' ? -1 : 1,
            listing.tabs,
          ),
        )
        return true
      case 'Tab':
        this.choose(nextTab(listing.tab, event.shiftKey ? -1 : 1, listing.tabs))
        return true
      case 'Enter':
        if (count > 0) this.activate(listing.rows[lit]!)
        return true
    }
    const onlyOne =
      event.metaKey !== event.ctrlKey && !event.shiftKey && !event.altKey
    if (onlyOne && /^[1-9]$/.test(event.key)) {
      const digit = Number(event.key)
      if (digit <= count) this.activate(listing.rows[digit - 1]!)
      return true
    }
    return false
  }

  /** ⌘ or Control held: the first nine rows show their shortcut (`flags`). */
  hold(held: boolean): void {
    if (held === this.modifierHeld) return
    this.modifierHeld = held
    this.changed()
  }

  /** A tab chosen: the light to its top. */
  choose(next: SearchTab): void {
    this.tab = next
    this.highlight = 0
    this.keyMoves += 1
    this.changed()
  }

  /** The pointer over a row lights it. */
  hover(index: number): void {
    if (this.highlight === index) return
    this.highlight = index
    this.changed()
  }

  /**
   * A row chosen (`activate`, `qe`), then search closes: an agent opens; an
   * action does what it says; a message or a file opens its chat at that
   * line, lit; a link opens in a new tab; a routine opens in its agent's
   * Routines.
   */
  activate(row: Row): void {
    const model = this.model
    switch (row.kind) {
      case 'agent':
        model.openChat(row.agent.id)
        break
      case 'command':
        model.runAction(row.command.id)
        break
      case 'message':
      case 'file':
        model.reveal(row.hit.entryId, row.hit.agentId)
        break
      case 'link':
        window.open(row.url, '_blank', 'noopener,noreferrer')
        break
      case 'routine':
        model.openRoutineFor(row.hit.routine.id, row.hit.agentId)
        break
    }
    model.closeSearch()
  }
}
