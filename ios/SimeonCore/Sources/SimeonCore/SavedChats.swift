import Foundation

/**
 * The agents and their chats as this device last saw them, kept between
 * launches (26 October 2026, the founder: the app showed nothing, or
 * "Reconnecting", whenever the computer slept or was updated). At launch the
 * list shows them at once, and a chat its lines at once when it opens; the
 * computer's own copy replaces them when it answers (`AppStore.showSaved`,
 * `refresh`). The Electron window kept the list the same way
 * (`roster.last-roster`); the chats are new.
 *
 * Under the app's caches: the system may clear them, and the app then waits
 * for the computer as it did before. One account's: signing out forgets
 * them, and a copy kept for another account is never shown. Written off the
 * main thread, one file for the list and one per chat, each only when it
 * changed.
 */
public final class SavedChats: @unchecked Sendable {
  public static let version = 1
  /** A chat's newest lines kept: the first page the computer sends holds up to 500. */
  public static let linesKept = 300
  /** A chat kept larger than this keeps its newest 100 lines, and none when those are still larger. */
  public static let largestChat = 2_000_000
  static let linesKeptWhenLarge = 100

  /** Whose copy it is: the account's id on the server, and its e-mail when the id is not known yet. */
  public struct Owner: Equatable, Sendable {
    public let id: String?
    public let email: String

    public init(id: String?, email: String) {
      self.id = id.flatMap { $0.isEmpty ? nil : $0 }
      self.email = email.lowercased()
    }

    public init?(_ account: Account?) {
      guard let account, !(account.id ?? "").isEmpty || !account.email.isEmpty else { return nil }
      self.init(id: account.id, email: account.email)
    }

    /** The same person: by id when both have one, else by e-mail. */
    public func isSame(as other: Owner) -> Bool {
      if let id, let otherId = other.id { return id == otherId }
      return !email.isEmpty && email == other.email
    }
  }

  public struct Roster: Equatable, Sendable {
    public let owner: Owner
    public let agents: [Agent]
  }

  public struct Lines: Equatable, Sendable {
    public let entries: [Entry]
    /** The chat has older lines than these (the computer had more, or some were left out here). */
    public let hasOlder: Bool
  }

  private let directory: URL
  /** Every read and write, one after the other: a read waits for the writes before it, and nothing is read back that a sign-out has forgotten. */
  private let queue = DispatchQueue(label: "com.simeonlabs.saved-chats")
  /** What was last written or read (on `queue`). Nil inside: known to be absent. */
  private var roster: Roster??
  private var chats: [String: Lines?] = [:]

  public init(directory: URL) {
    self.directory = directory
  }

  /** The apps' own: under the caches, in the app's folder (the Mac's caches are shared by every app). */
  public static func onDevice(bundle: Bundle = .main) -> SavedChats? {
    guard let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first else { return nil }
    return SavedChats(directory: caches.appendingPathComponent(bundle.bundleIdentifier ?? "Simeon", isDirectory: true).appendingPathComponent("saved-chats", isDirectory: true))
  }

  // MARK: Reading

  /** The list kept, nil when there is none. */
  public func readRoster() -> Roster? {
    queue.sync {
      if let known = roster { return known }
      let read = Self.decodeRoster(try? Data(contentsOf: rosterFile))
      roster = .some(read)
      return read
    }
  }

  /** A chat's lines kept, nil when there are none. */
  public func readChat(_ agentId: String) -> Lines? {
    queue.sync {
      if let known = chats[agentId] { return known }
      let read = Self.decodeChat(try? Data(contentsOf: chatFile(agentId)), agentId: agentId)
      chats[agentId] = .some(read)
      return read
    }
  }

  // MARK: Writing

  public func writeRoster(_ agents: [Agent], owner: Owner) {
    queue.async { [self] in
      roster = .some(Roster(owner: owner, agents: agents))
      guard let data = Self.encodeRoster(agents, owner: owner) else { return }
      Self.write(data, to: rosterFile)
    }
  }

  /** A chat's lines, its newest ones (`keptLines`); none kept when they are too large even then, and none for an empty chat. */
  public func writeChat(_ agentId: String, _ entries: [Entry], hasOlder: Bool) {
    queue.async { [self] in
      let kept = Self.keptLines(entries, hasOlder: hasOlder)
      chats[agentId] = .some(kept)
      let file = chatFile(agentId)
      guard let kept, let data = Self.encodeChat(agentId, kept.entries, hasOlder: kept.hasOlder) else {
        try? FileManager.default.removeItem(at: file)
        return
      }
      Self.write(data, to: file)
    }
  }

  /** Every chat kept for an agent no longer in the list goes. */
  public func removeChats(keeping agentIds: Set<String>) {
    queue.async { [self] in
      chats = chats.filter { agentIds.contains($0.key) }
      let keptNames = Set(agentIds.map(Self.fileName))
      guard let names = try? FileManager.default.contentsOfDirectory(atPath: chatsDirectory.path) else { return }
      for name in names where !keptNames.contains(name) {
        try? FileManager.default.removeItem(at: chatsDirectory.appendingPathComponent(name))
      }
    }
  }

  /** Signed out: all of it goes, after any write still on its way. */
  public func forget() {
    queue.async { [self] in
      roster = .some(nil)
      chats = [:]
      try? FileManager.default.removeItem(at: directory)
    }
  }

  /** Waits for the writes on their way (the Mac quitting). */
  public func waitForWrites() {
    queue.sync {}
  }

  // MARK: The files

  private var rosterFile: URL { directory.appendingPathComponent("roster.json") }
  private var chatsDirectory: URL { directory.appendingPathComponent("chats", isDirectory: true) }
  private func chatFile(_ agentId: String) -> URL { chatsDirectory.appendingPathComponent(Self.fileName(agentId)) }

  /** An agent's id as a file's name: its hash, so no id can name a path. */
  static func fileName(_ agentId: String) -> String {
    sha256(Array(agentId.utf8)).prefix(16).map { String(format: "%02x", $0) }.joined() + ".json"
  }

  private static func write(_ data: Data, to file: URL) {
    try? FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
    try? data.write(to: file, options: .atomic)
  }

  // MARK: What is in them

  static func encodeRoster(_ agents: [Agent], owner: Owner) -> Data? {
    var record: [String: JSON] = ["version": .number(Double(version)), "email": .string(owner.email), "agents": .array(agents.map(\.savedJSON))]
    if let id = owner.id { record["accountId"] = .string(id) }
    return try? JSON.object(record).data()
  }

  static func decodeRoster(_ data: Data?) -> Roster? {
    guard let data, let record = try? JSON.parse(data), record["version"]?.double == Double(version),
          let email = record["email"]?.string, let rows = record["agents"]?.array else { return nil }
    return Roster(owner: Owner(id: record["accountId"]?.text, email: email), agents: rows.compactMap(Agent.init(json:)))
  }

  static func encodeChat(_ agentId: String, _ entries: [Entry], hasOlder: Bool) -> Data? {
    try? JSON.object(["version": .number(Double(version)), "agentId": .string(agentId), "hasOlder": .bool(hasOlder), "entries": .array(entries.map(\.raw))]).data()
  }

  static func decodeChat(_ data: Data?, agentId: String) -> Lines? {
    guard let data, let record = try? JSON.parse(data), record["version"]?.double == Double(version),
          record["agentId"]?.string == agentId, let rows = record["entries"]?.array else { return nil }
    let entries = rows.compactMap(Entry.init)
    return entries.isEmpty ? nil : Lines(entries: entries, hasOlder: record["hasOlder"]?.bool ?? false)
  }

  /**
   * The lines a chat keeps: its newest `linesKept`, or its newest 100 when
   * those are larger than `largestChat`; nil when even those are, or there
   * are none. A line still being written is kept as it was, finished: it
   * would otherwise show as still streaming.
   */
  static func keptLines(_ entries: [Entry], hasOlder: Bool) -> Lines? {
    guard !entries.isEmpty else { return nil }
    for limit in [linesKept, linesKeptWhenLarge] {
      let kept = entries.suffix(limit).map { entry in entry.isStreaming ? Entry(entry.raw.setting("isStreaming", nil)) ?? entry : entry }
      let size = (try? JSON.array(kept.map(\.raw)).data().count) ?? .max
      if size <= largestChat { return Lines(entries: Array(kept), hasOlder: hasOlder || kept.count < entries.count) }
    }
    return nil
  }
}

extension Agent {
  /**
   * The row as the host writes it, for `SavedChats`: read back through
   * `init(json:)` it is the same row, less what was going on at that moment
   * (a turn running, typing, the step under way), which a list kept from
   * before would show as still going.
   */
  public var savedJSON: JSON {
    var row: [String: JSON] = [
      "id": .string(id), "name": .string(name), "title": .string(title), "description": .string(description),
      "isGroup": .bool(isGroup), "memberIds": JSON(memberIds), "hasUnread": .bool(hasUnread), "unreadCount": JSON(unreadCount),
      "isRunningTurn": false, "isRunning": false, "isComposingMessage": false, "isHiddenFromSidebar": .bool(isHidden),
      "notifyOnUpdatesEnabled": .bool(notifyOnUpdates), "conversationPartnerIds": JSON(conversationPartnerIds),
      "snapshotEpoch": .string(stamp.epoch), "snapshotSeq": .number(stamp.seq),
    ]
    let texts: [(String, String?)] = [
      ("avatarColor", colour), ("avatarDataUrl", avatarDataURL), ("lastMessagePreview", lastMessagePreview), ("voiceId", voiceId),
      ("avatarVersion", avatarVersion), ("avatarShape", avatarShape), ("lastMessageId", lastMessageId), ("purpose", purpose),
    ]
    for (key, value) in texts { if let value { row[key] = .string(value) } }
    let numbers: [(String, Double?)] = [("lastActivityAt", lastActivityAt), ("createdAt", createdAt), ("updatedAt", updatedAt)]
    for (key, value) in numbers { if let value { row[key] = .number(value) } }
    if isRemoteRoom { row["remoteRoom"] = true }
    if isSharedRoom { row["isSharedRoom"] = true }
    if awaitingUserResponse { row["awaitingUserResponse"] = .object(waitingReason.map { ["reason": .string($0)] } ?? [:]) }
    if let lastEntry { row["lastEntry"] = lastEntry }
    return .object(row)
  }
}
