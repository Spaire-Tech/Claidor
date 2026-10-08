import Foundation

/** One choice on a question card: its label and, when the agent gave one, a line under it. */
public struct QuestionOption: Hashable, Sendable {
  public let label: String
  public let description: String?

  public init(label: String, description: String? = nil) { self.label = label; self.description = description }
}

/** A question card (`send-message` of type `widget`), with the answer once given. */
public struct QuestionCard: Hashable, Sendable {
  public let prompt: String
  public let help: String?
  public let options: [QuestionOption]
  public let allowsOwnAnswer: Bool
  /** What the person answered (`respondedValue`); nil while it waits. */
  public let answer: String?
  public let isDismissed: Bool
  /** Skipped: the person wrote instead of answering (`widgetSkipped`); the card is closed. */
  public let isSkipped: Bool

  public var labels: [String] { options.map(\.label) }
  public var isOpen: Bool { answer == nil && !isDismissed && !isSkipped }
}

/** An email or a Slack message the agent drafted, for the person to send or discard (host/extensions/transcript/draft-cards.ts). */
public struct DraftCard: Hashable, Sendable {
  public enum Kind: String, Sendable { case email, slack }
  public let kind: Kind
  public let from: String
  public let to: [String]
  public let cc: [String]
  public let subject: String
  public let body: String
  public let workspace: String
  public let target: String
  public let thread: String
  /** `editable`, `sending` or `sent` (`draftSendState`). */
  public let state: String
  public let isDismissed: Bool

  init?(message: JSON, entry: Entry) {
    guard let draft = message["draft"] else { return nil }
    kind = message["type"]?.string == "slack-draft" ? .slack : .email
    let list = { (value: JSON?) -> [String] in value?.array?.compactMap(\.text) ?? value?.text.map { [$0] } ?? [] }
    from = draft["from"]?.string ?? ""
    to = list(draft["to"])
    cc = list(draft["cc"])
    subject = draft["subject"]?.string ?? ""
    body = draft["body"]?.string ?? ""
    workspace = draft["workspace"]?.string ?? ""
    target = draft["target"]?.string ?? ""
    thread = draft["thread"]?.string ?? ""
    state = entry["draftSendState"]?.string ?? "editable"
    isDismissed = entry["widgetDismissed"]?.bool ?? false
  }

  /** What the card says beside its title ("Ready to send", "Sending…", "Sent", "Discarded"). */
  public var status: String {
    if isDismissed { return "Discarded" }
    switch state {
    case "sending": return "Sending…"
    case "sent": return "Sent"
    default: return "Ready to send"
    }
  }
}

/** One airline offer on a flights card (the patch's `__simeonFlightsParse`). */
public struct FlightOffer: Hashable, Sendable {
  public let airline, logo, price, priceNote, date: String
  public let from, fromCity, to, toCity, depart, arrive, duration, stops: String
  public let refundable, changeable, bags, returnTimes: String
  public let legs: [FlightLeg]
}

public struct FlightLeg: Hashable, Sendable {
  public let from, fromCity, to, toCity, depart, arrive, flight, carrier, logo, cabin, duration, layover, heading, departDay, arriveDay: String
}

/**
 * Flight results: an agent's message that is exactly one ```` ```simeon-flights ````
 * block of JSON (patch: FLIGHTS_SOURCE), up to eight offers.
 */
public struct FlightsCard: Hashable, Sendable {
  public let title: String
  public let subtitle: String
  public let offers: [FlightOffer]

  public static func parse(_ text: String) -> FlightsCard? {
    guard let body = Markdown.soleFence(text, language: "simeon-flights"), let json = try? JSON.parse(Data(body.utf8)) else { return nil }
    let s = { (value: JSON?) -> String in value?.string?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "" }
    let offers = (json["offers"]?.array ?? []).filter { $0.object != nil }.prefix(8).map { o -> FlightOffer in
      let legs = (o["legs"]?.array ?? []).filter { $0.object != nil }.map { l in
        FlightLeg(from: s(l["from"]), fromCity: s(l["fromCity"]), to: s(l["to"]), toCity: s(l["toCity"]), depart: s(l["depart"]), arrive: s(l["arrive"]), flight: s(l["flight"]), carrier: s(l["carrier"]), logo: s(l["logo"]), cabin: s(l["cabin"]), duration: s(l["duration"]), layover: s(l["layover"]), heading: s(l["heading"]), departDay: s(l["departDay"]), arriveDay: s(l["arriveDay"]))
      }
      return FlightOffer(airline: s(o["airline"]), logo: s(o["logo"]), price: s(o["price"]), priceNote: s(o["priceNote"]), date: s(o["date"]), from: s(o["from"]), fromCity: s(o["fromCity"]), to: s(o["to"]), toCity: s(o["toCity"]), depart: s(o["depart"]), arrive: s(o["arrive"]), duration: s(o["duration"]), stops: s(o["stops"]), refundable: s(o["refundable"]), changeable: s(o["changeable"]), bags: s(o["bags"]), returnTimes: s(o["returnTimes"]), legs: legs)
    }
    guard !offers.isEmpty else { return nil }
    return FlightsCard(title: s(json["title"]), subtitle: s(json["subtitle"]), offers: Array(offers))
  }

  /** "AA" for American Airlines: the mark when the airline has no logo (`__simeonInitials`). */
  public static func initials(_ name: String) -> String {
    let words = name.split(whereSeparator: \.isWhitespace).map(String.init).filter { !$0.isEmpty && !["airline", "airlines", "airways", "air"].contains($0.lowercased()) }
    if words.count > 1 { return (String(words[0].prefix(1)) + String(words[1].prefix(1))).uppercased() }
    return String((words.first ?? "?").prefix(2)).uppercased()
  }
}

/** Agents talking to each other, folded (the window's `JIn`/`WPn`): one message, a fan-out, or a thread. */
public enum Exchange: Hashable, Sendable {
  case single(inbound: Bool, peer: Party)
  case fanout(peers: [Party])
  case thread(count: Int, peers: [Party])

  /** The words before the agents' chip: "Message from", "Messaged", "4 messages with". */
  public var label: String {
    switch self {
    case .single(let inbound, _): return inbound ? "Message from" : "Messaged"
    case .fanout: return "Messaged"
    case .thread(let count, _): return "\(count) messages with"
    }
  }

  public var peers: [Party] {
    switch self {
    case .single(_, let peer): return [peer]
    case .fanout(let peers), .thread(_, let peers): return peers
    }
  }
}

/** A routine named in a "Created routine" line. */
public struct RoutineRef: Hashable, Sendable {
  public let id: String
  public let name: String
}

/** The cards that wait on the person: an auto-review approval, a secret, or the computer handed over. */
public enum RequestCard: Hashable, Sendable {
  /** `auto-review-approval`: Allow once, Always allow, Deny (`resolveAutoReviewApproval`). */
  case approval(requestId: String, summary: String, reason: String, command: String, status: String)
  /** `secret-request`: a password field and Save securely (`submitSecret`). */
  case secret(label: String, description: String, provided: Bool)
  /** A message with `boxRequestId`: "Your turn on the computer" (`handBackForeverBox`). */
  case computer(requestId: String, instruction: String, resolution: String?)
}

/** The call a chat line stands for: how long, and what was said. */
public struct CallLine: Hashable, Sendable {
  public let fromPerson: Bool
  public let text: String

  public init(fromPerson: Bool, text: String) { self.fromPerson = fromPerson; self.text = text }
}

/**
 * One row of a chat as the phone draws it, in the window's own order and
 * folding (`npt`, `WIn`): a time stamp after a quarter of an hour, the
 * "New" line before the first unread message, the person's bubbles on the
 * right, an agent's on the left, and every card the Mac draws.
 */
public enum ChatRow: Identifiable, Hashable, Sendable {
  case stamp(id: String, date: Date)
  case unread(id: String)
  case bubble(Bubble)
  case flights(id: String, card: FlightsCard)
  case file(id: String, name: String, url: String, fromPerson: Bool)
  case question(id: String, card: QuestionCard)
  case draft(id: String, card: DraftCard)
  case connectors(id: String, names: [String], connected: Bool, reason: String?)
  /** "Connect Slack so this routine can fire" (`listener-connect`): Slack or GitHub, for routines that wake on them. */
  case listenerConnect(id: String, platform: String, reason: String?)
  case request(id: String, card: RequestCard)
  case teammates(id: String, exchange: Exchange, entries: [Entry])
  case voiceCall(id: String, seconds: Int, lines: [CallLine])
  case routines(id: String, action: String, routines: [RoutineRef])
  /** A card this version cannot draw: said so, as the Mac does. */
  case notice(id: String, text: String)
  /** Under a message of yours that did not reach the agent: "Failed to send", Resend, Delete (the Mac's `sand-failed-send-actions`). */
  case failedSend(id: String, nonce: String)

  public var id: String {
    switch self {
    case .stamp(let id, _), .unread(let id), .flights(let id, _), .file(let id, _, _, _), .question(let id, _), .draft(let id, _),
         .connectors(let id, _, _, _), .listenerConnect(let id, _, _), .request(let id, _), .teammates(let id, _, _), .voiceCall(let id, _, _), .routines(let id, _, _),
         .notice(let id, _), .failedSend(let id, _): return id
    case .bubble(let bubble): return bubble.id
    }
  }

  /** The row's kind in a word, for the hang watch ("bubble", "flights", "table"…). */
  public var kind: String {
    switch self {
    case .stamp: return "stamp"
    case .unread: return "new-line"
    case .bubble(let bubble): return bubble.fromPerson ? "yours" : "bubble"
    case .flights: return "flights"
    case .file: return "file"
    case .question: return "question"
    case .draft: return "draft"
    case .connectors: return "connectors"
    case .listenerConnect: return "listener"
    case .request: return "request"
    case .teammates: return "teammates"
    case .voiceCall: return "call"
    case .routines: return "routines"
    case .notice: return "notice"
    case .failedSend: return "failed"
    }
  }

  /** How much text the row carries (bytes): the hang watch names the longest. */
  public var size: Int {
    switch self {
    case .bubble(let bubble): return bubble.text.utf8.count
    case .draft(_, let card): return card.body.utf8.count
    case .notice(_, let text): return text.utf8.count
    default: return 0
    }
  }

  /** Whose side the row sits on, for spacing runs: the person, an agent, or the middle. */
  public var side: Side {
    switch self {
    case .bubble(let bubble): return bubble.fromPerson ? .person : .agent(bubble.author?.id)
    case .file(_, _, _, let fromPerson): return fromPerson ? .person : .agent(nil)
    case .failedSend: return .person
    case .flights, .question, .draft, .connectors, .listenerConnect, .request, .notice: return .agent(nil)
    default: return .middle
    }
  }

  public enum Side: Hashable, Sendable { case person, agent(String?), middle }
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
  /** The message this one answers (`replyTo`), and its line as the window quotes it above the bubble. */
  public let replyTo: String?
  public let quote: String?
  /** Milliseconds since the epoch: the time a sideways swipe shows. */
  public let timestampMs: Double?

  public init(id: String, text: String, fromPerson: Bool, author: Party?, showsName: Bool, showsAvatar: Bool, reactions: [String], isStreaming: Bool, replyTo: String? = nil, quote: String? = nil, timestampMs: Double? = nil) {
    self.id = id; self.text = text; self.fromPerson = fromPerson; self.author = author
    self.showsName = showsName; self.showsAvatar = showsAvatar; self.reactions = reactions; self.isStreaming = isStreaming
    self.replyTo = replyTo; self.quote = quote; self.timestampMs = timestampMs
  }

  func with(showsName: Bool? = nil, showsAvatar: Bool? = nil, author: Party?? = nil, quote: String?? = nil) -> Bubble {
    Bubble(id: id, text: text, fromPerson: fromPerson, author: author ?? self.author, showsName: showsName ?? self.showsName, showsAvatar: showsAvatar ?? self.showsAvatar, reactions: reactions, isStreaming: isStreaming, replyTo: replyTo, quote: quote ?? self.quote, timestampMs: timestampMs)
  }

  /** Only emoji, three at most: drawn large with no bubble, as Messages does. */
  public var isLoneEmoji: Bool {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty, trimmed.count <= 3 else { return false }
    return trimmed.allSatisfy { ch in ch.unicodeScalars.contains { $0.properties.isEmojiPresentation } || (ch.unicodeScalars.count > 1 && ch.unicodeScalars.first!.properties.isEmoji) }
  }
}

public enum Chat {
  /**
   * A long text cut for drawing (the Mac folds a message past 664 pt behind
   * "Show more"): at most `limit` characters, at the last line break in its
   * final fifth when there is one; whether anything was left out.
   */
  public static func clipped(_ text: String, limit: Int) -> (text: String, clipped: Bool) {
    guard text.utf8.count > limit, text.count > limit else { return (text, false) }
    let end = text.index(text.startIndex, offsetBy: limit)
    let head = text[..<end]
    if let lineBreak = head.lastIndex(of: "\n"), text.distance(from: text.startIndex, to: lineBreak) > limit * 4 / 5 {
      return (String(text[..<lineBreak]), true)
    }
    return (String(head) + "…", true)
  }

  /** A code block as drawn: at most `lines` lines, each at most `width` characters (a code block does not wrap, so one long line is laid out whole). */
  public static func clippedCode(_ text: String, lines: Int, width: Int) -> (text: String, clipped: Bool) {
    var clipped = false
    var out: [Substring] = []
    for line in text.split(separator: "\n", omittingEmptySubsequences: false) {
      if out.count == lines { clipped = true; break }
      if line.count > width { out.append(line.prefix(width) + "…"); clipped = true } else { out.append(line) }
    }
    return (out.joined(separator: "\n"), clipped)
  }

  /** A new stamp after a quarter of an hour without a line, or on a new day (the window's `zIn`, `OIn = 900 s`). */
  public static let stampGap: TimeInterval = 15 * 60
  public static let notShown = "This message can't be shown in this version of Simeon."

  /**
   * The chat's rows. `unreadAfter` (milliseconds) puts the "New" line before
   * the first agent's line written after it, as the window's
   * `unreadBoundaryAt` does.
   */
  public static func rows(_ entries: [Entry], isGroup: Bool = false, unreadAfter: Double? = nil) -> [ChatRow] {
    var rows: [ChatRow] = []
    var lastShown: Date?
    var index = 0
    var dividerPlaced = unreadAfter == nil

    func stamp(before entry: Entry) {
      if !dividerPlaced, let after = unreadAfter, !entry.isFromPerson, let at = entry.timestampMs, at > after {
        rows.append(.unread(id: "unread-divider"))
        dividerPlaced = true
      }
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
          rows.append(.teammates(id: entry.id, exchange: exchange(run), entries: run))
        }
        index = next
        continue
      }
      // Routines changed one after another fold into one line (`WIn`, `_In`).
      if entry.kind == "event", entry.event?["type"]?.string == "automation-changed" {
        var run: [Entry] = [entry]
        var next = index + 1
        while next < entries.count, entries[next].kind == "event", entries[next].event?["type"]?.string == "automation-changed" { run.append(entries[next]); next += 1 }
        stamp(before: entry)
        for (n, outcome) in routineOutcomes(run).enumerated() {
          rows.append(.routines(id: n == 0 ? entry.id : "\(entry.id)-\(outcome.action)", action: outcome.action, routines: outcome.routines))
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
    rows = quoted(rows, entries)
    rows = unique(rows)
    return isGroup ? markRuns(rows) : rows
  }

  /** Each row once: the screen keys rows by id, and two with one id in a lazy list can stall its layout. A repeated line is the same line twice. */
  static func unique(_ rows: [ChatRow]) -> [ChatRow] {
    var seen = Set<String>()
    seen.reserveCapacity(rows.count)
    guard rows.contains(where: { !seen.insert($0.id).inserted }) else { return rows }
    seen.removeAll(keepingCapacity: true)
    return rows.filter { seen.insert($0.id).inserted }
  }

  /** A reply's quote over its bubble (`pCn`): the answered line, one line, cut at 96 characters; "(deleted)" when it is gone. */
  static func quoted(_ rows: [ChatRow], _ entries: [Entry]) -> [ChatRow] {
    guard rows.contains(where: { if case .bubble(let b) = $0 { return b.replyTo != nil }; return false }) else { return rows }
    let byId = Dictionary(entries.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
    return rows.map { row in
      guard case .bubble(let bubble) = row, let target = bubble.replyTo else { return row }
      return .bubble(bubble.with(quote: .some(quoteLine(byId[target], limit: 96))))
    }
  }

  /** The line a reply quotes: a message's words with the spaces run together, "Photo" for a picture, a file's name; cut at `limit` with "…". */
  public static func quoteLine(_ entry: Entry?, limit: Int) -> String {
    guard let entry else { return "(deleted)" }
    var text: String
    if let content = entry.content { text = content }
    else if let content = entry.message?["content"]?.text { text = content }
    else if let path = entry["file_path"]?.text ?? entry["filePath"]?.text ?? entry.message?["url"]?.text {
      let name = fileName(ofURL: path)
      text = ["png", "jpg", "jpeg", "gif", "webp", "heic"].contains((name as NSString).pathExtension.lowercased()) ? "Photo" : name
    } else { text = "Message" }
    text = text.split(whereSeparator: \.isWhitespace).joined(separator: " ")
    return text.count > limit ? String(text.prefix(limit)) + "…" : text
  }

  /** The window's `JIn`: one message is "Messaged" or "Message from"; only outgoing to several is a fan-out; else a thread. */
  static func exchange(_ run: [Entry]) -> Exchange {
    var peers: [Party] = []
    for party in run.compactMap(\.teammate) where !peers.contains(where: { $0.id == party.id }) { peers.append(party) }
    if run.count == 1, let peer = peers.first { return .single(inbound: run[0].fromAgent != nil, peer: peer) }
    if run.allSatisfy({ $0.toAgent != nil }) && peers.count >= 2 { return .fanout(peers: peers) }
    return .thread(count: run.count, peers: peers)
  }

  /** The window's `_In`: per routine its last action ("deleted" wins, a creation stays a creation), grouped by action in first-seen order. */
  static func routineOutcomes(_ run: [Entry]) -> [(action: String, routines: [RoutineRef])] {
    var order: [String] = []
    var state: [String: (name: String, created: Bool, last: String)] = [:]
    for entry in run {
      guard let event = entry.event, let id = event["automationId"]?.text ?? event["automationName"]?.text else { continue }
      let action = event["action"]?.string ?? "updated"
      let name = event["automationName"]?.string ?? ""
      if let known = state[id] { state[id] = (name, known.created || action == "created", action) }
      else { order.append(id); state[id] = (name, action == "created", action) }
    }
    var out: [(action: String, routines: [RoutineRef])] = []
    for id in order {
      guard let s = state[id] else { continue }
      let action = s.last == "deleted" ? "deleted" : s.created ? "created" : s.last
      let ref = RoutineRef(id: id, name: s.name)
      if let i = out.firstIndex(where: { $0.action == action }) { out[i].routines.append(ref) } else { out.append((action, [ref])) }
    }
    return out
  }

  /** "Created", "Updated", "Enabled", "Disabled", "Deleted", else "Changed" (`Y5e`). */
  public static func routineVerb(_ action: String) -> String {
    ["created": "Created", "updated": "Updated", "enabled": "Enabled", "disabled": "Disabled", "deleted": "Deleted"][action] ?? "Changed"
  }

  static func row(for entry: Entry) -> ChatRow? {
    let reactions = entry.reactions.map(\.emoji)
    switch entry.kind {
    case "message", "user-message", "human-message":
      guard let text = entry.content, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
      let fromPerson = entry.isFromPerson || entry.role == "user"
      if !fromPerson, let flights = FlightsCard.parse(text) { return .flights(id: entry.id, card: flights) }
      return .bubble(Bubble(id: entry.id, text: text, fromPerson: fromPerson, author: fromPerson ? nil : entry.author, showsName: false, showsAvatar: false, reactions: reactions, isStreaming: entry.isStreaming, replyTo: entry["replyTo"]?.text, timestampMs: entry.timestampMs))
    case "user-attachment":
      let name = entry["file_name"]?.text ?? entry["fileName"]?.text ?? entry["file_path"]?.text.map(fileName(ofURL:)) ?? entry["filePath"]?.text.map(fileName(ofURL:)) ?? "Attachment"
      return .file(id: entry.id, name: name, url: entry["file_path"]?.string ?? entry["filePath"]?.string ?? "", fromPerson: true)
    case "send-message":
      guard let message = entry.message else { return nil }
      if let requestId = entry["boxRequestId"]?.text {
        return .request(id: entry.id, card: .computer(requestId: requestId, instruction: message["content"]?.string ?? "", resolution: entry["boxResolution"]?.text))
      }
      switch message["type"]?.string {
      case "text":
        guard let text = message["content"]?.string, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
        if let flights = FlightsCard.parse(text) { return .flights(id: entry.id, card: flights) }
        return .bubble(Bubble(id: entry.id, text: text, fromPerson: false, author: entry.author, showsName: false, showsAvatar: false, reactions: reactions, isStreaming: entry["streaming"]?.bool ?? false, replyTo: entry["replyTo"]?.text, timestampMs: entry.timestampMs))
      case "attachment":
        guard let url = message["url"]?.text else { return nil }
        return .file(id: entry.id, name: fileName(ofURL: url), url: url, fromPerson: false)
      case "widget":
        guard let widget = message["widget"], let prompt = widget["prompt"]?.text else { return nil }
        let options = (widget["options"]?.array ?? []).compactMap { option -> QuestionOption? in
          guard let label = option["label"]?.text ?? option.text else { return nil }
          return QuestionOption(label: label, description: option["description"]?.text)
        }
        return .question(id: entry.id, card: QuestionCard(
          prompt: prompt, help: widget["helpText"]?.text, options: options,
          allowsOwnAnswer: widget["allowCustom"]?.bool ?? false,
          answer: entry["respondedValue"]?.text, isDismissed: entry["widgetDismissed"]?.bool ?? false,
          isSkipped: entry["widgetSkipped"]?.bool ?? false))
      case "email-draft", "slack-draft":
        return DraftCard(message: message, entry: entry).map { .draft(id: entry.id, card: $0) }
      case "connectors":
        let names = message["connectors"]?.array?.compactMap(\.text) ?? []
        return names.isEmpty ? nil : .connectors(id: entry.id, names: names, connected: false, reason: nil)
      case "connector":
        guard let name = message["connector"]?.text else { return nil }
        return .connectors(id: entry.id, names: [name], connected: message["variant"]?.string == "connected", reason: message["reason"]?.text)
      case "listener-connect":
        guard let platform = message["platform"]?.text, platform == "slack" || platform == "github" else { return nil }
        return .listenerConnect(id: entry.id, platform: platform, reason: message["reason"]?.text)
      case "auto-review-approval":
        guard let approval = message["approval"] else { return nil }
        return .request(id: entry.id, card: .approval(requestId: approval["requestId"]?.string ?? "", summary: approval["summary"]?.string ?? "", reason: approval["reason"]?.string ?? "", command: approval["command"]?.string ?? "", status: approval["status"]?.string ?? "pending"))
      case "secret-request":
        guard let secret = message["secretRequest"] else { return nil }
        return .request(id: entry.id, card: .secret(label: secret["label"]?.string ?? "A secret", description: secret["description"]?.string ?? "", provided: entry["secretProvided"]?.bool ?? false))
      case "local-tool-permission", "permission-request":
        // The Mac's own computer asks these; the phone has no part in them.
        return nil
      default:
        if let text = message["content"]?.text {
          return .bubble(Bubble(id: entry.id, text: text, fromPerson: false, author: entry.author, showsName: false, showsAvatar: false, reactions: reactions, isStreaming: false, replyTo: entry["replyTo"]?.text, timestampMs: entry.timestampMs))
        }
        return .notice(id: entry.id, text: notShown)
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
      case "name-changed":
        return event["to"]?.text.map { .notice(id: entry.id, text: "Renamed to \($0)") }
      case "channel-connected":
        return event["label"]?.text.map { .notice(id: entry.id, text: "Connected to \($0)") }
      case "channel-disconnected":
        return event["label"]?.text.map { .notice(id: entry.id, text: "Disconnected from \($0)") }
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
      out[i] = .bubble(bubble.with(showsName: !sameAuthor(previous), showsAvatar: !sameAuthor(next)))
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

  /** A message's own time, shown when the chat is pulled sideways ("10:15 AM"). */
  public static func clockText(_ date: Date, calendar: Calendar = .current, locale: Locale = .current) -> String {
    formatter("jmm", calendar: calendar, locale: locale).string(from: date)
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
