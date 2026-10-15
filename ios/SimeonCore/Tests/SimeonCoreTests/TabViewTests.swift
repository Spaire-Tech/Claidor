import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import XCTest
@testable import SimeonCore

/** The agent's tab on the phone (15 October 2026): the stream, the mapping of a touch, the order of inputs. */
final class TabViewTests: XCTestCase {
  func testTheStreamGivesTheTabItsPicturesAndWhyItClosed() {
    var parser = TabViewStreamParser()
    let jpeg = Data([0xFF, 0xD8, 0xFF, 0xE0, 0x00])
    let text = ":ping\n\ndata: {\"type\":\"tab\",\"url\":\"https://appleid.apple.com/\",\"title\":\"Sign in\"}\n\n"
      + "data: {\"type\":\"frame\",\"jpeg\":\"\(jpeg.base64EncodedString())\",\"width\":390,\"height\":700}\r\n\r\n"
      + "data: {\"type\":\"frame\",\"jpeg\":\"not base64!\",\"width\":390,\"height\":700}\n\n"
      + "data: {\"type\":\"closed\",\"reason\":\"tab-closed\"}\n\n"
    var events: [TabViewEvent] = []
    // Byte by byte, as a network would split it at its worst.
    for byte in Array(text.utf8) { events += parser.feed(bytes: [byte]) }
    XCTAssertEqual(events, [
      .tab(url: "https://appleid.apple.com/", title: "Sign in"),
      .frame(jpeg: jpeg, width: 390, height: 700),
      .closed(reason: "tab-closed"),
    ], "a picture that can't be read is skipped")
  }

  func testATouchFallsOnThePageWhereThePictureShowsIt() {
    // A 390 by 700 page in a 390 by 800 view: the picture is centred, 50 points above and below.
    let view = CGSize(width: 390, height: 800), page = CGSize(width: 390, height: 700)
    XCTAssertEqual(TabViewGeometry.fitted(view: view, page: page), CGRect(x: 0, y: 50, width: 390, height: 700))
    XCTAssertEqual(TabViewGeometry.pagePoint(CGPoint(x: 100, y: 150), view: view, page: page), CGPoint(x: 100, y: 100))
    XCTAssertNil(TabViewGeometry.pagePoint(CGPoint(x: 100, y: 20), view: view, page: page), "above the picture is nowhere")
    // A desktop page watched on the phone: 1280 wide shown 390 wide.
    let desktop = CGSize(width: 1280, height: 720)
    let point = TabViewGeometry.pagePoint(CGPoint(x: 195, y: 400), view: CGSize(width: 390, height: 800), page: desktop)
    XCTAssertEqual(point?.x, 640)
    XCTAssertEqual(point?.y ?? 0, 360, accuracy: 0.1)
    XCTAssertEqual(TabViewGeometry.scrollDelta(CGSize(width: 0, height: -100), view: view, page: page), CGSize(width: 0, height: 100), "a drag up scrolls down")
    XCTAssertNil(TabViewGeometry.pagePoint(.zero, view: .zero, page: page))
  }

  func testInputsGoInOrderAndPiledUpScrollsAndTypingGoAsOne() async {
    let sent = SentInputs()
    let gate = Gate()
    let queue = TabInputQueue { input in
      await gate.wait()
      await sent.add(input)
      return input["kind"]?.string == "tap" ? ["ok": true, "focus": "password"] : ["ok": true]
    }
    // The first scroll goes at once and waits on the gate; the rest pile up behind it.
    await queue.push(.scroll(x: 10, y: 20, dx: 0, dy: 50))
    try? await Task.sleep(nanoseconds: 50_000_000)
    await queue.push(.scroll(x: 10, y: 20, dx: 0, dy: 30))
    await queue.push(.scroll(x: 11, y: 21, dx: 0, dy: 20))
    await queue.push(.text("hun"))
    await queue.push(.text("ter2"))
    await queue.push(.key("Enter"))
    async let focus = queue.tap(x: 1, y: 2)
    try? await Task.sleep(nanoseconds: 50_000_000)
    await gate.open()
    let focused = await focus
    XCTAssertEqual(focused, "password", "the tap's answer says a password field has the keyboard")
    let kinds = await sent.all.map { $0["kind"]?.string ?? "" }
    XCTAssertEqual(kinds, ["scroll", "scroll", "text", "key", "tap"])
    let all = await sent.all
    XCTAssertEqual(all[1], ["kind": "scroll", "x": 11, "y": 21, "dx": 0, "dy": 50], "two scrolls that waited went as one")
    XCTAssertEqual(all[2], ["kind": "text", "text": "hunter2"])
    XCTAssertEqual(all[3], ["kind": "key", "key": "Enter"])
  }

  func testAFailedTapSaysNothingTookTheKeyboard() async {
    let queue = TabInputQueue { _ in throw GatewayError(message: "gone", refused: false) }
    let focus = await queue.tap(x: 1, y: 1)
    XCTAssertNil(focus)
    let refused = TabInputQueue { _ in ["ok": false, "reason": "no-view"] }
    let none = await refused.tap(x: 1, y: 1)
    XCTAssertNil(none)
  }

  func testTheStreamIsAskedForWithTheGatewaysTokens() throws {
    let connection = try GatewayConnection(box: ["gatewayUrl": "https://api.simeonlabs.com/sand-box/b1/p/1340/", "gatewayToken": "g", "networkToken": "n"])
    let request = try XCTUnwrap(connection.tabViewRequest(agentId: "agent 1", width: 390, height: 700, control: true))
    XCTAssertEqual(request.url?.absoluteString, "https://api.simeonlabs.com/sand-box/b1/p/1340/tab-view?agent=agent%201&width=390&height=700&control=1")
    XCTAssertEqual(request.value(forHTTPHeaderField: "authorization"), "Bearer g")
    XCTAssertEqual(request.value(forHTTPHeaderField: "x-anyrun-network-token"), "n")
    XCTAssertEqual(request.value(forHTTPHeaderField: "accept"), "text/event-stream")
    XCTAssertEqual(TabInput.control(false).json, ["kind": "control", "on": false])
  }

  @MainActor
  func testTakeControlAndStopTaskAskTheHost() async {
    let backend = TabCommandBackend()
    let store = AppStore()
    await store.attach(backend)
    let handoff = await store.takeComputerControl("a1")
    XCTAssertTrue(handoff)
    let stopped = await store.stopAgentTask("a1")
    XCTAssertTrue(stopped)
    let inputs = store.tabInputs("a1")
    let focus = await inputs.tap(x: 3, y: 4)
    XCTAssertEqual(focus, "text")
    XCTAssertEqual(backend.commands.map(\.method), ["takeComputerControl", "stopAgentTask", "tabViewInput"])
    XCTAssertEqual(backend.commands[2].args, ["id": "a1", "input": ["kind": "tap", "x": 3, "y": 4]])
    // The demo has no tab: the view falls back to the whole computer.
    var events: [TabViewEvent] = []
    for await event in DemoBackend().tabView("a1", width: 390, height: 700, control: true) { events.append(event) }
    XCTAssertEqual(events, [.closed(reason: "unavailable")])
  }
}

private actor SentInputs {
  private(set) var all: [JSON] = []
  func add(_ input: JSON) { all.append(input) }
}

/** Holds every send until it opens. */
private actor Gate {
  private var isOpen = false
  private var waiting: [CheckedContinuation<Void, Never>] = []
  func wait() async {
    if isOpen { return }
    await withCheckedContinuation { waiting.append($0) }
  }
  func open() {
    isOpen = true
    for continuation in waiting { continuation.resume() }
    waiting.removeAll()
  }
}

/** A backend that answers the three commands the browser view sends, and keeps them. */
private final class TabCommandBackend: AgentBackend, @unchecked Sendable {
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
    let interesting = ["takeComputerControl", "stopAgentTask", "tabViewInput"].contains(method)
    if interesting { lock.withLock { sent.append((method, args)) } }
    switch method {
    case "takeComputerControl": return ["handoff": true]
    case "stopAgentTask": return ["stopped": true]
    case "tabViewInput": return ["ok": true, "focus": "text"]
    default: return [:]
    }
  }
  func server(_ path: String, method: String?, body: JSON?) async throws -> JSON { [:] }
  func screen(_ agentId: String) async throws -> ScreenState { ScreenState(socket: nil, state: "starting") }
}
