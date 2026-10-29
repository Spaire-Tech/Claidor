import Foundation

/**
 * One account of an app Simeon Labs' server serves (Gmail, Slack, …):
 * Add Another Account (29 October 2026). The server keeps each app's
 * accounts (`server/simeon/desktop/apps.py`), names each by the person's own
 * name for it (the pencil) or by who it signs in as (Gmail's address), and,
 * once there are several, has each of the app's tools ask which one
 * (`use_account`); the agent asks the person when they haven't said.
 */
public struct AppAccount: Identifiable, Equatable, Sendable {
  public let id: String
  /** The person's own name for it ("Work"). */
  public let name: String?
  /** Who it signs in as, as the app says (an address, a workspace), when it says. */
  public let identity: String?
  /** What the agent calls it. */
  public let label: String

  public init(id: String, name: String?, identity: String?, label: String) {
    self.id = id; self.name = name; self.identity = identity; self.label = label
  }

  init?(json: JSON) {
    guard let id = json["id"]?.text, !id.isEmpty else { return nil }
    self.init(id: id, name: json["name"]?.text, identity: json["identity"]?.text, label: json["label"]?.text ?? id)
  }

  /** Its row's title: the person's name for it, else who it signs in as, else its place ("Account 2"). */
  public func title(place: Int) -> String { name ?? identity ?? L10n.text("Account \(place)") }

  /** Under a name the person gave it: who it signs in as. */
  public var detail: String? { name == nil ? nil : identity }
}

/** An app's accounts as the server last listed them, and how many it may have. */
public struct AppAccounts: Equatable, Sendable {
  public var accounts: [AppAccount]
  public var max: Int

  public init(accounts: [AppAccount], max: Int) {
    self.accounts = accounts; self.max = max
  }

  init?(json: JSON) {
    guard let list = json["accounts"]?.array else { return nil }
    self.init(accounts: list.compactMap(AppAccount.init(json:)), max: json["max"]?.int ?? 5)
  }

  /** Add Another Account shows while there is room for one more. */
  public var canAddAnother: Bool { !accounts.isEmpty && accounts.count < max }

  /** The toolkit of an app Simeon's server serves, from its address (`…/desktop/api/apps/mcp/gmail`); nil for any other server. */
  public static func toolkit(serverURL: String?) -> String? {
    guard let serverURL, let path = URLComponents(string: serverURL)?.path,
          let range = path.range(of: "/desktop/api/apps/mcp/") else { return nil }
    let toolkit = String(path[range.upperBound...]).split(separator: "/").first.map(String.init) ?? ""
    let allowed = Set("abcdefghijklmnopqrstuvwxyz0123456789_")
    return !toolkit.isEmpty && toolkit.count <= 64 && toolkit.allSatisfy(allowed.contains) ? toolkit : nil
  }
}

extension AppStore {
  /** The toolkit of an app whose accounts Simeon's server keeps: by its server's address, else its catalog row's. */
  public func appsToolkit(serverURL: String?, pluginId: String?) -> String? {
    AppAccounts.toolkit(serverURL: serverURL)
      ?? AppAccounts.toolkit(serverURL: pluginId.flatMap { id in catalog.first { $0.id == id }?.serverURL })
  }

  /** The app's accounts read again (`GET apps/<toolkit>/accounts`); false when they couldn't be read. */
  @discardableResult
  public func loadAppAccounts(_ toolkit: String) async -> Bool {
    guard let backend, let answer = try? await backend.server("apps/\(toolkit)/accounts", method: nil, body: nil),
          let read = AppAccounts(json: answer) else { return false }
    appAccounts[toolkit] = read
    return true
  }

  /** Add Another Account: the sign-in page for one more account; nil when none opened (`problem` says why). */
  public func anotherAccountURL(_ toolkit: String, name: String) async -> URL? {
    guard let backend else { return nil }
    do {
      let answer = try await backend.server("apps/\(toolkit)/connect", method: "POST", body: ["another": true])
      if let url = answer["url"]?.text.flatMap(URL.init(string:)) { return url }
      problem = Connecting.didntConnect(name, why: nil)
    } catch {
      problem = Connecting.didntConnect(name, why: PlainWords.error(error.localizedDescription))
    }
    return nil
  }

  /** The pencil: the person's own name for one account; an empty one goes back to who it signs in as. */
  public func renameAppAccount(_ toolkit: String, _ account: AppAccount, to name: String) async {
    let next = name.split(whereSeparator: \.isWhitespace).joined(separator: " ")
    guard next != (account.name ?? "") else { return }
    await changeAccounts(toolkit, account, method: "PATCH", body: ["name": .string(next)], failure: L10n.text("Couldn't rename the account"))
  }

  /** One account signed out of the app; the others stay. */
  public func removeAppAccount(_ toolkit: String, _ account: AppAccount) async {
    await changeAccounts(toolkit, account, method: "DELETE", body: nil, failure: L10n.text("Couldn't remove the account"))
  }

  private func changeAccounts(_ toolkit: String, _ account: AppAccount, method: String, body: JSON?, failure: String) async {
    guard let backend else { return }
    let id = account.id.addingPercentEncoding(withAllowedCharacters: CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-_"))) ?? account.id
    do {
      let answer = try await backend.server("apps/\(toolkit)/accounts/\(id)", method: method, body: body)
      if let read = AppAccounts(json: answer) { appAccounts[toolkit] = read }
    } catch {
      problem = L10n.text("\(failure): \(error.localizedDescription)")
    }
  }
}
