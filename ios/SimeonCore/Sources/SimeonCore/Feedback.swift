import Foundation
#if canImport(ImageIO)
import ImageIO
import UniformTypeIdentifiers
#endif

/**
 * Send Feedback and Report an Issue (30 October 2026, the founder, with
 * two other apps' for reference: "anything submitted under the hood let it
 * go to bass@simeonlabs.com"). Both sheets post to `/desktop/api/feedback`
 * (server/simeon/desktop/feedback.py), which e-mails the founder with the
 * person as the reply-to.
 *
 * Feedback is words and, if it was about one, an agent. An issue is words,
 * up to four screenshots and the topics it is about; first the person says
 * whether the app's logs and diagnostics go with it (`Diagnostics`). Either
 * way the server is told the app, its version, the device, its system, the
 * language and the time zone (`DeviceFacts`).
 */
public struct FeedbackReport: Sendable, Equatable {
  public enum Kind: String, Sendable { case feedback, issue }

  public static let messageLimit = 5_000
  public static let screenshotLimit = 4

  public var kind: Kind
  public var message = ""
  public var agent: FeedbackAgent?
  /** Topic ids (`FeedbackTopic.id`), in the order they were picked. */
  public var topics: [String] = []
  /** JPEGs, already shrunk (`FeedbackPictures.shrink`). */
  public var screenshots: [Data] = []
  public var includesDiagnostics = false

  public init(kind: Kind) { self.kind = kind }

  public var trimmed: String { message.trimmingCharacters(in: .whitespacesAndNewlines) }
  public var canSend: Bool { !trimmed.isEmpty && message.count <= Self.messageLimit }
  public var roomForScreenshots: Int { max(0, Self.screenshotLimit - screenshots.count) }

  public mutating func toggle(_ topic: FeedbackTopic) {
    if let at = topics.firstIndex(of: topic.id) { topics.remove(at: at) } else { topics.append(topic.id) }
  }

  /** What the route reads: the words, the facts, the agent, the topics, the screenshots and, when agreed, the diagnostics. */
  public func body(facts: DeviceFacts, diagnostics: String?) -> JSON {
    var body: [String: JSON] = [
      "kind": .string(kind.rawValue),
      "message": .string(trimmed),
      "platform": .string(facts.platform),
      "appVersion": .string(facts.appVersion),
      "device": .string(facts.device),
      "osVersion": .string(facts.osVersion),
      "language": .string(facts.language),
      "timeZone": .string(facts.timeZone),
    ]
    if let agent {
      body["agent"] = ["id": .string(agent.id), "name": .string(agent.name), "title": JSON(agent.title)]
    }
    if !topics.isEmpty { body["topics"] = .array(topics.map(JSON.string)) }
    if !screenshots.isEmpty {
      body["screenshots"] = .array(screenshots.enumerated().map { index, data in
        ["filename": .string("screenshot-\(index + 1).jpg"), "data": .string(data.base64EncodedString())]
      })
    }
    if includesDiagnostics, let diagnostics, !diagnostics.isEmpty { body["diagnostics"] = .string(diagnostics) }
    return .object(body)
  }
}

/** The agent a message is about, as the roster names it. */
public struct FeedbackAgent: Sendable, Equatable, Hashable, Identifiable {
  public let id: String
  public let name: String
  public let title: String?

  public init(id: String, name: String, title: String?) {
    self.id = id; self.name = name
    let job = title?.trimmingCharacters(in: .whitespacesAndNewlines)
    self.title = job?.isEmpty == false ? job : nil
  }

  /** "Maya · Inbox", as the reference's picker names one with its job. */
  public var label: String { title.map { "\(name) · \($0)" } ?? name }

  /** The agents a message can be about: the person's own, not a group, a hidden one or a helper with a purpose (the disk saver). */
  public static func choices(from agents: [Agent]) -> [FeedbackAgent] {
    agents.filter { !$0.isGroup && !$0.isHidden && $0.purpose == nil }
      .map { FeedbackAgent(id: $0.id, name: $0.name, title: $0.title) }
  }
}

extension AppStore {
  /** Send Feedback and Report an Issue, e-mailed to Simeon Labs; the server's sentence is thrown when it refuses. */
  public func sendFeedback(_ report: FeedbackReport, facts: DeviceFacts, diagnostics: String?) async throws {
    guard let backend else { throw SimeonAPIError(message: L10n.text("Sign in to Simeon first."), status: 401) }
    _ = try await backend.server("feedback", method: "POST", body: report.body(facts: facts, diagnostics: diagnostics))
  }

  /** What the app knows of its own state, a line each, for a report's diagnostics. */
  public var diagnosticsState: [String] {
    var lines = [
      "Signed in: \(account == nil ? "no" : "yes")",
      "Agents: \(agents.filter { !$0.isGroup }.count), groups: \(agents.filter(\.isGroup).count)",
      "Computer: \(latestComputerStatus?.state ?? "unknown"), stream \(isLive ? "connected" : "not connected")\(isAsleep ? ", asleep" : "")",
      "Open chat: \(openChat ?? "none")",
    ]
    if let problem { lines.append("Last problem shown: \(problem)") }
    return lines
  }
}

/**
 * What an issue can be about, as Muse's chips ask: the parts of Simeon a
 * person meets. The id is the English, which the founder reads in the e-mail.
 */
public struct FeedbackTopic: Sendable, Hashable, Identifiable {
  public let id: String
  /** An SF Symbol, drawn before the words. */
  public let symbol: String
  public let title: String

  public static var all: [FeedbackTopic] {
    [
      FeedbackTopic(id: "Account and sign-in", symbol: "person.crop.circle", title: L10n.text("Account and sign-in")),
      FeedbackTopic(id: "Agents", symbol: "person.2", title: L10n.text("Agents")),
      FeedbackTopic(id: "Chats", symbol: "bubble.left.and.bubble.right", title: L10n.text("Chats")),
      FeedbackTopic(id: "Cloud computer", symbol: "desktopcomputer", title: L10n.text("Cloud computer")),
      FeedbackTopic(id: "Connectors", symbol: "link", title: L10n.text("Connectors")),
      FeedbackTopic(id: "Routines", symbol: "clock.arrow.circlepath", title: L10n.text("Routines")),
      FeedbackTopic(id: "Voice calls", symbol: "waveform", title: L10n.text("Voice calls")),
      FeedbackTopic(id: "Notifications", symbol: "bell", title: L10n.text("Notifications")),
      FeedbackTopic(id: "Plans and billing", symbol: "creditcard", title: L10n.text("Plans and billing")),
      FeedbackTopic(id: "Settings", symbol: "gearshape", title: L10n.text("Settings")),
      FeedbackTopic(id: "Other", symbol: "ellipsis.circle", title: L10n.text("Other")),
    ]
  }
}

/** The app and the device a report comes from, always sent. */
public struct DeviceFacts: Sendable, Equatable {
  /** "Mac" or "iPhone". */
  public let platform: String
  /** "0.2.10 (41)". */
  public let appVersion: String
  /** The model's identifier: "iPhone16,2", "Mac15,3". */
  public let device: String
  /** "iOS 26.1", "macOS 26.1". */
  public let osVersion: String
  public let language: String
  public let timeZone: String

  public init(platform: String, appVersion: String, device: String, osVersion: String, language: String, timeZone: String) {
    self.platform = platform; self.appVersion = appVersion; self.device = device
    self.osVersion = osVersion; self.language = language; self.timeZone = timeZone
  }

  /** This device's, for the app named `platform` at `appVersion`. */
  public static func current(platform: String, appVersion: String) -> DeviceFacts {
    let version = ProcessInfo.processInfo.operatingSystemVersion
    let system = platform == "Mac" ? "macOS" : "iOS"
    let patch = version.patchVersion > 0 ? ".\(version.patchVersion)" : ""
    return DeviceFacts(platform: platform, appVersion: appVersion, device: modelIdentifier(),
                       osVersion: "\(system) \(version.majorVersion).\(version.minorVersion)\(patch)",
                       language: AppLanguage.current, timeZone: TimeZone.current.identifier)
  }

  /** The hardware's own name for itself: `hw.model` on a Mac, `uname`'s machine on a phone. */
  static func modelIdentifier() -> String {
    #if os(macOS)
    var size = 0
    sysctlbyname("hw.model", nil, &size, nil, 0)
    if size > 0 {
      var bytes = [CChar](repeating: 0, count: size)
      if sysctlbyname("hw.model", &bytes, &size, nil, 0) == 0 {
        return String(decoding: bytes.prefix { $0 != 0 }.map { UInt8(bitPattern: $0) }, as: UTF8.self)
      }
    }
    #endif
    var info = utsname()
    uname(&info)
    return withUnsafeBytes(of: &info.machine) { raw in
      String(decoding: raw.prefix { $0 != 0 }, as: UTF8.self)
    }
  }
}

/**
 * What the app did lately, kept for a report: the console's lines
 * (`Trace.log`) and every refused or failed call to Simeon Labs' server
 * (`SimeonAPI`), the last 400, each with its time. Nothing is written to
 * disk, and every line is scrubbed of what could open an account
 * (`Diagnostics.scrub`) before it is kept.
 */
public enum RecentActivity {
  public static let keep = 400
  private static let lines = LockedBox<[String]>([])
  private static let stamp: ISO8601DateFormatter = {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter
  }()

  public static func note(_ line: String, at date: Date = Date()) {
    let text = Diagnostics.scrub(line.split(whereSeparator: \.isNewline).joined(separator: " "))
    lines.withLock { kept in
      kept.append("\(stamp.string(from: date)) \(text)")
      if kept.count > keep { kept.removeFirst(kept.count - keep) }
    }
  }

  public static var all: [String] { lines.withLock { $0 } }

  public static func clear() { lines.withLock { $0.removeAll() } }
}

/** The text attached as `diagnostics.txt` when the person agrees to include it. */
public enum Diagnostics {
  /**
   * The report's text: the facts, what the app knows of its own state
   * (`state`, a line each), its recent activity, then any log the app keeps
   * on disk (`files`: the Mac's `computer-stream.log` and `voice-call.log`),
   * each scrubbed.
   */
  public static func text(facts: DeviceFacts, state: [String], activity: [String] = RecentActivity.all, files: [(name: String, text: String)] = []) -> String {
    var parts = [
      "Simeon \(facts.platform) \(facts.appVersion)",
      "Device: \(facts.device), \(facts.osVersion)",
      "Language: \(facts.language), time zone: \(facts.timeZone)",
    ]
    parts += state.map(scrub)
    parts += ["", "Recent activity (oldest first):"]
    parts += activity.isEmpty ? ["Nothing yet."] : activity
    for file in files {
      let lines = file.text.split(whereSeparator: \.isNewline).suffix(300).map { scrub(String($0)) }
      parts += ["", "\(file.name) (last \(lines.count) lines):"] + lines
    }
    return parts.joined(separator: "\n")
  }

  private static let rules: [(NSRegularExpression, String)] = [
    // An address's query string: tokens and sign-in codes travel there.
    (#"((?:https?|wss?)://[^\s?#"'<>]+)\?[^\s"'<>]*"#, "$1?***"),
    // A named secret: `token=…`, `"password": "…"`.
    (#"(?i)\b(access_token|refresh_token|id_token|token|api_?key|secret|password)(["']?\s*[:=]\s*["']?)[^\s"'&,;]+"#, "$1$2***"),
    (#"(?i)\bBearer\s+\S+"#, "Bearer ***"),
    // A JSON web token.
    (#"\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*"#, "***"),
    // Any other long opaque run (a key, a token), but never an id written as a UUID.
    (#"\b(?![0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b)[A-Za-z0-9_\-]{32,}"#, "***"),
  ].compactMap { pair in (try? NSRegularExpression(pattern: pair.0)).map { ($0, pair.1) } }

  /** `line` with what looks like a secret replaced by `***`: query strings, bearer tokens, web tokens and long opaque runs. */
  public static func scrub(_ line: String) -> String {
    rules.reduce(line) { text, rule in
      rule.0.stringByReplacingMatches(in: text, range: NSRange(text.startIndex..., in: text), withTemplate: rule.1)
    }
  }
}

/** Screenshots as the e-mail carries them: 1,600 points on the long side at most, as JPEG. */
public enum FeedbackPictures {
  public static let maxDimension = 1_600

  /** `data` (a PNG, HEIC, JPEG…) shrunk to a JPEG, or nil when it is not a picture. */
  public static func shrink(_ data: Data) -> Data? {
    #if canImport(ImageIO)
    guard let source = CGImageSourceCreateWithData(data as CFData, nil),
          let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
          let width = properties[kCGImagePropertyPixelWidth] as? Int, let height = properties[kCGImagePropertyPixelHeight] as? Int,
          width > 0, height > 0 else { return nil }
    let options: [CFString: Any] = [
      kCGImageSourceCreateThumbnailFromImageAlways: true,
      kCGImageSourceThumbnailMaxPixelSize: min(maxDimension, max(width, height)),
      kCGImageSourceCreateThumbnailWithTransform: true,
    ]
    guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else { return nil }
    let out = NSMutableData()
    guard let destination = CGImageDestinationCreateWithData(out, UTType.jpeg.identifier as CFString, 1, nil) else { return nil }
    CGImageDestinationAddImage(destination, image, [kCGImageDestinationLossyCompressionQuality: 0.8] as CFDictionary)
    return CGImageDestinationFinalize(destination) ? out as Data : nil
    #else
    return data.isEmpty ? nil : data
    #endif
  }
}
