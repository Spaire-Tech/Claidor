// The sidebar (mac/Simeon/Sidebar.swift, SidebarList.swift, SidebarMenus.swift
// and SidebarState.swift, and the roster's card and line in
// ComputerStates.swift): the head, or the picked rows' buttons; "Can't reach
// your computer" when the list can't be read; the pins as tiles; the rows,
// or the person's sections with their headers; Hidden Agents at the foot.
// A row's right click has the Mac's menu (pin, move to a section, read,
// duplicate, copy the id, hide, delete); a section's has Rename, Move up,
// Move down and Delete. ⌘-click (Control-click on Windows) and ⇧-click pick
// several rows; Escape lets them go and Delete deletes them, after the
// Mac's confirmation. A double click renames a row in place.
//
// Rows, pins and sections drag as on the Mac: a row onto the pins pins it,
// into a section moves it; a pin onto another takes its place, onto the list
// unpins it; a section goes above or below another. Folded, the sidebar is
// its rail: the pictures alone.
//
// The foot has the account's disc and Connect apps (step 6), the computer's
// Update at its right (ComputerStates.tsx, step 5c); the rail's foot has
// search, New Agent and the account's disc.

import { useCallback, useEffect, useRef, useState } from 'react'
import { listTime } from '../core/listTime'
import { type Agent, hasPicture, previewLine, shownTitle } from '../core/models'
import {
  type ShownSection,
  SidebarSelection,
  assignAgents,
  deleteSectionMessage,
  deleteSectionTitle,
  deletionFailure,
  deletionMenuLabel,
  deletionMessage,
  deletionTitle,
  emptySectionLine,
  isUnassigned,
  moveLabel,
  moveSection,
  newSectionLabel,
  removeSection,
  renameSection,
  sectionIdOf,
  shownSections,
  sidebarOrder,
} from '../core/sidebarSections'
import type { AppStore } from '../core/store'
import { t } from '../l10n'
import type { WebSession } from '../session'
import { AccountDisc } from './AccountMenu'
import { AgentMark } from './AgentMark'
import { ComputerUpdatePill, StateSpinner } from './ComputerStates'
import {
  ContextMenu,
  Glyph,
  type GlyphName,
  type MenuLine,
} from './ContextMenu'
import { Alert, Sheet, somethingOver } from './Dialogs'
import { apple } from './keys'
import { useWatched } from './useStore'
import { useWindowModel } from './windowModel'

/** The menus' names for a screen reader: English on the Mac too (its menus have none; not in the catalogue). */
const menuNames = { agent: 'Agent actions', section: 'Section actions' }

// MARK: Folded sections, kept in this browser (the Mac keeps them in its defaults under the same name)

const foldedKey = 'simeon.sidebar.foldedSections'

/** The sections folded in this browser. */
export function readFolded(): Set<string> {
  try {
    const kept: unknown = JSON.parse(localStorage.getItem(foldedKey) ?? '[]')
    return new Set(
      Array.isArray(kept)
        ? kept.filter((one): one is string => typeof one === 'string')
        : [],
    )
  } catch {
    return new Set()
  }
}

function keepFolded(folded: ReadonlySet<string>): void {
  try {
    localStorage.setItem(foldedKey, JSON.stringify([...folded].sort()))
  } catch {
    // A private window, or storage refused: folded for this visit only.
  }
}

/** The list's order (`Ict`): the pins, then the rows, or the open sections' rows. The window opens its first when nothing else is open. */
export function listOrder(store: AppStore, folded = readFolded()): string[] {
  return sidebarOrder(
    store.agents.filter((agent) => !agent.isHidden),
    store.pinnedIds,
    store.sidebarSections ?? [],
    folded,
  )
}

/** A field holds the keys: Escape and Delete are its own. */
function fieldHasKeys(): boolean {
  const element = document.activeElement
  if (!(element instanceof HTMLElement)) return false
  return (
    element.isContentEditable ||
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  )
}

// MARK: A row

/** The row's second line: waiting for the person, else a draft in another chat, else the last line. */
function rowPreview(agent: Agent, store: AppStore, open: boolean): string {
  if (agent.awaitingUserResponse && agent.waitingReason)
    return previewLine(agent)
  if (!open) {
    const flat = (store.drafts[agent.id] ?? '').split(/\s+/).filter(Boolean)
    // "Draft:" is English on the Mac too (it is not in the catalogue).
    if (flat.length > 0) return `Draft: ${flat.join(' ')}`
  }
  return previewLine(agent)
}

/** What a click on a row or a tile does: with ⌘ (Control on Windows) or ⇧ it picks, else it opens. */
type RowClick = (id: string, event: React.MouseEvent) => void

/** What makes a row, a tile or a section's header draggable. */
type Dragging = Pick<
  React.HTMLAttributes<HTMLElement>,
  'draggable' | 'onDragStart' | 'onDragEnd'
>

/**
 * A row (`AgentRow`): the picture, the name, the title's tag, the time or
 * the unread dot, the last line. The open agent's row is the white card; a
 * picked row the blue wash; under the pointer, grey. A double click renames
 * it in place; the right click has the row's menu.
 */
export function AgentRow({
  agent,
  agents,
  open,
  picked = false,
  preview,
  renaming = false,
  onClick,
  onRename,
  onRenamed,
  onMenu,
  rail = false,
  drag,
  cycling = false,
}: {
  agent: Agent
  agents: readonly Agent[]
  open: boolean
  picked?: boolean
  /** The second line, when it is not the agent's own last line (a draft). */
  preview?: string
  renaming?: boolean
  onClick: (event: React.MouseEvent) => void
  onRename?: () => void
  onRenamed?: (name: string | undefined) => void
  onMenu?: (event: React.MouseEvent) => void
  /** On the rail: the picture alone (36), unread or at work on its corner. */
  rail?: boolean
  drag?: Dragging
  /** Control-Tab's walk is on it (`CycleRing`, controlTab.ts). */
  cycling?: boolean
}) {
  const label = agent.hasUnread ? t`${agent.name}, Unread activity` : agent.name
  if (rail) {
    const dot = agent.hasUnread
      ? 'unread'
      : agent.isRunning
        ? 'working'
        : undefined
    return (
      <button
        type="button"
        className={
          'agent-row rail' +
          (picked ? ' picked' : open ? ' open' : '') +
          (cycling ? ' cycling' : '')
        }
        onClick={onClick}
        onContextMenu={onMenu}
        aria-label={label}
        aria-current={open ? 'true' : undefined}
        {...drag}
      >
        <span className={dot ? 'agent-mark holed' : 'agent-mark'}>
          <AgentMark agent={agent} agents={agents} size={36} />
          {dot && (
            <span
              className={`working-dot ${dot}`}
              style={{ left: 26, top: 26 }}
            />
          )}
          {!dot && agent.isGroup && hasPicture(agent) && (
            <GroupBadge offset={3} />
          )}
        </span>
      </button>
    )
  }
  const titled = !agent.isGroup && agent.title !== ''
  const time =
    agent.hasUnread || renaming ? undefined : listTime(agent.lastActivityAt)
  const line = preview ?? previewLine(agent)
  const side = 46
  const badge = !agent.isRunning && agent.isGroup && hasPicture(agent)
  const className =
    'agent-row' +
    (picked ? ' picked' : open ? ' open' : '') +
    (cycling ? ' cycling' : '')
  const body = (
    <>
      <span className={agent.isRunning ? 'agent-mark holed' : 'agent-mark'}>
        <AgentMark agent={agent} agents={agents} size={side} />
        {agent.isRunning && (
          <span
            className="working-dot"
            style={{ left: side - 10, top: side - 10 }}
          />
        )}
        {badge && <GroupBadge offset={3} />}
      </span>
      <span className={agent.hasUnread ? 'details unread' : 'details'}>
        <span className={titled ? 'first-line titled' : 'first-line'}>
          {renaming ? (
            <NameField
              initial={agent.name}
              label={t('Rename agent')}
              done={(name) => onRenamed?.(name)}
            />
          ) : (
            <span className="name">{agent.name}</span>
          )}
          {titled && <span className="title">{shownTitle(agent)}</span>}
          {time && <span className="time">{time}</span>}
        </span>
        {line !== '' && (
          <span className="preview" title={line} style={{ display: 'block' }}>
            {line}
          </span>
        )}
        {agent.hasUnread && <span className="unread-dot" />}
      </span>
    </>
  )
  if (renaming) return <div className={className}>{body}</div>
  return (
    <button
      type="button"
      className={className}
      onClick={onClick}
      onDoubleClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey) return
        onRename?.()
      }}
      onContextMenu={onMenu}
      aria-label={label}
      aria-current={open ? 'true' : undefined}
      {...drag}
    >
      {body}
    </button>
  )
}

/** A group with its own picture (`GroupChatBadge`): a 16-point grey disc with two people, ringed in the sidebar's ground. */
function GroupBadge({ offset }: { offset: number }) {
  return (
    <span
      className="group-badge"
      style={{ right: -offset, bottom: -offset }}
      role="img"
      aria-label={t('Group chat')}
    >
      <svg width="10" height="10" viewBox="0 0 16 16" aria-hidden="true">
        <g fill="currentColor">
          <circle cx="5.6" cy="5" r="2.6" />
          <circle cx="11.2" cy="5.6" r="2.1" />
          <path d="M.8 13.6c0-2.7 2.1-4.6 4.8-4.6s4.8 1.9 4.8 4.6c0 .5-.3.8-.8.8H1.6c-.5 0-.8-.3-.8-.8Z" />
          <path d="M11.6 14.4h3c.4 0 .7-.3.7-.7 0-2.2-1.6-3.9-3.9-3.9-.6 0-1.2.1-1.7.4 1.1.9 1.8 2.3 1.9 4.2Z" />
        </g>
      </svg>
    </span>
  )
}

/**
 * A name typed over in place (a row's, 14 on 20 at 500; a section's, 12 on
 * 16): it opens with the name chosen; Return or leaving it keeps a changed,
 * non-empty name; Escape puts the old one back.
 */
function NameField({
  initial,
  label,
  small = false,
  done,
}: {
  initial: string
  label: string
  small?: boolean
  /** The new name, or nothing when it is kept as it was. */
  done: (name: string | undefined) => void
}) {
  const [value, setValue] = useState(initial)
  const field = useRef<HTMLInputElement>(null)
  const finished = useRef(false)
  useEffect(() => {
    field.current?.focus()
    field.current?.select()
  }, [])
  const finish = (keep: boolean) => {
    if (finished.current) return
    finished.current = true
    const name = value.trim()
    done(keep && name !== '' && name !== initial ? name : undefined)
  }
  return (
    <input
      ref={field}
      className={small ? 'name-field small' : 'name-field'}
      value={value}
      aria-label={label}
      spellCheck={false}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          finish(true)
        } else if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          finish(false)
        }
      }}
    />
  )
}

// MARK: Pins

/**
 * A pinned agent's tile (C03): its picture 60 over its name (11 on 16) and
 * its title in blue, at least 80 wide, the name at most 92. Unread (blue)
 * or at work (green) is a 10-point dot at the picture's corner.
 */
function PinTile({
  agent,
  agents,
  open,
  picked,
  lit,
  onClick,
  onMenu,
  drag,
  cycling = false,
}: {
  agent: Agent
  agents: readonly Agent[]
  open: boolean
  picked: boolean
  /** A pin dragged over it would take its place. */
  lit: boolean
  onClick: (event: React.MouseEvent) => void
  onMenu: (event: React.MouseEvent) => void
  drag: Dragging
  /** Control-Tab's walk is on it (`CycleRing`, controlTab.ts). */
  cycling?: boolean
}) {
  const dot = agent.hasUnread
    ? 'unread'
    : agent.isRunning
      ? 'working'
      : undefined
  const titled = !agent.isGroup && agent.title !== ''
  return (
    <button
      type="button"
      className={
        'pin-tile' +
        (picked ? ' picked' : open ? ' open' : lit ? ' lit' : '') +
        (cycling ? ' cycling' : '')
      }
      data-id={agent.id}
      onClick={onClick}
      onContextMenu={onMenu}
      {...drag}
      aria-label={
        agent.hasUnread ? t`${agent.name}, Unread activity` : agent.name
      }
      aria-current={open ? 'true' : undefined}
    >
      <span className={dot ? 'agent-mark holed wide' : 'agent-mark'}>
        <AgentMark agent={agent} agents={agents} size={60} />
        {dot && <span className={`corner-dot ${dot}`} />}
        {!dot && agent.isGroup && hasPicture(agent) && (
          <GroupBadge offset={1} />
        )}
      </span>
      <span className="pin-names">
        <span className="pin-name">{agent.name}</span>
        {titled && <span className="pin-title">{shownTitle(agent)}</span>}
      </span>
    </button>
  )
}

// MARK: Sections

/** A section's or Hidden Agents' header line: the name (or its field), the folded count, the chevron under the pointer. */
function HeaderLine({
  count,
  folded,
  children,
}: {
  count?: number
  folded: boolean
  children: React.ReactNode
}) {
  return (
    <span className="header-line">
      <span className="header-name">{children}</span>
      {count != null && <span className="header-count">{count}</span>}
      <span className={folded ? 'header-chevron' : 'header-chevron open'}>
        <Glyph name="chevron" size={12} />
      </span>
    </span>
  )
}

// MARK: The sidebar

interface Shown {
  items: MenuLine[]
  at: { x: number; y: number }
  label: string
  /** The Move button's menu: a click on that button while it is open only closes it. */
  fromBar?: boolean
}

/** What is being dragged: a row, a pin or a section's header. */
interface Dragged {
  kind: 'agent' | 'pin' | 'section'
  id: string
}

/** What letting go over the list would do: unpin onto it, go into a section, or (a section) go above or below another. */
type ListTarget =
  | { kind: 'list' }
  | { kind: 'section'; id: string }
  | { kind: 'line'; id: string; edge: 'top' | 'bottom' }

/** Over the pins: pin it (anywhere on the grid), or take a tile's place. */
type PinTarget = { kind: 'grid' } | { kind: 'tile'; id: string }

/** The sidebar's own kind of drag, so the message field never takes it as words or files. */
const sidebarItem = 'application/x-simeon-sidebar'

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

interface Asking {
  title: string
  message: string
  action: string
  destructive?: boolean
  /** Only an alert that asks has Cancel. */
  asks: boolean
  onAction: () => void
}

export function Sidebar({
  store,
  open,
  onOpen,
  rail = false,
  width,
  session,
  cycling,
}: {
  store: AppStore
  open?: string
  onOpen: (id: string) => void
  /** Folded to its rail (88): the pictures alone. */
  rail?: boolean
  width?: number
  /** The sign-in, for the account's disc and its menu (step 6); none in a test of the list alone. */
  session?: WebSession
  /** The row Control-Tab's walk is on (controlTab.ts, the Windows app). */
  cycling?: string
}) {
  useWatched(store)
  const model = useWindowModel()
  useWatched(model)
  // No row is lit while the org chart is in the chat's place (SidebarList.swift's `RowGround(open: … && !window.orgChart)`).
  const lit = model.orgChart ? undefined : open
  // Read again every 4 seconds while the list can't be read.
  const failed = store.rosterFailed
  useEffect(() => {
    if (!failed) return
    const timer = setInterval(() => {
      if (store.rosterFailed && !store.rosterRetrying) void store.reloadRoster()
    }, 4_000)
    return () => clearInterval(timer)
  }, [failed, store])
  // Control-Tab's row in view as the walk moves (SidebarList.swift's `scrollTo`, 0.15 s easing out).
  useEffect(() => {
    if (cycling == null) return
    document
      .querySelector('.sidebar .cycling')
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [cycling])

  const [selection, setSelection] = useState(SidebarSelection.empty)
  // An agent opened from search or the org chart lets the picked rows go, its row the anchor (`sidebar.selection.plain`).
  const plain = model.sidebarPlain
  const [plainTaken, setPlainTaken] = useState(plain)
  if (plain !== plainTaken) {
    setPlainTaken(plain)
    if (plain) setSelection((now) => now.plain(plain.agentId))
  }
  const [renamingAgent, setRenamingAgent] = useState<string>()
  const [renamingSection, setRenamingSection] = useState<string>()
  const [folded, setFolded] = useState<ReadonlySet<string>>(readFolded)
  const showsHidden = model.hiddenAgents
  const setShowsHidden = (show: boolean) => model.showHiddenAgents(show)
  const [menu, setMenu] = useState<Shown>()
  const [asking, setAsking] = useState<Asking>()
  const menuClosed = useRef({ at: 0, fromBar: false })
  const [dragging, setDragging] = useState<Dragged>()
  const [listTarget, setListTarget] = useState<ListTarget>()
  const [pinTarget, setPinTarget] = useState<PinTarget>()

  const visible = store.agents.filter((agent) => !agent.isHidden)
  const pins = store.pinned
  const pinIds = new Set(store.pinnedIds)
  const listed = visible.filter((agent) => !pinIds.has(agent.id))
  const sections = store.sidebarSections ?? []
  const shown = shownSections(visible, store.pinnedIds, sections, folded)
  const order = sidebarOrder(visible, store.pinnedIds, sections, folded)
  const hiddenCount = store.agents.length - visible.length
  // Rows whose agents are gone or hidden are let go.
  const picked = selection.keep(new Set(visible.map((agent) => agent.id)))

  const closeMenu = useCallback(() => {
    setMenu((now) => {
      if (now)
        menuClosed.current = { at: performance.now(), fromBar: !!now.fromBar }
      return undefined
    })
  }, [])

  const fold = (id: string) => {
    const next = new Set(folded)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setFolded(next)
    keepFolded(next)
  }

  /** ⌘-click picks or lets go, ⇧-click picks from the last row clicked; a plain click lets them go and opens the agent. Picking takes the keys from the message field, so Delete and Escape reach the list. */
  const click: RowClick = (id, event) => {
    const command = apple ? event.metaKey : event.ctrlKey
    if (command) {
      setSelection(picked.toggle(id))
      ;(document.activeElement as HTMLElement | null)?.blur()
    } else if (event.shiftKey) {
      setSelection(picked.extend(id, order))
      ;(document.activeElement as HTMLElement | null)?.blur()
    } else {
      setSelection(picked.plain(id))
      onOpen(id)
    }
  }

  // MARK: What the menus do

  const move = (ids: string[], sectionId: string) => {
    store.editSections((now) => assignAgents(now, ids, sectionId))
    setSelection(picked.clear())
  }

  /** A new section at the top holding these agents, open, its name ready to type over. */
  const newSection = (ids: string[]) => {
    const id = store.createSection(ids)
    if (id == null) return
    setSelection(picked.clear())
    if (folded.has(id)) fold(id)
    setRenamingSection(id)
  }

  /** Delete, after the Mac's confirmation: its title and words, Delete in red and Cancel. A refusal says so. */
  const confirmDelete = (ids: string[]) => {
    const agents = ids
      .map((id) => store.agent(id))
      .filter((agent): agent is Agent => agent != null)
    if (agents.length === 0) return
    setAsking({
      title: deletionTitle(agents),
      message: deletionMessage(agents),
      action: t('Delete'),
      destructive: true,
      asks: true,
      onAction: () => {
        setAsking(undefined)
        void store
          .deleteAgents(agents.map((agent) => agent.id))
          .then((done) => {
            if (done) {
              setSelection((now) =>
                now.keep(new Set(store.agents.map((agent) => agent.id))),
              )
              return
            }
            setAsking({
              title: deletionTitle(agents),
              message: deletionFailure(),
              // "OK" is English on the Mac too (it is not in the catalogue).
              action: 'OK',
              asks: false,
              onAction: () => setAsking(undefined),
            })
          })
      },
    })
  }

  const confirmDeleteSection = (id: string, name: string) =>
    setAsking({
      title: deleteSectionTitle(name),
      message: deleteSectionMessage(),
      action: t('Delete'),
      destructive: true,
      asks: true,
      onAction: () => {
        setAsking(undefined)
        store.editSections((now) => removeSection(now, id))
      },
    })

  /** The person's sections in order, "Unassigned" (always last) left out: what Move up and Move down step through. */
  const own = sections.filter((section) => !isUnassigned(section))
  const stepSection = (id: string, up: boolean) => {
    const index = own.findIndex((section) => section.id === id)
    const target = own[up ? index - 1 : index + 1]
    if (index < 0 || !target) return
    store.editSections((now) => moveSection(now, id, target.id, up))
  }

  /** The sections to move into, then a new one (the row's Move to, and the picked rows' Move). */
  const moveItems = (ids: string[], tick?: string): MenuLine[] => [
    ...sections.map(
      (section): MenuLine => ({
        label: section.name,
        glyph: 'folder',
        checked: tick != null && section.id === tick,
        action: () => move(ids, section.id),
      }),
    ),
    ...(sections.length > 0 ? (['separator'] as MenuLine[]) : []),
    {
      label: newSectionLabel(sections.length > 0, ids.length),
      glyph: 'folderAdd',
      action: () => newSection(ids),
    },
  ]

  /** A row's menu (`Agent actions`): with several rows picked and this one among them, Move and Delete act on them all. */
  const rowMenu = (agent: Agent): MenuLine[] => {
    const targets = picked.targets(agent.id)
    const pinned = pinIds.has(agent.id)
    // Pinned rows stay where they are: only the rest move into sections.
    const movable = targets.filter((id) => !pinIds.has(id))
    const lines: MenuLine[] = [
      {
        label: pinned ? t('Unpin') : t('Pin'),
        glyph: pinned ? 'unpin' : 'pin',
        action: () => void store.setPinned(agent.id, !pinned),
      },
    ]
    if (!pinned && store.sidebarSections) {
      if (sections.length === 0)
        lines.push({
          label: newSectionLabel(false, movable.length),
          glyph: 'folderAdd',
          action: () => newSection(movable),
        })
      else
        lines.push({
          label: moveLabel(movable.length),
          glyph: 'folder',
          submenu: moveItems(
            movable,
            movable.length === 1 ? sectionIdOf(agent.id, sections) : undefined,
          ),
        })
    }
    lines.push({
      label: agent.hasUnread ? t('Mark as Read') : t('Mark as Unread'),
      glyph: agent.hasUnread ? 'bell' : 'bellBadge',
      action: () => void store.setUnread(agent.id, !agent.hasUnread),
    })
    // The agent's pane on its Profile (`openProfile`), that agent opening if it is not the open one.
    lines.push('separator', {
      label: t('Edit Profile'),
      glyph: 'pencil',
      action: () => model.openPaneFor('profile', agent.id),
    })
    if (!agent.isGroup && !agent.isRemoteRoom)
      lines.push({
        label: t('Duplicate'),
        glyph: 'duplicate',
        action: () =>
          void store.duplicate(agent.id).then((copy) => {
            if (copy) onOpen(copy)
          }),
      })
    lines.push(
      'separator',
      {
        label: t('Copy conversation ID'),
        glyph: 'copy',
        action: () => void navigator.clipboard?.writeText(agent.id),
      },
      'separator',
      {
        label: t('Hide from sidebar'),
        glyph: 'hide',
        action: () => {
          setSelection(picked.clear())
          void store.setHidden(agent.id, true)
        },
      },
      {
        label: deletionMenuLabel(targets.length),
        glyph: 'trash',
        destructive: true,
        action: () => confirmDelete(targets),
      },
    )
    return lines
  }

  /** A section's menu (`Section actions`): Rename, Move up, Move down (greyed at the ends), then Delete in red. */
  const sectionMenu = (id: string, name: string): MenuLine[] => {
    const index = own.findIndex((section) => section.id === id)
    return [
      {
        label: t('Rename'),
        glyph: 'pencil',
        action: () => setRenamingSection(id),
      },
      {
        label: t('Move up'),
        glyph: 'up',
        disabled: index <= 0,
        action: () => stepSection(id, true),
      },
      {
        label: t('Move down'),
        glyph: 'down',
        disabled: index < 0 || index >= own.length - 1,
        action: () => stepSection(id, false),
      },
      'separator',
      {
        label: t('Delete'),
        glyph: 'trash',
        destructive: true,
        action: () => confirmDeleteSection(id, name),
      },
    ]
  }

  const showMenu =
    (items: MenuLine[], label: string) => (event: React.MouseEvent) => {
      event.preventDefault()
      setMenu({ items, at: { x: event.clientX, y: event.clientY }, label })
    }

  // Escape lets the picked rows go; Delete (or Backspace) deletes them after the confirmation. Not while a field has the keys, or a menu, an alert or a sheet is over the window.
  const keys = useRef<(event: KeyboardEvent) => void>(undefined)
  keys.current = (event) => {
    if (
      event.defaultPrevented ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey
    )
      return
    if (picked.isEmpty || menu || asking || showsHidden || somethingOver())
      return
    if (renamingAgent || renamingSection || fieldHasKeys()) return
    if (event.key === 'Escape') {
      event.preventDefault()
      setSelection(picked.clear())
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault()
      confirmDelete([...picked.ids])
    }
  }
  useEffect(() => {
    const listen = (event: KeyboardEvent) => keys.current?.(event)
    window.addEventListener('keydown', listen)
    return () => window.removeEventListener('keydown', listen)
  }, [])

  // MARK: Dragging (`sidebar-dnd`)

  const endDrag = () => {
    setDragging(undefined)
    setListTarget(undefined)
    setPinTarget(undefined)
  }

  /** A row, a pin or a section's header that can be dragged. Nothing drags on the rail, which takes no drops. */
  const dragFor = (kind: Dragged['kind'], id: string): Dragging | undefined =>
    rail
      ? undefined
      : {
          draggable: true,
          onDragStart: (event) => {
            event.dataTransfer.setData(sidebarItem, id)
            event.dataTransfer.effectAllowed = 'move'
            // The pins' zone appears once the drag is under way: changing the page as a drag starts ends it in Chromium.
            setTimeout(() => setDragging({ kind, id }), 0)
          },
          onDragEnd: endDrag,
        }

  const under = (event: React.DragEvent, selector: string) =>
    (event.target as Element | null)?.closest<HTMLElement>(selector)?.dataset.id

  /** Over the list: a pin is unpinned (into the section under it, if any); a row goes into another section; a section goes above (dragged up) or below (dragged down) another. "Unassigned" stays last. */
  const aimAtList = (event: React.DragEvent): ListTarget | undefined => {
    if (!dragging) return undefined
    const section = shown.find(
      (one) => one.id === under(event, '.section-block'),
    )
    switch (dragging.kind) {
      case 'pin':
        return section ? { kind: 'section', id: section.id } : { kind: 'list' }
      case 'agent':
        if (!section || sectionIdOf(dragging.id, sections) === section.id)
          return undefined
        return { kind: 'section', id: section.id }
      case 'section': {
        if (!section || section.isUnassigned || section.id === dragging.id)
          return undefined
        const from = shown.findIndex((one) => one.id === dragging.id)
        const to = shown.findIndex((one) => one.id === section.id)
        if (from < 0 || to < 0) return undefined
        return {
          kind: 'line',
          id: section.id,
          edge: to < from ? 'top' : 'bottom',
        }
      }
    }
  }

  /** Over the pins: a row is pinned; a pin takes the place of the tile it is let go on. */
  const aimAtPins = (event: React.DragEvent): PinTarget | undefined => {
    if (dragging?.kind === 'agent')
      return pinIds.has(dragging.id) ? undefined : { kind: 'grid' }
    if (dragging?.kind === 'pin') {
      const tile = under(event, '.pin-tile')
      return tile && tile !== dragging.id
        ? { kind: 'tile', id: tile }
        : undefined
    }
    return undefined
  }

  /** A drop zone's handlers: lit while a drop would land, the drop done on letting go. */
  const zone = <Target,>(
    aim: (event: React.DragEvent) => Target | undefined,
    set: React.Dispatch<React.SetStateAction<Target | undefined>>,
    drop: (target: Target, event: React.DragEvent) => void,
  ) => {
    // Entering each element and moving over it: lit while a drop would land.
    const aimHere = (event: React.DragEvent) => {
      if (!event.dataTransfer.types.includes(sidebarItem)) return
      const target = aim(event)
      set((now) => (same(now, target) ? now : target))
      if (!target) return
      event.preventDefault()
      event.dataTransfer.dropEffect = 'move'
    }
    return {
      onDragEnter: aimHere,
      onDragOver: aimHere,
      onDragLeave: (event: React.DragEvent) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          set(undefined)
      },
      onDrop: (event: React.DragEvent) => {
        const target = aim(event)
        endDrag()
        if (!target) return
        event.preventDefault()
        drop(target, event)
      },
    }
  }

  const listZone = zone(aimAtList, setListTarget, (target) => {
    if (!dragging) return
    const id = dragging.id
    if (dragging.kind === 'pin') {
      void store.setPinned(id, false)
      if (target.kind === 'section')
        store.editSections((now) => assignAgents(now, [id], target.id))
    } else if (dragging.kind === 'agent' && target.kind === 'section') {
      // The picked rows go with it when it is one of them; pins stay where they are.
      move(
        picked.targets(id).filter((one) => !pinIds.has(one)),
        target.id,
      )
    } else if (dragging.kind === 'section' && target.kind === 'line') {
      store.editSections((now) =>
        moveSection(now, id, target.id, target.edge === 'top'),
      )
    }
  })

  const pinZone = zone(aimAtPins, setPinTarget, (_target, event) => {
    if (!dragging) return
    const id = dragging.id
    const place = pins.findIndex(
      (agent) => agent.id === under(event, '.pin-tile'),
    )
    if (dragging.kind === 'agent')
      void (async () => {
        await store.setPinned(id, true)
        if (place >= 0) await store.movePin(id, place)
      })()
    else if (dragging.kind === 'pin' && place >= 0)
      void store.movePin(id, place)
  })

  // MARK: Rows and sections

  const row = (agent: Agent) => (
    <AgentRow
      key={agent.id}
      agent={agent}
      agents={store.agents}
      open={lit === agent.id}
      picked={picked.has(agent.id)}
      preview={rowPreview(agent, store, open === agent.id)}
      renaming={!rail && renamingAgent === agent.id}
      onClick={(event) => click(agent.id, event)}
      onRename={rail ? undefined : () => setRenamingAgent(agent.id)}
      onRenamed={(name) => {
        setRenamingAgent(undefined)
        if (name != null) void store.renameAgent(agent.id, name)
      }}
      onMenu={showMenu(rowMenu(agent), menuNames.agent)}
      rail={rail}
      drag={dragFor('agent', agent.id)}
      cycling={cycling === agent.id}
    />
  )

  const sectionBlock = (section: ShownSection) => {
    const renaming = renamingSection === section.id && !section.isUnassigned
    const count = section.isCollapsed ? section.agents.length : undefined
    const lit = listTarget?.kind === 'section' && listTarget.id === section.id
    const line =
      listTarget?.kind === 'line' && listTarget.id === section.id
        ? ` line-${listTarget.edge}`
        : ''
    return (
      <div
        key={section.id}
        className={'section-block' + (lit ? ' lit' : '') + line}
        data-id={section.id}
      >
        {renaming ? (
          <div className="section-header renaming">
            <HeaderLine count={count} folded={section.isCollapsed}>
              <NameField
                initial={section.name}
                label={t('Rename section')}
                small
                done={(name) => {
                  setRenamingSection(undefined)
                  if (name != null)
                    store.editSections((now) =>
                      renameSection(now, section.id, name),
                    )
                }}
              />
            </HeaderLine>
          </div>
        ) : (
          <button
            type="button"
            className="section-header"
            aria-expanded={!section.isCollapsed}
            onClick={() => fold(section.id)}
            onContextMenu={
              section.isUnassigned
                ? (event) => event.preventDefault()
                : showMenu(
                    sectionMenu(section.id, section.name),
                    menuNames.section,
                  )
            }
            {...(section.isUnassigned ? {} : dragFor('section', section.id))}
          >
            <HeaderLine count={count} folded={section.isCollapsed}>
              {section.name}
            </HeaderLine>
          </button>
        )}
        {!section.isCollapsed && (
          <div className="section-rows">
            {section.agents.length === 0 ? (
              <div className="section-empty">{emptySectionLine()}</div>
            ) : (
              section.agents.map(row)
            )}
          </div>
        )}
      </div>
    )
  }

  const movable = [...picked.ids].filter((id) => !pinIds.has(id))
  const glyphButton = (
    glyph: GlyphName,
    label: string,
    action: (event: React.MouseEvent<HTMLButtonElement>) => void,
  ) => (
    <button
      type="button"
      className="bar-icon"
      title={label}
      aria-label={label}
      onClick={action}
    >
      <Glyph name={glyph} />
    </button>
  )
  const deleteButton = glyphButton(
    'trash',
    t`Delete ${picked.count} selected agents`,
    () => confirmDelete([...picked.ids]),
  )
  const clearButton = glyphButton('xmark', t('Clear selection'), () =>
    setSelection(picked.clear()),
  )

  /** The rail (88): the pins, a hairline, then the rows, or the open sections' rows with hairlines between. */
  const railBody = () => {
    const openSections = shown.filter(
      (section) => !section.isCollapsed && section.agents.length > 0,
    )
    return (
      <>
        {pins.length > 0 && (
          <div className="rail-pins">
            {pins.map(row)}
            <span className="rail-hairline" />
          </div>
        )}
        {sections.length === 0 ? (
          <div className="rows">{listed.map(row)}</div>
        ) : (
          <div className="sections">
            {openSections.map((section, index) => (
              <div key={section.id} className="rows">
                {index > 0 && <span className="rail-hairline between" />}
                {section.agents.map(row)}
              </div>
            ))}
          </div>
        )}
      </>
    )
  }

  const pinsLit = pinTarget?.kind === 'grid'
  const draggingAgent = dragging?.kind === 'agent'

  return (
    <nav
      className={rail ? 'sidebar rail' : 'sidebar'}
      style={width != null ? { width } : undefined}
    >
      {rail ? (
        <>
          <div className="sidebar-head rail-head" />
          {!picked.isEmpty && (
            <div className="rail-picked">
              {deleteButton}
              {clearButton}
            </div>
          )}
        </>
      ) : picked.isEmpty ? (
        // Search and New Agent, 40 round, 10 apart, 12 from the right edge (`sand-agents-sidebar__new-actions`).
        <div className="sidebar-head">
          <WindowDiscs />
        </div>
      ) : (
        // Rows picked (C11): the head is 44 high, the picked rows' buttons at its right.
        <div className="sidebar-head picking">
          {store.sidebarSections &&
            movable.length > 0 &&
            glyphButton(
              'folder',
              t`Move ${movable.length} selected agents to section`,
              (event) => {
                const closed = menuClosed.current
                if (closed.fromBar && performance.now() - closed.at < 300)
                  return
                const box = event.currentTarget.getBoundingClientRect()
                setMenu({
                  items: moveItems(movable),
                  at: { x: box.left, y: box.bottom + 4 },
                  label: t`Move ${movable.length} selected agents to section`,
                  fromBar: true,
                })
              },
            )}
          {deleteButton}
          {clearButton}
        </div>
      )}
      {store.rosterFailed &&
        (rail ? (
          // The rail shows the glyph alone; its words are its tooltip.
          store.agents.length === 0 && (
            <div
              className="rail-roster"
              role="status"
              title={
                store.accessBlocked
                  ? t('Your computer isn’t set up')
                  : t('Can’t reach your computer')
              }
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                aria-hidden="true"
              >
                <path
                  d="M2 3.5h12v8H2ZM6 14h4M8 11.5V14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          )
        ) : store.agents.length === 0 ? (
          <RosterCard store={store} />
        ) : (
          <RosterLine store={store} />
        ))}
      <div className="agent-list">
        {rail ? (
          railBody()
        ) : (
          <>
            {pins.length > 0 ? (
              <div
                className={pinsLit ? 'pin-grid lit' : 'pin-grid'}
                role="group"
                aria-label={t('Pinned agents')}
                {...pinZone}
              >
                {pins.map((agent) => (
                  <PinTile
                    key={agent.id}
                    agent={agent}
                    agents={store.agents}
                    open={lit === agent.id}
                    picked={picked.has(agent.id)}
                    lit={
                      pinTarget?.kind === 'tile' && pinTarget.id === agent.id
                    }
                    onClick={(event) => click(agent.id, event)}
                    onMenu={showMenu(rowMenu(agent), menuNames.agent)}
                    drag={dragFor('pin', agent.id)!}
                    cycling={cycling === agent.id}
                  />
                ))}
              </div>
            ) : (
              draggingAgent && (
                // Nothing pinned yet: while a row is dragged, a dashed zone to pin it.
                <div
                  className={pinsLit ? 'pin-zone lit' : 'pin-zone'}
                  aria-label={t('Pin drop zone')}
                  {...pinZone}
                >
                  {t('Drag here to pin')}
                </div>
              )
            )}
            <div
              className={
                listTarget?.kind === 'list' ? 'list-body lit' : 'list-body'
              }
              {...listZone}
            >
              {sections.length === 0 ? (
                <div className="rows">{listed.map(row)}</div>
              ) : (
                <div className="sections">{shown.map(sectionBlock)}</div>
              )}
              {hiddenCount > 0 && (
                <button
                  type="button"
                  className="section-header hidden-foot"
                  aria-label={t`Hidden Agents, ${hiddenCount}`}
                  onClick={() => setShowsHidden(true)}
                >
                  <HeaderLine count={hiddenCount} folded>
                    {t('Hidden Agents')}
                  </HeaderLine>
                </button>
              )}
              {store.hasReachedBox && store.agents.length === 0 ? (
                <div className="empty-lines">{t('No saved agents yet.')}</div>
              ) : (
                listed.length === 0 &&
                pins.length === 0 &&
                hiddenCount > 0 && (
                  <div className="empty-lines">
                    <span>{t('All bots are hidden')}</span>
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => setShowsHidden(true)}
                    >
                      {t('Show Hidden Agents')}
                    </button>
                  </div>
                )
              )}
            </div>
          </>
        )}
      </div>
      {/* The rail's foot: search, New Agent and the account stacked, 10 apart, 8 from the bottom (`simeon-rail-discs`). */}
      {rail && (
        <div className="rail-foot">
          <WindowDiscs />
          {session && <AccountDisc store={store} session={session} />}
        </div>
      )}
      {/* The foot (`SidebarFoot`): the account's disc and Connect apps beside it, 8 apart; the computer's Update at the right (step 5c). */}
      {!rail && (
        <div className="sidebar-foot">
          {session && <AccountDisc store={store} session={session} />}
          {session && <ConnectApps />}
          <span className="sidebar-foot-spacer" />
          <ComputerUpdatePill store={store} />
        </div>
      )}
      {menu && (
        <ContextMenu
          items={menu.items}
          at={menu.at}
          close={closeMenu}
          label={menu.label}
        />
      )}
      {asking && (
        <Alert
          title={asking.title}
          message={asking.message}
          action={asking.action}
          destructive={asking.destructive}
          onAction={asking.onAction}
          onCancel={asking.asks ? () => setAsking(undefined) : undefined}
        />
      )}
      {showsHidden && (
        <HiddenAgentsSheet
          store={store}
          close={() => setShowsHidden(false)}
          onOpen={(id) => {
            setShowsHidden(false)
            onOpen(id)
          }}
        />
      )}
    </nav>
  )
}

// MARK: The head's discs

/**
 * Search (⌘K) and New Agent (⌘N), each a 40 disc in Apple's glass with its
 * symbol (16) at 78% black (86% white on dark), its name as its tooltip
 * (`SearchDisc`, `NewChatDisc`). New Agent while group chats are off, as on
 * the Mac and the iPhone.
 */
const connectAppsTiles = [
  new URL(
    '../../../../../mac/Simeon/Assets.xcassets/Gmail.imageset/Gmail@2x.png',
    import.meta.url,
  ).href,
  new URL(
    '../../../../../mac/Simeon/Assets.xcassets/GoogleCalendar.imageset/GoogleCalendar@2x.png',
    import.meta.url,
  ).href,
  new URL(
    '../../../../../mac/Simeon/Assets.xcassets/GoogleDrive.imageset/GoogleDrive@2x.png',
    import.meta.url,
  ).href,
]

/**
 * Connect apps (`sand-agents-sidebar__plugins`): 15, medium, the window's
 * blue, then Gmail, Calendar and Drive on three white tiles, the first
 * turned 7° left, the last 7° right. It opens Connectors on Marketplace.
 */
function ConnectApps() {
  const model = useWindowModel()
  return (
    <button
      type="button"
      className="connect-apps"
      onClick={() => model.openConnectors()}
    >
      {t('Connect apps')}
      <span className="connect-apps-tiles" aria-hidden="true">
        {connectAppsTiles.map((tile, index) => (
          <span
            key={tile}
            className="connect-apps-tile"
            style={{ rotate: `${(index - 1) * 7}deg` }}
          >
            <img src={tile} alt="" draggable={false} />
          </span>
        ))}
      </span>
    </button>
  )
}

function WindowDiscs() {
  const model = useWindowModel()
  return (
    <>
      <button
        type="button"
        className="window-disc glass-disc"
        title={t('Search')}
        aria-label={t('Search')}
        onClick={() => model.openSearch()}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <g
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          >
            <circle cx="6.9" cy="6.9" r="4.7" />
            <path d="M10.4 10.4 14 14" />
          </g>
        </svg>
      </button>
      <button
        type="button"
        className="window-disc glass-disc"
        title={t('New Agent')}
        aria-label={t('New Agent')}
        onClick={() => model.startNewChat()}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <g
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12.6 9.2v3.3a1.6 1.6 0 0 1-1.6 1.6H3.5a1.6 1.6 0 0 1-1.6-1.6V5a1.6 1.6 0 0 1 1.6-1.6h3.3" />
            <path d="M11.7 2.3 13.7 4.3 8.2 9.8 5.9 10.1 6.2 7.8Z" />
          </g>
        </svg>
      </button>
    </>
  )
}

// MARK: Hidden Agents

/**
 * Hidden Agents (C14): 520 by 440, its title and the line under it, Close
 * at the right; then each hidden agent in a 36-high row (its picture 24,
 * its name, Unhide at the right). A row opens its agent; Unhide puts it
 * back in the sidebar. With none: "No hidden bots".
 */
function HiddenAgentsSheet({
  store,
  close,
  onOpen,
}: {
  store: AppStore
  close: () => void
  onOpen: (id: string) => void
}) {
  const hidden = store.hiddenAgents
  return (
    <Sheet label={t('Hidden Agents')} close={close} className="hidden-agents">
      <div className="hidden-head">
        <div className="hidden-words">
          <div className="hidden-title">{t('Hidden Agents')}</div>
          <div className="hidden-line">
            {t(
              "Hidden Agents stay active and keep their history, they just don't show in the sidebar.",
            )}
          </div>
        </div>
        <button
          type="button"
          className="hidden-close"
          title={t('Close')}
          aria-label={t('Close')}
          onClick={close}
        >
          <Glyph name="xmark" />
        </button>
      </div>
      {hidden.length === 0 ? (
        <div className="hidden-none">
          <Glyph name="hide" size={22} />
          <span>{t('No hidden bots')}</span>
        </div>
      ) : (
        <div className="hidden-list">
          {hidden.map((agent) => (
            <div key={agent.id} className="hidden-row">
              <button
                type="button"
                className="hidden-open"
                onClick={() => onOpen(agent.id)}
              >
                <AgentMark agent={agent} agents={store.agents} size={24} />
                <span className="hidden-name">{agent.name}</span>
              </button>
              <button
                type="button"
                className="hidden-unhide"
                onClick={() => void store.setHidden(agent.id, false)}
              >
                {t('Unhide')}
              </button>
            </div>
          ))}
        </div>
      )}
    </Sheet>
  )
}

// MARK: The computer out of reach

/**
 * The sidebar when the agents can't be read (`RosterCard`, `tpn`): "Can’t
 * reach your computer" (12/16, 500, at 60%, the display glyph) over why,
 * then Retry and Recover computer (26 high, round, on a faint grey);
 * "Retrying…" in Retry's place while it runs. "Your computer isn’t set up"
 * with Retry alone while this account has no Simeon. Recover computer asks
 * first (decision 8; the window resets at once): the computer's question
 * (step 5c), then "Resetting Simeon's Computer".
 */
function RosterCard({ store }: { store: AppStore }) {
  const model = useWindowModel()
  const driver = store.rebuild
  const blocked = store.accessBlocked
  const canRecover = !blocked && driver.canReset && !driver.isBlocked
  const recovering =
    driver.pendingKind === 'reset' || driver.lock.kind === 'reset'
  return (
    <div className="roster-card" role="status">
      <div className="heading">
        <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M2 3.5h12v8H2ZM6 14h4M8 11.5V14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {blocked
          ? t('Your computer isn’t set up')
          : t('Can’t reach your computer')}
      </div>
      <div>
        {blocked
          ? t(
              'Simeon can’t set up a computer for this account yet. Setup starts automatically once this account has access.',
            )
          : t('Your agents are safe — they just can’t be loaded right now.') +
            (canRecover
              ? t(
                  ' If it doesn’t come back on its own, recover it — your files and logins are kept.',
                )
              : '')}
      </div>
      <div className="roster-card-buttons">
        {store.rosterRetrying ? (
          <div className="roster-retrying">
            <StateSpinner size={12} />
            {t('Retrying…')}
          </div>
        ) : (
          <button
            type="button"
            className="pill-button"
            onClick={() => void store.retryRoster()}
          >
            {t('Retry')}
          </button>
        )}
        {canRecover && (
          <button
            type="button"
            className="pill-button"
            disabled={recovering}
            onClick={() =>
              model.askComputer({ kind: 'recover', fromSidebar: true })
            }
          >
            {recovering ? t('Recovering…') : t('Recover computer')}
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * "Reconnecting to your computer…" over a list already shown when reading
 * it again fails (`RosterLine`, `npn`; decision 7): 28 high across the
 * sidebar, 11/16 at 60%, and a quiet Retry ("Retrying…" while it runs).
 */
function RosterLine({ store }: { store: AppStore }) {
  return (
    <div className="roster-line" role="status">
      <span>{t('Reconnecting to your computer…')}</span>
      <button
        type="button"
        className="quiet-button"
        disabled={store.rosterRetrying}
        onClick={() => void store.retryRoster()}
      >
        {store.rosterRetrying ? t('Retrying…') : t('Retry')}
      </button>
    </div>
  )
}
