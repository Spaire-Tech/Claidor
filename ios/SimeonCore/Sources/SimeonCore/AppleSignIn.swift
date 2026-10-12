import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/**
 * Sign in with Apple from the iPhone's own sheet (12 October 2026): Apple's
 * sheet (Face ID, the person's Apple ID) instead of a web page, then the
 * app's pair straight from Simeon Labs' server, with no browser between
 * (`POST /auth/apple`, `server/simeon/integrations/apple/native.py`).
 *
 * 1. The app makes a nonce for this one sign-in and gives Apple its
 *    SHA-256 (hex); Apple writes that into the identity token it signs.
 * 2. Apple's sheet answers with the identity token, an authorization code
 *    and, the first time this Apple ID signs in to the app, the name.
 * 3. The app posts them with the nonce itself; the server checks Apple's
 *    signature, the app's bundle id and the nonce, and answers the pair
 *    `/auth/poll` would (`{accessToken, refreshToken}`), or a sentence.
 *
 * Google stays the web sign-in in the system's sheet (`SignIn`).
 */
public enum AppleSignIn {
  public static let path = "/auth/apple"
  public static let failed = "Sign in with Apple didn't finish. Try again."
  public static let unreachable = "Simeon can't be reached. Check your connection and try again."

  /** One sign-in's nonce: `raw` goes to Simeon Labs' server, `hashed` (its SHA-256, hex) to Apple. */
  public struct Nonce: Sendable, Equatable {
    public let raw: String
    public let hashed: String
  }

  public static func nonce(randomBytes: [UInt8]) -> Nonce {
    let raw = base64URL(randomBytes)
    return Nonce(raw: raw, hashed: sha256(Array(raw.utf8)).map { String(format: "%02x", $0) }.joined())
  }

  public static func freshNonce() -> Nonce {
    var generator = SystemRandomNumberGenerator()
    return nonce(randomBytes: (0..<32).map { _ in UInt8.random(in: 0...255, using: &generator) })
  }

  public enum Outcome: Sendable, Equatable {
    case tokens(TokenPair)
    /** The server refused this Apple account, with its sentence (403). */
    case refused(String)
    /** Apple's answer didn't check out, or the server couldn't be reached. */
    case failed(String)
  }

  /** What Apple's sheet gave the app, to the server; the pair back. */
  public static func signIn(
    api: URL, identityToken: String, authorizationCode: String?, nonce: Nonce,
    givenName: String?, familyName: String?, clientVersion: String, http: HTTPClient
  ) async -> Outcome {
    var fields: [String: JSON] = ["identityToken": .string(identityToken), "nonce": .string(nonce.raw)]
    if let authorizationCode, !authorizationCode.isEmpty { fields["authorizationCode"] = .string(authorizationCode) }
    if let givenName, !givenName.isEmpty { fields["givenName"] = .string(givenName) }
    if let familyName, !familyName.isEmpty { fields["familyName"] = .string(familyName) }
    let url = URL(string: api.absoluteString.trimmingTrailingSlashes + path)!
    let request = URLRequest.post(url, json: .object(fields), headers: [SimeonConfig.clientVersionHeader: clientVersion])
    do {
      let answer = try await http.send(request)
      if answer.ok, let pair = TokenPair(answer.json) { return .tokens(pair) }
      let message = answer.json?["message"]?.text ?? failed
      return answer.status == 403 ? .refused(message) : .failed(message)
    } catch {
      return .failed(unreachable)
    }
  }
}
