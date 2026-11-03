import Foundation
import XCTest
@testable import SimeonCore

/**
 * A connected app's sign-in finished by the app that opened it
 * (AppReturnSignIn.swift, 15 October 2026): which sign-ins return through
 * Simeon Labs' server, what the app reads when the server sends the answer
 * back, that the app names the sign-in to the server first, and that it
 * finishes only a sign-in it named, once, in time, signed in, never saying
 * the link's words (the Windows app's `finishReturnedSignIn`, in
 * clients/apps/app/src/core/outsideStore.test.ts).
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

  @MainActor
  func testTheAppNamesTheSignInToTheServer() async {
    let backend = SignInBox()
    let store = AppStore()
    await store.attach(backend)
    let sent = await store.sendSignInBack(state: "vendor-stripe-Ab_9", scheme: "simeon-ios", name: "Stripe")
    XCTAssertTrue(sent)
    // Attaching also reads the app list from the server (`GET apps`); the sign-in is named once.
    let returns = backend.serverCalls.filter { $0.contains("mcp-oauth/return") }
    XCTAssertEqual(returns.count, 1)
    XCTAssertTrue(returns[0].hasPrefix("POST mcp-oauth/return"))
    XCTAssertTrue(returns[0].contains("vendor-stripe-Ab_9"))
    XCTAssertTrue(returns[0].contains("simeon-ios"))
    store.detach()
  }

  @MainActor
  func testWithoutAComputerNothingIsNamed() async {
    let store = AppStore()
    let sent = await store.sendSignInBack(state: "s", scheme: "simeon-ios", name: "Stripe")
    XCTAssertFalse(sent)
    let finished = await store.finishReturnedSignIn(LoopbackSignIn.Answer(state: "s", code: "c", error: nil, errorDescription: nil))
    XCTAssertFalse(finished)
  }

  @MainActor
  func testOnlyASignInThisAppNamedIsFinishedAndOnce() async {
    let backend = SignInBox()
    let store = AppStore()
    await store.attach(backend)
    // Never named here: any page can open `simeon://mcp-oauth?…`. Dropped without a word.
    let stray = await store.finishReturnedSignIn(LoopbackSignIn.Answer(state: "vendor-x-1", code: "c", error: nil, errorDescription: nil))
    XCTAssertFalse(stray)
    let forged = await store.finishReturnedSignIn(LoopbackSignIn.Answer(state: "vendor-x-1", code: nil, error: "x", errorDescription: "Your account is locked. Call +1 555 0100."))
    XCTAssertFalse(forged)
    XCTAssertEqual(backend.finished, [])
    XCTAssertNil(store.problem)
    // Named, then come back: the code goes to this account's computer, once.
    await store.sendSignInBack(state: "vendor-stripe-Ab_9", scheme: "simeon", name: "Stripe")
    let answer = LoopbackSignIn.Answer(state: "vendor-stripe-Ab_9", code: "c/1", error: nil, errorDescription: nil)
    let first = await store.finishReturnedSignIn(answer)
    XCTAssertTrue(first)
    let again = await store.finishReturnedSignIn(answer)
    XCTAssertFalse(again)
    XCTAssertEqual(backend.finished, [["stateId": "vendor-stripe-Ab_9", "code": "c/1"]])
    XCTAssertNil(store.problem)
    store.detach()
  }

  @MainActor
  func testARefusalIsSaidInTheAppsOwnWords() async {
    let backend = SignInBox()
    let store = AppStore()
    await store.attach(backend)
    await store.sendSignInBack(state: "vendor-stripe-Ab_9", scheme: "simeon", name: "Stripe")
    let refused = await store.finishReturnedSignIn(LoopbackSignIn.Answer(state: "vendor-stripe-Ab_9", code: nil, error: "access_denied", errorDescription: "Your account is locked. Call +1 555 0100."))
    XCTAssertTrue(refused)
    XCTAssertEqual(store.problem, "Stripe didn't connect. Try again.")
    XCTAssertEqual(backend.finished, [])
    store.detach()
  }

  @MainActor
  func testANamedSignInLastsTenMinutesAndEndsWithTheSignIn() async {
    let backend = SignInBox()
    let store = AppStore()
    await store.attach(backend)
    let start = Date(timeIntervalSince1970: 1_800_000_000)
    let answer = { (state: String) in LoopbackSignIn.Answer(state: state, code: "c", error: nil, errorDescription: nil) }
    await store.sendSignInBack(state: "late", scheme: "simeon", name: "Stripe", now: start)
    await store.sendSignInBack(state: "in-time", scheme: "simeon", name: "Stripe", now: start)
    let late = await store.finishReturnedSignIn(answer("late"), now: start.addingTimeInterval(AppStore.returnedSignInSeconds + 1))
    XCTAssertFalse(late)
    let inTime = await store.finishReturnedSignIn(answer("in-time"), now: start.addingTimeInterval(AppStore.returnedSignInSeconds))
    XCTAssertTrue(inTime)
    XCTAssertEqual(backend.finished, [["stateId": "in-time", "code": "c"]])
    // Signed out (or another account): what was named is forgotten.
    await store.sendSignInBack(state: "before-sign-out", scheme: "simeon", name: "Stripe")
    store.detach()
    await store.attach(backend)
    let afterSignOut = await store.finishReturnedSignIn(answer("before-sign-out"))
    XCTAssertFalse(afterSignOut)
    XCTAssertEqual(backend.finished.count, 1)
    store.detach()
  }
}
