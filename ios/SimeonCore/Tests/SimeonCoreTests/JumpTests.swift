import XCTest
@testable import SimeonCore

/** Search (⌘K) as the Mac window does it (`Jump`), checked against what the window shows for the same rows. */
final class JumpTests: XCTestCase {
  private let theo = Agent(id: "theo", name: "Theo", title: "Bookkeeping", description: "Keeps the books.")
  private let simeon = Agent(id: "simeon", name: "Simeon", title: "Chief of Staff", description: "Runs your day.")
  private let scout = Agent(id: "scout", name: "Scout", title: "Customer research", description: "Reads what customers say.", isHidden: true)
  private let squad = Agent(id: "squad", name: "Launch squad", isGroup: true, memberIds: ["simeon", "theo", "gone"])

  func testNormalizeTakesAccentsAndSeparatorsOff() {
    let (letters, sources) = Jump.normalize("Café-Bar  2")
    XCTAssertEqual(String(letters), "cafe bar 2")
    XCTAssertEqual(sources, [0, 1, 2, 3, -1, 5, 6, 7, -1, 10])
    XCTAssertEqual(Jump.tokens("  Théme: DARK "), ["theme", "dark"])
    XCTAssertEqual(Jump.tokens("!!"), [])
  }

  func testScoreFollowsTheWindow() {
    // "th" in "theo": 5 for the word start, 1 + 3 for the next letter, less 0.02 a letter.
    XCTAssertEqual(Jump.score(Array("theo"), Array("th"))!, 9 - 0.08, accuracy: 1e-9)
    XCTAssertNil(Jump.score(Array("theo"), Array("x")))
    // Letters too far apart do not match (more than three times the word's length).
    XCTAssertNil(Jump.score(Array("abcdefghij"), Array("aj")))
    XCTAssertEqual(Jump.score(Array("abc"), []), 0)
  }

  func testTypedThListsTheoThenTheThemesShortestFirst() {
    let commands = Jump.commands(orgChart: true, hiddenCount: 0, current: simeon, hasChannels: true, theme: "light")
    let rows = Jump.results(agents: [simeon, theo], hidden: [], commands: commands, tab: .all, query: "th")
    XCTAssertEqual(Array(rows.map(\.title).prefix(4)), ["Theo", "Theme: Dark", "Theme: Light", "Theme: System"])
  }

  func testNoQueryListsAgentsThenActionsOnAll() {
    let commands = Jump.commands(orgChart: false, hiddenCount: 0, current: nil, hasChannels: false, theme: "system")
    let rows = Jump.results(agents: [simeon, squad], hidden: [scout], commands: commands, tab: .all, query: "  ")
    XCTAssertEqual(rows.first?.id, "agent:simeon")
    XCTAssertEqual(rows[1].kind, "Group")
    XCTAssertEqual(rows.count, 2 + commands.count)
    XCTAssertFalse(rows.contains { $0.id == "agent:scout" })
    XCTAssertEqual(Jump.results(agents: [simeon, squad], hidden: [], commands: commands, tab: .groups, query: "").map(\.id), ["agent:squad"])
  }

  func testHiddenAgentsComeLastAndOnlyForAQuery() {
    let rows = Jump.results(agents: [simeon], hidden: [scout], commands: [], tab: .all, query: "sco")
    XCTAssertEqual(rows.map(\.id), ["agent:scout"])
    if case .agent(_, let hidden) = rows[0] { XCTAssertTrue(hidden) } else { XCTFail() }
  }

  func testHostMatchesTheWordsMissedFollowUnlessStale() {
    let hit = MessageHit(["agentId": "theo", "entryId": "t1", "role": "assistant", "snippet": "The runway is 14 months.", "timestampMs": 1])!
    let other = MessageHit(["agentId": "simeon", "entryId": "m1", "role": "user", "snippet": "Where are we on Thursday?", "timestampMs": 1])!
    let rows = Jump.results(agents: [], hidden: [], commands: [], messages: [hit, other], tab: .all, query: "runway")
    XCTAssertEqual(rows.map(\.id), ["message:theo:t1", "message:simeon:m1"])
    let stale = Jump.results(agents: [], hidden: [], commands: [], messages: [hit, other], messagesStale: true, tab: .all, query: "runway")
    XCTAssertEqual(stale.map(\.id), ["message:theo:t1"])
  }

  func testCommandsInTheWindowsOrder() {
    let ids = Jump.commands(orgChart: true, hiddenCount: 1, current: squad, hasChannels: true, theme: "dark").map(\.id)
    XCTAssertEqual(ids, ["view:org-chart", "open-hidden-chats", "info:members", "info:channels", "info:settings", "settings:general", "settings:usage", "overlay:plugins", "theme:system", "theme:light", "theme:dark"])
    let bare = Jump.commands(orgChart: false, hiddenCount: 0, current: nil, hasChannels: true, usage: false, theme: "dark")
    XCTAssertEqual(bare.map(\.id), ["settings:general", "overlay:plugins", "theme:system", "theme:light", "theme:dark"])
    XCTAssertEqual(bare.filter(\.isActive).map(\.id), ["theme:dark"])
  }

  func testMarksBoldEveryPlaceAWordIsFound() {
    let runs = Jump.marks("Theme: Dark", query: "th")
    XCTAssertEqual(runs.map(\.text), ["Th", "eme: Dark"])
    XCTAssertEqual(runs.map(\.isMatch), [true, false])
    XCTAssertEqual(Jump.marks("Monday runway check", query: "runway").map(\.text), ["Monday ", "runway", " check"])
    XCTAssertEqual(Jump.marks("Theo", query: "").map(\.isMatch), [false])
  }

  func testSubtitles() {
    let byId = Dictionary(uniqueKeysWithValues: [simeon, theo].map { ($0.id, $0) })
    XCTAssertEqual(Jump.subtitle(.agent(squad, hidden: false), agents: byId), "Simeon, Theo")
    XCTAssertEqual(Jump.subtitle(.agent(theo, hidden: false), agents: byId), "Keeps the books.")
    let routine = RoutineHit(["agentId": "theo", "automation": ["id": "r1", "name": "Monday runway check", "prompt": "Check.", "schedule": "0 9 * * 1", "triggerDescription": "Every Monday at 9:00 AM"]])!
    XCTAssertEqual(Jump.subtitle(.routine(routine), agents: byId), "Every Monday at 9:00 AM · Theo")
  }

  func testTabs() {
    XCTAssertEqual(Jump.tabs(globalSearch: false), [.all, .agents, .groups, .actions])
    XCTAssertEqual(Jump.nextTab(.all, by: -1, in: Jump.tabs(globalSearch: false)), .actions)
    XCTAssertEqual(Jump.nextTab(.actions, by: 1, in: Jump.tabs(globalSearch: true)), .all)
    XCTAssertEqual(Jump.empty(tab: .links, unavailable: false).label, "No links in this chat yet")
    XCTAssertEqual(Jump.shortcut(8), 9)
    XCTAssertNil(Jump.shortcut(9))
  }

  func testSettled() {
    XCTAssertEqual(Jump.settled(tab: .all, globalSearch: true, filtered: true, messages: .loading, files: .ready, routines: .ready), .pending)
    XCTAssertEqual(Jump.settled(tab: .files, globalSearch: true, filtered: false, messages: .failed, files: .ready, routines: .ready), .settled)
    XCTAssertEqual(Jump.settled(tab: .routines, globalSearch: true, filtered: false, messages: .ready, files: .ready, routines: .failed), .unavailable)
    XCTAssertEqual(Jump.settled(tab: .all, globalSearch: false, filtered: true, messages: .loading, files: .loading, routines: .loading), .settled)
  }

  func testLinksOfTheOpenChat() {
    let entries = [
      Entry(["kind": "message", "id": "a", "content": "See [the doc](https://Docs.Example.com/a) and ![shot](https://img.example.com/x.png)"])!,
      Entry(["kind": "message", "id": "b", "content": " https://example.com "])!,
      Entry(["kind": "send-message", "id": "c", "message": ["type": "attachment", "url": "https://files.example.com/r.pdf"]])!,
      Entry(["kind": "message", "id": "d", "content": "[again](https://docs.example.com/a)"])!,
      Entry(["kind": "message", "id": "e", "content": "not a link"])!,
    ]
    XCTAssertEqual(Jump.links(entries), ["https://docs.example.com/a", "https://example.com/", "https://files.example.com/r.pdf"])
    XCTAssertEqual(Jump.address("https://example.com/"), "example.com")
    XCTAssertEqual(Jump.address("https://docs.example.com/a?b=1"), "docs.example.com/a")
    XCTAssertNil(Jump.web("ftp://example.com"))
    XCTAssertNil(Jump.web("https://exa mple.com"))
  }

  func testOrderedPutsPinsFirst() {
    XCTAssertEqual(Jump.ordered([simeon, theo, squad], pinnedIds: ["squad", "missing"]).map(\.id), ["squad", "simeon", "theo"])
  }
}
