import Foundation

/**
 * Connect apps as the shipped window has it (the Plugins overlay,
 * `clients/apps/web/public/app/assets/view-B5Ug8wEm.js`): the catalog, the
 * box's servers and plugins, the agent's skills, and the overlay's rules,
 * ported function for function and checked against them run in Node
 * (Tests/…/Fixtures/plugins.json): the fuzzy search (`MFe`), the
 * Marketplace's order and sections (`Pl`, `ql`), what counts as added
 * (`et`), the Yours list (`rt`), the filter (`nt`), the counts, the tools'
 * names, the status words and the notices.
 */

/** A catalog entry (`getCatalog`). */
public struct PluginEntry: Equatable, Sendable, Identifiable {
  public struct Skill: Equatable, Sendable { public let name: String; public let description: String; public let sourceUrl: String? }
  public struct Connector: Equatable, Sendable { public let name: String; public let description: String }
  public struct Marketplace: Equatable, Sendable { public let name: String; public let displayName: String; public let ownership: String? }
  public struct Publisher: Equatable, Sendable { public let name: String; public let displayName: String; public let isUserOwned: Bool }
  public struct Field: Equatable, Sendable, Identifiable {
    public let key: String
    public let label: String
    public let isRequired: Bool
    public let isSecret: Bool
    public let placeholder: String?
    public let hint: String?
    public let defaultValue: String?
    public var id: String { key }
  }

  public let id: String
  public let name: String
  public let displayName: String
  public let description: String
  public let category: String
  public let iconUrl: String?
  public let homepage: String?
  public let skills: [Skill]?
  public let connectors: [Connector]?
  public let marketplace: Marketplace?
  public let publisher: Publisher?
  public let fields: [Field]?

  public init?(json: JSON) {
    guard let id = json["id"]?.text ?? json["pluginId"]?.text else { return nil }
    self.id = id
    name = json["name"]?.string ?? id
    displayName = json["displayName"]?.string ?? name
    description = json["description"]?.string ?? ""
    category = json["category"]?.string ?? ""
    iconUrl = json["iconUrl"]?.text
    homepage = json["homepage"]?.text
    skills = json["skills"]?.array?.map { Skill(name: $0["name"]?.string ?? "", description: $0["description"]?.string ?? "", sourceUrl: $0["sourceUrl"]?.text) }
    connectors = json["connectors"]?.array?.map { Connector(name: $0["name"]?.string ?? "", description: $0["description"]?.string ?? "") }
    marketplace = json["marketplace"]?.object.map { _ in Marketplace(name: json["marketplace"]?["name"]?.string ?? "", displayName: json["marketplace"]?["displayName"]?.string ?? "", ownership: json["marketplace"]?["ownership"]?.string) }
    publisher = json["publisher"]?.object.map { _ in Publisher(name: json["publisher"]?["name"]?.string ?? "", displayName: json["publisher"]?["displayName"]?.string ?? "", isUserOwned: json["publisher"]?["isUserOwned"]?.bool ?? false) }
    fields = json["fields"]?.array?.compactMap { field in
      guard let key = field["key"]?.string else { return nil }
      return Field(key: key, label: field["label"]?.string ?? key, isRequired: field["isRequired"]?.bool == true, isSecret: field["isSecret"]?.bool == true,
                   placeholder: field["placeholder"]?.string, hint: field["hint"]?.text, defaultValue: field["defaultValue"]?.string)
    }
  }

  /** Its connectors as the cards count them (`st`): its own name when the catalog lists none. */
  public var connectorList: [Connector] { connectors ?? [Connector(name: name, description: "")] }
  public var hasSetupFields: Bool { !(fields ?? []).isEmpty }
}

/** One account of one of the box's servers (`listServers`). */
public struct PluginServer: Equatable, Sendable {
  public let id: String
  public let name: String
  public let url: String?
  public let command: String?
  public let transport: String
  public let status: String
  public let statusDetail: String?
  public let toolCount: Int
  public let serverIdentifier: String
  public let rowServerIdentifier: String
  public let accountKey: String
  public let pluginId: String?
  public let isTeamServer: Bool
  public let isRequired: Bool
  public let managedByTeamPluginPolicy: Bool

  public static let defaultAccount = "default"

  public init?(json: JSON) {
    guard let id = json["id"]?.text else { return nil }
    self.id = id
    name = json["name"]?.string ?? id
    url = json["url"]?.text
    command = json["command"]?.text
    transport = json["transport"]?.string ?? ""
    status = json["status"]?.string ?? ""
    statusDetail = json["statusDetail"]?.text
    toolCount = json["toolCount"]?.int ?? 0
    serverIdentifier = json["serverIdentifier"]?.string ?? id
    rowServerIdentifier = json["rowServerIdentifier"]?.string ?? serverIdentifier
    accountKey = json["accountKey"]?.text ?? Self.defaultAccount
    pluginId = json["pluginId"]?.text
    isTeamServer = json["isTeamServer"]?.bool == true
    isRequired = json["isRequired"]?.bool == true
    managedByTeamPluginPolicy = json["managedByTeamPluginPolicy"]?.bool == true
  }

  /** `hs`: a team's server, or one the team requires, is the team's. */
  public var installMode: PluginInstallMode { isTeamServer || isRequired || managedByTeamPluginPolicy ? .teamRequired : .user }
}

public enum PluginInstallMode: String, Sendable { case teamRequired = "team-required", teamDefault = "team-default", user }

/** A plugin the box has on (`listEffectivePlugins`). */
public struct EffectivePlugin: Equatable, Sendable {
  public let pluginId: String
  public let displayName: String?
  public let isEnabled: Bool
  public let installMode: PluginInstallMode
  public let hasTeamConfiguredVariables: Bool

  public init?(json: JSON) {
    guard let id = json["pluginId"]?.text else { return nil }
    pluginId = id
    displayName = json["displayName"]?.text
    isEnabled = json["isEnabled"]?.bool == true
    installMode = PluginInstallMode(rawValue: json["installMode"]?.string ?? "") ?? .user
    hasTeamConfiguredVariables = json["hasTeamConfiguredVariables"]?.bool == true
  }
}

/** A tool of a server (`listServerTools`). */
public struct PluginTool: Equatable, Sendable, Identifiable {
  public let name: String
  public let title: String?
  public let description: String
  public var isDisabled: Bool
  public var id: String { name }

  public init?(json: JSON) {
    guard let name = json["name"]?.text else { return nil }
    self.name = name
    title = json["title"]?.text
    description = json["description"]?.string ?? ""
    isDisabled = json["isDisabled"]?.bool == true
  }
}

/** One of the agent's skills (`getAgentWorkflows`). */
public struct AgentSkill: Equatable, Sendable, Identifiable {
  public let id: String
  public let name: String
  public let description: String
  public let body: String
  public let trigger: JSON?
  public let sourceRef: String?
  public let source: String
  public let publishedByCurrentUser: Bool
  public let pluginId: String?
  public let isEnabledForAgent: Bool

  public init?(json: JSON) {
    guard let id = json["id"]?.text else { return nil }
    self.id = id
    name = json["name"]?.string ?? ""
    description = json["description"]?.string ?? ""
    body = json["body"]?.string ?? ""
    trigger = json["trigger"]
    sourceRef = json["sourceRef"]?.text
    source = json["source"]?.string ?? "workflow"
    publishedByCurrentUser = json["publishedByCurrentUser"]?.bool == true
    pluginId = json["pluginId"]?.text
    isEnabledForAgent = json["isEnabledForAgent"]?.bool ?? true
  }

  /** In Yours › Private (`Zn`): made here, or published by me. */
  public var isPrivate: Bool { source == "workflow" || (source == "plugin" && publishedByCurrentUser) }
  /** Its page stays open (`Rn`). */
  public var hasPage: Bool { isPrivate || source == "managed" }
  /** The row's line (`bi`). */
  public var subtitle: String { "\(source == "plugin" ? "Published" : "Created locally") · \(description.isEmpty ? "Skill" : description)" }
  /** The page's kind line. */
  public var kindLine: String { source == "plugin" ? "Shared with your team" : source == "managed" ? "Managed by your organization" : "Private skill" }
}

/** A row of Yours › Installed (`rt`): a plugin with its connectors, or a server no plugin claims. */
public enum PluginItem: Equatable, Sendable {
  case plugin(entry: PluginEntry, installMode: PluginInstallMode, connectors: [PluginServer])
  case connector(server: PluginServer, installMode: PluginInstallMode)

  public var installMode: PluginInstallMode {
    switch self {
    case .plugin(_, let mode, _), .connector(_, let mode): return mode
    }
  }
}

/** The Filter menu's choice (`qn`). */
public struct PluginFilter: Equatable, Sendable {
  public enum Kind: String, Sendable, CaseIterable { case all, connectors, skills }
  public enum Ownership: String, Sendable, CaseIterable { case all, team, `public` }
  public var type: Kind = .all
  public var ownership: Ownership = .all
  public init(type: Kind = .all, ownership: Ownership = .all) { self.type = type; self.ownership = ownership }
  public var isAll: Bool { type == .all && ownership == .all }

  public static func label(_ kind: Kind) -> String { kind == .all ? "All types" : kind == .connectors ? "Connectors" : "Skills" }
  public static func label(_ ownership: Ownership) -> String { ownership == .all ? "All" : ownership == .team ? "Team" : "Public" }
}

public enum Plugins {
  /** `MFe`: the query's letters in order in the text, more for word starts and runs; nil when they are not all there or too spread out. */
  public static func score(_ text: String, _ query: String) -> Double? {
    let q = Array(query.utf16)
    if q.isEmpty { return 0 }
    let original = Array(text.utf16)
    let lower = Array(text.lowercased().utf16)
    func unit(_ i: Int) -> UInt16? { i >= 0 && i < original.count ? original[i] : nil }
    let separators: Set<UInt16> = [32, 45, 95, 47, 46]
    var sum = 0.0, matched = 0, previous = -2, first = -1, last = -1
    for c in 0..<lower.count {
      if matched >= q.count { break }
      if lower[c] != q[matched] { continue }
      if first < 0 { first = c }
      let before = unit(c - 1)
      let boundary = c == 0 || before.map { separators.contains($0) } == true
      let camel = before.map { $0 >= 97 && $0 <= 122 } == true && unit(c).map { $0 >= 65 && $0 <= 90 } == true
      var points = 1.0
      if boundary || camel { points += 4 }
      if previous == c - 1 { points += 3 }
      sum += points
      previous = c; last = c; matched += 1
    }
    if matched < q.count || last - first + 1 > q.count * 3 { return nil }
    return sum - Double(first) * 0.1 - Double(lower.count) * 0.02
  }

  /** `localeCompare`, as near as Foundation gives it. */
  public static func compare(_ a: String, _ b: String) -> Bool {
    a.compare(b, options: [], range: nil, locale: Locale(identifier: "en_US")) == .orderedAscending
  }

  private static func ordered(_ a: String, _ b: String) -> ComparisonResult {
    a.compare(b, options: [], range: nil, locale: Locale(identifier: "en_US"))
  }

  /** Marketplace's list (`Pl`): A to Z with no query; else the entries the query finds, best first. */
  public static func search(_ catalog: [PluginEntry], _ query: String) -> [PluginEntry] {
    let q = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    let searching = !q.isEmpty
    var rows: [(entry: PluginEntry, key: String, score: Double, index: Int)] = []
    for (index, entry) in catalog.enumerated() {
      let found: Double? = searching ? entryScore(entry, q) : 0
      if let found { rows.append((entry, entry.displayName.lowercased(), found, index)) }
    }
    rows.sort { a, b in
      if searching && a.score != b.score { return a.score > b.score }
      let order = ordered(a.key, b.key)
      return order == .orderedSame ? a.index < b.index : order == .orderedAscending
    }
    return rows.map(\.entry)
  }

  private static func entryScore(_ entry: PluginEntry, _ q: String) -> Double? {
    let fields: [(String, Double)] = [
      (entry.displayName, 1), (entry.description, 0.5), (entry.category, 0.4),
      ((entry.skills ?? []).map(\.name).joined(separator: " "), 0.45), (entry.marketplace?.displayName ?? "", 0.4),
    ]
    var best: Double?
    for (text, weight) in fields {
      guard let found = score(text, q) else { continue }
      let weighted = found * weight
      if best == nil || weighted > best! { best = weighted }
    }
    return best
  }

  /** Yours' servers (`Tl`): all with no query; else those the query finds in the name, address, command or identifier, best first. */
  public static func search(_ servers: [PluginServer], _ query: String) -> [PluginServer] {
    let q = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    if q.isEmpty { return servers }
    var rows: [(server: PluginServer, score: Double, index: Int)] = []
    for (index, server) in servers.enumerated() {
      var scores: [Double] = []
      if let s = score(server.name, q) { scores.append(s) }
      if let url = server.url, let s = score(url, q) { scores.append(s * 0.3) }
      if let command = server.command, let s = score(command, q) { scores.append(s * 0.3) }
      if let s = score(server.serverIdentifier, q) { scores.append(s * 0.4) }
      if let best = scores.max() { rows.append((server, best, index)) }
    }
    rows.sort { a, b in
      if a.score != b.score { return a.score > b.score }
      let order = ordered(a.server.name, b.server.name)
      return order == .orderedSame ? a.index < b.index : order == .orderedAscending
    }
    return rows.map(\.server)
  }

  public struct Section: Equatable, Sendable {
    public let key: String
    public let title: String
    public let items: [PluginEntry]
  }

  public static let featured = "Featured"

  /** Marketplace's sections with no query (`ql`): by publisher, marketplace or category; Featured first, the rest A to Z, people's own publishers last. */
  public static func sections(_ entries: [PluginEntry]) -> [Section] {
    var plain: [(key: String, title: String, items: [PluginEntry])] = []
    var publishers: [(key: String, title: String, items: [PluginEntry])] = []
    for entry in entries {
      let key: String, title: String, mine: Bool
      if let publisher = entry.publisher, publisher.isUserOwned, entry.marketplace != nil {
        (key, title, mine) = ("publisher:\(publisher.name)", publisher.displayName, true)
      } else if let marketplace = entry.marketplace {
        (key, title, mine) = ("marketplace:\(marketplace.name)", marketplace.displayName, false)
      } else {
        (key, title, mine) = ("category:\(entry.category)", entry.category, false)
      }
      if mine {
        if let i = publishers.firstIndex(where: { $0.key == key }) { publishers[i].items.append(entry) } else { publishers.append((key, title, [entry])) }
      } else {
        if let i = plain.firstIndex(where: { $0.key == key }) { plain[i].items.append(entry) } else { plain.append((key, title, [entry])) }
      }
    }
    func sorted(_ list: [(key: String, title: String, items: [PluginEntry])], featuredFirst: Bool) -> [Section] {
      list.enumerated().sorted { a, b in
        let x = a.element.title, y = b.element.title
        if x == y { return a.offset < b.offset }
        if featuredFirst && x == featured { return true }
        if featuredFirst && y == featured { return false }
        let order = ordered(x, y)
        return order == .orderedSame ? a.offset < b.offset : order == .orderedAscending
      }
      .map { Section(key: $0.element.key, title: $0.element.title, items: $0.element.items) }
    }
    return sorted(plain, featuredFirst: true) + sorted(publishers, featuredFirst: false)
  }

  /** `Jn`: everything when shown in full or when one more would be all; else the first `limit` and how many are hidden. */
  public static func collapse<T>(_ items: [T], expanded: Bool, limit: Int) -> (visible: [T], hidden: Int) {
    expanded || items.count <= limit + 1 ? (items, 0) : (Array(items.prefix(limit)), items.count - limit)
  }

  public static let marketplaceLimit = 4
  public static let installedLimit = 6

  /** The box's servers, one row a server (`js`): the default account's row where there are several. */
  public static func onePerServer(_ servers: [PluginServer]) -> [PluginServer] {
    var order: [String] = []
    var rows: [String: PluginServer] = [:]
    for server in servers {
      if let kept = rows[server.id] {
        if kept.accountKey != PluginServer.defaultAccount && server.accountKey == PluginServer.defaultAccount { rows[server.id] = server }
      } else {
        order.append(server.id)
        rows[server.id] = server
      }
    }
    return order.compactMap { rows[$0] }
  }

  /** A server's accounts, the default first (`sd`). */
  public static func accounts(_ servers: [PluginServer], of id: String) -> [PluginServer] {
    let rows = servers.filter { $0.id == id }
    return rows.enumerated().sorted { a, b in
      let x = a.element.accountKey == PluginServer.defaultAccount ? 0 : 1
      let y = b.element.accountKey == PluginServer.defaultAccount ? 0 : 1
      return x == y ? a.offset < b.offset : x < y
    }.map(\.element)
  }

  /** Servers by lowercased name, a person's own over the team's (`Ss`). */
  public static func byName(_ servers: [PluginServer]) -> [String: PluginServer] {
    var map: [String: PluginServer] = [:]
    for server in servers where server.isTeamServer { map[server.name.lowercased()] = server }
    for server in servers where !server.isTeamServer { map[server.name.lowercased()] = server }
    return map
  }

  /** The catalog entry a server belongs to (`Ue`): by its plugin, else by name. */
  public static func entry(for server: PluginServer, in catalog: [PluginEntry]) -> PluginEntry? {
    if let id = server.pluginId, let found = catalog.first(where: { $0.id == id }) { return found }
    let key = server.name.lowercased()
    return catalog.first { $0.name.lowercased() == key || $0.displayName.lowercased() == key }
  }

  public struct Installed: Equatable, Sendable {
    public let isInstalled: Bool
    public let plugin: EffectivePlugin?
    public let server: PluginServer?
  }

  /** Whether an entry shows Added (`et`): its plugin is on, or a server of it is there (even one still to sign in). */
  public static func installed(_ entry: PluginEntry, servers: [PluginServer], byName: [String: PluginServer], plugins: [String: EffectivePlugin]) -> Installed {
    let named = byName[entry.name.lowercased()] ?? byName[entry.displayName.lowercased()]
    let plugin = plugins[entry.id]
    if let plugin, !plugin.isEnabled { return Installed(isInstalled: false, plugin: nil, server: nil) }
    let team = named?.isTeamServer == true ? named : nil
    let server = servers.first { $0.pluginId == entry.id } ?? team
    return Installed(isInstalled: plugin != nil || server != nil, plugin: plugin, server: server)
  }

  /** Yours › Installed (`rt`). */
  public static func items(_ servers: [PluginServer], catalog: [PluginEntry], plugins: [EffectivePlugin]) -> [PluginItem] {
    var byPlugin: [String: EffectivePlugin] = [:]
    var pluginOrder: [String] = []
    for plugin in plugins {
      if byPlugin[plugin.pluginId] == nil { pluginOrder.append(plugin.pluginId) }
      byPlugin[plugin.pluginId] = plugin
    }
    var list: [PluginItem] = []
    var placed: [String: Int] = [:]
    for server in servers {
      let entry = entry(for: server, in: catalog)
      let plugin = entry.flatMap { byPlugin[$0.id] }
      guard let entry, server.pluginId == entry.id || server.isTeamServer, plugin?.isEnabled != false else {
        list.append(.connector(server: server, installMode: server.installMode))
        continue
      }
      guard let index = placed[entry.id], case .plugin(_, let mode, let connectors) = list[index] else {
        placed[entry.id] = list.count
        list.append(.plugin(entry: entry, installMode: plugin?.installMode ?? server.installMode, connectors: [server]))
        continue
      }
      let next = server.isTeamServer ? connectors + [server] : [server] + connectors
      list[index] = .plugin(entry: entry, installMode: plugin != nil || server.isTeamServer ? mode : .user, connectors: next)
    }
    for id in pluginOrder {
      guard let plugin = byPlugin[id], plugin.isEnabled, placed[id] == nil, let entry = catalog.first(where: { $0.id == id }) else { continue }
      list.append(.plugin(entry: entry, installMode: plugin.installMode, connectors: []))
    }
    return list
  }

  /** A skills-only plugin stays in a search only when its name holds the query (`ui`). */
  public static func keeps(_ item: PluginItem, query: String) -> Bool {
    guard case .plugin(let entry, _, let connectors) = item, connectors.isEmpty else { return true }
    let q = query.lowercased()
    // JavaScript's `includes("")` is true; Swift's `contains("")` is not.
    return q.isEmpty || entry.displayName.lowercased().contains(q) || entry.name.lowercased().contains(q)
  }

  // MARK: The filter (`nt`, `Ul`, `Hl`, `fi`)

  private static func passes(connectors: Int, skills: Int?, _ kind: PluginFilter.Kind) -> Bool {
    switch kind {
    case .all: return true
    case .connectors: return connectors > 0
    case .skills: return (skills ?? 0) > 0
    }
  }

  private static func passes(_ owner: String, _ ownership: PluginFilter.Ownership) -> Bool { ownership == .all || owner == ownership.rawValue }

  private static func owner(_ entry: PluginEntry) -> String {
    guard let marketplace = entry.marketplace else { return "public" }
    return marketplace.ownership == "team" ? "team" : "neither"
  }

  public static func keeps(_ entry: PluginEntry, _ filter: PluginFilter, owner forced: String? = nil) -> Bool {
    passes(connectors: entry.connectorList.count, skills: entry.skills?.count, filter.type) && passes(forced ?? owner(entry), filter.ownership)
  }

  public static func keeps(_ item: PluginItem, _ filter: PluginFilter) -> Bool {
    let team = item.installMode != .user
    switch item {
    case .connector(let server, _):
      return passes(connectors: 1, skills: nil, filter.type) && passes(team || server.isTeamServer ? "team" : "neither", filter.ownership)
    case .plugin(let entry, _, _):
      return keeps(entry, filter, owner: team ? "team" : nil)
    }
  }

  public static func keeps(_ skill: AgentSkill, _ filter: PluginFilter) -> Bool {
    passes(connectors: 0, skills: 1, filter.type) && passes(skill.source == "plugin" ? "team" : "neither", filter.ownership)
  }

  /** Yours › Private (`Ml`): the agent's own skills and the ones I published, by name. */
  public static func privateSkills(_ skills: [AgentSkill]) -> [AgentSkill] {
    skills.filter(\.isPrivate).enumerated().sorted { a, b in
      let order = a.element.name.compare(b.element.name, options: [.caseInsensitive, .diacriticInsensitive], range: nil, locale: Locale(identifier: "en_US"))
      return order == .orderedSame ? a.offset < b.offset : order == .orderedAscending
    }.map(\.element)
  }

  // MARK: Words

  /** "1 connector", "2 skills" (`us`). */
  public static func count(_ n: Int, _ noun: String) -> String { "\(n) \(n == 1 ? noun : noun + "s")" }

  /** A plugin row's line (`tt`): its connectors and skills, or "no supported contributions". */
  public static func contributions(_ entry: PluginEntry) -> String {
    contributions(connectors: entry.connectorList.count, skills: entry.skills?.count)
  }

  public static func contributions(connectors: Int, skills: Int?) -> String {
    var parts: [String] = []
    if connectors > 0 { parts.append(count(connectors, "connector")) }
    if let skills, skills > 0 { parts.append(count(skills, "skill")) }
    return parts.isEmpty ? "no supported contributions" : parts.joined(separator: " · ")
  }

  /** A connector row's line (`Wl`): its entry's counts, else "1 connector". */
  public static func contributions(_ server: PluginServer, catalog: [PluginEntry]) -> String {
    entry(for: server, in: catalog).map(contributions) ?? contributions(connectors: 1, skills: nil)
  }

  /** The status pill's word (`LBn`). */
  public static func statusWord(_ status: String) -> String {
    switch status {
    case "connected": return "Connected"
    case "needsAuth": return "Needs auth"
    case "error": return "Error"
    case "initializing": return "Starting"
    case "disconnected": return "Disconnected"
    case "disabledByTeamAdminPolicy": return "Disabled by team admin"
    default: return status
    }
  }

  /** The tools' names (`Gl`): its title, else the name without the prefix all share, its separators as spaces, a capital first. */
  public static func toolNames(_ tools: [PluginTool]) -> [String: String] {
    let names = tools.map(\.name)
    let prefix = sharedPrefix(names)
    var map: [String: String] = [:]
    for tool in tools { map[tool.name] = tool.title ?? humanised(String(decoding: Array(tool.name.utf16.dropFirst(prefix.utf16.count)), as: UTF16.self)) }
    return map
  }

  static func sharedPrefix(_ names: [String]) -> String {
    guard names.count >= 2 else { return "" }
    let units = names.map { Array($0.utf16) }
    let head = units[0]
    var length = 0
    while length < head.count && units.allSatisfy({ length < $0.count && $0[length] == head[length] }) { length += 1 }
    let shared = Array(head.prefix(length))
    guard let cut = shared.lastIndex(where: { $0 == 45 || $0 == 95 || $0 == 46 }) else { return "" }
    let prefix = Array(shared.prefix(cut + 1))
    return units.allSatisfy({ $0.count > prefix.count }) ? String(decoding: prefix, as: UTF16.self) : ""
  }

  static func humanised(_ name: String) -> String {
    let spaced = name.replacingOccurrences(of: "[-_.]+", with: " ", options: .regularExpression).trimmingCharacters(in: .whitespacesAndNewlines)
    guard let first = spaced.first else { return name }
    return first.uppercased() + spaced.dropFirst()
  }

  /** An account's name (`vi`, `P5n`): "Default", else its key without quotes and brackets, 64 characters at most. */
  public static func accountLabel(_ key: String) -> String {
    if key == PluginServer.defaultAccount { return "Default" }
    let stripped = key.replacingOccurrences(of: "[\"'`\\\\\\[\\]{}()<>]", with: "", options: .regularExpression)
    let spaced = stripped.replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression).trimmingCharacters(in: .whitespacesAndNewlines)
    return String(decoding: Array(spaced.utf16.prefix(64)), as: UTF16.self)
  }

  /** The GitHub banner's line (`ni`). */
  public static func authBlockedLine(_ names: [String]) -> String {
    let named = names.filter { !$0.isEmpty }
    if named.isEmpty || named.count > 3 {
      return "\(names.count) installed \(names.count == 1 ? "plugin" : "plugins") can't be fetched until Simeon's computer can read their source repository."
    }
    return "\(named.joined(separator: ", ")) \(named.count == 1 ? "is" : "are") installed, but their content can't be fetched until Simeon's computer can read the source repository."
  }

  /** "Copy link"'s address (`Ll`). */
  public static func shareLink(_ pluginId: String) -> String {
    // `URLSearchParams`' encoding: letters, digits and *-._ kept, a space as +, the rest as %XX.
    let kept = Set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789*-._".utf8)
    let value = pluginId.utf8.map { byte -> String in
      if kept.contains(byte) { return String(UnicodeScalar(byte)) }
      return byte == 32 ? "+" : String(format: "%%%02X", byte)
    }.joined()
    return "https://simeonlabs.com/?pluginId=\(value)"
  }

  // MARK: Notices (`_l`, `An`, `Tn`)

  public struct Notice: Equatable, Sendable {
    public let isError: Bool
    public let text: String
    public init(isError: Bool, text: String) { self.isError = isError; self.text = text }
    /** How long it stays: 3.5 s, or 6 s for a failure. */
    public var seconds: Double { isError ? 6 : 3.5 }
  }

  public static func signInNotice(status: String, message: String?) -> Notice {
    switch status {
    case "already-authenticated": return Notice(isError: false, text: "Already authenticated")
    case "not-configured": return Notice(isError: true, text: "Server is not configured")
    case "not-supported": return Notice(isError: true, text: message ?? "")
    case "unreachable": return Notice(isError: true, text: "Couldn't start sign-in: \(message ?? "")")
    case "started": return Notice(isError: false, text: "Opened the OAuth flow in your browser. Return here once it completes.")
    default: return Notice(isError: true, text: message ?? status)
    }
  }

  public static func addedNotice(_ name: String, added: Int, failed: [String], error: String?) -> Notice {
    if error != nil || !failed.isEmpty {
      return Notice(isError: true, text: "Added \(name), but not all of its skills: \(error ?? "couldn't add \(failed.joined(separator: ", "))").")
    }
    return Notice(isError: false, text: added > 0 ? "Added \(name) and \(added == 1 ? "1 skill" : "\(added) skills")" : "Added \(name)")
  }

  public static func skillsAddedNotice(_ name: String, added: Int) -> Notice {
    Notice(isError: false, text: added == 0 ? "Added \(name)" : added == 1 ? "Added 1 skill from \(name)" : "Added \(added) skills from \(name)")
  }

  public static func removedNotice(_ name: String, removed: Bool, reason: String?) -> Notice {
    if removed { return Notice(isError: false, text: "Removed \(name)") }
    if reason == "team-server" { return Notice(isError: true, text: "\(name) is provided by your team and can't be removed here") }
    return Notice(isError: true, text: "Couldn't remove \(name). It may be managed elsewhere. Reopen settings and try again.")
  }

  /** "Plugin Setup", the agent Fix with agent makes, and what it is first told (`Ql`, `Xl`, `Zl`). */
  public static let setupAgentName = "Plugin Setup"
  public static let setupAgentPurpose = "plugin-auth"
  public static let setupAgentDescription = "Sets up git credentials on Simeon's computer so installed plugins can be fetched."
  public static let setupAgentRequest = [
    "Some of my installed plugins can't be fetched.",
    "Their content lives in a private git repository, and your computer — the machine Shell and Read act on, not mine — has no credentials to read it.",
    "Set that up on your computer: run `gh auth login` there, then `gh auth setup-git` so git itself uses the credential.",
    "When a step needs me (a device code, a password, 2FA, an OAuth approval), hand your computer over with request_box_help instead of guessing.",
    "Then verify with a read-only `git ls-remote` against one of those plugin repositories and tell me whether it worked. Don't change my repositories or any other credentials.",
  ].joined(separator: " ")
}
