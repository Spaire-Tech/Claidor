import Foundation
import Observation

/**
 * The Secure Credentials Store (28 October 2026, the founder: "Let's call it
 * Secure Credentials Store"): the logins and the contact info the person keeps
 * for their agents to sign in and sign up with, as the upstream app's own
 * vault keeps them. Simeon Labs' server holds them, sealed for this person
 * (`server/simeon/desktop/credentials.py`), so they are changed here while the
 * agents' computer sleeps. The agents see each login and the contact info,
 * and type them in; cards stay with Link (Wallet). Shared by the iPhone
 * (ios/Simeon/CredentialsStore.swift) and the Mac
 * (mac/Simeon/SettingsCredentials.swift).
 */
public struct StoredCredential: Equatable, Identifiable, Sendable {
  public enum Kind: String, Sendable { case login, contact }

  public let id: String
  public let kind: Kind
  public var name: String
  public var website: String
  /** "acme.com", from the website; empty when it has none. */
  public var site: String
  public var username: String
  public var hasPassword: Bool
  public var hints: String
  /** The agent that saved it at a sign-up, when one did. */
  public var savedBy: String?
  public var fullName: String
  public var email: String
  public var phone: String
  public var addressLine1: String
  public var addressLine2: String
  public var city: String
  public var region: String
  public var postalCode: String
  public var country: String

  public init?(json: JSON?) {
    guard let json, let id = json["id"]?.text, let kind = json["kind"]?.string.flatMap(Kind.init(rawValue:)) else { return nil }
    func text(_ key: String) -> String { json[key]?.string ?? "" }
    self.id = id
    self.kind = kind
    name = text("name")
    website = text("website")
    site = json["site"]?.text ?? CredentialSite.site(website)
    username = text("username")
    hasPassword = json["hasPassword"]?.bool ?? false
    hints = text("hints")
    savedBy = json["savedBy"]?.text
    fullName = text("fullName")
    email = text("email")
    phone = text("phone")
    addressLine1 = text("addressLine1")
    addressLine2 = text("addressLine2")
    city = text("city")
    region = text("region")
    postalCode = text("postalCode")
    country = text("country")
  }

  /** The row's name: the person's own for it, else the site (a login) or the name on it (contact info). */
  public var title: String {
    let own = name.trimmingCharacters(in: .whitespaces)
    if !own.isEmpty { return own }
    switch kind {
    case .login: return site.isEmpty ? website : site
    case .contact: return [fullName, email, phone].first { !$0.isEmpty } ?? L10n.text("Contact info")
    }
  }

  /** The line under it: the username, or the first of the email, the phone and the city. */
  public var subtitle: String {
    switch kind {
    case .login: return username
    case .contact: return [email, phone, city].first { !$0.isEmpty } ?? ""
    }
  }

  /** The address its icon is read from (the site's own page), for a login with a site. */
  public var iconSite: String? { kind == .login && !site.isEmpty ? site : nil }
}

/** Where a login is for, as the server and the engine read it (`site_of`, `siteOf`). */
public enum CredentialSite {
  /** "acme.com" from an address or a domain, without "www."; empty when it names no site. */
  public static func site(_ value: String) -> String {
    let text = value.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !text.isEmpty, !text.contains(where: \.isWhitespace),
          let host = URLComponents(string: text.contains("://") ? text : "https://\(text)")?.host else { return "" }
    var name = host.lowercased()
    while name.hasSuffix(".") { name.removeLast() }
    if name.hasPrefix("www.") { name.removeFirst(4) }
    return name.contains(".") ? name : ""
  }
}

/** What the editor holds while it is open: every field as typed. */
public struct CredentialDraft: Equatable, Sendable {
  public var kind: StoredCredential.Kind
  public var name = ""
  public var website = ""
  public var username = ""
  public var password = ""
  public var hints = ""
  public var fullName = ""
  public var email = ""
  public var phone = ""
  public var addressLine1 = ""
  public var addressLine2 = ""
  public var city = ""
  public var region = ""
  public var postalCode = ""
  public var country = ""

  public init(kind: StoredCredential.Kind) { self.kind = kind }

  /** An entry as saved, its password as read (empty when it wasn't). */
  public init(_ entry: StoredCredential, password: String = "") {
    kind = entry.kind
    name = entry.name
    website = entry.website
    username = entry.username
    self.password = password
    hints = entry.hints
    fullName = entry.fullName
    email = entry.email
    phone = entry.phone
    addressLine1 = entry.addressLine1
    addressLine2 = entry.addressLine2
    city = entry.city
    region = entry.region
    postalCode = entry.postalCode
    country = entry.country
  }

  /** The fields of its kind, as the server names them. */
  public var fields: [(key: String, value: String)] {
    switch kind {
    case .login:
      return [("name", name), ("website", website), ("username", username), ("password", password), ("hints", hints)]
    case .contact:
      return [("name", name), ("fullName", fullName), ("email", email), ("phone", phone), ("addressLine1", addressLine1), ("addressLine2", addressLine2),
              ("city", city), ("region", region), ("postalCode", postalCode), ("country", country), ("hints", hints)]
    }
  }

  private func trimmed(_ text: String) -> String { text.trimmingCharacters(in: .whitespacesAndNewlines) }

  /** Whether anything is written yet (Save stays off until then). */
  public var isEmpty: Bool { fields.allSatisfy { trimmed($0.value).isEmpty } }

  /** The first thing to fix before it is saved, as the server would refuse it; nil when it can be. */
  public var problem: String? {
    switch kind {
    case .login:
      if !trimmed(website).isEmpty && CredentialSite.site(website).isEmpty { return L10n.text("Write the website like acme.com.") }
      if trimmed(website).isEmpty && trimmed(name).isEmpty { return L10n.text("Add the website.") }
      if trimmed(username).isEmpty && password.isEmpty { return L10n.text("Add the username or the password.") }
    case .contact:
      let details = fields.filter { $0.key != "name" && $0.key != "hints" }
      if details.allSatisfy({ trimmed($0.value).isEmpty }) { return L10n.text("Add at least one detail.") }
    }
    return nil
  }

  /** A new entry's body: every field of its kind. */
  public var body: JSON {
    var object: [String: JSON] = ["kind": .string(kind.rawValue)]
    for (key, value) in fields { object[key] = .string(key == "password" ? value : trimmed(value)) }
    return .object(object)
  }

  /**
   * A change's body: only what differs from the entry as it was opened. A
   * password not read (`passwordRead` false) is sent only when one was typed,
   * so an entry opened without Face ID keeps its own.
   */
  public func changes(from original: CredentialDraft, passwordRead: Bool) -> JSON {
    var object: [String: JSON] = [:]
    let before = Dictionary(original.fields.map { ($0.key, $0.value) }, uniquingKeysWith: { first, _ in first })
    for (key, value) in fields {
      if key == "password" {
        if passwordRead ? value != original.password : !value.isEmpty { object[key] = .string(value) }
        continue
      }
      if trimmed(value) != trimmed(before[key] ?? "") { object[key] = .string(trimmed(value)) }
    }
    return .object(object)
  }
}

/**
 * The Store's page, the same on the iPhone and the Mac: the entries as the
 * server lists them (no password), read when the page opens; a login's
 * password read only when asked for (after Face ID or Touch ID); a save, a
 * change and a delete each said to the server and reflected at once.
 */
@MainActor
@Observable
public final class CredentialsStoreModel {
  public typealias Call = @MainActor (String, String?, JSON?) async throws -> JSON

  public private(set) var entries: [StoredCredential] = []
  public private(set) var loaded = false
  public private(set) var loading = false
  /** What went wrong, in the person's words; the page shows it. */
  public var problem: String?

  @ObservationIgnored private let call: Call

  public init(call: @escaping Call) { self.call = call }

  public convenience init(store: AppStore) {
    self.init { [weak store] path, method, body in
      guard let backend = store?.backend else { throw SimeonAPIError(message: L10n.text("Sign in to Simeon first."), status: 401) }
      return try await backend.server(path, method: method, body: body)
    }
  }

  public var logins: [StoredCredential] { entries.filter { $0.kind == .login } }
  public var contacts: [StoredCredential] { entries.filter { $0.kind == .contact } }

  private func sorted(_ list: [StoredCredential]) -> [StoredCredential] {
    list.sorted { ($0.kind == .login ? 0 : 1, $0.title.lowercased()) < ($1.kind == .login ? 0 : 1, $1.title.lowercased()) }
  }

  public func load() async {
    guard !loading else { return }
    loading = true
    defer { loading = false }
    do {
      let answer = try await call("credentials", nil, nil)
      entries = sorted((answer["entries"]?.array ?? []).compactMap(StoredCredential.init(json:)))
      loaded = true
      problem = nil
    } catch {
      problem = error.localizedDescription
    }
  }

  /** A login's password, for the editor (after Face ID or Touch ID). */
  public func password(of entry: StoredCredential) async throws -> String {
    let answer = try await call("credentials/\(entry.id)", nil, nil)
    return answer["entry"]?["password"]?.string ?? ""
  }

  /** A new entry, or a change to `editing`; the entry as saved, or nil (and `problem`) when it couldn't be. */
  @discardableResult
  public func save(_ draft: CredentialDraft, editing: (entry: StoredCredential, opened: CredentialDraft, passwordRead: Bool)? = nil) async -> StoredCredential? {
    if let problem = draft.problem { self.problem = problem; return nil }
    do {
      let answer: JSON
      if let editing {
        answer = try await call("credentials/\(editing.entry.id)", "PATCH", draft.changes(from: editing.opened, passwordRead: editing.passwordRead))
      } else {
        answer = try await call("credentials", "POST", draft.body)
      }
      guard let saved = StoredCredential(json: answer["entry"]) else { throw SimeonAPIError(message: L10n.text("That didn't work."), status: 0) }
      entries = sorted(entries.filter { $0.id != saved.id } + [saved])
      problem = nil
      return saved
    } catch {
      problem = error.localizedDescription
      return nil
    }
  }

  public func delete(_ entry: StoredCredential) async -> Bool {
    do {
      _ = try await call("credentials/\(entry.id)", "DELETE", nil)
      entries.removeAll { $0.id == entry.id }
      problem = nil
      return true
    } catch {
      problem = error.localizedDescription
      return false
    }
  }
}

/**
 * A saved login's icon: the site's own, read on this device from the site
 * itself, never a favicon service (a person's sites stay between them and
 * those sites). The site's touch icon first (sharp at a row's size), then its
 * icon, then /favicon.ico; kept on disk a week, once per site while the app
 * runs. None, and the row shows the site's first letter.
 */
public actor SiteIcons {
  public static let shared = SiteIcons()

  private var answered: [String: Data?] = [:]
  private var reading: [String: Task<Data?, Never>] = [:]
  private let cacheDir: URL?
  static let cacheTTL: Double = 7 * 24 * 60 * 60

  public init(cacheDir: URL? = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first?.appendingPathComponent("site-icons", isDirectory: true)) {
    self.cacheDir = cacheDir
  }

  /** What was read for the site before, when it was. */
  public func known(_ site: String) -> Data?? { answered[site] }

  public func icon(for site: String) async -> Data? {
    let key = CredentialSite.site(site)
    guard !key.isEmpty else { return nil }
    if let done = answered[key] { return done }
    if let running = reading[key] { return await running.value }
    let task = Task { await self.read(key) }
    reading[key] = task
    let result = await task.value
    reading[key] = nil
    answered[key] = result
    return result
  }

  private func cacheFile(_ site: String) -> URL? { cacheDir?.appendingPathComponent(LinkMetadataReader.digest(site) + ".png") }

  private func read(_ site: String) async -> Data? {
    if let file = cacheFile(site), let attributes = try? FileManager.default.attributesOfItem(atPath: file.path),
       let modified = attributes[.modificationDate] as? Date, Date().timeIntervalSince(modified) < Self.cacheTTL,
       let data = try? Data(contentsOf: file) {
      return data.isEmpty ? nil : data
    }
    guard let home = LinkPreviewPolicy.safeURL("https://\(site)/") else { return nil }
    var candidates: [String] = []
    // A sign-in page a redirect lands on still has the site's icons: only the head is read.
    if let page = try? await LinkMetadataReader.fetch(home, limit: LinkPreviewPolicy.htmlByteLimit, accept: "text/html,application/xhtml+xml", truncate: true),
       (200..<300).contains(page.status) {
      let html = String(decoding: page.body, as: UTF8.self)
      for rels in [["apple-touch-icon", "apple-touch-icon-precomposed"], ["icon", "shortcut"]] {
        if let href = LinkPreviewPolicy.linkHref(html, rels), let absolute = LinkPreviewPolicy.absolute(href, page.finalURL) { candidates.append(absolute) }
      }
      if let host = page.finalURL.host { candidates.append("https://\(host)/favicon.ico") }
    }
    candidates.append("https://\(site)/favicon.ico")
    var found: Data?
    for address in candidates {
      if let data = await LinkMetadataReader.image(address), let icon = LinkMetadataReader.bounded(data, maxDimension: LinkPreviewPolicy.iconMaxDimension, jpeg: false) {
        found = icon
        break
      }
    }
    if let dir = cacheDir, let file = cacheFile(site) {
      try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
      // None is kept too (empty), so a site without an icon isn't asked again for a week.
      try? (found ?? Data()).write(to: file, options: .atomic)
    }
    return found
  }
}
