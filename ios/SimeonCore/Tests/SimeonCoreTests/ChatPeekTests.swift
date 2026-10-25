import XCTest
@testable import SimeonCore

/** A long press on a chat in the list: the first paragraph of its newest message (the founder's reference). */
final class ChatPeekTests: XCTestCase {
  private func bubble(_ id: String, _ text: String, mine: Bool = false) -> ChatRow {
    .bubble(Bubble(id: id, text: text, fromPerson: mine, author: nil, showsName: false, showsAvatar: false, reactions: [], isStreaming: false))
  }

  func testTheFirstParagraphOfTheNewestMessage() {
    let rows = [
      bubble("1", "An older message."),
      .stamp(id: "s", date: Date()),
      bubble("2", "Ten connectors are **set up**, though none has been tested:\n\n- Gmail\n- Slack\n\nWant me to test them?"),
    ]
    let peek = Chat.peek(rows)
    XCTAssertEqual(peek?.text, "Ten connectors are set up, though none has been tested:")
    XCTAssertEqual(peek?.fromPerson, false)
  }

  func testTheNewestMessageMayBeThePersons() {
    let peek = Chat.peek([bubble("1", "Hi"), bubble("2", "Can you check the ledger?", mine: true)])
    XCTAssertEqual(peek?.text, "Can you check the ledger?")
    XCTAssertEqual(peek?.fromPerson, true)
  }

  func testEmptyLinesAndMessagesAreSkipped() {
    XCTAssertEqual(Chat.firstParagraph("\n  \nFirst line\nsecond line\n\nNext"), "First line second line")
    XCTAssertEqual(Chat.peek([bubble("1", "Kept"), bubble("2", "  \n ")])?.text, "Kept")
    XCTAssertNil(Chat.peek([.stamp(id: "s", date: Date())]))
  }
}
