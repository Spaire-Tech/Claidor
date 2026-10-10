import Foundation

/**
 * A chat line's place among its neighbours, as the Mac window reads it
 * (`REn`): whether someone else spoke before it, which sets it 12 points
 * lower (`--simeon-spacing-3`), and whether the bubble before or after it is
 * the same sender's, which turns its corner on that side to 6 points.
 */
public struct RunFlags: Hashable, Sendable {
  /** Someone else spoke before it (`isGroupStart`). */
  public var startsGroup = false
  /** The bubble before it is the same sender's (`isContinuedFromPrev`): its top corner on its side 6 round. */
  public var continuesPrevious = false
  /** The bubble after it is the same sender's (`isContinuedToNext`): its bottom corner on its side 6 round. */
  public var continuesNext = false
  /** Its thread's "1 reply" hangs under it (`isFollowedByThreadChip`): its bottom corner on its side square. */
  public var aboveThreadChip = false

  public init(startsGroup: Bool = false, continuesPrevious: Bool = false, continuesNext: Bool = false, aboveThreadChip: Bool = false) {
    self.startsGroup = startsGroup; self.continuesPrevious = continuesPrevious
    self.continuesNext = continuesNext; self.aboveThreadChip = aboveThreadChip
  }
}

/**
 * The window's display list of a chat (`npt`) and each item's run flags
 * (`REn`, called as its transcript calls it). The display list is the
 * chat's lines in order, less the empty answer still starting (`BIn`), a
 * call's lines to the person (`Rde`) and a line seen twice (`nPe`); tool
 * steps and the Mac's pending or expired asks (`NNe`, `RMt`) are not shown
 * but break a run: the line after one counts it as the line before. A time
 * goes in after a quarter of an hour or a new day (`zIn`), before any
 * untimed lines of the same side just before it (`$In`); "New" goes before
 * the first line not the person's after the chat was last read (`XTe`).
 * Then pictures and files sent together fold into one item (`YIn`), agents
 * talking to each other into one (`KIn`), and two or more routine changes
 * into one (`WIn`). A time or "New" ends a run: the line after it has no
 * line before. The fixture `Fixtures/chat-runs.json` was made by running
 * the window's own functions.
 */
extension Chat {
  struct DisplayItem {
    enum Kind: String {
      case entry
      case timestamp
      case unread = "unread-divider"
      case attachments = "attachment-group"
      case exchange = "agent-comm-group"
      case routines = "routine-event-group"
    }

    var kind: Kind
    var entries: [Entry] = []
    /** The hidden step just before it (`precedingBreakEntry`). */
    var breakEntry: Entry?

    /** `L2e` and `QAe`: nothing for a time or "New". */
    var first: Entry? { kind == .timestamp || kind == .unread ? nil : entries.first }
    var last: Entry? { kind == .timestamp || kind == .unread ? nil : entries.last }
  }

  /** Each item's flags, by the id of its first line. */
  public static func runFlags(_ entries: [Entry], unreadAfter: Double? = nil, threads: Set<String> = []) -> [String: RunFlags] {
    let items = displayItems(entries, unreadAfter: unreadAfter)
    var flags: [String: RunFlags] = [:]
    for (index, item) in items.enumerated() {
      switch item.kind {
      case .timestamp, .unread, .exchange, .routines: continue
      case .entry, .attachments: break
      }
      guard let this = item.first else { continue }
      let previous = item.breakEntry ?? (index > 0 ? items[index - 1].last : nil)
      let next = index + 1 < items.count ? (items[index + 1].breakEntry ?? items[index + 1].first) : nil
      flags[this.id] = run(this, previous: previous, next: next, hasThread: threads.contains(this.id), previousHasThread: previous.map { threads.contains($0.id) } ?? false)
    }
    return flags
  }

  /** The window's `REn` with no working line under the chat (its `isIndicatorTrailing` false). */
  static func run(_ entry: Entry, previous: Entry?, next: Entry?, hasThread: Bool, previousHasThread: Bool) -> RunFlags {
    guard side(entry) != "other" else { return RunFlags() }
    let key = senderKey(entry)
    let bubble = isBubble(entry)
    var flags = RunFlags()
    if let previous { flags.startsGroup = senderKey(previous) != key }
    flags.continuesPrevious = bubble && !previousHasThread && previous.map { senderKey($0) == key && isBubble($0) } == true
    flags.continuesNext = bubble && next.map { senderKey($0) == key && isBubble($0) } == true
    flags.aboveThreadChip = bubble && hasThread && entry.reactions.isEmpty
    return flags
  }

  /** The window's `npt`, then `YIn`, `KIn` and `WIn`. */
  static func displayItems(_ entries: [Entry], unreadAfter: Double?) -> [DisplayItem] {
    var items: [DisplayItem] = []
    var lastTime: Double?
    var seen = Set<String>()
    var pendingBreak: Entry?
    var shown = false
    var dividerPlaced = false
    for entry in entries {
      if isStartingAnswer(entry) { continue }
      if entry.kind == "tool-call" || isOpenLocalAsk(entry) {
        if shown { pendingBreak = entry }
        continue
      }
      if isLineToPerson(entry) { continue }
      let key = entry.kind == "message" ? entry["clientNonce"]?.text.map { "nonce:\($0)" } ?? entry.id : entry.id
      guard seen.insert(key).inserted else { continue }
      let time = shownTime(entry)
      if !dividerPlaced, let after = unreadAfter, side(entry) != "user", let time, time > after {
        items.append(DisplayItem(kind: .unread))
        dividerPlaced = true
      }
      if let time {
        if stampDue(time, after: lastTime) { items.insert(DisplayItem(kind: .timestamp), at: stampPlace(items, before: entry)) }
        lastTime = time
      }
      items.append(DisplayItem(kind: .entry, entries: [entry], breakEntry: pendingBreak))
      pendingBreak = nil
      shown = true
    }
    return routineGroups(exchangeGroups(attachmentGroups(items)))
  }

  /** `aee`: a line's time, when it has a real one. */
  static func shownTime(_ entry: Entry) -> Double? {
    guard let time = entry.timestampMs, time.isFinite, time > 0 else { return nil }
    return time
  }

  /** `zIn`: the first line, a quarter of an hour on, or another day. */
  static func stampDue(_ time: Double, after last: Double?) -> Bool {
    guard let last else { return true }
    let a = Date(timeIntervalSince1970: time / 1000), b = Date(timeIntervalSince1970: last / 1000)
    return abs(time - last) >= 900_000 || !Calendar.current.isDate(a, inSameDayAs: b)
  }

  /** `$In`: before the untimed lines of the same side just before it. */
  static func stampPlace(_ items: [DisplayItem], before entry: Entry) -> Int {
    let wanted = side(entry)
    var place = items.count
    while place > 0 {
      let item = items[place - 1]
      guard item.kind == .entry, let line = item.entries.first, side(line) == wanted, shownTime(line) == nil else { return place }
      place -= 1
    }
    return place
  }

  /** `BIn`: an agent's answer that has started and has no words yet. */
  static func isStartingAnswer(_ entry: Entry) -> Bool {
    entry.kind == "send-message" && entry["streaming"]?.bool == true && entry.message?["type"]?.string == "text" && (entry.message?["content"]?.string ?? "").isEmpty
  }

  /** `NNe` and `RMt`: an ask to use this Mac still waiting, or expired. */
  static func isOpenLocalAsk(_ entry: Entry) -> Bool {
    guard entry.kind == "send-message", entry.message?["type"]?.string == "local-tool-permission" else { return false }
    let status = entry.message?["ask"]?["status"]?.string
    return status == "pending" || status == "expired"
  }

  /** `Rde`: a line to someone who is not an agent (a call's line to the person). */
  static func isLineToPerson(_ entry: Entry) -> Bool {
    guard entry.kind == "message", let to = entry["toAgent"], to != .null else { return false }
    return to["kind"]?.string != "agent"
  }

  /** `fm`: a line between this agent and another. */
  static func isTeammateLine(_ entry: Entry) -> Bool {
    entry.kind == "message" && (entry.fromAgent != nil || entry.toAgent != nil)
  }

  /**
   * `Doe`: drawn as a bubble. Not a lone link (a card, `xEn`), not a line
   * between agents, not the person's single emoji (`jht`), not a message
   * of pictures only (`qht`); an agent's `send-message` only when text.
   */
  static func isBubble(_ entry: Entry) -> Bool {
    if loneLinkCard(entry) { return false }
    switch entry.kind {
    case "message":
      if isTeammateLine(entry) || isLoneEmoji(entry) { return false }
      return !isPicturesOnly(entry.content ?? "")
    case "send-message":
      return entry.message?["type"]?.string == "text"
    default:
      return false
    }
  }

  /** `xEn`: a finished text the window draws as a link card. */
  static func loneLinkCard(_ entry: Entry) -> Bool {
    if entry.kind == "send-message" {
      guard let message = entry.message, message["type"]?.string == "text", entry["streaming"]?.bool != true,
            (message["images"]?.array ?? []).isEmpty else { return false }
      return loneLink(message["content"]?.string ?? "") != nil
    }
    guard entry.kind == "message", entry.role == "user", entry["fromUser"] == nil || entry["fromUser"] == .null,
          entry["channel"] == nil || entry["channel"] == .null, !isTeammateLine(entry) else { return false }
    return loneLink(entry.content ?? "", richText: entry["richText"]?.string) != nil
  }

  /** `jht`: the person's message that is one emoji (`^\p{RGI_Emoji}$`), with no pictures. */
  static func isLoneEmoji(_ entry: Entry) -> Bool {
    guard entry.kind == "message", entry.role == "user", !isTeammateLine(entry), (entry["images"]?.array ?? []).isEmpty else { return false }
    let trimmed = (entry.content ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    guard trimmed.count == 1, let character = trimmed.first else { return false }
    let scalars = character.unicodeScalars
    if scalars.contains(where: { $0.properties.isEmojiPresentation }) { return true }
    // A text-default emoji made a picture by its selector (❤️), a keycap (1️⃣) or a flag.
    return scalars.count > 1 && scalars.first?.properties.isEmoji == true && scalars.contains(where: { $0.value == 0xFE0F || $0.value == 0x20E3 || (0x1F1E6...0x1F1FF).contains($0.value) })
  }

  /** `qht`: words that are only Markdown pictures. */
  static func isPicturesOnly(_ text: String) -> Bool {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return false }
    let rest = trimmed.replacingOccurrences(of: #"!\[[^\]]*\]\([^)]*\)"#, with: "", options: .regularExpression)
    return rest.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }

  /** `YIn` (no thread open): pictures or files sent together, two or more, as one item. */
  static func attachmentGroups(_ items: [DisplayItem]) -> [DisplayItem] {
    var out: [DisplayItem] = []
    var run: [DisplayItem] = []
    var runKey: String?
    func flush() {
      if run.count >= 2, let first = run.first {
        out.append(DisplayItem(kind: .attachments, entries: run.flatMap(\.entries), breakEntry: first.breakEntry))
      } else {
        out += run
      }
      run = []
      runKey = nil
    }
    for item in items {
      if item.kind == .entry, let line = item.entries.first, let key = attachmentKey(line) {
        if !run.isEmpty && (key != runKey || item.breakEntry != nil) { flush() }
        run.append(item)
        runKey = key
        continue
      }
      flush()
      out.append(item)
    }
    flush()
    return out
  }

  /** `Qht`: which attachments go together. */
  static func attachmentKey(_ entry: Entry) -> String? {
    let replyTo = ["message", "send-message", "user-attachment", "notice"].contains(entry.kind) ? entry["replyTo"]?.text : nil
    if entry.kind == "user-attachment", let batch = entry["batchId"]?.text {
      return replyTo.map { "ua:\(batch):\($0)" } ?? "ua:\(batch)"
    }
    if replyTo != nil { return nil }
    if entry.kind == "user-attachment" { return "ua:legacy" }
    if entry.kind == "send-message", entry.message?["type"]?.string == "attachment", let url = entry.message?["url"]?.string, isPictureOrVideo(url) {
      return "ai:\(senderKey(entry))"
    }
    return nil
  }

  /** `IZ`: a picture or a video, by its extension (`kft`, `uAe`). */
  static func isPictureOrVideo(_ url: String) -> Bool {
    var path = url
    if let parsed = URL(string: url), parsed.scheme != nil { path = parsed.path }
    let ext = (path as NSString).pathExtension.lowercased()
    return pictureExtensions.contains(ext) || ["m4v", "mov", "mp4", "ogv", "webm"].contains(ext)
  }

  /** `KIn`: the lines between this agent and others, one call's lines apart from the rest (`__simeonVoiceKey`). */
  static func exchangeGroups(_ items: [DisplayItem]) -> [DisplayItem] {
    var out: [DisplayItem] = []
    var run: [DisplayItem] = []
    func flush() {
      if let first = run.first {
        out.append(DisplayItem(kind: .exchange, entries: run.flatMap(\.entries), breakEntry: first.breakEntry))
      }
      run = []
    }
    for item in items {
      if item.kind == .entry, let line = item.entries.first, isTeammateLine(line) {
        if let first = run.first?.entries.first, voiceKey(first) != voiceKey(line) { flush() }
        run.append(item)
        continue
      }
      flush()
      out.append(item)
    }
    flush()
    return out
  }

  static func voiceKey(_ entry: Entry) -> String {
    guard let peer = entry.fromAgent ?? entry.toAgent, peer.id.hasPrefix("voice-call:") else { return "" }
    return peer.id
  }

  /** `WIn`: two or more routine changes in a row as one item. */
  static func routineGroups(_ items: [DisplayItem]) -> [DisplayItem] {
    var out: [DisplayItem] = []
    var run: [DisplayItem] = []
    func flush() {
      if run.count >= 2, let first = run.first {
        out.append(DisplayItem(kind: .routines, entries: run.flatMap(\.entries), breakEntry: first.breakEntry))
      } else {
        out += run
      }
      run = []
    }
    for item in items {
      if item.kind == .entry, let line = item.entries.first, line.kind == "event", line.event?["type"]?.string == "automation-changed" {
        run.append(item)
        continue
      }
      flush()
      out.append(item)
    }
    flush()
    return out
  }

  /** The window's `Tpe`: who a line is from, for runs. */
  static func senderKey(_ entry: Entry) -> String {
    if entry.kind == "send-message", let author = entry.author { return "member:\(author.id)" }
    if entry.kind == "message" {
      if let from = entry.fromAgent { return "agent:\(from.id)" }
      if let human = entry["fromUser"], human != .null { return "human:\(human["authId"]?.text ?? "")" }
      if let to = entry.toAgent, entry["toAgent"]?["kind"]?.string == "agent" { return "agent:\(to.id)" }
    }
    return side(entry)
  }

  /** The window's `JZ`: "assistant", "user", the message's role, or "other". */
  static func side(_ entry: Entry) -> String {
    if isLineToPerson(entry) { return "other" }
    switch entry.kind {
    case "message":
      let fromUser = entry["fromUser"].map { $0 != .null } ?? false
      if isTeammateLine(entry) || fromUser { return "assistant" }
      return entry.role ?? ""
    case "send-message": return "assistant"
    case "user-attachment": return "user"
    default: return "other"
    }
  }
}
