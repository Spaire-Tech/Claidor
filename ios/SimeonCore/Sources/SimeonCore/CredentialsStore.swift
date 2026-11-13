import Foundation
import Observation

/**
 * The Credentials Store (28 October 2026; the founder, 29 October: "name it
 * Credentials Store"): the logins and the contact info the person keeps
 * for their agents to sign in and sign up with, as the upstream app's own
 * vault keeps them. Simeon Labs' server holds them, sealed for this person
 * (`server/simeon/desktop/credentials.py`), so they are changed here while the
 * agents' computer sleeps. The agents see each login and the contact info,
 * and type them in. Cards (9 November 2026, the founder: "actual cards
 * there that the agent can use to make payments"): the agents see a card's
 * brand, last four digits and expiry; the computer types the rest into a
 * checkout the person approved. Shared by the iPhone
 * (ios/Simeon/CredentialsStore.swift) and the Mac
 * (mac/Simeon/SettingsCredentials.swift).
 */
public struct StoredCredential: Equatable, Identifiable, Sendable {
  public enum Kind: String, Sendable { case login, contact, card }

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
  /** A card's name on the card. */
  public var cardholder: String
  /** A card's network, as the server read it from the number (`visa`, `mastercard`, `amex`…). */
  public var brand: String
  public var last4: String
  /** "08/28". */
  public var expiry: String
  public var hasSecurityCode: Bool
  /** The contact info whose address bills the card, when one was chosen. */
  public var billingId: String

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
    cardholder = text("cardholder")
    brand = text("brand")
    last4 = text("last4")
    expiry = text("expiry")
    hasSecurityCode = json["hasSecurityCode"]?.bool ?? false
    billingId = text("billingId")
  }

  /** The row's name: the person's own for it, else the site (a login) or the name on it (contact info). */
  public var title: String {
    let own = name.trimmingCharacters(in: .whitespaces)
    if !own.isEmpty { return own }
    switch kind {
    case .login: return site.isEmpty ? website : site
    case .contact: return [fullName, email, phone].first { !$0.isEmpty } ?? L10n.text("Contact info")
    case .card: return CardNumber.brandName(brand) ?? L10n.text("Card")
    }
  }

  /** The line under it: the username; the first of the email, the phone and the city; a card's "•••• 4242 · 08/28". */
  public var subtitle: String {
    switch kind {
    case .login: return username
    case .contact: return [email, phone, city].first { !$0.isEmpty } ?? ""
    case .card: return ["•••• \(last4)", expiry].filter { !$0.isEmpty && $0 != "•••• " }.joined(separator: " · ")
    }
  }

  /** A contact's address on one line, as a card's billing address is chosen by it. */
  public var addressLine: String {
    [addressLine1, city, postalCode, country].filter { !$0.isEmpty }.joined(separator: ", ")
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

/** A card's number as the person types it: its network, its check digit, its groups of four. */
public enum CardNumber {
  /** The digits alone, spaces and dashes gone. */
  public static func digits(_ text: String) -> String { text.filter { $0.isASCII && $0.isNumber } }

  /** The network from the first digits, as the server reads it (`card_brand`): `visa`, `mastercard`, `amex`, `discover`, `jcb`, `diners`, `unionpay`, or empty. */
  public static func brand(_ text: String) -> String {
    let number = digits(text)
    func prefix(_ count: Int) -> Int { Int(number.prefix(count)) ?? -1 }
    if number.hasPrefix("4") { return "visa" }
    if (51...55).contains(prefix(2)) || (2221...2720).contains(prefix(4)) { return "mastercard" }
    if [34, 37].contains(prefix(2)) { return "amex" }
    if number.hasPrefix("6011") || number.hasPrefix("65") || (644...649).contains(prefix(3)) { return "discover" }
    if (3528...3589).contains(prefix(4)) { return "jcb" }
    if [36, 38].contains(prefix(2)) || (300...305).contains(prefix(3)) { return "diners" }
    if number.hasPrefix("62") { return "unionpay" }
    return ""
  }

  /** The network's name as people know it. */
  public static func brandName(_ brand: String) -> String? {
    switch brand {
    case "visa": return "Visa"
    case "mastercard": return "Mastercard"
    case "amex": return "American Express"
    case "discover": return "Discover"
    case "jcb": return "JCB"
    case "diners": return "Diners Club"
    case "unionpay": return "UnionPay"
    default: return nil
    }
  }

  /** 12 to 19 digits that pass the check every card number passes (Luhn). */
  public static func isValid(_ text: String) -> Bool {
    let number = digits(text)
    guard (12...19).contains(number.count), digits(text).count == text.filter({ !$0.isWhitespace && $0 != "-" }).count else { return false }
    var total = 0
    for (index, character) in number.reversed().enumerated() {
      var value = Int(String(character)) ?? 0
      if index % 2 == 1 { value = value > 4 ? value * 2 - 9 : value * 2 }
      total += value
    }
    return total % 10 == 0
  }

  /** "08/28" from "8/28", "08/2028" or "0828"; nil when it isn't a month and a year. */
  public static func expiry(_ text: String) -> String? {
    var value = text.trimmingCharacters(in: .whitespaces)
    if value.count == 4, value.allSatisfy(\.isNumber) { value = "\(value.prefix(2))/\(value.suffix(2))" }
    let parts = value.split(separator: "/", omittingEmptySubsequences: false).map { $0.trimmingCharacters(in: .whitespaces) }
    guard parts.count == 2, let month = Int(parts[0]), (1...12).contains(month), parts[0].count <= 2,
          parts[1].allSatisfy(\.isNumber), parts[1].count == 2 || parts[1].count == 4 else { return nil }
    return String(format: "%02d/%@", month, String(parts[1].suffix(2)))
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
  public var cardholder = ""
  /** A card's number as typed; empty for a saved card until it is read or typed again. */
  public var number = ""
  public var expiry = ""
  public var securityCode = ""
  public var billingId = ""
  /** A saved card's number stays as it is unless another is typed. */
  public var hasSavedNumber = false

  public init(kind: StoredCredential.Kind) { self.kind = kind }

  /** The fields only the whole entry gives (read after Face ID or Touch ID), sent only when changed. */
  public static let secrets: Set<String> = ["password", "number", "securityCode"]

  /** An entry as saved, its password (and a card's number and code) as read (empty when they weren't). */
  public init(_ entry: StoredCredential, password: String = "", number: String = "", securityCode: String = "") {
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
    cardholder = entry.cardholder
    self.number = number
    expiry = entry.expiry
    self.securityCode = securityCode
    billingId = entry.billingId
    hasSavedNumber = entry.kind == .card
  }

  /** The fields of its kind, as the server names them. */
  public var fields: [(key: String, value: String)] {
    switch kind {
    case .login:
      return [("name", name), ("website", website), ("username", username), ("password", password), ("hints", hints)]
    case .contact:
      return [("name", name), ("fullName", fullName), ("email", email), ("phone", phone), ("addressLine1", addressLine1), ("addressLine2", addressLine2),
              ("city", city), ("region", region), ("postalCode", postalCode), ("country", country), ("hints", hints)]
    case .card:
      return [("name", name), ("cardholder", cardholder), ("number", number), ("expiry", expiry), ("securityCode", securityCode), ("billingId", billingId), ("hints", hints)]
    }
  }

  private func trimmed(_ text: String) -> String { text.trimmingCharacters(in: .whitespacesAndNewlines) }

  /** Whether anything is written yet (Save stays off until then); a contact's country, chosen for the person, is nothing written. */
  public var isEmpty: Bool { fields.allSatisfy { trimmed($0.value).isEmpty || (kind == .contact && $0.key == "country") } }

  /** The first thing to fix before it is saved, as the server would refuse it; nil when it can be. */
  public var problem: String? {
    switch kind {
    case .login:
      if !trimmed(website).isEmpty && CredentialSite.site(website).isEmpty { return L10n.text("Write the website like acme.com.") }
      if trimmed(website).isEmpty && trimmed(name).isEmpty { return L10n.text("Add the website.") }
      if trimmed(username).isEmpty && password.isEmpty { return L10n.text("Add the username or the password.") }
    case .contact:
      let details = fields.filter { !["name", "hints", "country"].contains($0.key) }
      if details.allSatisfy({ trimmed($0.value).isEmpty }) { return L10n.text("Add at least one detail.") }
      let mail = trimmed(email)
      if !mail.isEmpty && !Self.looksLikeEmail(mail) { return L10n.text("Check the email.") }
    case .card:
      if !(hasSavedNumber && trimmed(number).isEmpty) && !CardNumber.isValid(number) { return L10n.text("Check the card number.") }
      if CardNumber.expiry(expiry) == nil { return L10n.text("Write the expiry like 08/28.") }
      if CardNumber.isExpired(expiry) { return L10n.text("This card has expired.") }
      let code = trimmed(securityCode)
      if !code.isEmpty && !(code.allSatisfy(\.isNumber) && (3...4).contains(code.count)) { return L10n.text("The security code is 3 or 4 digits.") }
    }
    return nil
  }

  /** One @, something before it, a dot in what follows, no spaces: name@example.com. */
  static func looksLikeEmail(_ text: String) -> Bool {
    let parts = text.split(separator: "@", omittingEmptySubsequences: false)
    guard parts.count == 2, !parts[0].isEmpty, !text.contains(where: \.isWhitespace) else { return false }
    let domain = parts[1]
    return domain.contains(".") && !domain.hasPrefix(".") && !domain.hasSuffix(".")
  }

  /** A new entry's body: every field of its kind. */
  public var body: JSON {
    var object: [String: JSON] = ["kind": .string(kind.rawValue)]
    for (key, value) in fields { object[key] = .string(key == "password" ? value : key == "expiry" ? CardNumber.expiry(value) ?? trimmed(value) : trimmed(value)) }
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
      if Self.secrets.contains(key) {
        let was = before[key] ?? ""
        if passwordRead ? value != was : !value.isEmpty { object[key] = .string(key == "password" ? value : trimmed(value)) }
        continue
      }
      let shown = key == "expiry" ? CardNumber.expiry(value) ?? trimmed(value) : trimmed(value)
      if trimmed(value) != trimmed(before[key] ?? "") { object[key] = .string(shown) }
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
  public var cards: [StoredCredential] { entries.filter { $0.kind == .card } }

  private static func order(_ kind: StoredCredential.Kind) -> Int {
    switch kind {
    case .login: 0
    case .card: 1
    case .contact: 2
    }
  }

  private func sorted(_ list: [StoredCredential]) -> [StoredCredential] {
    list.sorted { (Self.order($0.kind), $0.title.lowercased()) < (Self.order($1.kind), $1.title.lowercased()) }
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

  /** A card's number and security code, for the editor (after Face ID or Touch ID). */
  public func cardSecrets(of entry: StoredCredential) async throws -> (number: String, securityCode: String) {
    let answer = try await call("credentials/\(entry.id)", nil, nil)
    return (answer["entry"]?["number"]?.string ?? "", answer["entry"]?["securityCode"]?.string ?? "")
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
 * The Credentials Store's card in the chat (9 November 2026, `store-entry`,
 * the engine's `credentials-store/store-cards.ts`), drawn as the connector
 * card (10 November 2026, the founder: "Can you respect our design"): its
 * icon, its name, one line, and at its right Save (a login) or Add, which
 * opens the store's form already filled with what the agent knows; once
 * saved, "Saved" in green and the agent carries on (`answerStoreEntry`).
 * The notes (`used`, `saved`): a saved login the agent signed in with, or
 * one it saved at a sign-up, said once.
 */
public struct StoreEntryCard: Hashable, Sendable {
  public enum Mode: String, Sendable { case request, used, saved }
  public enum State: String, Sendable { case open, saved, dismissed }

  public let mode: Mode
  public let kind: StoredCredential.Kind
  /** What it's for: "Amazon", "Home", a card's name. */
  public let title: String
  /** A login's site ("amazon.com"). */
  public let website: String?
  public let reason: String?
  public let state: State

  public init(mode: Mode, kind: StoredCredential.Kind, title: String, website: String? = nil, reason: String? = nil, state: State = .open) {
    self.mode = mode; self.kind = kind; self.title = title; self.website = website; self.reason = reason; self.state = state
  }

  init?(message: JSON, entry: Entry?) {
    let store = message["store"]
    func text(_ value: JSON?) -> String? {
      let value = value?.text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
      return value.isEmpty ? nil : value
    }
    guard let mode = text(store?["mode"]).flatMap(Mode.init(rawValue:)), let kind = text(store?["kind"]).flatMap(StoredCredential.Kind.init(rawValue:)), let title = text(store?["title"]) else { return nil }
    self.init(mode: mode, kind: kind, title: title, website: text(store?["website"]), reason: text(store?["reason"]), state: text(entry?["storeState"]).flatMap(State.init(rawValue:)) ?? .open)
  }

  /** The line under its name, as the connector card's reason: why the agent asks, else the site or what it is; a note says what was done. */
  public var line: String? {
    switch mode {
    case .used: return L10n.text("Signed in with your saved login")
    case .saved: return website
    case .request:
      if let reason { return reason }
      switch kind {
      case .login: return website
      case .card: return L10n.text("Card")
      case .contact: return L10n.text("Contact info")
      }
    }
  }

  /** Waiting on the person: Save (a login) or Add at its right. */
  public var asks: Bool { mode == .request && state == .open }

  /** Saved: "Saved" in green at its right, as "Connected" on the connector card. */
  public var isSaved: Bool { mode == .saved || state == .saved }

  /** A login's site icon. */
  public var iconSite: String? { kind == .login ? website.map(CredentialSite.site).flatMap { $0.isEmpty ? nil : $0 } : nil }

  /** The store's form the button opens, already filled with what the agent knows. */
  public var draft: CredentialDraft {
    var draft = CredentialDraft(kind: kind)
    switch kind {
    case .login:
      draft.website = website ?? ""
      if CredentialSite.site(title) != CredentialSite.site(draft.website) { draft.name = title }
    case .card, .contact:
      draft.name = title
    }
    return draft
  }
}

/**
 * A saved login's icon: the site's own, read on this device from the site
 * itself, never a favicon service (a person's sites stay between them and
 * those sites). Every icon the site's page names is tried, its touch icons
 * first (sharp at a row's size), then /favicon.ico, and the first that is a
 * picture by its own bytes is kept, on disk a week. None, and the row shows
 * the site's first letter.
 *
 * "None" is kept a day, and only when the site answered every request: a
 * read that had no answer (no connection, a name not found, a site too slow
 * or busy) is asked again five minutes later, and nothing of it is written.
 * Before 13 November 2026 any failed read was kept as "none" for a week, the
 * first of several reasons some logins had no icon on the Mac and the iPhone
 * (the founder: "they dont all appear. some do others dont. in windows they
 * all appear"); the others are in `LinkMetadataReader.icon`,
 * `LinkPreviewPolicy.iconHrefs` and `embeddedIPv4`. The folder was renamed
 * then, so what the earlier rules kept as "none" is asked again.
 *
 * A site left without one writes a line in the app's recent activity
 * (`RecentActivity`) with the reason and never the site's name.
 */
public actor SiteIcons {
  public static let shared = SiteIcons()

  /** The site's page, when its icons were asked of it. */
  enum PageAnswer: Sendable {
    case page(html: String, finalURL: URL)
    /** The site answered without a page to read (a refusal, a missing page). */
    case none
    /** No answer to judge by. */
    case unreachable
  }

  /** How a site is read: the network's (`live`), or a test's. */
  struct Source: Sendable {
    var page: @Sendable (_ site: String) async -> PageAnswer
    var icon: @Sendable (_ address: String) async -> LinkMetadataReader.IconAnswer
    /** The picture as the row draws it (PNG, at most 128 on its long side); nil when this device can't draw it. */
    var draw: @Sendable (_ data: Data) -> Data?

    static let live = Source(
      page: { site in
        guard let home = LinkPreviewPolicy.safeURL("https://\(site)/") else { return .none }
        // A sign-in page a redirect lands on still has the site's icons: only the head is read.
        guard let page = try? await LinkMetadataReader.fetch(home, limit: LinkPreviewPolicy.htmlByteLimit, accept: "text/html,application/xhtml+xml", truncate: true) else { return .unreachable }
        if page.status == 429 || page.status >= 500 { return .unreachable }
        guard (200..<300).contains(page.status) else { return .none }
        return .page(html: String(decoding: page.body, as: UTF8.self), finalURL: page.finalURL)
      },
      icon: { await LinkMetadataReader.icon($0) },
      draw: { LinkMetadataReader.bounded($0, maxDimension: LinkPreviewPolicy.iconMaxDimension, jpeg: false) })
  }

  /** What was read for a site, when, and how long it holds. */
  private struct Answer {
    let data: Data?
    let at: Date
    let life: Double
  }

  private var answered: [String: Answer] = [:]
  private var reading: [String: Task<Data?, Never>] = [:]
  private let cacheDir: URL?
  /** The folder the earlier rules kept their answers in, taken away once. */
  private var retired: URL?
  private let source: Source
  private let now: @Sendable () -> Date
  /** An icon is kept a week. */
  static let cacheTTL: Double = 7 * 24 * 60 * 60
  /** "None" is kept a day: a site gains an icon, and a refusal passes. */
  static let noneTTL: Double = 24 * 60 * 60
  /** A read that had no answer is tried again after five minutes. */
  static let retryAfter: Double = 5 * 60
  static let folderName = "site-icons-2"

  public init() {
    let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first
    cacheDir = caches?.appendingPathComponent(Self.folderName, isDirectory: true)
    retired = caches?.appendingPathComponent("site-icons", isDirectory: true)
    source = .live
    now = { Date() }
  }

  init(cacheDir: URL?, source: Source, now: @escaping @Sendable () -> Date = { Date() }) {
    self.cacheDir = cacheDir
    self.source = source
    self.now = now
  }

  /** What was read for the site before, when it was. */
  public func known(_ site: String) -> Data?? { answered[site].map(\.data) }

  public func icon(for site: String) async -> Data? {
    let key = CredentialSite.site(site)
    guard !key.isEmpty else { return nil }
    if let done = answered[key], now().timeIntervalSince(done.at) < done.life { return done.data }
    if let running = reading[key] { return await running.value }
    let task = Task { await self.read(key) }
    reading[key] = task
    let result = await task.value
    reading[key] = nil
    return result
  }

  private func cacheFile(_ site: String) -> URL? { cacheDir?.appendingPathComponent(LinkMetadataReader.digest(site) + ".png") }

  /** What is kept on disk for the site and still holds: its icon, or "none" (nil data). */
  private func kept(_ site: String) -> Answer? {
    guard let file = cacheFile(site), let attributes = try? FileManager.default.attributesOfItem(atPath: file.path),
          let modified = attributes[.modificationDate] as? Date, let data = try? Data(contentsOf: file) else { return nil }
    let life = data.isEmpty ? Self.noneTTL : Self.cacheTTL
    guard now().timeIntervalSince(modified) < life else { return nil }
    return Answer(data: data.isEmpty ? nil : data, at: modified, life: life)
  }

  private func keep(_ data: Data, for site: String) {
    guard let dir = cacheDir, let file = cacheFile(site) else { return }
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    try? data.write(to: file, options: .atomic)
  }

  private func read(_ site: String) async -> Data? {
    if let old = retired {
      retired = nil
      try? FileManager.default.removeItem(at: old)
    }
    if let kept = kept(site) {
      answered[site] = kept
      return kept.data
    }
    // Whether every request was answered: only then is "none" the site's own answer.
    var unanswered = false
    var whys: [String] = []
    var candidates: [String] = []
    switch await source.page(site) {
    case .page(let html, let finalURL):
      for href in LinkPreviewPolicy.iconHrefs(html) {
        if let absolute = LinkPreviewPolicy.absolute(href, finalURL) { candidates.append(absolute) }
      }
      if let host = finalURL.host { candidates.append("https://\(host)/favicon.ico") }
    case .none:
      whys.append("no page")
    case .unreachable:
      unanswered = true
    }
    candidates.append("https://\(site)/favicon.ico")
    var found: Data?
    var asked = Set<String>()
    for address in candidates where asked.insert(address).inserted {
      switch await source.icon(address) {
      case .picture(let data):
        if let icon = source.draw(data) { found = icon } else { whys.append("not drawn") }
      case .none(let why):
        whys.append(why)
      case .unreachable:
        unanswered = true
      }
      if found != nil { break }
    }
    let at = now()
    if let found {
      keep(found, for: site)
      answered[site] = Answer(data: found, at: at, life: Self.cacheTTL)
    } else if unanswered {
      // Nothing is written: asked again in five minutes, by whichever row shows it then.
      answered[site] = Answer(data: nil, at: at, life: Self.retryAfter)
      RecentActivity.note("site icon: none for now, a request had no answer (\(whys.joined(separator: ", ")))")
    } else {
      keep(Data(), for: site)
      answered[site] = Answer(data: nil, at: at, life: Self.noneTTL)
      RecentActivity.note("site icon: none (\(whys.joined(separator: ", ")))")
    }
    return found
  }
}
