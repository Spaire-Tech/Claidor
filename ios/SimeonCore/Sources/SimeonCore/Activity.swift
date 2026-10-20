import Foundation

/**
 * What an agent is doing right now, in words, as the Mac's chat writes it
 * beside the working picture (the window's `dse`, from the roster's
 * `currentActivity`): "Thinking", "Searching the web", "Running commands",
 * "Messaging Iris", "Connecting to Linear"… with a small picture of it.
 */
public struct ActivityLine: Sendable, Equatable {
  public enum Icon: Sendable, Equatable {
    /** One of the window's glyphs, by its name there ("terminal", "globe"…). */
    case glyph(String)
    /** A connected app's logo (`Connectors/<slug>`). */
    case connector(String)
    /** The agent being messaged. */
    case agent(String)
  }

  public let verb: String
  public let text: String
  public let icon: Icon

  /** The label is drawn again (and comes in again) only when this changes (`kbe`: the verb and the picture, not the words). */
  public var key: String {
    switch icon {
    case .glyph(let name): return "\(verb):glyph:\(name)"
    case .connector(let service): return "\(verb):connector:\(service)"
    case .agent(let id): return "\(verb):agent:\(id)"
    }
  }

  init(_ verb: String, _ text: String, _ glyph: String) {
    self.verb = verb; self.text = ActivityLine.cut(text); self.icon = .glyph(glyph)
  }

  init(verb: String, text: String, icon: Icon) {
    self.verb = verb; self.text = ActivityLine.cut(text); self.icon = icon
  }

  /** At most 60 characters, the spaces run together (`XCe`). */
  static func cut(_ text: String) -> String {
    let flat = text.split(whereSeparator: \.isWhitespace).joined(separator: " ")
    guard flat.count > 60 else { return flat }
    var head = String(flat.prefix(59))
    while head.last?.isWhitespace == true { head.removeLast() }
    return head + "…"
  }

  /** The window's table (`dse`), for `{kind: "thinking"}` or `{kind: "tool", tool, detail, target}`. */
  public static func of(kind: String?, tool: String?, detail: String?, target: String? = nil, targetName: String? = nil) -> ActivityLine {
    if kind == "thinking" { return ActivityLine("thinking", L10n.text("Thinking"), "thinking-medium") }
    guard let tool, !tool.isEmpty else { return ActivityLine("working", L10n.text("Working"), "wrench") }
    let named = detail?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false ? detail!.trimmingCharacters(in: .whitespacesAndNewlines) : nil
    switch tool {
    case "WebSearch": return ActivityLine("searching", L10n.text("Searching the web"), "magnifying-glass")
    case "WebFetch": return ActivityLine("browsing", L10n.text("Reading the web"), "globe")
    case "Read", "ExternalRead", "BoxRead": return ActivityLine("reading", L10n.text("Reading file"), "book-open")
    case "ExternalShell": return named != nil ? ActivityLine("writing", L10n.text("Drafting the file"), "pencil") : ActivityLine("on-your-computer", L10n.text("On your computer"), "laptop")
    case "Shell", "BoxShell": return named != nil ? ActivityLine("writing", L10n.text("Drafting the file"), "pencil") : ActivityLine("running-commands", L10n.text("Running commands"), "terminal")
    case "CopyToBox", "CopyFromBox": return ActivityLine("on-your-computer", L10n.text("Organizing files"), "laptop")
    case "Await", "AwaitShell", "AwaitExternalShell": return ActivityLine("waiting", L10n.text("Waiting on a command"), "hourglass")
    case "GenerateImage": return ActivityLine("generating", L10n.text("Generating a photo"), "image")
    case "CloudAgent": return ActivityLine("coding", L10n.text("Coding"), "cursor-logo")
    case "Task": return ActivityLine("waiting", L10n.text("Waiting on another agent"), "hourglass")
    case "Screenshot", "Computer", "request_box_help": return ActivityLine("on-its-computer", L10n.text("On its computer"), "device-desktop")
    case "SendToAgent", "UpdateAgent":
      let name = targetName?.trimmingCharacters(in: .whitespacesAndNewlines)
      let text = name?.isEmpty == false ? L10n.text("Messaging \(name!)") : L10n.text("Messaging another assistant")
      if let target, !target.isEmpty { return ActivityLine(verb: "messaging", text: text, icon: .agent(target)) }
      return ActivityLine("messaging", text, "person-chat-bubble")
    case "CreateAgent", "ReactToMessage": return ActivityLine("messaging", L10n.text("Messaging"), "person-chat-bubble")
    default:
      if tool == "CallMcpTool" || ActivityLine.connecting.contains(tool) {
        guard let named else { return ActivityLine("connecting", L10n.text("Connecting to a third party app"), "plug") }
        let app = named.prefix(1).uppercased() + named.dropFirst()
        return ActivityLine(verb: "connecting", text: L10n.text("Connecting to \(app)"), icon: .connector(named))
      }
      if ActivityLine.subagentWaits.contains(tool) { return ActivityLine("waiting", L10n.text("Waiting on another agent"), "hourglass") }
      if tool.hasPrefix("browser_") { return ActivityLine("browsing", L10n.text("Browsing the web"), "globe") }
      return ActivityLine("working", L10n.text("Working"), "wrench")
    }
  }

  /** The time it has been at it, once past a minute (" · 3m", " · 1h", " · 1h 5m"), as the window adds it. */
  public static func elapsed(_ seconds: Double) -> String? {
    guard seconds >= 60 else { return nil }
    let minutes = max(1, Int(seconds / 60))
    if minutes < 60 { return L10n.text("\(minutes)m") }
    let hours = minutes / 60, rest = minutes % 60
    return rest == 0 ? L10n.text("\(hours)h") : L10n.text("\(hours)h \(rest)m")
  }
}

extension Agent {
  /**
   * The words beside its working picture in the chat: "Typing…" while it
   * writes, else what it is doing (`dse`), or "Iris is working" before it
   * says what (`gJn`); nil when it is not at work.
   */
  public func activityLine(named: (String) -> String? = { _ in nil }) -> ActivityLine? {
    if isComposing { return ActivityLine("typing", L10n.text("Typing…"), "thinking-medium") }
    guard (isRunning || isRunningTurn) && !awaitingUserResponse else { return nil }
    guard activityKind != nil else {
      let who = name.trimmingCharacters(in: .whitespacesAndNewlines)
      return ActivityLine(verb: "working", text: who.isEmpty ? L10n.text("Working…") : L10n.text("\(who) is working"), icon: .glyph("working"))
    }
    return ActivityLine.of(kind: activityKind, tool: activityTool, detail: activityDetail, target: activityTarget, targetName: activityTarget.flatMap(named))
  }
}

/**
 * What the working line shows while the agent works (the window's `EJn`):
 * a new activity takes the place of the one shown only once that one has
 * had 0.8 s (`Apt`), so quick steps do not flicker; the same words swap in
 * place; and once one activity has shown for a minute, its time joins it
 * (" · 3m", `eJn`).
 */
public struct ActivityHold: Sendable, Equatable {
  public private(set) var shown: ActivityLine?
  /** Seconds. */
  public private(set) var shownAt: Double
  /** A newer line waiting for the shown one's 0.8 s. */
  public private(set) var queued: ActivityLine?

  public static let hold = 0.8

  public init(_ line: ActivityLine?, at now: Double) {
    shown = line; shownAt = now
  }

  private static func same(_ a: ActivityLine?, _ b: ActivityLine?) -> Bool {
    guard let a, let b else { return a == nil && b == nil }
    return a.key == b.key && a.text == b.text
  }

  /** The line the agent's activity gives now (`XMn`). */
  public mutating func want(_ line: ActivityLine?, at now: Double) {
    if ActivityHold.same(shown, line) {
      shown = line; queued = nil
    } else if shown == nil || now - shownAt >= ActivityHold.hold {
      shown = line; shownAt = now; queued = nil
    } else {
      queued = line
    }
  }

  /** When the waiting line may take over (`QMn`). */
  public var due: Double? { queued == nil ? nil : shownAt + ActivityHold.hold }

  /** The time on the shown line, once it has shown a minute. */
  public func elapsed(at now: Double) -> String? {
    guard shown != nil else { return nil }
    return ActivityLine.elapsed(now - shownAt)
  }

  /** The next whole minute on the shown line, when its time changes (`tJn`). */
  public func nextMinute(after now: Double) -> Double? {
    guard shown != nil else { return nil }
    let minutes = max(1, ((now - shownAt) / 60).rounded(.down) + 1)
    return shownAt + minutes * 60
  }
}

extension ActivityLine {
  /** Tools the window shows as connecting to an app (`Jon`). */
  static let connecting: Set<String> = ["GetMcpTools", "McpAuth", "SearchPlugins", "GetPlugin", "InstallPlugin", "UninstallPlugin", "GetMcpServerStatus", "AddMcpServer", "UninstallMcpServer", "AuthenticateMcpServer", "RestartMcpServers", "SetMcpInstructions", "SearchMcpServers", "InstallMcpServer", "EnableTeamServer"]
  /** Tools the window shows as "Waiting on another agent" (`Qon`). */
  static let subagentWaits: Set<String> = ["CheckSubagent", "MessageSubagent", "StopSubagent"]
}
