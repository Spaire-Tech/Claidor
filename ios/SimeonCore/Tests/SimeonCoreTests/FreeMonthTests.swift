import Foundation
import XCTest
@testable import SimeonCore

/** The free month the iPhone asks for at a sign-in (12 October 2026): what it sends and what each answer means. */
final class FreeMonthTests: XCTestCase {
  func testItSendsThePhonesTokenAndReadsTheMonth() async throws {
    var sent: (path: String, method: String?, body: JSON?)?
    let outcome = await FreeMonth.start(deviceToken: "dGVzdA==", development: true) { path, method, body in
      sent = (path, method, body)
      return try XCTUnwrap(JSON.parse(Data(#"{"outcome":"started","endsAt":"2026-11-11T20:06:24.688592+00:00","quota":{}}"#.utf8)))
    }
    XCTAssertEqual(sent?.path, "billing/free-month")
    XCTAssertEqual(sent?.method, "POST")
    XCTAssertEqual(sent?.body?["deviceToken"]?.text, "dGVzdA==")
    XCTAssertEqual(sent?.body?["development"], .bool(true))
    guard case .started(let ends) = outcome else { return XCTFail("\(outcome)") }
    XCTAssertEqual(ends?.timeIntervalSince1970 ?? 0, 1_794_427_584.688, accuracy: 0.01)
    XCTAssertTrue(outcome.settled)
  }

  func testEachAnswer() async {
    func answer(_ text: String) async -> FreeMonth.Outcome {
      await FreeMonth.start(deviceToken: "t", development: false) { _, _, _ in (try? JSON.parse(Data(text.utf8))) ?? .null }
    }
    let running = await answer(#"{"outcome":"running","endsAt":"2026-11-11T20:06:24+00:00"}"#)
    XCTAssertNotNil({ if case .running(let ends) = running { return ends } else { return nil } }())
    let notNeeded = await answer(#"{"outcome":"not_needed"}"#)
    XCTAssertEqual(notNeeded, .notNeeded)
    let hadTrial = await answer(#"{"outcome":"had_trial"}"#)
    XCTAssertEqual(hadTrial, .hadTrial)
    let deviceUsed = await answer(#"{"outcome":"device_used"}"#)
    XCTAssertEqual(deviceUsed, .deviceUsed)
    let unavailable = await answer(#"{"outcome":"unavailable"}"#)
    XCTAssertEqual(unavailable, .unavailable)
    XCTAssertFalse(unavailable.settled, "asked again at the next launch")
    XCTAssertTrue(deviceUsed.settled)
  }

  func testNoServerIsAskedAgain() async {
    struct Down: Error {}
    let outcome = await FreeMonth.start(deviceToken: "t", development: false) { _, _, _ in throw Down() }
    XCTAssertEqual(outcome, .failed)
    XCTAssertFalse(outcome.settled)
  }
}
