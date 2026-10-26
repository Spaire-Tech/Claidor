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
  func makeGateway(_ http: Routes, saved: SavedGatewayStore? = nil, pause: @escaping @Sendable (TimeInterval) async -> Void = { _ in await Task.yield() }) -> Gateway {
    let vault = MemoryVault(SessionTokens(accessToken: GatewayConnectTests.token(sub: "u1"), refreshToken: "r", expiresAtMs: 9e15))
    let api = SimeonAPI(base: URL(string: "https://api.example.com")!, clientVersion: "1", vault: vault, http: http)
    return Gateway(api: api, http: http, saved: saved, pause: pause)
  }

  /** The address kept from the last launch, with the server's word on sleep then. */
  static func kept(letsSleep: Bool) -> MemorySavedGateway {
    MemorySavedGateway(SavedGateway.encode(GatewayConnection(baseURL: "https://box.test", token: "g", networkToken: "n", letsSleep: letsSleep), accountScope: "u1", savedAt: Date()))
  }

  /** The record's answer: `state` (1 none, 2 asleep, 3 running) and the server's word on sleep. */
  static func record(_ state: Int, letsSleep: Bool = true) -> Data {
    Data(#"{"state":\#(state),"letsSleep":\#(letsSleep)}"#.utf8)
  }

  static let listAgents = "/api/listAgents"

  /** Whether a call failed as a read that let the box rest. */
  func rested(_ call: () async throws -> JSON) async -> Bool {
    do { _ = try await call(); return false } catch { return GatewayError.isResting(error) }
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

  // MARK: The launch, and reading (step 4b)

  func testALaunchThatMayLetItSleepAsksTheRecordAndReadsLetItRestUntilAnActionWakesIt() async throws {
    let http = Routes()
    http.on(GatewayConnectTests.ensure) { _ in HTTPAnswer(status: 200, body: Self.box(letsSleep: true)) }
    http.on(Self.runState) { _ in HTTPAnswer(status: 200, body: Self.record(2)) }
    http.on(Self.listAgents) { _ in HTTPAnswer(status: 200, body: Data("[]".utf8)) }
    http.on("/api/sendPrompt") { _ in HTTPAnswer(status: 200, body: Data("{}".utf8)) }
    http.on("/health") { _ in HTTPAnswer(status: 200, body: Data(#"{"ok":true}"#.utf8)) }
    let gateway = makeGateway(http, saved: Self.kept(letsSleep: true))
    let atLaunch = await gateway.restAtLaunch()
    XCTAssertEqual(atLaunch, .asleep)
    let listRested = await rested { try await gateway.command("listAgents", wakes: false) }
    XCTAssertTrue(listRested, "the list is read from what was kept, not from the box")
    let tailRested = await rested { try await gateway.command("getAgentTranscriptTail", ["id": "theo"], wakes: false) }
    XCTAssertTrue(tailRested)
    XCTAssertEqual(http.count(GatewayConnectTests.ensure), 0, "never woken by the launch or a read")
    XCTAssertEqual(http.count(Self.listAgents), 0)
    XCTAssertEqual(http.count(Self.runState), 1, "the launch's one question")
    // An action (a message) wakes it, as before; then reads go to it.
    _ = try await gateway.command("sendPrompt", ["id": "theo"])
    let afterAction = await gateway.restAtLaunch()
    XCTAssertNil(afterAction)
    _ = try await gateway.command("listAgents", wakes: false)
    XCTAssertEqual(http.count(Self.listAgents), 1)
  }

  func testANewAccountsComputerIsNotMadeByTheLaunchOnlyByItsFirstTask() async throws {
    let http = Routes()
    http.on(GatewayConnectTests.ensure) { _ in HTTPAnswer(status: 200, body: Self.box(letsSleep: true)) }
    http.on(Self.runState) { _ in HTTPAnswer(status: 200, body: Self.record(1)) }
    http.on("/api/countAgents") { _ in HTTPAnswer(status: 200, body: Data(#"{"count":0}"#.utf8)) }
    let gateway = makeGateway(http, pause: { _ in try? await Task.sleep(nanoseconds: 5_000_000) })
    let atLaunch = await gateway.restAtLaunch()
    XCTAssertEqual(atLaunch, .absent, "nothing kept: the record is asked, and there is no computer yet")
    let listRested = await rested { try await gateway.command("listAgents", wakes: false) }
    XCTAssertTrue(listRested)
    // The events wait without dialling, which would make it.
    let told = Told()
    let waiting = Task { await gateway.waitWhileAsleep({ told.add($0) }, ask: false) }
    for _ in 0..<200 where told.values.isEmpty { try await Task.sleep(nanoseconds: 2_000_000) }
    XCTAssertEqual(told.values, [true])
    XCTAssertEqual(http.count(GatewayConnectTests.ensure), 0, "not made by the launch")
    // The first run's hand-off: its first task makes it.
    _ = try await gateway.command("countAgents")
    let waited = await waiting.value
    XCTAssertTrue(waited)
    XCTAssertEqual(http.count(GatewayConnectTests.ensure), 1)
    let afterTask = await gateway.restAtLaunch()
    XCTAssertNil(afterTask)
  }

  func testWhereTheServerKeptItAwakeTheLaunchAsksNothing() async throws {
    let http = Routes()
    http.on(GatewayConnectTests.ensure) { _ in HTTPAnswer(status: 200, body: Self.box(letsSleep: false)) }
    http.on(Self.runState) { _ in HTTPAnswer(status: 200, body: Self.record(2, letsSleep: false)) }
    http.on(Self.listAgents) { _ in HTTPAnswer(status: 200, body: Data("[]".utf8)) }
    let gateway = makeGateway(http, saved: Self.kept(letsSleep: false))
    let atLaunch = await gateway.restAtLaunch()
    XCTAssertNil(atLaunch)
    _ = try await gateway.command("listAgents", wakes: false)
    XCTAssertEqual(http.count(Self.listAgents), 1, "read from the box, as before")
    XCTAssertEqual(http.count(Self.runState), 0, "not asked")
  }

  func testASwitchTurnedOffIsHeardOverTheAddressKept() async throws {
    let http = Routes()
    http.on(GatewayConnectTests.ensure) { _ in HTTPAnswer(status: 200, body: Self.box(letsSleep: false)) }
    // Asleep (the old 30 minutes), and the server no longer lets an open app leave it so.
    http.on(Self.runState) { _ in HTTPAnswer(status: 200, body: Self.record(2, letsSleep: false)) }
    http.on(Self.listAgents) { _ in HTTPAnswer(status: 200, body: Data("[]".utf8)) }
    let gateway = makeGateway(http, saved: Self.kept(letsSleep: true))
    let atLaunch = await gateway.restAtLaunch()
    XCTAssertNil(atLaunch, "the kept word was the last launch's; the record's is now")
    _ = try await gateway.command("listAgents", wakes: false)
    XCTAssertEqual(http.count(Self.listAgents), 1, "read, waking it as before")
    let told = Told()
    let waited = await gateway.waitWhileAsleep { told.add($0) }
    XCTAssertFalse(waited)
  }

  func testAReadAsAChatOpensWaitsForTheBoxWithoutWakingIt() async throws {
    let http = Routes()
    http.on(GatewayConnectTests.ensure) { _ in HTTPAnswer(status: 200, body: Self.box(letsSleep: true)) }
    http.on(Self.runState) { _ in HTTPAnswer(status: 200, body: Self.record(2)) }
    http.on("/api/getAgentWorkflows") { _ in HTTPAnswer(status: 200, body: Data(#"[{"name":"Plan"}]"#.utf8)) }
    http.on("/api/sendPrompt") { _ in HTTPAnswer(status: 200, body: Data("{}".utf8)) }
    http.on("/health") { _ in HTTPAnswer(status: 200, body: Data(#"{"ok":true}"#.utf8)) }
    let gateway = makeGateway(http, saved: Self.kept(letsSleep: true), pause: { _ in try? await Task.sleep(nanoseconds: 2_000_000) })
    let reading = Task { try await gateway.commandWhenAwake("getAgentWorkflows", ["id": "theo"]) }
    try await Task.sleep(nanoseconds: 60_000_000)
    XCTAssertEqual(http.count("/api/getAgentWorkflows"), 0, "it waits")
    XCTAssertEqual(http.count(GatewayConnectTests.ensure), 0, "and does not wake it")
    // A message wakes it: the read goes on.
    _ = try await gateway.command("sendPrompt", ["id": "theo"])
    let answer = try await reading.value
    XCTAssertEqual(answer.array?.count, 1)

    // Its screen closed while the box rests: it ends, having read nothing.
    let quiet = Routes()
    quiet.on(Self.runState) { _ in HTTPAnswer(status: 200, body: Self.record(2)) }
    let other = makeGateway(quiet, saved: Self.kept(letsSleep: true), pause: { _ in try? await Task.sleep(nanoseconds: 2_000_000) })
    let closed = Task { try await other.commandWhenAwake("getAgentWorkflows", [:]) }
    try await Task.sleep(nanoseconds: 30_000_000)
    closed.cancel()
    do {
      _ = try await closed.value
      XCTFail("expected it to end")
    } catch {
      XCTAssertTrue(error is CancellationError)
    }
    XCTAssertEqual(quiet.count("/api/getAgentWorkflows") + quiet.count(GatewayConnectTests.ensure), 0)
  }

  func testWhatAChatReadsAsItOpensWaitsAndWhatThePersonDoesWakes() async throws {
    let backend = RestingBackend(rest: .asleep)
    let store = await MainActor.run { AppStore() }
    await store.attach(backend)
    _ = await store.workflows("theo", wakes: false)
    _ = await store.agentNetworkEnabled(wakes: false)
    _ = await store.channelsAvailable("theo", wakes: false)
    _ = await store.fileLine("/home/a.txt", wakes: false)
    _ = await store.readFile("/home/a.png", agentId: "theo", wakes: false)
    await store.loadApps(wakes: false)
    XCTAssertEqual(backend.woken, [], "nothing as the chat opens wakes it")
    XCTAssertEqual(Set(backend.waited), ["getAgentWorkflows", "isAgentNetworkEnabled", "getAgentChannels", "readAttachmentText", "readAttachmentChunk", "readAttachmentImage"])
    XCTAssertTrue(backend.held.contains("desktopMcp"), "the apps are not waited for: Settings' own read may join it")
    // "/" opening, or Settings, wakes it as before.
    _ = await store.agentNetworkEnabled()
    XCTAssertEqual(backend.woken, ["isAgentNetworkEnabled"])
  }

  func testARestingComputerIsNoFailureAndNothingAtLaunchWakesIt() async throws {
    let backend = RestingBackend(rest: .asleep)
    backend.serverAnswers["chats/agents"] = ["agents": [["id": "theo", "name": "Theo"]]]
    let store = await MainActor.run { () -> AppStore in
      let store = AppStore()
      store.readsServerCopy = true
      return store
    }
    await store.attach(backend)
    await MainActor.run {
      XCTAssertFalse(store.rosterFailed, "resting is not a failure")
      XCTAssertNil(store.problem)
    }
    await store.refresh("theo")
    let gate = await store.firstRun()
    await MainActor.run {
      XCTAssertFalse(store.loadFailed.contains("theo"), "nor is a chat read while it rests")
      XCTAssertEqual(gate, .seen, "agents in the server's copy: an account that has used Simeon")
      XCTAssertEqual(store.agents.map(\.id), ["theo"])
    }
    XCTAssertEqual(backend.woken, [], "nothing at launch woke it")
    XCTAssertTrue(backend.held.contains("getHostSettings"), "the pins waited for it")
  }

  func testANewAccountGetsTheFirstRunWithoutItsComputerBeingMade() async throws {
    let backend = RestingBackend(rest: .absent)
    let store = await MainActor.run { AppStore() }
    await store.attach(backend)
    let gate = await store.firstRun()
    XCTAssertEqual(gate, .needed)
    XCTAssertEqual(backend.woken, [], "the launch made nothing")
    // Asleep and nothing listed anywhere: asked, waking it, as before (an account on a new device whose copy is empty).
    let other = RestingBackend(rest: .asleep)
    let otherStore = await MainActor.run { AppStore() }
    await otherStore.attach(other)
    _ = await otherStore.firstRun()
    XCTAssertEqual(other.woken.first, "getHostSettings")
  }

  func testBackFromRestWhatWaitedIsReadAndTheLanguageTold() async throws {
    let backend = RestingBackend(rest: .asleep)
    let store = await MainActor.run { AppStore() }
    await store.attach(backend)
    for _ in 0..<400 where !backend.held.contains("setHostSettings") { try await Task.sleep(nanoseconds: 5_000_000) }
    XCTAssertTrue(backend.held.contains("setHostSettings"), "the language waited")
    XCTAssertEqual(backend.woken, [])
    backend.rest = nil
    await MainActor.run {
      store.apply(.computerAsleep(true))
      store.apply(.connection(live: true))
    }
    for _ in 0..<400 where !(backend.read.contains("setHostSettings") && backend.read.contains("getHostSettings")) {
      try await Task.sleep(nanoseconds: 5_000_000)
    }
    XCTAssertTrue(backend.read.contains("getHostSettings"), "the pins")
    XCTAssertTrue(backend.read.contains("setHostSettings"), "the language")
  }

  func testTheHandOffTellsTheLanguageBeforeSimeonIsMade() async throws {
    let backend = RestingBackend(rest: .absent)
    let store = await MainActor.run { AppStore() }
    await store.attach(backend)
    let id = try await store.handOff(ready: {}, wait: { _ in })
    XCTAssertEqual(id, "simeon")
    let language = backend.woken.firstIndex(of: "setHostSettings")
    let made = backend.woken.firstIndex(of: "createAgent")
    XCTAssertNotNil(language)
    XCTAssertNotNil(made)
    XCTAssertLessThan(language ?? .max, made ?? -1, "his introduction is in the person's language")
    XCTAssertEqual(backend.woken.first, "countAgents", "the first task makes the computer")
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

/**
 * A computer that rests where the server lets it (step 4): reads that let it
 * rest fail as the gateway's do (`GatewayError.resting`); any other command
 * wakes it (or makes it) and is kept in `woken`.
 */
final class RestingBackend: AgentBackend, @unchecked Sendable {
  private let lock = NSLock()
  private var resting: Gateway.Rest?
  private var wokenList: [String] = []
  private var heldList: [String] = []
  private var readList: [String] = []
  var serverAnswers: [String: JSON] = [:]
  init(rest: Gateway.Rest?) { resting = rest }
  var rest: Gateway.Rest? {
    get { lock.withLock { resting } }
    set { lock.withLock { resting = newValue } }
  }
  /** Commands that woke it, in order. */
  var woken: [String] { lock.withLock { wokenList } }
  /** Reads that let it rest. */
  var held: [String] { lock.withLock { heldList } }
  /** Reads that found it awake. */
  var read: [String] { lock.withLock { readList } }
  private var waitedList: [String] = []
  /** Reads that waited for it (`commandWhenAwake`), as if it then woke for its work. */
  var waited: [String] { lock.withLock { waitedList } }
  private func readIfAwake(_ method: String) throws {
    try lock.withLock {
      if resting != nil { heldList.append(method); throw GatewayError.resting }
      readList.append(method)
    }
  }
  func listAgents() async throws -> [Agent] { try readIfAwake("listAgents"); return [Agent(id: "theo", name: "Theo")] }
  func transcript(_ agentId: String) async throws -> [Entry] { try readIfAwake("openAgentTail"); return [] }
  func tail(_ agentId: String, limit: Int) async throws -> [Entry] { try readIfAwake("getAgentTranscriptTail"); return [] }
  func send(_ agentId: String, text: String, attachments: [AttachmentRef], options: SendOptions, nonce: String?) async throws { _ = try await command("sendPrompt", [:]) }
  func markRead(_ agentId: String) async {}
  func createAgent(name: String, face: String?) async throws -> String { "x" }
  func createGroup(name: String, memberIds: [String]) async throws -> String { "g" }
  func answer(_ agentId: String, entryId: String, value: String) async throws {}
  func updateAgent(_ agentId: String, name: String, title: String, description: String) async throws {}
  func routines(_ agentId: String) async throws -> [JSON] { [] }
  func events() -> AsyncStream<BackendEvent> { AsyncStream { _ in } }
  var call: CallEngine? { nil }
  func command(_ method: String, _ args: JSON) async throws -> JSON {
    lock.withLock { wokenList.append(method); resting = nil }
    switch method {
    case "countAgents": return ["count": 0]
    case "createAgent": return ["agent": ["id": "simeon"]]
    default: return [:]
    }
  }
  func commandIfAwake(_ method: String, _ args: JSON) async throws -> JSON {
    try readIfAwake(method)
    return [:]
  }
  func commandWhenAwake(_ method: String, _ args: JSON) async throws -> JSON {
    lock.withLock { waitedList.append(method) }
    return [:]
  }
  func computerRest() async -> Gateway.Rest? { rest }
  func server(_ path: String, method: String?, body: JSON?) async throws -> JSON { serverAnswers[path] ?? [:] }
  func screen(_ agentId: String) async throws -> ScreenState { ScreenState(socket: nil, state: "starting") }
}
