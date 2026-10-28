import Foundation
import XCTest
@testable import SimeonCore

/** The 1Password cards (28 October 2026): the fill card and the connect card, as the chat reads them. */
final class OnePasswordCardsTests: XCTestCase {
  private func row(_ message: JSON, _ fields: [String: JSON] = [:]) throws -> RequestCard {
    var raw: JSON = ["id": "t4s1", "kind": "send-message", "timestampMs": 1, "message": message]
    for (key, value) in fields { raw = raw.setting(key, value) }
    guard case .request(_, let card) = try XCTUnwrap(Chat.row(for: Entry(raw)!)) else { XCTFail("not a request card"); throw CancellationError() }
    return card
  }

  private static let fill: JSON = ["type": "credential-request", "credential": [
    "kind": "browser-login", "credentialId": "aaaaaaaaaaaaaaaaaaaaaaaaaa", "vaultId": "vvvvvvvvvvvvvvvvvvvvvvvvvv", "revision": 3,
    "title": "Acme", "site": "acme.example", "purpose": "To sign in and get the invoice.",
  ]]

  func testTheFillCardReadsTheLoginsNameAndSiteAndWhatWentIn() throws {
    guard case .credential(let open) = try row(Self.fill) else { return XCTFail() }
    XCTAssertEqual(open.title, "Acme")
    XCTAssertEqual(open.site, "acme.example")
    XCTAssertEqual(open.purpose, "To sign in and get the invoice.")
    XCTAssertEqual(open.state, .open)
    XCTAssertNil(open.statusLine)
    XCTAssertEqual(open.confirmReason, "Fill your Acme login on acme.example")
    guard case .credential(let filled) = try row(Self.fill, ["credentialState": "filled", "credentialOutcomes": ["username": "notFound", "password": "filled"]]) else { return XCTFail() }
    XCTAssertEqual(filled.statusLine, "Filled")
    XCTAssertEqual(filled.outcomeLine, "Password filled")
    guard case .credential(let both) = try row(Self.fill, ["credentialState": "filled", "credentialOutcomes": ["username": "filled", "password": "filled"]]) else { return XCTFail() }
    XCTAssertEqual(both.outcomeLine, "Username and password filled")
    guard case .credential(let declined) = try row(Self.fill, ["credentialState": "declined"]) else { return XCTFail() }
    XCTAssertEqual(declined.statusLine, "Declined")
    XCTAssertEqual(Chat.cardText(Self.fill), "Acme")
  }

  func testTheConnectCardWaitsThenSaysConnected() throws {
    let message: JSON = ["type": "onepassword-connect", "reason": "To sign in to Acme."]
    guard case .onePasswordConnect(let open) = try row(message) else { return XCTFail() }
    XCTAssertEqual(open.reason, "To sign in to Acme.")
    XCTAssertEqual(open.state, .open)
    guard case .onePasswordConnect(let done) = try row(message, ["connectState": "connected", "connectAccount": "ada@example.com"]) else { return XCTFail() }
    XCTAssertEqual(done.statusLine, "Connected")
    XCTAssertEqual(done.account, "ada@example.com")
  }
}
