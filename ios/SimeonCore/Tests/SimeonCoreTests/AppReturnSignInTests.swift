import Foundation
import XCTest
@testable import SimeonCore

/**
 * A connected app's sign-in finished by the app that opened it
 * (AppReturnSignIn.swift, 15 October 2026): which sign-ins return through
 * Simeon Labs' server, what the app reads when the server sends the answer
 * back, and that the app names the sign-in to the server first.
 */
final class AppReturnSignInTests: XCTestCase {
  /** Stripe's authorization page as the computer builds it: back to Simeon Labs' server. */
  let stripe = URL(string: "https://access.stripe.com/mcp/oauth2/authorize?client_id=abc&redirect_uri=https%3A%2F%2Fapi.simeonlabs.com%2Fdesktop%2Fmcp-oauth%2Fcallback&response_type=code&code_challenge=x&code_challenge_method=S256&state=vendor-stripe-Ab_9&resource=https%3A%2F%2Fmcp.stripe.com")!

  func testOnlyASignInReturningThroughTheServerIsNamed() {
    XCTAssertEqual(AppReturnSignIn.state(returningViaServer: stripe), "vendor-stripe-Ab_9")
    // Canva's comes back to the loopback; an app's own link (Composio's) has no state.
    XCTAssertNil(AppReturnSignIn.state(returningViaServer: URL(string: "https://mcp.canva.com/authorize?redirect_uri=http%3A%2F%2Flocalhost%3A8787%2Fcallback&state=s")!))
    XCTAssertNil(AppReturnSignIn.state(returningViaServer: URL(string: "https://connect.composio.dev/link/lk_123")!))
    XCTAssertNil(AppReturnSignIn.state(returningViaServer: URL(string: "https://x.example/a?redirect_uri=https%3A%2F%2Fapi.simeonlabs.com%2Fdesktop%2Fmcp-oauth%2Fcallback")!))
  }

  func testTheAnswerTheServerSendsBackIsRead() {
    XCTAssertEqual(
      AppReturnSignIn.answer(URL(string: "simeon-ios://mcp-oauth?state=vendor-stripe-Ab_9&code=c%2F1")!),
      LoopbackSignIn.Answer(state: "vendor-stripe-Ab_9", code: "c/1", error: nil, errorDescription: nil)
    )
    XCTAssertEqual(
      AppReturnSignIn.answer(URL(string: "simeon://mcp-oauth?state=s&error=access_denied&error_description=The+user+said+no")!),
      LoopbackSignIn.Answer(state: "s", code: nil, error: "access_denied", errorDescription: "The user said no")
    )
    // The billing page's way back, a sign-in's "connected", no state, nothing: not a sign-in's answer.
    XCTAssertNil(AppReturnSignIn.answer(URL(string: "simeon-ios://billing-done")!))
    XCTAssertNil(AppReturnSignIn.answer(URL(string: "simeon-ios://connected?status=ok")!))
    XCTAssertNil(AppReturnSignIn.answer(URL(string: "simeon-ios://mcp-oauth?code=c")!))
    XCTAssertNil(AppReturnSignIn.answer(nil))
  }

  func testTheAppNamesTheSignInToTheServer() async {
    let backend = SignInBox()
    let store = AppStore()
    await store.attach(backend)
    let sent = await store.sendSignInBack(state: "vendor-stripe-Ab_9", scheme: "simeon-ios")
    XCTAssertTrue(sent)
    XCTAssertEqual(backend.serverCalls.count, 1)
    XCTAssertTrue(backend.serverCalls[0].hasPrefix("POST mcp-oauth/return"))
    XCTAssertTrue(backend.serverCalls[0].contains("vendor-stripe-Ab_9"))
    XCTAssertTrue(backend.serverCalls[0].contains("simeon-ios"))
    store.detach()
  }

  func testWithoutAComputerNothingIsNamed() async {
    let store = AppStore()
    let sent = await store.sendSignInBack(state: "s", scheme: "simeon-ios")
    XCTAssertFalse(sent)
  }
}
