import XCTest
@testable import SimeonCore

/** The Mac's call banner, as `call-state.ts` `bannerView` and `banner-view.ts` draw it, and the older call record. */
final class CallBannerTests: XCTestCase {
  func call(_ phase: CallState.Phase, speaking: Bool = false, activity: String? = nil, connected: Date? = nil, ended: Date? = nil) -> CallState {
    var state = CallState(phase: phase, status: phase == .ringing ? "Calling…" : "", agentId: "theo", agentName: "Theo", agentColour: "green", isMuted: false,
                          agentSpeaking: speaking, levels: [], lines: [], connectedAt: connected, endedAt: ended)
    state.activity = activity
    return state
  }

  func testLooksAndStatus() {
    let start = Date(timeIntervalSince1970: 1_000)
    XCTAssertEqual(CallBanner.look(call(.ringing)), .ringing)
    XCTAssertEqual(CallBanner.status(call(.ringing)), "Calling…")
    XCTAssertEqual(CallBanner.look(call(.live, speaking: true, connected: start)), .speaking)
    XCTAssertEqual(CallBanner.status(call(.live, connected: start), now: start.addingTimeInterval(168)), "2:48")
    XCTAssertEqual(CallBanner.status(call(.live, connected: start), now: start.addingTimeInterval(3_723)), "1:02:03")
    XCTAssertEqual(CallBanner.look(call(.live, activity: "Sending the agenda to Dana…", connected: start)), .working)
    XCTAssertFalse(CallBanner.hasWave(call(.live, activity: "Sending…", connected: start)))
    XCTAssertTrue(CallBanner.hasWave(call(.live, connected: start)))
    XCTAssertEqual(CallBanner.status(call(.ended, connected: start, ended: start.addingTimeInterval(12))), "Call ended · 0:12")
    XCTAssertEqual(CallBanner.status(call(.ended)), "Call ended", "a call that never connected has no time")
    var failed = call(.ended)
    failed.failed = true
    failed.status = VoiceCallText.notSwitchedOn
    XCTAssertEqual(CallBanner.look(failed), .failed)
    XCTAssertEqual(CallBanner.status(failed), "Calls aren't switched on yet")
  }

  func testWaveform() {
    let flat = CallBanner.barHeights([], speaking: true)
    XCTAssertEqual(flat.count, 46)
    XCTAssertEqual(Set(flat), [2], "laid flat at the 2 pt floor")
    let loud = CallBanner.barHeights(Array(repeating: 1, count: 24), speaking: true)
    XCTAssertEqual(loud.max()!, 2 + 16 * sin(Double.pi * 22.5 / 46), accuracy: 1e-9, "highest in the middle")
    XCTAssertLessThan(loud.first!, 3, "low at the edges")
    XCTAssertEqual(CallBanner.barHeights(Array(repeating: 1, count: 24), speaking: false).max()!, 2 + 12 * sin(Double.pi * 22.5 / 46), accuracy: 1e-9)
  }

  func testOlderRecord() {
    XCTAssertEqual(CallRecord.parse("Voice call · 2:48\n\nWe moved the review to Friday."), CallRecord(duration: "2:48", recap: "We moved the review to Friday."))
    XCTAssertEqual(CallRecord.parse("Voice call · 1:02:03"), CallRecord(duration: "1:02:03", recap: nil))
    XCTAssertNil(CallRecord.parse("Voice call at 2:48"))
    XCTAssertNil(CallRecord.parse("Voice chat · 2:48"))
  }

  func testSwitch() {
    XCTAssertTrue(voiceCallsEnabled([:]))
    XCTAssertTrue(voiceCallsEnabled(["SIMEON_VOICE_CALLS": "1"]))
    XCTAssertFalse(voiceCallsEnabled(["SIMEON_VOICE_CALLS": " Off "]))
    XCTAssertFalse(voiceCallsEnabled(["SIMEON_VOICE_CALLS": "0"]))
  }

  func testMacTones() {
    XCTAssertEqual(Double(CallTones.ringSamples(cycles: 1, peak: CallTones.macRingPeak).map(abs).max()!), CallTones.macRingPeak, accuracy: 0.01)
    XCTAssertEqual(Double(CallTones.hangUpSamples(peak: CallTones.macHangUpPeak).map(abs).max()!), CallTones.macHangUpPeak, accuracy: 0.01)
  }

  final class RefusedVoice: VoiceTransport, @unchecked Sendable {
    struct Refused: Error, CustomStringConvertible { var description: String { "NotAllowedError: Permission denied for the microphone" } }
    func start(token: String, prompt: String, firstMessage: String, voiceId: String?, language: String, events: @escaping @Sendable (VoiceEvent) -> Void) async throws { throw Refused() }
    func setMuted(_ muted: Bool) async {}
    func say(context: String, nudge: String) async {}
    func toolResult(id: String, result: String) async {}
    func end() async {}
  }

  func testAFailedCallWaitsToBeClosedOnTheMac() async throws {
    let backend = DemoBackend(seed: DemoData.seed(), pace: 0.01, call: nil)
    let lines = LineLog()
    let call = LiveCall(backend: backend, transport: RefusedVoice(), personName: { nil }, failedStays: nil, log: { lines.add($0) }, pause: { _ in try? await Task.sleep(nanoseconds: 2_000_000) })
    let states = StateLog()
    call.observe { states.add($0) }
    call.start(agentId: "theo", agentName: "Theo", colour: "green")
    try await Task.sleep(nanoseconds: 400_000_000)
    let last = try XCTUnwrap(states.last ?? nil)
    XCTAssertTrue(last.failed)
    XCTAssertEqual(CallBanner.status(last), "Simeon can't use the microphone")
    XCTAssertEqual(CallBanner.look(last), .failed)
    call.dismiss()
    XCTAssertNil(states.last ?? nil, "Close puts it away")
    XCTAssertTrue(lines.all.contains { $0.hasPrefix("call started for agent theo") })
    XCTAssertTrue(lines.all.contains { $0.hasPrefix("call failed:") })
  }
}

final class LineLog: @unchecked Sendable {
  private let lock = NSLock()
  private var lines: [String] = []
  func add(_ line: String) { lock.withLock { lines.append(line) } }
  var all: [String] { lock.withLock { lines } }
}
