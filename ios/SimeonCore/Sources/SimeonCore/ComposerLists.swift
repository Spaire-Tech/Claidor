import Foundation

/**
 * The composer's lists as the Mac's window builds them: what "@" offers
 * (agents, groups, "everyone", routines, connectors), what "/" offers
 * (skills, then the app's actions), what "#" offers (pull requests the chat
 * linked), how each is matched and ordered, where a list opens, and how Esc
 * keeps it shut. Read from the shipped window (`Q5n`, `j5n`, `u5n`, `D_n`,
 * `cAe`, `j5e`, `Pme`).
 */
public enum ComposerLists {
  // MARK: Matching (the window's `Wf`, `MFe`, `Pme`)

  /**
   * Text as the window matches it: each piece decomposed, its marks dropped,
   * lowercased; letters and numbers kept, every run of anything else one
   * space between words.
   */
  public static func normalize(_ text: String) -> String {
    var out = ""
    var pendingSeparator = false
    for unit in text.utf16 {
      guard let scalar = Unicode.Scalar(unit) else { pendingSeparator = true; continue }
      let piece = String(Character(scalar)).decomposedStringWithCompatibilityMapping
      let kept = String(String.UnicodeScalarView(piece.unicodeScalars.filter { !isMark($0) })).lowercased()
      for scalar in kept.unicodeScalars {
        guard isLetterOrNumber(scalar) else { pendingSeparator = true; continue }
        if pendingSeparator && !out.isEmpty { out += " " }
        pendingSeparator = false
        out.unicodeScalars.append(scalar)
      }
    }
    return out
  }

  /** The words of a query, as the window splits it. */
  public static func tokens(_ query: String) -> [String] {
    let normalized = normalize(query)
    return normalized.isEmpty ? [] : normalized.split(separator: " ").map(String.init)
  }

  static func isMark(_ scalar: Unicode.Scalar) -> Bool {
    switch scalar.properties.generalCategory {
    case .nonspacingMark, .spacingMark, .enclosingMark: return true
    default: return false
    }
  }

  static func isLetterOrNumber(_ scalar: Unicode.Scalar) -> Bool {
    switch scalar.properties.generalCategory {
    case .uppercaseLetter, .lowercaseLetter, .titlecaseLetter, .modifierLetter, .otherLetter, .decimalNumber, .letterNumber, .otherNumber: return true
    default: return false
    }
  }

  /**
   * How well `token` runs through `text` (`MFe`): each of its characters at
   * the first place it fits, left to right; 1 each, 4 more at a word's
   * start, 3 more right after the last; nil when not all fit or they spread
   * past three times the token's length; less a tenth per character before
   * the first and a fiftieth per character of the text.
   */
  static func subsequence(_ text: String, _ token: String) -> Double? {
    let wanted = Array(token.utf16)
    if wanted.isEmpty { return 0 }
    let original = Array(text.utf16)
    let lower = Array(text.lowercased().utf16)
    var score = 0.0, matched = 0, previous = -2, first = -1, last = -1
    var index = 0
    while index < lower.count && matched < wanted.count {
      defer { index += 1 }
      guard lower[index] == wanted[matched] else { continue }
      if first < 0 { first = index }
      let before: UInt16? = index > 0 && index - 1 < original.count ? original[index - 1] : nil
      let boundary = index == 0 || before.map { [0x20, 0x2D, 0x5F, 0x2F, 0x2E].contains($0) } == true
      let here: UInt16? = index < original.count ? original[index] : nil
      let camel = before.map { (0x61...0x7A).contains($0) } == true && here.map { (0x41...0x5A).contains($0) } == true
      var gain = 1.0
      if boundary || camel { gain += 4 }
      if previous == index - 1 { gain += 3 }
      score += gain
      previous = index; last = index; matched += 1
    }
    if matched < wanted.count || Double(last - first + 1) > Double(wanted.count * 3) { return nil }
    return score - Double(first) * 0.1 - Double(lower.count) * 0.02
  }

  /** A row's score for a query (`Pme`): every word must run through its label or a keyword; plus the whole query through the label. Nil for no match. */
  public static func score(label: String, keywords: [String] = [], query: String) -> Double? {
    let words = tokens(query)
    let normalizedLabel = normalize(label)
    let fields = [normalizedLabel] + keywords.map(normalize)
    var total = 0.0
    for word in words {
      guard let best = fields.compactMap({ subsequence($0, word) }).max() else { return nil }
      total += best
    }
    return total + (subsequence(normalizedLabel, words.joined(separator: " ")) ?? 0)
  }

  // MARK: Where a list opens (`cAe`, `H5n`, `V5n`)

  /** A trigger being typed at the end of the text after the last chip: where its character is, and what follows it. */
  public struct Trigger: Equatable, Sendable {
    /** The trigger character's offset in the draft (characters). */
    public let at: Int
    public let query: String
  }

  static let separators = ",+*?$@|#{}()^-[]\\!%'\"~=<>:;"

  private static func escapedClass(_ characters: String) -> String {
    characters.map { "\\" + String($0) }.joined()
  }

  private static func patterns(_ trigger: Character) -> (multi: NSRegularExpression, single: NSRegularExpression) {
    let t = escapedClass(String(trigger))
    let p = escapedClass(separators)
    let unit = "[^\(t)\(p)\\s]"
    let gap = "(?:\\.[ |$]| |[\(p)\\/]|)"
    let multi = try! NSRegularExpression(pattern: "(^|\\s|\\()([\(t)]((?:\(unit)\(gap)){0,120}))$")
    let single = try! NSRegularExpression(pattern: "(^|\\s|\\()([\(t)]((?:\(unit)){0,50}))$")
    return (multi, single)
  }

  private static let cachedPatterns: [Character: (multi: NSRegularExpression, single: NSRegularExpression)] = [
    "@": patterns("@"), "/": patterns("/"), "#": patterns("#"),
  ]

  /**
   * The list `trigger` ("@", "/" or "#") opens for the draft, its caret at
   * the end: in the last 200 characters after the last chip, the trigger at
   * the start, after a space or after "(", then at most 50 characters of a
   * name (one space or one mark at a time between them).
   */
  public static func trigger(_ trigger: Character, in draft: String, after chipEnd: Int = 0) -> Trigger? {
    let chars = Array(draft)
    guard chipEnd <= chars.count else { return nil }
    let node = String(chars[chipEnd...])
    let tail = node.count > 200 ? String(node.suffix(200)) : node
    let offset = chars.count - tail.count
    guard let found = cachedPatterns[trigger] ?? Optional(patterns(trigger)) else { return nil }
    let range = NSRange(tail.startIndex..., in: tail)
    guard let match = found.multi.firstMatch(in: tail, range: range) ?? found.single.firstMatch(in: tail, range: range),
          let lead = Range(match.range(at: 1), in: tail), let query = Range(match.range(at: 3), in: tail) else { return nil }
    let typed = String(tail[query])
    guard typed.count <= 50 else { return nil }
    return Trigger(at: offset + tail.distance(from: tail.startIndex, to: lead.upperBound), query: typed)
  }

  /**
   * Esc keeps a list shut where it was put away (`j5e`): until the trigger
   * at that place is gone, or a trigger opens elsewhere.
   */
  public struct Dismissal: Equatable, Sendable {
    public var at: Int?
    public var character: Character

    public init(character: Character) { self.character = character }

    /** Whether a list may open at `position`; a trigger elsewhere lifts the dismissal. */
    public mutating func allows(_ position: Int) -> Bool {
      guard let at else { return true }
      if at != position { self.at = nil; return true }
      return false
    }

    /** The draft changed: the dismissal goes when its trigger character is no longer where it was. */
    public mutating func check(_ draft: String) {
      guard let at else { return }
      let chars = Array(draft)
      if at >= chars.count || chars[at] != character { self.at = nil }
    }
  }

  // MARK: "@" (`Q5n`, `j5n`)

  public enum Category: String, Sendable { case assistants, automations, tools }

  public struct MentionRow: Identifiable, Equatable, Sendable {
    public enum Icon: Equatable, Sendable {
      case everyone
      case agent(id: String)
      case group
      case routine(iconId: String?, iconURL: String?)
      case connector(iconId: String?, iconURL: String?, name: String)
    }

    /** What a pick puts in the message: a mention of an agent, or a chip (a routine's, a connector's). */
    public enum Insert: Equatable, Sendable {
      case mention(id: String, label: String)
      case workflow(id: String, label: String, iconId: String?, iconURL: String?)
    }

    public let key: String
    public let id: String
    public let category: Category
    public let label: String
    public var keywords: [String] = []
    public var subtitle: String?
    /** "Agent", "Group", "Routine" or "Plugin". */
    public let tag: String
    public let icon: Icon
    public let insert: Insert
  }

  /** The id the window gives "@everyone": every member of the group hears the message. */
  public static let everyoneId = "__everyone__"

  /**
   * Who "@" offers in a chat (`tOn`): in a group, its members in its order;
   * in a one-to-one chat, every other agent and the groups this one is in,
   * in the list's order. Hidden agents are not left out.
   */
  public static func mentionMembers(current: Agent?, roster: [Agent]) -> [Agent] {
    guard let current else { return [] }
    if current.isGroup { return current.memberIds.compactMap { id in roster.first { $0.id == id } } }
    return roster.filter { $0.id != current.id && (!$0.isGroup || $0.memberIds.contains(current.id)) }
  }

  /** A connector's name with its account when it is not the default one: "Gmail (work@x.com)" (`M5n`). */
  public static func connectorLabel(_ name: String, accountKey: String?) -> String {
    guard let accountKey, accountKey != "default" else { return name }
    let cleaned = accountKey.replacingOccurrences(of: "[\"'`\\\\\\[\\]{}()<>]", with: "", options: .regularExpression)
      .split(whereSeparator: \.isWhitespace).joined(separator: " ")
    return "\(name) (\(String(cleaned.prefix(64))))"
  }

  /** A connector's line under its name (`X5n`). */
  public static func connectorStatus(_ app: ConnectedApp) -> String {
    switch app.status {
    case "connected": return "connected"
    case "needsAuth": return "needs auth"
    case "error": return "error"
    case "initializing": return "connecting"
    case "disconnected": return "disconnected"
    case "disabledByTeamAdminPolicy": return "disabled"
    default: return app.accountKey == "default" ? (app.url ?? "") : app.accountKey
    }
  }

  /** The connectors "@" lists (`z9n`): not those a team admin turned off, not team ones without a plugin; one per app and account, a personal one over a team one. */
  public static func mentionConnectors(_ apps: [ConnectedApp]) -> [ConnectedApp] {
    var order: [String] = []
    var chosen: [String: ConnectedApp] = [:]
    for app in apps where app.status != "disabledByTeamAdminPolicy" && (!app.isTeamServer || app.pluginId != nil) {
      let key = "\(app.pluginId ?? app.name)\u{0}\(app.accountKey)"
      if let held = chosen[key] {
        if held.isTeamServer && !app.isTeamServer { chosen[key] = app }
      } else {
        order.append(key)
        chosen[key] = app
      }
    }
    return order.compactMap { chosen[$0] }
  }

  /** Every row "@" can offer, in the window's order: everyone (a group of two or more), the members, the routines, the connectors. */
  public static func mentionRows(members: [Agent], isGroupChat: Bool, routines: [ComposerMenus.Skill], connectors: [ConnectedApp]) -> [MentionRow] {
    var rows: [MentionRow] = []
    if isGroupChat && members.count >= 2 {
      rows.append(MentionRow(key: "assistants:\(everyoneId)", id: everyoneId, category: .assistants, label: "everyone", keywords: ["all"], tag: "Agent", icon: .everyone, insert: .mention(id: everyoneId, label: "everyone")))
    }
    for member in members {
      rows.append(MentionRow(key: "assistants:\(member.id)", id: member.id, category: .assistants, label: member.name,
                             subtitle: member.isGroup ? "\(member.memberIds.count) agents" : nil, tag: member.isGroup ? "Group" : "Agent",
                             icon: member.isGroup ? .group : .agent(id: member.id), insert: .mention(id: member.id, label: member.name)))
    }
    for routine in routines {
      rows.append(MentionRow(key: "automations:\(routine.id)", id: routine.id, category: .automations, label: routine.name, subtitle: routine.subtitle,
                             tag: "Routine", icon: .routine(iconId: routine.iconId, iconURL: routine.iconURL),
                             insert: .workflow(id: routine.id, label: routine.name, iconId: routine.iconId, iconURL: routine.iconURL)))
    }
    for app in connectors {
      let id = "mcp:\(app.serverIdentifier)"
      let label = connectorLabel(app.name, accountKey: app.accountKey)
      rows.append(MentionRow(key: "tools:\(id)", id: id, category: .tools, label: label, subtitle: connectorStatus(app), tag: "Plugin",
                             icon: .connector(iconId: nil, iconURL: nil, name: app.name),
                             insert: .workflow(id: "mcp:\(app.serverId)", label: label, iconId: nil, iconURL: nil)))
    }
    return rows
  }

  /**
   * The rows for what was typed after "@" (`j5n`): each once; all of them,
   * in order, for nothing typed; else those every word runs through, best
   * first, the ones picked lately first among equals. No limit.
   */
  public static func filterMentions(_ rows: [MentionRow], query: String, recents: [String]) -> [MentionRow] {
    var seen = Set<String>()
    let unique = rows.filter { seen.insert($0.key).inserted }
    guard !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return unique }
    guard !tokens(query).isEmpty else { return [] }
    let scored = unique.enumerated().compactMap { index, row -> (row: MentionRow, index: Int, score: Double, recency: Double)? in
      guard let value = score(label: row.label, keywords: row.keywords, query: query) else { return nil }
      let position = recents.firstIndex(of: row.key)
      let recency = position.map { Double(recents.count - $0) / Double(recents.count) } ?? 0
      return (row, index, value, recency)
    }
    return scored.sorted { a, b in
      if a.score != b.score { return a.score > b.score }
      if a.recency != b.recency { return a.recency > b.recency }
      return a.index < b.index
    }.map(\.row)
  }

  /** The keys picked lately from "@", newest first, after `key` is picked: at most 20 (`Llt`). */
  public static func rememberingMention(_ key: String, in recents: [String]) -> [String] {
    Array(([key] + recents.filter { $0 != key }).prefix(20))
  }

  /** What "@" says with nothing to offer: the typed name not found, in curly quotes. */
  public static func mentionEmptyText(_ query: String) -> String {
    let typed = query.trimmingCharacters(in: .whitespacesAndNewlines)
    return typed.isEmpty ? "Nothing to mention yet" : "No matches for \u{201C}\(typed)\u{201D}"
  }

  // MARK: "/" (`u5n`)

  /** One of the app's actions "/" offers (the palette's commands that run something). */
  public struct Action: Identifiable, Equatable, Sendable {
    public let id: String
    public let label: String
    public let keywords: [String]
    public let detail: String?

    public init(id: String, label: String, keywords: [String], detail: String? = nil) {
      self.id = id; self.label = label; self.keywords = keywords; self.detail = detail
    }
  }

  public enum SlashItem: Identifiable, Equatable, Sendable {
    case skill(ComposerMenus.Skill)
    case action(Action)

    public var id: String {
      switch self {
      case .skill(let skill): return skill.id
      case .action(let action): return "action:\(action.id)"
      }
    }

    public var label: String {
      switch self {
      case .skill(let skill): return skill.name
      case .action(let action): return action.label
      }
    }

    /** "Skill" or "Action". */
    public var tag: String {
      if case .action = self { return "Action" }
      return "Skill"
    }

    /** A skill's description; an action's place ("Settings", "Current chat"). */
    public var subtitle: String? {
      switch self {
      case .skill(let skill): return skill.summary
      case .action(let action): return action.detail ?? ""
      }
    }
  }

  /**
   * What "/" offers for what was typed: the skills whose name holds it, in
   * their order; then the actions every word runs through, best first;
   * eight at most, three kept for actions when there are that many.
   */
  public static func slashItems(skills: [ComposerMenus.Skill], actions: [Action], query: String) -> [SlashItem] {
    let wanted = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    let foundSkills = skills.filter { wanted.isEmpty || $0.name.lowercased().contains(wanted) }
    let foundActions = actions.enumerated().compactMap { index, action -> (Action, Int, Double)? in
      guard let value = score(label: action.label, keywords: action.keywords + (action.detail.map { [$0] } ?? []), query: query) else { return nil }
      return (action, index, value)
    }.sorted { $0.2 != $1.2 ? $0.2 > $1.2 : $0.1 < $1.1 }.map(\.0)
    let shownSkills = Array(foundSkills.prefix(8 - min(foundActions.count, 3)))
    return shownSkills.map(SlashItem.skill) + foundActions.prefix(8 - shownSkills.count).map(SlashItem.action)
  }

  /** What "/" says with nothing to offer (straight quotes). */
  public static func slashEmptyText(_ query: String, hasAny: Bool) -> String {
    let typed = query.trimmingCharacters(in: .whitespacesAndNewlines)
    return hasAny && !typed.isEmpty ? "No matches for \"\(typed)\"" : "Nothing to reference yet"
  }

  // MARK: "#" (`D_n`, `Iyn`)

  /**
   * The pull requests the chat named, newest first, each once (`D_n`): from
   * a message's own document when it has one, from a cloud agent's card,
   * else from the GitHub (or Simeon review) addresses in its words. A
   * document's reference outranks a card, which outranks an address; the
   * better one's details win, the place stays where it was first found.
   */
  public static func pullCandidates(_ entries: [Entry], cloud: [String: CloudAgentInfo] = [:]) -> [ComposerMenus.PullRequest] {
    var order: [Int] = []
    var held: [Int: (rank: Int, pull: ComposerMenus.PullRequest)] = [:]
    func offer(_ pull: ComposerMenus.PullRequest, rank: Int) {
      guard pull.number > 0 else { return }
      if let existing = held[pull.number] {
        if rank > existing.rank { held[pull.number] = (rank, pull) }
      } else {
        order.append(pull.number)
        held[pull.number] = (rank, pull)
      }
    }
    for entry in entries.reversed() {
      if entry.kind == "send-message", entry.message?["type"]?.string == "cloud-agent", let bcId = entry.message?["bcId"]?.text, let info = cloud[bcId], let number = info.pullRequestNumber {
        let title = info.name.isEmpty ? entry.message?["title"]?.text?.trimmingCharacters(in: .whitespaces) : info.name
        offer(ComposerMenus.PullRequest(number: number, url: info.pullRequestURL, title: title?.isEmpty == false ? title : nil), rank: 1)
        continue
      }
      if entry.kind == "message", let doc = Chat.document(entry["richText"]?.string) {
        for (pull, rank) in documentPulls(doc) { offer(pull, rank: rank) }
        continue
      }
      let text: String
      switch entry.kind {
      case "message": text = entry.content ?? ""
      case "send-message" where entry.message?["type"]?.string == "text": text = entry.message?["content"]?.string ?? ""
      case "notice": text = entry["text"]?.text ?? ""
      default: continue
      }
      for pull in ComposerMenus.pullRequestLinks(in: text) { offer(pull, rank: 0) }
    }
    return order.compactMap { held[$0]?.pull }
  }

  /** A document's pull requests, in its order: its references (rank 2), and the addresses in its words and links (rank 0). */
  static func documentPulls(_ node: [String: Any]) -> [(ComposerMenus.PullRequest, Int)] {
    var out: [(ComposerMenus.PullRequest, Int)] = []
    let attrs = node["attrs"] as? [String: Any] ?? [:]
    switch node["type"] as? String {
    case "prReference":
      if let number = (attrs["prNumber"] as? NSNumber)?.intValue {
        let title = (attrs["title"] as? String)?.trimmingCharacters(in: .whitespaces)
        let url = (attrs["url"] as? String)?.trimmingCharacters(in: .whitespaces)
        out.append((ComposerMenus.PullRequest(number: number, url: url ?? "", title: title?.isEmpty == false ? title : nil), 2))
      }
    case "text":
      for pull in ComposerMenus.pullRequestLinks(in: node["text"] as? String ?? "") { out.append((pull, 0)) }
      for mark in node["marks"] as? [[String: Any]] ?? [] where mark["type"] as? String == "link" {
        if let href = (mark["attrs"] as? [String: Any])?["href"] as? String {
          for pull in ComposerMenus.pullRequestLinks(in: href) { out.append((pull, 0)) }
        }
      }
    default: break
    }
    for child in node["content"] as? [[String: Any]] ?? [] { out += documentPulls(child) }
    return out
  }

  /** The pull requests "#…" matches (`Iyn`): its number holds what was typed, or its title does; eight at most. */
  public static func filterPulls(_ pulls: [ComposerMenus.PullRequest], query: String) -> [ComposerMenus.PullRequest] {
    let wanted = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    return Array(pulls.filter { wanted.isEmpty || String($0.number).contains(wanted) || ($0.title ?? "").lowercased().contains(wanted) }.prefix(8))
  }
}
