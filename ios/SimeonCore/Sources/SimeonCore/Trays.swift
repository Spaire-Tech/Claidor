import Foundation

/**
 * A notice the computer keeps for the window (`ErrorTray`, the box's
 * `trays-service.ts`): "Agent failed to respond", "Message not delivered",
 * "Routines paused while you were away". The window draws an open agent's
 * over its composer (`pzn`, `yzn`).
 */
public struct Tray: Identifiable, Hashable, Sendable {
  /** A button on it (`kzn`): only these two kinds; the box's `switch-model` is dropped, as the window drops it. */
  public enum Action: Hashable, Sendable {
    case openURL(label: String, url: String)
    case dashboard(label: String, action: String, args: [String: String], successMessage: String?)

    public var label: String {
      switch self {
      case .openURL(let label, _), .dashboard(let label, _, _, _): return label
      }
    }

    init?(_ json: JSON) {
      let label = json["label"]?.string ?? ""
      switch json["kind"]?.string {
      case "open-url":
        guard let url = json["url"]?.string else { return nil }
        self = .openURL(label: label, url: url)
      case "dashboard-action":
        guard let action = json["action"]?.string else { return nil }
        var args: [String: String] = [:]
        for (key, value) in json["args"]?.object ?? [:] { if let text = value.string { args[key] = text } }
        self = .dashboard(label: label, action: action, args: args, successMessage: json["successMessage"]?.string)
      default:
        return nil
      }
    }
  }

  public let id: String
  /** `error` is the only kind drawn (`gzn`). */
  public let kind: String
  /** The agent it is about: only an open agent's show, and one with none never does. */
  public let agentId: String?
  public let title: String
  public let detail: String
  public let requestId: String?
  public let errorKind: String?
  /** How many times it happened (the box counts repeats of one `dedupeKey`): "×3" past one. */
  public let count: Int?
  public let actions: [Action]

  public init?(_ json: JSON) {
    guard let id = json["id"]?.text else { return nil }
    self.id = id
    kind = json["kind"]?.string ?? ""
    agentId = json["agentId"]?.string
    title = json["title"]?.string ?? ""
    detail = json["detail"]?.string ?? ""
    requestId = json["requestId"]?.string
    errorKind = json["errorKind"]?.string
    count = json["count"]?.int
    actions = (json["actions"]?.array ?? []).compactMap(Action.init)
  }

  /** "×3", with "Occurred 3 times" to VoiceOver, when it happened more than once. */
  public var countLabel: String? { (count ?? 0) > 1 ? "×\(count!)" : nil }

  /** The request id to copy, when there is one. */
  public var copyableRequestId: String? { requestId.flatMap { $0.isEmpty ? nil : $0 } }
}

/**
 * The trays as the window keeps them (`hVn`, `EKe`): read with `getTrays`
 * when the computer is reached and again after a reconnect; the `tray`
 * events (snapshot, pushed, dismissed, cleared) applied as they come, and
 * those that arrive during a read applied again over its answer.
 */
public struct TrayList: Equatable, Sendable {
  public private(set) var trays: [Tray] = []
  /** A read or a snapshot has come: until then a change has nothing to apply to (the window's `t == null`). */
  private var loaded = false
  /** A read is on its way: the events since it started, to apply over its answer. */
  private var buffered: [JSON]?
  private var readSeq = 0

  public init() {}

  /** One `tray` event's change (`EKe`). */
  public static func applying(_ event: JSON, to trays: [Tray]) -> [Tray] {
    switch event["type"]?.string {
    case "snapshot":
      return (event["trays"]?.array ?? []).compactMap(Tray.init)
    case "pushed":
      guard let tray = event["tray"].flatMap(Tray.init) else { return trays }
      var next = trays
      if let index = next.firstIndex(where: { $0.id == tray.id }) { next[index] = tray } else { next.append(tray) }
      return next
    case "dismissed":
      guard let id = event["id"]?.text else { return trays }
      return trays.filter { $0.id != id }
    case "cleared":
      return []
    default:
      return trays
    }
  }

  public mutating func take(_ event: JSON) {
    buffered?.append(event)
    guard loaded || event["type"]?.string == "snapshot" else { return }
    loaded = true
    trays = Self.applying(event, to: trays)
  }

  /** A read begins: its number, to match its answer. A read already on its way is forgotten (`noteReconnect`). */
  public mutating func beginRead() -> Int {
    readSeq += 1
    buffered = []
    return readSeq
  }

  /** The answer to read `seq`, with the events since it began applied over it; a stale answer is dropped. */
  public mutating func finishRead(_ seq: Int, answer: JSON?) {
    guard seq == readSeq, let events = buffered else { return }
    buffered = nil
    // A failed read keeps what was shown.
    guard let rows = answer?.array else { return }
    var next = rows.compactMap(Tray.init)
    for event in events { next = Self.applying(event, to: next) }
    trays = next
    loaded = true
  }

  /** What an open agent's composer shows: its own error trays, in the box's order. */
  public func shown(for agentId: String?) -> [Tray] {
    guard let agentId else { return [] }
    return trays.filter { $0.kind == "error" && $0.agentId == agentId }
  }

  public mutating func remove(_ id: String) { trays.removeAll { $0.id == id } }
  public mutating func removeAll() { trays = [] }
}

/**
 * A file card's line under its name (`xvn`, from `readAttachmentText`):
 * its size as the window writes it (`Eft`), "Couldn't read file" when the
 * computer has none, nothing while it is read.
 */
public enum FileLine {
  public static let missing = "Couldn't read file"

  /** "512 B", "1.3 KB" under 10 KB, "42 KB", "3.4 MB". */
  public static func size(_ bytes: Int) -> String {
    if bytes < 1024 { return "\(bytes) B" }
    if bytes < 1024 * 1024 { return "\(fixed(Double(bytes) / 1024, digits: bytes < 10 * 1024 ? 1 : 0)) KB" }
    return "\(fixed(Double(bytes) / (1024 * 1024), digits: 1)) MB"
  }

  /** `toFixed`: a tie goes up, as JavaScript rounds. */
  static func fixed(_ value: Double, digits: Int) -> String {
    let scale = digits == 0 ? 1.0 : 10.0
    let rounded = (value * scale).rounded(.toNearestOrAwayFromZero) / scale
    return String(format: "%.\(digits)f", rounded)
  }

  /** The line for the box's answer: null is no file; text or binary carry the size. */
  public static func line(_ answer: JSON) -> String {
    guard answer.object != nil, let bytes = answer["bytes"]?.int else { return missing }
    return size(bytes)
  }
}
