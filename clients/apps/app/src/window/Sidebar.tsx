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
// Still to come, each with its screen (docs/web-app/PROGRESS.md): search and
// new chat in the head, the account and Connect apps in the foot, dragging
// (pins, rows into sections, sections), the rail, the width dragged, Edit
// Profile (with the agent's pane), Recover computer.

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
import { AgentMark } from './AgentMark'
import {
  ContextMenu,
  Glyph,
  type GlyphName,
  type MenuLine,
} from './ContextMenu'
import { Alert, Sheet } from './Dialogs'
import { useWatched } from './useStore'

/** An Apple computer picks with ⌘-click; Windows with Control-click. */
const apple =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

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
}) {
  const titled = !agent.isGroup && agent.title !== ''
  const time =
    agent.hasUnread || renaming ? undefined : listTime(agent.lastActivityAt)
  const line = preview ?? previewLine(agent)
  const side = 46
  const badge = !agent.isRunning && agent.isGroup && hasPicture(agent)
  const className = 'agent-row' + (picked ? ' picked' : open ? ' open' : '')
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
      aria-label={
        agent.hasUnread ? t`${agent.name}, Unread activity` : agent.name
      }
      aria-current={open ? 'true' : undefined}
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
  onClick,
  onMenu,
}: {
  agent: Agent
  agents: readonly Agent[]
  open: boolean
  picked: boolean
  onClick: (event: React.MouseEvent) => void
  onMenu: (event: React.MouseEvent) => void
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
      className={'pin-tile' + (picked ? ' picked' : open ? ' open' : '')}
      onClick={onClick}
      onContextMenu={onMenu}
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
}: {
  store: AppStore
  open?: string
  onOpen: (id: string) => void
}) {
  useWatched(store)
  // Read again every 4 seconds while the list can't be read.
  const failed = store.rosterFailed
  useEffect(() => {
    if (!failed) return
    const timer = setInterval(() => {
      if (store.rosterFailed && !store.rosterRetrying) void store.reloadRoster()
    }, 4_000)
    return () => clearInterval(timer)
  }, [failed, store])

  const [selection, setSelection] = useState(SidebarSelection.empty)
  const [renamingAgent, setRenamingAgent] = useState<string>()
  const [renamingSection, setRenamingSection] = useState<string>()
  const [folded, setFolded] = useState<ReadonlySet<string>>(readFolded)
  const [showsHidden, setShowsHidden] = useState(false)
  const [menu, setMenu] = useState<Shown>()
  const [asking, setAsking] = useState<Asking>()
  const menuClosed = useRef({ at: 0, fromBar: false })

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
    // Edit Profile comes with the agent's pane (step 4).
    if (!agent.isGroup && !agent.isRemoteRoom)
      lines.push('separator', {
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
    if (picked.isEmpty || menu || asking || showsHidden) return
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

  const row = (agent: Agent) => (
    <AgentRow
      key={agent.id}
      agent={agent}
      agents={store.agents}
      open={open === agent.id}
      picked={picked.has(agent.id)}
      preview={rowPreview(agent, store, open === agent.id)}
      renaming={renamingAgent === agent.id}
      onClick={(event) => click(agent.id, event)}
      onRename={() => setRenamingAgent(agent.id)}
      onRenamed={(name) => {
        setRenamingAgent(undefined)
        if (name != null) void store.renameAgent(agent.id, name)
      }}
      onMenu={showMenu(rowMenu(agent), menuNames.agent)}
    />
  )

  const sectionBlock = (section: ShownSection) => {
    const renaming = renamingSection === section.id && !section.isUnassigned
    const count = section.isCollapsed ? section.agents.length : undefined
    return (
      <div key={section.id} className="section-block">
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

  return (
    <nav className="sidebar">
      {picked.isEmpty ? (
        <div className="sidebar-head" />
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
          {glyphButton('trash', t`Delete ${picked.count} selected agents`, () =>
            confirmDelete([...picked.ids]),
          )}
          {glyphButton('xmark', t('Clear selection'), () =>
            setSelection(picked.clear()),
          )}
        </div>
      )}
      {store.rosterFailed &&
        (store.agents.length === 0 ? (
          <RosterCard store={store} />
        ) : (
          <RosterLine store={store} />
        ))}
      <div className="agent-list">
        {pins.length > 0 && (
          <div
            className="pin-grid"
            role="group"
            aria-label={t('Pinned agents')}
          >
            {pins.map((agent) => (
              <PinTile
                key={agent.id}
                agent={agent}
                agents={store.agents}
                open={open === agent.id}
                picked={picked.has(agent.id)}
                onClick={(event) => click(agent.id, event)}
                onMenu={showMenu(rowMenu(agent), menuNames.agent)}
              />
            ))}
          </div>
        )}
        <div className="list-body">
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
      </div>
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

/** "Can't reach your computer" over no list (`RosterCard`), with Retry; "Your computer isn't set up" for an account without access. */
function RosterCard({ store }: { store: AppStore }) {
  const blocked = store.accessBlocked
  return (
    <div className="roster-card" role="status">
      <div className="heading">
        {blocked
          ? t('Your computer isn’t set up')
          : t('Can’t reach your computer')}
      </div>
      <div>
        {blocked
          ? t(
              'Simeon can’t set up a computer for this account yet. Setup starts automatically once this account has access.',
            )
          : t('Your agents are safe — they just can’t be loaded right now.')}
      </div>
      {store.rosterRetrying ? (
        <div>{t('Retrying…')}</div>
      ) : (
        <button
          type="button"
          className="pill-button"
          onClick={() => void store.retryRoster()}
        >
          {t('Retry')}
        </button>
      )}
    </div>
  )
}

/** "Reconnecting to your computer…" over a list already shown (`RosterLine`), and a quiet Retry. */
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
