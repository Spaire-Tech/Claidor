import Foundation
import XCTest
@testable import SimeonCore

/**
 * The agents and chats kept on this device (SavedChats, 26 October 2026):
 * shown while the computer is away, replaced when it answers, never another
 * account's. Not a main-actor class, so Linux's XCTest finds it; the store's
 * own steps run on the main actor (`onMain`).
 */
final class SavedChatsTests: XCTestCase {
  private var folders: [URL] = []

  override func tearDown() {
    for folder in folders { try? FileManager.default.removeItem(at: folder) }
    folders = []
    super.tearDown()
  }

  private func folder() -> URL {
    let url = FileManager.default.temporaryDirectory.appendingPathComponent("saved-chats-\(UUID().uuidString)", isDirectory: true)
    folders.append(url)
    return url
  }

  static let bass = Account(name: "Bass", email: "bass@simeonlabs.com", id: "acct-1")
  static let other = Account(name: "Rhea", email: "rhea@simeonlabs.com", id: "acct-2")

  private func line(_ id: String, _ text: String, at: Double, role: String = "user", streaming: Bool = false) -> Entry {
    var json: JSON = ["kind": "message", "id": .string(id), "role": .string(role), "content": .string(text), "timestampMs": .number(at)]
    if streaming { json = json.setting("isStreaming", true) }
    return Entry(json)!
  }

  private static func texts(_ rows: [ChatRow]) -> [String] {
    rows.compactMap { row in
      if case .bubble(let bubble) = row { return bubble.text }
      return nil
    }
  }

  /** Runs on the main actor, from this class, which is not one. */
  private func onMain(_ work: @MainActor @escaping () async throws -> Void) async throws {
    try await Task { @MainActor in try await work() }.value
  }

  // MARK: The files

  func testAKeptAgentReadsBackAsTheSameRowLessWhatWasGoingOn() {
    let row: JSON = [
      "id": "theo", "name": "Theo", "title": "Travel", "description": "Books trips", "avatarColor": "#FF6A00",
      "avatarDataUrl": "data:image/png;base64,AAAA", "isGroup": false, "memberIds": [], "lastMessagePreview": "Done",
      "lastActivityAt": 5_000, "hasUnread": true, "unreadCount": 2, "isRunningTurn": true, "isRunning": true, "isComposingMessage": true,
      "currentActivity": ["label": "Searching", "kind": "tool", "tool": "web", "detail": "flights", "target": "iris"],
      "isHiddenFromSidebar": true, "notifyOnUpdatesEnabled": false, "voiceId": "v1", "avatarVersion": "3", "avatarShape": "clay-07",
      "sharedRoomId": "room-1", "awaitingUserResponse": ["reason": "Approve the fare"], "lastMessageId": "m9",
      "lastEntry": ["kind": "text", "text": "Done"], "createdAt": 1_000, "purpose": "disk-saver", "conversationPartnerIds": ["iris"],
      "updatedAt": 4_000, "snapshotEpoch": "e1", "snapshotSeq": 7,
    ]
    let theo = Agent(json: row)!
    var expected = theo
    expected.isRunningTurn = false
    expected.isRunning = false
    expected.isComposing = false
    expected.activityLabel = nil
    expected.activityKind = nil
    expected.activityTool = nil
    expected.activityDetail = nil
    expected.activityTarget = nil
    let back = Agent(json: theo.savedJSON)
    XCTAssertEqual(back, expected)
    XCTAssertEqual(back?.previewLine, "Waiting for you: Approve the fare")
    XCTAssertEqual(back?.unreadCount, 2)
    XCTAssertEqual(back?.isSharedRoom, true)

    let room = Agent(json: ["id": "g", "name": "Room", "isGroup": true, "memberIds": ["theo", "iris"], "remoteRoom": ["host": "x"]])!
    XCTAssertEqual(Agent(json: room.savedJSON), room)
    let bare = Agent(id: "iris", name: "Iris")
    XCTAssertEqual(Agent(json: bare.savedJSON), bare)
  }

  func testTheListAndAChatAreKeptAndReadBackAtTheNextLaunch() {
    let dir = folder()
    let saved = SavedChats(directory: dir)
    let owner = SavedChats.Owner(id: "acct-1", email: "Bass@SimeonLabs.com")
    saved.writeRoster([Agent(id: "theo", name: "Theo"), Agent(id: "iris", name: "Iris")], owner: owner)
    saved.writeChat("theo", [line("u1", "Hi Theo", at: 1_000), line("a1", "Half an ans", at: 2_000, role: "assistant", streaming: true)], hasOlder: false)
    saved.waitForWrites()

    let again = SavedChats(directory: dir)
    XCTAssertEqual(again.readRoster()?.agents.map(\.id), ["theo", "iris"])
    XCTAssertEqual(again.readRoster()?.owner, owner)
    XCTAssertEqual(again.readRoster()?.owner.email, "bass@simeonlabs.com")
    let lines = again.readChat("theo")
    XCTAssertEqual(lines?.entries.map(\.id), ["u1", "a1"])
    XCTAssertEqual(lines?.entries.last?.isStreaming, false, "a line cut off while it streamed is kept as finished")
    XCTAssertEqual(lines?.entries.last?.content, "Half an ans")
    XCTAssertEqual(lines?.hasOlder, false)
    XCTAssertNil(again.readChat("iris"))

    // An agent no longer in the list loses its chat; signing out takes everything.
    again.removeChats(keeping: ["iris"])
    again.waitForWrites()
    XCTAssertNil(SavedChats(directory: dir).readChat("theo"))
    XCTAssertNotNil(SavedChats(directory: dir).readRoster())
    again.forget()
    again.waitForWrites()
    XCTAssertNil(again.readRoster())
    XCTAssertNil(SavedChats(directory: dir).readRoster())
    XCTAssertFalse(FileManager.default.fileExists(atPath: dir.path))
  }

  func testALongChatKeepsItsNewestLinesAndALargeOneFewerOrNone() {
    let long = (0..<400).map { line("l\($0)", "Line \($0)", at: Double($0)) }
    let kept = SavedChats.keptLines(long, hasOlder: false)
    XCTAssertEqual(kept?.entries.count, SavedChats.linesKept)
    XCTAssertEqual(kept?.entries.first?.id, "l100")
    XCTAssertEqual(kept?.hasOlder, true, "lines were left out")
    XCTAssertEqual(SavedChats.keptLines(Array(long.prefix(150)), hasOlder: false)?.hasOlder, false)
    XCTAssertEqual(SavedChats.keptLines(Array(long.prefix(150)), hasOlder: true)?.hasOlder, true)
    XCTAssertNil(SavedChats.keptLines([], hasOlder: false))

    let big = String(repeating: "x", count: 10_000)
    let large = (0..<300).map { line("b\($0)", big, at: Double($0)) }
    XCTAssertEqual(SavedChats.keptLines(large, hasOlder: false)?.entries.count, 100)
    let huge = String(repeating: "x", count: 30_000)
    XCTAssertNil(SavedChats.keptLines((0..<300).map { line("h\($0)", huge, at: Double($0)) }, hasOlder: false))
  }

  func testAnAgentsIdNeverNamesAPath() {
    let name = SavedChats.fileName("../../etc/passwd")
    XCTAssertFalse(name.contains("/"))
    XCTAssertTrue(name.hasSuffix(".json"))
    XCTAssertEqual(name, SavedChats.fileName("../../etc/passwd"))
    XCTAssertNotEqual(name, SavedChats.fileName("theo"))
  }

  func testTheOwnerIsTheSamePersonByIdElseByEmail() {
    typealias Owner = SavedChats.Owner
    XCTAssertTrue(Owner(id: "a", email: "x@y.com").isSame(as: Owner(id: "a", email: "other@y.com")))
    XCTAssertFalse(Owner(id: "a", email: "x@y.com").isSame(as: Owner(id: "b", email: "x@y.com")))
    XCTAssertTrue(Owner(id: nil, email: "X@y.com").isSame(as: Owner(id: "b", email: "x@Y.com")))
    XCTAssertFalse(Owner(id: nil, email: "").isSame(as: Owner(id: nil, email: "")))
    XCTAssertNil(Owner(nil))
    XCTAssertNil(Owner(Account(name: "", email: "", id: nil)))
    XCTAssertEqual(Owner(Account(name: "B", email: "b@y.com", id: ""))?.id, nil)
  }

  // MARK: The store

  /** A first launch keeps what the computer sent; the next, with the computer asleep, shows it at once, and the computer's copy replaces it when it wakes. */
  func testTheListAndAChatShowFromThisDeviceWhileTheComputerIsAway() async throws {
    let dir = folder()
    try await onMain {
      let first = AppStore()
      first.saved = SavedChats(directory: dir)
      first.account = Self.bass
      let up = AwayBackend()
      up.lines.append(["kind": "message", "id": "a1", "role": "assistant", "content": "On it", "timestampMs": 3_000])
      await first.attach(up)
      await first.open("theo")
      first.saveNow()
      first.saved?.waitForWrites()
      first.detach()
      XCTAssertEqual(SavedChats(directory: dir).readChat("theo")?.entries.map(\.id), ["u1", "a1"])

      let store = AppStore()
      store.saved = SavedChats(directory: dir)
      store.account = Self.bass
      let backend = AwayBackend()
      backend.away = true
      // The Mac shows its window when told the list is up: with the computer already attached, so a chat opened then opens.
      var shown: (saved: Bool, agents: [String], attached: Bool)?
      await store.attach(backend) { shown = (store.showingSaved, store.agents.map(\.id), store.backend != nil) }
      XCTAssertEqual(shown?.saved, true)
      XCTAssertEqual(shown?.agents, ["theo"])
      XCTAssertEqual(shown?.attached, true)
      XCTAssertEqual(store.agents.map(\.id), ["theo"])
      XCTAssertTrue(store.showingSaved)
      await store.open("theo")
      XCTAssertEqual(Self.texts(store.rows(for: "theo")), ["Hi Theo", "On it"])
      XCTAssertFalse(store.loadFailed.contains("theo"), "no \"Couldn't load this conversation\" over the kept lines")
      // Nothing the computer did not send is kept: the copy is as the first launch left it.
      store.saveNow()
      store.saved?.waitForWrites()
      XCTAssertEqual(SavedChats(directory: dir).readRoster()?.agents.map(\.id), ["theo"])
      XCTAssertEqual(SavedChats(directory: dir).readChat("theo")?.entries.map(\.id), ["u1", "a1"])

      // The computer wakes: its list, and its chat in place of the kept lines.
      backend.away = false
      backend.agents = [Agent(id: "theo", name: "Theo"), Agent(id: "iris", name: "Iris")]
      // "On it" was taken back on the computer meanwhile: newer than all the computer has, it goes all the same.
      backend.lines = [["kind": "message", "id": "u1", "role": "user", "content": "Hi Theo", "timestampMs": 1_000],
                       ["kind": "message", "id": "u2", "role": "user", "content": "Book it", "timestampMs": 2_000]]
      await store.reloadRoster()
      XCTAssertFalse(store.showingSaved)
      XCTAssertEqual(Set(store.agents.map(\.id)), ["theo", "iris"])
      await store.refresh("theo")
      XCTAssertEqual(Self.texts(store.rows(for: "theo")), ["Hi Theo", "Book it"], "a kept line the computer no longer has goes")
      store.saveNow()
      store.saved?.waitForWrites()
      XCTAssertEqual(SavedChats(directory: dir).readChat("theo")?.entries.map(\.id), ["u1", "u2"])
      XCTAssertEqual(Set(SavedChats(directory: dir).readRoster()?.agents.map(\.id) ?? []), ["theo", "iris"])
    }
  }

  // MARK: Pins and folders

  private static let travel: JSON = ["id": "s1", "name": "Travel", "agentIds": ["iris"]]
  private static let work: JSON = ["id": "s2", "name": "Work", "agentIds": ["theo"]]

  /** A first launch keeps the computer's pins and folders with the list (stays answering), for the next launch to show at once. */
  @MainActor
  private func keptOnce(_ dir: URL, pins: [String], sections: JSON) async {
    let first = AppStore()
    first.saved = SavedChats(directory: dir)
    first.account = Self.bass
    let up = AwayBackend()
    up.agents = [Agent(id: "theo", name: "Theo"), Agent(id: "iris", name: "Iris")]
    up.hostSettings = ["pinnedAgentIds": JSON(pins), "sidebarSections": sections]
    await first.attach(up)
    first.saveNow()
    first.saved?.waitForWrites()
    first.detach()
  }

  /** Waits for what the store started on its own (a change written after it reads the computer's copy). */
  @MainActor
  private func settle(_ until: @MainActor () -> Bool) async {
    for _ in 0..<200 where !until() { try? await Task.sleep(nanoseconds: 5_000_000) }
  }

  /**
   * The founder, 27 October 2026: at launch every chat showed in one list,
   * then went to its folder seconds later (longer with the computer asleep).
   * The pins and folders now come with the list kept on this device; the
   * computer's replace them when it answers.
   */
  func testPinsAndFoldersShowWithTheKeptListAtLaunch() async throws {
    let dir = folder()
    try await onMain {
      await self.keptOnce(dir, pins: ["theo"], sections: [Self.travel])
      XCTAssertEqual(SavedChats(directory: dir).readLayout()?.pinnedIds, ["theo"])

      let store = AppStore()
      store.saved = SavedChats(directory: dir)
      store.account = Self.bass
      let asleep = AwayBackend()
      asleep.away = true
      var shown: (pins: [String], folders: [String])?
      await store.attach(asleep) { shown = (store.pinnedIds, (store.sidebarSections ?? []).map(\.id)) }
      XCTAssertEqual(shown?.pins, ["theo"], "the pins are there as the list first shows")
      XCTAssertEqual(shown?.folders, ["s1", SidebarSections.unassignedId])
      XCTAssertEqual(store.sidebarSections?.first?.agentIds, ["iris"])
      XCTAssertTrue(store.pinsKept)
      XCTAssertTrue(store.sectionsKept)

      // The computer wakes with changes made elsewhere: its own replace the device's, and are kept in turn.
      asleep.away = false
      asleep.hostSettings = ["pinnedAgentIds": ["iris"], "sidebarSections": [Self.work]]
      await store.loadPins()
      await store.loadSections()
      XCTAssertEqual(store.pinnedIds, ["iris"])
      XCTAssertEqual(store.sidebarSections?.first?.id, "s2")
      XCTAssertFalse(store.pinsKept)
      XCTAssertFalse(store.sectionsKept)
      await store.reloadRoster()
      store.saveNow()
      store.saved?.waitForWrites()
      XCTAssertEqual(SavedChats(directory: dir).readLayout()?.pinnedIds, ["iris"])
      XCTAssertEqual(SavedChats(directory: dir).readLayout()?.sections?.first?.id, "s2")

      // Another account never sees them.
      let other = AppStore()
      other.saved = SavedChats(directory: dir)
      other.account = Self.other
      let away = AwayBackend()
      away.away = true
      await other.attach(away)
      XCTAssertTrue(other.pinnedIds.isEmpty)
      XCTAssertNil(other.sidebarSections)
    }
  }

  static let gmail: JSON = ["id": "gmail", "name": "gmail", "displayName": "Gmail", "description": "Mail", "category": "Communication"]
  static let slack: JSON = ["id": "slack", "name": "slack", "displayName": "Slack", "description": "Chat", "category": "Communication"]

  /**
   * The connectors' catalog kept on this device (28 October 2026, the
   * founder: "i hate the loading connectors"): there as the list first
   * shows, kept while the computer rests, replaced by the computer's once it
   * answers, and kept again. Another language's is not shown.
   */
  func testTheConnectorsCatalogIsThereAtLaunch() async throws {
    let dir = folder()
    try await onMain {
      let first = AppStore()
      first.saved = SavedChats(directory: dir)
      first.account = Self.bass
      let up = AwayBackend()
      up.catalog = [Self.gmail]
      await first.attach(up)
      let read = await first.readCatalog()
      XCTAssertEqual(read?.map(\.id), ["gmail"])
      XCTAssertEqual(first.catalog.map(\.title), ["Gmail"])
      first.saved?.waitForWrites()
      XCTAssertNotNil(SavedChats(directory: dir).readCatalog(language: AppLanguage.current))
      XCTAssertNil(SavedChats(directory: dir).readCatalog(language: "xx"))

      let store = AppStore()
      store.saved = SavedChats(directory: dir)
      store.account = Self.bass
      let asleep = AwayBackend()
      asleep.away = true
      var shown: [String] = []
      await store.attach(asleep) { shown = store.catalogEntries.map(\.id) }
      XCTAssertEqual(shown, ["gmail"], "the catalog is there as the list first shows")
      XCTAssertEqual(store.catalog.map(\.title), ["Gmail"])
      // Resting: not woken for it, and what was shown stays.
      let resting = await store.readCatalog(wakes: false)
      XCTAssertNil(resting)
      XCTAssertEqual(store.catalogEntries.map(\.id), ["gmail"])
      // Awake with a new app: the computer's replaces it, and is kept.
      asleep.away = false
      asleep.catalog = [Self.gmail, Self.slack]
      let fresh = await store.readCatalog()
      XCTAssertEqual(fresh?.map(\.id), ["gmail", "slack"])
      XCTAssertEqual(store.catalog.map(\.title), ["Gmail", "Slack"])
      store.saved?.waitForWrites()
      let kept = SavedChats(directory: dir).readCatalog(language: AppLanguage.current)
      XCTAssertEqual(kept?.array?.count, 2)
      // Read once a sign-in: the apps read again do not ask for it again.
      let reads = asleep.catalogReads
      await store.loadApps()
      XCTAssertEqual(asleep.catalogReads, reads)

      // Signed out: it goes with the rest.
      store.saved?.forget()
      store.saved?.waitForWrites()
      XCTAssertNil(SavedChats(directory: dir).readCatalog(language: AppLanguage.current))
    }
  }

  /** A change made while the folders and pins are the device's copy is made on the computer's own, so another device's changes stay. */
  func testAChangeToTheKeptCopyIsMadeOnTheComputersOwn() async throws {
    let dir = folder()
    try await onMain {
      await self.keptOnce(dir, pins: ["theo"], sections: [Self.travel])
      let store = AppStore()
      store.saved = SavedChats(directory: dir)
      store.account = Self.bass
      let backend = AwayBackend()
      backend.away = true
      backend.agents = [Agent(id: "theo", name: "Theo"), Agent(id: "iris", name: "Iris")]
      await store.attach(backend)
      XCTAssertTrue(store.sectionsKept)

      // Meanwhile, on another device: a folder "Work" and Iris pinned too.
      backend.away = false
      backend.hostSettings = ["pinnedAgentIds": ["theo", "iris"], "sidebarSections": [Self.travel, Self.work]]

      // Theo moved into Travel here: Work stays.
      XCTAssertTrue(store.editSections { SidebarSections.assign($0, agentIds: ["theo"], to: "s1") })
      await self.settle { !backend.settingsWrites.isEmpty }
      let written = SidebarSections.parse(backend.settingsWrites.last?["sidebarSections"])
      XCTAssertEqual(written.map(\.id), ["s1", "s2", SidebarSections.unassignedId])
      XCTAssertEqual(written.first?.agentIds, ["iris", "theo"])
      XCTAssertFalse(store.sectionsKept)

      // Theo unpinned here: Iris, pinned elsewhere, stays.
      await store.setPinned("theo", false)
      XCTAssertEqual(backend.settingsWrites.last?["pinnedAgentIds"], ["iris"])
      XCTAssertEqual(store.pinnedIds, ["iris"])
    }
  }

  /** A list kept for one account is never shown to another, and goes; one shown before the account was known goes when it is. */
  func testAnotherAccountsKeptListIsNeverShown() async throws {
    let dir = folder()
    try await onMain {
      let first = AppStore()
      first.saved = SavedChats(directory: dir)
      first.account = Self.bass
      await first.attach(AwayBackend())
      first.saveNow()
      first.saved?.waitForWrites()
      first.detach()

      let asleep = AwayBackend()
      asleep.away = true
      let other = AppStore()
      other.saved = SavedChats(directory: dir)
      other.account = Self.other
      await other.attach(asleep)
      XCTAssertTrue(other.agents.isEmpty)
      other.saved?.waitForWrites()
      XCTAssertNil(SavedChats(directory: dir).readRoster())

      // The Mac reads the account after the agents: the list shows, then goes when the account is someone else's.
      let again = AppStore()
      again.saved = SavedChats(directory: dir)
      again.account = Self.bass
      await again.attach(AwayBackend())
      again.saveNow()
      again.saved?.waitForWrites()
      again.detach()
      let mac = AppStore()
      mac.saved = SavedChats(directory: dir)
      await mac.attach(asleep)
      XCTAssertEqual(mac.agents.map(\.id), ["theo"])
      mac.account = Self.other
      XCTAssertTrue(mac.agents.isEmpty)
      XCTAssertFalse(mac.showingSaved)
    }
  }

  func testSigningOutForgetsWhatWasKept() async throws {
    let dir = folder()
    try await onMain {
      let store = AppStore()
      store.saved = SavedChats(directory: dir)
      store.account = Self.bass
      await store.attach(AwayBackend())
      await store.open("theo")
      store.saveNow()
      store.detach()
      store.forgetSaved()
      store.saved?.waitForWrites()
      XCTAssertNil(SavedChats(directory: dir).readRoster())
      XCTAssertNil(SavedChats(directory: dir).readChat("theo"))
    }
  }

  /** A long press shows the kept lines, and asks the computer only when they lack the chat's newest line; the copy kept stays whole. */
  func testAPreviewShowsTheKeptLinesAndAsksOnlyForWhatIsNew() async throws {
    let dir = folder()
    try await onMain {
      let first = AppStore()
      first.saved = SavedChats(directory: dir)
      first.account = Self.bass
      let up = AwayBackend()
      up.lines.append(["kind": "message", "id": "a1", "role": "assistant", "content": "On it", "timestampMs": 3_000])
      await first.attach(up)
      await first.open("theo")
      first.saveNow()
      first.saved?.waitForWrites()
      first.detach()

      // The list says the newest line is one the phone has: nothing is asked.
      let backend = AwayBackend()
      var theo = Agent(id: "theo", name: "Theo")
      theo.lastMessageId = "a1"
      backend.agents = [theo]
      let store = AppStore()
      store.saved = SavedChats(directory: dir)
      store.account = Self.bass
      await store.attach(backend)
      await store.peek("theo")
      XCTAssertEqual(backend.tailed, [])
      XCTAssertEqual(Self.texts(store.rows(for: "theo")), ["Hi Theo", "On it"])
      store.detach()

      // A newer line came: the newest lines are read and shown under the kept ones, which stay as they were on the phone.
      theo.lastMessageId = "n1"
      backend.agents = [theo]
      backend.lines = [["kind": "message", "id": "n1", "role": "assistant", "content": "Booked", "timestampMs": 5_000]]
      let again = AppStore()
      again.saved = SavedChats(directory: dir)
      again.account = Self.bass
      await again.attach(backend)
      await again.peek("theo")
      XCTAssertEqual(backend.tailed, ["theo"])
      XCTAssertEqual(Self.texts(again.rows(for: "theo")), ["Hi Theo", "On it", "Booked"])
      again.saveNow()
      again.saved?.waitForWrites()
      XCTAssertEqual(SavedChats(directory: dir).readChat("theo")?.entries.map(\.id), ["u1", "a1"])
    }
  }

  // MARK: The server's copy

  private static let serverAgents: JSON = ["agents": [
    ["id": "theo", "name": "Theo", "lastActivityAt": 3_000, "lastMessageId": "a1"],
    ["id": "iris", "name": "Iris", "lastActivityAt": 1_000],
  ]]
  private static let theoLinesPath = "chats/lines?agentId=theo&limit=\(SavedChats.linesKept)"
  private static let serverLines: JSON = ["entries": [
    ["kind": "message", "id": "u1", "role": "user", "content": "Hi Theo", "timestampMs": 1_000],
    ["kind": "message", "id": "a1", "role": "assistant", "content": "On it", "timestampMs": 2_000],
  ], "hasOlder": false]

  /** Waits for a condition the store meets a moment later (the server's copy is asked beside the computer). */
  @MainActor
  private func eventually(_ what: String, _ condition: @MainActor () -> Bool) async throws {
    for _ in 0..<200 where !condition() { try await Task.sleep(nanoseconds: 5_000_000) }
    XCTAssertTrue(condition(), what)
  }

  /** A device that kept nothing, the computer asleep: the server's list and lines show, and the computer's replace them when it wakes. */
  func testTheServersCopyShowsWhileTheComputerIsAway() async throws {
    try await onMain {
      let backend = AwayBackend()
      backend.away = true
      backend.serverAnswers = ["chats/agents": Self.serverAgents, Self.theoLinesPath: Self.serverLines]
      let store = AppStore()
      store.saved = SavedChats(directory: self.folder())
      store.readsServerCopy = true
      store.account = Self.bass
      await store.attach(backend)
      try await self.eventually("the server's list shows") { store.agents.map(\.id) == ["theo", "iris"] }
      XCTAssertTrue(store.showingSaved)
      await store.open("theo")
      try await self.eventually("the server's lines show") { Self.texts(store.rows(for: "theo")) == ["Hi Theo", "On it"] }
      XCTAssertFalse(store.loadFailed.contains("theo"), "no \"Couldn't load this conversation\" over the server's lines")
      XCTAssertTrue(backend.serverPaths.contains(Self.theoLinesPath))

      // The computer wakes: its list and its chat replace the server's.
      backend.away = false
      backend.agents = [Agent(id: "theo", name: "Theo")]
      backend.lines = [["kind": "message", "id": "u2", "role": "user", "content": "Book it", "timestampMs": 4_000]]
      await store.reloadRoster()
      XCTAssertFalse(store.showingSaved)
      XCTAssertEqual(store.agents.map(\.id), ["theo"])
      await store.refresh("theo")
      XCTAssertEqual(Self.texts(store.rows(for: "theo")), ["Book it"])
      // Nothing of the server's copy is kept on the device as the computer's.
      store.saveNow()
      store.saved?.waitForWrites()
    }
  }

  /** The computer answering first: its list stays, the server's coming after is not shown over it. */
  func testTheComputersListWinsWhenItAnswersFirst() async throws {
    try await onMain {
      let backend = AwayBackend()
      backend.serverDelayNs = 50_000_000
      backend.serverAnswers = ["chats/agents": Self.serverAgents]
      let store = AppStore()
      store.readsServerCopy = true
      await store.attach(backend)
      XCTAssertEqual(store.agents.map(\.id), ["theo"])
      // Watched all along: the server's older list never shows over the computer's, not even for a moment.
      var flashed = false
      for _ in 0..<150 {
        if store.agents.contains(where: { $0.id == "iris" }) || store.showingSaved { flashed = true }
        try await Task.sleep(nanoseconds: 1_000_000)
      }
      XCTAssertTrue(backend.serverPaths.contains("chats/agents"))
      XCTAssertFalse(flashed, "the computer's list, not the server's")
      XCTAssertEqual(store.agents.map(\.id), ["theo"])
    }
  }

  /** The demo and the tests (and an app that does not ask) read nothing of the server's copy. */
  func testNoServerCopyIsReadUnlessTheAppAsks() async throws {
    try await onMain {
      let backend = AwayBackend()
      backend.away = true
      backend.serverAnswers = ["chats/agents": Self.serverAgents, Self.theoLinesPath: Self.serverLines]
      let store = AppStore()
      await store.attach(backend)
      await store.open("theo")
      await store.peek("iris")
      try await Task.sleep(nanoseconds: 50_000_000)
      XCTAssertEqual(backend.serverPaths.filter { $0.hasPrefix("chats/") }, [])
      XCTAssertTrue(store.agents.isEmpty)
    }
  }

  /** The Mac reads the account after the agents: a device copy of another account goes, the server's list (this account's own) stays. */
  func testTheServersListStaysWhenAnotherAccountsDeviceCopyGoes() async throws {
    let dir = folder()
    try await onMain {
      let first = AppStore()
      first.saved = SavedChats(directory: dir)
      first.account = Self.other
      let elsewhere = AwayBackend()
      elsewhere.agents = [Agent(id: "rhea-agent", name: "Rhea's")]
      await first.attach(elsewhere)
      first.saveNow()
      first.saved?.waitForWrites()
      first.detach()

      let backend = AwayBackend()
      backend.away = true
      backend.serverAnswers = ["chats/agents": Self.serverAgents]
      let mac = AppStore()
      mac.saved = SavedChats(directory: dir)
      mac.readsServerCopy = true
      await mac.attach(backend)
      try await self.eventually("the server's list replaces the device's") { mac.agents.map(\.id) == ["theo", "iris"] }
      mac.account = Self.bass
      XCTAssertEqual(mac.agents.map(\.id), ["theo", "iris"])
      mac.saved?.waitForWrites()
      XCTAssertNil(SavedChats(directory: dir).readRoster(), "the other account's device copy went")
    }
  }

  /** "Reconnecting" waits on a held message: the computer away alone is not news. */
  func testReconnectingShowsOnlyWhileAMessageWaits() async throws {
    try await onMain {
      let backend = AwayBackend()
      let store = AppStore()
      await store.attach(backend)
      await store.open("theo")
      store.apply(.connection(live: false))
      XCTAssertTrue(store.isDown)
      XCTAssertFalse(store.waitingToSend)
      await store.send("Later", to: "theo")
      XCTAssertTrue(store.waitingToSend)
      XCTAssertEqual(backend.sent, [])
      store.apply(.connection(live: true))
      for _ in 0..<50 where store.waitingToSend { try await Task.sleep(nanoseconds: 10_000_000) }
      XCTAssertFalse(store.waitingToSend)
      XCTAssertEqual(backend.sent, ["Later"])
    }
  }
  /** The messages held while the computer is out of reach and handed to the server, as the server read them. */
  @MainActor
  private func handed(_ backend: AwayBackend) -> [JSON] {
    backend.serverBodies.filter { $0.path == "chats/send" }.map(\.body)
  }

  /**
   * A message held while the computer is out of reach goes to the server
   * (26 October 2026): as it would go to the computer, its nonce the
   * message's id; "Reconnecting" does not show for it; and it goes to the
   * computer again, the same nonce, when it is back.
   */
  func testAHeldMessageGoesToTheServerAndToTheComputerOnceItIsBack() async throws {
    try await onMain {
      let backend = AwayBackend()
      let store = AppStore()
      store.readsServerCopy = true
      await store.attach(backend)
      await store.open("theo")
      backend.away = true
      store.apply(.connection(live: false))
      await store.send("Book the table", to: "theo", replyTo: "u1", id: "ios-m1")
      await store.send("Then call Iris", to: "theo", id: "ios-m2")
      let handed = self.handed(backend)
      XCTAssertEqual(handed.map { $0["clientNonce"]?.string }, ["ios-m1", "ios-m2"], "in the order written")
      let first = try XCTUnwrap(handed.first)
      XCTAssertEqual(first["agentId"]?.string, "theo")
      XCTAssertEqual(first["prompt"]?.string, "Book the table")
      XCTAssertEqual(first["replyToId"]?.string, "u1")
      XCTAssertEqual(first["attachmentPaths"]?.array?.count, 0)
      XCTAssertNotNil(first["composedAtMs"]?.double, "the computer is told when it was written")
      XCTAssertEqual(first, LiveBackend.sendArguments("theo", text: "Book the table", attachments: [], options: SendOptions(replyTo: "u1", composedAtMs: first["composedAtMs"]?.double), nonce: "ios-m1"), "exactly what the computer would have been sent")
      XCTAssertFalse(store.waitingToSend, "no \"Reconnecting\" for a message the server has")
      XCTAssertFalse(store.rows(for: "theo").contains { if case .queuedSend = $0 { return true }; return false }, "no \"Waiting to send…\" under it")
      XCTAssertEqual(Self.texts(store.rows(for: "theo")).suffix(2), ["Book the table", "Then call Iris"], "shown as sent")
      XCTAssertEqual(backend.sent, [])

      // The computer is back: both go to it too, in order, the same nonces (it takes each once).
      backend.away = false
      store.apply(.connection(live: true))
      for _ in 0..<100 where backend.sent.count < 2 { try await Task.sleep(nanoseconds: 10_000_000) }
      XCTAssertEqual(backend.sent, ["Book the table", "Then call Iris"])
      XCTAssertEqual(backend.sentAs.map(\.nonce), ["ios-m1", "ios-m2"])
      XCTAssertEqual(backend.sentAs.first?.options.replyTo, "u1")
    }
  }

  /**
   * A message to a computer that is only asleep (28 October 2026): it goes to
   * the server, which wakes the computer, but the agent is not told it was
   * written offline, and the computer is reached at once rather than at the
   * next look 15 s later (the founder: "it will answer but with a lag").
   */
  func testAMessageToASleepingComputerIsNotOfflineAndTheComputerIsReachedAtOnce() async throws {
    try await onMain {
      let backend = AwayBackend()
      let store = AppStore()
      store.readsServerCopy = true
      await store.attach(backend)
      await store.open("theo")
      backend.away = true
      store.apply(.connection(live: false))
      store.apply(.computerAsleep(true))
      await store.send("Book the table", to: "theo", id: "ios-m1")
      let handed = try XCTUnwrap(self.handed(backend).first)
      XCTAssertEqual(handed["clientNonce"]?.string, "ios-m1")
      XCTAssertNil(handed["composedAtMs"], "asleep is not offline: no \"[Composed offline at …]\" for the agent")
      try await self.eventually("the computer reached for at once") { backend.wakings == 1 }
    }
  }

  /** One with files waits on the device (they go to the computer itself), and those after it with it; one the server refuses waits too. */
  func testAMessageWithFilesOrRefusedWaitsOnTheDeviceAndThoseAfterIt() async throws {
    try await onMain {
      let backend = AwayBackend()
      let store = AppStore()
      store.readsServerCopy = true
      await store.attach(backend)
      await store.open("theo")
      backend.away = true
      store.apply(.connection(live: false))
      await store.send("The plan", to: "theo", attachments: [(name: "plan.pdf", data: Data("pdf".utf8))], id: "ios-f1")
      await store.send("Read it", to: "theo", id: "ios-f2")
      XCTAssertEqual(self.handed(backend).count, 0, "behind a message with files, nothing goes")
      XCTAssertTrue(store.waitingToSend)

      let refused = AwayBackend()
      refused.serverRefuses = ["chats/send"]
      let other = AppStore()
      other.readsServerCopy = true
      await other.attach(refused)
      await other.open("theo")
      other.apply(.connection(live: false))
      await other.send("Too long", to: "theo", id: "ios-r1")
      XCTAssertEqual(self.handed(refused).count, 1, "asked")
      XCTAssertTrue(other.waitingToSend, "refused, it waits here as before")
      XCTAssertTrue(other.rows(for: "theo").contains { if case .queuedSend = $0 { return true }; return false })
    }
  }

  /** Held while the computer was in reach (behind one on its way), it goes to the server once the computer is out of reach and the one before has failed. */
  func testAMessageHeldBehindOneThatFailsGoesToTheServer() async throws {
    try await onMain {
      let backend = AwayBackend()
      let store = AppStore()
      store.readsServerCopy = true
      await store.attach(backend)
      await store.open("theo")
      backend.sendDelayNs = 200_000_000
      let first = Task { await store.send("First", to: "theo", id: "ios-a") }
      for _ in 0..<100 where !Self.texts(store.rows(for: "theo")).contains("First") { try await Task.sleep(nanoseconds: 2_000_000) }
      await store.send("Second", to: "theo", id: "ios-b")
      backend.away = true
      store.apply(.connection(live: false))
      XCTAssertEqual(self.handed(backend).count, 0, "not while the one before is on its way")
      await first.value
      for _ in 0..<100 where self.handed(backend).isEmpty { try await Task.sleep(nanoseconds: 10_000_000) }
      XCTAssertEqual(self.handed(backend).map { $0["clientNonce"]?.string }, ["ios-b"])
      XCTAssertFalse(store.waitingToSend)
      XCTAssertTrue(store.rows(for: "theo").contains { if case .failedSend = $0 { return true }; return false }, "the first says it failed, with Resend")
    }
  }

  /** An app that reads no server copy (the demo, the tests) hands nothing to it. */
  func testNothingGoesToTheServerUnlessTheAppReadsItsCopy() async throws {
    try await onMain {
      let backend = AwayBackend()
      let store = AppStore()
      await store.attach(backend)
      await store.open("theo")
      backend.away = true
      store.apply(.connection(live: false))
      await store.send("Held", to: "theo", id: "ios-h1")
      XCTAssertEqual(self.handed(backend).count, 0)
      XCTAssertTrue(store.waitingToSend)
    }
  }
}

/** A computer that can be away: its list, its chats and its commands refused while `away`, as the gateway refuses them while it sleeps. */
final class AwayBackend: AgentBackend, @unchecked Sendable {
  var away = false
  var agents = [Agent(id: "theo", name: "Theo")]
  var lines: [JSON] = [["kind": "message", "id": "u1", "role": "user", "content": "Hi Theo", "timestampMs": 1_000]]
  var sent: [String] = []
  /** Each message's nonce and what went with it, as the computer took it. */
  var sentAs: [(nonce: String?, options: SendOptions)] = []
  private var continuation: AsyncStream<BackendEvent>.Continuation?
  func push(_ event: BackendEvent) { continuation?.yield(event) }
  private func reach() throws { if away { throw GatewayError(message: "asleep", refused: false) } }
  func listAgents() async throws -> [Agent] { try reach(); return agents }
  func transcript(_ agentId: String) async throws -> [Entry] { try reach(); return lines.compactMap(Entry.init) }
  var tailed: [String] = []
  func tail(_ agentId: String, limit: Int) async throws -> [Entry] { try reach(); tailed.append(agentId); return Array(lines.compactMap(Entry.init).suffix(limit)) }
  /** How long a message takes to reach the computer (one on its way). */
  var sendDelayNs: UInt64 = 0
  func send(_ agentId: String, text: String, attachments: [AttachmentRef], options: SendOptions, nonce: String?) async throws {
    if sendDelayNs > 0 { try? await Task.sleep(nanoseconds: sendDelayNs) }
    try reach(); sent.append(text); sentAs.append((nonce, options))
  }
  func markRead(_ agentId: String) async {}
  func createAgent(name: String, face: String?) async throws -> String { "x" }
  func createGroup(name: String, memberIds: [String]) async throws -> String { "g" }
  func answer(_ agentId: String, entryId: String, value: String) async throws {}
  func updateAgent(_ agentId: String, name: String, title: String, description: String) async throws {}
  func routines(_ agentId: String) async throws -> [JSON] { [] }
  func events() -> AsyncStream<BackendEvent> { AsyncStream { self.continuation = $0 } }
  var call: CallEngine? { nil }
  /** The computer's settings (`getHostSettings`): the pins and the sections; each write merged in, and kept in order. */
  var hostSettings: JSON = [:]
  var settingsWrites: [JSON] = []
  /** The connectors' catalog (`desktopMcp` `getCatalog`), and how often it was read. */
  var catalog: [JSON] = []
  var catalogReads = 0
  func command(_ method: String, _ args: JSON) async throws -> JSON {
    try reach()
    switch method {
    case "getHostSettings": return hostSettings
    case "desktopMcp" where args["action"]?.string == "getCatalog":
      catalogReads += 1
      return .array(catalog)
    case "desktopMcp" where args["action"]?.string == "listServers": return ["servers": []]
    case "setHostSettings":
      settingsWrites.append(args)
      for (key, value) in args.object ?? [:] { hostSettings = hostSettings.setting(key, value) }
      return [:]
    default: return [:]
    }
  }
  /** Simeon Labs' server's answers by path (the copy of the agents and chats); any other path answers nothing, as before. */
  var serverAnswers: [String: JSON] = [:]
  var serverDelayNs: UInt64 = 0
  /** Paths the server refuses (a message it can't keep). */
  var serverRefuses: Set<String> = []
  private let asked = LockedPaths()
  var serverPaths: [String] { asked.paths }
  /** What was sent to the server, by path, in order. */
  var serverBodies: [(path: String, body: JSON)] = []
  func server(_ path: String, method: String?, body: JSON?) async throws -> JSON {
    asked.add(path)
    if let body { serverBodies.append((path, body)) }
    if serverDelayNs > 0 { try? await Task.sleep(nanoseconds: serverDelayNs) }
    if serverRefuses.contains(path) { throw SimeonAPIError(message: "This message can't wait on the server.", status: 422) }
    return serverAnswers[path] ?? [:]
  }
  func screen(_ agentId: String) async throws -> ScreenState { ScreenState(socket: nil, state: "starting") }
  /** How often the app was told the server is waking the computer. */
  var wakings = 0
  func computerWaking() async { wakings += 1 }
}

/** The paths asked of the server, from whatever thread asks. */
final class LockedPaths: @unchecked Sendable {
  private let lock = NSLock()
  private var list: [String] = []
  func add(_ path: String) { lock.lock(); list.append(path); lock.unlock() }
  var paths: [String] { lock.lock(); defer { lock.unlock() }; return list }
}
