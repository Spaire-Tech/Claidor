import Foundation

/**
 * A link that opens the Mac app, read by the Electron app's own rules
 * (`desktop/source/shared/deep-link.ts`, `parseSandDeepLink`), so the native
 * app accepts exactly what the Electron one does:
 *
 * - `<scheme>://app/v1/open`: back from the browser's sign-in; it only
 *   brings the window forward (the app learns it is signed in by polling);
 * - `<scheme>://app/v1/info?topic=deep-links`: the Deep Links page;
 * - `<scheme>://app/v1/plugin/add?id=<1–19 digits>`: a connector to add;
 * - the same three under `https://app.simeonlabs.com/sand/link/v1/…`.
 *
 * Anything else is refused: longer than 2,048 characters, not printable
 * ASCII, a `#` or a `\`, a broken `%` escape, a `%` or a `.`/`..` segment
 * in the path, a user, a password or a port, an unknown or repeated query
 * key, or a value the route does not allow.
 */
public struct DeepLink: Equatable, Sendable {
  public enum Route: Equatable, Sendable {
    case open
    case info(topic: String)
    case pluginAdd(id: String)
  }

  public enum Source: Equatable, Sendable {
    /** The app's own scheme. */
    case scheme
    /** An `https://app.simeonlabs.com/sand/link/…` address. */
    case https
  }

  public let route: Route
  public let source: Source

  public init(route: Route, source: Source) {
    self.route = route
    self.source = source
  }

  public static let maxLength = 2_048
  public static let authority = "app"
  public static let httpsHost = "app.simeonlabs.com"
  public static let httpsPrefix = "/sand/link"
  static let openPath = "/v1/open"
  static let infoPath = "/v1/info"
  static let pluginPath = "/v1/plugin/add"

  /**
   * The link, or nil. `schemes` are the ones this app answers to: `simeon`
   * once it is the Mac app people install, `simeon-mac` while it lives
   * beside the Electron one (`SimeonConfig.macURLScheme`).
   */
  public static func parse(_ raw: String, schemes: [String]) -> DeepLink? {
    guard !raw.isEmpty, raw.utf8.count <= maxLength, isPrintableASCII(raw), !raw.contains("#"), !raw.contains("\\"),
          hasValidPercentEncoding(raw), hasCanonicalPath(raw) else { return nil }
    let lower = raw.lowercased()
    let scheme = schemes.map { $0.lowercased() }.first { lower.hasPrefix("\($0):") }
    let source: Source
    if scheme != nil { source = .scheme } else if lower.hasPrefix("https:") { source = .https } else { return nil }
    guard let parts = URLComponents(string: raw), parts.user == nil, parts.password == nil, parts.port == nil else { return nil }
    // Empty pieces (`?id=1&`) are no keys, as the browser's URLSearchParams reads them.
    let query = (parts.queryItems ?? []).filter { !($0.name.isEmpty && ($0.value ?? "").isEmpty) }
    let path: String
    switch source {
    case .scheme:
      guard parts.scheme?.lowercased() == scheme, parts.host == authority else { return nil }
      path = parts.path
    case .https:
      guard parts.scheme?.lowercased() == "https", parts.host?.lowercased() == httpsHost, parts.path.hasPrefix(httpsPrefix + "/") else { return nil }
      path = String(parts.path.dropFirst(httpsPrefix.count))
    }
    switch path {
    case pluginPath:
      guard query.count == 1, let item = query.first, item.name == "id", let id = item.value, isPluginId(id) else { return nil }
      return DeepLink(route: .pluginAdd(id: id), source: source)
    case openPath:
      guard query.isEmpty else { return nil }
      return DeepLink(route: .open, source: source)
    case infoPath:
      guard allowlisted(query, ["topic": ["deep-links"]]) else { return nil }
      return DeepLink(route: .info(topic: "deep-links"), source: source)
    default:
      return nil
    }
  }

  /** The link written the one way the app writes it (`canonicalSandDeepLinkUrl`). */
  public func canonical(scheme: String) -> String {
    switch route {
    case .open: return "\(scheme)://\(Self.authority)\(Self.openPath)"
    case .info(let topic): return "\(scheme)://\(Self.authority)\(Self.infoPath)?topic=\(topic)"
    case .pluginAdd(let id): return "\(scheme)://\(Self.authority)\(Self.pluginPath)?id=\(id)"
    }
  }

  /** A plugin's id: 1 to 19 digits (`isSandDeepLinkPluginId`). */
  public static func isPluginId(_ value: String) -> Bool {
    (1...19).contains(value.count) && value.allSatisfy { $0.isASCII && $0.isNumber }
  }

  static func isPrintableASCII(_ value: String) -> Bool {
    value.unicodeScalars.allSatisfy { (33...126).contains($0.value) }
  }

  /** Every `%` starts two hex digits. */
  static func hasValidPercentEncoding(_ value: String) -> Bool {
    let bytes = Array(value.utf8)
    var index = 0
    while index < bytes.count {
      if bytes[index] == UInt8(ascii: "%") {
        guard index + 2 < bytes.count, isHex(bytes[index + 1]), isHex(bytes[index + 2]) else { return false }
        index += 3
      } else {
        index += 1
      }
    }
    return true
  }

  /** Before the query: no `%` at all, and no `/.` or `/..` segment. */
  static func hasCanonicalPath(_ value: String) -> Bool {
    let beforeQuery = value.split(separator: "?", maxSplits: 1, omittingEmptySubsequences: false).first.map(String.init) ?? value
    if beforeQuery.contains("%") { return false }
    let segments = beforeQuery.split(separator: "/", omittingEmptySubsequences: false).dropFirst()
    return !segments.contains { $0 == "." || $0 == ".." }
  }

  /** Each key allowed, once, with an allowed value; every allowed key present (`readAllowlistedQuery`). */
  static func allowlisted(_ items: [URLQueryItem], _ allowed: [String: [String]]) -> Bool {
    var seen: [String: String] = [:]
    for item in items {
      guard let values = allowed[item.name], seen[item.name] == nil, let value = item.value, values.contains(value) else { return false }
      seen[item.name] = value
    }
    return allowed.keys.allSatisfy { seen[$0] != nil }
  }

  private static func isHex(_ byte: UInt8) -> Bool {
    (UInt8(ascii: "0")...UInt8(ascii: "9")).contains(byte) || (UInt8(ascii: "a")...UInt8(ascii: "f")).contains(byte) || (UInt8(ascii: "A")...UInt8(ascii: "F")).contains(byte)
  }
}
