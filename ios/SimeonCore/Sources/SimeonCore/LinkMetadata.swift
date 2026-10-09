import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
#if canImport(CryptoKit)
import CryptoKit
#endif
#if canImport(ImageIO)
import ImageIO
import UniformTypeIdentifiers
#endif

/**
 * What a page says of itself, for a lone link's card: read on this device
 * the way the Mac's Electron app reads it (`fetchLinkMetadata`,
 * `safe-link-preview-fetch.ts`, `attachments.ts`), never through the
 * agent's computer.
 */
public struct LinkMetadata: Codable, Equatable, Sendable {
  public let url: String
  public let canonicalUrl: String
  public let title: String
  public let description: String
  public let siteName: String
  /** The host of the address the page was read from, after redirects. */
  public let hostname: String
  /** The page's picture, at most 1,280 on its long side (JPEG). */
  public let image: Data?
  /** The site's icon, at most 128 on its long side (PNG). */
  public let favicon: Data?
  public let fetchedAt: Double
}

/** Which addresses may be read for a card, and how a page is read (`safe-link-preview-fetch.ts`, `attachments-service.ts`). */
public enum LinkPreviewPolicy {
  public static let maxURLLength = 2_048
  public static let maxRedirects = 5
  public static let userAgent = "Simeon-LinkPreview/1.0"
  public static let htmlByteLimit = 512 * 1024
  public static let imageByteLimit = 2 * 1024 * 1024
  public static let titleLimit = 512
  public static let descriptionLimit = 2_048
  public static let siteNameLimit = 256
  public static let imageTypes: Set<String> = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif", "image/x-icon", "image/vnd.microsoft.icon"]
  public static let photoMaxDimension = 1_280
  public static let iconMaxDimension = 128
  /** A picture larger than this many pixels is left out. */
  public static let maxPixels = 24_000_000
  static let redirectStatuses: Set<Int> = [301, 302, 303, 307, 308]
  static let nonPublicSuffixes = [".localhost", ".local", ".internal", ".lan", ".home", ".corp", ".cluster", ".svc", ".arpa", ".onion"]

  /**
   * An address a card may read (`parseSafeLinkPreviewUrl`): `https:`, at
   * most 2,048 characters, no name or password in it, no port but 443; a
   * host with a dot that is not "localhost" nor ends in a private suffix
   * (".local", ".internal"…), or a public IP address.
   */
  public static func safeURL(_ raw: String) -> URL? {
    guard raw.count <= maxURLLength, let url = URL(string: raw), url.scheme?.lowercased() == "https",
          url.user == nil, url.password == nil, url.port == nil || url.port == 443,
          let host = url.host else { return nil }
    let name = normalizedHost(host)
    if isIPAddress(name) { return isBlockedIP(name) ? nil : url }
    return isBlockedHostname(name) ? nil : url
  }

  static func normalizedHost(_ host: String) -> String {
    var value = host
    if value.hasPrefix("[") && value.hasSuffix("]") { value = String(value.dropFirst().dropLast()) }
    value = value.lowercased()
    if value.hasSuffix(".") { value.removeLast() }
    return value
  }

  static func isBlockedHostname(_ host: String) -> Bool {
    host.isEmpty || !host.contains(".") || host == "localhost"
      || nonPublicSuffixes.contains { host == String($0.dropFirst()) || host.hasSuffix($0) }
  }

  static func isIPAddress(_ text: String) -> Bool { ipv4(text) != nil || ipv6(text) != nil }

  /** A private, reserved or multicast address (the Electron app's block list); anything not an address is blocked too. */
  public static func isBlockedIP(_ text: String) -> Bool {
    if let v4 = ipv4(text) { return blocked4.contains { matches(v4, $0.0, $0.1) } }
    if let v6 = ipv6(text) { return blocked6.contains { matches(v6, $0.0, $0.1) } }
    return true
  }

  private static let blocked4: [([UInt8], Int)] = [
    ("0.0.0.0", 8), ("10.0.0.0", 8), ("100.64.0.0", 10), ("127.0.0.0", 8), ("169.254.0.0", 16), ("172.16.0.0", 12),
    ("192.0.0.0", 24), ("192.0.2.0", 24), ("192.88.99.0", 24), ("192.168.0.0", 16), ("198.18.0.0", 15),
    ("198.51.100.0", 24), ("203.0.113.0", 24), ("224.0.0.0", 4), ("240.0.0.0", 4),
  ].map { (ipv4($0.0)!, $0.1) }

  private static let blocked6: [([UInt8], Int)] = [
    ("::", 127), ("64:ff9b::", 96), ("64:ff9b:1::", 48), ("100::", 64), ("2001::", 32), ("2001:db8::", 32),
    ("2002::", 16), ("fc00::", 7), ("fe80::", 10), ("fec0::", 10), ("ff00::", 8),
  ].map { (ipv6($0.0)!, $0.1) }

  private static func matches(_ address: [UInt8], _ network: [UInt8], _ prefix: Int) -> Bool {
    guard address.count == network.count else { return false }
    var left = prefix
    for index in 0..<address.count where left > 0 {
      let bits = min(8, left)
      let mask: UInt8 = bits == 8 ? 0xFF : ~(0xFF >> UInt8(bits))
      if address[index] & mask != network[index] & mask { return false }
      left -= bits
    }
    return true
  }

  static func ipv4(_ text: String) -> [UInt8]? {
    let parts = text.split(separator: ".", omittingEmptySubsequences: false)
    guard parts.count == 4 else { return nil }
    var bytes: [UInt8] = []
    for part in parts {
      guard !part.isEmpty, part.count <= 3, part.allSatisfy(\.isASCII), part.allSatisfy(\.isNumber), let value = Int(part), value <= 255 else { return nil }
      bytes.append(UInt8(value))
    }
    return bytes
  }

  static func ipv6(_ text: String) -> [UInt8]? {
    guard text.contains(":"), !text.contains("%") else { return nil }
    var head = text
    var tail4: [UInt8] = []
    // An IPv4 tail ("::ffff:1.2.3.4").
    if let lastColon = text.lastIndex(of: ":"), text[text.index(after: lastColon)...].contains(".") {
      guard let v4 = ipv4(String(text[text.index(after: lastColon)...])) else { return nil }
      tail4 = v4
      head = String(text[...lastColon])
      if head.hasSuffix(":") && !head.hasSuffix("::") { head.removeLast() }
    }
    func groups(_ part: Substring) -> [UInt16]? {
      if part.isEmpty { return [] }
      var out: [UInt16] = []
      for group in part.split(separator: ":", omittingEmptySubsequences: false) {
        guard !group.isEmpty, group.count <= 4, let value = UInt16(group, radix: 16) else { return nil }
        out.append(value)
      }
      return out
    }
    let wanted = tail4.isEmpty ? 8 : 6
    var words: [UInt16]
    if let gap = head.range(of: "::") {
      guard head[gap.upperBound...].range(of: "::") == nil,
            let left = groups(head[..<gap.lowerBound]), let right = groups(head[gap.upperBound...]),
            left.count + right.count < wanted else { return nil }
      words = left + Array(repeating: 0, count: wanted - left.count - right.count) + right
    } else {
      guard let all = groups(Substring(head)), all.count == wanted else { return nil }
      words = all
    }
    return words.flatMap { [UInt8($0 >> 8), UInt8($0 & 0xFF)] } + tail4
  }

  /**
   * A sign-in page a redirect landed on, which is never shown as a card:
   * accounts.google.com; a host with a label "auth", "login", "sso"…; an
   * address whose last part is "login", "authorize", "signin"…, or with
   * "sign-in/identifier" in it.
   */
  public static func isSignInPage(_ url: URL) -> Bool {
    let host = (url.host ?? "").lowercased()
    let labels: Set<String> = ["auth", "authenticate", "authentication", "authenticator", "idp", "identity", "login", "oauth", "signin", "sso"]
    if host == "accounts.google.com" || host.split(separator: ".").contains(where: { labels.contains(String($0)) }) { return true }
    let segments = url.path.split(separator: "/").map { ($0.removingPercentEncoding ?? String($0)).lowercased() }
    let last: Set<String> = ["auth", "authenticate", "authorize", "login", "saml", "sign-in", "sign_in", "signin", "sso"]
    if let final = segments.last, last.contains(final) { return true }
    let nested: Set<String> = ["sign-in/identifier", "sign_in/identifier", "signin/identifier"]
    return segments.indices.contains { nested.contains(segments[$0] + "/" + (segments.indices.contains($0 + 1) ? segments[$0 + 1] : "")) }
  }

  /** What a page's head says (`scrapeOpenGraph`): the first of each tag in the window's order, cleaned and cut. */
  public struct Scraped: Equatable {
    public let title: String
    public let description: String
    public let siteName: String
    public let canonicalUrl: String
    public let imageUrl: String?
    public let faviconUrl: String?
  }

  public static func scrape(_ html: String, finalURL: URL) -> Scraped {
    let title = meta(html, "property", "og:title") ?? meta(html, "name", "twitter:title") ?? pageTitle(html) ?? ""
    let description = meta(html, "property", "og:description") ?? meta(html, "name", "description") ?? meta(html, "name", "twitter:description") ?? ""
    let siteName = meta(html, "property", "og:site_name") ?? meta(html, "name", "application-name") ?? ""
    let canonical = linkHref(html, ["canonical"]) ?? meta(html, "property", "og:url") ?? finalURL.absoluteString
    let image = meta(html, "property", "og:image") ?? meta(html, "property", "og:image:url") ?? meta(html, "name", "twitter:image") ?? meta(html, "name", "twitter:image:src")
    let favicon = linkHref(html, ["icon", "shortcut", "apple-touch-icon", "apple-touch-icon-precomposed", "mask-icon"])
    return Scraped(
      title: clean(title, titleLimit), description: clean(description, descriptionLimit), siteName: clean(siteName, siteNameLimit),
      canonicalUrl: absolute(canonical, finalURL) ?? finalURL.absoluteString,
      imageUrl: image.flatMap { absolute($0, finalURL) }, faviconUrl: favicon.flatMap { absolute($0, finalURL) })
  }

  static func absolute(_ href: String, _ base: URL) -> String? {
    guard let url = URL(string: href, relativeTo: base)?.absoluteURL else { return nil }
    return safeURL(url.absoluteString)?.absoluteString
  }

  private static let metaTag = try! NSRegularExpression(pattern: "<meta\\b[^>]*>", options: .caseInsensitive)
  private static let linkTag = try! NSRegularExpression(pattern: "<link\\b[^>]*>", options: .caseInsensitive)
  private static let titleTag = try! NSRegularExpression(pattern: "<title>([^<]*)</title>", options: .caseInsensitive)

  private static func tags(_ regex: NSRegularExpression, in html: String) -> [String] {
    let range = NSRange(html.startIndex..., in: html)
    return regex.matches(in: html, range: range).compactMap { Range($0.range, in: html).map { String(html[$0]) } }
  }

  static func attribute(_ tag: String, _ name: String) -> String? {
    let pattern = NSRegularExpression.escapedPattern(for: name) + "\\s*=\\s*(\"([^\"]*)\"|'([^']*)'|([^\\s>]+))"
    guard let regex = try? NSRegularExpression(pattern: pattern, options: .caseInsensitive),
          let match = regex.firstMatch(in: tag, range: NSRange(tag.startIndex..., in: tag)) else { return nil }
    for group in [2, 3, 4] {
      if let range = Range(match.range(at: group), in: tag) { return String(tag[range]) }
    }
    return nil
  }

  static func meta(_ html: String, _ attr: String, _ value: String) -> String? {
    for tag in tags(metaTag, in: html) {
      guard let candidate = attribute(tag, attr), candidate.lowercased() == value.lowercased(), let content = attribute(tag, "content") else { continue }
      return decodeEntities(content).trimmingCharacters(in: .whitespacesAndNewlines)
    }
    return nil
  }

  static func linkHref(_ html: String, _ rels: [String]) -> String? {
    for tag in tags(linkTag, in: html) {
      guard let rel = attribute(tag, "rel") else { continue }
      let tokens = rel.lowercased().split(whereSeparator: \.isWhitespace).map(String.init)
      guard rels.contains(where: tokens.contains), let href = attribute(tag, "href") else { continue }
      return decodeEntities(href).trimmingCharacters(in: .whitespacesAndNewlines)
    }
    return nil
  }

  static func pageTitle(_ html: String) -> String? {
    guard let match = titleTag.firstMatch(in: html, range: NSRange(html.startIndex..., in: html)),
          let range = Range(match.range(at: 1), in: html) else { return nil }
    return decodeEntities(String(html[range])).trimmingCharacters(in: .whitespacesAndNewlines)
  }

  /** The entities a head uses: &amp; &lt; &gt; &quot; &apos; &nbsp; and numbered ones. */
  static func decodeEntities(_ text: String) -> String {
    var out = text
    for (pattern, value) in [("&(amp|#38);", "&"), ("&(lt|#60);", "<"), ("&(gt|#62);", ">"), ("&(quot|#34);", "\""), ("&(apos|#39);", "'"), ("&nbsp;", " ")] {
      out = out.replacingOccurrences(of: pattern, with: value, options: [.regularExpression, .caseInsensitive])
    }
    for (pattern, radix) in [("&#(\\d+);", 10), ("&#x([0-9a-fA-F]+);", 16)] {
      let regex = try! NSRegularExpression(pattern: pattern)
      var result = ""
      var last = out.startIndex
      for match in regex.matches(in: out, range: NSRange(out.startIndex..., in: out)) {
        guard let whole = Range(match.range, in: out), let digits = Range(match.range(at: 1), in: out) else { continue }
        result += out[last..<whole.lowerBound]
        if let code = UInt32(out[digits], radix: radix), let scalar = Unicode.Scalar(code) { result.unicodeScalars.append(scalar) } else { result += out[whole] }
        last = whole.upperBound
      }
      out = result + out[last...]
    }
    return out
  }

  /** Control characters out, spaces run together, trimmed, cut. */
  static func clean(_ text: String, _ limit: Int) -> String {
    let spaced = String(String.UnicodeScalarView(text.unicodeScalars.map { (0...0x1F).contains($0.value) || (0x7F...0x9F).contains($0.value) ? " " : $0 }))
    return String(spaced.split(whereSeparator: \.isWhitespace).joined(separator: " ").prefix(limit))
  }
}

/**
 * Reads pages for link cards, once per address while the app runs (an
 * empty answer is final), kept on disk a day (`link-preview-cache`,
 * version 3). Any failure is no card data: the card shows the address.
 */
public actor LinkMetadataReader {
  public static let shared = LinkMetadataReader()

  private var answered: [String: LinkMetadata?] = [:]
  private var reading: [String: Task<LinkMetadata?, Never>] = [:]
  private let cacheDir: URL?
  static let cacheVersion = 3
  static let cacheTTL: Double = 24 * 60 * 60

  public init(cacheDir: URL? = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first?
    .appendingPathComponent("link-preview-cache", isDirectory: true).appendingPathComponent("link-cache", isDirectory: true)) {
    self.cacheDir = cacheDir
  }

  /** What was read for `url` before, when it was. */
  public func known(_ url: String) -> LinkMetadata?? { answered[url] }

  public func metadata(for raw: String) async -> LinkMetadata? {
    if let done = answered[raw] { return done }
    if let running = reading[raw] { return await running.value }
    let task = Task { await self.read(raw) }
    reading[raw] = task
    let result = await task.value
    reading[raw] = nil
    answered[raw] = result
    return result
  }

  private func read(_ raw: String) async -> LinkMetadata? {
    guard let url = LinkPreviewPolicy.safeURL(raw.trimmingCharacters(in: .whitespacesAndNewlines)) else { return nil }
    let key = url.absoluteString
    if let cached = cached(key) { return cached }
    guard let page = try? await Self.fetch(url, limit: LinkPreviewPolicy.htmlByteLimit, accept: "text/html,application/xhtml+xml,application/xml;q=0.9", truncate: true),
          (200..<300).contains(page.status) else { return nil }
    if page.redirects.contains(where: LinkPreviewPolicy.isSignInPage) { return nil }
    let type = page.contentType.lowercased()
    if !page.contentType.isEmpty && !type.contains("html") && !type.contains("xml") { return nil }
    let html = String(decoding: page.body, as: UTF8.self)
    let scraped = LinkPreviewPolicy.scrape(html, finalURL: page.finalURL)
    async let image: Data? = {
      guard let href = scraped.imageUrl else { return nil }
      return await Self.image(href)
    }()
    async let favicon: Data? = {
      if let href = scraped.faviconUrl, let direct = await Self.image(href) { return direct }
      // The same host, never a favicon service: a link's host stays between the person and that site.
      guard let scheme = page.finalURL.scheme, let host = page.finalURL.host else { return nil }
      return await Self.image("\(scheme)://\(host)/favicon.ico")
    }()
    let metadata = LinkMetadata(
      url: key, canonicalUrl: scraped.canonicalUrl, title: scraped.title, description: scraped.description, siteName: scraped.siteName,
      hostname: page.finalURL.host ?? "",
      image: Self.bounded(await image, maxDimension: LinkPreviewPolicy.photoMaxDimension, jpeg: true),
      favicon: Self.bounded(await favicon, maxDimension: LinkPreviewPolicy.iconMaxDimension, jpeg: false),
      fetchedAt: Date().timeIntervalSince1970 * 1000)
    store(metadata, for: key)
    return metadata
  }

  // MARK: The disk cache

  private struct CacheEntry: Codable {
    let metadata: LinkMetadata
    let cacheVersion: Int
  }

  private func cacheFile(_ key: String) -> URL? { cacheDir?.appendingPathComponent(Self.digest(key) + ".json") }

  private func cached(_ key: String) -> LinkMetadata? {
    guard let file = cacheFile(key), let data = try? Data(contentsOf: file),
          let entry = try? JSONDecoder().decode(CacheEntry.self, from: data), entry.cacheVersion == Self.cacheVersion,
          Date().timeIntervalSince1970 * 1000 - entry.metadata.fetchedAt <= Self.cacheTTL * 1000 else { return nil }
    return entry.metadata
  }

  private func store(_ metadata: LinkMetadata, for key: String) {
    guard let dir = cacheDir, let file = cacheFile(key), let data = try? JSONEncoder().encode(CacheEntry(metadata: metadata, cacheVersion: Self.cacheVersion)) else { return }
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    try? data.write(to: file, options: .atomic)
  }

  static func digest(_ text: String) -> String {
    #if canImport(CryptoKit)
    return SHA256.hash(data: Data(text.utf8)).map { String(format: "%02x", $0) }.joined()
    #else
    var hash: UInt64 = 0xcbf29ce484222325
    for byte in text.utf8 { hash = (hash ^ UInt64(byte)) &* 0x100000001b3 }
    return String(hash, radix: 16)
    #endif
  }

  // MARK: Reading

  struct Page {
    let status: Int
    let contentType: String
    let body: Data
    let finalURL: URL
    let redirects: [URL]
  }

  /** Redirects are followed here, each checked again, at most five; nothing private is reached by name either. */
  private final class NoRedirects: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
      completionHandler(nil)
    }
  }

  private static let session: URLSession = {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.timeoutIntervalForRequest = 8
    configuration.timeoutIntervalForResource = 8
    configuration.httpAdditionalHeaders = ["User-Agent": LinkPreviewPolicy.userAgent, "Accept-Encoding": "identity"]
    configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
    return URLSession(configuration: configuration, delegate: NoRedirects(), delegateQueue: nil)
  }()

  static func fetch(_ start: URL, limit: Int, accept: String, truncate: Bool) async throws -> Page {
    var current = start
    var redirects: [URL] = []
    for count in 0... {
      guard count <= LinkPreviewPolicy.maxRedirects else { throw URLError(.httpTooManyRedirects) }
      guard await resolvesPublicly(current) else { throw URLError(.cannotFindHost) }
      var request = URLRequest(url: current, timeoutInterval: 8)
      request.setValue(accept, forHTTPHeaderField: "Accept")
      let (data, response) = try await session.data(for: request)
      guard let http = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
      if LinkPreviewPolicy.redirectStatuses.contains(http.statusCode), let location = http.value(forHTTPHeaderField: "Location") {
        guard let next = URL(string: location, relativeTo: current)?.absoluteURL, let safe = LinkPreviewPolicy.safeURL(next.absoluteString) else { throw URLError(.badURL) }
        current = safe
        redirects.append(safe)
        continue
      }
      if !truncate, let declared = Int(http.value(forHTTPHeaderField: "Content-Length") ?? ""), declared > limit { throw URLError(.dataLengthExceedsMaximum) }
      if !truncate && data.count > limit { throw URLError(.dataLengthExceedsMaximum) }
      return Page(status: http.statusCode, contentType: http.value(forHTTPHeaderField: "Content-Type") ?? "", body: data.prefix(limit), finalURL: current, redirects: redirects)
    }
    throw URLError(.unknown)
  }

  /** The host's every address public (3 s to answer); an address written as one is checked as it is. */
  static func resolvesPublicly(_ url: URL) async -> Bool {
    guard let host = url.host.map(LinkPreviewPolicy.normalizedHost) else { return false }
    if LinkPreviewPolicy.isIPAddress(host) { return !LinkPreviewPolicy.isBlockedIP(host) }
    // The lookup blocks its thread; past 3 s the answer is "none", whatever it says later.
    let found = await withCheckedContinuation { (done: CheckedContinuation<[String], Never>) in
      let first = FirstAnswer(done)
      Thread.detachNewThread { first.give(addresses(of: host)) }
      DispatchQueue.global().asyncAfter(deadline: .now() + 3) { first.give([]) }
    }
    return !found.isEmpty && !found.contains(where: LinkPreviewPolicy.isBlockedIP)
  }

  static func addresses(of host: String) -> [String] {
    var hints = addrinfo()
    hints.ai_family = AF_UNSPEC
    #if canImport(Glibc)
    hints.ai_socktype = Int32(SOCK_STREAM.rawValue)
    #else
    hints.ai_socktype = SOCK_STREAM
    #endif
    var list: UnsafeMutablePointer<addrinfo>?
    guard getaddrinfo(host, nil, &hints, &list) == 0, let first = list else { return [] }
    defer { freeaddrinfo(list) }
    var out: [String] = []
    var node: UnsafeMutablePointer<addrinfo>? = first
    while let current = node {
      var buffer = [CChar](repeating: 0, count: Int(NI_MAXHOST))
      if getnameinfo(current.pointee.ai_addr, current.pointee.ai_addrlen, &buffer, socklen_t(buffer.count), nil, 0, NI_NUMERICHOST) == 0 {
        out.append(String(cString: buffer))
      }
      node = current.pointee.ai_next
    }
    return out
  }

  /** A picture for the card: 2xx, one of the picture types, at most 2 MB. */
  static func image(_ address: String) async -> Data? {
    guard let url = LinkPreviewPolicy.safeURL(address),
          let page = try? await fetch(url, limit: LinkPreviewPolicy.imageByteLimit, accept: LinkPreviewPolicy.imageTypes.sorted().joined(separator: ","), truncate: false),
          (200..<300).contains(page.status) else { return nil }
    let type = page.contentType.split(separator: ";").first.map { $0.trimmingCharacters(in: .whitespaces).lowercased() } ?? ""
    guard LinkPreviewPolicy.imageTypes.contains(type), !page.body.isEmpty, page.body.count <= LinkPreviewPolicy.imageByteLimit else { return nil }
    return page.body
  }

  /** At most `maxDimension` on its long side, as JPEG (quality 0.82) or PNG; past 24 million pixels, none. */
  static func bounded(_ data: Data?, maxDimension: Int, jpeg: Bool) -> Data? {
    guard let data else { return nil }
    #if canImport(ImageIO)
    guard let source = CGImageSourceCreateWithData(data as CFData, nil),
          let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
          let width = properties[kCGImagePropertyPixelWidth] as? Int, let height = properties[kCGImagePropertyPixelHeight] as? Int,
          width > 0, height > 0, width * height <= LinkPreviewPolicy.maxPixels else { return nil }
    let options: [CFString: Any] = [
      kCGImageSourceCreateThumbnailFromImageAlways: true,
      kCGImageSourceThumbnailMaxPixelSize: min(maxDimension, max(width, height)),
      kCGImageSourceCreateThumbnailWithTransform: true,
    ]
    guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else { return nil }
    let out = NSMutableData()
    let type = (jpeg ? UTType.jpeg : UTType.png).identifier as CFString
    guard let destination = CGImageDestinationCreateWithData(out, type, 1, nil) else { return nil }
    CGImageDestinationAddImage(destination, image, (jpeg ? [kCGImageDestinationLossyCompressionQuality: 0.82] : [:]) as CFDictionary)
    return CGImageDestinationFinalize(destination) ? out as Data : nil
    #else
    return data
    #endif
  }
}

/** One answer from whichever comes first, the lookup or its deadline. */
private final class FirstAnswer: @unchecked Sendable {
  private let lock = NSLock()
  private var continuation: CheckedContinuation<[String], Never>?

  init(_ continuation: CheckedContinuation<[String], Never>) { self.continuation = continuation }

  func give(_ answer: [String]) {
    lock.lock()
    let waiting = continuation
    continuation = nil
    lock.unlock()
    waiting?.resume(returning: answer)
  }
}
