import Observation
import XCTest
@testable import SimeonCore

/**
 * What the iPhone's screens watch changes only when it changes (the
 * founder's log, 10 October 2026: the screen stood still a third of a
 * second after an agent's update and after the computer's disk news).
 */
@MainActor
final class PhoneSpeedTests: XCTestCase {
  func testTheRosterFlagsChangeOnlyWhenTheyFlip() {
    let store = AppStore()
    XCTAssertFalse(store.hasAgents)
    var theo = Agent(id: "theo", name: "Theo")
    store.apply(.agentUpserted(theo))
    XCTAssertTrue(store.hasAgents)
    XCTAssertFalse(store.hasHidden)
    let touched = Flag()
    withObservationTracking { _ = store.hasAgents; _ = store.hasHidden } onChange: { touched.set() }
    // A step of the agent's turn: the roster changes, the flags do not.
    theo.lastActivityAt = 5_000
    store.apply(.agentUpserted(theo))
    XCTAssertFalse(touched.value, "an agent's step leaves the flags alone")
    theo.isHidden = true
    store.apply(.agentUpserted(theo))
    XCTAssertTrue(store.hasHidden)
    XCTAssertTrue(touched.value)
  }

  func testTheSameDiskNewsAgainChangesNothing() {
    let store = AppStore()
    store.apply(.diskPressure(["level": "soft"]))
    XCTAssertEqual(store.diskPressure, "soft")
    let touched = Flag()
    withObservationTracking { _ = store.computer } onChange: { touched.set() }
    store.apply(.diskPressure(["level": "soft"]))
    XCTAssertFalse(touched.value, "the same level again redraws nothing")
    store.apply(.diskPressure(nil))
    XCTAssertTrue(touched.value)
    XCTAssertNil(store.diskPressure)
  }

  func testTheIPhonesTrayCrossTakesTheNoticeAtOnce() async {
    let store = AppStore()
    store.apply(.tray(["type": "snapshot", "trays": [["id": "t1", "agentId": "theo", "title": "Agent failed to respond"]]]))
    XCTAssertEqual(store.trayList.trays.map(\.id), ["t1"])
    // No computer to tell (no backend): the notice still goes at the tap.
    await store.dismissTray("t1", atOnce: true)
    XCTAssertTrue(store.trayList.trays.isEmpty)
  }
}
