import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import XCTest
@testable import SimeonCore

/** The iPhone's own Sign in with Apple sheet's half (12 October 2026): the nonce Apple signs, and what the server is sent and answers (`POST /auth/apple`). */
final class AppleSignInTests: XCTestCase {
  private let api = URL(string: "https://api.example.com/")!

  func testTheNonceIsRandomAndAppleGetsItsSHA256InHex() {
    // The server checks the token's nonce against sha256(raw).hexdigest() (native.nonce_hash).
    let nonce = AppleSignIn.nonce(randomBytes: Array(0..<32))
    XCTAssertEqual(nonce.raw, "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8")
    XCTAssertEqual(nonce.hashed, "ea866a757e4c38babfa8127cbe9a409d3e1f93a00ff1488ff735fcf917afffd0")
    XCTAssertNotEqual(AppleSignIn.freshNonce(), AppleSignIn.freshNonce())
  }

  func testWhatTheSheetGaveGoesToTheServerAndThePairComesBack() async throws {
    let http = ScriptedHTTP([{ _ in HTTPAnswer(status: 200, body: json(#"{"accessToken":"a","refreshToken":"r"}"#)) }])
    let nonce = AppleSignIn.nonce(randomBytes: Array(0..<32))
    let outcome = await AppleSignIn.signIn(
      api: api, identityToken: "id.token.sig", authorizationCode: "c0de", nonce: nonce,
      givenName: "Ada", familyName: "", clientVersion: "ios-0.1.0+1", http: http
    )
    XCTAssertEqual(outcome, .tokens(TokenPair(accessToken: "a", refreshToken: "r")))
    let request = try XCTUnwrap(http.requests.first)
    XCTAssertEqual(request.url?.absoluteString, "https://api.example.com/auth/apple")
    XCTAssertEqual(request.httpMethod, "POST")
    XCTAssertEqual(request.value(forHTTPHeaderField: "x-simeon-client-version"), "ios-0.1.0+1")
    let body = try XCTUnwrap(JSON.parse(XCTUnwrap(request.httpBody)))
    XCTAssertEqual(body["identityToken"]?.string, "id.token.sig")
    XCTAssertEqual(body["nonce"]?.string, nonce.raw, "the raw nonce goes to the server, never the hash")
    XCTAssertEqual(body["authorizationCode"]?.string, "c0de")
    XCTAssertEqual(body["givenName"]?.string, "Ada")
    XCTAssertNil(body["familyName"], "an empty name is not sent")
  }

  func testARefusedAccountSaysTheServersSentence() async {
    let http = ScriptedHTTP([{ _ in HTTPAnswer(status: 403, body: json(#"{"error":"apple_account","message":"This Apple account is already linked to another user on Simeon."}"#)) }])
    let outcome = await AppleSignIn.signIn(api: api, identityToken: "t", authorizationCode: nil, nonce: AppleSignIn.freshNonce(), givenName: nil, familyName: nil, clientVersion: "1", http: http)
    XCTAssertEqual(outcome, .refused("This Apple account is already linked to another user on Simeon."))
  }

  func testAnUncheckedTokenOrNoServerFailsWithASentence() async {
    let unchecked = ScriptedHTTP([{ _ in HTTPAnswer(status: 400, body: json(#"{"error":"apple_unverified","message":"Sign in with Apple couldn't be checked. Try again."}"#)) }])
    let first = await AppleSignIn.signIn(api: api, identityToken: "t", authorizationCode: nil, nonce: AppleSignIn.freshNonce(), givenName: nil, familyName: nil, clientVersion: "1", http: unchecked)
    XCTAssertEqual(first, .failed("Sign in with Apple couldn't be checked. Try again."))

    let noPair = ScriptedHTTP([{ _ in HTTPAnswer(status: 200, body: json("{}")) }])
    let second = await AppleSignIn.signIn(api: api, identityToken: "t", authorizationCode: nil, nonce: AppleSignIn.freshNonce(), givenName: nil, familyName: nil, clientVersion: "1", http: noPair)
    XCTAssertEqual(second, .failed(AppleSignIn.failed))
  }
}
