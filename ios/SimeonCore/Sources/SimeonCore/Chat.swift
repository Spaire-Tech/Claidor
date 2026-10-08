import Foundation

/** A question card (`send-message` of type `widget`), with the answer once given. */
public struct QuestionCard: Hashable, Sendable {
  public let prompt: String
  public let help: String?
  public let options: [String]
  public let allowsOwnAnswer: Bool
  /** What the person answered (`respondedValue`); nil while it waits. */
  public let answer: String?
  public let isDismissed: Bool
}

/** A call's line in the chat: its length and what was said. */
public struct CallLine: Hashable, Sendable {
  public let fromPerson: Bool
  public let text: String
}

/**
 * One row of a chat as the phone draws it, in the window's own order and
 * folding (the founder's phone design, 8 October 2026): a time stamp when
 * an hour has passed, the person's bubbles on the right, an agent's on the
 * left, files, question cards, "N messages with …" for agents talking to
 * each other, a call as one "Voice chat" line, a routine as one line.
 */
public enum ChatRow: Identifiable, Hashable, Sendable {
  case stamp(id: String, date: Date)
  case bubble(Bubble)
  case file(id: String, name: String, url: String, fromPerson: Bool)
  case question(id: String, card: QuestionCard)
  case connectors(id: String, names: [String], connected: Bool, reason: String?)
  case teammates(id: String, count: Int, peers: [Party], entries: [Entry])
  case voiceCall(id: String, seconds: Int, lines: [CallLine])
  case routine(id: String, action: String, name: String)

  public var id: String {
    switch self {
    case .stamp(let id, _), .file(let id, _, _, _), .question(let id, _), .connectors(let id, _, _, _),
         .teammates(let id, _, _, _), .voiceCall(let id, _, _), .routine(let id, _, _): return id
    case .bubble(let bubble): return bubble.id
    }
  }
}

public struct Bubble: Hashable, Sendable {
  public let id: String
  public let text: String
  public let fromPerson: Bool
  /** In a group, the member who spoke. */
  public let author: Party?
  /** In a group: the author's name above the first of their bubbles in a row, the butterfly beside the last. */
  public let showsName: Bool
  public let showsAvatar: Bool
  public let reactions: [String]
  public let isStreaming: Bool
}

public enum Chat {
  /** A new stamp after a quarter of an hour without a line, or on a new day (the window's `zIn`, `OIn = 900 s`). */
  public static let stampGap: TimeInterval = 15 * 60

  public static func rows(_ entries: [Entry], isGroup: Bool = false) -> [ChatRow] {
    var rows: [ChatRow] = []
    var lastShown: Date?
    var index = 0

    func stamp(before entry: Entry) {
      guard let date = entry.date else { return }
      if lastShown == nil || abs(date.timeIntervalSince(lastShown!)) >= stampGap || !Calendar.current.isDate(date, inSameDayAs: lastShown!) {
        rows.append(.stamp(id: "stamp-\(entry.id)", date: date))
      }
      lastShown = date
    }

    while index < entries.count {
      let entry = entries[index]
      // Agents talking to each other, and calls written before calls were one line.
      if entry.kind == "message", let peer = entry.teammate {
        var run: [Entry] = [entry]
        var next = index + 1
        let call = peer.earlierCall
        while next < entries.count, entries[next].kind == "message", let other = entries[next].teammate {
          if let call {
            guard other.earlierCall?.callId == call.callId else { break }
          } else if other.earlierCall != nil {
            break
          }
          run.append(entries[next]); next += 1
        }
        stamp(before: entry)
        if let call {
          rows.append(.voiceCall(id: entry.id, seconds: call.seconds, lines: run.map { CallLine(fromPerson: $0.fromAgent != nil, text: $0.content ?? "") }))
        } else {
          var peers: [Party] = []
          for party in run.compactMap(\.teammate) where !peers.contains(where: { $0.id == party.id }) { peers.append(party) }
          rows.append(.teammates(id: entry.id, count: run.count, peers: peers, entries: run))
        }
        index = next
        continue
      }
      if let row = row(for: entry) {
        stamp(before: entry)
        rows.append(row)
      }
      index += 1
    }
    return isGroup ? markRuns(rows) : rows
  }

  static func row(for entry: Entry) -> ChatRow? {
    let reactions = entry.reactions.map(\.emoji)
    switch entry.kind {
    case "message", "user-message", "human-message":
      guard let text = entry.content, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
      let fromPerson = entry.isFromPerson || entry.role == "user"
      return .bubble(Bubble(id: entry.id, text: text, fromPerson: fromPerson, author: fromPerson ? nil : entry.author, showsName: false, showsAvatar: false, reactions: reactions, isStreaming: entry.isStreaming))
    case "user-attachment":
      let name = entry["file_name"]?.text ?? entry["file_path"]?.text.map(fileName(ofURL:)) ?? "Attachment"
      return .file(id: entry.id, name: name, url: entry["file_path"]?.string ?? "", fromPerson: true)
    case "send-message":
      guard let message = entry.message else { return nil }
      switch message["type"]?.string {
      case "attachment":
        guard let url = message["url"]?.text else { return nil }
        return .file(id: entry.id, name: fileName(ofURL: url), url: url, fromPerson: false)
      case "widget":
        guard let widget = message["widget"], let prompt = widget["prompt"]?.text else { return nil }
        return .question(id: entry.id, card: QuestionCard(
          prompt: prompt, help: widget["helpText"]?.text,
          options: widget["options"]?.array?.compactMap { $0["label"]?.text } ?? [],
          allowsOwnAnswer: widget["allowCustom"]?.bool ?? false,
          answer: entry["respondedValue"]?.text, isDismissed: entry["widgetDismissed"]?.bool ?? false))
      case "connectors":
        let names = message["connectors"]?.array?.compactMap(\.text) ?? []
        return names.isEmpty ? nil : .connectors(id: entry.id, names: names, connected: true, reason: nil)
      case "connector":
        guard let name = message["connector"]?.text else { return nil }
        return .connectors(id: entry.id, names: [name], connected: message["variant"]?.string == "connected", reason: message["reason"]?.text)
      default:
        guard let text = message["content"]?.text else { return nil }
        return .bubble(Bubble(id: entry.id, text: text, fromPerson: false, author: entry.author, showsName: false, showsAvatar: false, reactions: reactions, isStreaming: false))
      }
    case "event":
      guard let event = entry.event else { return nil }
      switch event["type"]?.string {
      case "voice-call":
        let lines = (event["lines"]?.array ?? []).compactMap { line -> CallLine? in
          guard let text = line["text"]?.text else { return nil }
          return CallLine(fromPerson: line["speaker"]?.string == "user", text: text)
        }
        return .voiceCall(id: entry.id, seconds: event["seconds"]?.int ?? 0, lines: lines)
      case "automation-changed":
        guard let name = event["automationName"]?.text else { return nil }
        return .routine(id: entry.id, action: event["action"]?.string ?? "created", name: name)
      default:
        return nil
      }
    default:
      return nil
    }
  }

  /** In a group: a member's name over the first bubble of their run, their butterfly beside the last. */
  static func markRuns(_ rows: [ChatRow]) -> [ChatRow] {
    var out = rows
    for (i, row) in rows.enumerated() {
      guard case .bubble(let bubble) = row, !bubble.fromPerson, let author = bubble.author else { continue }
      let sameAuthor = { (other: ChatRow?) -> Bool in
        if case .bubble(let b)? = other, !b.fromPerson, b.author?.id == author.id { return true }
        return false
      }
      let previous = i > 0 ? rows[i - 1] : nil
      let next = i + 1 < rows.count ? rows[i + 1] : nil
      out[i] = .bubble(Bubble(id: bubble.id, text: bubble.text, fromPerson: false, author: author, showsName: !sameAuthor(previous), showsAvatar: !sameAuthor(next), reactions: bubble.reactions, isStreaming: bubble.isStreaming))
    }
    return out
  }

  /**
   * A stamp the window's way (`ept`): "Today 6:34 AM", "Yesterday 11:40 PM",
   * "Wed, Oct 7 3:12 PM" this year, "Oct 7, 2025 3:12 PM" before.
   */
  public static func stampText(_ date: Date, now: Date = Date(), calendar: Calendar = .current, locale: Locale = .current) -> String {
    let formatter = { (template: String) in Chat.formatter(template, calendar: calendar, locale: locale) }
    let clock = formatter("jmm").string(from: date)
    if calendar.isDate(date, inSameDayAs: now) { return "Today \(clock)" }
    if let yesterday = calendar.date(byAdding: .day, value: -1, to: now), calendar.isDate(date, inSameDayAs: yesterday) { return "Yesterday \(clock)" }
    if calendar.component(.year, from: date) == calendar.component(.year, from: now) { return "\(formatter("EEEMMMd").string(from: date)) \(clock)" }
    return "\(formatter("MMMdyyyy").string(from: date)) \(clock)"
  }

  /** The list's time the window's way (`l5e`): "6:34 AM" today, "Yesterday", the weekday this week, "10/7" this year, "10/7/25" before. */
  public static func listTime(_ date: Date, now: Date = Date(), calendar: Calendar = .current, locale: Locale = .current) -> String {
    let formatter = { (template: String) in Chat.formatter(template, calendar: calendar, locale: locale) }
    let days = calendar.dateComponents([.day], from: calendar.startOfDay(for: date), to: calendar.startOfDay(for: now)).day ?? 0
    if days <= 0 { return formatter("jmm").string(from: date) }
    if days == 1 { return "Yesterday" }
    if days < 7 { return formatter("EEEE").string(from: date) }
    if calendar.component(.year, from: date) == calendar.component(.year, from: now) { return formatter("Md").string(from: date) }
    return formatter("Mdyy").string(from: date)
  }

  private static let formattersLock = NSLock()
  nonisolated(unsafe) private static var formatters: [String: DateFormatter] = [:]

  /** A date formatter per template, made once: making one is slow, and every row of the list and every stamp asks. */
  static func formatter(_ template: String, calendar: Calendar, locale: Locale) -> DateFormatter {
    let key = "\(template)|\(locale.identifier)|\(calendar.identifier)|\(calendar.timeZone.identifier)"
    return formattersLock.withLock {
      if let made = formatters[key] { return made }
      let made = DateFormatter()
      made.locale = locale; made.calendar = calendar; made.timeZone = calendar.timeZone
      made.setLocalizedDateFormatFromTemplate(template)
      formatters[key] = made
      return made
    }
  }

  /** A call's length the Mac's way: "01:11", or "1:02:05" past the hour. */
  public static func callLength(_ seconds: Int) -> String {
    let h = seconds / 3600, m = (seconds % 3600) / 60, s = seconds % 60
    return h > 0 ? String(format: "%d:%02d:%02d", h, m, s) : String(format: "%02d:%02d", m, s)
  }

  /** The running call's clock, the banner's way (`formatCallDuration`): "0:16", "12:04", "1:02:05". */
  public static func callClock(_ seconds: Int) -> String {
    let h = seconds / 3600, m = (seconds % 3600) / 60, s = seconds % 60
    return h > 0 ? String(format: "%d:%02d:%02d", h, m, s) : String(format: "%d:%02d", m, s)
  }
}
