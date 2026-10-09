import XCTest
@testable import SimeonCore

/** The access words against the main bundle's `T1t`, `dzn` and `gft` run over every state and reason (`Fixtures/access.json`). */
final class AccessTests: XCTestCase {
  func testWordsAndPauseAsTheWindow() throws {
    let url = Bundle.module.url(forResource: "access", withExtension: "json", subdirectory: "Fixtures")!
    let rows = try JSON.parse(Data(contentsOf: url)).array ?? []
    XCTAssertEqual(rows.count, 50)
    for row in rows {
      let access = SandAccess(state: SandAccess.State(rawValue: row["state"]?.string ?? "")!, reason: SandAccess.Reason(rawValue: row["reason"]?.string ?? "")!)
      let label = "\(access.state) \(access.reason)"
      if let notice = row["notice"], !notice.isNull {
        XCTAssertEqual(access.notice?.title, notice["title"]?.string, label)
        XCTAssertEqual(access.notice?.body, notice["body"]?.string, label)
        XCTAssertEqual(access.notice?.action, notice["action"]?.string, label)
      } else {
        XCTAssertNil(access.notice, label)
      }
      XCTAssertEqual(access.cover.title, row["cover"]?["title"]?.string, label)
      XCTAssertEqual(access.cover.body, row["cover"]?["body"]?.string, label)
      XCTAssertEqual(access.cover.action, row["cover"]?["action"]?.string, label)
      XCTAssertEqual(access.pausesSending, row["pauses"]?.bool, label)
    }
  }

  func testTheServersNumbers() {
    XCTAssertEqual(SandAccess(json: ["state": 3, "blockReason": 6]), SandAccess(state: .paymentRequired, reason: .freeTrialAvailable))
    XCTAssertEqual(SandAccess(json: ["state": 1, "blockReason": 0]), SandAccess(state: .granted, reason: .unspecified))
    XCTAssertEqual(SandAccess(json: [:]), .unknown)
    XCTAssertEqual(SandAccess(json: ["state": 3, "blockReason": 1]).notice?.action, "Check Access")
  }
}
