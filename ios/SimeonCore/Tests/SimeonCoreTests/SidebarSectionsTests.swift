import XCTest
@testable import SimeonCore

/**
 * The sidebar's sections against the shipped window's own code: the expected
 * values below were made by running the bundle's `dZ.normalize`, the sections
 * store's commands, `Cct` and `Ict` in Node (`sections/fixtures.mjs` in the
 * work notes), on these inputs.
 */
final class SidebarSectionsTests: XCTestCase {
  static let fixtures = #"""
{"normalize":[{"in":[],"out":[]},{"in":[{"id":" a ","name":"Work","agentIds":["1","2","","2"]},{"id":"a","name":"Dup","agentIds":["3"]},{"id":"__agents__","name":"x","agentIds":["4"]},{"id":"b","name":"Home","agentIds":["2","5"]},{"id":"","name":"no","agentIds":["6"]}],"out":[{"id":"a","name":"Work","agentIds":["1","2"]},{"id":"b","name":"Home","agentIds":["5"]},{"id":"__agents__","name":"Unassigned","agentIds":[]}]},{"in":[{"id":"__agents__","name":"Unassigned","agentIds":[]}],"out":[]},{"in":[{"id":"s1","name":"One","agentIds":["1"]},{"id":"s2","name":"Two","agentIds":["2","3"]},{"id":"s3","name":"Three","agentIds":[]}],"out":[{"id":"s1","name":"One","agentIds":["1"]},{"id":"s2","name":"Two","agentIds":["2","3"]},{"id":"s3","name":"Three","agentIds":[]},{"id":"__agents__","name":"Unassigned","agentIds":[]}]}],"base":[{"id":"s1","name":"One","agentIds":["1"]},{"id":"s2","name":"Two","agentIds":["2","3"]},{"id":"s3","name":"Three","agentIds":[]},{"id":"__agents__","name":"Unassigned","agentIds":[]}],"edits":[{"op":"rename","args":["s2","Renamed"],"out":[{"id":"s1","name":"One","agentIds":["1"]},{"id":"s2","name":"Renamed","agentIds":["2","3"]},{"id":"s3","name":"Three","agentIds":[]},{"id":"__agents__","name":"Unassigned","agentIds":[]}]},{"op":"rename","args":["__agents__","Nope"],"out":[{"id":"s1","name":"One","agentIds":["1"]},{"id":"s2","name":"Two","agentIds":["2","3"]},{"id":"s3","name":"Three","agentIds":[]},{"id":"__agents__","name":"Unassigned","agentIds":[]}]},{"op":"remove","args":["s1"],"out":[{"id":"s2","name":"Two","agentIds":["2","3"]},{"id":"s3","name":"Three","agentIds":[]},{"id":"__agents__","name":"Unassigned","agentIds":[]}]},{"op":"remove","args":["__agents__"],"out":[{"id":"s1","name":"One","agentIds":["1"]},{"id":"s2","name":"Two","agentIds":["2","3"]},{"id":"s3","name":"Three","agentIds":[]},{"id":"__agents__","name":"Unassigned","agentIds":[]}]},{"op":"create","args":["new1",["3","9"]],"out":[{"id":"new1","name":"New section","agentIds":["3","9"]},{"id":"s1","name":"One","agentIds":["1"]},{"id":"s2","name":"Two","agentIds":["2"]},{"id":"s3","name":"Three","agentIds":[]},{"id":"__agents__","name":"Unassigned","agentIds":[]}]},{"op":"assignAgents","args":[["3","1","3"],"s3"],"out":[{"id":"s1","name":"One","agentIds":[]},{"id":"s2","name":"Two","agentIds":["2"]},{"id":"s3","name":"Three","agentIds":["3","1"]},{"id":"__agents__","name":"Unassigned","agentIds":[]}]},{"op":"assignAgents","args":[["2"],"__agents__"],"out":[{"id":"s1","name":"One","agentIds":["1"]},{"id":"s2","name":"Two","agentIds":["3"]},{"id":"s3","name":"Three","agentIds":[]},{"id":"__agents__","name":"Unassigned","agentIds":[]}]},{"op":"assignAgents","args":[["7"],"s1"],"out":[{"id":"s1","name":"One","agentIds":["1","7"]},{"id":"s2","name":"Two","agentIds":["2","3"]},{"id":"s3","name":"Three","agentIds":[]},{"id":"__agents__","name":"Unassigned","agentIds":[]}]},{"op":"move","args":["s3","s1","before"],"out":[{"id":"s3","name":"Three","agentIds":[]},{"id":"s1","name":"One","agentIds":["1"]},{"id":"s2","name":"Two","agentIds":["2","3"]},{"id":"__agents__","name":"Unassigned","agentIds":[]}]},{"op":"move","args":["s1","s3","after"],"out":[{"id":"s2","name":"Two","agentIds":["2","3"]},{"id":"s3","name":"Three","agentIds":[]},{"id":"s1","name":"One","agentIds":["1"]},{"id":"__agents__","name":"Unassigned","agentIds":[]}]},{"op":"move","args":["s1","__agents__","after"],"out":[{"id":"s1","name":"One","agentIds":["1"]},{"id":"s2","name":"Two","agentIds":["2","3"]},{"id":"s3","name":"Three","agentIds":[]},{"id":"__agents__","name":"Unassigned","agentIds":[]}]},{"op":"move","args":["s2","s2","before"],"out":[{"id":"s1","name":"One","agentIds":["1"]},{"id":"s3","name":"Three","agentIds":[]},{"id":"s2","name":"Two","agentIds":["2","3"]},{"id":"__agents__","name":"Unassigned","agentIds":[]}]},{"op":"move","args":["zz","s1","before"],"out":[{"id":"s1","name":"One","agentIds":["1"]},{"id":"s2","name":"Two","agentIds":["2","3"]},{"id":"s3","name":"Three","agentIds":[]},{"id":"__agents__","name":"Unassigned","agentIds":[]}]}],"removeAll":[],"shown":[{"pins":[],"sections":[{"id":"s1","name":"One","agentIds":["1"]},{"id":"s2","name":"Two","agentIds":["2","3"]},{"id":"s3","name":"Three","agentIds":[]},{"id":"__agents__","name":"Unassigned","agentIds":[]}],"collapsed":[],"shown":[{"id":"s1","un":false,"col":false,"agents":["1"]},{"id":"s2","un":false,"col":false,"agents":["2","3"]},{"id":"s3","un":false,"col":false,"agents":[]},{"id":"__agents__","un":true,"col":false,"agents":["4","5","6"]}],"order":["1","2","3","4","5","6"]},{"pins":["2","9"],"sections":[{"id":"s1","name":"One","agentIds":["1"]},{"id":"s2","name":"Two","agentIds":["2","3"]},{"id":"s3","name":"Three","agentIds":[]},{"id":"__agents__","name":"Unassigned","agentIds":[]}],"collapsed":["s2"],"shown":[{"id":"s1","un":false,"col":false,"agents":["1"]},{"id":"s2","un":false,"col":true,"agents":["3"]},{"id":"s3","un":false,"col":false,"agents":[]},{"id":"__agents__","un":true,"col":false,"agents":["4","5","6"]}],"order":["2","1","4","5","6"]},{"pins":["4"],"sections":[],"collapsed":[],"shown":[],"order":["4","1","2","3","5","6"]},{"pins":[],"sections":[{"id":"s1","name":"One","agentIds":["1","2","3","4","5","6"]},{"id":"__agents__","name":"Unassigned","agentIds":[]}],"collapsed":[],"shown":[{"id":"s1","un":false,"col":false,"agents":["1","2","3","4","5","6"]}],"order":["1","2","3","4","5","6"]},{"pins":["6","1"],"sections":[{"id":"s1","name":"One","agentIds":["1"]},{"id":"s2","name":"Two","agentIds":["2","3"]},{"id":"s3","name":"Three","agentIds":[]},{"id":"__agents__","name":"Unassigned","agentIds":[]}],"collapsed":["__agents__"],"shown":[{"id":"s1","un":false,"col":false,"agents":[]},{"id":"s2","un":false,"col":false,"agents":["2","3"]},{"id":"s3","un":false,"col":false,"agents":[]},{"id":"__agents__","un":true,"col":true,"agents":["4","5"]}],"order":["6","1","2","3"]}]}
"""#

  lazy var data: JSON = try! JSON.parse(Self.fixtures)

  func sections(_ json: JSON?) -> [SidebarSection] {
    (json?.array ?? []).map { SidebarSection(id: $0["id"]!.string!, name: $0["name"]!.string!, agentIds: $0["agentIds"]!.array!.map { $0.string! }) }
  }

  func testNormalizeAndEdits() {
    for item in data["normalize"]!.array! {
      XCTAssertEqual(SidebarSections.normalize(sections(item["in"])), sections(item["out"]))
    }
    let base = sections(data["base"])
    var checked = 0
    for item in data["edits"]!.array! {
      let args = item["args"]!.array!
      let got: [SidebarSection]
      switch item["op"]!.string! {
      case "rename": got = SidebarSections.rename(base, id: args[0].string!, to: args[1].string!)
      case "remove": got = SidebarSections.remove(base, id: args[0].string!)
      case "create": got = SidebarSections.create(base, id: args[0].string!, agentIds: args[1].array!.map { $0.string! })
      case "assignAgents": got = SidebarSections.assign(base, agentIds: args[0].array!.map { $0.string! }, to: args[1].string!)
      default: got = SidebarSections.move(base, id: args[0].string!, to: args[1].string!, before: args[2].string! == "before")
      }
      XCTAssertEqual(got, sections(item["out"]), "\(item["op"]!.string!) \(args)")
      checked += 1
    }
    XCTAssertEqual(checked, 13)
    let empty = ["s1", "s2", "s3"].reduce(base) { SidebarSections.remove($0, id: $1) }
    XCTAssertEqual(empty, sections(data["removeAll"]))
    XCTAssertTrue(empty.isEmpty)
  }

  func testShownAndOrder() {
    let agents = (1...6).map { Agent(id: "\($0)", name: "A\($0)") }
    var checked = 0
    for item in data["shown"]!.array! {
      let pins = item["pins"]!.array!.map { $0.string! }
      let secs = sections(item["sections"])
      let folded = Set(item["collapsed"]!.array!.map { $0.string! })
      let shown = SidebarSections.shown(agents: agents, pinnedIds: pins, sections: secs, collapsed: folded)
      let want = item["shown"]!.array!
      XCTAssertEqual(shown.map(\.id), want.map { $0["id"]!.string! })
      XCTAssertEqual(shown.map(\.isUnassigned), want.map { $0["un"]!.bool! })
      XCTAssertEqual(shown.map(\.isCollapsed), want.map { $0["col"]!.bool! })
      XCTAssertEqual(shown.map { $0.agents.map(\.id) }, want.map { $0["agents"]!.array!.map { $0.string! } })
      XCTAssertEqual(SidebarSections.order(agents: agents, pinnedIds: pins, sections: secs, collapsed: folded), item["order"]!.array!.map { $0.string! })
      checked += 1
    }
    XCTAssertEqual(checked, 5)
  }

  func testSelectionAndWords() {
    let order = ["p", "a", "b", "c", "d"]
    var selection = SidebarSelection()
    selection.extend(to: "b", order: order)
    XCTAssertEqual(selection.ids, ["b"])
    selection.extend(to: "d", order: order)
    XCTAssertEqual(selection.ids, ["b", "c", "d"])
    selection.extend(to: "p", order: order)
    XCTAssertEqual(selection.ids, ["p", "a", "b"])
    selection.toggle("a")
    XCTAssertEqual(selection.ids, ["p", "b"])
    XCTAssertEqual(Set(selection.targets(for: "b")), ["p", "b"])
    XCTAssertEqual(selection.targets(for: "c"), ["c"])
    selection.plain("c")
    XCTAssertTrue(selection.isEmpty)
    selection.extend(to: "a", order: order)
    XCTAssertEqual(selection.ids, ["a", "b", "c"])
    selection.keep(["a", "c"])
    XCTAssertEqual(selection.ids, ["a", "c"])

    XCTAssertEqual(SidebarSections.newSectionLabel(inList: false, count: 3), "Move 3 agents to new section")
    XCTAssertEqual(SidebarSections.newSectionLabel(inList: true, count: 3), "New section")
    XCTAssertEqual(SidebarSections.moveLabel(count: 1), "Move to")
    XCTAssertTrue(SidebarSections.newId(at: Date(timeIntervalSince1970: 1), seed: 36).hasPrefix("section-rs-10"))
    let group = Agent(id: "g", name: "Team", isGroup: true), agent = Agent(id: "a", name: "Nora")
    XCTAssertEqual(AgentDeletion.title([agent]), "Delete \u{201C}Nora\u{201D}")
    XCTAssertEqual(AgentDeletion.title([group, group]), "Delete 2 groups")
    XCTAssertEqual(AgentDeletion.title([group, agent]), "Delete 2 agents")
    XCTAssertTrue(AgentDeletion.message([group, agent]).hasPrefix("This permanently deletes the agents"))
  }
}
