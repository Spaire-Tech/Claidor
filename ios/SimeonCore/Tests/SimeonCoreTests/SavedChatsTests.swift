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
}

/** A computer that can be away: its list, its chats and its commands refused while `away`, as the gateway refuses them while it sleeps. */
final class AwayBackend: AgentBackend, @unchecked Sendable {
  var away = false
  var agents = [Agent(id: "theo", name: "Theo")]
  var lines: [JSON] = [["kind": "message", "id": "u1", "role": "user", "content": "Hi Theo", "timestampMs": 1_000]]
  var sent: [String] = []
  private var continuation: AsyncStream<BackendEvent>.Continuation?
  func push(_ event: BackendEvent) { continuation?.yield(event) }
  private func reach() throws { if away { throw GatewayError(message: "asleep", refused: false) } }
  func listAgents() async throws -> [Agent] { try reach(); return agents }
  func transcript(_ agentId: String) async throws -> [Entry] { try reach(); return lines.compactMap(Entry.init) }
  var tailed: [String] = []
  func tail(_ agentId: String, limit: Int) async throws -> [Entry] { try reach(); tailed.append(agentId); return Array(lines.compactMap(Entry.init).suffix(limit)) }
  func send(_ agentId: String, text: String, attachments: [AttachmentRef], options: SendOptions, nonce: String?) async throws { try reach(); sent.append(text) }
  func markRead(_ agentId: String) async {}
  func createAgent(name: String, face: String?) async throws -> String { "x" }
  func createGroup(name: String, memberIds: [String]) async throws -> String { "g" }
  func answer(_ agentId: String, entryId: String, value: String) async throws {}
  func updateAgent(_ agentId: String, name: String, title: String, description: String) async throws {}
  func routines(_ agentId: String) async throws -> [JSON] { [] }
  func events() -> AsyncStream<BackendEvent> { AsyncStream { self.continuation = $0 } }
  var call: CallEngine? { nil }
  func command(_ method: String, _ args: JSON) async throws -> JSON { try reach(); return [:] }
  func server(_ path: String, method: String?, body: JSON?) async throws -> JSON { [:] }
  func screen(_ agentId: String) async throws -> ScreenState { ScreenState(socket: nil, state: "starting") }
}
