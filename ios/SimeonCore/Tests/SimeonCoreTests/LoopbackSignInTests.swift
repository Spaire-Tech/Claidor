import Foundation
import XCTest
@testable import SimeonCore

/**
 * The loopback sign-in (LoopbackSignIn.swift): which sign-ins it is for,
 * what it reads from the vendor's request, what it answers, and what it
 * hands the computer. The listener itself needs Apple's Network and is
 * not built on Linux.
 */
final class LoopbackSignInTests: XCTestCase {
  /** Canva's authorization page as the computer builds it (`finishStart`, URLSearchParams' encoding). */
  let canva = URL(string: "https://mcp.canva.com/authorize?client_id=abc&redirect_uri=http%3A%2F%2Flocalhost%3A8787%2Fcallback&response_type=code&code_challenge=x&code_challenge_method=S256&state=vendor-canva-Zz9_&resource=https%3A%2F%2Fmcp.canva.com%2Fmcp")!

  func testOnlyASignInReturningToTheLoopbackIsCaught() {
    XCTAssertEqual(LoopbackSignIn.state(returningHere: canva), "vendor-canva-Zz9_")
    XCTAssertEqual(LoopbackSignIn.state(returningHere: URL(string: "https://x.example/authorize?redirect_uri=http%3A%2F%2F127.0.0.1%3A8787%2Fcallback&state=s")!), "s")
    // Notion's, back to Simeon Labs' hosted page: the sheet as before.
    XCTAssertNil(LoopbackSignIn.state(returningHere: URL(string: "https://mcp.notion.com/authorize?redirect_uri=https%3A%2F%2Fapi.simeonlabs.com%2Fdesktop%2Fmcp-oauth%2Fcallback&state=s")!))
    // Another port, another path, https, no state, or an app's own link (Composio's): not ours.
    XCTAssertNil(LoopbackSignIn.state(returningHere: URL(string: "https://x.example/a?redirect_uri=http%3A%2F%2Flocalhost%3A8788%2Fcallback&state=s")!))
    XCTAssertNil(LoopbackSignIn.state(returningHere: URL(string: "https://x.example/a?redirect_uri=http%3A%2F%2Flocalhost%3A8787%2Fother&state=s")!))
    XCTAssertNil(LoopbackSignIn.state(returningHere: URL(string: "https://x.example/a?redirect_uri=https%3A%2F%2Flocalhost%3A8787%2Fcallback&state=s")!))
    XCTAssertNil(LoopbackSignIn.state(returningHere: URL(string: "https://x.example/a?redirect_uri=http%3A%2F%2Flocalhost%3A8787%2Fcallback")!))
    XCTAssertNil(LoopbackSignIn.state(returningHere: URL(string: "https://connect.composio.dev/link/lk_123")!))
  }

  func testTheCallbackIsReadFromTheRequestHead() {
    let head = "GET /callback?code=c%2F1&state=vendor-canva-Zz9_ HTTP/1.1\r\nHost: localhost:8787\r\nUser-Agent: Safari\r\n\r\n"
    XCTAssertEqual(LoopbackSignIn.answer(requestHead: head), LoopbackSignIn.Answer(state: "vendor-canva-Zz9_", code: "c/1", error: nil, errorDescription: nil))
    let refused = "GET /callback?error=access_denied&error_description=The+user+said+no&state=s HTTP/1.1\r\n\r\n"
    XCTAssertEqual(LoopbackSignIn.answer(requestHead: refused), LoopbackSignIn.Answer(state: "s", code: nil, error: "access_denied", errorDescription: "The user said no"))
    // The favicon, another path, a POST, no state, or half a line: not the callback.
    XCTAssertNil(LoopbackSignIn.answer(requestHead: "GET /favicon.ico HTTP/1.1\r\n\r\n"))
    XCTAssertNil(LoopbackSignIn.answer(requestHead: "POST /callback?code=c&state=s HTTP/1.1\r\n\r\n"))
    XCTAssertNil(LoopbackSignIn.answer(requestHead: "GET /callback?code=c HTTP/1.1\r\n\r\n"))
    XCTAssertNil(LoopbackSignIn.answer(requestHead: "GET"))
    XCTAssertNil(LoopbackSignIn.answer(requestHead: ""))
  }

  func testTheSheetIsSentOnToTheAppsOwnAddress() {
    let text = String(decoding: LoopbackSignIn.redirect(to: "simeon-ios://connected"), as: UTF8.self)
    XCTAssertTrue(text.hasPrefix("HTTP/1.1 302 Found\r\n"))
    XCTAssertTrue(text.contains("\r\nLocation: simeon-ios://connected\r\n"))
    XCTAssertTrue(text.hasSuffix("\r\n\r\n"))
    XCTAssertTrue(String(decoding: LoopbackSignIn.notFound, as: UTF8.self).hasPrefix("HTTP/1.1 404"))
  }

  /** The address the computer asks Canva for is the one the app listens on. */
  func testTheAddressMatchesTheComputers() {
    XCTAssertEqual(LoopbackSignIn.address, "http://localhost:\(LoopbackSignIn.port)\(LoopbackSignIn.path)")
    XCTAssertTrue(LoopbackSignIn.isLoopback(LoopbackSignIn.address))
  }
}

@MainActor
final class LoopbackSignInStoreTests: XCTestCase {
  func testTheCodeGoesToTheComputerThatStartedTheSignIn() async {
    let backend = SignInBox()
    let store = AppStore()
    await store.attach(backend)
    await store.finishLoopbackSignIn(LoopbackSignIn.Answer(state: "vendor-canva-1", code: "abc", error: nil, errorDescription: nil), name: "Canva")
    XCTAssertEqual(backend.finished, [["stateId": "vendor-canva-1", "code": "abc"]])
    XCTAssertNil(store.problem)
    store.detach()
  }

  func testARefusalIsSaidAndNothingIsSent() async {
    let backend = SignInBox()
    let store = AppStore()
    await store.attach(backend)
    await store.finishLoopbackSignIn(LoopbackSignIn.Answer(state: "s", code: nil, error: "access_denied", errorDescription: "You declined."), name: "Canva")
    XCTAssertEqual(store.problem, "You declined.")
    await store.finishLoopbackSignIn(LoopbackSignIn.Answer(state: "s", code: nil, error: "access_denied", errorDescription: nil), name: "Canva")
    XCTAssertEqual(store.problem, "Canva refused the sign-in (access_denied).")
    XCTAssertEqual(backend.finished, [])
    store.detach()
  }

  func testAComputerThatCannotFinishIsSaid() async {
    let backend = SignInBox()
    backend.refuse = true
    let store = AppStore()
    await store.attach(backend)
    await store.finishLoopbackSignIn(LoopbackSignIn.Answer(state: "s", code: "abc", error: nil, errorDescription: nil), name: "Canva")
    XCTAssertEqual(store.problem, "Couldn't finish connecting Canva: No pending vendor sign-in matches this callback.")
    store.detach()
  }
}

/** A computer that writes down each `completeMcpOAuth` it is sent, or refuses it as the host does when the state is unknown. */
final class SignInBox: AgentBackend, @unchecked Sendable {
  private let lock = NSLock()
  private var sent: [JSON] = []
  var refuse = false
  var finished: [JSON] { lock.withLock { sent } }
  func listAgents() async throws -> [Agent] { [] }
  func transcript(_ agentId: String) async throws -> [Entry] { [] }
  func send(_ agentId: String, text: String, attachments: [AttachmentRef], options: SendOptions, nonce: String?) async throws {}
  func markRead(_ agentId: String) async {}
  func createAgent(name: String, colour: String) async throws -> String { "x" }
  func createGroup(name: String, memberIds: [String]) async throws -> String { "g" }
  func answer(_ agentId: String, entryId: String, value: String) async throws {}
  func updateAgent(_ agentId: String, name: String, title: String, description: String) async throws {}
  func routines(_ agentId: String) async throws -> [JSON] { [] }
  func events() -> AsyncStream<BackendEvent> { AsyncStream { _ in } }
  var call: CallEngine? { nil }
  func command(_ method: String, _ args: JSON) async throws -> JSON {
    guard method == "completeMcpOAuth" else { return [:] }
    if refuse { throw GatewayError(message: "No pending vendor sign-in matches this callback.", refused: true, status: 400) }
    lock.withLock { sent.append(args) }
    return [:]
  }
  func server(_ path: String, method: String?, body: JSON?) async throws -> JSON { [:] }
  func screen(_ agentId: String) async throws -> ScreenState { ScreenState(socket: nil, state: "starting") }
}
