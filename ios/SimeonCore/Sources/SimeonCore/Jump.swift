import Foundation

/**
 * The Mac window's search (⌘K, its command palette `QFn`), as its code
 * does it: the matching (`Wmt`, `MFe`, `Pme`, `xFn`), what is listed for
 * each tab and in which order (`SFn`), the actions (`RDn`), the links of
 * the open chat (`SEn`), and the words each row and empty tab shows.
 */
public enum Jump {
  // MARK: Matching

  /**
   * A text's letters and digits, accents taken off and in lower case, any
   * run of other characters one space, and for each kept letter the place
   * (in characters) it came from, -1 for a space (`Wmt`).
   */
  public static func normalize(_ text: String) -> (normalized: [Character], sources: [Int]) {
    var out: [Character] = []
    var sources: [Int] = []
    var gap = false
    for (index, character) in text.enumerated() {
      let stripped = String(character).decomposedStringWithCompatibilityMapping.unicodeScalars.filter { scalar in
        switch scalar.properties.generalCategory {
        case .nonspacingMark, .spacingMark, .enclosingMark: return false
        default: return true
        }
      }
      let lowered = String(String.UnicodeScalarView(stripped)).lowercased()
      for letter in lowered {
        guard letter.isLetter || letter.isNumber else {
          gap = true
          continue
        }
        if gap && !out.isEmpty {
          out.append(" ")
          sources.append(-1)
        }
        gap = false
        out.append(letter)
        sources.append(index)
      }
    }
    return (out, sources)
  }

  /** The query's words (`Wf`). */
  public static func tokens(_ text: String) -> [String] {
    let normalized = String(normalize(text).normalized)
    return normalized.isEmpty ? [] : normalized.split(separator: " ").map(String.init)
  }

  /**
   * How well a word is found in a normalized text, or nil (`MFe`): its
   * letters in order, each first found; a letter starting a word scores 5,
   * one right after the last 3 more, any other 1; the letters within three
   * times the word's length; less the place of the first letter (0.1 a
   * letter) and the text's length (0.02 a letter).
   */
  public static func score(_ text: [Character], _ word: [Character]) -> Double? {
    if word.isEmpty { return 0 }
    var total = 0.0
    var matched = 0
    var last = -2
    var first = -1
    var end = -1
    var index = 0
    while index < text.count && matched < word.count {
      defer { index += 1 }
      guard text[index] == word[matched] else { continue }
      if first < 0 { first = index }
      let before: Character? = index > 0 ? text[index - 1] : nil
      let starts = before == nil || before == " " || before == "-" || before == "_" || before == "/" || before == "."
      var points = 1.0
      if starts { points += 4 }
      if last == index - 1 { points += 3 }
      total += points
      last = index
      end = index
      matched += 1
    }
    if matched < word.count || end - first + 1 > word.count * 3 { return nil }
    return total - Double(first) * 0.1 - Double(text.count) * 0.02
  }

  /**
   * A row's score for the query's words, or nil when a word is found
   * neither in its label nor in its keywords (`Pme`): each word's best,
   * plus the whole query's in the label.
   */
  public static func rank(label: String, keywords: [String] = [], tokens: [String], query: String) -> Double? {
    let main = normalize(label).normalized
    let all = [main] + keywords.map { normalize($0).normalized }
    var total = 0.0
    for token in tokens {
      let word = Array(token)
      guard let best = all.compactMap({ score($0, word) }).max() else { return nil }
      total += best
    }
    return total + (score(main, Array(query)) ?? 0)
  }

  /** A label in runs, each the query's words found in it (shown bold) or not (`xFn`). */
  public static func marks(_ label: String, query: String) -> [(text: String, isMatch: Bool)] {
    let words = tokens(query)
    guard !words.isEmpty, !label.isEmpty else { return [(label, false)] }
    let (normalized, sources) = normalize(label)
    let characters = Array(label)
    var lit = Array(repeating: false, count: characters.count)
    for word in words {
      let letters = Array(word)
      var from = 0
      while from + letters.count <= normalized.count {
        guard let at = (from...(normalized.count - letters.count)).first(where: { Array(normalized[$0..<($0 + letters.count)]) == letters }) else { break }
        for offset in 0..<letters.count where sources[at + offset] >= 0 { lit[sources[at + offset]] = true }
        from = at + letters.count
      }
    }
    var runs: [(text: String, isMatch: Bool)] = []
    for (index, character) in characters.enumerated() {
      if let lastRun = runs.last, lastRun.isMatch == lit[index] {
        runs[runs.count - 1].text.append(character)
      } else {
        runs.append((String(character), lit[index]))
      }
    }
    return runs
  }

  // MARK: Actions

  /** An action (`commands`): its id, words, icon (the window's name), what it is found by, its line, whether it is the one in use. */
  public struct Command: Identifiable, Hashable, Sendable {
    public let id: String
    public let label: String
    public let icon: String
    public let keywords: [String]
    public let detail: String?
    public let isActive: Bool

    public init(id: String, label: String, icon: String, keywords: [String], detail: String? = nil, isActive: Bool = false) {
      self.id = id; self.label = label; self.icon = icon; self.keywords = keywords; self.detail = detail; self.isActive = isActive
    }
  }

  /**
   * The actions in the window's order (`zRn`, `MDn`, `RDn`): Org Chart
   * (with the agent network on and agents to show), Open Hidden Agents
   * (with any hidden); for an open chat, Members (a group of the person's),
   * Channels (when the chat can have some) and Chat Settings; Settings:
   * General and Usage & Billing; Plugins; the three themes, the one in use
   * ticked.
   */
  public static func commands(orgChart: Bool, hiddenCount: Int, current: Agent?, hasChannels: Bool, usage: Bool = true, theme: String) -> [Command] {
    var list: [Command] = []
    if orgChart {
      list.append(Command(id: "view:org-chart", label: "Org Chart", icon: "organization-filled", keywords: ["open", "organization", "network", "graph"], detail: "Views"))
    }
    if hiddenCount > 0 {
      list.append(Command(id: "open-hidden-chats", label: "Open Hidden Agents", icon: "eye-slash", keywords: ["hidden", "unhide", "hide", "sidebar", "bots"], detail: "Sidebar"))
    }
    if let current {
      if current.isGroup && !current.isRemoteRoom {
        list.append(Command(id: "info:members", label: "Members", icon: "people", keywords: ["people", "group", "participants"], detail: "Current chat"))
      }
      if hasChannels {
        list.append(Command(id: "info:channels", label: "Channels", icon: "chat-bubbles", keywords: ["messaging", "platforms", "connect"], detail: "Current chat"))
      }
      list.append(Command(id: "info:settings", label: "Chat Settings", icon: "settings-gear", keywords: ["details", "notifications"], detail: "Current chat"))
    }
    list.append(Command(id: "settings:general", label: "Settings: General", icon: "settings-gear",
                        keywords: ["account", "model", "notifications", "preferences", "appearance", "theme", "mode", "security", "yubikey", "webauthn"], detail: "Settings"))
    if usage {
      list.append(Command(id: "settings:usage", label: "Settings: Usage & Billing", icon: "chart-bars",
                          keywords: ["usage", "billing", "spend", "limit", "on-demand", "plan", "quota"], detail: "Settings"))
    }
    list.append(Command(id: "overlay:plugins", label: "Plugins", icon: "plug", keywords: ["plugins", "marketplace", "tools", "skills", "mcp", "connectors", "customize"]))
    let themes: [(String, String, String, [String])] = [
      ("system", "Theme: System", "display", ["appearance", "os", "auto", "follow"]),
      ("light", "Theme: Light", "sun", ["appearance", "day", "bright"]),
      ("dark", "Theme: Dark", "moon", ["appearance", "night", "mode"]),
    ]
    for (id, label, icon, keywords) in themes {
      list.append(Command(id: "theme:\(id)", label: label, icon: icon, keywords: keywords, detail: "Settings · Appearance", isActive: id == theme))
    }
    return list
  }

  // MARK: Rows

  /** One row of results (`fSe`): an agent or group (hidden ones only for a query), an action, a message, a file, a link or a routine. */
  public enum Row: Identifiable, Hashable, Sendable {
    case agent(Agent, hidden: Bool)
    case command(Command)
    case message(MessageHit)
    case file(FileHit)
    case link(String)
    case routine(RoutineHit)

    public var id: String {
      switch self {
      case .agent(let agent, _): return "agent:\(agent.id)"
      case .command(let command): return "command:\(command.id)"
      case .message(let hit): return "message:\(hit.agentId):\(hit.entryId)"
      case .file(let hit): return "file:\(hit.agentId):\(hit.entryId)"
      case .link(let url): return "link:\(url)"
      case .routine(let hit): return "routine:\(hit.agentId):\(hit.routine.id)"
      }
    }

    /** What the All tab says at its right (`kFn`). */
    public var kind: String {
      switch self {
      case .agent(let agent, _): return agent.isGroup ? "Group" : "Agent"
      case .command: return "Action"
      case .message: return "Message"
      case .file: return "File"
      case .link: return "Link"
      case .routine: return "Routine"
      }
    }

    /** A message's or file's time, when it has one (`O0t`). */
    public var timestampMs: Double? {
      switch self {
      case .message(let hit): return hit.timestampMs.flatMap { $0 > 0 ? $0 : nil }
      case .file(let hit): return hit.timestampMs.flatMap { $0 > 0 ? $0 : nil }
      default: return nil
      }
    }

    /** The date at a routine's right in its own tab: its last run, or when it was made (`wFn`). */
    public var dateMs: Double? {
      guard timestampMs == nil, case .routine(let hit) = self, let date = hit.date, date > 0 else { return nil }
      return date
    }

    /** The words a row is found by (`TFn`). */
    var searchable: (label: String, keywords: [String]) {
      switch self {
      case .agent(let agent, _):
        let title = agent.isGroup ? "" : agent.title.trimmingCharacters(in: .whitespacesAndNewlines)
        return (agent.name, title.isEmpty ? [] : [title])
      case .command(let command): return (command.label, command.keywords)
      case .message(let hit): return (hit.snippet, Jump.tokens(hit.snippet))
      case .file(let hit): return (hit.fileName, Jump.tokens(hit.fileName))
      case .link(let url): return (Jump.address(url), Jump.tokens(url))
      case .routine(let hit): return (hit.routine.name, [hit.routine.summary])
      }
    }

    /** The row's words, bold where the query is found (`JFn`); a link's are its page's title or address. */
    public var title: String {
      switch self {
      case .agent(let agent, _): return agent.name
      case .command(let command): return command.label
      case .message(let hit): return hit.snippet
      case .file(let hit): return hit.fileName
      case .link(let url): return Jump.address(url)
      case .routine(let hit): return hit.routine.name
      }
    }

    /** Whether it belongs on a tab (`bFn`). */
    func belongs(to tab: SearchTab) -> Bool {
      switch (tab, self) {
      case (.all, _): return true
      case (.messages, .message), (.files, .file), (.links, .link), (.routines, .routine), (.actions, .command): return true
      case (.agents, .agent(let agent, _)): return !agent.isGroup
      case (.groups, .agent(let agent, _)): return agent.isGroup
      default: return false
      }
    }
  }

  /** A link's address without its scheme (`L0t`): the host and the path, no lone "/". */
  public static func address(_ url: String) -> String {
    guard let parts = URLComponents(string: url), let host = parts.host, !host.isEmpty else { return url }
    let path = parts.percentEncodedPath
    return host + (path == "/" ? "" : path)
  }

  /**
   * What a tab lists (`SFn`). With no query: All lists the agents (the pins
   * first) and the actions; the other tabs their own of the agents, files,
   * links, routines and actions. With a query: every row whose words match,
   * best first; then the computer's own matches for messages and files that
   * the words did not find (not while they are for older words); then the
   * hidden agents that match.
   */
  public static func results(
    agents: [Agent], hidden: [Agent], commands: [Command], messages: [MessageHit] = [], files: [FileHit] = [],
    messagesStale: Bool = false, filesStale: Bool = false, links: [String] = [], routines: [RoutineHit] = [],
    tab: SearchTab, query: String
  ) -> [Row] {
    func only(_ rows: [Row]) -> [Row] { rows.filter { $0.belongs(to: tab) } }
    let agentRows = only(agents.map { .agent($0, hidden: false) })
    let commandRows = only(commands.map(Row.command))
    let fileRows = only(files.map(Row.file))
    let linkRows = only(links.map(Row.link))
    let routineRows = only(routines.map(Row.routine))
    let words = tokens(query)
    if words.isEmpty {
      return tab == .all ? agentRows + commandRows : agentRows + fileRows + linkRows + routineRows + commandRows
    }
    let joined = words.joined(separator: " ")
    let messageRows = only(messages.map(Row.message))
    let ranked = rank(agentRows + commandRows + fileRows + linkRows + routineRows + messageRows, tokens: words, query: joined)
    let found = Set(ranked.map(\.id))
    let more = ((messagesStale ? [] : messageRows) + (filesStale ? [] : fileRows)).filter { !found.contains($0.id) }
    let hiddenRows = rank(only(hidden.map { .agent($0, hidden: true) }), tokens: words, query: joined)
    return ranked + more + hiddenRows
  }

  static func rank(_ rows: [Row], tokens: [String], query: String) -> [Row] {
    var scored: [(row: Row, score: Double, order: Int)] = []
    for (order, row) in rows.enumerated() {
      let words = row.searchable
      if let score = rank(label: words.label, keywords: words.keywords, tokens: tokens, query: query) {
        scored.append((row, score, order))
      }
    }
    // Best first; equal scores keep their order, as the window's stable sort does.
    return scored.sorted { $0.score != $1.score ? $0.score > $1.score : $0.order < $1.order }.map(\.row)
  }

  /** The agents in the window's order for search (`Pln`): the pins in their order, then the rest as listed. */
  public static func ordered(_ agents: [Agent], pinnedIds: [String]) -> [Agent] {
    let byId = Dictionary(agents.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
    let pins = pinnedIds.compactMap { byId[$0] }
    let pinned = Set(pins.map(\.id))
    return pins + agents.filter { !pinned.contains($0.id) }
  }

  // MARK: Tabs and their words

  /** The tabs shown: those the computer's index answers only while its search is on (`gFn`). */
  public static func tabs(globalSearch: Bool) -> [SearchTab] {
    globalSearch ? SearchTab.allCases : SearchTab.allCases.filter { !$0.needsIndex }
  }

  /** Tab or Left and Right: the next tab round (`zWe`). */
  public static func nextTab(_ tab: SearchTab, by step: Int, in tabs: [SearchTab]) -> SearchTab {
    guard let index = tabs.firstIndex(of: tab), !tabs.isEmpty else { return tab }
    return tabs[(index + step + tabs.count) % tabs.count]
  }

  /** ⌘1 to ⌘9 for the first nine rows (`IFn`). */
  public static func shortcut(_ index: Int) -> Int? { index < 9 ? index + 1 : nil }

  /** What an empty tab says (`GFn`, `VFn`): its words, a line under them, and whether its icon is the glass (else people). */
  public static func empty(tab: SearchTab, unavailable: Bool) -> (label: String, hint: String?, glass: Bool) {
    if unavailable { return ("Search unavailable", "Try again in a moment.", true) }
    switch tab {
    case .all, .agents: return ("No agents yet", nil, false)
    case .messages: return ("Search messages", "Type to find messages across your chats.", true)
    case .groups: return ("No group chats yet", nil, false)
    case .files: return ("No files yet", nil, false)
    case .links: return ("No links in this chat yet", nil, false)
    case .routines: return ("No routines yet", nil, false)
    case .actions: return ("No actions", nil, false)
    }
  }

  /** Where a list from the computer stands (`_0t`, `sJt`). */
  public enum Status: Sendable { case empty, loading, ready, failed }

  /** Whether the tab waits on the computer, could not get its answer, or has what it needs (`vFn`). */
  public enum Settled: Sendable { case settled, pending, unavailable }

  public static func settled(tab: SearchTab, globalSearch: Bool, filtered: Bool, messages: Status, files: Status, routines: Status) -> Settled {
    guard globalSearch else { return .settled }
    var asked: [Status] = []
    if filtered && (tab == .all || tab == .messages) { asked.append(messages) }
    if tab == .files || (tab == .all && filtered) { asked.append(files) }
    if tab == .routines || (tab == .all && filtered) { asked.append(routines) }
    if asked.contains(.loading) { return .pending }
    if asked.contains(.failed) { return .unavailable }
    return .settled
  }

  /**
   * A row's second line (`qFn`, `jFn`): an agent's description, a group's
   * members, an action's line, "Theo to you · 5m ago", "Scout · 1280×800 ·
   * 1d ago", a routine's schedule and agent.
   */
  public static func subtitle(_ row: Row, agents: [String: Agent], now: Date = Date()) -> String {
    switch row {
    case .agent(let agent, _):
      return agent.isGroup ? agent.memberIds.compactMap { agents[$0]?.name }.filter { !$0.isEmpty }.joined(separator: ", ") : agent.description
    case .command(let command): return command.detail ?? ""
    case .message(let hit): return Search.messageLine(hit, chat: agents[hit.agentId], now: now)
    case .file(let hit): return Search.fileLine(hit, chat: agents[hit.agentId], now: now)
    case .link: return ""
    case .routine(let hit): return [hit.routine.summary, agents[hit.agentId]?.name ?? ""].filter { !$0.isEmpty }.joined(separator: " · ")
    }
  }

  // MARK: The open chat's links

  /**
   * The links in a chat's lines, in their order, each once (`SEn`): a
   * message's Markdown links (not its pictures), a message that is only an
   * address, an attachment on the web.
   */
  public static func links(_ entries: [Entry]) -> [String] {
    var found: [String] = []
    var seen = Set<String>()
    func add(_ raw: String) {
      guard let url = web(raw), seen.insert(url).inserted else { return }
      found.append(url)
    }
    func text(_ content: String) {
      guard !content.isEmpty else { return }
      let range = NSRange(content.startIndex..., in: content)
      let withoutPictures = picture.stringByReplacingMatches(in: content, range: range, withTemplate: " ")
      let rest = NSRange(withoutPictures.startIndex..., in: withoutPictures)
      for match in markdownLink.matches(in: withoutPictures, range: rest) {
        if let url = Range(match.range(at: 1), in: withoutPictures) { add(String(withoutPictures[url])) }
      }
      add(content)
    }
    for entry in entries {
      switch entry.kind {
      case "message":
        text(entry.content ?? "")
      case "send-message":
        guard let message = entry.message else { continue }
        switch message["type"]?.string {
        case "text": text(message["content"]?.string ?? "")
        case "attachment": if let url = message["url"]?.text { add(url) }
        default: break
        }
      default:
        break
      }
    }
    return found
  }

  private static let picture = try! NSRegularExpression(pattern: #"!\[[^\]]*\]\(\s*([^)\s]+)(?:\s+[^)]*)?\)"#)
  private static let markdownLink = try! NSRegularExpression(pattern: #"\[[^\]]*\]\(\s*([^)\s]+)(?:\s+[^)]*)?\)"#)

  /** An address on the web, written as the window writes it back (`YAe`): http or https, with a host; nil otherwise. */
  static func web(_ raw: String) -> String? {
    let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    let lower = trimmed.lowercased()
    guard lower.hasPrefix("http://") || lower.hasPrefix("https://") else { return nil }
    // A space in the host is not an address; one after it is written %20, as a browser writes it.
    let afterScheme = trimmed[trimmed.index(trimmed.startIndex, offsetBy: lower.hasPrefix("https://") ? 8 : 7)...]
    let host = afterScheme.prefix { $0 != "/" && $0 != "?" && $0 != "#" }
    guard !host.isEmpty, !host.contains(where: \.isWhitespace) else { return nil }
    guard var parts = URLComponents(string: trimmed.replacingOccurrences(of: " ", with: "%20")), let name = parts.host, !name.isEmpty else { return nil }
    parts.scheme = parts.scheme?.lowercased()
    parts.host = name.lowercased()
    if parts.percentEncodedPath.isEmpty { parts.percentEncodedPath = "/" }
    return parts.string
  }
}

extension AppStore {
  /** Whether the agent network is on for this account (`isAgentNetworkEnabled`): the Org Chart's gate. */
  public func agentNetworkEnabled() async -> Bool {
    guard let backend, let answer = try? await backend.command("isAgentNetworkEnabled", [:]) else { return false }
    return answer.bool ?? answer["enabled"]?.bool ?? false
  }

  /** Whether a chat can have channels (`getAgentChannels`, `mmt`): any platform available, or any connected. */
  public func channelsAvailable(_ agentId: String) async -> Bool {
    guard let backend, let answer = try? await backend.command("getAgentChannels", ["id": .string(agentId)]) else { return false }
    let manifests = answer["manifests"]?.array ?? []
    let connections = answer["connections"]?.array ?? []
    return manifests.contains { $0["availability"]?.string == "available" } || !connections.isEmpty
  }
}
