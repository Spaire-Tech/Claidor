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
  }

  public var palette: AgentPalette { AgentPalette.named(colour) }
  /** The agent is working: the window's typing dots. */
  public var isBusy: Bool { isRunningTurn || isComposing }
}

/** The roster in the list's order: newest activity first, hidden agents left out (`sortRoster`). */
public func sortRoster(_ agents: [Agent]) -> [Agent] {
  agents.filter { !$0.isHidden }.sorted { ($0.lastActivityAt ?? 0) > ($1.lastActivityAt ?? 0) }
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
    case "connectors": return message["connectors"]?.array.map { "Connected " + $0.compactMap(\.text).joined(separator: " and ") }
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
