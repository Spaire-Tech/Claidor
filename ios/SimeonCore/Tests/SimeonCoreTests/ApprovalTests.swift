import XCTest
@testable import SimeonCore

/**
 * The approval cards against the shipped window's own functions:
 * `Fixtures/approvals.json` was made by copying the auto-review chunk's
 * `Z`, `J`, `Q`, `se`, `ae`, `ie`/`re`/`le`, `ue`, `ce`, `de` and the main
 * bundle's `oWn`, `_Ln` and the local card's strings verbatim and running
 * them in Node (scratchpad `s7/allow-fixtures.mjs`).
 */
final class ApprovalTests: XCTestCase {
  private static let fixture: JSON = {
    let url = Bundle.module.url(forResource: "approvals", withExtension: "json", subdirectory: "Fixtures")!
    return try! JSON.parse(Data(contentsOf: url))
  }()

  private var autoReview: JSON? { Self.fixture["autoReview"] }

  func testTitlesAndWhereItRuns() {
    for (surface, row) in autoReview?["titles"]?.object ?? [:] {
      let key: String? = surface == "undefined" ? nil : surface
      let heading = AutoReviewCard.title(surface: key)
      XCTAssertEqual(heading.title, row["title"]?.string, surface)
      XCTAssertEqual(heading.subject.rawValue, row["subject"]?.string, surface)
      XCTAssertEqual(AutoReviewCard.location(surface: key), row["location"]?.string, surface)
    }
  }

  func testBadges() {
    for (status, row) in autoReview?["badges"]?.object ?? [:] {
      let badge = AutoReviewCard.badge(status: status)
      XCTAssertEqual(badge?.kind.rawValue, row["kind"]?.string, status)
      XCTAssertEqual(badge?.label, row["label"]?.string, status)
    }
  }

  func testWhatIsTakenOut() {
    for row in autoReview?["redact"]?.array ?? [] {
      XCTAssertEqual(AutoReviewCard.redact(row["in"]?.string ?? ""), row["out"]?.string)
    }
    for row in autoReview?["proposedRule"]?.array ?? [] {
      XCTAssertEqual(AutoReviewCard.rule(proposed: row["in"]?.string), row["out"]?.string)
    }
  }

  func testTheSummaryLineAndTheNote() {
    for row in autoReview?["summaryHidden"]?.array ?? [] {
      XCTAssertEqual(AutoReviewCard.summarySaysNothing(row["summary"]?.string ?? ""), row["hiddenWhenCommandPresent"]?.bool, row["summary"]?.string ?? "")
    }
    let notes = autoReview?["settledNote"]?.array ?? []
    XCTAssertEqual(AutoReviewCard.settledNote(status: "always", rule: nil), notes[0].string)
    XCTAssertEqual(AutoReviewCard.settledNote(status: "always", rule: "Allow npm test"), notes[1].string)
    XCTAssertNil(AutoReviewCard.settledNote(status: "approved", rule: "x"))
  }

  func testTheFoldedText() {
    XCTAssertEqual(AutoReviewCard.clip(String(repeating: "a", count: 340)), String(repeating: "a", count: 340))
    XCTAssertTrue(AutoReviewCard.clip(String(repeating: "a", count: 341)).hasSuffix("aaaaa...[1 chars omitted]..."))
    XCTAssertEqual(String(AutoReviewCard.clip(String(repeating: "x", count: 400)).dropFirst(330)), autoReview?["cards"]?["longCommand"]?.string)
  }

  /** Each card the harness drew: what the Swift card would show. */
  func testTheCards() {
    let cases: [(String, String?, String, String?, String)] = [
      ("hostShellPending", "host_shell", "List the files in Downloads on your local computer", "ls -la ~/Downloads", "pending"),
      ("hostShellGenericSummary", "host_shell", "Run a command on your local computer", "rm -rf build", "pending"),
      ("mcpPending", "mcp", "Send an email with Gmail", nil, "pending"),
      ("subagentPending", "subagent", "Run a task on Simeon's computer: “x”", nil, "pending"),
      ("computerPending", "computer", "Click “Buy” on shop.example in the box browser", nil, "pending"),
      ("alwaysWithRule", "box_shell", "Run npm test", "npm test", "always"),
      ("expired", "mcp", "s", nil, "expired"),
    ]
    for (name, surface, summary, command, status) in cases {
      let shipped = autoReview?["cards"]?[name]
      XCTAssertEqual(AutoReviewCard.title(surface: surface).title, shipped?["title"]?.string, name)
      XCTAssertEqual(AutoReviewCard.location(surface: surface), shipped?["location"]?.string, name)
      XCTAssertEqual(AutoReviewCard.summaryLine(summary: summary, command: command), shipped?["summaryLine"]?.string, name)
      XCTAssertEqual("Show the \(AutoReviewCard.title(surface: surface).subject.rawValue)", shipped?["disclosure"]?["button"]?.string, name)
      XCTAssertEqual(command ?? summary, shipped?["disclosure"]?["text"]?.string, name)
      XCTAssertEqual(AutoReviewCard.badge(status: status)?.label ?? "Approval needed", shipped?["badge"]?["label"]?.string, name)
    }
    XCTAssertEqual(AutoReviewCard.settledNote(status: "always", rule: AutoReviewCard.rule(proposed: "Allow running npm test")), autoReview?["cards"]?["alwaysWithRule"]?["settledNote"]?.string)
  }

  func testAlwaysAllowAddsTheRule() {
    let always = autoReview?["alwaysAllow"]
    let one = AutoReviewInstructions(allow: ["a"])
    XCTAssertEqual(one.addingAllowRule("Allow running npm test").json, always?["withRule"]?["written"])
    XCTAssertEqual(one.addingAllowRule("a").json, always?["duplicateRule"]?["written"])
    let full = AutoReviewInstructions(allow: (0..<20).map { "r\($0)" })
    XCTAssertEqual(full.addingAllowRule("new").allow, always?["fullList"]?.array?.compactMap(\.string))
    XCTAssertEqual(AutoReviewInstructions().addingAllowRule(String(repeating: "z", count: 1_200)).allow.first?.count, 1_000)
  }

  func testTheLocalCard() {
    let local = Self.fixture["localTool"]
    XCTAssertEqual(LocalToolAsk.title, local?["strings"]?["title"]?.string)
    XCTAssertEqual(LocalToolAsk.description, local?["strings"]?["description"]?.string)
    XCTAssertEqual(LocalToolAsk.denyOnce, local?["strings"]?["dismissLabel"]?.string)
    XCTAssertEqual(LocalToolAsk.denyOnceTooltip, local?["strings"]?["dismissTooltip"]?.string)
    XCTAssertEqual(LocalToolAsk.failure, local?["strings"]?["failure"]?.string)
    for (status, line) in local?["outcome"]?.object ?? [:] {
      XCTAssertEqual(LocalToolAsk.outcome(status: status), line.string, status)
    }
    XCTAssertEqual(LocalToolAsk.loadingPolicy, local?["policy"]?["loading"]?["tooltip"]?.string)
    XCTAssertEqual(LocalToolAsk.blockedByPolicy, local?["policy"]?["readyAsk"]?["tooltip"]?.string)
  }

  /** Waiting, the ask is the dock's, not a line; answered, one line; expired, nothing. */
  func testTheLocalAskInTheChat() {
    func entry(_ status: String, id: String) -> Entry {
      Entry(["id": .string(id), "kind": "send-message", "timestampMs": 1, "message": ["type": "local-tool-permission", "ask": ["requestId": .string("q-\(id)"), "action": "run-command", "target": "ls", "status": .string(status)]]])!
    }
    let entries = [entry("allowed", id: "1"), entry("expired", id: "2"), entry("pending", id: "3"), entry("pending", id: "4")]
    XCTAssertEqual(LocalAsk.waiting(in: entries)?.entryId, "3")
    XCTAssertEqual(LocalAsk.waiting(in: entries)?.requestId, "q-3")
    XCTAssertNil(LocalAsk.waiting(in: [entry("never", id: "5")]))
  }
}
