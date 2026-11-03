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
 *
 * Any page or program can open such a link, so the app finishes only a
 * sign-in it named itself (`finishReturnedSignIn`), as upstream's own return
 * answers only a `state` it began, with an expiry, and never shows the
 * maker's words (`shared/node/mcp/mcp-oauth-loopback.ts`), and as the
 * Windows app does (clients/apps/app/src/core/store.ts).
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
  /** A sign-in named to the server to come back to the app is finished within this (its sheet's own wait is 5 minutes). */
  public static let returnedSignInSeconds: TimeInterval = 10 * 60

  /**
   * Asks Simeon Labs' server to send this sign-in back to the app (`scheme`),
   * remembering it under the app's `name` (`finishReturnedSignIn`); false
   * when it could not, and the web page finishes it as before.
   */
  @discardableResult
  public func sendSignInBack(state: String, scheme: String, name: String, now: Date = Date()) async -> Bool {
    guard let backend else { return false }
    // Remembered before it goes: the answer may come back before the server's reply does.
    returnedSignIns = returnedSignIns.filter { now.timeIntervalSince($0.value.at) <= Self.returnedSignInSeconds }
    returnedSignIns[state] = (name: name, at: now)
    do {
      _ = try await backend.server("mcp-oauth/return", method: "POST", body: ["state": .string(state), "back": .string(scheme)])
      return true
    } catch {
      return false
    }
  }

  /**
   * A sign-in's answer the server sent back to the app (`<scheme>://mcp-oauth`),
   * finished on this account's computer (`completeMcpOAuth`) only when this
   * app named that sign-in (`sendSignInBack`) in this sign-in, within
   * `returnedSignInSeconds`, and once: any other is dropped without a word. A
   * refusal says "<app> didn't connect. Try again.", never the link's own
   * words. Whether it was one of this app's.
   */
  @discardableResult
  public func finishReturnedSignIn(_ answer: LoopbackSignIn.Answer, now: Date = Date()) async -> Bool {
    guard let started = returnedSignIns[answer.state], now.timeIntervalSince(started.at) <= Self.returnedSignInSeconds else { return false }
    guard backend != nil else { return false }
    returnedSignIns[answer.state] = nil
    if answer.error != nil {
      problem = Connecting.didntConnect(started.name, why: nil)
      return true
    }
    await finishLoopbackSignIn(LoopbackSignIn.Answer(state: answer.state, code: answer.code, error: nil, errorDescription: nil), name: started.name)
    return true
  }
}
