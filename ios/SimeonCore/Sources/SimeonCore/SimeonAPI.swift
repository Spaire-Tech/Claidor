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
  public var errorDescription: String? { message }
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
  private let vault: TokenVault
  private let http: HTTPClient
  private let now: @Sendable () -> Double
  private var refreshing: Task<SessionTokens?, Never>?
  private var onEnded: (@Sendable () -> Void)?

  public init(base: URL = SimeonConfig.defaultAPI, clientVersion: String, vault: TokenVault, http: HTTPClient = URLSessionClient(), now: @escaping @Sendable () -> Double = { Date().timeIntervalSince1970 * 1000 }) {
    self.base = base; self.clientVersion = clientVersion; self.vault = vault; self.http = http; self.now = now
  }

  /** Called once when the server ends the session (a spent refresh token, a 401). */
  public func onSessionEnded(_ handler: @escaping @Sendable () -> Void) { onEnded = handler }

  public var isSignedIn: Bool { vault.read() != nil }

  public func signedIn(with pair: TokenPair) {
    vault.write(SessionTokens(pair: pair, nowMs: now()))
  }

  /** The headers the Mac app sends the broker (`sand-client-metadata.ts`). */
  public nonisolated var clientHeaders: [String: String] {
    ["x-simeon-client-type": "sand", SimeonConfig.clientVersionHeader: clientVersion, "x-sand-box-namespace": "prod"]
  }

  private func url(_ path: String) -> URL {
    URL(string: base.absoluteString.trimmingTrailingSlashes + path)!
  }

  private func sessionEnded() {
    vault.write(nil)
    onEnded?()
  }

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
    let request = URLRequest.post(url(Tokens.refreshPath), json: ["grant_type": "refresh_token", "refresh_token": .string(current.refreshToken)])
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
  public func data(_ path: String, method: String? = nil, json: JSON? = nil) async throws -> JSON {
    var request = URLRequest(url: url(Self.desktopPrefix + path))
    request.httpMethod = method ?? (json == nil ? "GET" : "POST")
    if let json {
      request.httpBody = try json.data()
      request.setValue("application/json", forHTTPHeaderField: "content-type")
    }
    try await authorized(&request)
    let answer = try await http.send(request)
    if answer.status == 401 { sessionEnded() }
    guard answer.ok else { throw SimeonAPIError(message: "Simeon Labs' server answered \(path) with \(answer.status).", status: answer.status) }
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

  /** One unary call on the box broker, Connect JSON (`server/simeon/sand/connect.py`). */
  public func connect(_ method: String, _ message: JSON = [:], service: String = connectService) async throws -> JSON {
    var request = URLRequest.post(url("/\(service)/\(method)"), json: message, headers: ["connect-protocol-version": "1"])
    try await authorized(&request)
    let answer = try await http.send(request)
    if answer.status == 401 { sessionEnded() }
    guard answer.ok else {
      throw SimeonAPIError(message: answer.json?["message"]?.text ?? "Simeon's cloud computer answered \(method) with \(answer.status).", status: answer.status)
    }
    return answer.json ?? [:]
  }

  /** The account: `user_payload()` in server/simeon/desktop/service.py. */
  public func profile() async throws -> JSON { try await data("user/profile") }

  /** Signs this phone's session out on the server and forgets the pair. */
  public func signOut() async {
    let token = vault.read()?.accessToken
    vault.write(nil)
    guard let token else { return }
    var request = URLRequest(url: url(Self.desktopPrefix + "auth/logout"))
    request.httpMethod = "POST"
    request.setValue("Bearer \(token)", forHTTPHeaderField: "authorization")
    _ = try? await http.send(request)
  }
}
