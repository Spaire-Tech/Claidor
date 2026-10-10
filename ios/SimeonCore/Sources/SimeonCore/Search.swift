import Foundation

/**
 * Search, as the Mac's does it (its command palette, `QFn`): the agents and
 * groups by name and title, every message (`searchAgents`) and file
 * (`searchMedia`) through the host's index, the links in the chats, every
 * routine (`listAllAutomations`) and the app's actions; one tab each, in
 * the Mac's order, and All.
 */
public enum SearchTab: String, CaseIterable, Sendable {
  case all, messages, agents, groups, files, links, routines, actions

  public var title: String {
    switch self {
    case .all: return "All"
    case .messages: return "Messages"
    case .agents: return "Agents"
    case .groups: return "Groups"
    case .files: return "Files"
    case .links: return "Links"
    case .routines: return "Routines"
    case .actions: return "Actions"
    }
  }

  /** Tabs the host's index answers, hidden when its search is off (`gFn`). */
  public var needsIndex: Bool { [.messages, .files, .links, .routines].contains(self) }

  /** What a tab says when it has nothing (`VFn`). */
  public var empty: (text: String, hint: String?) {
    switch self {
    case .all, .agents: return ("No agents yet", nil)
    case .messages: return ("Search messages", "Type to find messages across your chats.")
    case .groups: return ("No group chats yet", nil)
    case .files: return ("No files yet", nil)
    case .links: return ("No links in your chats yet", nil)
    case .routines: return ("No routines yet", nil)
    case .actions: return ("No actions", nil)
    }
  }
}

/** A message the host found (`searchAgents`): which chat, which line, who wrote it, the words around the match. */
public struct MessageHit: Identifiable, Hashable, Sendable {
  public let agentId: String
  public let entryId: String
  public let fromPerson: Bool
  public let snippet: String
  public let timestampMs: Double?
  public var id: String { "\(agentId)/\(entryId)" }

  public init?(_ json: JSON) {
    guard let agentId = json["agentId"]?.text, let entryId = json["entryId"]?.text else { return nil }
    self.agentId = agentId; self.entryId = entryId
    fromPerson = json["role"]?.string == "user"
    snippet = json["snippet"]?.string ?? ""
    timestampMs = json["timestampMs"]?.double
  }
}

/** A file the host found (`searchMedia`): its chat and line, its name and kind, a picture's size. */
public struct FileHit: Identifiable, Hashable, Sendable {
  public let agentId: String
  public let entryId: String
  public let fileName: String
  public let kind: String
  public let timestampMs: Double?
  public let width: Int?
  public let height: Int?
  public var id: String { "\(agentId)/\(entryId)/\(fileName)" }

  public init?(_ json: JSON) {
    guard let agentId = json["agentId"]?.text, let entryId = json["entryId"]?.text else { return nil }
    self.agentId = agentId; self.entryId = entryId
    fileName = json["fileName"]?.string ?? "File"
    kind = json["kind"]?.string ?? "file"
    timestampMs = json["timestampMs"]?.double
    width = json["width"]?.int
    height = json["height"]?.int
  }
}

/** A routine of any agent (`listAllAutomations`: `{agentId, automation}`). */
public struct RoutineHit: Identifiable, Hashable, Sendable {
  public let agentId: String
  public let routine: Routine
  public let createdAt: Double?
  public var id: String { "\(agentId)/\(routine.id)" }

  public init?(_ json: JSON) {
    guard let agentId = json["agentId"]?.text, let automation = json["automation"], let routine = Routine(json: automation) else { return nil }
    self.agentId = agentId; self.routine = routine
    createdAt = automation["createdAt"]?.double
  }

  /** The date at its right (`lastRunAt ?? createdAt`). */
  public var date: Double? { routine.lastRunAt ?? createdAt }
}

/** A link from a chat (`SEn`): a Markdown link, a message that is only an address, an attachment on the web. */
public struct LinkHit: Identifiable, Hashable, Sendable {
  public let url: String
  /** The link's own words, when the message gave it some. */
  public let label: String?
  public let agentId: String
  public let entryId: String
  public let timestampMs: Double?
  public var id: String { url }

  /** The address without its scheme and "www." (the row's second line, or its title when it has no words). */
  public var shortAddress: String {
    var text = url
    for prefix in ["https://", "http://"] where text.hasPrefix(prefix) { text.removeFirst(prefix.count) }
    if text.hasPrefix("www.") { text.removeFirst(4) }
    while text.hasSuffix("/") { text.removeLast() }
    return text
  }

  public var title: String { label ?? shortAddress }
}

public enum Search {
  /** The Mac waits this long after a keystroke before it asks the host (`J0t`). */
  public static let debounce = 0.15

  // MARK: Matching (the window's `Pme`)

  /**
   * Whether `query` finds `label` (or, failing it, one of its keywords), and
   * how well: each word of the query must appear in the label's letters in
   * order, near together (within three times its length); a letter that
   * starts a word scores 4, one right after the last 3, any other 1. Accents
   * and case do not count. The places matched in the label, for its bold.
   */
  public static func match(_ query: String, label: String, keywords: [String] = []) -> (score: Int, hits: [Int])? {
    let words = tokens(query)
    guard !words.isEmpty else { return (0, []) }
    let target = Folded(label)
    let others = keywords.map(Folded.init)
    var score = 0
    var hits: [Int] = []
    for word in words {
      if let found = target.find(word) {
        score += found.score
        hits += found.places
      } else if let found = others.lazy.compactMap({ $0.find(word) }).first {
        score += max(1, found.score / 2)
      } else {
        return nil
      }
    }
    return (score, Array(Set(hits)).sorted())
  }

  /** The query's words: runs of letters and digits, accents and case folded. */
  static func tokens(_ text: String) -> [String] {
    fold(text).split(whereSeparator: { !$0.isLetter && !$0.isNumber }).map(String.init)
  }

  static func fold(_ text: String) -> String {
    text.folding(options: [.diacriticInsensitive, .caseInsensitive, .widthInsensitive], locale: nil)
  }

  /** A label folded letter by letter, each folded letter knowing which of the label's letters it came from. */
  struct Folded {
    let letters: [Character]
    let origin: [Int]
    let starts: [Bool]

    init(_ label: String) {
      var letters: [Character] = [], origin: [Int] = [], starts: [Bool] = []
      var previous: Character?
      for (index, character) in label.enumerated() {
        let folded = Search.fold(String(character))
        let wordStart = previous == nil || !(previous!.isLetter || previous!.isNumber) || (previous!.isLowercase && character.isUppercase)
        for (n, letter) in folded.enumerated() {
          letters.append(letter); origin.append(index); starts.append(n == 0 && wordStart)
        }
        previous = character
      }
      self.letters = letters; self.origin = origin; self.starts = starts
    }

    /** The best in-order match of `word`, trying each place its first letter appears. */
    func find(_ word: String) -> (score: Int, places: [Int])? {
      let wanted = Array(word)
      guard let first = wanted.first else { return nil }
      var best: (score: Int, places: [Int])?
      for start in letters.indices where letters[start] == first {
        var score = starts[start] ? 4 : 1
        var places = [origin[start]]
        var at = start
        var whole = true
        for letter in wanted.dropFirst() {
          guard let next = letters[(at + 1)...].firstIndex(of: letter) else { whole = false; break }
          score += next == at + 1 ? 3 : starts[next] ? 4 : 1
          places.append(origin[next])
          at = next
        }
        guard whole, at - start + 1 <= max(wanted.count * 3, wanted.count) else { continue }
        if best == nil || score > best!.score { best = (score, places) }
      }
      return best
    }
  }

  // MARK: Words

  /** "now", "5m ago", "3h ago", "2d ago", "4mo ago", "1y ago" (`fut`). */
  public static func ago(_ ms: Double?, now: Date = Date()) -> String? {
    guard let ms else { return nil }
    let seconds = max(0, now.timeIntervalSince1970 - ms / 1000)
    if seconds < 60 { return "now" }
    let minutes = Int(seconds / 60)
    if minutes < 60 { return "\(minutes)m ago" }
    let hours = minutes / 60
    if hours < 24 { return "\(hours)h ago" }
    let days = hours / 24
    if days < 30 { return "\(days)d ago" }
    if days < 365 { return "\(days / 30)mo ago" }
    return "\(days / 365)y ago"
  }

  /** A message's second line: who wrote to whom ("You to Theo", "Theo to you"; in a group "You in Launch", "In Launch"), and when. */
  public static func messageLine(_ hit: MessageHit, chat: Agent?, now: Date = Date()) -> String {
    let name = chat?.name ?? "an agent"
    let who: String
    if chat?.isGroup == true { who = hit.fromPerson ? "You in \(name)" : "In \(name)" }
    else { who = hit.fromPerson ? "You to \(name)" : "\(name) to you" }
    return [who, ago(hit.timestampMs, now: now)].compactMap { $0 }.joined(separator: " · ")
  }

  /** A file's second line: its chat, a picture's size, when ("Theo · 1280×800 · 5m ago"). */
  public static func fileLine(_ hit: FileHit, chat: Agent?, now: Date = Date()) -> String {
    let size = hit.width.flatMap { w in hit.height.map { h in "\(w)×\(h)" } }
    return [chat?.name, size, ago(hit.timestampMs, now: now)].compactMap { $0 }.joined(separator: " · ")
  }

  // MARK: Links

  private static let markdownLink = try! NSRegularExpression(pattern: #"\[([^\]]+)\]\((https?://[^)\s]+)\)"#)
  private static let bareAddress = try! NSRegularExpression(pattern: #"^\s*(https?://\S+)\s*$"#)

  /** The links in a chat's lines (`SEn`), newest first, each once. */
  public static func links(_ entries: [Entry], agentId: String) -> [LinkHit] {
    var found: [LinkHit] = []
    var seen = Set<String>()
    func add(_ url: String, _ label: String?, _ entry: Entry) {
      guard url.hasPrefix("http://") || url.hasPrefix("https://"), seen.insert(url).inserted else { return }
      found.append(LinkHit(url: url, label: label?.trimmingCharacters(in: .whitespaces).isEmpty == false && label != url ? label : nil, agentId: agentId, entryId: entry.id, timestampMs: entry.timestampMs))
    }
    for entry in entries.reversed() {
      let text: String?
      if entry.kind == "message" { text = entry.content }
      else if entry.kind == "send-message", entry.message?["type"]?.string == "text" { text = entry.message?["content"]?.string }
      else { text = nil }
      if let text {
        let range = NSRange(text.startIndex..., in: text)
        if let bare = bareAddress.firstMatch(in: text, range: range), let url = Range(bare.range(at: 1), in: text) {
          add(String(text[url]), nil, entry)
        }
        for match in markdownLink.matches(in: text, range: range) {
          guard let label = Range(match.range(at: 1), in: text), let url = Range(match.range(at: 2), in: text) else { continue }
          add(String(text[url]), String(text[label]), entry)
        }
      }
      if entry.kind == "send-message", entry.message?["type"]?.string == "attachment", let url = entry.message?["url"]?.text {
        add(url, nil, entry)
      }
    }
    return found
  }
}

extension AppStore {
  /** Whether the host's search index is on (`isGlobalSearchEnabled`); the Mac's default is on. */
  public func globalSearchEnabled() async -> Bool {
    guard let backend, let answer = try? await backend.command("isGlobalSearchEnabled", [:]) else { return true }
    return answer.bool ?? answer["enabled"]?.bool ?? true
  }

  /** Every chat's messages matching the words (`searchAgents`; the host gives at most 50, 5 a chat, newest first). */
  public func searchMessages(_ query: String) async throws -> [MessageHit] {
    guard let backend else { return [] }
    let answer = try await backend.command("searchAgents", ["query": .string(query)])
    return (answer.array ?? []).compactMap(MessageHit.init)
  }

  /** Files matching the words, or the newest 50 for none (`searchMedia`). */
  public func searchFiles(_ query: String) async throws -> [FileHit] {
    guard let backend else { return [] }
    let answer = try await backend.command("searchMedia", ["query": .string(query)])
    return (answer.array ?? []).compactMap(FileHit.init)
  }

  /** Every agent's routines (`listAllAutomations`). */
  public func allRoutines() async -> [RoutineHit] {
    guard let backend, let answer = try? await backend.command("listAllAutomations", [:]) else { return [] }
    return (answer.array ?? []).compactMap(RoutineHit.init)
  }

  /** The links in the chats the phone has, newest first. */
  public var allLinks: [LinkHit] {
    // Read again only when a chat changed: search asks on every letter typed, and this runs two patterns over every line.
    if let read = linksRead, read.version == transcriptsVersion { return read.links }
    let links = transcripts.flatMap { Search.links($0.value, agentId: $0.key) }.sorted { ($0.timestampMs ?? 0) > ($1.timestampMs ?? 0) }
    linksRead = (transcriptsVersion, links)
    return links
  }

  /**
   * A chat's older lines, page by page, until the given one is among them
   * (the Mac's `revealSearchHit`: at most 20 pages or 30 s). Whether it is.
   */
  public func loadUntil(_ entryId: String, in agentId: String, pages: Int = 20, seconds: Double = 30) async -> Bool {
    let started = Date()
    func has() -> Bool { transcripts[agentId]?.contains { $0.id == entryId } == true }
    // The chat opening fetches its newest lines first.
    while transcripts[agentId] == nil || fetching.contains(agentId) {
      if Date().timeIntervalSince(started) > seconds { return has() }
      try? await Task.sleep(nanoseconds: 100_000_000)
    }
    for _ in 0..<pages {
      if has() { return true }
      guard olderBefore[agentId] != nil, Date().timeIntervalSince(started) < seconds else { return false }
      await loadOlder(agentId)
    }
    return has()
  }
}

extension Chat {
  /** The row that shows a line: its own, or the folded run of messages between agents that holds it. */
  public static func rowId(for entryId: String, in rows: [ChatRow]) -> String? {
    for row in rows {
      if row.id == entryId { return row.id }
      if case .teammates(let id, _, let entries) = row, entries.contains(where: { $0.id == entryId }) { return id }
      if case .voiceCall(let id, _, _) = row, id == entryId { return id }
    }
    return nil
  }
}
