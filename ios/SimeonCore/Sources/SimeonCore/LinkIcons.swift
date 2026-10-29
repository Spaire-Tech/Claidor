import Foundation
import Observation

/**
 * The site's icon before each link in a message, the link still in its blue
 * (the founder, 29 October 2026: "for each link sent in chat, put next to it
 * the favicon … but the link stays blue"): the site's own icon, the one the
 * Credentials Store shows (`SiteIcons`: read from the site itself, never a
 * favicon service), asked for once per site while the app runs. A link to an
 * email's page (Gmail's, Outlook's on the web) has none (22 October 2026:
 * "remove that gmail logo"), nor a link to no website (mailto:, the app's
 * own). The words are drawn again when an icon comes (`generation`).
 */
@MainActor
@Observable
public final class LinkIcons {
  public static let shared = LinkIcons()

  /** Each site's icon once read; nil when it has none. */
  private var icons: [String: Data?] = [:]
  /** Moves on each time an icon comes: words with a link read it, so they are drawn again with their icons. */
  public private(set) var generation = 0
  @ObservationIgnored private var asked: Set<String> = []
  @ObservationIgnored private let source: @Sendable (String) async -> Data?

  public init(source: @escaping @Sendable (String) async -> Data? = { await SiteIcons.shared.icon(for: $0) }) {
    self.source = source
  }

  /** A link's site and its icon, once read; nil until then (and it is asked for), or when the link gets none. */
  public func icon(for url: URL) -> (site: String, data: Data)? {
    guard let site = Self.site(of: url) else { return nil }
    if let known = icons[site] { return known.map { (site, $0) } }
    if !asked.contains(site) {
      asked.insert(site)
      Task { [source] in
        let data = await source(site)
        self.icons[site] = .some(data)
        if data != nil { self.generation += 1 }
      }
    }
    return nil
  }

  /** The website a link goes to (`CredentialSite.site`: its host, without "www."); nil for an email's page or no website. */
  public nonisolated static func site(of url: URL) -> String? {
    guard let scheme = url.scheme?.lowercased(), scheme == "https" || scheme == "http",
          let host = url.host?.lowercased(), !isEmail(host) else { return nil }
    let site = CredentialSite.site(host)
    return site.isEmpty ? nil : site
  }

  /** Gmail's and Outlook's pages on the web, where a link to an email goes. */
  nonisolated static func isEmail(_ host: String) -> Bool {
    host == "mail.google.com" || host == "inbox.google.com"
      || (host.hasPrefix("outlook.") && (host.hasSuffix(".office.com") || host.hasSuffix(".live.com") || host.hasSuffix(".office365.com")))
  }
}
