import Foundation

/**
 * The auto-review card as the shipped window draws it (the chunk
 * `view-QqBtBG74.js`): its title by what the agent wants to do, where it
 * runs, the summary only when it says more than the command, the reason
 * while it waits, the command folded under "Show the command", the badge
 * once answered, and Always allow adding the proposed rule to Auto-review.
 */
public enum AutoReviewCard {
  /** "Show the command" or "Show the details" (`se`'s subject). */
  public enum Subject: String, Sendable { case command, details }

  /** The title by surface (`ee`, `te` for any other). */
  public static func title(surface: String?) -> (title: String, subject: Subject) {
    switch surface {
    case "host_shell", "box_shell": ("The agent wants to run a command", .command)
    case "mcp": ("The agent wants to use a connected service", .details)
    case "subagent": ("The agent wants to run a task", .details)
    default: ("Auto-review Paused This Action", .details)
    }
  }

  /** Where it runs (`J`). */
  public static func location(surface: String?) -> String? {
    switch surface {
    case "host_shell": "Runs on your local computer"
    case "box_shell", "computer": "Runs on Simeon's computer"
    default: nil
    }
  }

  public enum BadgeKind: String, Sendable { case success, danger, muted }

  /** The answered card's dot and word (`ae`); none while it waits. */
  public static func badge(status: String) -> (kind: BadgeKind, label: String)? {
    switch status {
    case "approved": (.success, "Allowed once")
    case "always": (.success, "Always allowed")
    case "denied": (.danger, "Denied")
    case "expired": (.muted, "Expired")
    case "pending": nil
    default: (.muted, "Status unavailable")
    }
  }

  /** A summary that only says "run this" says nothing the command does not (`ie`, `re`, `le`). */
  public static func summarySaysNothing(_ summary: String) -> Bool {
    if summary == "Run a command on your local computer" || summary == "Run a command on Simeon's computer" || summary == "Run a command on the agent's VM" { return true }
    if summary.hasPrefix("Run “") || summary.hasPrefix("Run \"") { return true }
    return summary.range(of: "^Use .+ tool .+ with ", options: .regularExpression) != nil
  }

  /** The summary as its own line: only beside a command, and only when it says more. */
  public static func summaryLine(summary: String, command: String?) -> String? {
    guard command != nil, !summarySaysNothing(summary) else { return nil }
    return summary
  }

  public static let clipLength = 340

  /** The folded text, cut at 340 characters (`Q`); Copy takes the whole of it. */
  public static func clip(_ text: String) -> String {
    let units = Array(text.utf16)
    guard units.count > clipLength else { return text }
    return String(decoding: units.prefix(clipLength), as: UTF16.self) + "...[\(units.count - clipLength) chars omitted]..."
  }

  /** The line under an Always allowed card (`ue`). */
  public static func settledNote(status: String, rule: String?) -> String? {
    guard status == "always" else { return nil }
    let note = "A rule always allowing this was added to your Auto-review settings"
    return rule.map { "\(note): “\($0)”" } ?? note
  }

  /** The proposed rule as Always allow saves it: trimmed, secrets taken out, spaces as one (`ce`). */
  public static func rule(proposed: String?) -> String? {
    guard let trimmed = proposed?.trimmingCharacters(in: .whitespacesAndNewlines), !trimmed.isEmpty else { return nil }
    let cleaned = redact(trimmed).replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression).trimmingCharacters(in: .whitespacesAndNewlines)
    return cleaned.isEmpty ? nil : cleaned
  }

  /**
   * Addresses without their sign-in, query and fragment; passwords, keys
   * and tokens as "…" (`Z`).
   */
  public static func redact(_ text: String) -> String {
    var out = replacing(text, pattern: "https?://[^\\s\"'`]+", options: [.caseInsensitive]) { match in
      guard var parts = URLComponents(string: match), let scheme = parts.scheme, let host = parts.host, !host.isEmpty else { return match }
      parts.user = nil; parts.password = nil; parts.query = nil; parts.fragment = nil
      let path = parts.percentEncodedPath.isEmpty ? "/" : parts.percentEncodedPath
      let port = parts.port.map { ":\($0)" } ?? ""
      return "\(scheme.lowercased())://\(host.lowercased())\(port)\(path)"
    }
    out = out.replacingOccurrences(of: "((?:--)?(?:api[_-]?key|authorization|credential|password|secret|signature|token)\\s*(?:=|:|\\s)\\s*)(?:\"[^\"]*\"|'[^']*'|[^\\s]+)", with: "$1…", options: [.regularExpression, .caseInsensitive])
    out = out.replacingOccurrences(of: "\\bBearer\\s+[^\\s\"'`]+", with: "Bearer …", options: [.regularExpression, .caseInsensitive])
    out = out.replacingOccurrences(of: "\\b(?:sk[-_]|gh[pousr]_|xox[baprs]-|AIza)[A-Za-z0-9+/_=-]+", with: "…", options: [.regularExpression, .caseInsensitive])
    return out
  }

  private static func replacing(_ text: String, pattern: String, options: NSRegularExpression.Options, with transform: (String) -> String) -> String {
    guard let regex = try? NSRegularExpression(pattern: pattern, options: options) else { return text }
    let source = text as NSString
    var out = ""
    var last = 0
    for match in regex.matches(in: text, range: NSRange(location: 0, length: source.length)) {
      out += source.substring(with: NSRange(location: last, length: match.range.location - last))
      out += transform(source.substring(with: match.range))
      last = match.range.location + match.range.length
    }
    out += source.substring(from: last)
    return out
  }
}

extension AutoReviewInstructions {
  /**
   * Always allow's rule added to the allowed list (`oWn`): cut at a thousand
   * characters, nothing when it is already there, the oldest dropped past
   * twenty.
   */
  public func addingAllowRule(_ text: String) -> AutoReviewInstructions {
    let rule = Self.clipRule(text)
    if rule.isEmpty || allow.contains(rule) { return self }
    let appended = allow + [rule]
    let kept = appended.count <= Self.maxRules ? appended : Array(appended.suffix(Self.maxRules))
    return AutoReviewInstructions(isEnabled: isEnabled, allow: Self.cleanList(kept), ask: Self.cleanList(ask))
  }

  /** A rule trimmed and cut at a thousand characters (`Jtt`). */
  static func clipRule(_ text: String) -> String {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    let units = Array(trimmed.utf16)
    return units.count <= maxCharacters ? trimmed : String(decoding: units.prefix(maxCharacters), as: UTF16.self)
  }

  /** Each rule clipped, empty and repeated ones dropped, twenty at most (`IBe`). */
  static func cleanList(_ list: [String]) -> [String] {
    var seen = Set<String>()
    var out: [String] = []
    for item in list {
      let rule = clipRule(item)
      if rule.isEmpty || seen.contains(rule) { continue }
      seen.insert(rule)
      out.append(rule)
      if out.count >= maxRules { break }
    }
    return out
  }
}

/**
 * The card that asks to use this Mac (`local-tool-permission`, the window's
 * `LLn`): one title whatever the agent asks for, Always allow, Allow once,
 * Never, and Deny once on its ✕ or Esc. It waits in a dock above the
 * composer; once answered it is one line in the chat; an expired one is
 * gone.
 */
public enum LocalToolAsk {
  public static let title = "Allow Simeon and all agents to run commands on your local computer?"
  public static let description = "This applies to Simeon and every agent. It can always be changed in Settings."
  public static let denyOnce = "Deny once"
  public static let denyOnceTooltip = "Deny once (Esc)"
  public static let failure = "Your answer didn't go through. Check your connection and try again."
  public static let loadingPolicy = "Always allow is disabled while team policy loads"
  public static let blockedByPolicy = "Always allow is disabled by team policy"

  /** The answered card's line (`_Ln`). */
  public static func outcome(status: String) -> String {
    switch status {
    case "always": "Simeon can run commands on your computer."
    case "never": "Simeon cannot run commands on your computer."
    case "denied", "expired": "Simeon was not allowed to run commands on your computer."
    default: "Simeon can run commands on your computer this time."
    }
  }

  /** What `resolveLocalToolPermission` takes. */
  public enum Resolution: String, Sendable { case allowOnce = "allow-once", deny, always, never }
}

/** One ask to use this Mac, as the entry carries it (`message.ask`). */
public struct LocalAsk: Hashable, Sendable {
  public let entryId: String
  public let requestId: String
  /** `run-command`, `send-input`, `read-file`, `list-directory` or `write-file`. */
  public let action: String
  /** The command or the path. */
  public let target: String
  /** `pending`, `allowed`, `denied`, `always`, `never` or `expired`. */
  public let status: String

  public init(entryId: String, requestId: String, action: String, target: String, status: String) {
    self.entryId = entryId; self.requestId = requestId; self.action = action; self.target = target; self.status = status
  }

  public init?(entry: Entry) {
    guard entry.kind == "send-message", let message = entry.message, message["type"]?.string == "local-tool-permission", let ask = message["ask"] else { return nil }
    self.init(entryId: entry.id, requestId: ask["requestId"]?.string ?? "", action: ask["action"]?.string ?? "", target: ask["target"]?.string ?? "", status: ask["status"]?.string ?? "pending")
  }

  /** The first ask still waiting in a chat: the one the dock shows (`entries.find(NNe)`). */
  public static func waiting(in entries: [Entry]) -> LocalAsk? {
    for entry in entries {
      if let ask = LocalAsk(entry: entry), ask.status == "pending" { return ask }
    }
    return nil
  }
}
