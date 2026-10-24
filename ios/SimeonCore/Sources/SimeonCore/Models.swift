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
 * The host's stamp on a roster row (`roster-emit.ts`): an id for the host's
 * run and a number that only grows, so a late, older copy of an agent's row
 * can be told from a newer one. It is not what the row says: two copies
 * that differ only in it are the same row, and redraw nothing.
 */
public struct RosterStamp: Hashable, Sendable {
  public var epoch: String
  public var seq: Double

  public init(epoch: String = "", seq: Double = 0) {
    self.epoch = epoch
    self.seq = seq
  }

  public static func == (_: RosterStamp, _: RosterStamp) -> Bool { true }
  public func hash(into hasher: inout Hasher) {}
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
  /** Which copy of its picture the host has (`avatarVersion`): set with the picture, and alone in a roster kept from before. */
  public var avatarVersion: String?
  /** The face it was given (`avatarShape`, "clay-07"; AgentFaces), kept when another picture replaces it. Earlier apps wrote a butterfly's shape here ("cloud"). */
  public var avatarShape: String?
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
  /** A room the person shares (`isSharedRoom`, or the host's `sharedRoomId`): the host refuses member changes for it. */
  public var isSharedRoom = false

  /** It has a picture of its own, for the working lines (`QCe`: the picture, or only its version). */
  public var hasPicture: Bool { avatarDataURL?.isEmpty == false || avatarVersion?.isEmpty == false }

  /** A group whose members the person can change: its Computer tab lists them, and "Members" opens it (`cct`). */
  public var showsMembers: Bool { isGroup && !isSharedRoom && !isRemoteRoom }
  /** Running a turn or one of its helpers (`isRunning`), waiting on the person (`awaitingUserResponse`), and what it is doing (`currentActivity`): the working row's words. */
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
  /** When it was made (ms): the oldest one titled Chief of Staff is the Chief of Staff. */
  public var createdAt: Double?
  /** What it is for, when the app made it for something (`purpose`: "disk-saver"). */
  public var purpose: String?
  /** The agents it has messaged one to one, or that messaged it (`conversationPartnerIds`): the org chart's links. */
  public var conversationPartnerIds: [String] = []
  /** Its last change (`updatedAt`: made, or its newest activity), for the org chart's "recent" links. */
  public var updatedAt: Double?
  /** Which copy of the row this is (`snapshotEpoch`, `snapshotSeq`), for the Mac's Dock badge. */
  public var stamp = RosterStamp()

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
      // The host sends 0 for a chat with no activity yet: that is no time, and
      // the row goes by when it was made, as the window's (`updatedAt`) does.
      lastActivityAt: json["lastActivityAt"]?.double.flatMap { $0 > 0 ? $0 : nil } ?? json["updatedAt"]?.double.flatMap { $0 > 0 ? $0 : nil },
      hasUnread: json["hasUnread"]?.bool ?? false,
      // Whole messages, as the Dock counts them (`Math.floor`).
      unreadCount: json["unreadCount"]?.double.flatMap { $0.isFinite && abs($0) < 1e15 ? Int($0.rounded(.down)) : nil } ?? 0,
      isRunningTurn: json["isRunningTurn"]?.bool ?? json["isRunning"]?.bool ?? false,
      isComposing: json["isComposingMessage"]?.bool ?? false,
      activityLabel: json["currentActivity"]?["label"]?.text,
      isHidden: json["isHiddenFromSidebar"]?.bool ?? false
    )
    notifyOnUpdates = json["notifyOnUpdatesEnabled"]?.bool ?? true
    voiceId = json["voiceId"]?.text
    avatarVersion = json["avatarVersion"]?.text
    avatarShape = json["avatarShape"]?.text
    if let room = json["remoteRoom"], room != .null { isRemoteRoom = true }
    // The window reads `isSharedRoom`, which this host never sends; it sends `sharedRoomId` and refuses member changes for it.
    if json["isSharedRoom"]?.bool == true || json["sharedRoomId"]?.text != nil { isSharedRoom = true }
    isRunning = json["isRunning"]?.bool ?? isRunningTurn
    if let awaiting = json["awaitingUserResponse"], awaiting != .null { awaitingUserResponse = true }
    activityKind = json["currentActivity"]?["kind"]?.text
    activityTool = json["currentActivity"]?["tool"]?.text
    activityDetail = json["currentActivity"]?["detail"]?.text
    activityTarget = json["currentActivity"]?["target"]?.text
    lastMessageId = json["lastMessageId"]?.text
    if let entry = json["lastEntry"], entry != .null { lastEntry = entry }
    waitingReason = json["awaitingUserResponse"]?["reason"]?.text
    createdAt = json["createdAt"]?.double
    purpose = json["purpose"]?.text
    conversationPartnerIds = json["conversationPartnerIds"]?.array?.compactMap(\.string) ?? []
    updatedAt = json["updatedAt"]?.double
    stamp = RosterStamp(epoch: json["snapshotEpoch"]?.string ?? "", seq: json["snapshotSeq"]?.double ?? 0)
  }

  /**
   * The Chief of Staff (`__simeonFindCoo`): the oldest agent titled "Chief
   * of Staff" or "COO", whatever its name. His title and description are
   * his own; his name and avatar can change.
   */
  public static func chiefOfStaff(in agents: [Agent]) -> Agent? {
    var found: Agent?
    for agent in agents {
      let title = agent.title.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
      guard title == "chief of staff" || title == "coo" else { continue }
      if found == nil || (agent.createdAt ?? 0) < (found?.createdAt ?? 0) { found = agent }
    }
    return found
  }

  /**
   * The title as the person reads it (22 October 2026): the Chief of Staff's,
   * saved in English since the engine knows him by it (`isChiefOfStaffTitle`),
   * in the app's language; any other as its agent wrote it.
   */
  public var shownTitle: String {
    title.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == "chief of staff" ? L10n.text("Chief of Staff") : title
  }

  /** The description as the person reads it: Simeon's own from onboarding in the app's language, any other as written. */
  public var shownDescription: String {
    description == Onboarding.chiefOfStaffDescription ? L10n.text("Your Chief of Staff: manages your other Agents and pulls you in for decisions.") : description
  }

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
    if awaitingUserResponse, let reason = waitingReason, !reason.isEmpty { return L10n.text("Waiting for you: \(reason)") }
    if let entry = lastEntry, let line = Preview.line(entry), !line.isEmpty { return line }
    if let preview = lastMessagePreview { return Preview.plain(preview) }
    return description
  }
}

/** The Mac's preview text (`sidebar-agent-preview-content.tsx`). */
public enum Preview {
  public static func line(_ entry: JSON) -> String? {
    switch entry["kind"]?.string {
    case "link": return entry["url"]?.text.map { L10n.text("Sent a link · \($0)") }
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

  /** The kinds a preview names; any other is a file. */
  static let named: Set<String> = ["image", "video", "audio", "pdf", "markdown", "table", "json", "text", "document", "archive", "file"]

  /** "1 image", "2 images". */
  static func label(_ kind: String, _ count: Int) -> String {
    let one = count == 1
    switch kind {
    case "image": return one ? L10n.text("1 image") : L10n.text("\(count) images")
    case "video": return one ? L10n.text("1 video") : L10n.text("\(count) videos")
    case "audio": return one ? L10n.text("1 audio file") : L10n.text("\(count) audio files")
    case "pdf": return one ? L10n.text("1 PDF") : L10n.text("\(count) PDFs")
    case "markdown": return one ? L10n.text("1 Markdown file") : L10n.text("\(count) Markdown files")
    case "table": return one ? L10n.text("1 spreadsheet") : L10n.text("\(count) spreadsheets")
    case "json": return one ? L10n.text("1 JSON file") : L10n.text("\(count) JSON files")
    case "text": return one ? L10n.text("1 text file") : L10n.text("\(count) text files")
    case "document": return one ? L10n.text("1 document") : L10n.text("\(count) documents")
    case "archive": return one ? L10n.text("1 archive") : L10n.text("\(count) archives")
    default: return one ? L10n.text("1 file") : L10n.text("\(count) files")
    }
  }

  static func attachments(count: Int, kinds: [String: JSON]) -> String {
    let total = max(1, count)
    let present = kinds.compactMap { key, value -> (String, Int)? in
      guard let n = value.int, n > 0 else { return nil }
      return (named.contains(key) ? key : "file", n)
    }.sorted { $0.0 < $1.0 }
    if present.isEmpty { return L10n.text("Sent \(label("file", total))") }
    if present.count == 1 { return L10n.text("Sent \(label(present[0].0, total))") }
    return L10n.text("Sent \(label("file", total)) · \(present.map { label($0.0, $0.1) }.joined(separator: ", "))")
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

  /** A reply in a thread (`branched`, on a message, a card, a file or a notice): it is drawn in the thread, not in the chat (the window's `D2e`). */
  public var isBranched: Bool { Entry.threadKinds.contains(kind) && raw["branched"]?.bool == true }

  /** The line it answers, for the kinds that can answer one (the window's `u0e`). */
  public var threadParent: String? { Entry.threadKinds.contains(kind) ? raw["replyTo"]?.text : nil }

  static let threadKinds: Set<String> = ["message", "send-message", "user-attachment", "notice"]

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
      return message["variant"]?.string == "connected" ? L10n.text("\(name) connected") : L10n.text("Connect \(name)")
    case "connectors":
      // The window's preview (`Lvn`): "Connect Gmail, Notion", or "Connect tools".
      let names = message["connectors"]?.array?.compactMap(\.text) ?? []
      return names.isEmpty ? L10n.text("Connect tools") : L10n.text("Connect \(names.joined(separator: ", "))")
    case "listener-connect": return message["platform"]?.string == "slack" ? L10n.text("Connect Slack") : L10n.text("Connect GitHub")
    case "attachment": return (message["file_name"]?.text ?? message["url"]?.text.map(fileName(ofURL:))).map(fileTitle) ?? L10n.text("Sent a file")
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

/**
 A file's name read as a title, as the chat's file card shows it (the
 founder, 24 October 2026, of "53cd913a…d6.xlsx": "it should be a title"):
 "dakar_trip_budget.xlsx" reads "Dakar trip budget". The extension goes (the
 card's icon says the kind), "_" reads as a space, and "-" too in a name
 with no spaces. A name the computer made from the file's contents (a long
 run of hex digits) reads as its kind. Saving keeps the real name.
 */
public func fileTitle(_ name: String) -> String {
  var base = name, ext = ""
  if let dot = name.lastIndex(of: "."), dot > name.startIndex {
    let tail = name[name.index(after: dot)...]
    if (2...5).contains(tail.count), tail.allSatisfy({ $0.isLetter || $0.isNumber }), tail.contains(where: \.isLetter) {
      base = String(name[..<dot])
      ext = tail.lowercased()
    }
  }
  if base.count >= 32, base.allSatisfy(\.isHexDigit) {
    switch ext {
    case "xls", "xlsx", "csv", "tsv", "numbers": return L10n.text("Spreadsheet")
    case "doc", "docx", "rtf", "pages", "odt", "md", "txt": return L10n.text("Document")
    case "ppt", "pptx", "key": return L10n.text("Presentation")
    case "pdf": return "PDF"
    default: return L10n.text("File")
    }
  }
  var words = base.replacingOccurrences(of: "_", with: " ")
  if !words.contains(" ") { words = words.replacingOccurrences(of: "-", with: " ") }
  words = words.split(separator: " ").joined(separator: " ")
  guard let first = words.first else { return name }
  return first.uppercased() + words.dropFirst()
}
