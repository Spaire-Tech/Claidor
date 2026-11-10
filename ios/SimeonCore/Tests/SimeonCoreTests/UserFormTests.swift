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

  func testASignInOffersToKeepTheLogin() throws {
    let card = try card()
    XCTAssertEqual(card.login?.username.id, "email")
    XCTAssertEqual(card.login?.password.id, "password")
    func form(_ fields: [JSON]) -> UserFormCard? {
      let raw: JSON = ["id": "f", "kind": "send-message", "timestampMs": 1, "message": ["type": "user-form", "form": ["title": "Sign in", "domain": "acme.com", "fields": .array(fields)]]]
      guard case .request(_, .form(let card))? = Chat.row(for: Entry(raw)!) else { return nil }
      return card
    }
    let named = try XCTUnwrap(form([["id": "user", "label": "Username", "type": "text"], ["id": "pass", "label": "Password", "type": "password"]]))
    XCTAssertEqual(named.login?.username.id, "user")
    // A code alone, a password with nothing before it, or a new password twice is no sign-in.
    XCTAssertNil(try XCTUnwrap(form([["id": "code", "label": "Code", "type": "otp"]])).login)
    XCTAssertNil(try XCTUnwrap(form([["id": "password", "label": "Password", "type": "password"]])).login)
    XCTAssertNil(try XCTUnwrap(form([["id": "email", "label": "Email", "type": "email"], ["id": "new", "label": "New", "type": "password"], ["id": "again", "label": "Again", "type": "password"]])).login)
  }

  /** The secret card shows the variable it's kept under over its field (the founder's reference, 10 November 2026); a connector's field has none. */
  func testASecretShowsTheVariableItIsKeptUnder() throws {
    func variable(_ target: JSON) -> String?? {
      let raw: JSON = ["id": "s", "kind": "send-message", "timestampMs": 1, "message": ["type": "secret-request", "secretRequest": ["label": "AWS access key ID", "target": target]]]
      guard case .request(_, .secret(_, _, let variable, _, _))? = Chat.row(for: Entry(raw)!) else { return .none }
      return .some(variable)
    }
    XCTAssertEqual(variable(["kind": "box-secret", "name": "AWS_ACCESS_KEY_ID"]), .some("AWS_ACCESS_KEY_ID"))
    XCTAssertEqual(variable(["kind": "channel-credential", "platform": "slack", "field": "bot_token"]), .some(nil))
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
