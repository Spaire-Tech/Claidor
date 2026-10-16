import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import XCTest
@testable import SimeonCore

/**
 * Reaching the computer as the Electron app reaches it (16 October 2026):
 * the address kept from the last launch at once while the broker is asked
 * (`createGatewayConnectFastPath`), `/health` before the broker
 * (`SandHostSupervisor.ensureConnection`), the hold on a full box server
 * (`BrokeredHostConnector.connect`), and the event stream's waits
 * (`runEventLoop`).
 */
final class GatewayConnectTests: XCTestCase {
  /** A server that answers by path, in any order, and keeps every request. */
  final class Routes: HTTPClient, @unchecked Sendable {
    private let lock = NSLock()
    private var handlers: [(String, (URLRequest) -> HTTPAnswer)] = []
    private var requests: [URLRequest] = []

    func on(_ suffix: String, _ answer: @escaping (URLRequest) -> HTTPAnswer) { lock.withLock { handlers.insert((suffix, answer), at: 0) } }

    func send(_ request: URLRequest) async throws -> HTTPAnswer {
      let handler: ((URLRequest) -> HTTPAnswer)? = lock.withLock {
        requests.append(request)
        let address = request.url?.absoluteString ?? ""
        return handlers.first { address.hasSuffix($0.0) }?.1
      }
      return handler?(request) ?? HTTPAnswer(status: 500)
    }

    var sent: [String] { lock.withLock { requests.map { $0.url?.absoluteString ?? "" } } }
    func count(_ suffix: String) -> Int { sent.filter { $0.hasSuffix(suffix) }.count }
  }

  final class Clock: @unchecked Sendable {
    private let lock = NSLock()
    private var seconds: TimeInterval = 1_000
    var now: TimeInterval { lock.withLock { seconds } }
    func advance(_ by: TimeInterval) { lock.withLock { seconds += by } }
  }

  static let ensure = "/simeon.v1.ComputerService/EnsureSandBox"

  /** An access token as the server wraps it (`envelope_access_token`), for account `sub`. */
  static func token(sub: String) -> String {
    let payload = try! JSON.object(["sub": .string(sub), "exp": .number(9e9)]).data()
    let encoded = payload.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    return "simeon_da_eyJhbGciOiJIUzI1NiJ9.\(encoded).sig"
  }

  static func box(_ host: String) -> Data {
    json(#"{"gatewayUrl":"https://\#(host)","gatewayToken":"g-\#(host)","networkToken":"n-\#(host)"}"#)
  }

  static func kept(_ host: String, account: String, savedAt: Date = Date()) -> Data {
    SavedGateway.encode(GatewayConnection(baseURL: "https://\(host)", token: "g-\(host)", networkToken: "n-\(host)"), accountScope: account, savedAt: savedAt)!
  }

  func makeGateway(_ http: Routes, account: String = "u1", saved: SavedGatewayStore? = nil, clock: Clock = Clock()) -> Gateway {
    let vault = MemoryVault(SessionTokens(accessToken: Self.token(sub: account), refreshToken: "r", expiresAtMs: 9e15))
    let api = SimeonAPI(base: URL(string: "https://api.example.com")!, clientVersion: "1", vault: vault, http: http)
    return Gateway(api: api, http: http, saved: saved, clock: { clock.now })
  }

  /** Waits (a little) for something that happens in the background. */
  func eventually(_ condition: () -> Bool) async {
    for _ in 0..<200 where !condition() { try? await Task.sleep(nanoseconds: 5_000_000) }
  }

  func testTheAccountIsTheTokensSubject() {
    XCTAssertEqual(Tokens.subject(ofAccessToken: Self.token(sub: "be26f651")), "be26f651")
    XCTAssertNil(Tokens.subject(ofAccessToken: "opaque"))
  }

  func testTheStreamDialsAgainAfterOneTwoFourEightThenTenSeconds() {
    XCTAssertEqual((1...7).map(Gateway.reconnectDelay(failures:)), [1, 2, 4, 8, 10, 10, 10])
    XCTAssertEqual(Gateway.stallSeconds, 35)
    XCTAssertEqual(GatewayConnection(baseURL: "https://b", token: nil, networkToken: nil).eventsRequest().timeoutInterval, 35)
  }

  func testAKeptAddressIsForItsAccountAndForSevenDays() {
    let now = Date()
    XCTAssertEqual(SavedGateway.decode(Self.kept("b", account: "u1"), accountScope: "u1", now: now)?.baseURL, "https://b")
    XCTAssertEqual(SavedGateway.decode(Self.kept("b", account: "u1"), accountScope: "u1", now: now)?.token, "g-b")
    XCTAssertNil(SavedGateway.decode(Self.kept("b", account: "u1"), accountScope: "u2", now: now), "another account's")
    XCTAssertNil(SavedGateway.decode(Self.kept("b", account: "u1", savedAt: now.addingTimeInterval(-8 * 86_400)), accountScope: "u1", now: now), "older than seven days")
    XCTAssertNil(SavedGateway.decode(Data("{}".utf8), accountScope: "u1", now: now))
    XCTAssertNil(SavedGateway.decode(nil, accountScope: "u1", now: now))
  }

  func testAtLaunchTheKeptAddressIsUsedAtOnceWhileTheBrokerIsAsked() async throws {
    let http = Routes()
    http.on(Self.ensure) { _ in HTTPAnswer(status: 200, body: Self.box("fresh")) }
    http.on("/api/listAgents") { _ in HTTPAnswer(status: 200, body: json("[]")) }
    http.on("/health") { _ in HTTPAnswer(status: 200, body: json(#"{"ok":true}"#)) }
    let saved = MemorySavedGateway(Self.kept("kept", account: "u1"))
    let gateway = makeGateway(http, saved: saved)

    _ = try await gateway.command("listAgents")
    XCTAssertTrue(http.sent.contains("https://kept/api/listAgents"), "the kept address, without waiting for the broker")
    await eventually { saved.read().flatMap { SavedGateway.decode($0, accountScope: "u1", now: Date()) }?.baseURL == "https://fresh" }
    XCTAssertEqual(SavedGateway.decode(saved.read(), accountScope: "u1", now: Date())?.baseURL, "https://fresh", "the broker's answer is kept for the next launch")
    XCTAssertEqual(http.count(Self.ensure), 1)

    // From then on the broker's answer: asked about with /health, not the broker again.
    let connection = try await gateway.currentConnection()
    XCTAssertEqual(connection.baseURL, "https://fresh")
    XCTAssertEqual(http.count(Self.ensure), 1)
  }

  func testAnotherAccountsKeptAddressIsNotUsed() async throws {
    let http = Routes()
    http.on(Self.ensure) { _ in HTTPAnswer(status: 200, body: Self.box("mine")) }
    let gateway = makeGateway(http, account: "u2", saved: MemorySavedGateway(Self.kept("theirs", account: "u1")))
    let connection = try await gateway.currentConnection()
    XCTAssertEqual(connection.baseURL, "https://mine")
    XCTAssertFalse(http.sent.contains { $0.contains("theirs") })
  }

  func testAKeptAddressThatFailsIsNotTriedAgain() async throws {
    let http = Routes()
    // The box went to sleep since: the proxy has nothing to forward to.
    http.on("https://kept/api/listAgents") { _ in HTTPAnswer(status: 502) }
    http.on(Self.ensure) { _ in HTTPAnswer(status: 200, body: Self.box("woken")) }
    http.on("https://woken/api/listAgents") { _ in HTTPAnswer(status: 200, body: json(#"[{"id":"simeon","name":"Simeon"}]"#)) }
    let gateway = makeGateway(http, saved: MemorySavedGateway(Self.kept("kept", account: "u1")))
    let answer = try await gateway.command("listAgents")
    XCTAssertEqual(answer.array?.count, 1)
    XCTAssertEqual(http.sent.filter { $0.hasSuffix("/api/listAgents") }, ["https://kept/api/listAgents", "https://woken/api/listAgents"])
    XCTAssertEqual(http.count(Self.ensure), 1, "the one broker call, joined")
  }

  func testAKeptAddressThatDoesNotAnswerHealthWaitsForTheBroker() async throws {
    let http = Routes()
    var asked = 0
    // The box is waking: the first answer is the broker's "still starting", the next one the box.
    http.on(Self.ensure) { _ in
      asked += 1
      return asked == 1 ? HTTPAnswer(status: 503, body: json(#"{"code":"unavailable","message":"Simeon's cloud computer is still starting."}"#)) : HTTPAnswer(status: 200, body: Self.box("woken"))
    }
    http.on("https://kept/health") { _ in HTTPAnswer(status: 502) }
    let gateway = makeGateway(http, saved: MemorySavedGateway(Self.kept("kept", account: "u1")))
    let first = try await gateway.currentConnection()
    XCTAssertEqual(first.baseURL, "https://kept")
    var waited = 0
    while await gateway.isAskingBroker, waited < 200 { try? await Task.sleep(nanoseconds: 5_000_000); waited += 1 }
    XCTAssertEqual(http.count(Self.ensure), 1)
    let second = try await gateway.currentConnection()
    XCTAssertEqual(second.baseURL, "https://woken", "the kept address is handed out once")
    XCTAssertEqual(http.count(Self.ensure), 2)
  }

  func testAKnownAddressIsCheckedWithHealthBeforeTheBrokerIsAskedAgain() async throws {
    let http = Routes()
    let clock = Clock()
    var healthy = true
    http.on(Self.ensure) { _ in HTTPAnswer(status: 200, body: Self.box("b1")) }
    http.on("/health") { request in
      XCTAssertEqual(request.value(forHTTPHeaderField: "authorization"), "Bearer g-b1")
      XCTAssertEqual(request.value(forHTTPHeaderField: "x-anyrun-network-token"), "n-b1")
      XCTAssertEqual(request.timeoutInterval, 1.5)
      return healthy ? HTTPAnswer(status: 200, body: json(#"{"ok":true,"isBusy":false}"#)) : HTTPAnswer(status: 502)
    }
    let gateway = makeGateway(http, clock: clock)
    _ = try await gateway.currentConnection()
    XCTAssertEqual(http.count(Self.ensure), 1)

    // Answers /health: kept, and trusted for 5 s.
    _ = try await gateway.currentConnection()
    _ = try await gateway.currentConnection()
    XCTAssertEqual(http.count("/health"), 1)
    XCTAssertEqual(http.count(Self.ensure), 1)
    clock.advance(5.1)
    _ = try await gateway.currentConnection()
    XCTAssertEqual(http.count("/health"), 2)

    // While the event stream is up, no /health at all; once it drops, /health again.
    clock.advance(10)
    await gateway.streamConnected()
    _ = try await gateway.currentConnection()
    XCTAssertEqual(http.count("/health"), 2)
    await gateway.streamDropped()
    _ = try await gateway.currentConnection()
    XCTAssertEqual(http.count("/health"), 3)
    XCTAssertEqual(http.count(Self.ensure), 1)

    // No answer from /health: the broker is asked.
    healthy = false
    clock.advance(10)
    _ = try await gateway.currentConnection()
    XCTAssertEqual(http.count(Self.ensure), 2)
  }

  func testAFullBoxServerIsNotAskedAgainBeforeItsRetryAfter() async {
    let http = Routes()
    let clock = Clock()
    http.on(Self.ensure) { _ in HTTPAnswer(status: 429, headers: ["X-Automation-Failure-Hint": "SAND_BOX_BLOCKED", "Retry-After": "30"], body: json(#"{"code":"resource_exhausted","message":"Simeon's cloud computers are all in use."}"#)) }
    let gateway = makeGateway(http, clock: clock)
    for _ in 0..<3 {
      do { _ = try await gateway.currentConnection(); XCTFail("expected the refusal") }
      catch { XCTAssertEqual(error.localizedDescription, "Simeon's cloud computers are all in use.") }
    }
    XCTAssertEqual(http.count(Self.ensure), 1, "held")
    clock.advance(31)
    _ = try? await gateway.currentConnection()
    XCTAssertEqual(http.count(Self.ensure), 2)
    // Without a retry-after, a minute.
    let other = Routes()
    other.on(Self.ensure) { _ in HTTPAnswer(status: 429, headers: ["x-automation-failure-hint": "SAND_BOX_BLOCKED"]) }
    let held = makeGateway(other, clock: clock)
    _ = try? await held.currentConnection()
    clock.advance(59)
    _ = try? await held.currentConnection()
    XCTAssertEqual(other.count(Self.ensure), 1)
    clock.advance(2)
    _ = try? await held.currentConnection()
    XCTAssertEqual(other.count(Self.ensure), 2)
  }

  func testARefusedAccountForgetsItsKeptAddress() async {
    let http = Routes()
    http.on(Self.ensure) { _ in HTTPAnswer(status: 403, body: json(#"{"code":"permission_denied","message":"No active plan."}"#)) }
    http.on("/api/listAgents") { _ in HTTPAnswer(status: 502) }
    let saved = MemorySavedGateway(Self.kept("kept", account: "u1"))
    let gateway = makeGateway(http, saved: saved)
    _ = try? await gateway.command("listAgents")
    await eventually { saved.read() == nil }
    XCTAssertNil(saved.read())
  }

  func testInvalidatingAsksTheBrokerNotTheKeptAddress() async throws {
    let http = Routes()
    http.on(Self.ensure) { _ in HTTPAnswer(status: 200, body: Self.box("fresh")) }
    let gateway = makeGateway(http, saved: MemorySavedGateway(Self.kept("kept", account: "u1")))
    await gateway.invalidate()
    let connection = try await gateway.currentConnection()
    XCTAssertEqual(connection.baseURL, "https://fresh")
  }
}
