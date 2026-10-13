import Foundation

/**
 * One Connect for an app (the founder, 13 October 2026: "there is no logic
 * in the add - then takes you to this authenticate button. should just be a
 * connect button"). Connect is the consent, then the app added on the
 * computer and its sign-in opened at once, and it ends Connected; when the
 * person cancels the sign-in, or it never opens, nothing is left half added.
 * Before, Add installed the app and said "Added" whether or not the sign-in
 * followed (on the Mac its failure to open was dropped without a word), and
 * the sign-in then waited under Authenticate in Your plugins, a step nobody
 * could know about.
 */
public enum Connecting {
  /** The button of an app that isn't connected, wherever it shows (a list's row, its page, a chat card, Your plugins). */
  public static let connect = "Connect"
  /** What an app that is connected says in place of the button. */
  public static let connected = "Connected"

  /** A connect that ended so takes back the app it added: only one the person cancelled, never one that may still finish. */
  public static func undoes(_ end: SignInEnd, start: ConnectStart) -> Bool {
    end == .cancelled && start.addedPlugin != nil
  }

  /** Once connected: the app, and the skills it brought, as the Add notice said them. */
  public static func connectedNotice(_ name: String, skills: Int, error: String?) -> Plugins.Notice {
    if let error { return Plugins.Notice(isError: true, text: "Connected \(name), but its skills didn't sync: \(error)") }
    return Plugins.Notice(isError: false, text: skills > 0 ? "Connected \(name) and \(skills == 1 ? "1 skill" : "\(skills) skills")" : "Connected \(name)")
  }

  /** The sign-in closed before the app was connected: it was taken back, and Connect is there again. */
  public static func notConnectedNotice(_ name: String) -> Plugins.Notice {
    Plugins.Notice(isError: false, text: "\(name) wasn't connected")
  }

  /** The sign-in closed on the vendor's page and the computer hasn't said so yet: it is kept, and shows Connected in a moment. */
  public static func stillConnectingNotice(_ name: String) -> Plugins.Notice {
    Plugins.Notice(isError: false, text: "Finishing \(name)'s sign-in…")
  }

  /** What the sign-in that never opened says. */
  public static func didntConnect(_ name: String, why: String?) -> String {
    guard let why, !why.isEmpty else { return "\(name) didn't connect. Try again." }
    return "\(name) didn't connect: \(why)"
  }

  /**
   * Our start link for an app's sign-in (`/desktop/apps/start`, server
   * `apps.py`) with the app that opens it named (`back`), so the sign-in's
   * last page sends the person back here and Apple's sheet closes on the
   * app's own address (the founder, 13 October 2026: "the last screen after
   * something is connected makes no sense ... should take us back"). A
   * vendor's own page is left as it is.
   */
  public static func returning(_ url: URL, to scheme: String) -> URL {
    guard url.path.hasSuffix("/desktop/apps/start"),
          var parts = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return url }
    var items = (parts.queryItems ?? []).filter { $0.name != "back" }
    items.append(URLQueryItem(name: "back", value: scheme))
    parts.queryItems = items
    return parts.url ?? url
  }

  /** The sheet closed on the app's own address: whether the sign-in's last page said it didn't work. */
  public static func failed(_ callback: URL?) -> Bool {
    guard let callback, let items = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems else { return false }
    return items.contains { $0.name == "status" && ["failed", "error"].contains($0.value?.lowercased() ?? "") }
  }
}

/** A connect begun (`AppStore.beginConnect`): the sign-in page, and the app this connect added, so a cancelled one can be taken back. */
public struct ConnectStart: Sendable, Equatable {
  public let url: URL
  /** The catalog entry this connect installed on the computer, or nil when it was there already. */
  public let addedPlugin: String?

  public init(url: URL, addedPlugin: String?) {
    self.url = url
    self.addedPlugin = addedPlugin
  }
}

/** How a sign-in sheet ended. */
public enum SignInEnd: Sendable, Equatable {
  /** The computer says the app is connected. */
  case connected
  /** The person closed the sheet, or it never opened. */
  case cancelled
  /** The sheet closed on the vendor's page, or the wait ran out, before the computer said connected: it may still finish. */
  case unconfirmed
  /** Another sign-in took this one's place. */
  case replaced
}
