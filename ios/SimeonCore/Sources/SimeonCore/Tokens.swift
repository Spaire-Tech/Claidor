import Foundation

/** What `/auth/poll` hands over. */
public struct TokenPair: Sendable, Equatable, Codable {
  public let accessToken: String
  public let refreshToken: String

  public init(accessToken: String, refreshToken: String) {
    self.accessToken = accessToken; self.refreshToken = refreshToken
  }

  init?(_ json: JSON?) {
    guard let access = json?["accessToken"]?.text, let refresh = json?["refreshToken"]?.text else { return nil }
    self.init(accessToken: access, refreshToken: refresh)
  }
}

/**
 * The pair as the app keeps it, in the Keychain (mobile/src/core/tokens.ts).
 * The refresh token rotates: each `/oauth/token` answer spends the one it
 * was given, so exactly one party refreshes, and on the phone that is now
 * the app itself (SimeonAPI).
 */
public struct SessionTokens: Sendable, Equatable, Codable {
  public let accessToken: String
  public let refreshToken: String
  /** Milliseconds since the epoch; the envelope's `exp`, else an hour from issue. */
  public let expiresAtMs: Double

  public init(accessToken: String, refreshToken: String, expiresAtMs: Double) {
    self.accessToken = accessToken; self.refreshToken = refreshToken; self.expiresAtMs = expiresAtMs
  }

  public init(pair: TokenPair, nowMs: Double) {
    self.init(accessToken: pair.accessToken, refreshToken: pair.refreshToken, expiresAtMs: Tokens.expiry(ofAccessToken: pair.accessToken, nowMs: nowMs))
  }
}

public enum Tokens {
  public static let refreshPath = "/oauth/token"
  /** Refresh with five minutes left, as the Mac does. */
  public static let refreshAheadMs: Double = 5 * 60_000

  /** The access token's `exp`, read off the envelope the server wraps it in (`envelope_access_token`). */
  public static func expiry(ofAccessToken token: String, nowMs: Double) -> Double {
    var body = token
    if let range = body.range(of: "^[a-z_]+_da_", options: .regularExpression) { body.removeSubrange(range) }
    let parts = body.split(separator: ".", omittingEmptySubsequences: false)
    if parts.count > 1, let bytes = bytesFromBase64URL(String(parts[1])), let claims = try? JSON.parse(Data(bytes)), let exp = claims["exp"]?.double, exp.isFinite {
      return exp * 1000
    }
    return nowMs + 60 * 60_000
  }

  public static func needsRefresh(_ session: SessionTokens, nowMs: Double) -> Bool {
    nowMs >= session.expiresAtMs - refreshAheadMs
  }

  public enum RefreshOutcome: Sendable, Equatable {
    case refreshed(SessionTokens)
    /** The server ended the session: sign in again. */
    case ended
    /** Offline, a deploy, a 429: keep the pair and try again later. */
    case kept
  }

  /**
   * The server's answer, read the way the page reads it (`doRefresh` in
   * desktop/web/api.ts): 200 with `shouldLogout` for a spent token, a
   * non-2xx only for a malformed request, 5xx and 429 for "not now".
   */
  public static func readRefreshAnswer(status: Int?, body: JSON?, nowMs: Double) -> RefreshOutcome {
    guard let status, status < 500, status != 429 else { return .kept }
    guard (200..<300).contains(status) else { return .ended }
    guard body?["shouldLogout"]?.bool != true, let access = body?["access_token"]?.string, let refresh = body?["refresh_token"]?.string else { return .ended }
    return .refreshed(SessionTokens(pair: TokenPair(accessToken: access, refreshToken: refresh), nowMs: nowMs))
  }
}
