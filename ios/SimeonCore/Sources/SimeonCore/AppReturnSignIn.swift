import Foundation

/**
 * A connected app's sign-in finished by the app that opened it (15 October
 * 2026, the founder: "why it needs the web account? When all this came from
 * the app"). The computer asks a vendor to send its sign-in back to Simeon
 * Labs' server (`/desktop/mcp-oauth/callback`), which sent it on to the web
 * app's page; that page finished it on the computer of whichever account the
 * browser was signed in to. Now the app names the sign-in to the server
 * before the sheet opens (`server/simeon/desktop/mcp_oauth_return.py`), the
 * server sends the vendor's answer back to the app
 * (`<scheme>://mcp-oauth?state=…&code=…`), the sheet closes on it, and the
 * app hands the code to its own computer, as it does for a loopback sign-in.
 */
public enum AppReturnSignIn {
  /** Where the answer lands in the app: `<scheme>://mcp-oauth?…`. */
  public static let host = "mcp-oauth"
  /** The server's return address the computer registers with vendors. */
  public static let serverCallbackPath = "/desktop/mcp-oauth/callback"

  /** The sign-in's state when its page returns through Simeon Labs' server; nil for a loopback or any other sign-in. */
  public static func state(returningViaServer url: URL) -> String? {
    let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
    guard let redirect = items.first(where: { $0.name == "redirect_uri" })?.value,
          let target = URLComponents(string: redirect),
          target.scheme == "https", target.path == serverCallbackPath else { return nil }
    guard let state = items.first(where: { $0.name == "state" })?.value, !state.isEmpty else { return nil }
    return state
  }

  /** The vendor's answer the server sent back to the app; nil for any other address the sheet closed on. */
  public static func answer(_ callback: URL?) -> LoopbackSignIn.Answer? {
    guard let callback, let parts = URLComponents(url: callback, resolvingAgainstBaseURL: false), parts.host == host else { return nil }
    let items = parts.queryItems ?? []
    func value(_ name: String) -> String? {
      guard let found = items.first(where: { $0.name == name })?.value, !found.isEmpty else { return nil }
      return found
    }
    guard let state = value("state") else { return nil }
    return LoopbackSignIn.Answer(state: state, code: value("code"), error: value("error"), errorDescription: value("error_description")?.replacingOccurrences(of: "+", with: " "))
  }
}

extension AppStore {
  /** Asks Simeon Labs' server to send this sign-in back to the app (`scheme`); false when it could not, and the web page finishes it as before. */
  @discardableResult
  public func sendSignInBack(state: String, scheme: String) async -> Bool {
    guard let backend else { return false }
    do {
      _ = try await backend.server("mcp-oauth/return", method: "POST", body: ["state": .string(state), "back": .string(scheme)])
      return true
    } catch {
      return false
    }
  }
}
