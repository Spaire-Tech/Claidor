import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import XCTest
@testable import SimeonCore

/** Log in or sign up with an email (19 October 2026): the code asked for, the code or the password for the pair (`/auth/email/code`, `verify`, `password`), and Settings' password (`/desktop/api/account/password`). */
final class EmailSignInTests: XCTestCase {
  private let api = URL(string: "https://api.example.com/")!

  func testWhatLooksLikeAnEmail() {
    XCTAssertTrue(EmailSignIn.looksLikeEmail("bass.fall@gmail.com"))
    XCTAssertTrue(EmailSignIn.looksLikeEmail("  ada@example.co.uk "))
    for text in ["", "ada", "ada@", "@example.com", "ada@example", "ada@.com", "ada@example.", "a da@example.com", "a@b@c.com"] {
      XCTAssertFalse(EmailSignIn.looksLikeEmail(text), text)
    }
  }

  func testTheCodeIsAskedForWithTheEmailTrimmed() async throws {
    let http = ScriptedHTTP([{ _ in HTTPAnswer(status: 202, body: json(#"{"sent":true}"#)) }])
    let sent = await EmailSignIn.requestCode(api: api, email: " ada@example.com ", clientVersion: "ios-0.1.0+1", http: http)
    XCTAssertEqual(sent, .sent)
    let request = try XCTUnwrap(http.requests.first)
    XCTAssertEqual(request.url?.absoluteString, "https://api.example.com/auth/email/code")
    XCTAssertEqual(request.httpMethod, "POST")
    XCTAssertEqual(request.value(forHTTPHeaderField: "x-simeon-client-version"), "ios-0.1.0+1")
    let body = try XCTUnwrap(JSON.parse(XCTUnwrap(request.httpBody)))
    XCTAssertEqual(body["email"]?.string, "ada@example.com")
  }

  func testTooManyCodesSaysTheServersSentence() async {
    let http = ScriptedHTTP([{ _ in HTTPAnswer(status: 429, body: json(#"{"error":"too_many","message":"Too many codes asked for this email. Try again in a few minutes."}"#)) }])
    let sent = await EmailSignIn.requestCode(api: api, email: "ada@example.com", clientVersion: "1", http: http)
    XCTAssertEqual(sent, .refused("Too many codes asked for this email. Try again in a few minutes."))
  }

  func testTheCodeGoesInCapitalsAndThePairComesBack() async throws {
    let http = ScriptedHTTP([{ _ in HTTPAnswer(status: 200, body: json(#"{"accessToken":"a","refreshToken":"r"}"#)) }])
    let outcome = await EmailSignIn.verify(api: api, email: "ada@example.com", code: " ab3 9cd ", clientVersion: "1", http: http)
    XCTAssertEqual(outcome, .tokens(TokenPair(accessToken: "a", refreshToken: "r")))
    let request = try XCTUnwrap(http.requests.first)
    XCTAssertEqual(request.url?.absoluteString, "https://api.example.com/auth/email/verify")
    let body = try XCTUnwrap(JSON.parse(XCTUnwrap(request.httpBody)))
    XCTAssertEqual(body["code"]?.string, "AB39CD")
    XCTAssertEqual(body["email"]?.string, "ada@example.com")
  }

  func testAWrongCodeOrPasswordFailsWithTheServersSentenceAndAClosedAccountIsRefused() async {
    let wrong = ScriptedHTTP([{ _ in HTTPAnswer(status: 400, body: json(#"{"error":"wrong_code","message":"That code is wrong or has expired."}"#)) }])
    let first = await EmailSignIn.verify(api: api, email: "ada@example.com", code: "ZZZZZZ", clientVersion: "1", http: wrong)
    XCTAssertEqual(first, .failed("That code is wrong or has expired."))

    let closed = ScriptedHTTP([{ _ in HTTPAnswer(status: 403, body: json(#"{"error":"account_closed","message":"This account can't sign in to Simeon."}"#)) }])
    let second = await EmailSignIn.password(api: api, email: "ada@example.com", password: "a passphrase", clientVersion: "1", http: closed)
    XCTAssertEqual(second, .refused("This account can't sign in to Simeon."))
  }

  func testThePasswordGoesAsTyped() async throws {
    let http = ScriptedHTTP([{ _ in HTTPAnswer(status: 200, body: json(#"{"accessToken":"a","refreshToken":"r"}"#)) }])
    _ = await EmailSignIn.password(api: api, email: "ada@example.com", password: " Pass Phrase ", clientVersion: "1", http: http)
    let request = try XCTUnwrap(http.requests.first)
    XCTAssertEqual(request.url?.absoluteString, "https://api.example.com/auth/email/password")
    let body = try XCTUnwrap(JSON.parse(XCTUnwrap(request.httpBody)))
    XCTAssertEqual(body["password"]?.string, " Pass Phrase ")
  }

  /** Settings › Account's Name: saved as the agents' name, tidied, the account keeping who it is. */
  @MainActor
  func testSettingsChangesTheNameTheAgentsUse() async {
    let store = AppStore()
    await store.attach(DemoBackend(seed: DemoData.seed(), pace: 0.01, call: nil))
    store.account = Account(name: "Bass", email: "bass@simeonlabs.com", id: "8a6b0b0e-user")
    let problem = await store.changeName("  Bassy   B ")
    XCTAssertNil(problem)
    XCTAssertEqual(store.account?.name, "Bassy B")
    XCTAssertEqual(store.account?.email, "bass@simeonlabs.com")
    XCTAssertEqual(store.account?.id, "8a6b0b0e-user")
  }

  @MainActor
  func testSettingsSetsAPasswordAndSaysWhyNot() async {
    let store = AppStore()
    await store.attach(DemoBackend(seed: DemoData.seed(), pace: 0.01, call: nil))
    let before = await store.hasPassword()
    XCTAssertEqual(before, false)
    let short = await store.setPassword("short")
    XCTAssertEqual(short, "Use at least 8 characters.")
    let saved = await store.setPassword("a good passphrase")
    XCTAssertNil(saved)
    let after = await store.hasPassword()
    XCTAssertEqual(after, true)
  }
}
