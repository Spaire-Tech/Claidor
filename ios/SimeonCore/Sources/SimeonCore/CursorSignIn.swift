import Foundation

/**
 * Cursor's sign-in on the person's cloud computer, as the engine says it
 * (`getCursorSignIn`, `startCursorSignIn`; desktop/source/host/cursor/
 * cursor-account.ts), for the connect card's Cursor row and its sheet (13
 * November 2026, the founder: "Cursor now").
 *
 * Cursor's own program signs in there: it prints a link to Cursor's own
 * site, the person opens it and approves, and the program keeps the sign-in
 * on the computer. There is no code to type. The first time, the program is
 * put on the computer first ("installing").
 */
public struct CursorSignIn: Hashable, Sendable {
  public enum State: Hashable, Sendable {
    case none
    /** Cursor's program is being put on the computer; the link follows. */
    case installing
    /** The person approves on Cursor's page (`url`) before `expiresAt`. */
    case waiting(url: URL, expiresAt: Date)
    case connected
    case failed(why: String)
  }

  public let state: State

  public init(state: State) { self.state = state }

  public init(_ record: JSON) {
    switch record["state"]?.string {
    case "connected": state = .connected
    case "installing": state = .installing
    case "failed": state = .failed(why: record["why"]?.string ?? "")
    case "waiting":
      // Only a page on Cursor's own site is ever opened.
      if let link = record["url"]?.string, let url = URL(string: link), CursorSignIn.isCursorPage(url) {
        state = .waiting(url: url, expiresAt: Date(timeIntervalSince1970: (record["expiresAtMs"]?.double ?? 0) / 1000))
      } else {
        state = .none
      }
    default: state = .none
    }
  }

  public var connected: Bool { state == .connected }

  /** A page on Cursor's own site, over https. */
  public static func isCursorPage(_ url: URL) -> Bool {
    guard url.scheme == "https", let host = url.host?.lowercased() else { return false }
    return host == "cursor.com" || host.hasSuffix(".cursor.com")
  }

  /** Seconds until the computer is asked again while the sheet waits. */
  public static let pollSeconds: Double = 3

  // The sheet's words, with the program's name given (`ModelConnectCard.program`).
  public static func settingUp(_ program: String) -> String { L10n.text("Setting up \(program) on your computer…") }
  public static func steps(_ program: String) -> String { L10n.text("Open \(program)'s page and approve the sign-in there. This updates by itself.") }
  public static func open(_ program: String) -> String { L10n.text("Open \(program)") }
  public static var waiting: String { L10n.text("Waiting for you to approve…") }
  public static func didNotFinish(_ program: String) -> String { L10n.text("\(program)'s sign-in didn't finish. Try again.") }
  public static var tryAgain: String { L10n.text("Try Again") }
  public static func connectedTo(_ program: String) -> String { L10n.text("You're now connected to \(program).") }
}
