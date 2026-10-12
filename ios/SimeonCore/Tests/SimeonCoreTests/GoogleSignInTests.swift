import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import XCTest
@testable import SimeonCore

/** Google from the iPhone itself (12 October 2026): the server's setup, Google's page with PKCE, the redirect, and the pair (`POST /auth/google`). */
final class GoogleSignInTests: XCTestCase {
  private let api = URL(string: "https://api.example.com/")!
  private let setup = #"{"google":{"clientId":"123-abc.apps.googleusercontent.com","redirectUri":"com.googleusercontent.apps.123-abc:/oauthredirect","authorizeUrl":"https://accounts.google.com/o/oauth2/v2/auth","scope":"openid email profile"}}"#

  func testTheVerifierStaysAndGoogleGetsItsSHA256() {
    // RFC 7636, appendix B: this verifier's S256 challenge.
    let verifier = Array("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk".utf8)
    XCTAssertEqual(base64URL(sha256(verifier)), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")
    let attempt = GoogleSignIn.attempt(verifierBytes: Array(0..<32), stateBytes: Array(0..<16))
    XCTAssertEqual(attempt.verifier, "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8")
    XCTAssertEqual(attempt.challenge, base64URL(sha256(Array(attempt.verifier.utf8))))
    XCTAssertNotEqual(GoogleSignIn.freshAttempt(), GoogleSignIn.freshAttempt())
  }

  func testTheServersSetupOpensGooglesPageWithThePicker() async throws {
    let http = ScriptedHTTP([{ _ in HTTPAnswer(status: 200, body: json(self.setup)) }])
    let answered = await GoogleSignIn.config(api: api, http: http)
    let config = try XCTUnwrap(answered)
    XCTAssertEqual(http.requests.first?.url?.absoluteString, "https://api.example.com/auth/google/config")
    XCTAssertEqual(config.callbackScheme, "com.googleusercontent.apps.123-abc")

    let attempt = GoogleSignIn.attempt(verifierBytes: Array(0..<32), stateBytes: Array(0..<16))
    let url = try XCTUnwrap(GoogleSignIn.authorizeURL(config, attempt: attempt))
    let items = Dictionary(uniqueKeysWithValues: (URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []).map { ($0.name, $0.value ?? "") })
    XCTAssertEqual(url.host, "accounts.google.com")
    XCTAssertEqual(items["client_id"], "123-abc.apps.googleusercontent.com")
    XCTAssertEqual(items["redirect_uri"], "com.googleusercontent.apps.123-abc:/oauthredirect")
    XCTAssertEqual(items["response_type"], "code")
    XCTAssertEqual(items["code_challenge"], attempt.challenge)
    XCTAssertEqual(items["code_challenge_method"], "S256")
    XCTAssertEqual(items["state"], attempt.state)
    XCTAssertEqual(items["prompt"], "select_account", "another account is a tap away")
    XCTAssertNil(items["code_verifier"], "the verifier never goes to Google's page")
  }

  func testNoSetupMeansTheWebSignIn() async {
    let none = ScriptedHTTP([{ _ in HTTPAnswer(status: 200, body: json(#"{"google":null}"#)) }])
    let first = await GoogleSignIn.config(api: api, http: none)
    XCTAssertNil(first)
    let older = ScriptedHTTP([{ _ in HTTPAnswer(status: 404, body: json(#"{"detail":"Not Found"}"#)) }])
    let second = await GoogleSignIn.config(api: api, http: older)
    XCTAssertNil(second, "a server without the route: the web sign-in")
  }

  func testTheRedirectMustAnswerThisSignIn() {
    let attempt = GoogleSignIn.attempt(verifierBytes: Array(0..<32), stateBytes: Array(0..<16))
    let mine = URL(string: "com.googleusercontent.apps.123-abc:/oauthredirect?state=\(attempt.state)&code=4%2F0Ab&scope=email")!
    XCTAssertEqual(GoogleSignIn.code(from: mine, attempt: attempt), .code("4/0Ab"))
    let other = URL(string: "com.googleusercontent.apps.123-abc:/oauthredirect?state=someone-else&code=4%2F0Ab")!
    XCTAssertEqual(GoogleSignIn.code(from: other, attempt: attempt), .failed)
    let denied = URL(string: "com.googleusercontent.apps.123-abc:/oauthredirect?error=access_denied&state=\(attempt.state)")!
    XCTAssertEqual(GoogleSignIn.code(from: denied, attempt: attempt), .cancelled)
  }

  func testTheCodeAndVerifierGoToTheServerAndThePairComesBack() async throws {
    let http = ScriptedHTTP([{ _ in HTTPAnswer(status: 200, body: json(#"{"accessToken":"a","refreshToken":"r"}"#)) }])
    let attempt = GoogleSignIn.attempt(verifierBytes: Array(0..<32), stateBytes: Array(0..<16))
    let outcome = await GoogleSignIn.signIn(api: api, code: "4/0Ab", attempt: attempt, clientVersion: "ios-0.1.0+4", http: http)
    XCTAssertEqual(outcome, .tokens(TokenPair(accessToken: "a", refreshToken: "r")))
    let request = try XCTUnwrap(http.requests.first)
    XCTAssertEqual(request.url?.absoluteString, "https://api.example.com/auth/google")
    XCTAssertEqual(request.httpMethod, "POST")
    XCTAssertEqual(request.value(forHTTPHeaderField: "x-simeon-client-version"), "ios-0.1.0+4")
    let body = try XCTUnwrap(JSON.parse(XCTUnwrap(request.httpBody)))
    XCTAssertEqual(body["code"]?.string, "4/0Ab")
    XCTAssertEqual(body["codeVerifier"]?.string, attempt.verifier)
  }

  func testARefusedAccountSaysTheServersSentence() async {
    let http = ScriptedHTTP([{ _ in HTTPAnswer(status: 403, body: json(#"{"error":"google_account","message":"This Google account is already linked to another user on Simeon."}"#)) }])
    let outcome = await GoogleSignIn.signIn(api: api, code: "c", attempt: GoogleSignIn.freshAttempt(), clientVersion: "1", http: http)
    XCTAssertEqual(outcome, .refused("This Google account is already linked to another user on Simeon."))
    let refusedCode = ScriptedHTTP([{ _ in HTTPAnswer(status: 400, body: json(#"{"error":"google_unverified","message":"Google sign-in didn't finish. Try again."}"#)) }])
    let second = await GoogleSignIn.signIn(api: api, code: "c", attempt: GoogleSignIn.freshAttempt(), clientVersion: "1", http: refusedCode)
    XCTAssertEqual(second, .failed(GoogleSignIn.failed))
  }
}
