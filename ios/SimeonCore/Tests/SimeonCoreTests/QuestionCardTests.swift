import XCTest
@testable import SimeonCore

/**
 * A card that asks several questions (10 November 2026, the founder: "have
 * the thing swipe when there's many questions instead of having the agent
 * send one by one"): read from the engine's `questions`, the first being the
 * card's own; answered together, a line each (the engine's
 * `formatQuestionsReply`), and read back the same.
 */
final class QuestionCardTests: XCTestCase {
  private static let widget: JSON = [
    "prompt": "Which city is she in?", "options": [["label": "Toronto"], ["label": "Montreal"]], "allowCustom": true,
    "questions": [
      ["prompt": "Which city is she in?", "options": [["label": "Toronto"], ["label": "Montreal"]], "allowCustom": true],
      ["prompt": "Budget?", "options": [["label": "Under $75 CAD", "value": "Under $75"], ["label": "$75–$125 CAD"]]],
      ["prompt": "What's the occasion", "options": [["label": "Birthday"], ["label": "Just because"]], "multiSelect": true],
    ],
  ]

  private func card(_ fields: [String: JSON] = [:], widget: JSON = QuestionCardTests.widget) -> QuestionCard? {
    var raw: [String: JSON] = ["kind": "send-message", "id": "q", "message": ["type": "widget", "widget": widget]]
    for (key, value) in fields { raw[key] = value }
    guard let entry = Entry(JSON.object(raw)), case .question(_, let card)? = Chat.rows([entry]).first else { return nil }
    return card
  }

  func testSeveralQuestionsAreRead() throws {
    let card = try XCTUnwrap(card())
    XCTAssertTrue(card.asksSeveral)
    XCTAssertEqual(card.questions.map(\.prompt), ["Which city is she in?", "Budget?", "What's the occasion"])
    XCTAssertTrue(card.questions[0].allowsOwnAnswer)
    XCTAssertTrue(card.questions[2].multiSelect)
    XCTAssertEqual(card.questions[1].options[0].value, "Under $75")
    // The card's own question is the first, as older apps read it.
    XCTAssertEqual(card.prompt, "Which city is she in?")
    XCTAssertTrue(card.isOpen)
  }

  func testTheReplyHasALineEachAndReadsBack() throws {
    let card = try XCTUnwrap(card())
    let reply = try XCTUnwrap(card.reply(["Toronto", nil, "Birthday\nJust because"]))
    XCTAssertEqual(reply, "Which city is she in? Toronto\nBudget? (skipped)\nWhat's the occasion: Birthday, Just because")
    XCTAssertEqual(card.answers(reply), ["Toronto", nil, "Birthday, Just because"])
    // An option's reply reads as its label.
    XCTAssertEqual(card.answers(try XCTUnwrap(card.reply([nil, "Under $75", nil]))), [nil, "Under $75 CAD", nil])
    // Nothing answered is no reply: the card is dismissed instead.
    XCTAssertNil(card.reply([nil, " ", nil]))
    // An older app answers the card's own question only.
    XCTAssertEqual(card.answers("Toronto"), ["Toronto", nil, nil])
    let answered = try XCTUnwrap(self.card(["respondedValue": .string(reply)]))
    XCTAssertFalse(answered.isOpen)
  }

  func testOneQuestionIsTheCardsOwn() throws {
    let one: JSON = ["prompt": "Send it?", "options": [["label": "Yes", "value": "Yes, send it"], ["label": "No"]]]
    let card = try XCTUnwrap(card(widget: one))
    XCTAssertFalse(card.asksSeveral)
    XCTAssertEqual(card.questions.count, 1)
    XCTAssertEqual(card.reply(["Yes, send it"]), "Yes, send it")
    XCTAssertEqual(card.answers("Yes, send it"), ["Yes"])
    XCTAssertEqual(card.shown("Yes, send it"), "Yes")
    // A questions list of one is no list.
    let listed: JSON = ["prompt": "Send it?", "options": [["label": "Yes"]], "questions": [["prompt": "Send it?", "options": [["label": "Yes"]]]]]
    XCTAssertFalse(try XCTUnwrap(self.card(widget: listed)).asksSeveral)
  }
}
