// The sidebar's sections, several rows picked, and the delete confirmation
// (SimeonCore's SidebarSections.swift), with the shipped window's rules
// (`dZ` and the sections store's commands): a section claims agents, an
// agent belongs to the first section that names it, and "Unassigned" is
// always last and holds the rest.

import { type JSONValue, arr, field, isObject, str } from './json'
import { t } from './l10n'
import type { Agent } from './models'

/** A section of the sidebar, as the host stores it (`sidebarSections` in the computer's settings). */
export interface SidebarSection {
  id: string
  name: string
  agentIds: string[]
}

export const unassignedId = '__agents__'

export function isUnassigned(section: { id: string }): boolean {
  return section.id === unassignedId
}

export function unassignedName(): string {
  return t('Unassigned')
}

export function newSectionName(): string {
  return t('New section')
}

/** Ids trimmed, empty and repeated ones dropped, each agent in its first section only; "Unassigned" appended, or nothing when no section of the person's is left (`dZ.normalize`). */
export function normalize(
  sections: readonly SidebarSection[],
): SidebarSection[] {
  const seenSections = new Set<string>()
  const seenAgents = new Set<string>()
  const out: SidebarSection[] = []
  for (const section of sections) {
    const id = section.id.trim()
    if (id === '' || seenSections.has(id)) continue
    seenSections.add(id)
    if (id === unassignedId) continue
    const ids: string[] = []
    for (const agent of section.agentIds) {
      if (agent === '' || seenAgents.has(agent)) continue
      seenAgents.add(agent)
      ids.push(agent)
    }
    out.push({ id, name: section.name, agentIds: ids })
  }
  if (out.length === 0) return []
  out.push({ id: unassignedId, name: unassignedName(), agentIds: [] })
  return out
}

/** The host's `sidebarSections`, read the way the window reads it (`dZ.parse`). */
export function parseSections(json: unknown): SidebarSection[] {
  const list: SidebarSection[] = []
  for (const item of arr(json) ?? []) {
    const id = str(field(item, 'id'))
    if (id == null) continue
    list.push({
      id,
      name: str(field(item, 'name')) ?? '',
      agentIds: (arr(field(item, 'agentIds')) ?? []).filter(
        (one): one is string => typeof one === 'string',
      ),
    })
  }
  return normalize(list)
}

/** What is written back (`setHostSettings({sidebarSections})`). */
export function sectionsJSON(sections: readonly SidebarSection[]): JSONValue {
  return sections.map((section) => ({
    id: section.id,
    name: section.name,
    agentIds: [...section.agentIds],
  }))
}

// MARK: Edits (each result normalised, as the window's `edit` does)

export function renameSection(
  sections: readonly SidebarSection[],
  id: string,
  name: string,
): SidebarSection[] {
  if (id === unassignedId) return normalize(sections)
  return normalize(
    sections.map((section) =>
      section.id === id ? { ...section, name } : section,
    ),
  )
}

export function removeSection(
  sections: readonly SidebarSection[],
  id: string,
): SidebarSection[] {
  if (id === unassignedId) return normalize(sections)
  return normalize(sections.filter((section) => section.id !== id))
}

/** A new section named "New section" at the top, holding these agents (they leave their old sections). */
export function createSection(
  sections: readonly SidebarSection[],
  id: string,
  agentIds: readonly string[],
): SidebarSection[] {
  return normalize([
    { id, name: newSectionName(), agentIds: [...agentIds] },
    ...sections,
  ])
}

/** A new section's id: `section-<time in base 36>-<count in base 36>`. */
export function newSectionId(seed: number, at = Date.now()): string {
  return `section-${Math.floor(at).toString(36)}-${seed.toString(36)}`
}

/** Moves agents into a section; to "Unassigned" takes them out of every section. */
export function assignAgents(
  sections: readonly SidebarSection[],
  agentIds: readonly string[],
  sectionId: string,
): SidebarSection[] {
  const moving: string[] = []
  for (const id of agentIds) if (!moving.includes(id)) moving.push(id)
  const gone = new Set(moving)
  const stripped = sections.map((section) => ({
    ...section,
    agentIds: section.agentIds.filter((id) => !gone.has(id)),
  }))
  if (sectionId === unassignedId) return normalize(stripped)
  return normalize(
    stripped.map((section) =>
      section.id === sectionId
        ? { ...section, agentIds: [...section.agentIds, ...moving] }
        : section,
    ),
  )
}

/** Puts a section before or after another; "Unassigned" never moves. */
export function moveSection(
  sections: readonly SidebarSection[],
  id: string,
  target: string,
  before: boolean,
): SidebarSection[] {
  const moving = sections.find((section) => section.id === id)
  if (
    id === unassignedId ||
    target === unassignedId ||
    !moving ||
    !sections.some((section) => section.id === target)
  )
    return normalize(sections)
  const rest = sections.filter((section) => section.id !== id)
  const index =
    rest.findIndex((section) => section.id === target) + (before ? 0 : 1)
  // As JavaScript's slice reads a negative place: from the end.
  const place =
    index < 0 ? Math.max(0, rest.length + index) : Math.min(index, rest.length)
  rest.splice(place, 0, moving)
  return normalize(rest)
}

// MARK: What the sidebar draws

/** A section as drawn: its agents in the list's own order, pinned ones left out (`Cct`). */
export interface ShownSection {
  id: string
  name: string
  isUnassigned: boolean
  isCollapsed: boolean
  agents: Agent[]
}

/** Every section of the person's (even empty), and "Unassigned" only when it has agents. */
export function shownSections(
  agents: readonly Agent[],
  pinnedIds: readonly string[],
  sections: readonly SidebarSection[],
  collapsed: ReadonlySet<string>,
): ShownSection[] {
  if (sections.length === 0) return []
  const pins = new Set(pinnedIds)
  const unpinned = agents.filter((agent) => !pins.has(agent.id))
  const owner = new Map<string, string>()
  for (const section of sections)
    if (!isUnassigned(section))
      for (const id of section.agentIds) owner.set(id, section.id)
  return sections
    .map((section) => ({
      id: section.id,
      name: section.name,
      isUnassigned: isUnassigned(section),
      isCollapsed: collapsed.has(section.id),
      agents: unpinned.filter((agent) =>
        isUnassigned(section)
          ? owner.get(agent.id) == null
          : owner.get(agent.id) === section.id,
      ),
    }))
    .filter((section) => section.agents.length > 0 || !section.isUnassigned)
}

/** The sidebar's order for ⇧-click and Control-Tab: the pins, then the list, or the open sections' agents (`Ict`). */
export function sidebarOrder(
  agents: readonly Agent[],
  pinnedIds: readonly string[],
  sections: readonly SidebarSection[],
  collapsed: ReadonlySet<string>,
): string[] {
  const byId = new Map<string, Agent>()
  for (const agent of agents) if (!byId.has(agent.id)) byId.set(agent.id, agent)
  const pinned = pinnedIds.filter((id) => byId.has(id))
  const pins = new Set(pinnedIds)
  if (sections.length === 0)
    return [
      ...pinned,
      ...agents.filter((agent) => !pins.has(agent.id)).map((agent) => agent.id),
    ]
  return [
    ...pinned,
    ...shownSections(agents, pinnedIds, sections, collapsed)
      .filter((section) => !section.isCollapsed)
      .flatMap((section) => section.agents.map((agent) => agent.id)),
  ]
}

/** The section an agent is in, or "Unassigned". */
export function sectionIdOf(
  agentId: string,
  sections: readonly SidebarSection[],
): string {
  return (
    sections.find(
      (section) => !isUnassigned(section) && section.agentIds.includes(agentId),
    )?.id ?? unassignedId
  )
}

// MARK: Words

/** "Move to" in the row's menu, for one row or a selection. */
export function moveLabel(count: number): string {
  return count > 1 ? t`Move ${count} agents to` : t('Move to')
}

/** The new-section item: "New section" under a list of sections, otherwise "Move to new section" (`Fct`). */
export function newSectionLabel(inList: boolean, count: number): string {
  if (inList) return newSectionName()
  return count > 1
    ? t`Move ${count} agents to new section`
    : t('Move to new section')
}

export function deleteSectionTitle(name: string): string {
  return t`Delete “${name}”`
}

export function deleteSectionMessage(): string {
  return t('Its agents move to Unassigned. No agents are deleted.')
}

export function emptySectionLine(): string {
  return t('Drag chats here')
}

// MARK: Several rows at once

/** ⌘-click, ⇧-click and a plain click, as the shipped sidebar does them. */
export class SidebarSelection {
  private constructor(
    readonly ids: ReadonlySet<string>,
    /** Where a ⇧-click range starts: the last row clicked. */
    readonly anchor?: string,
  ) {}

  static empty(): SidebarSelection {
    return new SidebarSelection(new Set())
  }

  get isEmpty(): boolean {
    return this.ids.size === 0
  }

  get count(): number {
    return this.ids.size
  }

  has(id: string): boolean {
    return this.ids.has(id)
  }

  /** ⌘-click: the row in or out. */
  toggle(id: string): SidebarSelection {
    const next = new Set(this.ids)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return new SidebarSelection(next, id)
  }

  /** ⇧-click: every row from the anchor to this one, in sidebar order; with no anchor, this row alone. */
  extend(id: string, order: readonly string[]): SidebarSelection {
    const end = order.indexOf(id)
    if (end < 0) return this
    const start = this.anchor != null ? order.indexOf(this.anchor) : -1
    if (start < 0) return new SidebarSelection(new Set([id]), id)
    return new SidebarSelection(
      new Set(order.slice(Math.min(start, end), Math.max(start, end) + 1)),
      this.anchor,
    )
  }

  /** A plain click: no selection, and this row the anchor. */
  plain(id: string): SidebarSelection {
    return new SidebarSelection(new Set(), id)
  }

  clear(): SidebarSelection {
    return this.isEmpty ? this : new SidebarSelection(new Set(), this.anchor)
  }

  /** Drops rows whose agents are gone. */
  keep(existing: ReadonlySet<string>): SidebarSelection {
    if ([...this.ids].every((id) => existing.has(id))) return this
    return new SidebarSelection(
      new Set([...this.ids].filter((id) => existing.has(id))),
      this.anchor,
    )
  }

  /** The rows the menu acts on for a right-clicked row: the selection when the row is in one of more than one, else the row. */
  targets(id: string): string[] {
    return this.ids.has(id) && this.ids.size > 1 ? [...this.ids] : [id]
  }
}

// MARK: Deleting

const allGroups = (agents: readonly Agent[]) =>
  agents.length > 0 && agents.every((agent) => agent.isGroup)

/** The delete confirmation's title for one or more agents or groups (`I3n`). */
export function deletionTitle(agents: readonly Agent[]): string {
  const count = agents.length
  if (count === 1) return t`Delete “${agents[0]!.name}”`
  return allGroups(agents)
    ? t`Delete ${count} groups`
    : t`Delete ${count} agents`
}

export function deletionMessage(agents: readonly Agent[]): string {
  const single = agents.length === 1
  if (allGroups(agents))
    return single
      ? t(
          "This permanently deletes the group and its chat history. The Agents in it are not deleted and remain available individually. This can't be undone.",
        )
      : t(
          "This permanently deletes the groups and their chat history. The Agents in them are not deleted and remain available individually. This can't be undone.",
        )
  return single
    ? t(
        "This permanently deletes the agent and its chat history. This can't be undone.",
      )
    : t(
        "This permanently deletes the agents and their chat history. This can't be undone.",
      )
}

export function deletionFailure(): string {
  return t('Deleting failed. Check your connection and try again.')
}

/** The row menu's item: "Delete", or "Delete N agents" for a selection. */
export function deletionMenuLabel(count: number): string {
  return count > 1 ? t`Delete ${count} agents` : t('Delete')
}

/** The host's settings, as `getHostSettings` answers: an object, or nothing. */
export function settingsObject(answer: unknown): Record<string, JSONValue> {
  return isObject(answer) ? answer : {}
}
