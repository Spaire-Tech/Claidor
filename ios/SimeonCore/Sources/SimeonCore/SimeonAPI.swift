import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/** Where the pair lives between launches: the Keychain in the app, memory in the tests. */
public protocol TokenVault: Sendable {
  func read() -> SessionTokens?
  func write(_ tokens: SessionTokens?)
}

public final class MemoryVault: TokenVault, @unchecked Sendable {
  private let lock = NSLock()
  private var tokens: SessionTokens?
  public init(_ tokens: SessionTokens? = nil) { self.tokens = tokens }
  public func read() -> SessionTokens? { lock.lock(); defer { lock.unlock() }; return tokens }
  public func write(_ tokens: SessionTokens?) { lock.lock(); self.tokens = tokens; lock.unlock() }
}

public struct SimeonAPIError: Error, LocalizedError, Sendable {
  public let message: String
  public let status: Int
  /** The refusal's own code when the answer names one (`error.code`, e.g. OpenAI's `moderation_blocked`). */
  public var code: String? = nil
  /** The answer's headers (a Connect refusal's hint, `x-automation-failure-hint`, and its `retry-after`). */
  public var headers: [String: String] = [:]
  public var errorDescription: String? { message }

  /** One header of the answer, whatever case it came in. */
  public func header(_ name: String) -> String? {
    headers.first { $0.key.caseInsensitiveCompare(name) == .orderedSame }?.value
  }
}

/**
 * Simeon Labs' server, as the Mac app and the web window speak to it
 * (desktop/web/api.ts): a bearer on `/desktop/api/…` and on the box broker
 * (`/simeon.v1.ComputerService/…`, Connect JSON), refreshed at
 * `/oauth/token` with five minutes left. The app is the only party that
 * refreshes on the phone, so the Keychain always holds the live pair.
 */
public actor SimeonAPI {
  public static let desktopPrefix = "/desktop/api/"
  public static let connectService = "simeon.v1.ComputerService"

  public nonisolated let base: URL
  public nonisolated let clientVersion: String
  /** The app's language (`AppLanguage`), sent on every request as `Accept-Language`. */
  public nonisolated let language: String
  private let vault: TokenVault
  private let http: HTTPClient
  private let now: @Sendable () -> Double
  private var refreshing: Task<SessionTokens?, Never>?
  private var onEnded: (@Sendable () -> Void)?

  public init(base: URL = SimeonConfig.defaultAPI, clientVersion: String, vault: TokenVault, http: HTTPClient = URLSessionClient(), language: String = AppLanguage.current, now: @escaping @Sendable () -> Double = { Date().timeIntervalSince1970 * 1000 }) {
    self.base = base; self.clientVersion = clientVersion; self.vault = vault; self.http = http; self.language = language; self.now = now
  }

  /** Called once when the server ends the session (a spent refresh token, a 401). */
  public func onSessionEnded(_ handler: @escaping @Sendable () -> Void) { onEnded = handler }

  public var isSignedIn: Bool { vault.read() != nil }

  /** The signed-in account (its token's `sub`), nil when signed out: what a computer's address kept between launches belongs to (`SavedGateway`). */
  public nonisolated var accountScope: String? {
    vault.read().flatMap { Tokens.subject(ofAccessToken: $0.accessToken) }
  }

  public func signedIn(with pair: TokenPair) {
    vault.write(SessionTokens(pair: pair, nowMs: now()))
  }

  /** The headers the Mac app sends the broker (`sand-client-metadata.ts`), and the app's language. */
  public nonisolated var clientHeaders: [String: String] {
    ["x-simeon-client-type": "sand", SimeonConfig.clientVersionHeader: clientVersion, "x-sand-box-namespace": "prod", SimeonConfig.languageHeader: language]
  }

  private func url(_ path: String) -> URL {
    URL(string: base.absoluteString.trimmingTrailingSlashes + path)!
  }

  private func sessionEnded() {
    vault.write(nil)
    // While the account is being deleted, a call refused because its sessions just went is the delete, not a
    // sign-out: the delete's own answer says what happened (`deleteAccount`).
    if !deleting { onEnded?() }
  }

  /** The account is being deleted (`deleteAccount`). */
  private var deleting = false

  /** A live access token, refreshed first when the hour is nearly up. Nil when signed out. */
  public func accessToken() async -> String? {
    guard let current = vault.read() else { return nil }
    if !Tokens.needsRefresh(current, nowMs: now()) { return current.accessToken }
    if refreshing == nil {
      refreshing = Task { await self.refresh(current) }
    }
    let refreshed = await refreshing?.value
    refreshing = nil
    return refreshed?.accessToken
  }

  private func refresh(_ current: SessionTokens) async -> SessionTokens? {
    let request = URLRequest.post(url(Tokens.refreshPath), json: ["grant_type": "refresh_token", "refresh_token": .string(current.refreshToken)], headers: [SimeonConfig.languageHeader: language])
    let answer = try? await http.send(request)
    switch Tokens.readRefreshAnswer(status: answer?.status, body: answer?.json, nowMs: now()) {
    case .refreshed(let next):
      vault.write(next)
      return next
    case .kept:
      return current
    case .ended:
      sessionEnded()
      return nil
    }
  }

  private func authorized(_ request: inout URLRequest) async throws {
    guard let token = await accessToken() else { throw SimeonAPIError(message: "Sign in to Simeon first.", status: 401) }
    request.setValue("Bearer \(token)", forHTTPHeaderField: "authorization")
    request.setValue("application/json", forHTTPHeaderField: "accept")
    for (name, value) in clientHeaders { request.setValue(value, forHTTPHeaderField: name) }
  }

  /** One `/desktop/api/…` call, in the app's envelope (`{code, data}`), the way `simeon-api.ts` reads it on the Mac. */
  public func data(_ path: String, method: String? = nil, json: JSON? = nil, timeout: TimeInterval? = nil) async throws -> JSON {
    var request = URLRequest(url: url(Self.desktopPrefix + path))
    request.httpMethod = method ?? (json == nil ? "GET" : "POST")
    if let timeout { request.timeoutInterval = timeout }
    if let json {
      request.httpBody = try json.data()
      request.setValue("application/json", forHTTPHeaderField: "content-type")
    }
    try await authorized(&request)
    let answer = try await http.send(request)
    if answer.status == 401 { sessionEnded() }
    guard answer.ok else {
      // The refusal's own sentence and code when it has them: the server's proxy and the providers it passes on answer
      // `{"error": {"message", "code"}}` (server/simeon/desktop/proxy_common.py), meant to be shown as they are.
      let said = answer.json?["error"]
      // Else the app's own envelope, refused with its status (`{"code", "message"}`, `_fail` in server/simeon/desktop/endpoints.py).
      let message = said?["message"]?.text ?? answer.json?["message"]?.text
      throw SimeonAPIError(message: message ?? "Simeon Labs' server answered \(path) with \(answer.status).", status: answer.status, code: said?["code"]?.text)
    }
    guard let parsed = answer.json else { throw SimeonAPIError(message: "Simeon Labs' server answered \(path) with something that is not JSON.", status: answer.status) }
    if let code = parsed["code"], code.int != 0 {
      throw SimeonAPIError(message: parsed["message"]?.text ?? "Simeon Labs' server refused \(path).", status: answer.status)
    }
    return parsed["code"] == nil ? parsed : (parsed["data"] ?? .null)
  }

  /**
   * The phone's notifications (`server/simeon/desktop/push.py`): Apple's
   * device token for this phone, at `/desktop/push-devices`, or taken off it
   * on sign-out. `sandbox` for a build run from Xcode.
   */
  public func registerPushDevice(apnsToken: String, sandbox: Bool, remove: Bool = false) async throws {
    var request = URLRequest(url: url("/desktop/push-devices"))
    request.httpMethod = remove ? "DELETE" : "POST"
    let body: JSON = ["apns_token": .string(apnsToken), "apns_environment": .string(sandbox ? "sandbox" : "production"), "platform": "ios"]
    request.httpBody = try body.data()
    request.setValue("application/json", forHTTPHeaderField: "content-type")
    try await authorized(&request)
    let answer = try await http.send(request)
    if answer.status == 401 { sessionEnded() }
    guard answer.ok else { throw SimeonAPIError(message: "Simeon Labs' server answered push-devices with \(answer.status).", status: answer.status) }
  }

  /**
   * Dictation (`audio_transcriptions` in server/simeon/desktop/capabilities.py,
   * as the Mac's `simeon-transcribe.ts` sends it): the recording as OpenAI's
   * multipart `file` ("audio.mp4" for `audio/mp4`), at
   * `/desktop/api/proxy/v1/audio/transcriptions`; what was said comes back as
   * `{text, seconds}`. With the app's language as `language` when it is not
   * English (20 October 2026: the Mac's dictation heard in French); in English
   * none is sent, as before, and OpenAI finds it.
   */
  public func transcribe(audio: Data, mimeType: String) async throws -> String {
    let mime = mimeType.split(separator: ";").first.map { String($0).trimmingCharacters(in: .whitespaces) } ?? "audio/webm"
    let boundary = "simeon-\(UUID().uuidString.lowercased())"
    var request = URLRequest(url: url(Self.desktopPrefix + "proxy/v1/audio/transcriptions"))
    request.httpMethod = "POST"
    request.httpBody = Self.multipartFile(audio, filename: Self.audioFilename(mime), mimeType: mime, boundary: boundary, language: Self.dictationLanguage(language))
    try await authorized(&request)
    request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "content-type")
    let answer = try await http.send(request)
    if answer.status == 401 { sessionEnded() }
    guard answer.ok else {
      throw SimeonAPIError(message: answer.json?["error"]?["message"]?.text ?? "Simeon Labs' server answered dictation with \(answer.status).", status: answer.status)
    }
    return answer.json?["text"]?.text ?? ""
  }

  /** "audio.webm", "audio.mp4": the type's second part (`audioFilename`). */
  static func audioFilename(_ mimeType: String) -> String {
    let subtype = mimeType.split(separator: "/").dropFirst().first.map(String.init) ?? "webm"
    return "audio.\(subtype.split(separator: "+").first.map(String.init) ?? "webm")"
  }

  /** The language dictation is heard in: the two letters OpenAI takes ("fr"), or nil for English (OpenAI then finds it). */
  static func dictationLanguage(_ language: String) -> String? {
    AppLanguage.isEnglish(language) ? nil : AppLanguage.code(language)
  }

  /** One file as `multipart/form-data`, the field named `file`, after the `language` field when there is one. */
  static func multipartFile(_ data: Data, filename: String, mimeType: String, boundary: String, language: String? = nil) -> Data {
    var body = Data()
    if let language {
      body.append(Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"language\"\r\n\r\n\(language)\r\n".utf8))
    }
    body.append(Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"file\"; filename=\"\(filename)\"\r\nContent-Type: \(mimeType)\r\n\r\n".utf8))
    body.append(data)
    body.append(Data("\r\n--\(boundary)--\r\n".utf8))
    return body
  }

  /** One unary call on the box broker, Connect JSON (`server/simeon/sand/connect.py`). */
  public func connect(_ method: String, _ message: JSON = [:], service: String = connectService) async throws -> JSON {
    var request = URLRequest.post(url("/\(service)/\(method)"), json: message, headers: ["connect-protocol-version": "1"])
    try await authorized(&request)
    let answer = try await http.send(request)
    if answer.status == 401 { sessionEnded() }
    guard answer.ok else {
      throw SimeonAPIError(message: answer.json?["message"]?.text ?? "Simeon's cloud computer answered \(method) with \(answer.status).", status: answer.status, headers: answer.headers)
    }
    return answer.json ?? [:]
  }

  /** The account: `user_payload()` in server/simeon/desktop/service.py. */
  public func profile() async throws -> JSON { try await data("user/profile") }

  /**
   * Deletes the account and what Simeon keeps for it
   * (`server/simeon/desktop/account_deletion.py`): the subscription ends, the
   * cloud computer and its files go, the apps are disconnected, every device
   * is signed out. Then the pair is forgotten. Throws the server's own
   * sentence when a step could not be done (try again later). True when a
   * plan bought in the iPhone app runs on: only the person can cancel it,
   * with Apple (false when the answer never came back; the caller knows
   * from the usage summary).
   *
   * The delete can take minutes (Stripe, the computer and its volumes, each
   * app and call transcript at its provider), so it waits five minutes
   * rather than URLSession's one (14 October 2026: the app said it failed
   * while the server went on and deleted the account). If the answer still
   * does not come, the server is asked whether the account is gone: a
   * session refused (401) means it is.
   */
  @discardableResult
  public func deleteAccount(checkEvery: UInt64 = 5_000_000_000) async throws -> Bool {
    guard vault.read() != nil else { throw SimeonAPIError(message: "Sign in to Simeon first.", status: 401) }
    deleting = true
    defer { deleting = false }
    do {
      let answer = try await data("account", method: "DELETE", timeout: Self.deleteTimeout)
      vault.write(nil)
      return answer["appleSubscription"]?.bool == true
    } catch let answered as SimeonAPIError where !Self.deleteUnsettled.contains(answered.status) {
      // The server answered (a 503 is its own "couldn't be deleted right now"): the account is still there.
      throw answered
    } catch {
      // No answer (timed out, cut off), a gateway's timeout, or the session already refused: ask.
      guard await accountGone(tries: Self.deleteChecks, every: checkEvery) else { throw error }
      vault.write(nil)
      return false
    }
  }

  /** How long the delete is waited for. */
  public static let deleteTimeout: TimeInterval = 300
  /** How many times the server is asked whether the account went, after a delete whose answer never came. */
  static let deleteChecks = 6
  /** Statuses that leave the delete's outcome unknown: none, the session refused, a gateway that stopped waiting. */
  static let deleteUnsettled: Set<Int> = [0, 401, 502, 504]

  /** Whether this sign-in's account is gone: its session refused (401), or its refresh refused. Asked a few times, the delete may still be finishing. */
  private func accountGone(tries: Int, every: UInt64) async -> Bool {
    for attempt in 0..<tries {
      if attempt > 0 { try? await Task.sleep(nanoseconds: every) }
      guard let token = await accessToken() else { return true }
      var request = URLRequest(url: url(Self.desktopPrefix + "user/profile"))
      request.setValue("Bearer \(token)", forHTTPHeaderField: "authorization")
      request.setValue("application/json", forHTTPHeaderField: "accept")
      for (name, value) in clientHeaders { request.setValue(value, forHTTPHeaderField: name) }
      guard let answer = try? await http.send(request) else { continue }
      if answer.status == 401 { return true }
    }
    return false
  }

  /** Signs this phone's session out on the server and forgets the pair. */
  public func signOut() async {
    let token = vault.read()?.accessToken
    vault.write(nil)
    guard let token else { return }
    var request = URLRequest(url: url(Self.desktopPrefix + "auth/logout"))
    request.httpMethod = "POST"
    request.setValue("Bearer \(token)", forHTTPHeaderField: "authorization")
    request.setValue(language, forHTTPHeaderField: SimeonConfig.languageHeader)
    _ = try? await http.send(request)
  }
}
