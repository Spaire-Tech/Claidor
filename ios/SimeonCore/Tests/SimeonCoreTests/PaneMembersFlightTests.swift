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

  func testTheFlightIsWordedAsTheIPhonesSheetWordsIt() throws {
    let text = """
    ```simeon-flights
    {"title":"SFO to JFK","offers":[{"airline":"Alaska","price":"$412","priceNote":"round trip","date":"Thu, Oct 16","duration":"7h 55m","stops":"1 stop · SEA","refundable":"Not refundable","legs":[
      {"from":"SFO","to":"SEA","depart":"6:15 AM","departDay":"Thu, Oct 16","arrive":"8:20 AM","flight":"AS 24 · operated by Horizon Air","carrier":"Horizon Air","layover":"1h 05m in Seattle","heading":"Outbound"},
      {"from":"SEA","to":"JFK","depart":"9:25 AM","arrive":"5:55 PM","flight":"AS 8","carrier":"Alaska","layover":"2h in Nowhere"}]}]}
    ```
    """
    let offer = try XCTUnwrap(FlightsCard.parse(text)?.offers.first)
    // The Mac's pane draws the flight as the iPhone's sheet (24 October 2026), from the same words.
    XCTAssertEqual(offer.ways.map(\.legs.count), [2])
    XCTAssertEqual(offer.legs[0].departing, "Thu, Oct 16 at 6:15am")
    XCTAssertEqual(offer.legs[0].flightLines, ["AS 24 · Horizon Air", "Operated by Horizon Air"])
    XCTAssertEqual(offer.legs[0].layoverLine, "1h 05m layover in Seattle")
    XCTAssertEqual(offer.legs[1].arriving, "5:55pm")
    XCTAssertEqual(offer.terms, ["Cancellation: Not refundable"])
    XCTAssertEqual(FlightPane.key(row: "e1", index: 2), "e1:2")
  }

  func testATicketSoldByAnotherCompanySaysSoAfterTheTerms() throws {
    let text = """
    ```simeon-flights
    {"title":"Dakar to Casablanca","offers":[{"airline":"Air Senegal","soldBy":"Hahn Air","price":"$380","bags":"1 carry-on","legs":[{"from":"DSS","to":"CMN","flight":"HC 403","carrier":"Air Senegal"}]}]}
    ```
    """
    let offer = try XCTUnwrap(FlightsCard.parse(text)?.offers.first)
    XCTAssertEqual(offer.airline, "Air Senegal")
    XCTAssertEqual(offer.soldBy, "Hahn Air")
    XCTAssertEqual(offer.terms, ["1 carry-on", "Sold by: Hahn Air"])
    // An airline that sells its own seats says nothing more.
    let own = try XCTUnwrap(FlightsCard.parse(text.replacingOccurrences(of: "\"soldBy\":\"Hahn Air\",", with: ""))?.offers.first)
    XCTAssertEqual(own.terms, ["1 carry-on"])
  }
}

/** A file in the chat, named as a title (24 October 2026). */
final class FileTitleTests: XCTestCase {
  func testAFileReadsAsATitle() {
    XCTAssertEqual(fileTitle("dakar_trip_budget.xlsx"), "Dakar trip budget")
    XCTAssertEqual(fileTitle("dakar-trip-budget.docx"), "Dakar trip budget")
    XCTAssertEqual(fileTitle("Saint-Louis_menu.pdf"), "Saint-Louis menu", "a dash inside a name with spaces stays")
    XCTAssertEqual(fileTitle("Modele_couts_v0.3.xlsx"), "Modele couts v0.3")
    XCTAssertEqual(fileTitle("Q3 plan.pdf"), "Q3 plan")
    XCTAssertEqual(fileTitle("notes"), "Notes")
    XCTAssertEqual(fileTitle("53cd913a74a0bf1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d52237da92d6.xlsx"), "Spreadsheet", "a name made from the contents says the kind")
    XCTAssertEqual(fileTitle("5a710c2ebcc56d00112233445566778899aabbccddeeff00112233bbf6ddfaaceb.bin"), "File")
  }

  func testTheCardTakesTheAgentsNameForTheFile() {
    let entry = Entry(["kind": "send-message", "id": "s", "message": ["type": "attachment", "url": "file:///Users/a/.simeon/attachments/53cd913a74a0bf.xlsx", "file_name": "dakar_trip_budget.xlsx"]])!
    XCTAssertEqual(Chat.threadTitle(entry), "Dakar trip budget")
    XCTAssertEqual(entry.preview, "Dakar trip budget")
  }
}

/** Settings › General's rules (step 8), against the window's. */
final class SettingsGeneralTests: XCTestCase {
  func testAutoReviewIsKeptAsTheHostKeepsIt() {
    let long = String(repeating: "a", count: 1_200)
    let json: JSON = ["isEnabled": false, "allowInstructions": ["  reply to emails ", "", "reply to emails", .string(long)], "blockInstructions": .array((1...25).map { .string("rule \($0)") })]
    let rules = AutoReviewInstructions.normalized(json: json)
    XCTAssertFalse(rules.isEnabled)
    XCTAssertEqual(rules.allow.count, 2)
    XCTAssertEqual(rules.allow[0], "reply to emails")
    XCTAssertEqual(rules.allow[1].count, 1_000)
    XCTAssertEqual(rules.ask.count, 20)
    XCTAssertTrue(AutoReviewInstructions.normalized(json: nil).isEnabled)
  }

  func testTheTimeZoneWords() {
    XCTAssertEqual(TimeZoneChoices.triggerLabel(override: nil, detected: "America/New_York"), "Auto-detect (America/New York)")
    XCTAssertEqual(TimeZoneChoices.triggerLabel(override: "Asia/Tokyo", detected: "UTC"), "Asia/Tokyo")
    XCTAssertNil(TimeZoneChoices.override(hostSettings: ["userTimeZoneOverride": ""]))
    XCTAssertEqual(TimeZoneChoices.override(hostSettings: ["userTimeZoneOverride": "Asia/Tokyo"]), "Asia/Tokyo")
    XCTAssertEqual(TimeZoneChoices.timeNow(in: "UTC", now: Date(timeIntervalSince1970: 72_960)), "8:16 PM")
    // The menu's rows with one formatter: each zone's own time, "" for one not known.
    XCTAssertEqual(TimeZoneChoices.timesNow(in: ["UTC", "Not/AZone", "Asia/Tokyo"], now: Date(timeIntervalSince1970: 72_960)),
                   ["8:16 PM", "", "5:16 AM"])
  }
}
