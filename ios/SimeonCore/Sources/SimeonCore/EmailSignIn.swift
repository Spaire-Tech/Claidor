import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/**
 * Log in or sign up with an email (19 October 2026, the founder's ChatGPT
 * reference; `server/simeon/desktop/email_sign_in.py`): the email, then the
 * code sent to it or the account's password, each answered with the app's
 * pair as Apple's sheet is (`AppleSignIn`), with no browser between. A new
 * email becomes a new account at its code. A password is set while signed
 * in (Settings › Account, `AppStore.setPassword`), never at sign-up, so a
 * forgotten one is a code away.
 */
public enum EmailSignIn {
  public static let codePath = "/auth/email/code"
  public static let verifyPath = "/auth/email/verify"
  public static let passwordPath = "/auth/email/password"
  /** Signed in, under `/desktop/api/`: whether there is a password, and setting it. */
  public static let accountPasswordPath = "account/password"

  public static let unreachable = AppleSignIn.unreachable
  public static let failed = "Sign-in didn't finish. Try again."
  public static let badEmail = "Enter a valid email address."
  /** The shortest password the server takes (`passwords.MIN_LENGTH`). */
  public static let minimumPassword = 8

  public enum Sent: Sendable, Equatable {
    case sent
    /** The server's sentence: not an email, too many codes. */
    case refused(String)
  }

  public enum Outcome: Sendable, Equatable {
    case tokens(TokenPair)
    /** The account can't sign in here (403), with the server's sentence. */
    case refused(String)
    /** A wrong code or password, too many tries, or no answer; the sentence to show. */
    case failed(String)
  }

  /** An email the server could take: one "@" with something either side, and a dot in the domain. The server checks for real. */
  public static func looksLikeEmail(_ text: String) -> Bool {
    let email = text.trimmingCharacters(in: .whitespacesAndNewlines)
    let parts = email.split(separator: "@", omittingEmptySubsequences: false)
    guard parts.count == 2, !parts[0].isEmpty, !email.contains(where: \.isWhitespace) else { return false }
    let domain = parts[1]
    return domain.contains(".") && !domain.hasPrefix(".") && !domain.hasSuffix(".")
  }

  /** A code to the email; `.sent` whether or not it has an account (the server never says). */
  public static func requestCode(api: URL, email: String, clientVersion: String, http: HTTPClient) async -> Sent {
    do {
      let answer = try await http.send(request(api, codePath, ["email": .string(trimmed(email))], clientVersion))
      if answer.ok { return .sent }
      return .refused(answer.json?["message"]?.text ?? failed)
    } catch {
      return .refused(unreachable)
    }
  }

  /** The code from the email, for the pair. */
  public static func verify(api: URL, email: String, code: String, clientVersion: String, http: HTTPClient) async -> Outcome {
    let typed = code.filter { !$0.isWhitespace }.uppercased()
    return await signIn(request(api, verifyPath, ["email": .string(trimmed(email)), "code": .string(typed)], clientVersion), http: http)
  }

  /** The account's password, for the pair. The password goes as typed. */
  public static func password(api: URL, email: String, password: String, clientVersion: String, http: HTTPClient) async -> Outcome {
    await signIn(request(api, passwordPath, ["email": .string(trimmed(email)), "password": .string(password)], clientVersion), http: http)
  }

  private static func signIn(_ request: URLRequest, http: HTTPClient) async -> Outcome {
    do {
      let answer = try await http.send(request)
      if answer.ok, let pair = TokenPair(answer.json) { return .tokens(pair) }
      let message = answer.json?["message"]?.text ?? failed
      return answer.status == 403 ? .refused(message) : .failed(message)
    } catch {
      return .failed(unreachable)
    }
  }

  private static func request(_ api: URL, _ path: String, _ fields: [String: JSON], _ clientVersion: String) -> URLRequest {
    let url = URL(string: api.absoluteString.trimmingTrailingSlashes + path)!
    return URLRequest.post(url, json: .object(fields), headers: SimeonConfig.serverHeaders(clientVersion: clientVersion))
  }

  private static func trimmed(_ email: String) -> String {
    email.trimmingCharacters(in: .whitespacesAndNewlines)
  }
}
