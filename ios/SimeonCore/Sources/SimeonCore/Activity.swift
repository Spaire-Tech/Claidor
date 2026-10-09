import Foundation

/**
 * What an agent is doing right now, in words, as the Mac's chat writes it
 * beside the working butterfly (the window's `dse`, from the roster's
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
    if kind == "thinking" { return ActivityLine("thinking", "Thinking", "thinking-medium") }
    guard let tool, !tool.isEmpty else { return ActivityLine("working", "Working", "wrench") }
    let named = detail?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false ? detail!.trimmingCharacters(in: .whitespacesAndNewlines) : nil
    switch tool {
    case "WebSearch": return ActivityLine("searching", "Searching the web", "magnifying-glass")
    case "WebFetch": return ActivityLine("browsing", "Reading the web", "globe")
    case "Read", "ExternalRead", "BoxRead": return ActivityLine("reading", "Reading file", "book-open")
    case "ExternalShell": return named != nil ? ActivityLine("writing", "Drafting the file", "pencil") : ActivityLine("on-your-computer", "On your computer", "laptop")
    case "Shell", "BoxShell": return named != nil ? ActivityLine("writing", "Drafting the file", "pencil") : ActivityLine("running-commands", "Running commands", "terminal")
    case "CopyToBox", "CopyFromBox": return ActivityLine("on-your-computer", "Organizing files", "laptop")
    case "Await", "AwaitShell", "AwaitExternalShell": return ActivityLine("waiting", "Waiting on a command", "hourglass")
    case "GenerateImage": return ActivityLine("generating", "Generating a photo", "image")
    case "CloudAgent": return ActivityLine("coding", "Coding", "cursor-logo")
    case "Task": return ActivityLine("waiting", "Waiting on another agent", "hourglass")
    case "Screenshot", "Computer", "request_box_help": return ActivityLine("on-its-computer", "On its computer", "device-desktop")
    case "SendToAgent", "UpdateAgent":
      let name = targetName?.trimmingCharacters(in: .whitespacesAndNewlines)
      let text = name?.isEmpty == false ? "Messaging \(name!)" : "Messaging another assistant"
      if let target, !target.isEmpty { return ActivityLine(verb: "messaging", text: text, icon: .agent(target)) }
      return ActivityLine("messaging", text, "person-chat-bubble")
    case "CreateAgent", "ReactToMessage": return ActivityLine("messaging", "Messaging", "person-chat-bubble")
    default:
      if tool == "CallMcpTool" || MarkState.connecting.contains(tool) {
        guard let named else { return ActivityLine("connecting", "Connecting to a third party app", "plug") }
        return ActivityLine(verb: "connecting", text: "Connecting to \(named.prefix(1).uppercased() + named.dropFirst())", icon: .connector(named))
      }
      if MarkState.subagentWaits.contains(tool) { return ActivityLine("waiting", "Waiting on another agent", "hourglass") }
      if tool.hasPrefix("browser_") { return ActivityLine("browsing", "Browsing the web", "globe") }
      return ActivityLine("working", "Working", "wrench")
    }
  }

  /** The time it has been at it, once past a minute (" · 3m", " · 1h", " · 1h 5m"), as the window adds it. */
  public static func elapsed(_ seconds: Double) -> String? {
    guard seconds >= 60 else { return nil }
    let minutes = max(1, Int(seconds / 60))
    if minutes < 60 { return "\(minutes)m" }
    let hours = minutes / 60, rest = minutes % 60
    return rest == 0 ? "\(hours)h" : "\(hours)h \(rest)m"
  }
}

extension Agent {
  /** The words beside its working butterfly in the chat: "Typing…" while it writes, else what it is doing (`dse`); nil when it is not at work. */
  public func activityLine(named: (String) -> String? = { _ in nil }) -> ActivityLine? {
    if isComposing { return ActivityLine("typing", "Typing…", "thinking-medium") }
    guard (isRunning || isRunningTurn) && !awaitingUserResponse else { return nil }
    return ActivityLine.of(kind: activityKind, tool: activityTool, detail: activityDetail, target: activityTarget, targetName: activityTarget.flatMap(named))
  }
}
