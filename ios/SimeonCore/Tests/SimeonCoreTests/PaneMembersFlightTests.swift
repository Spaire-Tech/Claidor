import XCTest
@testable import SimeonCore

/** The pane's members list and flight details (step 7d), against the window's rules. */
final class PaneMembersFlightTests: XCTestCase {
  func testCandidatesAndTheListsRules() {
    let group = Agent(id: "g", name: "Launch", isGroup: true, memberIds: ["a"])
    let agents = [
      Agent(id: "a", name: "Simeon", lastActivityAt: 5), Agent(id: "b", name: "Iris", lastActivityAt: 1),
      Agent(id: "c", name: "Scout", lastActivityAt: 9), Agent(id: "h", name: "Crew", isGroup: true), group,
    ]
    XCTAssertEqual(GroupMembers.candidates(for: group, in: agents).map(\.id), ["c", "b"])
    XCTAssertFalse(GroupMembers.canRemove(count: 1, pending: false))
    XCTAssertFalse(GroupMembers.canRemove(count: 3, pending: true))
    XCTAssertTrue(GroupMembers.canRemove(count: 2, pending: false))
    XCTAssertEqual(GroupMembers.footer(count: 6, candidates: 3), "Groups can have up to 6 members.")
    XCTAssertEqual(GroupMembers.footer(count: 2, candidates: 0), "Create more Agents to add them here.")
    XCTAssertNil(GroupMembers.footer(count: 2, candidates: 1))
    XCTAssertFalse(GroupMembers.showsAdd(count: 6, candidates: 2))
    XCTAssertEqual(GroupMembers.without("a", current: ["a", "b"]), ["b"])
    XCTAssertNil(GroupMembers.without("a", current: ["a"]))
    XCTAssertNil(GroupMembers.without("z", current: ["a", "b"]))
    XCTAssertEqual(GroupMembers.adding("c", to: ["a"]), ["a", "c"])
    XCTAssertNil(GroupMembers.adding("c", to: ["1", "2", "3", "4", "5", "6"]))
  }

  func testASharedRoomShowsNoMembers() {
    XCTAssertTrue(Agent(json: ["id": "g", "name": "Launch", "isGroup": true])!.showsMembers)
    XCTAssertFalse(Agent(json: ["id": "g", "name": "Launch", "isGroup": true, "sharedRoomId": "room-1"])!.showsMembers)
    XCTAssertFalse(Agent(json: ["id": "g", "name": "Launch", "isGroup": true, "remoteRoom": ["owner": "x"]])!.showsMembers)
    XCTAssertFalse(Agent(json: ["id": "a", "name": "Theo"])!.showsMembers)
  }

  func testTheFlightIsWordedAsTheWindowWordsIt() throws {
    let text = """
    ```simeon-flights
    {"title":"SFO to JFK","offers":[{"airline":"Alaska","price":"$412","priceNote":"round trip","date":"Thu, Oct 16","duration":"7h 55m","stops":"1 stop · SEA","refundable":"Not refundable","legs":[
      {"from":"SFO","to":"SEA","depart":"6:15 AM","departDay":"Thu, Oct 16","arrive":"8:20 AM","flight":"AS 24 · operated by Horizon Air","carrier":"Horizon Air","layover":"1h 05m in Seattle","heading":"Outbound"},
      {"from":"SEA","to":"JFK","depart":"9:25 AM","arrive":"5:55 PM","flight":"AS 8","carrier":"Alaska","layover":"2h in Nowhere"}]}]}
    ```
    """
    let offer = try XCTUnwrap(FlightsCard.parse(text)?.offers.first)
    XCTAssertEqual(FlightPane.name(offer), "SFO \u{2192} JFK")
    XCTAssertEqual(FlightPane.title(offer), "Thu, Oct 16 · 7h 55m · 1 stop")
    let sections = FlightPane.sections(offer)
    XCTAssertEqual(sections.map(\.heading), ["Price", "Outbound · SFO \u{2192} SEA", "SEA \u{2192} JFK", "Fare"])
    XCTAssertEqual(sections[0].rows, [FlightPane.Row(label: "Total", value: "$412", sub: "round trip")])
    XCTAssertEqual(sections[1].rows.map(\.value), ["Thu, Oct 16 · 6:15 AM", "8:20 AM", "AS 24 · operated by Horizon Air · Horizon Air"])
    XCTAssertEqual(sections[1].note, "1h 05m layover in Seattle")
    XCTAssertEqual(sections[2].rows.map(\.label), ["Departs", "Arrives", "Flight"])
    XCTAssertNil(sections[2].note)
    XCTAssertEqual(sections[3].rows.map(\.label), ["Cancellation"])
    XCTAssertEqual(FlightPane.key(row: "e1", index: 2), "e1:2")
  }
}
