import XCTest
@testable import SimeonCore

/** Reactions (29 October 2026, the founder: "whenever i do it it freezes for a while then come"). */
final class ReactionsTests: XCTestCase {
  private func message(_ reactions: [JSON]) -> Entry {
    Entry(["id": "m1", "kind": "message", "role": "assistant", "content": "Done.", "reactions": .array(reactions)])!
  }

  func testThePersonsOwnAreTheOnesTheComputerMarksMe() {
    // The computer marks the person's own "me" (`SAND_REACTION_SELF`); "user" is the demo's.
    let entry = message([["emoji": "👍", "by": "me"], ["emoji": "❤️", "by": "agent-2"], ["emoji": "🎉", "by": "user"]])
    XCTAssertEqual(entry.myReactions, ["👍", "🎉"])
    guard case .bubble(let bubble)? = Chat.row(for: entry) else { return XCTFail("a bubble") }
    XCTAssertEqual(bubble.myReactions, ["👍", "🎉"])
    XCTAssertEqual(bubble.reactions, ["👍", "❤️", "🎉"])
  }

  func testATogglePutsOnOrTakesOffOnlyThePersonsOwn() {
    let entry = message([["emoji": "👍", "by": "agent-2"]])
    let on = entry.togglingMyReaction("👍")
    XCTAssertEqual(on.reactions.map(\.by), ["agent-2", "me"])
    let off = on.togglingMyReaction("👍")
    XCTAssertEqual(off.reactions.map(\.by), ["agent-2"], "the agent's stays")
    let none = message([]).togglingMyReaction("😂").togglingMyReaction("😂")
    XCTAssertNil(none["reactions"], "none left: no list, as the computer leaves it")
  }

  @MainActor
  func testAReactionShowsAtOnceAndARefusalTakesItBack() async {
    let box = ReactingBox()
    let store = AppStore()
    box.store = store
    await store.attach(box)
    store.transcripts["a1"] = [message([])]

    await store.react("👍", to: "m1", in: "a1")
    XCTAssertEqual(box.shownWhenSent, [["👍"]], "on the message before the computer was asked")
    XCTAssertEqual(store.transcripts["a1"]?.first?.myReactions, ["👍"])
    XCTAssertEqual(box.sent, [["entryId": "m1", "emoji": "👍", "agentId": "a1"]])

    box.refuses = true
    await store.react("❤️", to: "m1", in: "a1")
    XCTAssertEqual(store.transcripts["a1"]?.first?.myReactions, ["👍"], "the refused one is taken off again")
    XCTAssertNotNil(store.problem)
  }
}

/** A computer that answers reactions, or refuses them, and notes what the chat showed when each was sent. */
final class ReactingBox: AgentBackend, @unchecked Sendable {
  private let lock = NSLock()
  private var log: [JSON] = []
  private var seen: [[String]] = []
  var refuses = false
  weak var store: AppStore?

  var sent: [JSON] { lock.withLock { log } }
  var shownWhenSent: [[String]] { lock.withLock { seen } }

  func command(_ method: String, _ args: JSON) async throws -> JSON {
    guard method == "reactToMessage" else { return .null }
    let shown = await MainActor.run { [weak self] in self?.store?.transcripts["a1"]?.first?.myReactions ?? [] }
    let refused = lock.withLock { () -> Bool in
      log.append(args)
      seen.append(shown)
      return refuses
    }
    if refused { throw GatewayError(message: "The computer didn't answer.", refused: true) }
    return .null
  }

  func listAgents() async throws -> [Agent] { [] }
  func transcript(_ agentId: String) async throws -> [Entry] { [] }
  func send(_ agentId: String, text: String, attachments: [AttachmentRef], options: SendOptions, nonce: String?) async throws {}
  func markRead(_ agentId: String) async {}
  func createAgent(name: String, face: String?) async throws -> String { "x" }
  func createGroup(name: String, memberIds: [String]) async throws -> String { "g" }
  func answer(_ agentId: String, entryId: String, value: String) async throws {}
  func updateAgent(_ agentId: String, name: String, title: String, description: String) async throws {}
  func routines(_ agentId: String) async throws -> [JSON] { [] }
  func events() -> AsyncStream<BackendEvent> { AsyncStream { _ in } }
  var call: CallEngine? { nil }
  func server(_ path: String, method: String?, body: JSON?) async throws -> JSON { [:] }
  func screen(_ agentId: String) async throws -> ScreenState { ScreenState(socket: nil, state: "starting") }
}
