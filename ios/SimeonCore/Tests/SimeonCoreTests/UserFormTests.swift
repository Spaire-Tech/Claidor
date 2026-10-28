import Foundation
import XCTest
@testable import SimeonCore

/** The in-chat form (28 October 2026): what it reads from the entry, what Fill sends, and how an answered one reads. */
final class UserFormTests: XCTestCase {
  private static let message: JSON = ["type": "user-form", "form": [
    "title": "Sign in to Acme", "instruction": "Acme asks for your email and password.", "reason": "auth", "domain": "acme.example", "submitAfterFill": false,
    "fields": [
      ["id": "email", "label": "Email", "type": "email", "secret": false, "required": true, "target": ["ref": "e12"]],
      ["id": "password", "label": "Password", "type": "password", "secret": true, "required": true, "target": ["label": "Password"]],
      ["id": "remember", "label": "Keep me signed in", "type": "checkbox", "secret": false, "required": false, "target": ["selector": "#remember"]],
      ["id": "country", "label": "Country", "type": "select", "secret": false, "required": false, "options": [["label": "France", "value": "fr"], ["label": "Spain", "value": "es"]], "target": ["selector": "#c"]],
    ],
  ]]

  private func card(_ fields: [String: JSON] = [:]) throws -> UserFormCard {
    var raw: JSON = ["id": "t3s2", "kind": "send-message", "timestampMs": 1, "message": UserFormTests.message]
    for (key, value) in fields { raw = raw.setting(key, value) }
    guard case .request(let id, .form(let card)) = try XCTUnwrap(Chat.row(for: Entry(raw)!)) else { XCTFail("not a form"); throw CancellationError() }
    XCTAssertEqual(id, "t3s2")
    return card
  }

  func testTheFormReadsItsFieldsAndWaits() throws {
    let card = try card()
    XCTAssertEqual(card.title, "Sign in to Acme")
    XCTAssertEqual(card.domain, "acme.example")
    XCTAssertEqual(card.fields.map(\.id), ["email", "password", "remember", "country"])
    XCTAssertEqual(card.fields.map(\.kind), [.email, .password, .checkbox, .select])
    XCTAssertEqual(card.fields.map(\.secret), [false, true, false, false])
    XCTAssertEqual(card.fields[3].options.map(\.value), ["fr", "es"])
    XCTAssertEqual(card.state, .open)
    XCTAssertNil(card.statusLine)
    XCTAssertEqual(Chat.cardText(UserFormTests.message), "Sign in to Acme")
  }

  func testFillWaitsForEveryFieldItNeedsAndSendsOnlyTheFormsOwn() throws {
    let card = try card()
    XCTAssertFalse(card.canFill(["email": "ada@example.com"]))
    XCTAssertFalse(card.canFill(["email": "ada@example.com", "password": "  "]))
    XCTAssertTrue(card.canFill(["email": "ada@example.com", "password": "pw"]), "a checkbox and an optional menu wait on nothing")
    let sent = card.values(["email": "ada@example.com", "password": "pw", "remember": "true", "other": "dropped"])
    XCTAssertEqual(sent, ["email": "ada@example.com", "password": "pw", "remember": "true", "country": ""])
  }

  func testAnAnsweredFormSaysWhatWentIn() throws {
    let filled = try card(["formState": "filled", "formOutcomes": ["email": "filled", "password": "fillFailed", "remember": "notFilled", "country": "notFilled"]])
    XCTAssertEqual(filled.statusLine, "Partly filled")
    XCTAssertEqual(filled.outcomeLine(filled.fields[0]), "Typed in")
    XCTAssertEqual(filled.outcomeLine(filled.fields[1]), "Couldn't type it in")
    XCTAssertEqual(filled.outcomeLine(filled.fields[2]), "Left empty")
    XCTAssertEqual(try card(["formState": "filled", "formOutcomes": ["email": "filled", "password": "filled"]]).statusLine, "Filled")
    XCTAssertEqual(try card(["formState": "filling"]).statusLine, "Filling in…")
    let failed = try card(["formState": "failed", "formNote": "Couldn't type it into the page."])
    XCTAssertEqual(failed.statusLine, "Not filled")
    XCTAssertEqual(failed.note, "Couldn't type it into the page.")
    XCTAssertEqual(try card(["formState": "dismissed"]).statusLine, "Dismissed")
  }
}
