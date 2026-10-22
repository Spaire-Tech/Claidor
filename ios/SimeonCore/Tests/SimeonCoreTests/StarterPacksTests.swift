import Foundation
import XCTest
@testable import SimeonCore

/** Starter packs (StarterPacks.swift): the server's pack read, the iPhone's link, and Add making the team in its folder. */
final class StarterPacksTests: XCTestCase {
  func testThePackAsTheServerSendsIt() throws {
    let json: JSON = [
      "id": "coffee-shop", "folder": "Coffee Shop Team", "title": "Simeon for Coffee Shops", "summary": "Five agents.",
      "appNames": ["square": "Square"],
      "agents": [["name": "Bruno", "title": "Stock", "face": "clay-02", "summary": "Keeps the shelves full.", "apps": ["square", "veryfi"], "description": "Keeps the coffee shop stocked."]],
    ]
    let pack = try XCTUnwrap(StarterPack(json: json))
    XCTAssertEqual(pack.sectionId, "pack-coffee-shop")
    XCTAssertEqual(pack.members.map(\.name), ["Bruno"])
    XCTAssertEqual(pack.members[0].instructions, "Keeps the coffee shop stocked.")
    // An app the server names no further keeps its id.
    XCTAssertEqual(pack.members[0].apps, [StarterPack.App(id: "square", name: "Square"), StarterPack.App(id: "veryfi", name: "veryfi")])
    XCTAssertNil(StarterPack(json: ["id": "Coffee Shop", "folder": "x", "agents": [["name": "A"]]]))
    XCTAssertNil(StarterPack(json: ["id": "empty", "folder": "Empty", "agents": []]))
  }

  func testTheIPhonesLink() {
    XCTAssertEqual(StarterPack.linked(URL(string: "simeon-ios://app/v1/pack/add?id=coffee-shop")!, scheme: "simeon-ios"), "coffee-shop")
    for raw in ["simeon://app/v1/pack/add?id=coffee-shop", "simeon-ios://app/v1/pack/add", "simeon-ios://app/v1/pack/add?id=a&id=b",
                "simeon-ios://app/v1/pack/add?id=Coffee", "simeon-ios://other/v1/pack/add?id=a", "simeon-ios://app/v1/open"] {
      XCTAssertNil(StarterPack.linked(URL(string: raw)!, scheme: "simeon-ios"), raw)
    }
  }

  /** Add: five agents with their faces, titles and instructions, in a section named after the pack; found again once added. */
  @MainActor
  func testAddMakesTheTeamInItsFolder() async throws {
    let store = AppStore()
    await store.attach(DemoBackend(seed: DemoData.seed(), pace: 0.01, call: nil))
    let pack = try await store.starterPack("coffee-shop")
    XCTAssertEqual(store.packAgents(pack), [])
    let made = await store.addPack(pack)
    XCTAssertEqual(made.count, 5)
    let team = made.compactMap { id in store.agents.first { $0.id == id } }
    XCTAssertEqual(team.map(\.name), ["Bruno", "Clara", "Mae", "Ines", "Hugo"])
    XCTAssertEqual(team.map(\.title), ["Stock", "Shifts", "Socials", "Customers", "Money"])
    XCTAssertEqual(team.map(\.avatarShape), ["clay-02", "clay-01", "clay-03", "clay-04", "clay-05"])
    XCTAssertTrue(team.allSatisfy { $0.description.contains("Starts by asking to connect") })
    let section = try XCTUnwrap(store.sidebarSections?.first)
    XCTAssertEqual(section.id, "pack-coffee-shop")
    XCTAssertEqual(section.name, "Coffee Shop Team")
    XCTAssertEqual(section.agentIds, made)
    XCTAssertEqual(store.packAgents(pack), made)
    do {
      _ = try await store.starterPack("nope")
      XCTFail("a pack the server doesn't have")
    } catch {}
  }
}
