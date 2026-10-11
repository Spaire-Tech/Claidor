import XCTest
@testable import SimeonCore

/**
 * The routine editor's rules as the Mac's pane keeps them (`RoutineEditing`,
 * the Mac's `RoutineEditorModel`), against the demo's host: nothing is made
 * until a new routine is whole, a row is saved when it is right, a row that
 * is not goes back when its editor closes, and removing the only row empties
 * the card and opens the Add menu.
 */
@MainActor
final class RoutineEditingTests: XCTestCase {
  private func demo() async -> (AppStore, String) {
    let store = AppStore()
    await store.attach(DemoBackend(seed: DemoData.seed(), pace: 0.01, call: nil))
    let agent = store.agents.first { !$0.isGroup }!.id
    await store.loadRoutines(agent)
    return (store, agent)
  }

  func testANewRoutineIsMadeOnceWhole() async {
    let (store, agent) = await demo()
    let before = store.routinesByAgent[agent]?.count ?? 0
    let editor = RoutineEditing(agentId: agent, routine: nil)
    XCTAssertTrue(editor.isNew)
    XCTAssertTrue(editor.rows.isEmpty, "a new routine starts with no trigger, as on the Mac")
    editor.name = "Launch check"
    editor.nameDone(store: store)
    editor.prompt = "Read the launch channel"
    editor.promptDone(store: store)
    await editor.settled()
    XCTAssertNil(editor.routineId, "no trigger yet: nothing is made")
    XCTAssertEqual(store.routinesByAgent[agent]?.count ?? 0, before)

    editor.addSchedule("0 8 * * 1-5", opens: false, store: store)
    XCTAssertNil(editor.openRow)
    await editor.settled()
    XCTAssertNotNil(editor.routineId)
    XCTAssertEqual(store.routinesByAgent[agent]?.count ?? 0, before + 1)
    let made = editor.stored(store)
    XCTAssertEqual(made?.name, "Launch check")
    XCTAssertEqual(made?.trigger, ["type": "cron", "schedule": "0 8 * * 1-5"])
    store.detach()
  }

  func testRowsSavedWhenRightAndPutBackWhenNot() async {
    let (store, agent) = await demo()
    let editor = RoutineEditing(agentId: agent, routine: nil)
    editor.name = "Watch"
    editor.prompt = "Watch it"
    editor.addSchedule("0 9 * * *", opens: false, store: store)
    await editor.settled()
    guard let id = editor.routineId else { return XCTFail("made") }

    // A Slack row has no channel yet: shown, its editor open, not saved; closing it puts the stored trigger back.
    editor.addSource("slack", store: store)
    XCTAssertEqual(editor.openRow, 1)
    XCTAssertEqual(editor.rows.count, 2)
    editor.closeRow(store: store)
    XCTAssertNil(editor.openRow)
    XCTAssertEqual(editor.rows, [.schedule("0 9 * * *")])

    // Typed (shown, not saved), then committed: the two are saved as a group.
    editor.addSource("slack", store: store)
    editor.set(1, .slack(channel: "#launch", match: "message", keyword: "", emoji: "", bySelf: false), commits: false, store: store)
    await editor.settled()
    XCTAssertEqual(editor.stored(store)?.trigger, ["type": "cron", "schedule": "0 9 * * *"], "typing saves nothing")
    editor.commit(editor.rows, store: store)
    await editor.settled()
    XCTAssertEqual(store.routinesByAgent[agent]?.first { $0.id == id }?.trigger?["type"]?.string, "group")
    XCTAssertEqual(store.routinesByAgent[agent]?.first { $0.id == id }?.trigger?["listeners"]?.array?.count, 2)

    // Removing one of two saves the other alone.
    editor.remove(0, store: store)
    await editor.settled()
    XCTAssertEqual(editor.stored(store)?.trigger, ["type": "slack", "channel": "#launch", "match": ["kind": "message"]])

    // The only row: the card empties, nothing is saved, the Add menu opens; closing it with no pick leaves it empty.
    editor.remove(0, store: store)
    XCTAssertTrue(editor.rows.isEmpty)
    XCTAssertEqual(editor.addMenuRequests, 1)
    editor.addMenuClosed(picked: false, store: store)
    await editor.settled()
    XCTAssertTrue(editor.rows.isEmpty)
    XCTAssertEqual(editor.stored(store)?.trigger?["type"]?.string, "slack", "the stored trigger stays")
    store.detach()
  }

  func testFieldsKeepTheStoredWordsAndFollowThem() async {
    let (store, agent) = await demo()
    let editor = RoutineEditing(agentId: agent, routine: nil)
    editor.name = "First"
    editor.prompt = "Do it"
    editor.addSchedule("0 * * * *", opens: false, store: store)
    await editor.settled()
    guard let stored = editor.stored(store) else { return XCTFail("made") }

    // An empty name goes back to the stored one; a new one is saved.
    editor.name = "  "
    editor.nameDone(store: store)
    XCTAssertEqual(editor.name, "First")
    editor.name = "Second"
    editor.nameDone(store: store)
    await editor.settled()
    XCTAssertEqual(editor.stored(store)?.name, "Second")

    // Another editor's change: a field still showing the stored words follows it.
    let other = RoutineEditing(agentId: agent, routine: editor.stored(store))
    var changed = stored
    changed.name = "Third"
    other.follow(changed)
    XCTAssertEqual(other.name, "Third")
    other.name = "Mine"
    changed.name = "Fourth"
    other.follow(changed)
    XCTAssertEqual(other.name, "Mine", "words typed are kept")
    store.detach()
  }

  func testActiveAndDeleteWhileMaking() async {
    let (store, agent) = await demo()
    let before = store.routinesByAgent[agent]?.count ?? 0
    let paused = RoutineEditing(agentId: agent, routine: nil)
    paused.toggleActive(false, store: store)
    XCTAssertFalse(paused.isActive(store))
    paused.name = "Paused"
    paused.prompt = "Wait"
    paused.addSchedule("0 7 * * *", opens: false, store: store)
    await paused.settled()
    XCTAssertEqual(paused.stored(store)?.isEnabled, false, "made, then paused as the switch said")

    let gone = RoutineEditing(agentId: agent, routine: nil)
    gone.name = "Gone"
    gone.prompt = "Never"
    gone.addSchedule("0 6 * * *", opens: false, store: store)
    XCTAssertTrue(gone.creating)
    gone.delete(store: store)
    await gone.settled()
    XCTAssertEqual(store.routinesByAgent[agent]?.count ?? 0, before + 1, "Delete during the create removes it when it comes back")
    XCTAssertNil(store.routinesByAgent[agent]?.first { $0.name == "Gone" })
    store.detach()
  }

  func testTestRunWaits() async {
    let (store, agent) = await demo()
    let runs = RoutineTestRuns()
    let editor = RoutineEditing(agentId: agent, routine: nil)
    XCTAssertFalse(editor.isRunning(store, runs: runs))
    editor.testRun(store: store, runs: runs)
    XCTAssertEqual(editor.historyRequests, 0, "a routine not made yet has no run")
    editor.name = "Run"
    editor.prompt = "Go"
    editor.addSchedule("0 8 * * 1", opens: true, store: store)
    XCTAssertEqual(editor.openRow, 0, "Every week's editor opens as it is added")
    await editor.settled()
    editor.testRun(store: store, runs: runs)
    XCTAssertTrue(editor.isRunning(store, runs: runs))
    await editor.settled()
    XCTAssertEqual(editor.historyRequests, 1)
    XCTAssertTrue(runs.isBlocked(agent, editor.routineId ?? ""), "held 3 seconds after the run ended")
    XCTAssertEqual(editor.stored(store)?.runs.first?.trigger, "manual")
    store.detach()
  }

  func testAddMenuWords() {
    XCTAssertEqual(TriggerRow.sourceLabel("schedule"), "On a schedule")
    XCTAssertEqual(TriggerRow.sourceLabel("microsoftTeams"), "Teams message")
    XCTAssertEqual(TriggerRow.cadences.map(\.label), ["Every hour", "Every day", "Weekdays", "Every week", "Every month", "Interval", "Advanced\u{2026}"])
    XCTAssertEqual(TriggerRow.cadences.compactMap(\.line), ["0 * * * *", "0 8 * * 1", "0 8 1 * *", "@every 30m", "0 8 * * *"])
    XCTAssertEqual(TriggerRow.timeLine(RoutineSchedule.Time(hour: 9, minute: 15), days: "1-5"), "15 9 * * 1-5")
    XCTAssertEqual(RoutineSchedule.quarterHours.count, 96)
  }

  func testAvatarEditorWords() {
    XCTAssertEqual(AvatarEditorWords.reset(hasPicture: true, onAgentTab: false, colour: nil), "Reset to the Agent")
    XCTAssertEqual(AvatarEditorWords.reset(hasPicture: false, onAgentTab: true, colour: "rose"), "Reset character to default")
    XCTAssertNil(AvatarEditorWords.reset(hasPicture: false, onAgentTab: true, colour: nil))
    XCTAssertNil(AvatarEditorWords.reset(hasPicture: false, onAgentTab: false, colour: "rose"))
    let plain = Agent(id: "a1", name: "A")
    XCTAssertEqual(AvatarEditorWords.chosenColour(plain, staged: nil), AgentPalette.defaultColour(forAgentId: "a1"))
    let coloured = Agent(id: "a1", name: "A", colour: AgentPalette.all[2].id)
    XCTAssertEqual(AvatarEditorWords.chosenColour(coloured, staged: "x"), AgentPalette.all[2].id)
    let pictured = Agent(id: "a1", name: "A", colour: AgentPalette.all[2].id, avatarDataURL: "data:image/png;base64,AA")
    XCTAssertNil(AvatarEditorWords.chosenColour(pictured, staged: nil), "with a picture none is ringed until one is picked")
    XCTAssertEqual(AvatarEditorWords.chosenColour(pictured, staged: AgentPalette.all[3].id), AgentPalette.all[3].id)
  }
}
