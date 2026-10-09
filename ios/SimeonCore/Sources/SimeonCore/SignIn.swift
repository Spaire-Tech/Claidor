import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/** Where Simeon is, and how the phone names itself (mobile/src/core/config.ts). */
public enum SimeonConfig {
  public static let defaultAPI = URL(string: "https://api.simeonlabs.com")!
  /**
   * The app's own URL scheme. `simeon` is the Mac app's; the phone's must
   * differ, or a confirm page meant for one would wake the other.
   */
  public static let urlScheme = "simeon-ios"
  /** What the server stores on the session row, so a phone's session reads as one (`client_version_of`). */
  public static let clientVersionHeader = "x-simeon-client-version"
}

/**
 * Signing in on the iPhone: the Mac app's own sign-in, byte for byte, as the
 * server serves it (`server/simeon/desktop/app_sign_in.py`; the Expo shell's
 * `mobile/src/core/sign-in.ts` did the same).
 *
 * 1. A verifier only the app holds: 32 random bytes, base64url, unpadded.
 *    The challenge is base64url(sha256(verifier)), the hash over the
 *    verifier's ASCII text. The uuid is a v4 uuid.
 * 2. The system's sign-in sheet opens
 *    `{api}/loginDeepControl?challenge=…&uuid=…&mode=login&redirectTarget=simeon-ios`.
 * 3. Meanwhile the app posts `{uuid, verifier}` to `/auth/poll`: 404 is
 *    "not yet", 200 carries `{accessToken, refreshToken}`. The Mac's
 *    backoff: 1 s growing by 1.2 to 10 s, three errors in a row give up,
 *    150 tries at most.
 */
public enum SignIn {
  public static let loginPath = "/loginDeepControl"
  public static let pollPath = "/auth/poll"
  public static let maxPollAttempts = 150

  public struct Metadata: Sendable, Equatable {
    public let uuid: String
    public let verifier: String
    public let challenge: String
  }

  public static func challenge(for verifier: String) -> String {
    base64URL(sha256(Array(verifier.utf8)))
  }

  public static func metadata(randomBytes: [UInt8], uuid: UUID = UUID()) -> Metadata {
    let verifier = base64URL(randomBytes)
    return Metadata(uuid: uuid.uuidString.lowercased(), verifier: verifier, challenge: challenge(for: verifier))
  }

  public static func freshMetadata() -> Metadata {
    var generator = SystemRandomNumberGenerator()
    return metadata(randomBytes: (0..<32).map { _ in UInt8.random(in: 0...255, using: &generator) })
  }

  /** The page the sheet opens, in the Mac's parameter order. Every value is base64url or a uuid, so nothing needs escaping. */
  public static func loginURL(api: URL, metadata: Metadata, redirectTarget: String = SimeonConfig.urlScheme) -> URL {
    URL(string: "\(api.absoluteString.trimmingTrailingSlashes)\(loginPath)?challenge=\(metadata.challenge)&uuid=\(metadata.uuid)&mode=login&redirectTarget=\(redirectTarget)")!
  }

  /** The wait before the next poll, as the Mac's `pollAuthenticationStatus` has it. */
  public static func pollDelay(attempt: Int) -> Double {
    min(pow(1.2, Double(attempt)), 10)
  }

  public enum Outcome: Sendable, Equatable {
    case tokens(TokenPair)
    /** Three errors in a row, 150 tries, or a 200 that carried no pair. */
    case gaveUp
    /** The person closed the sheet without confirming. */
    case stopped
    /** The server's sign-in policy refused this account (403 `sign_in_policy_violation`). */
    case refused
  }

  /**
   * Polls until the person confirms. The verifier goes in the body, never
   * the query string, so it is not written to an access log.
   */
  public static func poll(
    api: URL, metadata: Metadata, clientVersion: String, http: HTTPClient,
    wait: @Sendable (Double) async -> Void = { seconds in try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000)) },
    keepGoing: @Sendable () -> Bool = { !Task.isCancelled },
    maxAttempts: Int = maxPollAttempts
  ) async -> Outcome {
    var consecutiveErrors = 0
    let url = URL(string: api.absoluteString.trimmingTrailingSlashes + pollPath)!
    for attempt in 0..<maxAttempts {
      if !keepGoing() { return .stopped }
      do {
        let request = URLRequest.post(url, json: ["uuid": .string(metadata.uuid), "verifier": .string(metadata.verifier)], headers: [SimeonConfig.clientVersionHeader: clientVersion])
        let answer = try await http.send(request)
        if answer.status == 404 {
          consecutiveErrors = 0
        } else if answer.status == 403 {
          if answer.json?["error"]?.string == "sign_in_policy_violation" { return .refused }
          consecutiveErrors += 1
          if consecutiveErrors >= 3 { return .gaveUp }
        } else if !answer.ok {
          consecutiveErrors += 1
          if consecutiveErrors >= 3 { return .gaveUp }
        } else {
          guard let pair = TokenPair(answer.json) else { return .gaveUp }
          return .tokens(pair)
        }
      } catch {
        consecutiveErrors += 1
        if consecutiveErrors >= 3 { return .gaveUp }
      }
      await wait(pollDelay(attempt: attempt))
    }
    return .gaveUp
  }
}

extension String {
  var trimmingTrailingSlashes: String {
    var text = self
    while text.hasSuffix("/") { text.removeLast() }
    return text
  }
}
