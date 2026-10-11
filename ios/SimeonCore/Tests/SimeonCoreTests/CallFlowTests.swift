import XCTest
@testable import SimeonCore

/** The call's flow as the Mac's banner runs it (step 11's spec, §4.3): what `LiveCall` does at a hang-up, an error, a dropped line, the seventh ring; the working line; the chat's call line. */
final class CallFlowTests: XCTestCase {
  func testTheWorkingLineNamesWhatTheAgentIsDoing() {
    XCTAssertEqual(VoiceCallText.describeActivity(kind: "tool", tool: "CallMcpTool", detail: "composio_gmail"), "Using Gmail…")
    XCTAssertEqual(VoiceCallText.describeActivity(kind: "tool", tool: "CallMcpTool", detail: "google_calendar"), "Using Google Calendar…")
    XCTAssertEqual(VoiceCallText.describeActivity(kind: "tool", tool: "CallMcpTool", detail: nil), "Using an app…")
    XCTAssertEqual(VoiceCallText.describeActivity(kind: "tool", tool: "WebSearch", detail: "flights"), "Searching the web…")
    XCTAssertEqual(VoiceCallText.describeActivity(kind: "tool", tool: "Read", detail: "  notes.md "), "Reading notes.md…")
    XCTAssertEqual(VoiceCallText.describeActivity(kind: "tool", tool: "Shell", detail: ""), "Running a command…")
    XCTAssertEqual(VoiceCallText.describeActivity(kind: "tool", tool: "McpAuth", detail: "mcp-gh"), "Signing in to GH…")
    XCTAssertEqual(VoiceCallText.describeActivity(kind: "tool", tool: "Something", detail: nil), "Working on it…")
    XCTAssertNil(VoiceCallText.describeActivity(kind: "thinking", tool: nil, detail: nil))
    XCTAssertEqual(VoiceCallText.describeActivity(kind: "tool", tool: "Read", detail: String(repeating: "a", count: 50)), "Reading \(String(repeating: "a", count: 39))……")
  }

  func testTheChatsCallLine() {
    XCTAssertEqual(Chat.voiceChatLabel(seconds: 0, live: true), "Voice chat · now")
    XCTAssertEqual(Chat.voiceChatLabel(seconds: 168, live: false), "Voice chat · 02:48")
    XCTAssertEqual(Chat.voiceChatLabel(seconds: 3725, live: false), "Voice chat · 1:02:05")
    let live = Entry(["kind": "event", "id": "v1", "event": ["type": "voice-call", "status": "live", "seconds": 0, "lines": []], "timestampMs": 1_000])!
    let ended = Entry(["kind": "event", "id": "v2", "event": ["type": "voice-call", "status": "ended", "seconds": 168, "lines": [["speaker": "user", "text": "Hi"]]], "timestampMs": 2_000])!
    let calls = Chat.rows([live, ended]).compactMap { row -> (Bool, Int)? in
      if case .voiceCall(_, let seconds, let lines, let isLive) = row { return (isLive, seconds + lines.count * 1_000) }
      return nil
    }
    XCTAssertEqual(calls.map(\.0), [true, false])
    XCTAssertEqual(calls.map(\.1), [0, 1_168])
  }

  func testHangingUpEndsTheCallAtTheClick() async throws {
    let backend = DemoBackend(seed: DemoData.seed(), pace: 0.01, call: nil)
    let voice = FakeVoice()
    let tones = FakeTones()
    let call = LiveCall(backend: backend, transport: voice, personName: { "Bass" }, tones: tones, quiet: 0.02, pause: { _ in try? await Task.sleep(nanoseconds: 2_000_000) })
    let states = CallStates()
    call.observe { states.add($0) }
    call.start(agentId: "theo", agentName: "Theo", colour: "green")
    try await Task.sleep(nanoseconds: 300_000_000)
    XCTAssertEqual(states.last?.phase, .live)
    call.hangUp()
    // At once: no wait for the voice to let go.
    XCTAssertEqual(states.last?.phase, .ended)
    XCTAssertEqual(states.last?.status, VoiceCallText.ended)
    XCTAssertEqual(tones.lock.withLock { tones.hangUps }, 1)
    try await Task.sleep(nanoseconds: 50_000_000)
    XCTAssertTrue(voice.lock.withLock { voice.ended })
  }

  func testAHangUpWhileItRingsStaysEnded() async throws {
    let backend = DemoBackend(seed: DemoData.seed(), pace: 0.01, call: nil)
    let call = LiveCall(backend: backend, transport: FakeVoice(), personName: { "Bass" }, tones: FakeTones(), failedStays: nil, pause: { _ in try? await Task.sleep(nanoseconds: 2_000_000) })
    let states = CallStates()
    call.observe { states.add($0) }
    call.start(agentId: "theo", agentName: "Theo", colour: "green")
    call.hangUp()
    try await Task.sleep(nanoseconds: 300_000_000)
    XCTAssertFalse(states.all.contains { $0?.failed == true }, "the token landing late never makes it \"Couldn't connect\"")
    XCTAssertFalse(states.all.contains { $0?.phase == .live })
  }

  func testTheKitsErrorWhileLiveLeavesTheCallOn() async throws {
    let backend = DemoBackend(seed: DemoData.seed(), pace: 0.01, call: nil)
    let voice = FakeVoice()
    let lines = LineLog()
    let call = LiveCall(backend: backend, transport: voice, personName: { "Bass" }, log: { lines.add($0) }, pause: { _ in try? await Task.sleep(nanoseconds: 2_000_000) })
    let states = CallStates()
    call.observe { states.add($0) }
    call.start(agentId: "theo", agentName: "Theo", colour: "green")
    try await Task.sleep(nanoseconds: 200_000_000)
    voice.emit(.failed("data channel hiccup"))
    try await Task.sleep(nanoseconds: 20_000_000)
    XCTAssertEqual(states.last?.phase, .live)
    XCTAssertFalse(states.last?.failed ?? true)
    XCTAssertTrue(lines.all.contains("banner: sdk error: data channel hiccup"))
  }

  func testALineDroppedBeforeItConnectsCouldNotConnect() async throws {
    let backend = DemoBackend(seed: DemoData.seed(), pace: 0.01, call: nil)
    let voice = UnansweredVoice()
    let call = LiveCall(backend: backend, transport: voice, personName: { "Bass" }, failedStays: nil, pause: { _ in try? await Task.sleep(nanoseconds: 2_000_000) })
    let states = CallStates()
    call.observe { states.add($0) }
    call.start(agentId: "theo", agentName: "Theo", colour: "green")
    try await Task.sleep(nanoseconds: 200_000_000)
    voice.emit(.ended)
    let last = try XCTUnwrap(states.last ?? nil)
    XCTAssertTrue(last.failed)
    XCTAssertEqual(CallBanner.status(last), VoiceCallText.couldNotConnect)
  }

  func testSevenRingsWithoutAnAnswerCouldNotConnect() async throws {
    let tones = FakeTones()
    // The call holds its computer weakly: the test keeps it.
    let backend = SlowBackend()
    let call = LiveCall(backend: backend, transport: FakeVoice(), personName: { nil }, tones: tones, failedStays: nil, pause: { _ in try? await Task.sleep(nanoseconds: 2_000_000) })
    let states = CallStates()
    call.observe { states.add($0) }
    call.start(agentId: "theo", agentName: "Theo", colour: "green")
    try await Task.sleep(nanoseconds: 700_000_000)
    XCTAssertEqual(tones.lock.withLock { tones.rings }, [2, 1, 1, 1, 1, 1])
    let last = try XCTUnwrap(states.last ?? nil)
    XCTAssertTrue(last.failed)
    XCTAssertEqual(CallBanner.status(last), VoiceCallText.couldNotConnect)
    withExtendedLifetime(backend) {}
  }
}

/** Signing out ends a call that is on, and nothing of it comes back on screen. */
@MainActor
final class CallSignOutTests: XCTestCase {
  func testSigningOutEndsTheCall() async throws {
    let demo = DemoCall(speed: 20)
    let backend = DemoBackend(seed: DemoData.seed(), pace: 0.01, call: demo)
    let store = AppStore()
    await store.attach(backend)
    let states = CallStates()
    demo.observe { states.add($0) }
    store.startCall(Agent(id: "theo", name: "Theo"))
    try await Task.sleep(nanoseconds: 300_000_000)
    XCTAssertEqual(store.call?.phase, .live)
    store.detach()
    XCTAssertEqual(states.last?.phase, .ended, "the call ends with the sign-out")
    try await Task.sleep(nanoseconds: 200_000_000)
    XCTAssertNil(store.call, "and does not come back on screen")
    withExtendedLifetime(backend) {}
  }

  func testReloadKeepsTheCall() async throws {
    let demo = DemoCall(speed: 20)
    let backend = DemoBackend(seed: DemoData.seed(), pace: 0.01, call: demo)
    let store = AppStore()
    await store.attach(backend)
    store.startCall(Agent(id: "theo", name: "Theo"))
    try await Task.sleep(nanoseconds: 300_000_000)
    await store.attach(backend)
    try await Task.sleep(nanoseconds: 50_000_000)
    XCTAssertEqual(store.call?.phase, .live)
  }
}

/** A voice that says it connected only after a while, and counts its ends. */
final class LateVoice: VoiceTransport, @unchecked Sendable {
  let lock = NSLock()
  var ends = 0
  func start(token: String, prompt: String, firstMessage: String, voiceId: String?, language: String, events: @escaping @Sendable (VoiceEvent) -> Void) async throws {
    try? await Task.sleep(nanoseconds: 150_000_000)
    events(.connected(conversationId: "c1"))
  }
  func setMuted(_ muted: Bool) async {}
  func say(context: String, nudge: String) async {}
  func toolResult(id: String, result: String) async {}
  func end() async { lock.withLock { ends += 1 } }
}

final class CallLateVoiceTests: XCTestCase {
  func testAVoiceThatConnectsAfterTheHangUpIsLetGo() async throws {
    let backend = DemoBackend(seed: DemoData.seed(), pace: 0.01, call: nil)
    let voice = LateVoice()
    let call = LiveCall(backend: backend, transport: voice, personName: { nil }, pause: { _ in try? await Task.sleep(nanoseconds: 2_000_000) })
    let states = CallStates()
    call.observe { states.add($0) }
    call.start(agentId: "theo", agentName: "Theo", colour: "green")
    // While the voice connects.
    try await Task.sleep(nanoseconds: 80_000_000)
    call.hangUp()
    try await Task.sleep(nanoseconds: 250_000_000)
    XCTAssertFalse(states.all.contains { $0?.phase == .live }, "never live after the hang-up")
    XCTAssertGreaterThanOrEqual(voice.lock.withLock { voice.ends }, 2, "the late voice is ended too")
  }
}

final class CallStates: @unchecked Sendable {
  private let lock = NSLock()
  private var states: [CallState?] = []
  func add(_ state: CallState?) { lock.withLock { states.append(state) } }
  var all: [CallState?] { lock.withLock { states } }
  var last: CallState? { lock.withLock { states.last ?? nil } }
}

/** A voice that never says it connected until told. */
final class UnansweredVoice: VoiceTransport, @unchecked Sendable {
  let lock = NSLock()
  var events: (@Sendable (VoiceEvent) -> Void)?
  func start(token: String, prompt: String, firstMessage: String, voiceId: String?, language: String, events: @escaping @Sendable (VoiceEvent) -> Void) async throws {
    lock.withLock { self.events = events }
  }
  func setMuted(_ muted: Bool) async {}
  func say(context: String, nudge: String) async {}
  func toolResult(id: String, result: String) async {}
  func end() async {}
  func emit(_ event: VoiceEvent) { lock.withLock { events }?(event) }
}

/** A computer whose server takes its time over the call's token. */
final class SlowBackend: AgentBackend, @unchecked Sendable {
  func tail(_ agentId: String, limit: Int) async throws -> [Entry] { [] }
  func listAgents() async throws -> [Agent] { [Agent(id: "theo", name: "Theo")] }
  func transcript(_ agentId: String) async throws -> [Entry] { [] }
  func send(_ agentId: String, text: String, attachments: [AttachmentRef], options: SendOptions, nonce: String?) async throws {}
  func markRead(_ agentId: String) async {}
  func createAgent(name: String, colour: String) async throws -> String { "x" }
  func createGroup(name: String, memberIds: [String]) async throws -> String { "g" }
  func answer(_ agentId: String, entryId: String, value: String) async throws {}
  func updateAgent(_ agentId: String, name: String, title: String, description: String) async throws {}
  func routines(_ agentId: String) async throws -> [JSON] { [] }
  func events() -> AsyncStream<BackendEvent> { AsyncStream { _ in } }
  var call: CallEngine? { nil }
  func command(_ method: String, _ args: JSON) async throws -> JSON { [:] }
  func server(_ path: String, method: String?, body: JSON?) async throws -> JSON {
    try? await Task.sleep(nanoseconds: 3_000_000_000)
    return ["token": "late"]
  }
  func screen(_ agentId: String) async throws -> ScreenState { ScreenState(socket: nil, state: "starting") }
}
