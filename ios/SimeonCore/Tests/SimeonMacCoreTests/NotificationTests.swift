import Foundation
import XCTest
import SimeonCore
@testable import SimeonMacCore

/**
 * The Mac's notifications and Dock badge against what the Electron app's
 * own code answered: `Fixtures/notify.json` was made by bundling
 * `shared/os-notification.ts`, main's `dock-badge.ts` and
 * `dock-badge-manager.ts` as shipped and running them in Node on scripted
 * rosters (scratchpad `s7/notify-fixtures.mjs`).
 */
final class NotificationTests: XCTestCase {
  private static let fixture: JSON = {
    let url = Bundle.module.url(forResource: "notify", withExtension: "json", subdirectory: "Fixtures")!
    return try! JSON.parse(Data(contentsOf: url))
  }()

  private func cases(_ group: String) -> [JSON] { Self.fixture["cases"]?[group]?.array ?? [] }

  private func agent(_ row: JSON?) -> Agent { Agent(json: row ?? [:])! }

  func testTheWords() {
    let rows = cases("buildNotificationContent")
    XCTAssertEqual(rows.count, 17)
    for row in rows {
      let input = row["input"]
      let transition = AgentNotifications.Transition(agentId: "a1", agentName: input?["agentName"]?.string ?? "", kind: AgentNotifications.Kind(rawValue: input?["kind"]?.string ?? "")!, reason: input?["reason"]?.string, notifyEnabled: true, isHidden: false, lastMessageId: "m1", lastMessagePreview: input?["lastMessagePreview"]?.string)
      let content = AgentNotifications.content(transition)
      let name = row["name"]?.string ?? ""
      XCTAssertEqual(content.title, row["output"]?["title"]?.string, name)
      // A cut through an emoji: JavaScript keeps its first half alone before "…", the Mac drops it (the fixture's `note`).
      XCTAssertEqual(content.body, row["output"]?["body"]?.string, name)
    }
  }

  func testWhenToNotify() {
    for row in cases("shouldNotify") {
      let input = row["input"]
      XCTAssertEqual(AgentNotifications.shouldNotify(isHidden: input?["isHidden"]?.bool ?? false, notifyEnabled: input?["notifyEnabled"]?.bool ?? false, isWindowFocused: input?["isWindowFocused"]?.bool ?? false, lastNotifiedAtMs: input?["lastNotifiedAtMs"]?.double, nowMs: input?["nowMs"]?.double ?? 0, throttleWindowMs: input?["throttleWindowMs"]?.double ?? 0), row["output"]?.bool, row["name"]?.string ?? "")
    }
  }

  func testWhatARowSays() {
    for row in cases("toNotificationSnapshot") {
      let snapshot = AgentNotifications.Snapshot(agent(row["input"]))
      let out = row["output"]
      let name = row["name"]?.string ?? ""
      XCTAssertEqual(snapshot.id, out?["id"]?.string, name)
      XCTAssertEqual(snapshot.isRunning, out?["isRunning"]?.bool, name)
      XCTAssertEqual(snapshot.awaitingReason, out?["awaitingReason"]?.string, name)
      XCTAssertEqual(snapshot.notifyEnabled, out?["notifyEnabled"]?.bool, name)
      XCTAssertEqual(snapshot.isHidden, out?["isHiddenFromSidebar"]?.bool, name)
      XCTAssertEqual(snapshot.lastMessageId, out?["lastMessageId"]?.string, name)
      XCTAssertEqual(snapshot.lastMessagePreview, out?["lastMessagePreview"]?.string, name)
    }
  }

  func testTheChanges() {
    for row in cases("diffAgentNotificationTransitions") {
      let name = row["name"]?.string ?? ""
      // An empty reason is no reason here (the roster's text): the host never sends one.
      if name.contains("empty string") { continue }
      var before: [String: AgentNotifications.Snapshot] = [:]
      for item in row["input"]?["before"]?.array ?? [] { let snapshot = AgentNotifications.Snapshot(agent(item)); before[snapshot.id] = snapshot }
      let after = (row["input"]?["after"]?.array ?? []).map { AgentNotifications.Snapshot(agent($0)) }
      let found = AgentNotifications.transitions(from: before, to: after)
      let shipped = row["output"]?.array ?? []
      XCTAssertEqual(found.map(\.agentId), shipped.compactMap { $0["agentId"]?.string }, name)
      XCTAssertEqual(found.map(\.kind.rawValue), shipped.compactMap { $0["kind"]?.string }, name)
      XCTAssertEqual(found.map(\.reason), shipped.map { $0["reason"]?.string }, name)
    }
  }

  func testTheDecider() {
    let scenarios = cases("SandOsNotificationDecider")
    XCTAssertEqual(scenarios.count, 11)
    for scenario in scenarios {
      let decider = NotificationDecider()
      let name = scenario["name"]?.string ?? ""
      for (index, entry) in (scenario["output"]?.array ?? []).enumerated() {
        let step = entry["step"]
        let focused = step?["focused"]?.bool ?? false
        let now = step?["now"]?.double ?? 0
        var shown: [AgentNotifications.Transition] = []
        switch step?["op"]?.string {
        case "seed": decider.seedBaseline((step?["agents"]?.array ?? []).map { AgentNotifications.Snapshot(agent($0)) })
        case "upsert": shown = decider.decideAgent(AgentNotifications.Snapshot(agent(step?["agent"])), isWindowFocused: focused, nowMs: now)
        case "roster": shown = decider.decide((step?["agents"]?.array ?? []).map { AgentNotifications.Snapshot(agent($0)) }, isWindowFocused: focused, nowMs: now)
        default: XCTFail("\(name): \(step?["op"]?.string ?? "")")
        }
        let expected = entry["shown"]?.array ?? []
        let label = "\(name), step \(index)"
        XCTAssertEqual(shown.map(\.agentId), expected.compactMap { $0["agentId"]?.string }, label)
        XCTAssertEqual(shown.map(\.kind.rawValue), expected.compactMap { $0["kind"]?.string }, label)
        XCTAssertEqual(shown.map { AgentNotifications.content($0).title }, expected.compactMap { $0["title"]?.string }, label)
        XCTAssertEqual(shown.map { AgentNotifications.content($0).body }, expected.compactMap { $0["body"]?.string }, label)
      }
    }
  }

  /** The manager's walk-through: an update before the first roster waits for it, then the turn's end and the question each notify once. */
  func testTheFeedWaitsForItsStartingPoint() {
    let feed = NotificationFeed()
    let idle = agent(["id": "a1", "name": "Iris", "isRunning": false, "lastMessageId": "m0", "lastMessagePreview": "old", "notifyOnUpdatesEnabled": true])
    let running = agent(["id": "a1", "name": "Iris", "isRunning": true, "lastMessageId": "m0", "lastMessagePreview": "old", "notifyOnUpdatesEnabled": true])
    let done = agent(["id": "a1", "name": "Iris", "isRunning": false, "lastMessageId": "m1", "lastMessagePreview": "All set.", "notifyOnUpdatesEnabled": true])
    let asking = agent(["id": "a1", "name": "Iris", "isRunning": false, "lastMessageId": "m1", "lastMessagePreview": "All set.", "notifyOnUpdatesEnabled": true, "awaitingUserResponse": ["reason": "Approval needed: wire $40"]])
    XCTAssertTrue(feed.update(running, isWindowFocused: false, nowMs: 0).isEmpty)
    XCTAssertTrue(feed.seed([idle], isWindowFocused: false, nowMs: 0).isEmpty)
    let first = feed.update(done, isWindowFocused: false, nowMs: 1000)
    XCTAssertEqual(first.map { AgentNotifications.content($0).body }, ["All set."])
    let second = feed.update(asking, isWindowFocused: false, nowMs: 2000)
    XCTAssertEqual(second.map { AgentNotifications.content($0).title }, ["Iris needs you"])
    XCTAssertEqual(second.map { AgentNotifications.content($0).body }, ["Approval needed: wire $40"])
    feed.reset()
    XCTAssertTrue(feed.update(done, isWindowFocused: false, nowMs: 9000).isEmpty)
  }

  func testTheDockNumber() {
    for row in cases("computeDockBadgeTotal") {
      XCTAssertEqual(DockBadge.total((row["input"]?.array ?? []).map(agent)), row["output"]?.int, row["name"]?.string ?? "")
    }
    XCTAssertNil(DockBadge.label(0))
    XCTAssertEqual(DockBadge.label(120), "120")
  }

  /** The manager's sequence, step for step (`notify-fixtures.mjs`'s `row` and its calls). */
  func testTheDockFollowsTheNewestRows() {
    func row(_ id: String = "a", unread: Int? = nil, seq: Double, epoch: String = "E1") -> Agent {
      var json: JSON = ["id": .string(id), "hasUnread": .bool(unread != nil), "unreadCount": .number(Double(unread ?? 0)), "isHiddenFromSidebar": false, "snapshotEpoch": .string(epoch), "snapshotSeq": .number(seq)]
      json = json.setting("name", .string(id))
      return agent(json)
    }
    let badge = DockBadge()
    let steps: [(String, () -> Int?)] = [
      ("seed", { badge.roster([row(unread: 2, seq: 5), row("b", seq: 5)]) }),
      ("same total", { badge.roster([row(unread: 2, seq: 6), row("b", seq: 6)]) }),
      ("b unread", { badge.update(row("b", unread: 1, seq: 7)) }),
      ("stale b", { badge.update(row("b", seq: 6)) }),
      ("new c", { badge.update(row("c", unread: 4, seq: 9)) }),
      ("roster at 8", { badge.roster([row(unread: 2, seq: 8), row("b", seq: 8)]) }),
      ("empty roster", { badge.roster([]) }),
      ("new epoch", { badge.roster([row("z", unread: 1, seq: 1, epoch: "E2")]) }),
      ("reset", { badge.reset() }),
    ]
    let shipped = (cases("SandDockBadgeManager").first?["output"]?.array ?? []).map { $0["setBadgeCountCalls"]?.array?.compactMap(\.int) ?? [] }
    XCTAssertEqual(shipped.count, steps.count)
    for (index, (name, run)) in steps.enumerated() {
      XCTAssertEqual(run().map { [$0] } ?? [], shipped[index], name)
    }
  }
}
