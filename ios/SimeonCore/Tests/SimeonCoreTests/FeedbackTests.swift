import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import XCTest
@testable import SimeonCore

/** Send Feedback and Report an Issue (`Feedback.swift`): what the sheets post, and what a report's diagnostics carry. */
final class FeedbackTests: XCTestCase {
  private let facts = DeviceFacts(platform: "iPhone", appVersion: "1.0 (29)", device: "iPhone16,2", osVersion: "iOS 26.1", language: "fr", timeZone: "Africa/Dakar")

  func testFeedbackSendsItsWordsTheFactsAndTheAgent() throws {
    var report = FeedbackReport(kind: .feedback)
    XCTAssertFalse(report.canSend, "nothing written")
    report.message = "  \n "
    XCTAssertFalse(report.canSend, "only spaces")
    report.message = "  I love the joined card.\n"
    XCTAssertTrue(report.canSend)
    report.agent = FeedbackAgent(id: "a1", name: "Maya", title: " Inbox ")
    report.includesDiagnostics = true

    let body = report.body(facts: facts, diagnostics: "ignored for feedback? no: only when included")
    XCTAssertEqual(body["kind"]?.string, "feedback")
    XCTAssertEqual(body["message"]?.string, "I love the joined card.")
    XCTAssertEqual(body["platform"]?.string, "iPhone")
    XCTAssertEqual(body["appVersion"]?.string, "1.0 (29)")
    XCTAssertEqual(body["device"]?.string, "iPhone16,2")
    XCTAssertEqual(body["osVersion"]?.string, "iOS 26.1")
    XCTAssertEqual(body["language"]?.string, "fr")
    XCTAssertEqual(body["timeZone"]?.string, "Africa/Dakar")
    XCTAssertEqual(body["agent"]?["name"]?.string, "Maya")
    XCTAssertEqual(body["agent"]?["title"]?.string, "Inbox")
    XCTAssertNil(body["topics"])
    XCTAssertNil(body["screenshots"])
    XCTAssertEqual(FeedbackAgent(id: "a1", name: "Maya", title: "Inbox").label, "Maya · Inbox")
    XCTAssertEqual(FeedbackAgent(id: "a2", name: "Leo", title: "  ").label, "Leo")

    report.message = String(repeating: "a", count: FeedbackReport.messageLimit + 1)
    XCTAssertFalse(report.canSend, "over the limit")
  }

  func testAnIssueSendsTopicsScreenshotsAndOnlyAgreedDiagnostics() {
    var report = FeedbackReport(kind: .issue)
    report.message = "Gmail won't connect."
    let topics = FeedbackTopic.all
    XCTAssertEqual(topics.map(\.id), ["Account and sign-in", "Agents", "Chats", "Cloud computer", "Connectors", "Routines",
                                      "Voice calls", "Notifications", "Plans and billing", "Settings", "Other"])
    XCTAssertEqual(Set(topics.map(\.symbol)).count, topics.count, "a symbol each")
    report.toggle(topics[4])
    report.toggle(topics[3])
    report.toggle(topics[4])
    report.toggle(topics[0])
    XCTAssertEqual(report.topics, ["Cloud computer", "Account and sign-in"])
    report.screenshots = [Data([0xFF, 0xD8, 0xFF]), Data([0xFF, 0xD8, 0xFF, 0x00])]
    XCTAssertEqual(report.roomForScreenshots, 2)

    let without = report.body(facts: facts, diagnostics: "log")
    XCTAssertEqual(without["kind"]?.string, "issue")
    XCTAssertEqual(without["topics"]?.array?.compactMap(\.string), ["Cloud computer", "Account and sign-in"])
    XCTAssertEqual(without["screenshots"]?[1]?["filename"]?.string, "screenshot-2.jpg")
    XCTAssertEqual(without["screenshots"]?[0]?["data"]?.string, "/9j/")
    XCTAssertNil(without["diagnostics"], "not agreed to")
    XCTAssertNil(without["agent"])

    report.includesDiagnostics = true
    XCTAssertEqual(report.body(facts: facts, diagnostics: "log")["diagnostics"]?.string, "log")
    XCTAssertNil(report.body(facts: facts, diagnostics: "")["diagnostics"])
  }

  func testDiagnosticsNeverCarryWhatCouldOpenAnAccount() {
    let jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl"
    let cases: [(String, String)] = [
      ("guest console[info] open wss://box.simeonlabs.com/screen?token=abc&x=1 now", "guest console[info] open wss://box.simeonlabs.com/screen?*** now"),
      ("Authorization: Bearer sk-live-123", "Authorization: Bearer ***"),
      ("refresh_token=r-123&scope=all", "refresh_token=***&scope=all"),
      (#"{"password": "hunter2"}"#, #"{"password": "***"}"#),
      ("token \(jwt) kept", "token *** kept"),
      ("key q7Rk2Vx9Lm4Pz8Nw3Ty6Bh1Jc5Gd0Fs2Aa9Ee", "key ***"),
    ]
    for (line, scrubbed) in cases { XCTAssertEqual(Diagnostics.scrub(line), scrubbed, line) }
    // What helps find a problem stays: an agent's id, an error's code, a status.
    let kept = "openAgent 3f2a9c1e-7b4d-4e8a-9c2b-1d5e6f7a8b9c failed code=-1009 status 502 in 840 ms"
    XCTAssertEqual(Diagnostics.scrub(kept), kept)
  }

  func testRecentActivityKeepsTheLastLinesScrubbedAndTimed() {
    RecentActivity.clear()
    defer { RecentActivity.clear() }
    let at = Date(timeIntervalSince1970: 1_793_000_000)
    for index in 0..<(RecentActivity.keep + 5) { RecentActivity.note("step \(index)", at: at) }
    RecentActivity.note("api GET apps?code=XYZ\n502", at: at)
    let lines = RecentActivity.all
    XCTAssertEqual(lines.count, RecentActivity.keep)
    XCTAssertEqual(lines.first?.hasSuffix(" step 6"), true)
    XCTAssertEqual(lines.last?.hasSuffix(" api GET apps?code=XYZ 502"), true, "one line; not an address, so its query is kept")
    XCTAssertTrue(lines.last?.hasPrefix("2026-10-26T") == true)
  }

  func testTheDiagnosticsTextNamesTheDeviceTheStateAndTheLogs() {
    let text = Diagnostics.text(facts: facts, state: ["Signed in: yes", "Agents: 3"], activity: ["t1 api GET apps 502 in 12 ms"],
                                files: [("computer-stream.log", "one\ntwo https://x.io/s?token=abc\n")])
    XCTAssertEqual(text, """
    Simeon iPhone 1.0 (29)
    Device: iPhone16,2, iOS 26.1
    Language: fr, time zone: Africa/Dakar
    Signed in: yes
    Agents: 3

    Recent activity (oldest first):
    t1 api GET apps 502 in 12 ms

    computer-stream.log (last 2 lines):
    one
    two https://x.io/s?***
    """)
    XCTAssertTrue(Diagnostics.text(facts: facts, state: [], activity: []).contains("Nothing yet."))
  }

  func testTheReportIsPostedToTheFeedbackRouteAndARefusalIsNoted() async throws {
    RecentActivity.clear()
    defer { RecentActivity.clear() }
    let vault = MemoryVault(SessionTokens(accessToken: "t", refreshToken: "r", expiresAtMs: 9e15))
    let http = ScriptedHTTP([
      { request in
        XCTAssertEqual(request.url?.path, "/desktop/api/feedback")
        XCTAssertEqual(request.httpMethod, "POST")
        let body = try? JSON.parse(request.httpBody ?? Data())
        XCTAssertEqual(body?["kind"]?.string, "issue")
        XCTAssertEqual(body?["diagnostics"]?.string, "the log")
        return HTTPAnswer(status: 200, body: Data(#"{"code":0,"data":{"received":true}}"#.utf8))
      },
      { _ in HTTPAnswer(status: 400, body: Data(#"{"code":40002,"message":"A screenshot couldn't be sent. Try another one."}"#.utf8)) },
    ])
    let api = SimeonAPI(base: URL(string: "https://api.example.com")!, clientVersion: "1", vault: vault, http: http)
    var report = FeedbackReport(kind: .issue)
    report.message = "It froze."
    report.includesDiagnostics = true
    _ = try await api.data("feedback", json: report.body(facts: facts, diagnostics: "the log"))
    XCTAssertTrue(RecentActivity.all.isEmpty, "an answered call is not noted")
    do {
      _ = try await api.data("feedback", json: report.body(facts: facts, diagnostics: nil))
      XCTFail("refused")
    } catch let error as SimeonAPIError {
      XCTAssertEqual(error.message, "A screenshot couldn't be sent. Try another one.")
      XCTAssertEqual(error.status, 400)
    }
    XCTAssertEqual(RecentActivity.all.count, 1)
    XCTAssertTrue(RecentActivity.all[0].contains(" api POST feedback 400 in "), RecentActivity.all[0])
  }

  func testAMessageCanBeAboutThePersonsOwnAgentsOnly() {
    var saver = Agent(id: "d", name: "Disk Saver")
    saver.purpose = "disk-saver"
    let agents = [
      Agent(id: "a", name: "Maya", title: "Inbox"),
      Agent(id: "g", name: "Launch", isGroup: true),
      Agent(id: "h", name: "Old", isHidden: true),
      saver,
      Agent(id: "b", name: "Leo"),
    ]
    XCTAssertEqual(FeedbackAgent.choices(from: agents).map(\.label), ["Maya · Inbox", "Leo"])
  }

  func testTheDeviceFactsAreThisMachines() {
    let facts = DeviceFacts.current(platform: "Mac", appVersion: "0.2.10 (41)")
    XCTAssertEqual(facts.platform, "Mac")
    XCTAssertTrue(facts.osVersion.hasPrefix("macOS "))
    XCTAssertFalse(facts.device.isEmpty)
    XCTAssertEqual(facts.timeZone, TimeZone.current.identifier)
  }
}
