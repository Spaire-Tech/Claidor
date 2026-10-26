import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import XCTest
@testable import SimeonCore

/**
 * The computer used only for runs (26 October 2026, step 4 of the computer
 * as a worker): where the server lets the box sleep while the app is open
 * (`letsSleep` in EnsureSandBox's answer), the app says so on its requests,
 * and after the stream drops it does not dial a box the broker records as
 * asleep: it waits, without waking it, until the record says it runs or
 * something here needed it. "Reconnecting" does not start for a computer
 * asleep on purpose. Where the server does not say so, nothing changes.
 */
final class SleepingComputerTests: XCTestCase {
  typealias Routes = GatewayConnectTests.Routes

  static let runState = "/simeon.v1.ComputerService/GetSandBoxRunState"

  static func box(letsSleep: Bool) -> Data {
    Data(#"{"gatewayUrl":"https://box.test","gatewayToken":"g","networkToken":"n","letsSleep":\#(letsSleep)}"#.utf8)
  }

  /** A gateway whose waits are over at once, unless `pause` says otherwise. */
  func makeGateway(_ http: Routes, pause: @escaping @Sendable (TimeInterval) async -> Void = { _ in await Task.yield() }) -> Gateway {
    let vault = MemoryVault(SessionTokens(accessToken: GatewayConnectTests.token(sub: "u1"), refreshToken: "r", expiresAtMs: 9e15))
    let api = SimeonAPI(base: URL(string: "https://api.example.com")!, clientVersion: "1", vault: vault, http: http)
    return Gateway(api: api, http: http, saved: nil, pause: pause)
  }

  /** What `onAsleep` was told, from whatever thread. */
  final class Told: @unchecked Sendable {
    private let lock = NSLock()
    private var list: [Bool] = []
    func add(_ value: Bool) { lock.withLock { list.append(value) } }
    var values: [Bool] { lock.withLock { list } }
  }

  func testTheServersWordIsReadAndSaidOnEveryRequest() throws {
    let sleeps = try GatewayConnection(box: try JSON.parse(Self.box(letsSleep: true)))
    XCTAssertTrue(sleeps.letsSleep)
    XCTAssertEqual(sleeps.headers()["x-simeon-lets-sleep"], "1")
    XCTAssertEqual(sleeps.commandRequest("listAgents", [:]).value(forHTTPHeaderField: "x-simeon-lets-sleep"), "1")
    XCTAssertEqual(sleeps.eventsRequest().value(forHTTPHeaderField: "x-simeon-lets-sleep"), "1")
    let keeps = try GatewayConnection(box: try JSON.parse(Self.box(letsSleep: false)))
    XCTAssertFalse(keeps.letsSleep)
    XCTAssertNil(keeps.headers()["x-simeon-lets-sleep"])
    // An answer from a server built before says nothing: awake while open, as before.
    XCTAssertFalse(try GatewayConnection(box: ["gatewayUrl": "https://box.test"]).letsSleep)
  }

  func testAnAsleepBoxIsWaitedForOnTheRecordNotDialledUntilItRuns() async throws {
    let http = Routes()
    http.on(GatewayConnectTests.ensure) { _ in HTTPAnswer(status: 200, body: Self.box(letsSleep: true)) }
    let reads = LockedCount()
    http.on(Self.runState) { _ in
      // Asleep for the first read and the next 15-second one, then running (woken for a message).
      HTTPAnswer(status: 200, body: Data(#"{"state":\#(reads.next() < 2 ? 2 : 3)}"#.utf8))
    }
    let gateway = makeGateway(http)
    _ = try await gateway.currentConnection()
    XCTAssertEqual(http.count(GatewayConnectTests.ensure), 1)
    let told = Told()
    let waited = await gateway.waitWhileAsleep { told.add($0) }
    XCTAssertTrue(waited)
    XCTAssertEqual(told.values, [true], "asleep, and left so until the stream is back")
    XCTAssertEqual(http.count(Self.runState), 3, "the record, read again every 15 s")
    XCTAssertEqual(http.count(GatewayConnectTests.ensure), 1, "never woken from here while it slept")
  }

  func testSomethingThatNeedsTheBoxWakesItAndEndsTheWait() async throws {
    let http = Routes()
    http.on(GatewayConnectTests.ensure) { _ in HTTPAnswer(status: 200, body: Self.box(letsSleep: true)) }
    http.on(Self.runState) { _ in HTTPAnswer(status: 200, body: Data(#"{"state":2}"#.utf8)) }
    let gateway = makeGateway(http, pause: { _ in try? await Task.sleep(nanoseconds: 5_000_000) })
    _ = try await gateway.currentConnection()
    let told = Told()
    let waiting = Task { await gateway.waitWhileAsleep { told.add($0) } }
    for _ in 0..<200 where told.values.isEmpty { try await Task.sleep(nanoseconds: 2_000_000) }
    XCTAssertEqual(told.values, [true])
    // A command: the box no longer answers at its address, the broker is asked, and wakes it.
    await gateway.invalidate()
    _ = try await gateway.currentConnection()
    let waited = await waiting.value
    XCTAssertTrue(waited)
    XCTAssertEqual(http.count(GatewayConnectTests.ensure), 2)
  }

  func testWhereTheServerKeepsItAwakeOrItRunsNothingWaits() async throws {
    let http = Routes()
    http.on(GatewayConnectTests.ensure) { _ in HTTPAnswer(status: 200, body: Self.box(letsSleep: false)) }
    http.on(Self.runState) { _ in HTTPAnswer(status: 200, body: Data(#"{"state":2}"#.utf8)) }
    let gateway = makeGateway(http)
    _ = try await gateway.currentConnection()
    let told = Told()
    let waited = await gateway.waitWhileAsleep { told.add($0) }
    XCTAssertFalse(waited)
    XCTAssertEqual(http.count(Self.runState), 0, "not even asked")

    let running = Routes()
    running.on(GatewayConnectTests.ensure) { _ in HTTPAnswer(status: 200, body: Self.box(letsSleep: true)) }
    running.on(Self.runState) { _ in HTTPAnswer(status: 200, body: Data(#"{"state":3}"#.utf8)) }
    let other = makeGateway(running)
    _ = try await other.currentConnection()
    let woke = await other.waitWhileAsleep { told.add($0) }
    XCTAssertFalse(woke, "a box that runs is dialled as before")
    XCTAssertEqual(told.values, [false], "and it is no longer asleep: a failure to reach it shows")
  }

  func testAComputerAsleepOnPurposeIsNotReconnecting() async throws {
    try await MainActor.run {
      let store = AppStore()
      store.apply(.connection(live: true))
      store.apply(.connection(live: false))
      XCTAssertTrue(store.isDown)
      XCTAssertFalse(store.rebuildInputs.transportConnected)
      store.apply(.computerAsleep(true))
      XCTAssertTrue(store.isAsleep)
      XCTAssertTrue(store.isDown, "messages still go to the server")
      XCTAssertTrue(store.rebuildInputs.transportConnected, "\"Reconnecting\" does not start")
      store.apply(.connection(live: true))
      XCTAssertFalse(store.isAsleep)
      XCTAssertTrue(store.rebuildInputs.transportConnected)
      store.apply(.computerAsleep(true))
      store.apply(.computerAsleep(false))
      XCTAssertFalse(store.isAsleep)
    }
  }
}

/** A count from whatever thread: each `next` answers the count before it. */
final class LockedCount: @unchecked Sendable {
  private let lock = NSLock()
  private var value = 0
  func next() -> Int { lock.withLock { defer { value += 1 }; return value } }
}
