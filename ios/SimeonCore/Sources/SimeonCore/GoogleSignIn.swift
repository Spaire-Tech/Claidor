import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/**
 * Google from the iPhone itself (12 October 2026). The web sign-in showed
 * Simeon Labs' own "Continue as …" page after Google's account picker,
 * which the founder found a duplicate; now the app opens Google's page
 * with its own OAuth client and goes straight back in, as with Apple.
 *
 * 1. The app asks the server how (`GET /auth/google/config`): the iPhone's
 *    OAuth client, the redirect Google sends the code to (the client id
 *    reversed, a URL scheme) and Google's page. No answer means the client
 *    is not set up yet, and the app keeps the web sign-in (`SignIn`).
 * 2. It makes a PKCE verifier for this one sign-in, opens Google's page
 *    with its SHA-256 (`authorizeURL`), and Google's account picker shows
 *    every time (`prompt=select_account`), so another account is a tap.
 * 3. Google sends the code back on the redirect (`code(from:)`); the app
 *    posts it with the verifier (`POST /auth/google`) and the server
 *    answers the pair, as for Apple (`AppleSignIn.Outcome`).
 */
public enum GoogleSignIn {
  public static let configPath = "/auth/google/config"
  public static let path = "/auth/google"
  public static let failed = "Google sign-in didn't finish. Try again."

  /** What the server says the app opens Google's page with. */
  public struct Config: Sendable, Equatable {
    public let clientId: String
    public let redirectUri: String
    public let authorizeUrl: String
    public let scope: String

    public init?(_ json: JSON?) {
      guard let json, let clientId = json["clientId"]?.text, let redirectUri = json["redirectUri"]?.text,
            let authorizeUrl = json["authorizeUrl"]?.text, URL(string: authorizeUrl) != nil else { return nil }
      self.clientId = clientId
      self.redirectUri = redirectUri
      self.authorizeUrl = authorizeUrl
      self.scope = json["scope"]?.text ?? "openid email profile"
    }

    /** The scheme Google's redirect comes back on, which the sign-in sheet waits for. */
    public var callbackScheme: String? { URL(string: redirectUri)?.scheme }
  }

  /** One sign-in's PKCE pair and state: `verifier` goes to Simeon Labs' server, `challenge` (its SHA-256) to Google. */
  public struct Attempt: Sendable, Equatable {
    public let verifier: String
    public let challenge: String
    public let state: String
  }

  public static func attempt(verifierBytes: [UInt8], stateBytes: [UInt8]) -> Attempt {
    let verifier = base64URL(verifierBytes)
    return Attempt(verifier: verifier, challenge: base64URL(sha256(Array(verifier.utf8))), state: base64URL(stateBytes))
  }

  public static func freshAttempt() -> Attempt {
    var generator = SystemRandomNumberGenerator()
    let bytes = { (count: Int) in (0..<count).map { _ in UInt8.random(in: 0...255, using: &generator) } }
    return attempt(verifierBytes: bytes(32), stateBytes: bytes(16))
  }

  /** The server's Google setup for the iPhone, or nil (not set up, or not reachable: the web sign-in then). */
  public static func config(api: URL, http: HTTPClient) async -> Config? {
    let url = URL(string: api.absoluteString.trimmingTrailingSlashes + configPath)!
    var request = URLRequest(url: url)
    request.timeoutInterval = 8
    guard let answer = try? await http.send(request), answer.ok else { return nil }
    return Config(answer.json?["google"])
  }

  /** Google's page: the account picker every time, a code for this app only. */
  public static func authorizeURL(_ config: Config, attempt: Attempt) -> URL? {
    var parts = URLComponents(string: config.authorizeUrl)
    parts?.queryItems = [
      URLQueryItem(name: "client_id", value: config.clientId),
      URLQueryItem(name: "redirect_uri", value: config.redirectUri),
      URLQueryItem(name: "response_type", value: "code"),
      URLQueryItem(name: "scope", value: config.scope),
      URLQueryItem(name: "code_challenge", value: attempt.challenge),
      URLQueryItem(name: "code_challenge_method", value: "S256"),
      URLQueryItem(name: "state", value: attempt.state),
      URLQueryItem(name: "prompt", value: "select_account"),
    ]
    return parts?.url
  }

  /** What Google's redirect brought back. */
  public enum Callback: Equatable {
    case code(String)
    /** The person said no on Google's page (`access_denied`), or closed it. */
    case cancelled
    case failed
  }

  /** The code in Google's redirect, if it answers this sign-in (its `state`). */
  public static func code(from url: URL, attempt: Attempt) -> Callback {
    let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
    let value = { (name: String) in items.first { $0.name == name }?.value }
    if value("error") == "access_denied" { return .cancelled }
    guard value("state") == attempt.state, let code = value("code"), !code.isEmpty else { return .failed }
    return .code(code)
  }

  /** The code and the verifier to the server; the pair back. */
  public static func signIn(api: URL, code: String, attempt: Attempt, clientVersion: String, http: HTTPClient) async -> AppleSignIn.Outcome {
    let url = URL(string: api.absoluteString.trimmingTrailingSlashes + path)!
    let body: JSON = .object(["code": .string(code), "codeVerifier": .string(attempt.verifier)])
    let request = URLRequest.post(url, json: body, headers: [SimeonConfig.clientVersionHeader: clientVersion])
    do {
      let answer = try await http.send(request)
      if answer.ok, let pair = TokenPair(answer.json) { return .tokens(pair) }
      let message = answer.json?["message"]?.text ?? failed
      return answer.status == 403 ? .refused(message) : .failed(message)
    } catch {
      return .failed(AppleSignIn.unreachable)
    }
  }
}
