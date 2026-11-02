// The window's own state, as the Mac keeps it beside the store
// (mac/Simeon/MainWindow.swift's `WindowState`, AgentPane.swift's
// `PaneState`, SearchPanel.swift's `SearchState`, NewChatPane.swift's
// `NewChatState.newAgent`): the agent asked for, the agent's pane (open or
// closed, its width and its page, kept in this browser under the Mac's
// names), and what stands in the chat's place or over the window (the org
// chart, search, New Agent, the hidden agents). One model for the window,
// shared through `WindowContext`; the screens read it with `useWindow()`.

import { createContext, useContext } from 'react'
import type { OpenFlight } from '../core/flightCards'
import { chatMinimum } from './sidebarLayout'

export type { OpenFlight }

/** The pane's pages: Profile, Routines, Computer (a group's members) and Channels (no tab of its own). */
export type PaneSection = 'profile' | 'routines' | 'computer' | 'channels'

/** The pane's widths (`PaneState`): 480 at first, 280 at its narrowest and 480 at its widest. */
export const paneDefaultWidth = 480
export const paneNarrowest = 280
export const paneWidest = 480
/** Dragged narrower than this, it closes when let go (`k3n`). */
export const paneCloseBelow = 244
/** It stays drawn 240 ms after closing, while it slides shut (`T3n`). */
export const paneLinger = 240

/**
 * The sidebar's fold as the pane sees it (`SidebarLayout`): opening the
 * pane folds an open sidebar to its rail, and closing it opens the sidebar
 * again if opening folded it. Given by the window (App.tsx).
 */
export interface PaneLayout {
  isCollapsed(): boolean
  setCollapsed(collapsed: boolean): void
}

/** A line search found (step 4d): its chat, the line, and a count that makes each one new. */
export interface Reveal {
  agentId: string
  entryId: string
  count: number
}

/** A routine's editor, while it is open (step 4c): the routine, or none for New Routine. */
export interface RoutineEditing {
  agentId: string
  routineId?: string
}

/** The full computer view (step 5b, MainWindow.swift's `ComputerOpen`): whose computer, and the helper's screen asked for. */
export interface ComputerOpen {
  agentId: string
  helper?: string
}

/** A computer question the person asked (step 5c, ComputerStates.swift's `ComputerAsk`): ⌘K or "/" Update Simeon's Computer, the sidebar's or "Couldn't Reach"'s Recover. */
export type ComputerAsk =
  | { kind: 'update' }
  | { kind: 'recover'; fromSidebar: boolean }

/**
 * What covers the chat and its field (step 5d, MessageActions.swift's
 * `callOpen` and `exchangePeer`): a call's lines, opened from its "Voice
 * chat" line, or two agents' messages to each other, opened from their
 * chip. It goes when another agent opens.
 */
export type ChatCover =
  | { kind: 'call'; agentId: string; lineId: string }
  | { kind: 'exchange'; agentId: string; peerId: string }

const openKey = 'simeon.pane.open'
const widthKey = 'simeon.pane.width'
const tookKey = 'simeon.pane.tookSidebar'

function readKept(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function keep(key: string, value: string | undefined): void {
  try {
    if (value === undefined) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // A private window, or storage refused: kept for this visit only.
  }
}

function keptWidth(): number {
  const saved = Number(readKept(widthKey))
  return Number.isFinite(saved) && saved > 0
    ? Math.min(Math.max(saved, paneNarrowest), paneWidest)
    : paneDefaultWidth
}

/**
 * Whether the pane fits beside the sidebar as it stands and the chat's 424
 * (`PaneState.fits`): the sidebar's width, the chat's least and the pane.
 */
export function paneFits(
  windowWidth: number,
  sidebarWidth: number,
  paneWidth: number,
): boolean {
  return windowWidth >= sidebarWidth + chatMinimum + paneWidth
}

/** The app's actions ("/", ⌘K) the window runs itself (`runAction`). */
export const windowActionIds: ReadonlySet<string> = new Set([
  'org-chart',
  'view:org-chart',
  'info:channels',
  'info:settings',
  'info:members',
  'open-hidden-chats',
])

export class WindowModel {
  private listeners = new Set<() => void>()
  private version = 0

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getVersion = (): number => this.version

  private changed(): void {
    this.version += 1
    for (const listener of this.listeners) listener()
  }

  // MARK: The window (`WindowState`)

  /** The agent asked for (the sidebar, search, a card); the window shows it while the roster has it. */
  selected?: string
  /** The org chart in the chat's place (step 4e). */
  orgChart = false
  /** Search (⌘K) over the window (step 4d). */
  searchOpen = false
  /** New Agent's sheet (⌘N, the sidebar's compose button), while group chats are off (step 4e). */
  newAgent = false
  /** The Hidden Agents sheet (the sidebar's foot, ⌘K and "/"). */
  hiddenAgents = false
  /** A message or file found by search, its chat to open at that line, lit (`pendingReveal`, step 4d); the count makes each one new. */
  pendingReveal?: Reveal
  /** The sidebar's picked rows to let go, this agent's row the anchor (`sidebar.selection.plain`), asked by search and the org chart; the count makes each one new. */
  sidebarPlain?: { agentId: string; count: number }

  constructor(selected?: string) {
    this.selected = selected
  }

  /** Search's message or file (`reveal`): its chat opens as an agent chosen does (`open(agentId)`), the chart giving way to it, and goes to the line. */
  reveal(entryId: string, agentId: string): void {
    this.pendingReveal = {
      agentId,
      entryId,
      count: (this.pendingReveal?.count ?? 0) + 1,
    }
    const shown = this.selected === agentId && !this.orgChart
    this.choose(agentId)
    // Already shown: choose has nothing to do, but the line is new.
    if (shown) this.changed()
  }

  /** The chat has taken the line it was asked to show. */
  revealTaken(reveal: Reveal): void {
    if (this.pendingReveal !== reveal) return
    this.pendingReveal = undefined
    this.changed()
  }

  /**
   * An agent opened from search or the org chart (SearchPanel.swift's
   * `activate`, OrgChart.swift's `openChat`): the rows picked in the sidebar
   * let go, this one the anchor, then its chat.
   */
  openChat(agentId: string): void {
    this.sidebarPlain = {
      agentId,
      count: (this.sidebarPlain?.count ?? 0) + 1,
    }
    this.orgChart = false
    this.computer = undefined
    this.selected = agentId
    this.changed()
  }

  /** An agent opened (`WindowState.choose`): the org chart and the computer close (`Fzn`). The pane follows it in `agentChanged`, once the window shows it. */
  choose(agentId: string): void {
    if (this.selected === agentId && !this.orgChart && !this.computer) return
    this.orgChart = false
    this.computer = undefined
    this.selected = agentId
    this.changed()
  }

  /** ⌘K: open, or close when open (`SearchState.toggle`). */
  toggleSearch(): void {
    if (this.searchOpen) this.closeSearch()
    else this.openSearch()
  }

  openSearch(): void {
    if (this.searchOpen) return
    this.searchOpen = true
    this.changed()
  }

  closeSearch(): void {
    if (!this.searchOpen) return
    this.searchOpen = false
    this.changed()
  }

  /**
   * ⌘N and the sidebar's compose button (`NewChatState.start`): New Agent's
   * sheet at once while group chats are off (`Features.groupChats`, as on
   * the Mac and the iPhone); search closes for it.
   */
  startNewChat(): void {
    this.searchOpen = false
    this.newAgent = true
    this.changed()
  }

  closeNewAgent(): void {
    if (!this.newAgent) return
    this.newAgent = false
    this.changed()
  }

  /** The org chart in the chat's place ("/", ⌘K's Org Chart). */
  showOrgChart(): void {
    if (this.orgChart) return
    this.orgChart = true
    this.changed()
  }

  closeOrgChart(): void {
    if (!this.orgChart) return
    this.orgChart = false
    this.changed()
  }

  showHiddenAgents(show = true): void {
    if (this.hiddenAgents === show) return
    this.hiddenAgents = show
    this.changed()
  }

  /**
   * One of the app's actions, from "/" (Composer.swift's `run`) or ⌘K:
   * the org chart in the chat's place, the pane on Channels, Profile
   * (Chat Settings) or a group's members, the hidden agents. The Settings
   * pages, Connectors and the themes come with their screens (step 6).
   * Whether it was one the window runs.
   */
  runAction(id: string): boolean {
    switch (id) {
      case 'org-chart':
      case 'view:org-chart':
        this.showOrgChart()
        return true
      case 'info:channels':
        this.openPane('channels')
        return true
      case 'info:settings':
        this.openPane('profile')
        return true
      case 'info:members':
        this.openPane('computer')
        return true
      case 'open-hidden-chats':
        this.showHiddenAgents()
        return true
      default:
        return false
    }
  }

  // MARK: The agent's pane (`PaneState`)

  /** Open or closed, kept from one visit to the next (`simeon.pane.open`). */
  paneOpen = readKept(openKey) === 'true'
  /** Its width, 280 to 480, kept (`simeon.pane.width`). */
  paneWidth = keptWidth()
  section: PaneSection = 'profile'
  /** Its page is drawn: false 240 ms after closing, so the next opening starts on Profile. */
  contentAlive = this.paneOpen
  /** Drawn at all now (open, with room for it): told by the window. */
  paneVisible = false
  /** While the edge is dragged: the width shown, and whether letting go closes it. */
  dragWidth?: number
  dragCloses = false
  /** A flight's details, in place of its agent's page; they go when the pane is closed (step 3d). */
  flight?: OpenFlight
  /** The avatar editor, for this agent, while it is open (step 4b). */
  avatarEditorFor?: string
  /** A routine's editor, taking the whole page (step 4c). Leaving Routines closes it. */
  routineEditor?: RoutineEditing
  /** A routine's chip in the chat asked for its editor: opened when the agent's list has it (`W2n`). */
  routineRequest?: string
  /** The sidebar the pane folds and opens again, given by the window. */
  private layout?: PaneLayout

  setLayout(layout: PaneLayout | undefined): void {
    this.layout = layout
  }

  /** Whether opening folded the sidebar, so closing opens it again (`simeon.pane.tookSidebar`). */
  private tookSidebar = readKept(tookKey) === 'true'
  /** The width when the drag started: a plain click on the edge changes nothing. */
  private dragStart?: number
  /** A page asked for another agent (Edit Profile), applied when that agent opens. */
  private request?: { agentId: string; section: PaneSection }
  private lingering?: ReturnType<typeof setTimeout>

  private setPaneOpen(open: boolean): void {
    this.paneOpen = open
    keep(openKey, open ? 'true' : 'false')
  }

  private setTook(took: boolean): void {
    this.tookSidebar = took
    keep(tookKey, took ? 'true' : undefined)
  }

  /** The page shown: leaving Routines closes a routine's editor. */
  setSection(section: PaneSection): void {
    if (this.section === section) return
    this.section = section
    if (section !== 'routines') this.routineEditor = undefined
    // A page of the pane closes the org chart (MainWindow.swift's `followingNewChat`).
    if (this.paneOpen) this.orgChart = false
    this.changed()
  }

  /** Opens on `section` (the openers' `I` and `A`): an open sidebar folds. A browser can't grow its window for it. */
  openPane(section: PaneSection = 'profile'): void {
    this.cancelLinger()
    // A closed pane forgot its flight; an open one keeps showing it while the page under it changes.
    if (!this.paneOpen) this.flight = undefined
    this.section = section
    if (section !== 'routines') this.routineEditor = undefined
    this.contentAlive = true
    this.orgChart = false
    if (!this.paneOpen) this.show()
    this.changed()
  }

  /** Open (`setInfoPaneOpen(true)`): an open sidebar folds to its rail, and closing will open it again. */
  private show(): void {
    const layout = this.layout
    if (layout && !layout.isCollapsed()) {
      this.setTook(true)
      layout.setCollapsed(true)
    } else {
      this.setTook(false)
    }
    this.setPaneOpen(true)
  }

  /** Close (×, Escape, the head's buttons): the sidebar opens again if the pane folded it; the page goes 240 ms later. */
  closePane(): void {
    this.avatarEditorFor = undefined
    if (!this.paneOpen) {
      this.changed()
      return
    }
    this.setPaneOpen(false)
    if (this.tookSidebar && this.layout?.isCollapsed())
      this.layout.setCollapsed(false)
    this.setTook(false)
    this.cancelLinger()
    this.lingering = setTimeout(() => {
      this.lingering = undefined
      if (this.paneOpen) return
      this.contentAlive = false
      this.section = 'profile'
      this.routineEditor = undefined
      // Kept while it slid shut.
      this.flight = undefined
      this.changed()
    }, paneLinger)
    this.changed()
  }

  private cancelLinger(): void {
    if (this.lingering === undefined) return
    clearTimeout(this.lingering)
    this.lingering = undefined
  }

  /** The head's picture and name, ⌘⇧, (`toggleAgentSettingsAction`): shown, it closes, whatever page; else Profile. */
  toggleSettings(): void {
    if (this.paneVisible) this.closePane()
    else this.openPane('profile')
  }

  /** ⌘⇧I, ⌥⌘B and a thread's "View conversation details" (`sand.toggleInfo`): open, it closes (even while hidden for width); else the page it shows. */
  toggleDetails(): void {
    if (this.paneOpen) this.closePane()
    else this.openPane(this.section)
  }

  /** A page for an agent that may not be the open one (Edit Profile, View Profile): it opens there once that agent's chat does. */
  openPaneFor(section: PaneSection, agentId: string): void {
    if (this.selected !== agentId) this.request = { agentId, section }
    this.openPane(section)
    this.choose(agentId)
  }

  /** Another agent opened (told by the window): its page starts on Profile, or on the page asked for it. */
  agentChanged(agentId: string | undefined): void {
    this.avatarEditorFor = undefined
    this.routineEditor = undefined
    // A call's lines or an exchange belong to the chat they were opened over.
    this.chatCover = undefined
    if (this.request && this.request.agentId === agentId) {
      this.section = this.request.section
    } else {
      this.section = 'profile'
      this.routineRequest = undefined
    }
    this.request = undefined
    this.changed()
  }

  /** A flight row in a chat (`__simeonOpenFlight`): the open one again closes the pane; else the pane shows it, on no page. */
  toggleFlight(key: string, offer: OpenFlight['offer'], agentId: string): void {
    if (this.paneOpen && this.flight?.key === key) {
      this.closePane()
      return
    }
    this.cancelLinger()
    this.flight = { key, offer, agentId }
    this.contentAlive = true
    if (!this.paneOpen) this.show()
    this.changed()
  }

  /** Book with Simeon done: the pane closes if it still shows that flight. */
  closeFlight(key: string): void {
    if (this.flight?.key === key) this.closePane()
  }

  /** The avatar's button (step 4b): the editor opens, or closes when open for this agent. */
  toggleAvatarEditor(agentId: string): void {
    this.avatarEditorFor =
      this.avatarEditorFor === agentId ? undefined : agentId
    this.changed()
  }

  closeAvatarEditor(): void {
    if (this.avatarEditorFor === undefined) return
    this.avatarEditorFor = undefined
    this.changed()
  }

  /** New Routine (no routine) or a routine's row: its editor, afresh (step 4c). */
  openRoutine(routineId: string | undefined, agentId: string): void {
    this.routineEditor = { agentId, routineId }
    this.changed()
  }

  /** Back to Routines, Delete, or the routine gone. */
  backToRoutines(): void {
    if (this.routineEditor === undefined) return
    this.routineEditor = undefined
    this.changed()
  }

  /** A routine's chip in the chat (`openAutomationDetail`): Routines, with that routine's editor once the list has it. */
  openRoutineFor(routineId: string, agentId: string): void {
    this.routineEditor = undefined
    this.routineRequest = routineId
    this.openPaneFor('routines', agentId)
  }

  /** The routine asked for has been opened (or is gone). */
  routineRequestDone(): void {
    if (this.routineRequest === undefined) return
    this.routineRequest = undefined
    this.changed()
  }

  /** The edge dragged by `moved` (left is wider): held at 280 below 244 (`w3n`). */
  drag(moved: number, windowWidth: number, sidebarWidth: number): void {
    if (this.dragStart === undefined) this.dragStart = this.paneWidth
    const pointerWidth = this.dragStart - moved
    if (pointerWidth < paneCloseBelow) {
      this.dragCloses = true
      this.dragWidth = paneNarrowest
    } else {
      this.dragCloses = false
      const room = Math.min(
        paneWidest,
        windowWidth - chatMinimum - sidebarWidth,
      )
      this.dragWidth = Math.max(
        paneNarrowest,
        Math.min(pointerWidth, Math.max(paneNarrowest, room)),
      )
    }
    this.changed()
  }

  /** Let go: below 244 it closes and keeps the width it had; else the new width is kept. */
  endDrag(): void {
    const closes = this.dragCloses
    const width = this.dragWidth
    this.dragWidth = undefined
    this.dragCloses = false
    this.dragStart = undefined
    if (closes) {
      this.closePane()
      return
    }
    if (width !== undefined) {
      this.paneWidth = Math.round(width)
      keep(widthKey, String(this.paneWidth))
    }
    this.changed()
  }

  /** Told by the window whether the pane is drawn (`isVisible`); nothing to redraw. */
  setPaneVisible(visible: boolean): void {
    this.paneVisible = visible
  }

  // MARK: Step 5b's computer over the window (MainWindow.swift's `computer`)

  /** An agent's computer over the whole window, from its pane's preview or a card (`WindowState.computer`). */
  computer?: ComputerOpen

  /** The computer is over the window: the window's own keys go to its screen (`computerShowing`). */
  get computerShowing(): boolean {
    return this.computer !== undefined
  }

  /**
   * Opens it (`openComputer`): the caller starts the computer too
   * (`store.openComputer`, 5b), as the Mac's `openComputer` does; nothing
   * behind keeps the keys.
   */
  openComputer(agentId: string, helper?: string): void {
    this.computer = { agentId, helper }
    this.changed()
  }

  closeComputer(): void {
    if (this.computer === undefined) return
    this.computer = undefined
    this.changed()
  }

  /** Another helper's screen asked for (the strip, ↑← and ↓→), on the computer shown. */
  showComputerHelper(helper: string | undefined): void {
    if (this.computer === undefined || this.computer.helper === helper) return
    this.computer = { ...this.computer, helper }
    this.changed()
  }

  // MARK: Step 5c's computer questions (`computerAsk`)

  /** A computer question asked: its dialog shows when no other does (ComputerStates.swift's `ComputerDialog.current`). */
  computerAsk?: ComputerAsk

  askComputer(ask: ComputerAsk | undefined): void {
    this.computerAsk = ask
    this.changed()
  }

  // MARK: Step 5d's covers over the chat (`callOpen`, `exchangePeer`)

  /** A call's lines or two agents' exchange over the chat and its field; another agent opened closes it. */
  chatCover?: ChatCover

  coverChat(cover: ChatCover | undefined): void {
    this.chatCover = cover
    this.changed()
  }

  /** Signed out: the chart and what floats over the window go with it; the pane stays as it was, as on the Mac. */
  leftWindow(): void {
    this.orgChart = false
    this.searchOpen = false
    this.newAgent = false
    this.hiddenAgents = false
    this.avatarEditorFor = undefined
    this.pendingReveal = undefined
    // The next sign-in opens on a chat, not a computer (MainWindow.swift's sign-out).
    this.computer = undefined
    this.computerAsk = undefined
    this.chatCover = undefined
    this.changed()
  }
}

export const WindowContext = createContext<WindowModel | undefined>(undefined)

/** The window's model, for the screens inside the window. */
export function useWindowModel(): WindowModel {
  const model = useContext(WindowContext)
  if (!model) throw new Error('useWindowModel outside the window')
  return model
}
