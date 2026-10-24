import XCTest
@testable import SimeonCore

/** The list card (24 October 2026): the agents' ShowList, read as both apps draw it. */
final class ListCardTests: XCTestCase {
  private func row(_ message: JSON) -> ChatRow? {
    Chat.row(for: Entry(["kind": "send-message", "id": "l1", "timestampMs": 1_000, "message": message])!)
  }

  func testTheCardReadsItsRows() throws {
    let message: JSON = [
      "type": "list", "content": "Coût matières par portion…", "title": "Coût matières par portion", "subtitle": "Prix d'oct. 2025 à août 2026",
      "items": [
        ["title": "Thiéboudiène", "amount": "717–805 FCFA", "tag": "à valider", "tone": "pending"],
        ["title": "Mafé", "amount": "966 FCFA"],
        ["title": "Rosemary lamb", "detail": "Lemon, garlic, rosemary.", "value": "2 h", "imageUrl": "https://example.com/lamb.jpg", "url": "https://example.com/lamb"],
        ["title": "Potatoes", "imageUrl": "file:///Users/a/.simeon/attachments/abc.png", "tag": "done", "tone": "loud"],
        ["title": "   "],
        ["title": "Plain", "imageUrl": "http://example.com/x.jpg", "url": "http://example.com/x"],
      ],
    ]
    guard case .list(let id, let card) = try XCTUnwrap(row(message)) else { return XCTFail("not a list card") }
    XCTAssertEqual(id, "l1")
    XCTAssertEqual(card.title, "Coût matières par portion")
    XCTAssertEqual(card.subtitle, "Prix d'oct. 2025 à août 2026")
    XCTAssertEqual(card.rows.map(\.title), ["Thiéboudiène", "Mafé", "Rosemary lamb", "Potatoes", "Plain"], "a row with no name is left out")
    XCTAssertEqual(card.rows[0].value, "717–805 FCFA")
    XCTAssertTrue(card.rows[0].isMoney, "money is blue, its currency too")
    XCTAssertEqual(card.rows[0].tag, ListCard.Tag(text: "à valider", tone: .pending))
    XCTAssertEqual(card.rows[2].value, "2 h")
    XCTAssertFalse(card.rows[2].isMoney, "a time is not money")
    XCTAssertEqual(card.rows[2].detail, "Lemon, garlic, rosemary.")
    XCTAssertEqual(card.rows[2].url?.absoluteString, "https://example.com/lamb")
    XCTAssertEqual(card.rows[3].pictureURL?.scheme, "file", "a picture kept on the computer")
    XCTAssertEqual(card.rows[3].tag?.tone, .neutral, "a tone the app doesn't know is grey")
    XCTAssertNil(card.rows[4].pictureURL, "no picture or page over plain http")
    XCTAssertNil(card.rows[4].url)
    XCTAssertTrue(card.hasPictures)
  }

  func testACardItCannotDrawReadsAsItsWords() throws {
    let rows = (1...12).map { ["title": .string("Item \($0)")] as JSON }
    guard case .list(_, let card) = try XCTUnwrap(row(["type": "list", "title": "Many", "items": .array(rows)])) else { return XCTFail("not a list card") }
    XCTAssertEqual(card.rows.count, ListCard.maxRows)
    guard case .bubble(let bubble) = try XCTUnwrap(row(["type": "list", "content": "Thiéboudiène: 717–805 FCFA", "items": [["title": "Thiéboudiène"]]])) else { return XCTFail("a card with no title reads as its words") }
    XCTAssertEqual(bubble.text, "Thiéboudiène: 717–805 FCFA")
    XCTAssertEqual(Entry(["kind": "send-message", "id": "l2", "message": ["type": "list", "title": "Sunday roast", "content": "Sunday roast\n- Lamb"]])!.preview, "Sunday roast", "the chat list says the card's title")
  }
}
