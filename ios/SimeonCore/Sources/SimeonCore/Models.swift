import Foundation

/** A person or an agent named on an entry: `{id, name}`. */
public struct Party: Hashable, Sendable {
  public let id: String
  public let name: String

  public init(id: String, name: String) { self.id = id; self.name = name }

  init?(_ json: JSON?) {
    guard let id = json?["id"]?.text else { return nil }
    self.init(id: id, name: json?["name"]?.text ?? "")
  }

  /** A call written before calls were one line: its lines were messages with a peer `voice-call:<call>:<seconds>`. */
  public var earlierCall: (callId: String, seconds: Int)? {
    let parts = id.split(separator: ":")
    guard parts.count >= 3, parts[0] == "voice-call", let seconds = Int(parts[parts.count - 1]) else { return nil }
    return (parts[1..<(parts.count - 1)].joined(separator: ":"), seconds)
  }
}

/**
 * One row of the roster, as the host projects it (`roster-projection.ts`;
 * the window's own reading of it is desktop/window/src/bridge/types.ts).
 */
public struct Agent: Identifiable, Hashable, Sendable {
  public let id: String
  public var name: String
  public var title: String
  public var description: String
  public var colour: String?
  public var avatarDataURL: String?
  public var isGroup: Bool
  public var memberIds: [String]
  public var lastMessagePreview: String?
  /** Milliseconds since the epoch. */
  public var lastActivityAt: Double?
  public var hasUnread: Bool
  public var unreadCount: Int
  public var isRunningTurn: Bool
  public var isComposing: Bool
  public var activityLabel: String?
  public var isHidden: Bool
  /** "Notifications" on the agent's page (`notifyOnUpdatesEnabled`). */
  public var notifyOnUpdates: Bool = true
  public var voiceId: String?
  /** Someone else's room shared with the person (`remoteRoom`): no voice of its own, as on the Mac. */
  public var isRemoteRoom = false
  /** Running a turn or one of its helpers (`isRunning`), waiting on the person (`awaitingUserResponse`), and what it is doing (`currentActivity`): its butterfly's state. */
  public var isRunning = false
  public var awaitingUserResponse = false
  public var activityKind: String?
  public var activityTool: String?
  public var activityDetail: String?
  /** The agent it is messaging (`currentActivity.target`): "Messaging Iris". */
  public var activityTarget: String?
  /** The id of the chat's newest message (`lastMessageId`): when it changes and the open chat lacks it, the chat is fetched again. */
  public var lastMessageId: String?
  /** The chat's last line as the host sums it up (`lastEntry`: text, a link, or attachments). */
  public var lastEntry: JSON?
  /** Why the agent waits on the person (`awaitingUserResponse.reason`). */
  public var waitingReason: String?

  public init(id: String, name: String, title: String = "", description: String = "", colour: String? = nil, avatarDataURL: String? = nil, isGroup: Bool = false, memberIds: [String] = [], lastMessagePreview: String? = nil, lastActivityAt: Double? = nil, hasUnread: Bool = false, unreadCount: Int = 0, isRunningTurn: Bool = false, isComposing: Bool = false, activityLabel: String? = nil, isHidden: Bool = false) {
    self.id = id; self.name = name; self.title = title; self.description = description; self.colour = colour
    self.avatarDataURL = avatarDataURL; self.isGroup = isGroup; self.memberIds = memberIds
    self.lastMessagePreview = lastMessagePreview; self.lastActivityAt = lastActivityAt
    self.hasUnread = hasUnread; self.unreadCount = unreadCount; self.isRunningTurn = isRunningTurn
    self.isComposing = isComposing; self.activityLabel = activityLabel; self.isHidden = isHidden
  }

  public init?(json: JSON) {
    guard let id = json["id"]?.text else { return nil }
    self.init(
      id: id,
      name: json["name"]?.string ?? "",
      title: json["title"]?.string ?? "",
      description: json["description"]?.string ?? "",
      colour: json["avatarColor"]?.text,
      avatarDataURL: json["avatarDataUrl"]?.text,
      isGroup: json["isGroup"]?.bool ?? false,
      memberIds: json["memberIds"]?.array?.compactMap(\.text) ?? [],
      lastMessagePreview: json["lastMessagePreview"]?.text,
      lastActivityAt: json["lastActivityAt"]?.double ?? json["updatedAt"]?.double,
      hasUnread: json["hasUnread"]?.bool ?? false,
      unreadCount: json["unreadCount"]?.int ?? 0,
      isRunningTurn: json["isRunningTurn"]?.bool ?? json["isRunning"]?.bool ?? false,
      isComposing: json["isComposingMessage"]?.bool ?? false,
      activityLabel: json["currentActivity"]?["label"]?.text,
      isHidden: json["isHiddenFromSidebar"]?.bool ?? false
    )
    notifyOnUpdates = json["notifyOnUpdatesEnabled"]?.bool ?? true
    voiceId = json["voiceId"]?.text
    if let room = json["remoteRoom"], room != .null { isRemoteRoom = true }
    isRunning = json["isRunning"]?.bool ?? isRunningTurn
    if let awaiting = json["awaitingUserResponse"], awaiting != .null { awaitingUserResponse = true }
    activityKind = json["currentActivity"]?["kind"]?.text
    activityTool = json["currentActivity"]?["tool"]?.text
    activityDetail = json["currentActivity"]?["detail"]?.text
    activityTarget = json["currentActivity"]?["target"]?.text
    lastMessageId = json["lastMessageId"]?.text
    if let entry = json["lastEntry"], entry != .null { lastEntry = entry }
    waitingReason = json["awaitingUserResponse"]?["reason"]?.text
  }

  /** The agent's palette: its stored colour, else the window's default for its id. */
  public var palette: AgentPalette { AgentPalette.named(colour ?? AgentPalette.defaultColour(forAgentId: id)) }
  /** The agent is working: the window's typing dots. */
  public var isBusy: Bool { isRunningTurn || isComposing }
}

extension Agent {
  /**
   * The list row's second line, as the Mac's sidebar writes it
   * (`sidebar.tsx`, `previewTextFromLastEntry`): "Waiting for you: …" when
   * the agent waits on the person, else the last line with its Markdown
   * taken out, "Sent a link · …", or "Sent 2 images".
   */
  public var previewLine: String {
    if awaitingUserResponse, let reason = waitingReason, !reason.isEmpty { return "Waiting for you: \(reason)" }
    if let entry = lastEntry, let line = Preview.line(entry), !line.isEmpty { return line }
    if let preview = lastMessagePreview { return Preview.plain(preview) }
    return description
  }
}

/** The Mac's preview text (`sidebar-agent-preview-content.tsx`). */
public enum Preview {
  public static func line(_ entry: JSON) -> String? {
    switch entry["kind"]?.string {
    case "link": return entry["url"]?.text.map { "Sent a link · \($0)" }
    case "attachment": return attachments(count: entry["count"]?.int ?? 1, kinds: entry["kinds"]?.object ?? [:])
    case "text": return entry["text"]?.string.map(plain)
    default: return nil
    }
  }

  /** The window's Markdown replacements, in its order, then the spaces run together. */
  static let replacements: [(NSRegularExpression, String)] = ([
    ("`+", ""),
    (#"!\[([^\]]*)\]\([^)]*\)"#, "$1"),
    (#"\[([^\]]+)\]\([^)]*\)"#, "$1"),
    (#"\$\$((?:[^$\\]|\\[\s\S])+?)\$\$"#, "$1"),
    (#"\\\(([\s\S]+?)\\\)"#, "$1"),
    (#"\\\[([\s\S]+?)\\\]"#, "$1"),
    (#"\\\$"#, "\\$"),
    (#"(?m)^\s{0,3}#{1,6}\s+"#, ""),
    (#"(?m)^\s{0,3}>\s?"#, ""),
    (#"(?m)^\s{0,3}(?:[-*+]|\d+[.)])\s+"#, ""),
    (#"\*\*([^*]+)\*\*"#, "$1"),
    ("__([^_]+)__", "$1"),
    ("~~([^~]+)~~", "$1"),
    (#"\*([^*\n]+)\*"#, "$1"),
    (#"(?<!\w)_([^_\n]+)_(?!\w)"#, "$1"),
    (#"\|"#, " "),
  ] as [(String, String)]).map { (try! NSRegularExpression(pattern: $0.0), $0.1) }

  /** Kept per text: the list asks again on every redraw, and sixteen replacements per row add up while an agent streams. */
  public static func plain(_ markdown: String) -> String {
    if let hit = plainCache.withLock({ $0[markdown] }) { return hit }
    let text = strip(markdown)
    plainCache.withLock { store in
      if store.count > 400 { store.removeAll(keepingCapacity: true) }
      store[markdown] = text
    }
    return text
  }

  private static let plainCache = LockedBox<[String: String]>([:])

  static func strip(_ markdown: String) -> String {
    // The list shows one line: the first couple of thousand characters are plenty, and a message of megabytes is not run through sixteen patterns.
    var text = markdown.count > 2_000 ? String(markdown.prefix(2_000)) : markdown
    for (pattern, template) in replacements {
      text = pattern.stringByReplacingMatches(in: text, range: NSRange(text.startIndex..., in: text), withTemplate: template)
    }
    return text.split(whereSeparator: { $0.isWhitespace }).joined(separator: " ")
  }

  static let labels: [String: (String, String)] = [
    "image": ("image", "images"), "video": ("video", "videos"), "audio": ("audio file", "audio files"), "pdf": ("PDF", "PDFs"),
    "markdown": ("Markdown file", "Markdown files"), "table": ("spreadsheet", "spreadsheets"), "json": ("JSON file", "JSON files"),
    "text": ("text file", "text files"), "document": ("document", "documents"), "archive": ("archive", "archives"), "file": ("file", "files"),
  ]

  static func label(_ kind: String, _ count: Int) -> String {
    let words = labels[kind] ?? labels["file"]!
    return "\(count) \(count == 1 ? words.0 : words.1)"
  }

  static func attachments(count: Int, kinds: [String: JSON]) -> String {
    let total = max(1, count)
    let present = kinds.compactMap { key, value -> (String, Int)? in
      guard let n = value.int, n > 0 else { return nil }
      return (labels[key] == nil ? "file" : key, n)
    }.sorted { $0.0 < $1.0 }
    if present.isEmpty { return "Sent \(label("file", total))" }
    if present.count == 1 { return "Sent \(label(present[0].0, total))" }
    return "Sent \(label("file", total)) · " + present.map { label($0.0, $0.1) }.joined(separator: ", ")
  }
}

/** The roster in the list's order: newest activity first. Hidden agents stay in it (groups and mentions still need them); the list leaves them out. */
public func sortRoster(_ agents: [Agent]) -> [Agent] {
  agents.sorted { ($0.lastActivityAt ?? 0) > ($1.lastActivityAt ?? 0) }
}

/** One line of a conversation, as the host writes it (host/extensions/transcript). */
public struct Entry: Identifiable, Hashable, Sendable {
  public let id: String
  public let kind: String
  public let raw: JSON

  public init?(_ json: JSON) {
    guard let id = json["id"]?.text, let kind = json["kind"]?.text else { return nil }
    self.id = id; self.kind = kind; self.raw = json
  }

  public subscript(key: String) -> JSON? { raw[key] }

  /** Milliseconds since the epoch. */
  public var timestampMs: Double? { raw["timestampMs"]?.double }
  public var date: Date? { timestampMs.map { Date(timeIntervalSince1970: $0 / 1000) } }
  public var role: String? { raw["role"]?.text }
  public var content: String? { raw["content"]?.string }
  public var isStreaming: Bool { raw["isStreaming"]?.bool ?? false }
  public var message: JSON? { raw["message"] }
  public var author: Party? { Party(raw["author"]) }
  public var toAgent: Party? { Party(raw["toAgent"]) }
  public var fromAgent: Party? { Party(raw["fromAgent"]) }
  public var event: JSON? { raw["event"] }
  public var reactions: [(emoji: String, by: String)] {
    (raw["reactions"]?.array ?? []).compactMap { r in r["emoji"]?.text.map { ($0, r["by"]?.string ?? "") } }
  }

  /** The person's own message. */
  public var isFromPerson: Bool {
    (kind == "message" && role == "user" && fromAgent == nil) || kind == "user-message" || kind == "human-message" || kind == "user-attachment"
  }

  /** An agent's message to a teammate, or a teammate's answer: the window folds these into "N messages with …". */
  public var teammate: Party? { toAgent ?? fromAgent }

  /** What the list shows under the agent's name, from this entry; nil when the entry says nothing a person reads. */
  public var preview: String? {
    if kind == "message", teammate == nil, let text = content?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty { return plain(text) }
    guard kind == "send-message", let message else { return nil }
    let by = author.map { "\($0.name): " } ?? ""
    switch message["type"]?.string {
    case "text": return message["content"]?.text.map { by + plain($0) }
    case "widget": return message["widget"]?["prompt"]?.text
    case "connector":
      guard let name = message["connector"]?.text else { return nil }
      return message["variant"]?.string == "connected" ? "\(name) connected" : "Connect \(name)"
    case "connectors":
      // The window's preview (`Lvn`): "Connect Gmail, Notion", or "Connect tools".
      let names = message["connectors"]?.array?.compactMap(\.text) ?? []
      return names.isEmpty ? "Connect tools" : "Connect " + names.joined(separator: ", ")
    case "listener-connect": return message["platform"]?.string == "slack" ? "Connect Slack" : "Connect GitHub"
    case "attachment": return message["url"]?.text.map(fileName(ofURL:)) ?? "Sent a file"
    default: return message["content"]?.text.map { by + plain($0) }
    }
  }
}

/** The text without Markdown's marks, for one-line previews. */
public func plain(_ markdown: String) -> String {
  markdown.replacingOccurrences(of: "**", with: "").replacingOccurrences(of: "__", with: "").replacingOccurrences(of: "`", with: "")
    .split(whereSeparator: \.isNewline).map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }.joined(separator: " ")
}

/** A file's name from its `file://` (or any) URL. */
public func fileName(ofURL url: String) -> String {
  let last = url.split(separator: "/").last.map(String.init) ?? url
  return last.removingPercentEncoding ?? last
}
