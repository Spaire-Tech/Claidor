import XCTest
@testable import SimeonCore

/**
 * The phone's whole computer, its core (15 October 2026): Take control and
 * Stop task ask the host, and after a tap the phone asks what it focused
 * (`typingFocus`) to open the right keyboard or put it away; taking control
 * makes the computer ready to see the taps (`prepare`).
 */
final class ComputerControlTests: XCTestCase {
  @MainActor
  func testTakeControlAndStopTaskAskTheHost() async {
    let backend = ComputerCommandBackend()
    let store = AppStore()
    await store.attach(backend)
    let handoff = await store.takeComputerControl("a1")
    XCTAssertTrue(handoff)
    let stopped = await store.stopAgentTask("a1")
    XCTAssertTrue(stopped)
    XCTAssertEqual(backend.commands.map(\.method), ["takeComputerControl", "stopAgentTask"])
    XCTAssertEqual(backend.commands[0].args, ["id": "a1"])
  }

  @MainActor
  func testATapOnAFieldNamesItsKeyboardAndElsewhereNone() async {
    let backend = ComputerCommandBackend()
    let store = AppStore()
    await store.attach(backend)
    let email = await store.typingFocus("on-email")
    XCTAssertEqual(email, .email)
    XCTAssertEqual(backend.commands.last?.method, "typingFocus")
    XCTAssertEqual(backend.commands.last?.args, ["id": "on-email"])
    let button = await store.typingFocus("on-button")
    XCTAssertEqual(button, TypingField.none)
    XCTAssertEqual(button?.takesTyping, false)
    let password = await store.typingFocus("on-password")
    XCTAssertEqual(password, .password)
    XCTAssertEqual(password?.takesTyping, true)
    // A kind the phone does not know is typed into as text.
    let other = await store.typingFocus("on-color")
    XCTAssertEqual(other, .text)
    // An engine without the question, or no answer: the keyboard is left as it is.
    let older = await store.typingFocus("older-engine")
    XCTAssertNil(older)
    let unanswered = await store.typingFocus("no-focus-field")
    XCTAssertNil(unanswered)
  }

  @MainActor
  func testTakingControlMakesTheComputerReadyForTheTaps() async {
    let backend = ComputerCommandBackend()
    let store = AppStore()
    await store.attach(backend)
    await store.prepareTypingFocus("a1")
    XCTAssertEqual(backend.commands.last?.method, "typingFocus")
    XCTAssertEqual(backend.commands.last?.args, ["id": "a1", "prepare": true])
    // An engine without the question: nothing happens.
    await store.prepareTypingFocus("older-engine")
    XCTAssertEqual(backend.commands.count, 2)
  }

  @MainActor
  func testWithoutAComputerNothingIsAsked() async {
    let store = AppStore()
    let focus = await store.typingFocus("a1")
    XCTAssertNil(focus)
    await store.prepareTypingFocus("a1")
  }
}

/** A backend that answers the commands the computer view sends, and keeps them. */
private final class ComputerCommandBackend: AgentBackend, @unchecked Sendable {
  private let lock = NSLock()
  private var sent: [(method: String, args: JSON)] = []
  var commands: [(method: String, args: JSON)] { lock.withLock { sent } }
  func listAgents() async throws -> [Agent] { [Agent(id: "a1", name: "Theo")] }
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
  func command(_ method: String, _ args: JSON) async throws -> JSON {
    let interesting = ["takeComputerControl", "stopAgentTask", "typingFocus"].contains(method)
    if interesting { lock.withLock { sent.append((method, args)) } }
    switch method {
    case "takeComputerControl": return ["handoff": true]
    case "stopAgentTask": return ["stopped": true]
    case "typingFocus":
      switch args["id"]?.string {
      case "on-email": return ["focus": "email"]
      case "on-button": return ["focus": ""]
      case "on-password": return ["focus": "password"]
      case "on-color": return ["focus": "color"]
      case "older-engine": throw GatewayError(message: "unknown gateway method: typingFocus", refused: true)
      default: return [:]
      }
    default: return [:]
    }
  }
  func server(_ path: String, method: String?, body: JSON?) async throws -> JSON { [:] }
  func screen(_ agentId: String) async throws -> ScreenState { ScreenState(socket: nil, state: "starting") }
}
