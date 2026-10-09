import XCTest
@testable import SimeonCore

/** The window's status store (`TTn`) and the rebuild driver (`H$n`), rule by rule, with a hand-wound clock. */
final class ComputerBookTests: XCTestCase {
  func status(_ agent: String, _ state: String = "running", vnc: String? = "http://127.0.0.1:6080/vnc.html", extra: [String: JSON] = [:]) -> BoxStatus {
    var json: JSON = ["agentId": .string(agent), "state": .string(state), "vncUrl": vnc.map { .string($0) } ?? .null]
    for (key, value) in extra { json = json.setting(key, value) }
    return BoxStatus(json: json)!
  }

  func testReadStates() {
    var book = ComputerBook()
    XCTAssertEqual(book.readState("a"), .unknown)
    let first = book.beginRead("a")!
    XCTAssertNil(book.beginRead("a"), "one read at a time")
    book.readFailed("a", attempt: first)
    XCTAssertEqual(book.readState("a"), .error, "Can't reach… before any status")
    let retry = book.beginRead("a")!
    XCTAssertEqual(book.readState("a"), .unknown, "Retry clears the error while it reads")
    book.readAnswered("a", attempt: retry, status("a"))
    XCTAssertEqual(book.readState("a"), .known)
    XCTAssertEqual(book.phase("a"), .running)
    let third = book.beginRead("a")!
    book.readFailed("a", attempt: third)
    XCTAssertEqual(book.readState("a"), .known, "a failure keeps the last status")
    XCTAssertNotNil(book.status("a"))
  }

  func testEmptyAnswerCountsAsRead() {
    var book = ComputerBook()
    let attempt = book.beginRead("a")!
    book.readAnswered("a", attempt: attempt, nil)
    XCTAssertEqual(book.readState("a"), .known)
    XCTAssertEqual(book.phase("a"), .off)
  }

  func testLateAnswersAndPushes() {
    var book = ComputerBook()
    let attempt = book.beginRead("a")!
    book.readFailed("a", attempt: attempt)
    book.lateRead("a", attempt: attempt, status("a", "hibernated", vnc: nil))
    XCTAssertEqual(book.phase("a"), .sleeping, "a late answer is taken when nothing newer came")
    let next = book.beginRead("a")!
    book.ingest(status("a"))
    book.readAnswered("a", attempt: next, status("a", "absent", vnc: nil))
    XCTAssertEqual(book.phase("a"), .running, "a push is newer than the read under way")
  }

  func testEnsure() {
    var book = ComputerBook()
    let generation = book.beginEnsure("a")!
    XCTAssertTrue(book.demanded.contains("a"))
    XCTAssertNil(book.beginEnsure("a"))
    XCTAssertEqual(book.phase("a"), .starting)
    book.ensureSettled("a", generation: generation, nil, failed: true)
    XCTAssertEqual(book.readState("a"), .error)
    XCTAssertEqual(book.phase("a"), .off)
    let again = book.beginEnsure("a")!
    book.reset()
    book.ensureSettled("a", generation: again, status("a"), failed: false)
    XCTAssertNil(book.status("a"), "a start from before the account went is dropped")
    XCTAssertTrue(book.demanded.isEmpty)
  }

  func testStatusIsFiledUnderItsAgentAndCarriesTheDisk() {
    var book = ComputerBook()
    let attempt = book.beginRead("a")!
    book.readAnswered("a", attempt: attempt, status("b", extra: ["diskPressure": ["level": "soft"]]))
    XCTAssertNotNil(book.status("b"))
    XCTAssertEqual(book.diskPressure?["level"]?.string, "soft")
    book.ingest(status("b"))
    XCTAssertNil(book.diskPressure, "a status without pressure clears it")
    book.ingestDiskPressure(["level": "hard"])
    XCTAssertEqual(book.diskPressure?["level"]?.string, "hard")
    book.ingestDiskPressure(nil)
    XCTAssertNil(book.diskPressure)
    XCTAssertEqual(book.mostRecent?.agentId, "b")
  }

  func testKeepsThirtyTwo() {
    var book = ComputerBook()
    book.watch("kept")
    for index in 0..<40 { book.ingest(status("agent\(index)")) }
    XCTAssertEqual(book.entries.count, 32)
    XCTAssertTrue(book.isWatched("kept"), "a watched one stays")
  }

  func testReconnectAndFocus() {
    var book = ComputerBook()
    book.watch("a"); book.watch("b")
    _ = book.beginEnsure("b")
    let reading = book.beginRead("a")!
    let (reads, ensures) = book.reconnected()
    XCTAssertEqual(Set(reads), ["a", "b"])
    XCTAssertEqual(ensures, ["b"])
    XCTAssertNotNil(book.beginRead("a"), "the read under way is dropped")
    book.readAnswered("a", attempt: reading, status("a"))
    XCTAssertNil(book.status("a"), "its answer is too old")
    book.unwatch("a")
    XCTAssertEqual(book.focused().read, ["b"])
  }
}

@MainActor
final class ManualClock: RebuildClock {
  var time = 1_000.0
  private var jobs: [(at: Double, id: Int, work: @MainActor () -> Void)] = []
  private var nextId = 0
  func now() -> Double { time }
  func schedule(after ms: Double, _ work: @escaping @MainActor () -> Void) -> () -> Void {
    nextId += 1
    let id = nextId
    jobs.append((time + ms, id, work))
    return { [weak self] in self?.jobs.removeAll { $0.id == id } }
  }
  func advance(_ ms: Double) {
    let end = time + ms
    while let next = jobs.filter({ $0.at <= end }).min(by: { $0.at < $1.at }) {
      jobs.removeAll { $0.id == next.id }
      time = next.at
      next.work()
    }
    time = end
  }
}

@MainActor
final class RebuildDriverTests: XCTestCase {
  func settle() async { for _ in 0..<40 { await Task.yield() } }

  func make(update: RecreateAnswer = .started(operationId: "op1"), reset: RecreateAnswer = .started(operationId: "op2")) -> (RebuildDriver, ManualClock, RebuildDriver.Inputs) {
    let clock = ManualClock()
    let driver = RebuildDriver(clock: clock)
    let inputs = RebuildDriver.Inputs(boxId: "a", phase: .running, transportConnected: true)
    driver.connect(calls: .init(update: { _, _ in update }, reset: { reset }), inputs: inputs)
    return (driver, clock, inputs)
  }

  func testReconnectingAfterTwoAndAHalfSeconds() {
    var (driver, clock, inputs) = make()
    inputs.transportConnected = false
    driver.transportChanged(inputs)
    clock.advance(2_400)
    XCTAssertNil(driver.lock.kind)
    clock.advance(200)
    XCTAssertEqual(driver.lock.kind, .reconnecting)
    XCTAssertEqual(driver.surface.surface, .foreground)
    XCTAssertEqual(RebuildWords.reconnecting(stage: driver.lock.stage, connected: false).title, "Reconnecting")
    clock.advance(120_000)
    XCTAssertEqual(driver.escalation, .unreachable)
    driver.keepWaiting()
    XCTAssertNil(driver.escalation, "Retry only starts the two minutes again")
    inputs.transportConnected = true
    driver.transportChanged(inputs)
    XCTAssertEqual(RebuildWords.reconnecting(stage: driver.lock.stage, connected: true).title, "Checking connection")
    clock.advance(1_000)
    XCTAssertNil(driver.lock.kind, "it lets go a second after the stream is back")
    XCTAssertEqual(driver.lock.lastResolution, .settled)
  }

  func testNoReconnectingForAGroup() {
    var (driver, clock, inputs) = make()
    inputs.boxId = nil; inputs.isCurrentGroup = true
    driver.selectionChanged(inputs)
    inputs.transportConnected = false
    driver.transportChanged(inputs)
    clock.advance(5_000)
    XCTAssertNil(driver.lock.kind)
  }

  func testUpdateRunsToTheEnd() async {
    var (driver, clock, inputs) = make()
    driver.update()
    XCTAssertEqual(driver.pendingKind, .update)
    XCTAssertEqual(driver.lock.kind, .update)
    XCTAssertEqual(driver.lock.stage, .preparing)
    XCTAssertEqual(driver.surface.surface, .background, "an update shows as the banner")
    XCTAssertTrue(driver.isHardLocked)
    await settle()
    XCTAssertTrue(driver.lock.hasRequestAcknowledgement)
    inputs.transportConnected = false
    driver.transportChanged(inputs)
    XCTAssertEqual(driver.lock.teardownObserved, .transport)
    inputs.phase = .starting
    driver.statusChanged(inputs)
    driver.migrationEvent(MigrationEvent(operationId: "op1", phase: .creating))
    XCTAssertEqual(driver.lock.operationId, "op1")
    inputs.transportConnected = true
    driver.transportChanged(inputs)
    driver.migrationEvent(MigrationEvent(operationId: "op1", phase: .done))
    await settle()
    XCTAssertNil(driver.pendingKind, "the call ends with the operation")
    inputs.phase = .running
    driver.statusChanged(inputs)
    XCTAssertEqual(driver.lock.kind, .update)
    clock.advance(999)
    XCTAssertEqual(driver.lock.kind, .update)
    clock.advance(1)
    XCTAssertNil(driver.lock.kind)
    XCTAssertEqual(driver.lock.lastResolution, .settled)
    XCTAssertNil(driver.failure)
  }

  func testRefusedResetShowsItsFailure() async {
    let (driver, _, _) = make(reset: .rejected("Couldn't reset the computer (no box). It is unchanged."))
    driver.recoverComputer()
    XCTAssertEqual(driver.lock.kind, .recover)
    XCTAssertEqual(driver.surface.surface, .foreground, "a recovery shows as the dialog")
    await settle()
    XCTAssertNil(driver.lock.kind)
    XCTAssertEqual(driver.failure?.request, .recover)
    XCTAssertEqual(driver.error, "Couldn't recover the computer (no box). It is unchanged.")
    XCTAssertNil(driver.pendingKind)
    driver.dismissFailure()
    XCTAssertNil(driver.failure)
  }

  func testUntrackableBlocksFurtherRebuilds() async {
    let (driver, _, _) = make(update: .untrackable)
    driver.update()
    await settle()
    XCTAssertTrue(driver.isBlocked)
    XCTAssertEqual(RebuildWords.refusal(update: true, isBlocked: driver.isBlocked, pending: driver.pendingKind, canReset: driver.canReset, canUpdate: driver.canUpdate),
                   "Further computer updates and resets are disabled for this session. Restart Simeon after the computer is available again.")
  }

  func testQueuedUpdateWaitsForTheAgents() async {
    var (driver, _, inputs) = make()
    inputs.anyRunning = true
    driver.selectionChanged(inputs)
    driver.queueUpdateWhenIdle()
    XCTAssertTrue(driver.isUpdateQueued)
    XCTAssertNil(driver.pendingKind)
    inputs.anyRunning = false
    driver.selectionChanged(inputs)
    XCTAssertEqual(driver.pendingKind, .update)
    await settle()
    XCTAssertFalse(driver.isUpdateQueued, "the update's answer clears the queue (`D` in `X`)")
  }

  func testUpToDateCancelsTheQueue() {
    var (driver, _, inputs) = make()
    inputs.anyRunning = true
    driver.selectionChanged(inputs)
    driver.queueUpdateWhenIdle()
    inputs.imageUpdateAvailable = false
    driver.statusChanged(inputs)
    XCTAssertFalse(driver.isUpdateQueued)
  }

  func testContinueInBackground() {
    let (driver, _, _) = make()
    driver.resetComputer()
    XCTAssertEqual(driver.surface.surface, .foreground)
    driver.continueInBackground()
    XCTAssertEqual(driver.surface.surface, .background)
    driver.restoreForeground()
    XCTAssertEqual(driver.surface.surface, .foreground)
  }
}

final class ComputerWireTests: XCTestCase {
  func testEnvelopes() {
    var reader = ConnectEnvelopes()
    var bytes = [UInt8](ConnectEnvelopes.envelope(["phase": 2, "operationId": "op", "offsetKey": "1"]))
    var end: [UInt8] = [0x02, 0, 0, 0, 2]
    end += Array("{}".utf8)
    bytes += end
    var frames: [ConnectEnvelopes.Frame] = []
    for byte in bytes { frames += reader.feed([byte]) }
    XCTAssertEqual(frames.count, 2)
    if case .message(let json) = frames[0] { XCTAssertEqual(MigrationEvent(server: json), MigrationEvent(operationId: "op", phase: .creating)) } else { XCTFail() }
    XCTAssertEqual(frames[1], .end(error: nil))
  }

  func testRecreateAnswers() {
    XCTAssertEqual(RecreateAnswer.read(["started": true, "operationId": "abc", "reason": ""], preserveData: true), .started(operationId: "abc"))
    XCTAssertEqual(RecreateAnswer.read(["started": true, "operationId": ""], preserveData: false), .untrackable)
    XCTAssertEqual(RecreateAnswer.read(["started": false, "reason": "no box"], preserveData: false), .rejected("Couldn't reset the computer (no box). It is unchanged."))
    XCTAssertEqual(RecreateAnswer.read(["started": false, "reason": ""], preserveData: true), .rejected("Couldn't update the computer. It is unchanged."))
  }

  func testHostEvents() {
    let box = LiveBackend.map(GatewayEvent(channel: "forever-box", payload: ["agentId": "a", "state": "running", "vncUrl": "http://127.0.0.1:6080/vnc.html"]))
    guard case .computer(let payload)? = box.first else { return XCTFail() }
    XCTAssertEqual(BoxStatus(json: payload)?.screenURL, "http://127.0.0.1:6080/vnc.html")
    guard case .diskPressure(let level)? = LiveBackend.map(GatewayEvent(channel: "box-disk-pressure", payload: .null)).first else { return XCTFail() }
    XCTAssertNil(level)
    guard case .subagents(let parent, let rows)? = LiveBackend.map(GatewayEvent(channel: "subagents", payload: ["parentAgentId": "a", "subagents": [["subagentId": "s"]]])).first else { return XCTFail() }
    XCTAssertEqual(parent, "a")
    XCTAssertEqual(rows.count, 1)
    XCTAssertEqual(LiveBackend.map(GatewayEvent(channel: "computer-action", payload: ["agentId": "a", "type": "click", "x": 10, "y": 20])).count, 1)
  }

  func testDemoHandoff() async throws {
    let demo = DemoBackend(seed: DemoData.seed(gallery: true))
    let agents = try await demo.listAgents()
    var found = false
    for agent in agents + [Agent(id: "cards", name: "Cards")] {
      let status = try await demo.command("getForeverBoxStatus", ["id": .string(agent.id)])
      if let handoff = BoxStatus(json: status)?.handoff {
        found = true
        XCTAssertFalse(handoff.instruction.isEmpty)
        _ = try await demo.command("handBackForeverBox", ["id": .string(agent.id), "trigger": "dismissed"])
        let after = try await demo.command("getForeverBoxStatus", ["id": .string(agent.id)])
        XCTAssertNil(BoxStatus(json: after)?.handoff)
      }
    }
    XCTAssertTrue(found, "the demo has a hand-off waiting")
  }
}
