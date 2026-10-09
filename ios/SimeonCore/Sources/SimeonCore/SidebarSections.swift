import Foundation

/** A section of the sidebar, as the host stores it (`sidebarSections` in the computer's settings). */
public struct SidebarSection: Hashable, Sendable {
  public var id: String
  public var name: String
  public var agentIds: [String]
  public init(id: String, name: String, agentIds: [String]) {
    self.id = id; self.name = name; self.agentIds = agentIds
  }
  public var isUnassigned: Bool { id == SidebarSections.unassignedId }
}

/**
 The sidebar's sections, with the shipped window's rules (`dZ` and the sections
 store's commands in the main bundle): a section claims agents, an agent belongs to
 the first section that names it, and "Unassigned" is always last and holds the rest.
 */
public enum SidebarSections {
  public static let unassignedId = "__agents__"
  public static let unassignedName = "Unassigned"
  public static let newName = "New section"

  /** Ids trimmed, empty and repeated ones dropped, each agent in its first section only; "Unassigned" appended, or nothing when no section of the person's is left (`dZ.normalize`). */
  public static func normalize(_ sections: [SidebarSection]) -> [SidebarSection] {
    var seenSections = Set<String>(), seenAgents = Set<String>()
    var out: [SidebarSection] = []
    for section in sections {
      let id = section.id.trimmingCharacters(in: .whitespacesAndNewlines)
      if id.isEmpty || seenSections.contains(id) { continue }
      seenSections.insert(id)
      if id == unassignedId { continue }
      var ids: [String] = []
      for agent in section.agentIds where !agent.isEmpty && !seenAgents.contains(agent) {
        seenAgents.insert(agent)
        ids.append(agent)
      }
      out.append(SidebarSection(id: id, name: section.name, agentIds: ids))
    }
    if out.isEmpty { return [] }
    out.append(SidebarSection(id: unassignedId, name: unassignedName, agentIds: []))
    return out
  }

  /** The host's `sidebarSections`, read the way the window reads it (`dZ.parse`). */
  public static func parse(_ json: JSON?) -> [SidebarSection] {
    let list = (json?.array ?? []).compactMap { item -> SidebarSection? in
      guard case .string(let id)? = item["id"] else { return nil }
      let name: String
      if case .string(let n)? = item["name"] { name = n } else { name = "" }
      let ids = item["agentIds"]?.array?.compactMap { value -> String? in
        if case .string(let s) = value { return s }
        return nil
      } ?? []
      return SidebarSection(id: id, name: name, agentIds: ids)
    }
    return normalize(list)
  }

  /** What is written back (`setHostSettings({sidebarSections})`). */
  public static func json(_ sections: [SidebarSection]) -> JSON {
    .array(sections.map { ["id": .string($0.id), "name": .string($0.name), "agentIds": JSON($0.agentIds)] })
  }

  // MARK: Edits (each result normalised, as the window's `edit` does)

  public static func rename(_ sections: [SidebarSection], id: String, to name: String) -> [SidebarSection] {
    if id == unassignedId { return normalize(sections) }
    return normalize(sections.map { $0.id == id ? SidebarSection(id: $0.id, name: name, agentIds: $0.agentIds) : $0 })
  }

  public static func remove(_ sections: [SidebarSection], id: String) -> [SidebarSection] {
    if id == unassignedId { return normalize(sections) }
    return normalize(sections.filter { $0.id != id })
  }

  /** A new section named "New section" at the top, holding these agents (they leave their old sections). */
  public static func create(_ sections: [SidebarSection], id: String, agentIds: [String]) -> [SidebarSection] {
    normalize([SidebarSection(id: id, name: newName, agentIds: agentIds)] + sections)
  }

  /** A new section's id: `section-<time in base 36>-<count in base 36>`. */
  public static func newId(at date: Date = Date(), seed: Int) -> String {
    "section-\(String(Int64((date.timeIntervalSince1970 * 1000).rounded(.down)), radix: 36))-\(String(seed, radix: 36))"
  }

  /** Moves agents into a section; to "Unassigned" takes them out of every section. */
  public static func assign(_ sections: [SidebarSection], agentIds: [String], to sectionId: String) -> [SidebarSection] {
    var moving: [String] = []
    for id in agentIds where !moving.contains(id) { moving.append(id) }
    let gone = Set(moving)
    let stripped = sections.map { SidebarSection(id: $0.id, name: $0.name, agentIds: $0.agentIds.filter { !gone.contains($0) }) }
    if sectionId == unassignedId { return normalize(stripped) }
    return normalize(stripped.map { $0.id == sectionId ? SidebarSection(id: $0.id, name: $0.name, agentIds: $0.agentIds + moving) : $0 })
  }

  /** Puts a section before or after another; "Unassigned" never moves. */
  public static func move(_ sections: [SidebarSection], id: String, to target: String, before: Bool) -> [SidebarSection] {
    guard id != unassignedId, target != unassignedId,
          let moving = sections.first(where: { $0.id == id }), sections.contains(where: { $0.id == target }) else { return normalize(sections) }
    var rest = sections.filter { $0.id != id }
    let index = (rest.firstIndex { $0.id == target } ?? -1) + (before ? 0 : 1)
    // As JavaScript's slice reads a negative place: from the end.
    rest.insert(moving, at: index < 0 ? max(0, rest.count + index) : min(index, rest.count))
    return normalize(rest)
  }

  // MARK: What the sidebar draws

  /** A section as drawn: its agents in the list's own order, pinned ones left out (`Cct`). */
  public struct Shown: Identifiable, Hashable {
    public let id: String
    public let name: String
    public let isUnassigned: Bool
    public let isCollapsed: Bool
    public let agents: [Agent]
  }

  /** Every section of the person's (even empty), and "Unassigned" only when it has agents. */
  public static func shown(agents: [Agent], pinnedIds: [String], sections: [SidebarSection], collapsed: Set<String>) -> [Shown] {
    if sections.isEmpty { return [] }
    let pins = Set(pinnedIds)
    let unpinned = agents.filter { !pins.contains($0.id) }
    var owner: [String: String] = [:]
    for section in sections where !section.isUnassigned { for id in section.agentIds { owner[id] = section.id } }
    return sections.map { section in
      Shown(id: section.id, name: section.name, isUnassigned: section.isUnassigned, isCollapsed: collapsed.contains(section.id),
            agents: unpinned.filter { section.isUnassigned ? owner[$0.id] == nil : owner[$0.id] == section.id })
    }.filter { !$0.agents.isEmpty || !$0.isUnassigned }
  }

  /** The sidebar's order for ⌘1–⌘9, ⌥↑/⌥↓ and ⇧-click: the pins, then the list, or the open sections' agents (`Ict`). */
  public static func order(agents: [Agent], pinnedIds: [String], sections: [SidebarSection], collapsed: Set<String>) -> [String] {
    let byId = Dictionary(agents.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
    let pinned = pinnedIds.compactMap { byId[$0]?.id }
    let pins = Set(pinnedIds)
    if sections.isEmpty { return pinned + agents.filter { !pins.contains($0.id) }.map(\.id) }
    return pinned + shown(agents: agents, pinnedIds: pinnedIds, sections: sections, collapsed: collapsed)
      .filter { !$0.isCollapsed }.flatMap { $0.agents.map(\.id) }
  }

  /** The section an agent is in, or "Unassigned". */
  public static func sectionId(of agentId: String, in sections: [SidebarSection]) -> String {
    sections.first { !$0.isUnassigned && $0.agentIds.contains(agentId) }?.id ?? unassignedId
  }

  // MARK: Words

  /** "Move to" in the row's menu, for one row or a selection. */
  public static func moveLabel(count: Int) -> String { count > 1 ? "Move \(count) agents to" : "Move to" }

  /** The new-section item: "New section" under a list of sections, otherwise "Move to new section" (`Fct`). */
  public static func newSectionLabel(inList: Bool, count: Int) -> String {
    inList ? newName : count > 1 ? "Move \(count) agents to new section" : "Move to new section"
  }

  public static func deleteTitle(name: String) -> String { "Delete \u{201C}\(name)\u{201D}" }
  public static let deleteMessage = "Its agents move to Unassigned. No agents are deleted."
  public static let emptySection = "Drag chats here"
}

/** Several rows at once: ⌘-click, ⇧-click and a plain click, as the shipped sidebar does them. */
public struct SidebarSelection: Equatable, Sendable {
  public private(set) var ids: Set<String> = []
  /** Where a ⇧-click range starts: the last row clicked. */
  public private(set) var anchor: String?

  public init() {}

  public var isEmpty: Bool { ids.isEmpty }
  public var count: Int { ids.count }
  public func contains(_ id: String) -> Bool { ids.contains(id) }

  /** ⌘-click: the row in or out. */
  public mutating func toggle(_ id: String) {
    anchor = id
    if ids.contains(id) { ids.remove(id) } else { ids.insert(id) }
  }

  /** ⇧-click: every row from the anchor to this one, in sidebar order; with no anchor, this row alone. */
  public mutating func extend(to id: String, order: [String]) {
    guard let end = order.firstIndex(of: id) else { return }
    guard let anchor, let start = order.firstIndex(of: anchor) else {
      self.anchor = id
      ids = [id]
      return
    }
    ids = Set(order[min(start, end)...max(start, end)])
  }

  /** A plain click: no selection, and this row the anchor. */
  public mutating func plain(_ id: String) {
    anchor = id
    ids = []
  }

  public mutating func clear() { ids = [] }

  /** Drops rows whose agents are gone. */
  public mutating func keep(_ existing: Set<String>) {
    if !ids.isSubset(of: existing) { ids = ids.intersection(existing) }
  }

  /** The rows the menu acts on for a right-clicked row: the selection when the row is in one of more than one, else the row. */
  public func targets(for id: String) -> [String] {
    ids.contains(id) && ids.count > 1 ? Array(ids) : [id]
  }
}

/** The delete confirmation for one or more agents or groups (`I3n`). */
public enum AgentDeletion {
  public static func title(_ agents: [Agent]) -> String {
    if agents.count == 1 { return "Delete \u{201C}\(agents[0].name)\u{201D}" }
    return "Delete \(agents.count) \(allGroups(agents) ? "groups" : "agents")"
  }

  public static func message(_ agents: [Agent]) -> String {
    let single = agents.count == 1
    if allGroups(agents) {
      return single
        ? "This permanently deletes the group and its chat history. The Agents in it are not deleted and remain available individually. This can't be undone."
        : "This permanently deletes the groups and their chat history. The Agents in them are not deleted and remain available individually. This can't be undone."
    }
    return single
      ? "This permanently deletes the agent and its chat history. This can't be undone."
      : "This permanently deletes the agents and their chat history. This can't be undone."
  }

  public static let pending = "Deleting..."
  public static let failure = "Deleting failed. Check your connection and try again."

  /** The row menu's item: "Delete", or "Delete N agents" for a selection. */
  public static func menuLabel(count: Int) -> String { count > 1 ? "Delete \(count) agents" : "Delete" }

  static func allGroups(_ agents: [Agent]) -> Bool { !agents.isEmpty && agents.allSatisfy(\.isGroup) }
}
